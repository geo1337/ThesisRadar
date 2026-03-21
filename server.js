require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const path    = require('path');

const BoschCrawler         = require('./crawlers/BoschCrawler');
const MercedesCrawler      = require('./crawlers/MercedesCrawler');
const PorscheCrawler       = require('./crawlers/PorscheCrawler');
const TrumpfCrawler        = require('./crawlers/TrumpfCrawler');
const FraunhoferCrawler    = require('./crawlers/FraunhoferCrawler');
const Porsche_main_Crawler = require('./crawlers/Porsche_main_Crawler');
const SAPCrawler           = require('./crawlers/SAPCrawler');

const AdessoCrawler        = require('./crawlers/AdessoCrawler');
const BechtleCrawler       = require('./crawlers/BechtleCrawler');
const FestoCrawler         = require('./crawlers/FestoCrawler');
const ExxetaCrawler        = require('./crawlers/ExxetaCrawler');
const VectorCrawler        = require('./crawlers/VectorCrawler');
const AudiCrawler          = require('./crawlers/AudiCrawler');
const StudySmarterCrawler  = require('./crawlers/StudySmarterCrawler');
const ArbeitsagenturCrawler = require('./crawlers/ArbeitsagenturCrawler');

const DaimlerTruckCrawler  = require('./crawlers/DaimlerTruckCrawler');
const SiemensCrawler       = require('./crawlers/SiemensCrawler');
const { connect, insertJobs, loadHistory } = require('./core/DbExporter');
const { geocodeAllCities, getAllCoords }   = require('./core/GeoCache');
const sql = require('mssql/msnodesqlv8');
const { sendJobAlert } = require('./core/Mailer');
const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

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
];

// ══════════════════════════════════════════════════════════════════════════
// GET /api/stream
// ══════════════════════════════════════════════════════════════════════════
app.get('/api/stream', async (req, res) => {

    res.setHeader('Content-Type',  'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection',    'keep-alive');
    res.flushHeaders();

    const send = (type, data) => {
        res.write(`event: ${type}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const allNew  = [];
    let totalJobs = 0;

    try {
        const history = await loadHistory();
        for (const crawler of CRAWLERS) {

            send('status', { company: crawler.getName(), state: 'loading' });

            let jobs = [];
            try {
                jobs = await crawler.fetchAll();
            } catch (err) {
                console.error(`  ❌ ${crawler.getName()} Fehler:`, err.message);
                send('status', { company: crawler.getName(), state: 'error', message: err.message });
                continue;
            }

            totalJobs += jobs.length;

            const relevant = jobs.filter(j => j.score.relevant);
            const newJobs  = relevant
                .filter(j => !history.some(h => h.title === j.title && h.url === j.url))
                .sort((a, b) => b.score.score - a.score.score);

            console.log(`  📊 ${crawler.getName()}: ${jobs.length} total → ${relevant.length} relevant → ${newJobs.length} neu`);

            for (const job of newJobs) {
                await new Promise(r => setTimeout(r, 800));
                send('job', {
                    ...job,
                    score:      job.score.score,
                    tags:       job.score.categories,
                    confidence: job.score.confidence,
                    source:     job.source || null,
                    isNew:      true
                });
                allNew.push(job);
            }

            send('status', {
                company:  crawler.getName(),
                state:    'done',
                total:    jobs.length,
                relevant: relevant.length,
                newCount: newJobs.length
            });
        }

        if (allNew.length > 0) await insertJobs(allNew);
await sendJobAlert(allNew);
        const allJobs = [...history, ...allNew];
        await geocodeAllCities(allJobs);
        send('geocache', getAllCoords());

        console.log('\n╔══════════════════════════════════════╗');
        console.log(`║  📊 Crawl abgeschlossen               ║`);
        console.log(`║  Gesamt gefunden:  ${String(totalJobs).padEnd(16)}║`);
        console.log(`║  Relevant:         ${String(allNew.length).padEnd(16)}║`);
        console.log('╚══════════════════════════════════════╝\n');

        send('done', {
            total:     totalJobs,
            newJobs:   allNew.length,
            timestamp: new Date().toISOString()
        });

    } catch (err) {
        console.error('Stream error:', err);
        send('error', { message: err.message });
    }

    res.end();
});

// ══════════════════════════════════════════════════════════════════════════
// GET /api/history
// ══════════════════════════════════════════════════════════════════════════
app.get('/api/history', async (req, res) => {
    try {
        const jobs = await loadHistory();
        res.json({ success: true, count: jobs.length, jobs });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ══════════════════════════════════════════════════════════════════════════
// GET /api/companies
// ══════════════════════════════════════════════════════════════════════════
app.get('/api/companies', (req, res) => {
    res.json(CRAWLERS.map(c => ({ name: c.getName(), type: c.getType() })));
});

// ══════════════════════════════════════════════════════════════════════════
// GET /api/geocache
// ══════════════════════════════════════════════════════════════════════════
app.get('/api/geocache', (req, res) => {
    res.json(getAllCoords());
});

// ══════════════════════════════════════════════════════════════════════════
// PATCH /api/jobs/:id — seen, favorite, applied updaten
// ══════════════════════════════════════════════════════════════════════════
app.patch('/api/jobs/:id', async (req, res) => {
    try {
        const { seen, favorite, applied } = req.body;
        const db      = await connect();
        const request = db.request();

        request.input('id', sql.Int, parseInt(req.params.id));

        const fields = [];
        if (seen     !== undefined) {
            request.input('seen', sql.Bit, seen ? 1 : 0);
            fields.push('seen = @seen');
        }
        if (favorite !== undefined) {
            request.input('favorite', sql.Bit, favorite ? 1 : 0);
            fields.push('favorite = @favorite');
        }
        if (applied  !== undefined) {
            request.input('applied', sql.Bit, applied ? 1 : 0);
            fields.push('applied = @applied');
            request.input('applied_at', sql.DateTime, applied ? new Date() : null);
            fields.push('applied_at = @applied_at');
        }

        if (fields.length > 0) {
            await request.query(`UPDATE jobs SET ${fields.join(', ')} WHERE id = @id`);
        }

        res.json({ success: true });
    } catch (err) {
        console.error('PATCH /api/jobs error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ══════════════════════════════════════════════════════════════════════════
// START
// ══════════════════════════════════════════════════════════════════════════
async function start() {
    try {
        await connect();
        console.log('✅ Datenbankverbindung hergestellt');
    } catch (err) {
        console.error('❌ DB Verbindung fehlgeschlagen:', err.message);
        console.error('   Stelle sicher dass SQL Server läuft und ThesisRadar DB existiert');
    }

    app.listen(PORT, () => {
        console.log('╔══════════════════════════════════════╗');
        console.log('║     THESIS RADAR · Server läuft      ║');
        console.log(`║     http://localhost:${PORT}            ║`);
        console.log('╚══════════════════════════════════════╝');
        console.log(`📁 ${__dirname}`);
        console.log(`🔌 ${CRAWLERS.length} Crawler aktiv\n`);
    });
}

start();
