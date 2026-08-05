/**
 * DateFilter.js
 * Filtert Jobs anhand des Posting-Datums — nur aktuelles Jahr + Vorjahr werden
 * durchgelassen. Rollierend statt hartcodiert (z.B. "2025/2026"), damit die
 * App nicht im nächsten Jahr stillschweigend alle neuen Stellen ausfiltert.
 */

function isRecentJob(dateStr) {
    if (!dateStr) return false;

    const year = new Date(dateStr).getFullYear();
    if (Number.isNaN(year)) return false;

    const currentYear = new Date().getFullYear();
    return year >= currentYear - 1 && year <= currentYear;
}

module.exports = { isRecentJob };
