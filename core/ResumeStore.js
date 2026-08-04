/**
 * ResumeStore.js
 * Persistiert den zuletzt hochgeladenen Lebenslauf als Klartext.
 * Ein Upload überschreibt den vorherigen — kein Verlauf, kein Multi-User.
 */

const fs   = require('fs');
const path = require('path');
const { PDFParse } = require('pdf-parse');

const RESUME_FILE = path.join(__dirname, '..', 'data', 'resume.txt');
const MAX_CHARS    = 6000; // Deckel für den LLM-Prompt-Kontext (~1500-2000 Tokens)

function hasResume() {
    return fs.existsSync(RESUME_FILE);
}

function loadResumeText() {
    if (!hasResume()) return '';
    return fs.readFileSync(RESUME_FILE, 'utf-8');
}

function saveResumeText(text) {
    const trimmed = text.trim().slice(0, MAX_CHARS);
    fs.mkdirSync(path.dirname(RESUME_FILE), { recursive: true });
    fs.writeFileSync(RESUME_FILE, trimmed, 'utf-8');
    return trimmed;
}

async function extractPdfText(buffer) {
    const parser = new PDFParse({ data: buffer });
    try {
        const { text } = await parser.getText();
        return text.replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    } finally {
        await parser.destroy();
    }
}

function clearResume() {
    if (hasResume()) fs.unlinkSync(RESUME_FILE);
}

function getStatus() {
    if (!hasResume()) return { uploaded: false };
    const text = loadResumeText();
    const stat = fs.statSync(RESUME_FILE);
    return {
        uploaded:   true,
        chars:      text.length,
        preview:    text.slice(0, 300),
        updatedAt:  stat.mtime.toISOString()
    };
}

module.exports = { hasResume, loadResumeText, saveResumeText, extractPdfText, clearResume, getStatus };
