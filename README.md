# EasyForm

A form builder: sidebar app shell, folders to organize forms (with
drag-and-drop), a tabbed builder (Fields / Rules / Settings / Themes /
Share), 14 field types including multi-page forms via page breaks,
conditional field logic, a template gallery, password-protected forms, real
QR codes, server-enforced response limits and close dates,
server-validated public submissions, a Submissions table with CSV export, an
Analytics dashboard, and Supabase auth + Postgres (RLS-enforced
multi-tenancy).

## Running in VS Code

This repo ships with a `.vscode/` folder, so most of the setup is automatic:

1. Open the folder in VS Code (`code .` from a terminal, or File → Open Folder).
2. VS Code will prompt you to install the recommended extensions (Tailwind CSS
   IntelliSense, ESLint, Prettier, Path Intellisense, Error Lens). Accept it —
   without the ESLint/Prettier extensions, format-on-save won't work.
3. Copy `.env.local.example` to `.env.local` and fill in your Supabase values
   (see Setup above).
4. Run **Terminal → Run Task → dev** (or just `npm run dev` in the integrated
   terminal) to start the dev server at `localhost:3000`.
5. **Run and Debug** panel (`Cmd/Ctrl+Shift+D`) has three ready-made configs:
   - **Next.js: debug server-side** — breakpoints in API routes, server
     components, and `middleware.ts` all work.
   - **Next.js: debug client-side (Chrome)** — breakpoints in `"use client"`
     components; requires the dev server already running.
   - **Next.js: debug full stack** — starts the dev server and attaches
     Chrome automatically once it's ready.

Saving a file auto-formats it with Prettier (Tailwind classes get sorted
automatically) and auto-fixes ESLint issues. `npm run lint`, `npm run
format`, and `npm run type-check` are also available from the terminal or
via **Terminal → Run Task**.

## Setup

1. **Install deps**
   ```
   npm install
   ```

2. **Create a Supabase project** at supabase.com, then run the migrations
   in order:
   - Open the SQL editor in your Supabase dashboard
   - Run `supabase/migrations/0001_init.sql`
   - Run `supabase/migrations/0002_theme_and_settings.sql`
   - Run `supabase/migrations/0003_password_and_notify.sql`
   - Run `supabase/migrations/0004_folders.sql`
   - (Or, if you use the Supabase CLI: `supabase db push`)

3. **Enable email auth** in Supabase → Authentication → Providers (Email is
   on by default; magic-link sign-in is what this starter uses).

