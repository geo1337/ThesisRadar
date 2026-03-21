# ThesisRadar 🎓

> Smart Job Discovery & Analysis Tool for Thesis Positions — aggregating publicly available job listings into a structured, searchable dashboard with scoring and insights.

---

## ✨ Overview

ThesisRadar is a lightweight research tool designed to simplify the process of finding suitable thesis and internship positions.

Instead of manually browsing multiple career pages, the application aggregates publicly available job listings, evaluates them using a customizable scoring system, and presents them in an interactive dashboard.

The focus lies on **decision support**, not data collection!

---


## 🎯 Motivation

The German job market for tech graduates has become increasingly competitive. Finding the right thesis position — one that actually aligns with your skills and interests — requires monitoring dozens of career pages simultaneously, often daily.

ThesisRadar was built out of that necessity. Instead of spending 30+ minutes every morning clicking through career portals, the tool does it automatically and surfaces only what's actually relevant — scored, filtered, and ready to act on.

The goal is simple: **spend less time searching, more time applying to the right positions.**

---


📸 **Screenshots**


![Dashboard](docs/Dashboard_table.png)


![Map View](docs/Dashboard_Map.png)


![Email](docs/Example_Mail.jpeg)

---

## 🔒 Why Crawlers Are Not Public

The concrete crawler implementations (`crawlers/*.js`) are excluded from this repository intentionally.

Each crawler contains company-specific API endpoints, request structures, and search parameters that were reverse-engineered from public career portals for personal use. Publishing them would:

- Potentially encourage bulk usage against company infrastructure
- Go beyond the intended personal research scope of this project
- Risk misuse by others for commercial or automated mass-scraping purposes
- Honest `User-Agent` header identifying the tool (`ThesisRadar-Crawler/1.0 (private thesis search)`) 
  — no browser impersonation
The **base abstractions** (`crawlers/base/`) are fully public — they contain all the reusable architecture. Adding a new crawler for any Beesite, Workday, or custom REST API takes less than 10 lines using the provided base classes.

---

## 🚀 Key Features

### 🔍 Job Discovery & Aggregation
- Aggregates publicly available job listings
- Supports various backend systems (REST APIs, Workday, SAP SuccessFactors)
- Automatic pagination and result normalization
- Deduplication via URL and ID — no duplicate entries
- Lightweight request strategy (~20 requests/day total)
- Per-crawler timeout (15s) and body size limit (5MB)

> The tool only accesses data that is also loaded during a normal browser session.

---

### 📊 Smart Scoring System
- Keyword-based scoring across 6 tech categories (AI, IoT, Security, Software, Frontend, Automotive)
- Visual score indicators: 🟢 high fit (≥4) · 🟡 medium (2–3) · 🔴 low (0–1)
- Fully customizable scoring logic in `core/ScoreEngine.js`

---

### 🖥️ Interactive Dashboard
- **Live updates** via Server-Sent Events (SSE) — jobs stream in one by one
- Real-time progress tracking per company with total / relevant / new counts
- Stats bar: jobs loaded, new today, tech-relevant, favorites, viewed, last run
- Dark / Light Mode with localStorage persistence

---

### 📋 Table View
- Full-text search across title, city, category, company (live, no submit)
- Filter by score, status (new / favorites / unread / applied), company chips
- Sortable columns: score, date, title
- Pagination (25 per page)
- Company logos, color-coded tech tags, new badge
- Per-job tracking: ★ Favorite · ✓ Viewed · ✈ Applied — all persisted in DB
- Auto-mark as viewed on link click
- "Reset all to unread" button

---

### 🗺️ Map View
- Interactive Leaflet.js map with dark CARTO theme
- Jobs clustered by city — marker size = job count, color = best score
- Popup with company overview and one-click city filter
- Score legend as native Leaflet control (bottom left)

---

### 📈 Analytics View
- Jobs per company (horizontal bar chart)
- Jobs per city (horizontal bar chart)
- Score distribution (vertical bar chart)
- Powered by Chart.js

---

### ⭐ Personal Tracking
- Favorites (★), Viewed (✓), Applied (✈) — all stored in SQL Server
- Optimistic UI updates with automatic rollback on DB failure
- CSV export with UTF-8 BOM (correct "umlauts" in Excel)

---

### 📧 Email Notifications
- Automatic email alert after each crawl run
- Only triggered when new jobs with **Score ≥ 4** are found
- Supports multiple recipients (e.g. Gmail + web.de simultaneously)
- HTML email with job table — title, company, city, score, tags
- Configurable via `.env` — no code changes needed
- Powered by Nodemailer + Gmail (App Password)

---

## 🧠 Use Cases

### Thesis Position Discovery
Identify relevant opportunities based on personalized scoring instead of manually browsing career pages daily.

### Decision Support
Compare companies, roles, and locations using structured, scored, and normalized data in one view.

