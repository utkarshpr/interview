# Backend Atlas

A React learning tracker based on the Senior Backend Interview Preparation guide.

## Run locally

```sh
npm install
npm run dev:all
```

Open the local URL printed by Vite. `npm run dev:all` starts the app and the isolated Go runner. Docker Desktop must be running for Go execution. Use `npm run dev` when you only need the app without code execution. The original PDF is available from **Open guide PDF** in the app.

## Learning tools

- Track curriculum completion, confidence, topic notes, and review reminders.
- Follow a curated 24-week roadmap with prerequisite links.
- Record study sessions, goals, streaks, and in-app browser reminders.
- Use topic explainers with examples and references across Go, SQL, Kafka, Redis, distributed systems, HLD, and LLD.
- Draft answers and solutions. Go exercises run in an isolated Docker container; SQL runs in a disposable SQLite Web Worker with a five-second limit. The coding library includes 86 A2Z-aligned prompts across 20 modules, plus 47 supplemental interview exercises. A2Z prompts include patterns, constraints, progressive hints, brute-force and optimized approaches, difficulty, and sample cases. The coding workspace links back to the [official Striver A2Z DSA sheet](https://takeuforward.org/prep-hub/strivers-a2z-dsa-sheet) for its full statements and materials.
- Write, search, tag, and pin personal notes.
- Review spaced-repetition flashcards generated from saved answers, review flags, notes, and custom cards; Again/Hard/Good/Easy ratings schedule the next review.
- Track interviews, study blocks, milestones, and events on the calendar.
- Build saved HLD diagrams with freehand strokes, shapes, architecture components (CDN, load balancer, API gateway, servers, S3/object storage, databases, queues, and caches), pan/zoom, undo/redo, duplicate/delete, and SVG export. Practice 53 LLD interview problems, including booking, crawler, collaborative docs, streaming, and trading-system designs, with structured notes and Markdown export.
- Run timed mock interviews and review answers against a five-part rubric.
- Check Supabase API reachability and signed-in database access from **Database status**.
- Choose a Sage, Ocean, Violet, Ember, or Midnight appearance theme; the default workspace theme is Midnight.
- Export JSON and CSV backups or restore a profile.

## Supabase cloud sync

For normal login, a Supabase project and its single admin account are required. While running `npm run dev`, choose **Open local preview** on the setup/login screen to view and develop the workspace without Supabase; that bypass is available only in Vite development mode and is disabled in production. Without Supabase environment variables, the setup screen is shown first. The app uses that single Supabase Auth account as its admin login. Passwords are managed and hashed by Supabase Auth; the app never stores a plaintext password. To connect a project:

1. Copy `.env.example` to `.env.local`. Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and the one admin account's `VITE_ADMIN_EMAIL`. Use the publishable key only; never put a service-role key in browser code.
2. In Supabase Auth, create the single admin user with the email and password you want, and disable public sign-ups. Change/reset the password through Supabase Auth in the dashboard when needed; the stored password hash cannot be read back or safely edited as plaintext SQL.
3. Run [`supabase/schema.sql`](supabase/schema.sql) in the SQL Editor, then run the final commented `INSERT` query with the admin email to add its Auth UUID to the one-row allowlist.
4. Add the app URL (usually `http://localhost:5173`) to the Supabase Auth redirect URL list, restart Vite, and sign in through the Backend Atlas login page.
5. Open **Backup & sync** and upload the first device's data. Sign in on another device with the same admin account to restore or sync it.

The database allowlist and row-level security protect the backup table, and the login gate checks both the configured admin email and database allowlist. Changes sync automatically while open and conflicts require a choice. The browser client never needs a service-role secret.

Learner profiles and notes are saved in browser `localStorage`; the admin sign-in requires a working Supabase connection. Download JSON backups periodically. Current daily reminder notifications appear while the app is open; closed-app push delivery needs a deployed push sender and VAPID configuration.

## Data and services

The local Go runner needs Docker Desktop and is started by `npm run dev:all`. SQL exercises run locally in the browser and do not connect to Supabase or any other database. The Supabase database status page checks the configured project API, not the local SQL runner.
