const fs   = require('fs');
const path = require('path');

const CSV_FILE = path.join(__dirname, '..', 'thesis-jobs.csv');
const HEADER   = 'Datum,Start,Firma,Titel,City,Org,Level,Category,TechCategories,Score,Confidence,URL\n';

function csvEscape(val) {
    const s    = String(val ?? '').replace(/"/g, '""');
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return `"${safe}"`;
}

function initCSV() {
    if (!fs.existsSync(CSV_FILE)) {
        fs.writeFileSync(CSV_FILE, '\uFEFF' + HEADER, 'utf8');
    }
}

function appendCSV(jobs) {
    const lines = jobs.map(j => [
        j.date, j.startDate, j.company, j.title,
        j.city, j.org, j.level, j.category,
        j.score.categories.join(';'), j.score.score,
        j.score.confidence.toFixed(0), j.url
    ].map(csvEscape).join(',')).join('\n') + '\n';

    fs.appendFileSync(CSV_FILE, lines, 'utf8');
}

function loadHistory() {
    try {
        return fs.readFileSync(CSV_FILE, 'utf8')
            .split('\n').slice(1)
            .map(line => {
                const parts = line.split('","');
                return {
                    title: parts[3]?.replace(/^"|"$/g, ''),
                    url:   parts[11]?.replace(/^"|"$/g, '')
                };
            })
            .filter(h => h.title && h.url);
    } catch {
        return [];
    }
}

module.exports = { initCSV, appendCSV, loadHistory, CSV_FILE };
