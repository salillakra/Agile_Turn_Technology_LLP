# Frontend (Next.js App)

Base path: `app/` (Next.js 15, React 19, App Router).

## Route & layout structure

| Path | File | Notes |
|------|------|------|
| `/` | `app/page.js` | Redirects to `/dashboard` |
| `/dashboard` | `app/(dashboard)/dashboard/page.js` | Client; state: `jobs`, `applicants` (filled in `useEffect`) |
| `/jobs` | `app/(dashboard)/jobs/page.js` | Client; state: `jobs`, `applicants` |
| `/applicants` | `app/(dashboard)/applicants/page.js` | Client; state: `jobs`, `applicants` |
| `/kanban` | `app/(dashboard)/kanban/page.js` | Client; state: `jobs`, `applicants` |
| `/reports` | `app/(dashboard)/reports/page.js` | Client; state: `jobs`, `applicants` |

- Root layout: `app/layout.js` — imports `./globals.css`, metadata `title` / `description`, wraps `children` in `<html><body>`.
- Dashboard group layout: `app/(dashboard)/layout.js` — renders `Sidebar` (props: `jobsCount`, `applicantsCount`, `hiredCount`, `activeCount` all `0`) and `<main>{children}</main>`.

## Path alias

- `@/*` → `./*` (jsconfig.json).

## Components

- **Layout/nav:** `app/components/Sidebar.jsx` — client; uses `next/link`, `usePathname()`; nav links Dashboard, Jobs, Applicants, Kanban, Reports; footer stat boxes from props.
- **Page components (all `"use client"`):**
  - `app/components/pages/Dashboard.jsx` — KPIs, pipeline funnel, by-source donut, applicants-by-dept bar, recent activity; props: `jobs`, `applicants`.
  - `app/components/pages/Jobs.jsx` — list, search, add/edit/remove job modal; props: `jobs`, `setJobs`, `applicants`.
  - `app/components/pages/Applicants.jsx` — list, filters (job, stage), add/edit/remove applicant modal; props: `applicants`, `setApplicants`, `jobs`.
  - `app/components/pages/Kanban.jsx` — stage columns, move left/right; props: `applicants`, `setApplicants`, `jobs`.
  - `app/components/pages/Reports.jsx` — bar charts by stage, department, source; props: `applicants`, `jobs`.

**UI:** `app/components/ui/` — Card, Btn, Button, Input, Sel, Select (re-export of Sel), Modal, Field, Badge, StageBadge, StarRating, Textarea.

**Charts:** `app/components/charts/` — BarChart, DonutChart, LineSparkline.

## Data & helpers

- **Mock data:** `app/data/mockData.js` — exports: `DEPARTMENTS`, `LOCATIONS`, `STAGES`, `SOURCES`, `STAGE_META`, `NAMES`, `JOBS`, `genApplicants()` (uses `@/lib/helpers`: `uid`, `rnd`, `pick`).
- **Helpers:** `app/lib/helpers.js` — `uid`, `rnd`, `pick`, `fmtDate`, `daysBetween`, `T`, `C`, `inputBase`.

## Styles

- `app/app/globals.css` — fonts (Fraunces, DM Sans, DM Mono), CSS variables, scrollbar/select styles.

## Client-only data (hydration)

Applicant lists are initialized with `useState([])` and set to `genApplicants()` in `useEffect(..., [])` so server and client first paint match (avoids hydration mismatch from `rnd()`/`pick()`).

## References (exact paths)

- `app/package.json` — scripts: `dev`, `build`, `start`; deps: next, react, react-dom.
- `app/jsconfig.json` — `"@/*": ["./*"]`.
- `app/next.config.mjs` — empty Next config.