### Geographic Analysis
Switch to map view to understand where jobs are geographically concentrated and filter by city.

### Market Insights
Use the analytics view to understand which skills and technologies are currently in demand across companies.

### Automated Job Alerts
After each scheduled crawl run, ThesisRadar automatically sends an email summary of all newly found high-score positions — so relevant opportunities are never missed without manual checking.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          Browser                                 │
│                        index.html                                │
│  ┌───────────┐  ┌──────────────┐  ┌──────────┐  ┌──────────┐  │
│  │  Table    │  │     Map      │  │  Stats   │  │  Filter  │  │
│  │ + Search  │  │  (Leaflet)   │  │(Chart.js)│  │  + Sort  │  │
│  └───────────┘  └──────────────┘  └──────────┘  └──────────┘  │
│              EventSource (SSE) + fetch (PATCH)                   │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTP  127.0.0.1:3000  (local only)
┌──────────────────────────▼──────────────────────────────────────┐
│                     server.js  (Express)                         │
│                                                                  │
│  GET  /api/stream     SSE — live job streaming                  │
│  GET  /api/history    All jobs from DB                          │
│  GET  /api/companies  Active crawler list                       │
│  GET  /api/geocache   City coordinates                          │
│  PATCH /api/jobs/:id  Update seen / favorite / applied          │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    Crawler Layer                          │  │
│  │  Bosch · Mercedes · Porsche · Trumpf · Fraunhofer · SAP  │  │
│  │  Siemens · Audi · Adesso · Bechtle · Festo               │  │
│  │  Exxeta · Vector · StudySmarter · Arbeitsagentur          │  │
│  │  · DaimlerTruck · MHP (+17 total)                     │  │
│  └──────────────────────┬────────────────────────────────────┘  │
│                         │  extends                               │
│  ┌──────────────────────▼────────────────────────────────────┐  │
│  │               Base Abstractions                            │  │
│  │  BaseCrawler ──► BeesiteCrawler ──► MercedesCrawler       │  │
│  │              └──► WorkdayCrawler ──► TrumpfCrawler        │  │
│  └──────────────────────┬────────────────────────────────────┘  │
│                         │                                        │
│  ┌──────────────────────▼────────────────────────────────────┐  │
│  │                     Core Modules                           │  │
│  │    ScoreEngine · DbExporter · CsvExporter · GeoCache · Mailer  │  │
│  └──────────────────────┬────────────────────────────────────┘  │
└─────────────────────────┼────────────────────────────────────────┘
                          │
┌─────────────────────────▼────────────────────────────────────────┐
│              SQL Server  (local, Windows Authentication)          │
│   jobs: title · company · city · url · score · tags              │
│          seen · favorite · applied · applied_at · created_at     │
└───────────────────────────────────────────────────────────────────┘
                          │
┌─────────────────────────▼────────────────────────────────────────┐
│            External Career APIs  (HTTPS, outbound only)           │
│   Beesite REST · Workday REST · SAP SuccessFactors                │
└───────────────────────────────────────────────────────────────────┘
```

### Crawl Data Flow

```
User clicks "Start"
    │
    ├─► GET /api/stream          opens SSE connection
    │
    └─► Server iterates CRAWLERS[]
            │
            ├─► send('status', loading)   →  progress bar appears
            ├─► crawler.fetchAll()        →  external API call
            ├─► keyword scoring + dedup
            │
            ├─► for each new job:
            │       sleep(800ms)
            │       send('job', {...})    →  row appears in table
            │
            └─► send('status', done)      →  bar turns green

        after all crawlers:
            ├─► insertJobs(allNew)        →  persist to SQL Server
            ├─► geocodeAllCities()        →  cache coordinates
            ├─► sendJobAlert(allNew)      →  email if new & score ≥ 4
            └─► send('done')             →  button re-enabled
```

---

## ⚙️ Tech Stack

### Backend
| Technology | Purpose |
|------------|---------|
| Node.js ≥ 18 | Runtime |
| Express.js | HTTP server, REST API |
| mssql / msnodesqlv8 | SQL Server connector (Windows Auth) |
| dotenv | Environment configuration |
| nodemailer | Email notifications via Gmail SMTP |

### Frontend
| Technology | Purpose |
|------------|---------|
| Vanilla JS (ES2022) | All frontend logic — no framework |
| Leaflet.js 1.9.4 | Interactive map |
| Chart.js 4.4.1 | Analytics charts |
| Font Awesome 6.5 | Icons |
| SSE (EventSource) | Live job streaming |

---

## ⚙️ Configuration

all dependencies can be looked up inside the package json file

**`.env`** in project root:
```env
PORT=3000
DB_DRIVER=SQL Server
DB_SERVER=localhost\SQLEXPRESS
DB_NAME=ThesisRadar

