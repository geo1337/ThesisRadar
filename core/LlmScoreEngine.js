/**
 * LlmScoreEngine.js
 * Rescoring von bereits Keyword-vorgefilterten Jobs gegen den hochgeladenen
 * Lebenslauf, via lokales Ollama-Modell (z.B. qwen3.5:9b).
 *
 * Läuft NIE als Relevanz-Filter — ScoreEngine.js entscheidet weiterhin,
 * welche Jobs überhaupt tech-relevant sind (schnell, kostenlos). Dieses
 * Modul verfeinert nur den Score der bereits gefilterten Kandidaten anhand
 * des Lebenslaufs. Bei jedem Fehler (Ollama down, Timeout, kaputtes JSON)
 * wird der Aufrufer auf den Keyword-Score zurückfallen — siehe Rückgabewert
 * `null` in diesem Fall.
 */

const OLLAMA_URL     = process.env.OLLAMA_URL     || 'http://localhost:11434';
const OLLAMA_MODEL    = process.env.OLLAMA_MODEL   || 'qwen3.5:9b';
const TIMEOUT_MS      = parseInt(process.env.OLLAMA_TIMEOUT_MS || '20000', 10);
const DEBUG           = process.env.LLM_DEBUG === '1'; // rohe Modell-Antwort zu jeder Stelle mitloggen

const SYSTEM_PROMPT = `Du bist ein SEHR STRENGER Karriereberater, der Abschlussarbeits-Ausschreibungen
(Bachelorarbeit, Masterarbeit, Thesis) gegen den Lebenslauf eines Kandidaten bewertet. Der Kandidat sucht
ein konkretes THEMA für seine Abschlussarbeit — es geht NICHT um eine reguläre Anstellung, sondern darum,
ob das ausgeschriebene Thema fachlich zu seinem Studium/seinen Kenntnissen passt.

WICHTIGE EINSCHRÄNKUNG: Für manche Stellen bekommst du zusätzlich zu Titel/Kategorie/Firma/Level auch eine
"THEMENBESCHREIBUNG" mit dem tatsächlichen Ausschreibungstext — nutze diese IMMER als Hauptgrundlage, wenn
vorhanden, sie ist zuverlässiger als der Titel allein. Für viele Stellen ist sie aber NICHT vorhanden — dann
siehst du nur Titel/Kategorie/Firma/Level. Ein genereller Titel wie "Masterarbeit im Bereich Software
Engineering" OHNE Themenbeschreibung sagt NICHTS über das tatsächliche Thema aus. Sei in diesem Fall
standardmäßig skeptisch und vergib hohe Scores nur, wenn der Titel/die Kategorie eine KONKRETE, NAMENTLICHE
Technologie oder Domäne nennt, die auch wortwörtlich oder sehr eng verwandt im Abschnitt "KENNTNISSE" bzw.
"BILDUNGSWEG" des Lebenslaufs steht.

Ein Kandidat mit breitem generalistischem Profil (z.B. Testing + Backend + Frontend) matcht NICHT automatisch
mit jedem Abschlussarbeitsthema — die meisten Ausschreibungen sollten NICHT über Score 5 liegen, sofern der
Titel nicht sehr spezifisch zur Kernkompetenz des Kandidaten passt. Score 7-10 ist die Ausnahme, nicht der
Normalfall.

ERFINDE NIEMALS Skills oder Technologien, die nicht wörtlich in Titel/Kategorie/Themenbeschreibung stehen.
Wenn keine konkrete Technologie genannt wird (weder im Titel noch — falls vorhanden — in der
Themenbeschreibung), dürfen die "categories" im Output auch nur allgemeine Begriffe sein (z.B. "unklar") —
NICHT spezifische Skills aus dem Lebenslauf, nur weil der Kandidat sie kann.

SAMMEL-/DACHAUSSCHREIBUNGEN erkennen: Titel wie "Praktikum, Werkstudent & Abschlussarbeiten (alle Bereiche)",
"Internships & Thesis Opportunities (all genders)" oder "Studentische Positionen" bewerben NICHT ein
konkretes Thema, sondern sammeln Bewerbungen für die GESAMTE Firma über alle Abteilungen. Hier gibt es keine
inhaltliche Information zum tatsächlichen Thema — IMMER Score 0-2, unabhängig davon wie technisch die Branche
der Firma (Luftfahrt, Automotive, etc.) klingt. Die Branche allein ist KEIN Signal für fachliche Passung.

Beispiele zur Kalibrierung (Lebenslauf-Kenntnisse: "Testing: Selenium, Playwright. Backend: C#, Node.js. Frontend: Vue.js, React"):
- "Masterarbeit: Testautomatisierung mit Selenium/Playwright" → Score 9 (exakte Technologie-Übereinstimmung)
- "Bachelorarbeit: Weiterentwicklung einer Vue.js-Anwendung" → Score 8 (exakte Technologie-Übereinstimmung)
- "Masterarbeit im Bereich IT-Support-Prozesse" → Score 2 (generischer IT-Titel, keine konkrete Skill-Nennung)
- "Abschlussarbeit im Bereich Vertrieb / Sales Analytics" → Score 0 (keine fachliche Überschneidung)
- "Masterarbeit: Embedded Systems Entwicklung (AUTOSAR)" → Score 1 (fachfremde Domäne, kein Overlap in Kenntnissen)
- "Masterarbeit: Machine Learning / Data Science" → Score 3 (verwandtes IT-Feld, aber kein konkreter Skill-Match)
- "Internships, Working Student Roles & Thesis Opportunities (all genders)" → Score 1 (Sammelausschreibung ohne
  jedes Thema — auch wenn die Firma technisch klingt, gibt es nichts Konkretes zu matchen)

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt in diesem Format, ohne weiteren Text:
{"score": <ganze Zahl 0-10>, "categories": [<1-3 kurze Schlagworte, z.B. "ki", "embedded", "backend">], "reasoning": "<max. 15 Wörter, nenne die konkrete Übereinstimmung oder deren Fehlen>"}

Score-Skala:
0-1  = keine fachliche Überschneidung
2-3  = generischer IT-Bezug, aber keine konkrete Skill-Nennung im Titel
4-6  = verwandtes Feld ODER eine konkrete Skill-Übereinstimmung
7-10 = mehrere konkrete, namentliche Skill-Übereinstimmungen — Thema passt sehr gut zum Kandidaten`;

