const sql = require('mssql/msnodesqlv8');

require('dotenv').config();

const config = {
    driver: 'msnodesqlv8',
    connectionString: `Driver={${process.env.DB_DRIVER}};Server=${process.env.DB_SERVER};Database=${process.env.DB_NAME};Trusted_Connection=yes;`
};
let pool = null;

// ── Verbindung herstellen ────────────────────────────────────────────────────

async function connect() {
  if (!pool) {
    pool = await sql.connect(config);
    console.log('🗄️  SQL Server verbunden');
  }
  return pool;
}

// ── Jobs einfügen (nur neue, Duplikate per URL ignorieren) ───────────────────

async function insertJobs(jobs) {
  const db = await connect();

  let inserted = 0;
  for (const job of jobs) {
    try {
      await db
        .request()
        .input('title', sql.NVarChar(500), job.title || '')
        .input('company', sql.NVarChar(200), job.company || '')
        .input('source', sql.NVarChar(100), job.source || null)
        .input('city', sql.NVarChar(200), job.city || '')
        .input('url', sql.NVarChar(500), job.url || '')
        .input('date', sql.NVarChar(50), job.date || '')
        .input('score', sql.Int, job.score?.score ?? job.score ?? 0)
        .input('tags', sql.NVarChar(sql.MAX), JSON.stringify(job.score?.categories || job.tags || []))
        .input('logo', sql.NVarChar(500), job.logo || null)
        .input('org', sql.NVarChar(200), job.org || '')
        .input('level', sql.NVarChar(100), job.level || '')
        .input('category', sql.NVarChar(200), job.category || '')
        .input('startDate', sql.NVarChar(50), job.startDate || '').query(`
                    IF NOT EXISTS (SELECT 1 FROM jobs WHERE url = @url)
                    INSERT INTO jobs (title, company, source, city, url, date, score, tags, logo, org, level, category, startDate)
                    VALUES (@title, @company, @source, @city, @url, @date, @score, @tags, @logo, @org, @level, @category, @startDate)
                `);
      inserted++;
    } catch (err) {
      console.log(`  ⚠ DB Insert fehlgeschlagen: ${job.title} — ${err.message}`);
    }
  }

  console.log(`  🗄️  ${inserted}/${jobs.length} Jobs in DB gespeichert`);
}

// ── History laden ────────────────────────────────────────────────────────────

async function loadHistory() {
  try {
    const db = await connect();
    const result = await db.request().query(`
            SELECT
                id, title, company, source, city, url, date, score,
                tags, logo, org, level, category, startDate,
                seen, favorite, applied, applied_at, created_at
            FROM jobs
            ORDER BY created_at DESC
        `);

    return result.recordset.map((row) => ({
      ...row,
      tags: tryParseJSON(row.tags, []),
      seen: !!row.seen,
      favorite: !!row.favorite,
      applied: !!row.applied,
      isNew: false,
    }));
  } catch (err) {
    console.error('  ❌ loadHistory fehlgeschlagen:', err.message);
    return [];
  }
}

// ── Job-Status updaten (seen, favorite, applied) ─────────────────────────────

async function updateJobStatus(id, fields) {
  const db = await connect();
  const request = db.request().input('id', sql.Int, id);
  const parts = [];

  if (fields.seen !== undefined) {
    request.input('seen', sql.Bit, fields.seen ? 1 : 0);
    parts.push('seen = @seen');
  }
  if (fields.favorite !== undefined) {
    request.input('favorite', sql.Bit, fields.favorite ? 1 : 0);
    parts.push('favorite = @favorite');
  }
  if (fields.applied !== undefined) {
    request.input('applied', sql.Bit, fields.applied ? 1 : 0);
    parts.push('applied = @applied');
  }

  if (parts.length > 0) {
    await request.query(`UPDATE jobs SET ${parts.join(', ')} WHERE id = @id`);
  }
}

// ── Helper ───────────────────────────────────────────────────────────────────

function tryParseJSON(str, fallback) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

module.exports = {connect, insertJobs, loadHistory, updateJobStatus};
