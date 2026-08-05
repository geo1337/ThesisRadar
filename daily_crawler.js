/**
 * daily_crawler.js
 * Nur noch Orchestrierung — alle HTTP-Logik liegt in den Crawlern
 * Start: node daily_crawler.js
 */

require('dotenv').config();

const {exec} = require('child_process');
const {initCSV, appendCSV, loadHistory, CSV_FILE} = require('./core/CsvExporter');
const ResumeStore = require('./core/ResumeStore');
const {llmScoreJob} = require('./core/LlmScoreEngine');
const {isRecentJob} = require('./core/DateFilter');

const BoschCrawler = require('./crawlers/BoschCrawler');
const MercedesCrawler = require('./crawlers/MercedesCrawler');
const PorscheCrawler = require('./crawlers/PorscheCrawler');
const TrumpfCrawler = require('./crawlers/TrumpfCrawler');
const FraunhoferCrawler = require('./crawlers/FraunhoferCrawler');
const Porsche_main_Crawler = require('./crawlers/Porsche_main_Crawler');
const SAPCrawler = require('./crawlers/SAPCrawler');

const AdessoCrawler = require('./crawlers/AdessoCrawler');
const BechtleCrawler = require('./crawlers/BechtleCrawler');
const FestoCrawler = require('./crawlers/FestoCrawler');
const ExxetaCrawler = require('./crawlers/ExxetaCrawler');
const VectorCrawler = require('./crawlers/VectorCrawler');
const AudiCrawler = require('./crawlers/AudiCrawler');
const StudySmarterCrawler = require('./crawlers/StudySmarterCrawler');
const ArbeitsagenturCrawler = require('./crawlers/ArbeitsagenturCrawler');

const DaimlerTruckCrawler = require('./crawlers/DaimlerTruckCrawler');
const SiemensCrawler = require('./crawlers/SiemensCrawler');
const StihlCrawler = require('./crawlers/StihlCrawler');

const CRAWLERS = [
  new BoschCrawler(),
  new MercedesCrawler(),
  new PorscheCrawler(),
  new TrumpfCrawler(),
  new FraunhoferCrawler(),
  new Porsche_main_Crawler(),
  new SAPCrawler(),

  new AdessoCrawler(),
  new BechtleCrawler(),
  new FestoCrawler(),
  new ExxetaCrawler(),
  new VectorCrawler(),
  new AudiCrawler(),
  new StudySmarterCrawler(),
  new ArbeitsagenturCrawler(),

  new DaimlerTruckCrawler(),
  new SiemensCrawler(),
  new StihlCrawler(),
];

// ── Terminal-Ausgabe ───────────────────────────────────────────────────────

const PRINT_DELAY = 250;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const print = async (line = '') => {
  await sleep(PRINT_DELAY);
  console.log(line);
};

function scoreBadge(score) {
  if (score >= 4) return `\x1b[42m\x1b[30m Score ${score} \x1b[0m`;
  if (score >= 2) return `\x1b[43m\x1b[30m Score ${score} \x1b[0m`;
  return `\x1b[41m\x1b[37m Score ${score} \x1b[0m`;
}

async function printResults(label, newJobs, total, relevant) {
  await print(`\n${'═'.repeat(65)}`);
  await print(`🏢 ${label}`);
  await print(`   ${total} geladen · ${relevant} tech-relevant · ${newJobs.length} neu`);

  if (newJobs.length === 0) {
    await print('   ✅ Keine neuen Einträge');
    return;
  }

  for (let i = 0; i < Math.min(newJobs.length, 8); i++) {
    const job = newJobs[i];
    await print(`\n   ${i + 1}. ${job.title}`);
    await print(`      ${job.score.categories.join(', ')} ${scoreBadge(job.score.score)}`);
    await print(`      ${job.city} · ${job.org}${job.startDate ? ' · Start: ' + job.startDate : ''}`);
    await print(`      ${job.url}`);
  }

  if (newJobs.length > 8) await print(`\n   … und ${newJobs.length - 8} weitere in thesis-jobs.csv`);
}

async function main() {
  await print('╔══════════════════════════════════════════════════════════════╗');
  await print('║         THESIS CRAWLER · STARTED                            ║');
  await print('╚══════════════════════════════════════════════════════════════╝');
  await print(`⏱  ${new Date().toLocaleString('de-DE')}\n`);

  initCSV();
  const history = loadHistory();
  const allNew = [];
  const summary = [];

  const resumeText = ResumeStore.loadResumeText();
  if (resumeText) console.log(`🧠 LLM-Rescoring aktiv (${resumeText.length} Zeichen Lebenslauf, Modell: ${process.env.OLLAMA_MODEL || 'qwen3.5:9b'})\n`);

  for (const crawler of CRAWLERS) {
    process.stdout.write(`\n🔍 Lade ${crawler.getName()} … `);
    let jobs = await crawler.fetchAll();
    console.log(`${jobs.length} Treffer`);

    jobs = jobs.filter((j) => isRecentJob(j.date));

    const relevant = jobs.filter((j) => j.score.relevant);
    const newJobs = relevant.filter((j) => !history.some((h) => h.title === j.title && h.url === j.url));

    if (resumeText) {
      for (const job of newJobs) {
        const llmScore = await llmScoreJob(job, resumeText);
        if (llmScore) {
          job.score = llmScore;
          console.log(`  🧠 "${job.title}" → Score ${llmScore.score} [${llmScore.categories.join(', ')}] — ${llmScore.reasoning}`);
        } else {
          console.warn(`  ⚠ Fallback auf Keyword-Score für "${job.title}"`);
        }
      }
    }
    newJobs.sort((a, b) => b.score.score - a.score.score);

    await printResults(crawler.getName().toUpperCase(), newJobs, jobs.length, relevant.length);
    allNew.push(...newJobs);
    summary.push({name: crawler.getName(), count: newJobs.length});
  }

  if (allNew.length > 0) {
    appendCSV(allNew);
    await print(`\n\n💾 ${allNew.length} neue Stellen → thesis-jobs.csv`);
  } else {
    await print('\n\n✅ Keine neuen Tech-Abschlussarbeiten seit letztem Run');
  }

  await print(`${'─'.repeat(65)}`);
  await print(`📈 Gesamt neu: ${allNew.length} (${summary.map((s) => `${s.name}: ${s.count}`).join(' · ')})`);
}

main()
  .then(() => {
    exec(`start "" "${CSV_FILE}"`, (err) => {
      if (err) console.log('  ⚠ Excel öffnen fehlgeschlagen:', err.message);
    });
  })
  .catch(console.error);
