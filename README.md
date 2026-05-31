# Agile Turn Recruitment Suite

Applicant tracking and recruitment operations platform built for Agile Turn Technology LLP. The application covers job postings, candidate and application management, pipeline workflows, reporting, AI-assisted matching, resume parsing, interview scheduling, and transactional email orchestration.

**Repository:** [github.com/Sahil2927/Agile_Turn_Technology_LLP](https://github.com/Sahil2927/Agile_Turn_Technology_LLP)

The Git repository root is this `app` directory. A companion Python microservice (`ai-service`) typically lives in the parent workspace folder alongside `app` and is optional but recommended for full AI features.

---

## Features

### Core ATS

- **Dashboard** — KPIs, charts, pipeline stats, and activity feeds (Redis-backed caching when configured).
- **Jobs** — Create and manage openings; job detail view with recommended candidates and AI fit scoring.
- **Applicants** — Candidate profiles, applications, stage changes, notes, skills, and resume upload.
- **Kanban** — Visual pipeline by application stage.
- **Reports** — Overview, pipeline, source, time-to-hire; export to Excel or PDF.
- **Users** — Role-based user administration (Admin).
- **Profile** — User settings and email notification preferences.

### AI and matching

- **Resume parsing** — Structured extraction via external AI service (`POST /parse-resume`) with heuristic fallback when AI is unavailable.
- **Embeddings** — Job and candidate semantic vectors for similarity and recommendations (`POST /embed`).
- **Recommended roles** — Hybrid scoring for candidates (semantic, skills, experience, location).
- **Recommended candidates** — Per-job candidate ranking with explainable breakdown.
- **AI candidate scoring** — Multi-signal fit score (semantic, skills, experience, recency, resume quality, certifications, location).
- **Recruiter AI search** — Natural-language candidate search with hybrid ranking and analytics.

### Operations

- **BullMQ workers** — Background processing for resume parsing, embeddings, email, and analytics refresh.
- **Queue monitor** — Bull Board UI for queue inspection (Admin, separate process on port 3030 by default).
- **Email monitoring** — Admin view of outbound email logs and delivery status.
- **Interview scheduling** — Create, reschedule, cancel interviews; conflict detection; panel notices and reminders via email queue.

### Security and access

- **NextAuth** session authentication.
- **RBAC** — `ADMIN`, `RECRUITER`, and `HIRING_MANAGER` roles with scoped data visibility.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser  →  Next.js 15 (App Router)  →  API routes (Node)    │
└────────────┬───────────────────────────────┬────────────────────┘
             │                               │
             ▼                               ▼
     ┌───────────────┐              ┌────────────────┐
     │  PostgreSQL   │              │  Redis         │
     │  (Prisma)     │              │  cache, limits,│
     │  + pgvector   │              │  BullMQ queues │
     └───────────────┘              └────────┬───────┘
                                             │
                                             ▼
                                    ┌────────────────┐
                                    │  Worker process│
                                    │  (npm run      │
                                    │   worker)      │
                                    └────────┬───────┘
                                             │
                                             ▼
                                    ┌────────────────┐
                                    │  ai-service      │
                                    │  FastAPI :8000   │
                                    │  embed, parse    │
                                    └────────────────┘
```

| Component | Technology | Purpose |
|-----------|------------|---------|
| Web app | Next.js 15, React 19, Tailwind CSS 4 | UI and API routes |
| Database | PostgreSQL, Prisma ORM | Persistent data; optional `pgvector` for semantic search |
| Cache and queues | Redis, BullMQ, ioredis | Caching, rate limits, async jobs |
| Auth | NextAuth.js | Sign-in and sessions |
| Email | Nodemailer, BullMQ `ats-email` queue | Transactional email (SMTP) |
| AI service | FastAPI, sentence-transformers, spaCy (optional) | Embeddings and resume NLP |

### BullMQ queues

| Queue name | Worker responsibility |
|------------|----------------------|
| `ats-resume-parsing` | Parse uploaded resumes and sync structured profile |
| `ats-embedding` | Generate and store job/candidate embeddings |
| `ats-email` | Send scheduled and transactional emails |
| `ats-analytics` | Refresh dashboard and report cache entries |

---

## Prerequisites

- **Node.js** 18+ (20 LTS recommended)
- **PostgreSQL** 14+ with **pgvector** extension enabled for migrations
- **Redis** 6+ (required for workers, queue monitor, and production-grade caching)
- **Python** 3.10+ (only if running `ai-service` locally)

Optional:

- SMTP credentials for outbound email
- WSL on Windows for Redis, or Memurai / Docker Redis on Windows

---

## Quick start

### 1. Clone and install

```bash
git clone https://github.com/Sahil2927/Agile_Turn_Technology_LLP.git
cd Agile_Turn_Technology_LLP
npm install
```

### 2. Environment

Copy the example file and fill in required values:

```bash
cp .env.example .env
```

Minimum variables to run locally:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `NEXTAUTH_SECRET` | Random secret (`openssl rand -base64 32`) |
| `NEXTAUTH_URL` | App URL, e.g. `http://localhost:3000` |
| `REDIS_URL` | e.g. `redis://127.0.0.1:6379` |

See `.env.example` for the full list (AI service URL, SMTP, cron secret, cache TTLs, rate limits, and more).

Never commit `.env` — it is listed in `.gitignore`.

### 3. Database

```bash
npm run prisma:generate
npm run prisma:deploy
```

For local schema iteration during development:

```bash
npm run prisma:migrate
```

Inspect data:

```bash
npm run prisma:studio
```

### 4. Redis (Windows + WSL)

If Redis runs inside WSL and the app runs on Windows, expose port 6379 to the host. In **Administrator PowerShell** (replace `<WSL_IP>` with output of `wsl hostname -I`):

```powershell
netsh interface portproxy add v4tov4 listenaddress=127.0.0.1 listenport=6379 connectaddress=<WSL_IP> connectport=6379
```

Verify from the app directory:

```powershell
node -e "const R=require('ioredis'); const r=new R(process.env.REDIS_URL||'redis://127.0.0.1:6379'); r.ping().then(x=>{console.log(x);r.quit()})"
```

Expected output: `PONG`.

### 5. AI microservice (optional)

From the sibling `ai-service` folder (parent of this repo if you use the full workspace layout):

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate
# Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Set `RESUME_FILES_BASE_PATH` to the same directory as `RESUME_UPLOAD_DIR` on the ATS (default: `uploads/resumes` under this project).

Start the service:

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

In the ATS `.env`:

```env
AI_SERVICE_URL=http://127.0.0.1:8000
```

Set `AI_RESUME_PARSE_ENABLED=false` to use heuristic parsing only without the Python service.

### 6. Run the application

Use **three terminals** for full functionality:

**Terminal 1 — Next.js**

```bash
npm run dev
```

Or run the app and queue monitor together:

```bash
npm run dev:all
```

**Terminal 2 — BullMQ workers**

```bash
npm run worker
```

**Terminal 3 — Queue monitor (optional)**

```bash
npm run monitor
```

Default URLs:

| Service | URL |
|---------|-----|
| Application | http://localhost:3000 |
| Queue monitor (Bull Board) | http://127.0.0.1:3030/admin/queues |
| AI service API docs | http://127.0.0.1:8000/docs |

---

## NPM scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Next.js development server |
| `npm run dev:all` | Next.js + queue monitor (concurrently) |
| `npm run dev:monitor` | Queue monitor only |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | ESLint |
| `npm run worker` | BullMQ worker process |
| `npm run monitor` | Bull Board Express server |
| `npm run prisma:generate` | Generate Prisma client |
| `npm run prisma:migrate` | Create/apply dev migrations |
| `npm run prisma:deploy` | Apply migrations (production/CI) |
| `npm run prisma:studio` | Prisma Studio GUI |

---

## Project structure

```
app/
├── app/                    # Next.js App Router (pages + API routes)
│   ├── (dashboard)/        # Authenticated UI (jobs, applicants, search, admin)
│   └── api/                # REST API handlers
├── components/             # React UI components
├── monitor/                # Bull Board server entry
├── prisma/
│   ├── schema.prisma       # Data model
│   └── migrations/         # SQL migrations (incl. pgvector)
├── src/lib/                # Business logic, queues, AI clients, email, cache
├── workers/                # BullMQ worker entry (npm run worker)
├── uploads/resumes/        # Local resume storage (gitignored contents)
└── .env.example            # Environment template
```

Key library areas under `src/lib/`:

- `queues/` — BullMQ queue definitions and workers
- `ai/` — Candidate scoring, recruiter search, embedding client usage
- `cache/` — Redis cache helpers and keys
- `email/` — SMTP, templates, preferences, monitoring
- `resume-parse-pipeline.ts` — Resume parse orchestration

---

## Roles and permissions

| Role | Typical access |
|------|----------------|
| `ADMIN` | Full system access, user management, email monitoring, queue monitor |
| `RECRUITER` | Jobs, candidates, applications, search, reports (scoped assignments) |
| `HIRING_MANAGER` | Limited visibility aligned to assigned jobs and interviews |

Authorization is enforced in API routes via helpers in `src/lib/rbac.ts` and `src/lib/rbac-scope.ts`.

---

## Resume upload and parsing flow

1. User uploads a PDF/DOC resume via the candidate or public apply flow.
2. File is stored under `uploads/resumes/` (configurable via `RESUME_UPLOAD_DIR`).
3. A parse job is enqueued on `ats-resume-parsing` (requires Redis + worker).
4. Worker calls `AI_SERVICE_URL/parse-resume` when enabled; otherwise heuristic extraction runs in Node.
5. Parsed fields can be reviewed and applied to the candidate profile via the API.

Cron fallback (no worker): `GET` or `POST` `/api/cron/process-parse-jobs` with `Authorization: Bearer <CRON_SECRET>`.

---

## Email

Transactional email is sent through the `ats-email` queue when Redis, workers, and SMTP are configured.

Required SMTP variables: `SMTP_HOST`, `SMTP_FROM`. If `SMTP_USER` is set, `SMTP_PASSWORD` is required.

Enable sending in the worker:

```env
EMAIL_WORK_ENABLED=1
```

Email types include application received, stage changes, interview scheduled/rescheduled/cancelled, panel notices, reminders, and password reset.

---

## Production notes

- Run `npm run build` then `npm run start` for the web process.
- Run `npm run worker` as a separate long-lived process (or multiple instances with shared Redis).
- Apply migrations with `npm run prisma:deploy` before starting new versions.
- Set strong `NEXTAUTH_SECRET` and `CRON_SECRET` in production.
- Configure SPF, DKIM, and DMARC for the domain used in `SMTP_FROM` (see comments in `.env.example` and `src/lib/email/email-security.ts`).
- Ensure `pgvector` extension exists before deploying migrations that add `embedding_vector` columns.

---

## Troubleshooting

### `ECONNRESET` or Redis connection errors on Windows

Redis is healthy in WSL but Windows cannot reach it through `127.0.0.1:6379`. Restart Redis in WSL, confirm `redis-cli ping` returns `PONG`, then refresh the portproxy rule with the current WSL IP.

### Queue monitor shows no jobs

Confirm Redis is running, `npm run worker` is active, and `REDIS_URL` matches between app, worker, and monitor.

### AI parse or embeddings fail

Confirm `ai-service` is running, `AI_SERVICE_URL` is correct, and `RESUME_FILES_BASE_PATH` (AI service) matches the ATS resume upload directory.

### `embedding_vector` column does not exist

Run `npm run prisma:deploy` on a Postgres instance with the `vector` extension enabled.

---

## Deploy on Vercel (free tier)

**Local development does not require Vercel.** Use `npm run dev` on your PC for day-to-day work. Vercel gives you a public HTTPS URL (demo, sharing, mobile access).

### What works on Vercel Hobby (free)

| Feature | On Vercel |
|---------|-----------|
| Dashboard, jobs, applicants, auth | Yes |
| PostgreSQL (e.g. Prisma Postgres `DATABASE_URL`) | Yes |
| Redis caching / rate limits (e.g. [Upstash](https://upstash.com) free Redis) | Yes, with `REDIS_URL` |
| Resume parse cron | Yes (`vercel.json` runs `/api/cron/process-parse-jobs` every 5 min) |
| BullMQ `npm run worker` | No (needs a separate host: Railway, Render, or your PC) |
| Queue monitor (Bull Board) | No (local only: `npm run monitor`) |
| AI service (`ai-service` Python) | No (host on Render/Railway or run locally; set `AI_SERVICE_URL`) |
| Resume file storage | Limited (serverless disk is ephemeral; uploads may not persist across deploys) |

### 1. Connect GitHub to Vercel

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub.
2. **Add New Project** → import `Sahil2927/Agile_Turn_Technology_LLP`.
3. Root directory: **`.`** (repo root is the Next.js app).
4. Framework: **Next.js** (auto-detected).

### 2. Environment variables (Vercel → Project → Settings → Environment Variables)

| Variable | Required | Example / notes |
|----------|----------|-----------------|
| `DATABASE_URL` | Yes | Your Prisma Postgres URL |
| `NEXTAUTH_SECRET` | Yes | `openssl rand -base64 32` |
| `NEXTAUTH_URL` | Yes | `https://your-project.vercel.app` (set after first deploy, then redeploy) |
| `PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK` | Yes | `1` (for `prisma migrate deploy` on Prisma hosted DB) |
| `REDIS_URL` | Recommended | Upstash Redis URL (`rediss://...`) |
| `CRON_SECRET` | Yes (for cron) | Random secret; Vercel sends `Authorization: Bearer <value>` |
| `AI_SERVICE_URL` | Optional | Public URL of hosted `ai-service`, or leave unset for heuristic parse only |
| `QUEUE_MONITOR_AUTO_START` | Optional | `false` (default on Vercel is production; monitor is disabled anyway) |

Do **not** commit `.env` to GitHub.

### 3. Deploy

Click **Deploy**. Build runs:

`prisma generate && prisma migrate deploy && next build`

After the first deploy, set `NEXTAUTH_URL` to your real Vercel URL and **Redeploy**.

### 4. Hybrid setup (recommended for full features)

- **Vercel** — web app + cron parse jobs  
- **Your PC** — `npm run worker` + Redis (WSL) + optional `ai-service` and queue monitor, using the same `DATABASE_URL` and `REDIS_URL` as production  

### 5. CLI deploy (optional)

```bash
npm i -g vercel
cd path/to/Agile_Turn_Technology_LLP
vercel login
vercel --prod
```

Paste the same environment variables when prompted or set them in the Vercel dashboard.

---

## License

Proprietary — Agile Turn Technology LLP. All rights reserved unless otherwise stated by the organization.


