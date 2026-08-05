/**
 * WorkdayCrawler.js
 * Abstrakte Basisklasse für alle Workday-APIs
 * (Trumpf, SAP, Siemens, ...)
 *
 * Subklasse braucht nur zu implementieren:
 *   getName(), getHost(), getApiPath()
 *   Optional: getSearchTerms()
 */

const BaseCrawler  = require('./BaseCrawler');
const { scoreJob } = require('../../core/ScoreEngine');

const LIMIT = 20;

class WorkdayCrawler extends BaseCrawler {

    getType()    { return 'workday'; }
    getHost()    { throw new Error('getHost() nicht implementiert'); }
    getApiPath() { throw new Error('getApiPath() nicht implementiert'); }

    getSearchTerms() {
        return ['Masterarbeit', 'Bachelorarbeit', 'Wissenschaftliche Arbeit'];
    }

    // ── Eine Seite fetchen ───────────────────────────────────────────────

    async fetchPage(searchTerm, offset = 0) {
        const body = JSON.stringify({
            appliedFacets: {},
            limit:  LIMIT,
            offset,
            searchText: searchTerm
        });
        return this.httpPost(this.getHost(), this.getApiPath(), body);
    }

    // ── Alle Seiten für einen Suchbegriff ────────────────────────────────

    async fetchTerm(searchTerm) {
        const first = await this.fetchPage(searchTerm, 0);
        if (!first) return [];

        const total    = first.total || 0;
        let postings   = first.jobPostings || [];
        const pages    = Math.ceil(total / LIMIT);

        for (let p = 1; p < pages; p++) {
            await this.sleep(this.DELAY);
            const page = await this.fetchPage(searchTerm, p * LIMIT);
            if (page?.jobPostings) {
                postings = postings.concat(page.jobPostings);
            } else {
                console.log(`  ⚠ ${this.getName()}: Seite ${p + 1} fehlgeschlagen`);
            }
        }
        return postings;
    }

    // ── Alle Suchbegriffe + Dedup + Mapping ─────────────────────────────

    async fetchAll() {
        const results = [];
        for (const term of this.getSearchTerms()) {
            const items = await this.fetchTerm(term);
            results.push(...items);
            await this.sleep(this.DELAY);
        }

        // Workday: Dedup per externalPath
        const unique = this.deduplicate(
            results,
            item => item.externalPath,
            item => item.externalPath
        );

        return unique.map(item => {
            const title = item.title || '';
            return {
                company:   this.getName(),
                title,
                city:      item.locationsText || '',
                org:       this.getName(),
                level:     'Wissenschaftliche Arbeit',
                category:  '',
                url:       `https://${this.getHost().replace(/\.wd\d+\.myworkdayjobs\.com$/, '.com')}${item.externalPath}`,
                date:      new Date().toISOString().split('T')[0],
                startDate: '',
                score:     scoreJob(title)
            };
        });
    }
}

module.exports = WorkdayCrawler;
