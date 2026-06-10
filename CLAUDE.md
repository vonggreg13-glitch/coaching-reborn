# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Run the server
node server.js        # or: npm start / npm run dev

# Default port: 3001
```

There is no build step, no test suite, and no linter configured. The app runs directly with Node.js ≥22.

## Architecture Overview

This is a **monolithic full-stack PWA** for fitness coaching management. Everything lives in two places:

- `server.js` (~1,420 lines) — the entire backend: Express routes, SQLite schema, auth, file uploads, email scheduling, SSE, push notifications
- `public/*.html` — five large self-contained pages with all CSS and JS inlined (no bundler, no framework)

### Backend (`server.js`)

The file is structured top-to-bottom as:

1. **Imports & config** — Express, Multer, web-push, Node's native `node:sqlite` (DatabaseSync), crypto
2. **DB schema** — `db.exec(...)` runs all `CREATE TABLE IF NOT EXISTS` statements on startup; this is the only migration mechanism
3. **Auth middleware** — `requireAuth` (Bearer/X-Token header → sessions table) and `requireCoach` (role check)
4. **Route groups**: `/api/auth/*`, `/api/client/*`, `/api/coach/*`, `/api/messages/*`, `/api/push/*`, `/api/stream`
5. **Page routes** — serve HTML files from `public/` with `Cache-Control: no-store`
6. **Scheduled tasks** — `setInterval`/`setTimeout` for daily backup email (midnight), 9 AM check-in reminders, monthly reports

**Database:** Native `node:sqlite` (`DatabaseSync`) — synchronous API, no async/await needed. All queries use `db.prepare().run()` / `.get()` / `.all()`.

**Auth flow:** `POST /api/auth/login` → verify scrypt hash → insert row into `sessions` (32-byte hex token) → return token to client → client sends `Authorization: Bearer <token>` or `X-Token: <token>` on every request.

**File uploads:** Multer stores to `/app/data/uploads` in production (`NODE_ENV=production`) or `public/uploads` in dev. Filenames are `Date.now() + '-' + 6-byte-hex + ext`. Served at `/uploads/:filename`.

**Real-time:** SSE at `GET /api/stream` — the server keeps a `Map<userId, res>` of open connections and pushes events when messages arrive or check-ins are submitted.

**Email (Resend API):** Called via raw `fetch` to `https://api.resend.com/emails` with `Authorization: Bearer ${RESEND_API_KEY}`. No SDK.

### Frontend (`public/*.html`)

Each HTML file is a standalone SPA with inline `<style>` and `<script>`. They communicate with the backend via `fetch` + `localStorage`-stored token.

| File | Role |
|------|------|
| `login.html` | Login + register + password reset |
| `client.html` | Client dashboard (71 KB) — daily check-in, history, stats, messages, cycle tab |
| `coach.html` | Coach dashboard (88 KB) — client list sidebar + detail panels |
| `cycle.html` | Dedicated menstrual cycle tracking |
| `admin-login.html` | Coach-only login entry point |
| `reset-password.html` | Token-based password reset |
| `guide.html` | User guide |

Charts are rendered with **Chart.js 4.4.0** (CDN). Fonts are loaded from Google Fonts (Montserrat + Inter).

### Key Business Logic

**Score computation** (used in client dashboard and coach overview):
- **Global:** avg(energie, motivation, digestion, sommeil_qualite, hydratation, 10−stress) over last 7 days
- **Recuperation:** avg(sommeil_qualite, 10−stress, energie)
- **Discipline:** avg(protocol_done rate, training_done rate, respect_nutrition rate)

**Alert detection** (coach dashboard, `GET /api/coach/alerts`): Evaluated per-client across the last 7 days. Triggers include 3+ days inactivity, 3 consecutive days low energy/high stress/poor sleep, 4+ days/week low motivation/missed protocol/cravings, 3 consecutive days digestion issues.

**Cycle phases:** Calculated from `cycle_settings` (last_period_start, cycle_length, period_duration). Phases: menstrual → follicular → ovulatory → luteal.

**Default coach account:** Auto-created on first startup using `COACH_EMAIL` / `COACH_PASSWORD` env vars (see below).

### Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `NODE_ENV` | — | Set to `production` to use `/app/data/uploads` for file storage |
| `PORT` | `3001` | HTTP port |
| `COACH_EMAIL` | `gregvong.coaching@gmail.com` | Auto-created coach account email |
| `COACH_PASSWORD` | `GregCoach2026` | Auto-created coach account password |
| `VAPID_PUBLIC` / `VAPID_PRIVATE` | hardcoded dev keys | Web push VAPID keys |
| `RESEND_API_KEY` | — | Required for email features to work |
| `BASE_URL` | Railway URL | Used in email links |

### Adding API Routes

Follow the existing pattern — all routes are registered inline in `server.js`. Auth-protected routes call `requireAuth` (or `requireCoach`) as middleware before the handler. Database access is synchronous:

```js
app.get('/api/example', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json(row);
});
```

### Adding Frontend Features

Edit the relevant `.html` file directly. JS and CSS are inline. Token is stored in `localStorage` as `'token'` and sent via `headers: { 'Authorization': 'Bearer ' + token }`. The `loadData()` / `renderX()` pattern is used throughout — fetch data, then update DOM manually.

### Deployment

Hosted on Railway. Persistent data lives in `/app/data/` (SQLite DB + uploads). The SQLite file path in production is `/app/data/coaching.db`; in dev it falls back to `./coaching.db`.