4. **Env vars** — copy `.env.local.example` to `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — from
     Supabase → Settings → API
   - `SUPABASE_SERVICE_ROLE_KEY` — same page. **Never** expose this to the
     client; it's only read in server-only route handlers.

5. **Run it**
   ```
   npm run dev
   ```

6. **(Optional) Email notifications on new submissions** — deploy the Edge
   Function and wire it up:
   ```
   supabase functions deploy notify-submission
   supabase secrets set RESEND_API_KEY=your_resend_key
   supabase secrets set NOTIFY_FROM_EMAIL=notifications@yourdomain.com
   ```
   Then either:
   - **Dashboard route (simplest):** Database → Webhooks → new webhook on
     `responses`, event = INSERT, target = the deployed function URL.
   - **SQL route:** uncomment the `pg_net` trigger block at the bottom of
     `supabase/migrations/0003_password_and_notify.sql` and fill in your
     project ref + key.
   Without this step, the "Notify by email" field in a form's Settings tab
   is saved but has no effect — the app still works fine without it.

## How it's structured

- `components/AppShell.tsx` — the sidebar shell (Home / Submissions /
  Analytics) shared by every authenticated page.
- `lib/schema.ts` — the single source of truth for what a "field" is. All 14
  field types (including the structural `page_break` type), the Zod
  validator generator, conditional-visibility logic, accent theme presets,
  and the `splitIntoPages` helper used for multi-page rendering.
- `lib/password.ts` — the one-way hash used for password-protected forms.
- `lib/templates.ts` — the 31-template gallery across 12 categories
  (registration, HR, feedback, marketing, sales, events, education,
  healthcare, hospitality, real estate, support, non-profit). Each template is
  just a list of pre-built, realistic fields (with real dropdown/radio
  options, required flags, placeholders) handed to the create-form API; some
  are marked `featured` for the dashboard hero and the gallery's Popular row.
- `components/builder/FormBuilder.tsx` — the tabbed builder:
  - **Fields** — drag-and-drop canvas, icon palette, inline
    duplicate/required/delete actions, plus page-break markers.
  - **Rules** — every conditional "show field X if Y" rule on the form,
    listed centrally; click one to jump to that field's editor.
  - **Settings** — confirmation message, redirect URL, notification email,
    password protection, response limits, and close-by-date — persisted
    and **enforced server-side** (see below), not just cosmetic.
  - **Themes** — pick an accent color, applied via a `--accent` CSS
    variable so it flows through the builder preview, the public form, and
    dashboard cards without hardcoded per-theme class lists.
  - **Share** — the public link and a real, generated, downloadable QR
    code (`qrcode` npm package).
- `components/renderer/FormRenderer.tsx` — turns a schema into an actual,
  paginated form. Used by both the builder's live preview and the public
  form page.
- `components/AppShell.tsx` + `components/FoldersSidebar.tsx` — the app-level
  sidebar hosts **Folders** (create/rename/delete, per-folder form counts,
  drag a form card from the dashboard grid onto a folder to file it, with an
  "Uncategorized" catch-all). Selecting a folder filters the dashboard via
  `/dashboard?folder=<id>`.
- `app/dashboard/` — form cards grid (with per-form theme accent and page
  count), a Zoho-style **template gallery modal** (search, category sidebar
  with counts, featured row, and a per-template field preview before you
  create), plus one-click quick-create chips in the hero, and workspace
  overview stats.
- `app/api/folders/` — CRUD for folders, owner-scoped via the same RLS
  pattern as forms. Deleting a folder doesn't delete its forms — they fall
  back to Uncategorized automatically (`on delete set null` on
  `forms.folder_id`).
- `app/submissions/` and `app/analytics/` — real per-form data: a
  searchable response table with CSV export, and KPI cards / charts
  computed from actual response rows.
- `app/f/[id]/` — the public form. Pre-checks closure conditions and the
  password gate before rendering anything, so visitors see a clear message
  instead of filling out a form that will reject them on submit.
- `app/api/forms/[id]/submit/route.ts` — re-validates every submission
  server-side against the form's schema, checks the form is published,
  **enforces the password gate, `closeDate`, and `maxResponses`** (the
  latter via a live count, not a cached number), rate-limits by IP, and
  silently drops honeypot-triggered bot submissions.
- `app/api/forms/[id]/verify-password/route.ts` — the only route allowed to
  read a form's `password_hash` (via the service client). On a correct
  password it sets an httpOnly cookie scoped to that form; the hash is
  never sent to the browser in either direction.
- `supabase/functions/notify-submission/` — the Edge Function that sends
  the actual notification email via Resend when a response comes in.
- `supabase/migrations/` — `0001_init.sql` sets up `forms` + `responses`
  with row-level security; `0002` adds the `theme` column; `0003` adds
  `password_hash` and **revokes SELECT on it for anon/authenticated at the
  database level** — not just "the app chooses not to query it" — so a form
  owner's password can't leak even via a direct Supabase client call from
  the browser.

## Known gaps to close before shipping

- **Rate limiting** in the submit route is in-memory (`Map`) — fine for one
  dev server, useless across multiple deployed instances. Swap in Upstash
  Redis or similar.
- **File uploads** are stubbed (just capture the filename). Wire them to
  Supabase Storage with signed upload URLs before relying on this field type.
- **Password hashing** is a single unsalted SHA-256 pass (see
  `lib/password.ts`) — fine as a "keep casual visitors out" gate, not
  intended as a vault. Swap in bcrypt/argon2 (via an Edge Function, since
  those aren't available in the Node runtime used by API routes here
  without a native module) if you need stronger guarantees.
- **Email notifications** require deploying the Edge Function and wiring a
  Database Webhook — see step 6 above. Without it, the field is saved but
  silently has no effect.
- **Teams/workspaces** aren't modeled — every form has a single `owner_id`.
