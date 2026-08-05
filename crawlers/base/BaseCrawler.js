/**
 * BaseCrawler.js
 * Abstrakte Basisklasse — jeder Crawler erbt von hier
 * Enthält gemeinsame HTTP-Logik, Timeout, MaxBody, Delay
 */

const https = require('https');

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_BODY_BYTES     = 5 * 1024 * 1024;
const REQUEST_DELAY_MS   = 1000;

class BaseCrawler {

    // ── Muss von Subklasse implementiert werden ──────────────────────────

    getName()        { throw new Error('getName() nicht implementiert'); }
    getType()        { return 'custom'; }               // 'beesite' | 'workday' | 'custom'
    getSearchTerms() { return ['Masterarbeit', 'Abschlussarbeit']; }

    /** Hauptmethode — holt alle Jobs für alle Suchbegriffe */
    async fetchAll() {
        throw new Error('fetchAll() nicht implementiert');
    }

    // ── Gemeinsame HTTP-Hilfsmethoden ────────────────────────────────────

    /** GET-Request — gibt geparsten JSON zurück oder null */
    httpGet(url) {
        return new Promise((resolve) => {
            const req = https.get(url, {
                headers: {
                    'User-Agent': 'JobRadar-Crawler/1.0 (private thesis search)',
                    'Accept':     'application/json'
                }
            }, (res) => {
                let data = '';
                let bodyBytes = 0;

                res.on('data', chunk => {
                    bodyBytes += chunk.length;
                    if (bodyBytes > MAX_BODY_BYTES) {
                        console.log(`  ⚠ ${this.getName()}: Response zu groß`);
                        req.destroy();
                        resolve(null);
                        return;
                    }
                    data += chunk;
                });

                res.on('end', () => {
                    try { resolve(JSON.parse(data)); }
                    catch {
                        console.log(`  ⚠ ${this.getName()}: Parse-Fehler`);
                        res.resume();
                        resolve(null);
                    }
                });

                res.on('error', (e) => {
                    console.log(`  ⚠ ${this.getName()} response error:`, e.message);
                    res.resume();
                    resolve(null);
                });
            });

            req.setTimeout(REQUEST_TIMEOUT_MS, () => {
                console.log(`  ⚠ ${this.getName()}: Timeout`);
                req.destroy();
                resolve(null);
            });

            req.on('error', (e) => {
                if (e.code !== 'ECONNRESET')
                    console.log(`  ⚠ ${this.getName()} request error:`, e.message);
                resolve(null);
            });
        });
    }

    /** POST-Request mit JSON-Body — gibt geparsten JSON zurück oder null */
    httpPost(hostname, path, body) {
        return new Promise((resolve) => {
            const req = https.request({
                hostname,
                path,
                method:  'POST',
                headers: {
                    'Content-Type':   'application/json',
                    'Content-Length': Buffer.byteLength(body),
                    'User-Agent':     'JobRadar-Crawler/1.0 (private thesis search)',
                    'Accept':         'application/json'
                }
            }, (res) => {
                let data = '';
                let bodyBytes = 0;

                res.on('data', chunk => {
                    bodyBytes += chunk.length;
                    if (bodyBytes > MAX_BODY_BYTES) {
                        console.log(`  ⚠ ${this.getName()}: Response zu groß`);
                        req.destroy();
                        resolve(null);
                        return;
                    }
                    data += chunk;
                });

                res.on('end', () => {
                    try { resolve(JSON.parse(data)); }
                    catch {
                        console.log(`  ⚠ ${this.getName()}: Parse-Fehler`);
                        res.destroy();
                        resolve(null);
                    }
                });

                res.on('error', (e) => {
                    console.log(`  ⚠ ${this.getName()} response error:`, e.message);
                    res.resume();
                    resolve(null);
                });
            });

            req.setTimeout(REQUEST_TIMEOUT_MS, () => {
                console.log(`  ⚠ ${this.getName()}: Timeout`);
                req.destroy();
                resolve(null);
            });

            req.on('error', (e) => {
                if (e.code !== 'ECONNRESET')
                    console.log(`  ⚠ ${this.getName()} request error:`, e.message);
                resolve(null);
            });

            req.write(body);
            req.end();
        });
    }

    /** Dedupliziert per ID und URL */
    deduplicate(items, getId, getUrl) {
        const seenIds  = new Set();
        const seenUrls = new Set();
        return items.filter(item => {
            const id  = getId(item);
            const url = getUrl(item);
            if (seenIds.has(id) || (url && seenUrls.has(url))) return false;
            seenIds.add(id);
            if (url) seenUrls.add(url);
            return true;
        });
    }

    sleep(ms) {
        return new Promise(res => setTimeout(res, ms));
    }

    /** Strippt HTML-Tags/Entities aus Job-Beschreibungen — für LLM-Scoring (LlmScoreEngine.js) */
    stripHtml(html, maxChars = 1500) {
        if (!html) return '';
        return html
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/gi, ' ')
            .replace(/&amp;/gi, '&')
            .replace(/&[a-z]+;/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, maxChars);
    }

    get DELAY() { return REQUEST_DELAY_MS; }
}

module.exports = BaseCrawler;