function buildUserPrompt(job, resumeText) {
    const meta = [job.title, job.category, job.org, job.level].filter(Boolean).join(' · ');
    const desc = job.description ? `\n\nTHEMENBESCHREIBUNG:\n${job.description}` : '';
    return `LEBENSLAUF:\n${resumeText}\n\nSTELLENAUSSCHREIBUNG:\n${meta}${desc}`;
}

async function callOllama(messages) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
        const res = await fetch(`${OLLAMA_URL}/api/chat`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            signal:  controller.signal,
            body: JSON.stringify({
                model:    OLLAMA_MODEL,
                messages,
                format:   'json',
                stream:   false,
                think:    false, // Qwen3.5 & andere Hybrid-Reasoning-Modelle: Denkschritte kosten sonst 10-60s pro Job
                options:  { temperature: 0.1, num_ctx: 4096 }
            })
        });

        if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
        const data = await res.json();
        return data?.message?.content || null;
    } finally {
        clearTimeout(timer);
    }
}

function parseResult(raw) {
    if (!raw) return null;
    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }

    const score = Number(parsed.score);
    if (!Number.isFinite(score) || score < 0 || score > 10) return null;

    const categories = Array.isArray(parsed.categories)
        ? parsed.categories.filter(c => typeof c === 'string').slice(0, 3)
        : [];

    return {
        relevant:   score >= 2,
        categories,
        score:      Math.round(score),
        confidence: Math.min(100, Math.round(score * 10)),
        reasoning:  typeof parsed.reasoning === 'string' ? parsed.reasoning.slice(0, 200) : ''
    };
}

/**
 * @returns {Promise<object|null>} Score-Objekt im ScoreEngine-Format (+reasoning), oder null bei Fehler
 */
async function llmScoreJob(job, resumeText) {
    if (!resumeText) return null;

    try {
        const raw = await callOllama([
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user',   content: buildUserPrompt(job, resumeText) }
        ]);

        if (DEBUG) console.log(`  📝 Rohantwort für "${job.title}":\n${raw}`);

        const result = parseResult(raw);
        if (!result) console.warn(`  ⚠ LLM-Antwort für "${job.title}" konnte nicht geparst werden: ${raw}`);
        return result;
    } catch (err) {
        console.warn(`  ⚠ LLM-Scoring fehlgeschlagen (${job.title}): ${err.message}`);
        return null;
    }
}

module.exports = { llmScoreJob };
