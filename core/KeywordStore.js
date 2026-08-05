/**
 * KeywordStore.js
 * Persistiert die Stage-1-Scoring-Konfiguration für core/ScoreEngine.js:
 *   - keywords:       eigene Liste, ersetzt die fixen 7 Kategorien (nur ALLOWED_KEYWORDS erlaubt)
 *   - filterDisabled: wenn true, gilt JEDER Job als relevant — kein Stage-1-Filter mehr,
 *                      die Bewertung liegt dann komplett bei Stage 2 (LLM) bzw. entfällt ohne Lebenslauf
 */

const fs   = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, '..', 'data', 'keywords.json');

const ALLOWED_KEYWORDS = [
    'testing', 'qa', 'selenium', 'playwright', 'ci/cd',
    'ki', 'ai', 'machine learning', 'deep learning', 'nlp', 'llm', 'pytorch', 'tensorflow',
    'iot', 'embedded', 'fpga', 'mikrocontroller', 'plc', 'firmware',
    'security', 'cybersecurity', 'pentest', 'iam',
    'backend', 'cloud', 'devops', 'kubernetes', 'docker', 'java', 'python', 'rust', 'go',
    'typescript', 'javascript', 'sql', 'nosql', 'aws', 'azure', 'linux', 'git', 'api',
    'frontend', 'react', 'vue', 'angular', 'html', 'css', 'figma',
    'autosar', 'matlab', 'simulink', 'lidar',
    'data engineering', 'spark'
];

const DEFAULT_CONFIG = { keywords: [], filterDisabled: false };

let cache = { config: null, mtimeMs: -1 };

function getAllowedKeywords() {
    return ALLOWED_KEYWORDS.slice();
}

function loadConfig() {
    if (!fs.existsSync(CONFIG_FILE)) {
        cache = { config: { ...DEFAULT_CONFIG }, mtimeMs: -1 };
        return cache.config;
    }

    const mtimeMs = fs.statSync(CONFIG_FILE).mtimeMs;
    if (mtimeMs === cache.mtimeMs) return cache.config;

    try {
        const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
        // Abwärtskompatibel zum alten Format (nacktes Array ohne filterDisabled)
        const config = Array.isArray(parsed)
            ? { keywords: parsed, filterDisabled: false }
            : { keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [], filterDisabled: !!parsed.filterDisabled };
        cache = { config, mtimeMs };
    } catch {
        cache = { config: { ...DEFAULT_CONFIG }, mtimeMs };
    }
    return cache.config;
}

function saveConfig(config) {
    fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config), 'utf-8');
    cache = { config, mtimeMs: fs.statSync(CONFIG_FILE).mtimeMs };
}

function loadCustomKeywords() {
    return loadConfig().keywords;
}

function isFilterDisabled() {
    return loadConfig().filterDisabled;
}

/**
 * @param {string[]} rawKeywords
 * @returns {{ saved: string[], rejected: string[] }}
 */
function saveCustomKeywords(rawKeywords) {
    const normalized = (rawKeywords || [])
        .map(k => String(k).trim().toLowerCase())
        .filter(Boolean);

    const unique   = [...new Set(normalized)];
    const saved    = unique.filter(k => ALLOWED_KEYWORDS.includes(k));
    const rejected = unique.filter(k => !ALLOWED_KEYWORDS.includes(k));

    saveConfig({ keywords: saved, filterDisabled: loadConfig().filterDisabled });

    return { saved, rejected };
}

function setFilterDisabled(disabled) {
    saveConfig({ keywords: loadConfig().keywords, filterDisabled: !!disabled });
}

function clearCustomKeywords() {
    saveConfig({ keywords: [], filterDisabled: loadConfig().filterDisabled });
}

module.exports = {
    getAllowedKeywords, loadCustomKeywords, saveCustomKeywords, clearCustomKeywords,
    isFilterDisabled, setFilterDisabled
};