# Email notifications

RESEND_API_KEY=....
MAIL_TO=your@gmail.com,your@web.de etc
MAIL_MIN_SCORE=4
```

---

## 🗄️ Database Schema

```sql
CREATE TABLE jobs (
    id          INT IDENTITY(1,1) PRIMARY KEY,
    title       NVARCHAR(500)  NOT NULL,
    company     NVARCHAR(200),
    source      NVARCHAR(100),
    city        NVARCHAR(200),
    url         NVARCHAR(500)  UNIQUE,
    date        NVARCHAR(50),
    startDate   NVARCHAR(50),
    score       INT            DEFAULT 0,
    tags        NVARCHAR(MAX),         -- JSON array e.g. ["ki","software"]
    logo        NVARCHAR(500),
    org         NVARCHAR(200),
    level       NVARCHAR(100),
    category    NVARCHAR(200),
    seen        BIT            DEFAULT 0,
    favorite    BIT            DEFAULT 0,
    applied     BIT            DEFAULT 0,
    applied_at  DATETIME       NULL,
    created_at  DATETIME       DEFAULT GETDATE()
);
```

---

## 📁 Project Structure

```
thesis-radar/
├── index.html                   ← Single Page App (dashboard)
├── server.js                    ← Express + SSE + REST API
├── daily_crawler.js             ← Terminal-only crawler (no GUI)
├── .env                         ← Secrets — do NOT commit
├── package.json
│
├── core/
│   ├── ScoreEngine.js           ← Keyword scoring logic
│   ├── CsvExporter.js           ← CSV read/write with BOM
│   ├── DbExporter.js            ← SQL Server: connect/insert/load/update
│   ├── GeoCache.js              ← City coordinate caching
│   └── Mailer.js                ← Email notifications (Nodemailer + Gmail)
│
├── crawlers/
│   ├── base/
│   │   ├── BaseCrawler.js       ← httpGet/Post, timeout, maxBody, dedup
│   │   ├── BeesiteCrawler.js    ← abstract: Beesite POST + GET
│   │   └── WorkdayCrawler.js    ← abstract: Workday POST
│   │
│   ├── BoschCrawler.js
│   ├── MercedesCrawler.js       
│   ├── PorscheCrawler.js        
│   ├── TrumpfCrawler.js         
│   ├── FraunhoferCrawler.js     
│   └── ... 14 more
│
├── assets/logos/                ← Company logos (PNG/SVG)

```

---



## 📊 Scoring System

| Category | Example Keywords | Score |
|----------|-----------------|-------|
| AI / ML | ai, machine learning, llm, nlp, neural | **+3** |
| IoT | iot, industrie 4.0, sensor, edge, embedded | **+2** |
| Cybersecurity | security, cyber, pentest | **+2** |
| Software | cloud, devops, kubernetes, docker | **+2** |
| Frontend | react, vue, angular, javascript | **+1** |
| Automotive | adas, autosar, batterie, elektro | **+1** |

Fully customizable in `core/ScoreEngine.js`.

---

## ⏰ Automation

**Windows Task Scheduler** for daily automated run:
```
Program:    node
Arguments:  C:\path\to\thesis-radar\daily_crawler.js
Start in:   C:\path\to\thesis-radar
Trigger:    Daily, 08:00
```

---

## 🔐 Security

- Server binds exclusively to **`127.0.0.1:3000`** — not reachable from the network
- `.env` file never committed to version control
- All database queries use **parameterized statements** — no SQL injection risk
- 5MB response body limit + 15s timeout in all crawlers
- No authentication required — purely local tool

---

## ⚖️ Legal & Compliance

This project is intended solely for personal research and job discovery purposes.

- Only **publicly accessible data** is processed — no login bypass
- **No personal data** is collected or stored → GDPR not applicable
- **No technical safeguards** (CAPTCHA, login systems) are bypassed → § 202a StGB not applicable
- Requests are performed at very low frequency, comparable to normal browsing behavior
- No data is redistributed, published, or commercialized

> ⚠️ Individual website terms may restrict automated access. This project is not affiliated with any referenced companies. Usage is at your own responsibility.

---

## 🌱 Ethical Considerations

This project follows a minimal-impact approach:

- Low request volume with deliberate rate limiting
- No exploitation or bulk extraction of data
- No commercial usage of any kind
- Goal: support individual decision-making, not large-scale data collection

---

## 💡 Potential Improvements

- NLP-based semantic scoring (beyond keyword matching)
- Deadline tracking per job (manual date input with visual warning)
- Keyboard shortcuts for faster job triage (`F` favorite, `S` seen, `A` applied)
- Distance filter on map ("jobs within 50km of my location")
- Job preview panel (slide-in with full description, no tab switch)
---

## 📌 Status

Active personal project — continuously extended with new data sources and features.

---

