const KeywordStore = require('./KeywordStore');

const KEYWORDS = {
    ki:           ['ki', 'ai', 'machine learning', 'deep learning', 'data science', 'ml', 'neural', 'llm', 'nlp',
                   'computer vision', 'reinforcement learning', 'generative', 'transformer', 'pytorch', 'tensorflow',
                   'künstliche intelligenz', 'algorithmus', 'predictive', 'anomalie'],

    iot:          ['iot', 'industrie 4.0', 'iiot', 'smart', 'sensor', 'edge', 'embedded',
                   'fpga', 'rtos', 'mikrocontroller', 'raspberry', 'arduino', 'plc', 'scada',
                   'echtzeit', 'real-time', 'firmware', 'treiber'],

    cybersecurity:['cyber', 'sicherheit', 'security', 'pentest', 'datenschutz', 'it-security',
                   'vulnerability', 'soc', 'siem', 'firewall', 'exploit', 'red team', 'blue team',
                   'kryptographie', 'zero trust', 'iam', 'pki'],

    software:     ['software', 'backend', 'cloud', 'microservice', 'api', 'devops', 'kubernetes', 'docker',
                   'java', 'python', 'rust', 'go', 'typescript', 'rest', 'graphql',
                   'datenbank', 'sql', 'nosql', 'git', 'agile', 'scrum',
                   'aws', 'azure', 'gcp', 'serverless', 'linux', 'c#'],

    frontend:     ['frontend', 'react', 'vue', 'angular', 'web', 'javascript', 'ui', 'ux',
                   'html', 'css', 'responsive', 'pwa', 'mobile', 'android', 'ios', 'flutter',
                   'figma', 'design system', 'accessibility'],

    automotive:   ['adas', 'autosar', 'can bus', 'obd', 'fahrzeug', 'antrieb', 'batterie', 'elektro', 'charging',
                   'autonomous', 'lidar', 'radar', 'v2x', 'obd', 'ecu', 'hil', 'sil', 'mil',
                   'matlab', 'simulink', 'carmaker', 'dspace', 'iso 26262', 'funktionale sicherheit',
                   'bms', 'powertrain', 'e-mobility'],

    data:         ['data engineering', 'data pipeline', 'etl', 'warehouse', 'lakehouse', 'bi',
                   'tableau', 'power bi', 'spark', 'kafka', 'hadoop', 'dbt',
                   'analytics', 'visualization', 'dashboard', 'reporting']
};

const SCORE_MAP = {
    ki:            3,
    iot:           2,
    cybersecurity: 2,
    software:      2,
    frontend:      1,
    automotive:    1,
    data:          2
};

// Regex einmal eingefroren — kein g-Flag, kein lastIndex-Problem
const COMPILED = Object.fromEntries(
    Object.entries(KEYWORDS).map(([cat, words]) => [cat, new RegExp(words.join('|'), 'i')])
);

function scoreJob(title, extra = '') {
    const text = `${title} ${extra}`.toLowerCase();

    // Stage-1-Filter komplett deaktiviert → jeder Job gilt als relevant,
    // Bewertung liegt bei Stage 2 (LLM) bzw. entfällt ohne Lebenslauf
    if (KeywordStore.isFilterDisabled()) {
        return { relevant: true, categories: [], score: 0, confidence: 0 };
    }

    // Eigene Keywords gesetzt → ersetzen das 7-Kategorien-System komplett
    const custom = KeywordStore.loadCustomKeywords();
    if (custom.length > 0) {
        const matched = custom.filter(k => text.includes(k));
        const score   = Math.min(10, matched.length * 2);

        return {
            relevant:   matched.length > 0,
            categories: matched,
            score,
            confidence: Math.min(100, score * 10)
        };
    }

    const tech = [];
    let score = 0;

    for (const [cat, regex] of Object.entries(COMPILED)) {
        if (regex.test(text)) {
            tech.push(cat);
            score += SCORE_MAP[cat] || 1;
        }
    }

    return {
        relevant:   tech.length > 0,
        categories: tech,
        score,
        confidence: Math.min(100, score * 15)
    };
}





module.exports = { scoreJob, KEYWORDS, SCORE_MAP };
