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
   on by default). For the fastest, Zoho-style sign-up experience — where a
   new user lands straight in the dashboard — turn **off** the "Confirm email"
   toggle under the Email provider's settings. If you leave it on, new users
   get a confirmation email before they can sign in (the app handles both
   cases).

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

7. **Webhooks & deadline auto-close** — apply `supabase/migrations/0007_webhooks.sql`
   and set `CRON_SECRET` in `.env.local`. On Vercel, `vercel.json` registers an
   hourly cron (`/api/cron/webhooks`) that flips due forms to `closed` and fires
   their "on deadline" webhooks. You can trigger it manually at any time:
   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" https://your-deploy.vercel.app/api/cron/webhooks
   ```

## Webhooks & integrations

Forms can register webhooks under **Builder → Integrations**. Each webhook
POSTs a JSON payload to your endpoint, and you choose which events trigger it:

- **On submit (per record)** — fires once for every response as it's recorded.
- **On deadline** — fires once, after the form's close date passes and the form
  is auto-closed (hourly scheduler; retried until it succeeds).

Every request is a `POST` with a JSON body. Headers:

- `Content-Type: application/json`
- `X-FormCraft-Event` — `submission`, `deadline`, or `test`
- `X-FormCraft-Webhook-Id` — the webhook that fired
- `X-FormCraft-Signature` — `sha256=<hex>` HMAC of the **exact raw body** (only
  sent if you configured a signing secret)

### Example payload (submission)

```json
{
  "event": "submission",
  "form": { "id": "...", "title": "Event registration", "schemaVersion": 3 },
  "response": {
    "id": "...",
    "createdAt": "2025-08-29T10:00:00.000Z",
    "answers": { "fieldId1": "Ada Lovelace", "fieldId2": "ada@example.com" }
  },
  "fields": [
    { "id": "fieldId1", "label": "Full name", "value": "Ada Lovelace" },
    { "id": "fieldId2", "label": "Email", "value": "ada@example.com" }
  ]
}
```

### Verifying the signature (Node.js)

```js
import { createHmac, timingSafeEqual } from "crypto";

const signature = req.headers["x-formcraft-signature"].replace("sha256=", "");
const expected = createHmac("sha256", process.env.FORMCRAFT_WEBHOOK_SECRET)
  .update(rawBody) // the exact raw body string, not re-stringified
  .digest("hex");
if (!timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
  return res.status(401).end();
}
```

Delivery attempts are logged in the `webhook_deliveries` table and viewable in
the Integrations tab (status code, latency, error). Add a webhook, hit **Test**,
and check **Recent deliveries** to confirm everything works end-to-end.

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
  sidebar hosts Home, **All forms**, Submissions and Analytics, plus the
  **Folders** list (create/rename/delete, per-folder form counts, drag a form
  card onto a folder to file it, with an "Uncategorized" catch-all, and a "+"
  on each folder to start a new form inside it). Selecting a folder filters the
  All forms page via `/forms?folder=<id>`.
- `app/dashboard/` — the **Home** page: a hero with quick-create chips and
  template gallery modal, a **Recent forms** grid (the 4 most recently updated
  forms for quick access) linking to `/forms`, workspace overview stats.
- `app/forms/` — the **All forms** page: every form as a folder-filterable,
  drag-to-folder grid with create (scoped to the active folder when browsing
  one), delete, and drag-to-move; uses the shared template gallery modal.
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
- **File uploads** store to a private Supabase Storage bucket
  (`form-attachments`) with per-file metadata and per-form storage tracking;
  downloads go through owner-only signed URLs (see the file-upload migrations).
- **Password hashing** is a single unsalted SHA-256 pass (see
  `lib/password.ts`) — fine as a "keep casual visitors out" gate, not
  intended as a vault. Swap in bcrypt/argon2 (via an Edge Function, since
  those aren't available in the Node runtime used by API routes here
  without a native module) if you need stronger guarantees.
- **Email notifications** require deploying the Edge Function and wiring a
  Database Webhook — see step 6 above. Without it, the field is saved but
  silently has no effect.
- **Teams/workspaces** aren't modeled — every form has a single `owner_id`.
