/**
 * BeesiteCrawler.js
 * Abstrakte Basisklasse für alle Beesite-APIs
 * (Mercedes-Benz, Porsche/MHP, ZF, ...)
 *
 * Subklasse braucht nur zu implementieren:
 *   getName(), getHost(), getSearchTerms()
 *   Optional: getChannel(), isGet()
 */

const BaseCrawler    = require('./BaseCrawler');
const { scoreJob }   = require('../../core/ScoreEngine');

const COUNT_ITEM = 20;

class BeesiteCrawler extends BaseCrawler {

    getType()    { return 'beesite'; }
    getHost()    { throw new Error('getHost() nicht implementiert'); }
    getChannel() { return null; }   // z.B. "88" für MHP — null = kein Filter
    isGet()      { return false; }  // Porsche/MHP nutzt GET statt POST

    // ── Request-Body ────────────────────────────────────────────────────

    buildBody(searchTerm, firstItem = 1) {
        const criteria = [
            { CriterionName: "PublicationLanguage.Code",             CriterionValue: ["DE"] },
            { CriterionName: "PositionFormattedDescription.Content", CriterionValue: [searchTerm] }
        ];

        if (this.getChannel()) {
            criteria.push({ CriterionName: "PublicationChannel.Code", CriterionValue: [this.getChannel()] });
        }

        return JSON.stringify({
            LanguageCode: "DE",
            SearchParameters: {
                FirstItem: firstItem,
                CountItem: COUNT_ITEM,
                Sort: [{ Criterion: "PublicationStartDate", Direction: "DESC" }],
                MatchedObjectDescriptor: [
                    "ID", "PositionID", "PositionTitle", "PositionURI",
                    "PublicationStartDate", "PositionStartDate",
                    "CareerLevel.Name", "JobCategory.Name",
                    "ParentOrganizationName",
                    "PositionLocation.CityName", "PositionLocation.CountryName"
                ]
            },
            SearchCriteria: criteria
        });
    }

    // ── Eine Seite fetchen ───────────────────────────────────────────────

    async fetchPage(searchTerm, firstItem) {
        if (this.isGet()) {
            // GET mit URL-encodiertem JSON (z.B. Porsche/MHP)
            const url = `https://${this.getHost()}/search/?data=${encodeURIComponent(this.buildBody(searchTerm, firstItem))}`;
            return this.httpGet(url);
        } else {
            // POST mit JSON-Body (z.B. Mercedes-Benz)
            return this.httpPost(this.getHost(), '/search', this.buildBody(searchTerm, firstItem));
        }
    }

    // ── Alle Seiten für einen Suchbegriff ────────────────────────────────

    async fetchTerm(searchTerm) {
        const first = await this.fetchPage(searchTerm, 1);
        if (!first) return [];

        const total = first.SearchResult?.SearchResultCountAll || 0;
        let items   = first.SearchResult?.SearchResultItems || [];
        const pages = Math.ceil(total / COUNT_ITEM);

        for (let p = 1; p < pages; p++) {
            await this.sleep(this.DELAY);
            const page = await this.fetchPage(searchTerm, p * COUNT_ITEM + 1);
            if (page?.SearchResult?.SearchResultItems) {
                items = items.concat(page.SearchResult.SearchResultItems);
            } else {
                console.log(`  ⚠ ${this.getName()}: Seite ${p + 1} fehlgeschlagen`);
            }
        }
        return items;
    }

    // ── Alle Suchbegriffe + Dedup + Mapping ─────────────────────────────

    async fetchAll() {
        const results = [];
        for (const term of this.getSearchTerms()) {
            const items = await this.fetchTerm(term);
            results.push(...items);
            await this.sleep(this.DELAY);
        }

        const unique = this.deduplicate(
            results,
            item => item.MatchedObjectId,
            item => item.MatchedObjectDescriptor?.PositionURI || ''
        );

        const thesis   = [];
        const skipped  = [];

        for (const item of unique) {
            const d     = item.MatchedObjectDescriptor;
            const title = d.PositionTitle || '';
            const level = d.CareerLevel?.[0]?.Name || 'Unbekannt';

            const isThesis =
                ['abschlussarbeiten','masterarbeiten','bachelorarbeiten'].some(l => level.toLowerCase().includes(l)) ||
                ['abschlussarbeit','masterarbeit','bachelorarbeit','thesis'].some(k => title.toLowerCase().includes(k));

            if (!isThesis) { skipped.push(level); continue; }

            const city          = d.PositionLocation?.[0]?.CityName || '';
            const locationCount = d.PositionLocation?.length || 1;

            thesis.push({
                company:   this.getName(),
                title,
                city:      locationCount > 1 ? `${city} +${locationCount - 1}` : city,
                org:       d.ParentOrganizationName || this.getName(),
                level,
                category:  d.JobCategory?.[0]?.Name || '',
                url:       d.PositionURI || `https://${this.getHost()}/job/${d.ID}`,
                date:      d.PublicationStartDate || new Date().toISOString().split('T')[0],
                startDate: d.PositionStartDate || '',
                score:     scoreJob(title, d.JobCategory?.[0]?.Name || '')
            });
        }

        if (skipped.length > 0) {
            const counts  = skipped.reduce((acc, l) => { acc[l] = (acc[l] || 0) + 1; return acc; }, {});
            const summary = Object.entries(counts).map(([l, n]) => `${n}x ${l}`).join(', ');
            console.log(`  → ${unique.length} unique · ${skipped.length} übersprungen (${summary}) · ${thesis.length} Abschlussarbeiten`);
        }

        return thesis;
    }
}

module.exports = BeesiteCrawler;
