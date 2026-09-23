// Single source of truth for the public /docs page.
//
// Everything numeric or label-like is derived from the module that actually
// enforces it (lib/schema.ts, lib/templates.ts, lib/plans.ts) so the docs can
// never quote a field type, theme, template count or plan limit the product
// doesn't ship — the same "no drift" rule components/landing/Pricing.tsx and
// LandingTemplates.tsx follow.
//
// Deliberately serializable (plain strings and arrays, no functions or JSX)
// because the sticky sidebar is a client component that receives this data as
// props — same server/client boundary constraint as lib/templates.ts.
//
// Inline code is written between backticks (`like this`) and rendered by the
// page's <Inline> helper; that's the only markup the strings carry.

import { FIELD_GROUPS, FIELD_LABELS, THEMES, WEBHOOK_EVENT_LABELS, type FieldType, type ThemeKey } from "@/lib/schema";
import { TEMPLATES } from "@/lib/templates";
import { ORG_PLAN_ORDER, PLAN_ORDER, PLANS, formatBytes } from "@/lib/plans";

export interface DocCodeBlock {
  label: string;
  code: string;
}

export interface DocTable {
  headers: string[];
  rows: string[][];
}

export interface DocFact {
  term: string;
  detail: string;
}

export interface DocArticle {
  id: string;
  title: string;
  /** Intro paragraphs, rendered above the structured blocks. */
  body?: string[];
  /** Ordered how-to steps. */
  steps?: string[];
  /** Plain bullet points. */
  bullets?: string[];
  /** Term/detail pairs, rendered as a definition list (great for headers). */
  facts?: DocFact[];
  code?: DocCodeBlock[];
  table?: DocTable;
  /** Highlighted aside. */
  note?: string;
}

export interface DocSection {
  id: string;
  title: string;
  summary: string;
  articles: DocArticle[];
}

/** The slim shape the client sidebar needs (no article bodies). */
export interface DocNavSection {
  id: string;
  title: string;
  articles: { id: string; title: string }[];
}

/* ------------------------------------------------------------------ derived */

const nf = new Intl.NumberFormat("en-US");

/** -1 means "unlimited" throughout lib/plans.ts. */
const count = (n: number) => (n === -1 ? "Unlimited" : nf.format(n));

const TEMPLATE_COUNT = TEMPLATES.length;
const CATEGORY_COUNT = new Set(TEMPLATES.map((t) => t.category)).size;
const FIELD_COUNT = FIELD_GROUPS.reduce((n, g) => n + g.types.length, 0);
const THEME_NAMES = (Object.keys(THEMES) as ThemeKey[]).map((k) => THEMES[k].label).join(", ");

/** One line per field type; the table is generated so no type is ever missed. */
const FIELD_HELP: Record<FieldType, string> = {
  short_text: "One line of text — names, titles, short answers.",
  long_text: "A multi-line paragraph for open-ended answers.",
  email: "Validated email address. This is also the address confirmation emails reply to.",
  phone: "Phone number. Ugandan mobile shapes are canonicalised to `+256…`; other numbers are kept as typed.",
  number: "Numeric input, validated as a number.",
  url: "Validated web address.",
  single_select: "Pick exactly one option (radio buttons).",
  multi_select: "Pick any number of options (checkboxes).",
  dropdown: "Pick one option from a compact list.",
  rating: "A score out of five — useful for satisfaction and NPS-style questions.",
  date: "Calendar date.",
  time: "Time of day.",
  checkbox: "A single yes/no box for consent or acknowledgement.",
  file: "Upload documents or images, stored privately with signed-URL downloads.",
  payment: "Collect a payment where MarzPay is configured for the deployment.",
  page_break: "Structural marker: splits the form into pages and collects no answer.",
};

const fieldRows = FIELD_GROUPS.flatMap((group) =>
  group.types.map((type) => [FIELD_LABELS[type], group.label, FIELD_HELP[type]])
);

const personalPlanRows = PLAN_ORDER.map((id) => {
  const p = PLANS[id];
  return [
    p.name,
    p.priceMonthly === 0 ? "Free" : `$${p.priceMonthly} / month`,
    count(p.limits.forms),
    count(p.limits.monthlyResponses),
    formatBytes(p.limits.storageBytes),
    count(p.limits.creditsPerMonth),
  ];
});

const orgPlanRows = ORG_PLAN_ORDER.map((id) => {
  const p = PLANS[id];
  return [
    p.name,
    p.priceMonthly === 0 ? "Free" : `$${p.priceMonthly} / month`,
    count(p.limits.forms),
    count(p.limits.monthlyResponses),
    formatBytes(p.limits.storageBytes),
    count(p.limits.members),
  ];
});

const PLAN_HEADERS = ["Plan", "Price", "Forms", "Responses / month", "Storage", "AI credits / month"];
const ORG_PLAN_HEADERS = ["Plan", "Price", "Forms", "Responses / month", "Storage", "Members"];

const WORKFLOW_ROWS = [
  [
    "Send email notification",
    "Emails you — or an address you set — when the form receives a response. Falls back to the form's notification address.",
  ],
  ["Send confirmation email", "Confirms the submission to the respondent, when the form collected their address."],
  ["Add a webhook", "POSTs the same signed submission payload the form-level webhooks send, to a URL you set."],
  [
    "Update internal status",
    "Moves the response to New, In Progress, Completed or Archived. The status is visible in the responses table.",
  ],
  ["Assign to a team member", "Routes the response to one active member of the organisation workspace."],
  ["Notify the team", "Writes to the header bell for everyone with access, or for the members you pick."],
];

/* ------------------------------------------------------------------ content */

const GETTING_STARTED: DocSection = {
  id: "getting-started",
  title: "Get started",
  summary: "From a blank account to a published, shared form.",
  articles: [
    {
      id: "create-account",
      title: "Create your account and workspace",
      body: [
        "Sign up with an email and password. New accounts go through a short onboarding flow that asks about your organisation, so your workspace, defaults and reporting are right from the start — everything it sets can be changed later in Settings.",
        "If email confirmation is switched on for this deployment, confirm your address before signing in; otherwise you land straight in your workspace.",
      ],
      steps: [
        "Open `/signup` and create an account.",
        "Complete onboarding. Your workspace is created for you.",
        "Signed-in visitors return through `/dashboard`.",
      ],
      facts: [
        {
          term: "Personal or organisation",
          detail:
            "Individual accounts get a personal workspace. Organisation workspaces add shared members, roles, folders and an activity log.",
        },
      ],
    },
    {
      id: "first-form",
      title: "Build and publish your first form",
      steps: [
        "From the dashboard choose New form — start blank or pick a template.",
        "Add fields on the Fields tab: drag from the palette, or click a field type to append it.",
        "Set each field's label, help text, placeholder and required flag in the field editor.",
        "Optionally add conditional rules on the Rules tab, and split long forms with a Page Break.",
        "Set the confirmation message, redirect, notification email, response limit, close date or password on the Settings tab.",
        "Pick an accent colour on the Themes tab and check the live preview.",
        "Publish, then copy the link, QR code or embed snippet from the Share tab.",
      ],
      note: "The builder autosaves as you work — there is no separate save button to forget. A form is only publicly reachable once it is published.",
    },
  ],
};

const BUILD: DocSection = {
  id: "build",
  title: "Build forms",
  summary: `Every field type, rule and theme the builder ships — ${FIELD_COUNT} field types across ${FIELD_GROUPS.length} groups.`,
  articles: [
    {
      id: "fields",
      title: "Field types",
      body: [
        `Forms are assembled from the same catalogue the builder, the renderer and the server-side validator all read from: ${FIELD_COUNT} types across ${FIELD_GROUPS.length} groups.`,
      ],
      table: { headers: ["Field", "Group", "What it is for"], rows: fieldRows },
      bullets: [
        "Every field can be required, and can carry help text and a placeholder.",
        "Choice fields (Radio buttons, Checkboxes, Dropdown) get real options you can add, rename and reorder.",
        "The File and Payment fields expose extra configuration — accepted types and size limits, or amount and currency.",
        "Page Break is structural: it splits the form into pages and never produces an answer.",
      ],
    },
    {
      id: "rules",
      title: "Conditional rules (show a field if…)",
      body: [
        "A field can appear or disappear based on earlier answers. Open the field editor and add one or more rules. Every rule must pass — they are combined with AND, not OR.",
      ],
      table: {
        headers: ["Operator", "Matches when"],
        rows: [
          ["equals", "the answer is exactly the value you typed."],
          ["not_equals", "the answer is anything else."],
          ["contains", "a text answer contains the value."],
        ],
      },
      bullets: [
        "Rules read fields that come earlier in the form; a field can't depend on a question below it.",
        "The Rules tab lists every rule on the form in one place — click a rule to jump straight to its field.",
        "A hidden field is skipped by validation and is not part of the stored answers.",
      ],
    },
    {
      id: "multi-page",
      title: "Multi-page forms",
      body: [
        "Drop a Page Break where a new page should start. The Page Break's label becomes the page title, and respondents can move back and forth before submitting.",
      ],
      bullets: [
        "The first page has no separate title — it uses the form title.",
        "Each page is validated before the respondent can continue, so nobody can skip a required question by moving forward.",
        "A page indicator shows where the respondent is, on the public page and in the embed widget alike.",
      ],
    },
    {
      id: "themes",
      title: "Accent colours",
      body: [
        `Choose one of the ${(Object.keys(THEMES) as ThemeKey[]).length} accent presets on the Themes tab: ${THEME_NAMES}. The choice is saved on the form.`,
      ],
      bullets: [
        "The accent is applied through a single CSS custom property, so the builder preview, the public page and the embed widget always match.",
        "The theme belongs to the form, not the account — different forms can use different accents.",
      ],
    },
    {
      id: "templates",
      title: "Templates",
      body: [
        `The gallery ships ${TEMPLATE_COUNT} ready-to-use templates across ${CATEGORY_COUNT} categories — registration, HR, feedback, marketing, sales, events, education, healthcare, hospitality, real estate, support and non-profit.`,
        "Every template is a set of real fields with real options and sensible required flags. Pick one and it opens in the builder, ready to edit.",
      ],
      bullets: [
        "Browse them from the dashboard gallery, or from the public `/templates` page before you sign up.",
        "Templates are starting points — nothing about them is locked.",
      ],
    },
    {
      id: "ai",
      title: "AI assistance while you build",
      body: [
        "The AI tab works on the form you are editing. AI runs on the deployment's own OpenAI-compatible key, and every AI action is metered in credits from the workspace wallet.",
      ],
      table: {
        headers: ["Action", "What it does"],
        rows: [
          ["Generate a form", "Describe the form in plain English and get real fields back, added to the builder."],
          ["Import a form", "Upload a photo or scan, a PDF or a Word document and turn it into editable fields."],
          ["Improve", "Rewrite labels, help text and options so the questions read better."],
          ["Critique", "Review the form before publishing and flag structure or clarity problems."],
        ],
      },
      note: "If this deployment has no AI key configured, AI requests answer `503 AI isn't configured yet`. That is a setup step, not a bug — set `AI_API_KEY` (plus `AI_BASE_URL` / `AI_MODEL` if you are not using the defaults) and redeploy.",
    },
  ],
};

const SHARE: DocSection = {
  id: "share",
  title: "Share and embed",
  summary: "Send a form anywhere: public link, QR code, script embed or iframe.",
  articles: [
    {
      id: "sharing",
      title: "Public link and QR code",
      body: [
        "Every published form has a public URL at `/f/<form-id>`. Open the Share tab in the builder to copy it, or download a QR code as a PNG for print, signage and handouts.",
      ],
      bullets: [
        "Only published forms resolve publicly — drafts stay private to your workspace.",
        "The QR code points at the same link, so editing the form changes what the code opens.",
        "The Share tab also writes the embed code for you; set a height and copy the snippet.",
      ],
    },
    {
      id: "embedding",
      title: "Embed a form in your own website",
      body: [
        "Embedding puts the live form inside your page, so visitors never leave your site. The Share tab generates the code for you — pick a height, then copy either the script or the iframe version.",
        "The script embed is recommended: it renders responsively and grows to fit its content, so long or multi-page forms never get cut off.",
      ],
      code: [
        {
          label: "Script embed (recommended)",
          code: `<script
  src="https://your-domain.com/widgets/easyform.js"
  data-form-id="YOUR_FORM_ID"
  data-height="640"
  async
></script>`,
        },
        {
          label: "iframe embed",
          code: `<iframe
  src="https://your-domain.com/widgets/form.html?form=YOUR_FORM_ID"
  width="100%"
  height="640"
  style="border:0;overflow:hidden"
  loading="lazy"
  allow="camera; microphone"
  title="Contact form"
></iframe>`,
        },
        {
          label: "Programmatic mount",
          code: `<div id="my-form"></div>
<script src="https://your-domain.com/widgets/easyform.js" async></script>
<script>
  window.EasyForm.mount(document.getElementById("my-form"), "YOUR_FORM_ID", {
    height: 640,
  });
</script>`,
        },
      ],
      table: {
        headers: ["Where", "How to add it"],
        rows: [
          ["Plain HTML / static site", "Paste the snippet where the form should appear."],
          [
            "Website builders (WordPress, Webflow, Squarespace)",
            "Add a Custom HTML or Embed block and paste the snippet.",
          ],
          [
            "React",
            "Render the iframe snippet in JSX, or inject the script in a `useEffect` when the component mounts.",
          ],
          [
            "Next.js",
            'Use the iframe snippet as JSX, or load the script with `next/script` and `strategy="afterInteractive"`.',
          ],
        ],
      },
      bullets: [
        "No plugins or frameworks are needed — the snippet is plain HTML, so it drops into any site.",
        "The loader reads its own `src` to work out the deployment origin, so localhost, a preview URL and a custom domain all work with no configuration.",
        "The child widget posts an `easyform:resize` message, which is how the script embed resizes itself to fit its content. A plain iframe keeps whatever height you set.",
        '`allow="camera; microphone"` matters on the iframe embed when the form has File or photo fields.',
        "`window.EasyForm.version` reports the loader version (`1.0.0`).",
      ],
      note: "Only published forms render in an embed — the embed endpoint returns 404 for a draft. The embed payload carries display data only: never the password hash, your notification address or any webhook secret. Password-protected forms work in embeds too: the widget forwards the access token with the submission instead of relying on a cookie, because third-party cookies are blocked inside iframes.",
    },
  ],
};

const COLLECT: DocSection = {
  id: "collect",
  title: "Responses and analytics",
  summary: "Read, search, export and interrogate what came in.",
  articles: [
    {
      id: "responses",
      title: "The responses table",
      body: [
        "Responses is scoped to one form at a time — pick the form, then work through its answers. The table is searchable and exportable, and every response carries an internal status that workflows can set.",
      ],
      bullets: [
        "Search across a form's responses and export them to CSV.",
        "Each response has an internal status: New, In Progress, Completed or Archived.",
        "Open a response to see every answer, including uploaded files.",
        "The AI Analysis tab sits alongside the table, in the same per-form context.",
      ],
    },
    {
      id: "analytics",
      title: "Analytics",
      body: [
        "Analytics turns submissions into KPI cards and charts computed from the actual response rows — not from a cached number, so the figures always match what you can see in the table.",
      ],
      bullets: [
        "KPI cards cover things like total responses, completion and how many fields are conditional.",
        "Generate insights runs an AI pass over the form and its data to summarise what stands out.",
        "Insights are cached per form, so re-opening the view is cheap.",
      ],
    },
    {
      id: "ai-ask",
      title: "Ask your data",
      body: [
        "The AI Analysis tab in Responses answers plain-English questions about one form's submissions. It reads the real responses and answers with counts, tables and charts rather than a wall of text.",
      ],
      bullets: [
        "One form per question — the selector chooses which form the AI is looking at.",
        "Export the rows behind an answer as CSV, or as an Excel-compatible file where the AI ran a query.",
        "If a question references something the form does not collect, the AI asks you to rephrase instead of inventing an answer.",
        "AI questions are metered in credits like every other AI action.",
      ],
    },
    {
      id: "files",
      title: "Files and uploads",
      body: [
        "File fields upload to a private storage bucket. Each file is tracked with its own metadata, and the Files page lists what has been collected across your workspace.",
      ],
      bullets: [
        "Files are never publicly readable — there is no plain public URL, only short-lived signed download links generated for you.",
        "Uploads are checked against the field's accepted types and size limits before they land.",
        "Uploads count toward your plan's storage allowance and are tracked per form.",
      ],
    },
  ],
};

const WORKFLOWS_ARTICLE: DocArticle = {
  id: "workflows",
  title: "Workflows: one trigger, up to five actions",
  body: [
    "Workflows live under Workflows in the sidebar. Choose a trigger — a new response on one form, or on any form in the workspace — then add up to five actions, in order.",
  ],
  table: { headers: ["Action", "What it does"], rows: WORKFLOW_ROWS },
  bullets: [
    "Every action is isolated and best-effort: a bad URL, a missing email key or a stale assignee is written to the run log, and the respondent's submission still succeeds.",
    "Runs happen exactly once per response — the run log is unique per workflow and response, so a retried submission can never assign or email twice.",
    "A run costs 1 credit, and each email actually sent costs 1 credit. A workspace that can't afford it simply isn't charged, and the workflow still runs.",
    "Results reach people through the header bell, and every run is recorded in the workspace activity log.",
  ],
  note: 'Email actions need `RESEND_API_KEY` plus a sender address (`DEFAULT_FROM_EMAIL`), and the sending domain must be verified with the email provider. Without that key the action reports "email is not configured" in the run log instead of failing the submission.',
};

const WEBHOOK_CODE: DocCodeBlock[] = [
  {
    label: "Payload — submission",
    code: `{
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
  ],
  "meta": { "userAgent": "Mozilla/5.0 ..." }
}`,
  },
  {
    label: "Payload — deadline",
    code: `{
  "event": "deadline",
  "form": { "id": "...", "title": "Event registration", "closeDate": "2025-09-30" },
  "responseCount": 128,
  "createdAt": "2025-10-01T00:00:00.000Z"
}`,
  },
  {
    label: "Verify the signature (Node.js)",
    code: `// Header: X-FormCraft-Signature: sha256=<hex>
import { createHmac, timingSafeEqual } from "crypto";

const secret = process.env.FORMCRAFT_WEBHOOK_SECRET;
const signature = req.headers["x-formcraft-signature"].replace("sha256=", "");
const expected = createHmac("sha256", secret)
  .update(rawBody) // the EXACT raw request body, not a re-stringified copy
  .digest("hex");

if (!timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
  return res.status(401).end(); // not from us — reject
}`,
  },
  {
    label: "Try it from your terminal",
    code: `curl -X POST https://your-endpoint.example.com/hook \\
  -H "Content-Type: application/json" \\
  -H "X-FormCraft-Event: submission" \\
  -d '{"event":"submission","form":{"title":"Event registration"}}'`,
  },
];
const WEBHOOK_BULLETS: string[] = [
  "Requests time out after 8 seconds. Any 2xx status code counts as success.",
  "Submission webhooks are fire-once — a failed attempt is logged but not retried. Deadline webhooks are retried hourly by the scheduler until they succeed, and never fire twice for the same deadline.",
  "Every attempt is recorded in the delivery log and shown under Recent deliveries with its status code and latency.",
  "Signing secrets are only ever sent outbound. They are never exposed on the public form, in the embed payload, or to anyone without access to the form.",
  "A workflow's webhook action reuses this same signed payload, timeout and delivery log, so one verification routine covers both.",
];

const WEBHOOK_NOTE =
  "Send a Test from the webhook card before relying on real data: it posts the same signed payload using your latest real response as the sample (or a mock built from the form's fields if there are no responses yet). If nothing arrives, check Recent deliveries first — it records the status code and error for every attempt.";

const WEBHOOKS_ARTICLE: DocArticle = {
  id: "webhooks",
  title: "Webhooks: push submissions into your own systems",
  body: [
    "A webhook POSTs each submission to a URL you control, so your CRM, helpdesk, spreadsheet or internal service can react the moment a response arrives. Webhooks are configured per form in the builder, under Integrations.",
  ],
  steps: [
    "Pick an endpoint that accepts HTTPS POST requests.",
    "Open the Integrations tab in the builder and click Add webhook.",
    "Paste the URL and choose when it fires — On submit, On deadline, or both.",
    "Add a signing secret if you want to prove a request really came from this form (recommended).",
    "Click Test on the webhook card, then check Recent deliveries for the status code and latency.",
  ],
  table: {
    headers: ["Event", "Fires when"],
    rows: [
      [
        WEBHOOK_EVENT_LABELS.submission,
        "Once per response, as soon as it is recorded. Use it for real-time CRM pushes, chat notifications and internal queues.",
      ],
      [
        WEBHOOK_EVENT_LABELS.deadline,
        "Once, after the form's close date passes and the form is auto-closed. Use it to hand over a final report when a survey ends.",
      ],
      ["test", "Only when you press Test — never for real data."],
    ],
  },
  facts: [
    { term: "Method and body", detail: "`POST` with a JSON body (`Content-Type: application/json`)." },
    { term: "X-FormCraft-Event", detail: "`submission`, `deadline` or `test`." },
    { term: "X-FormCraft-Webhook-Id", detail: "the id of the webhook that fired." },
    {
      term: "X-FormCraft-Signature",
      detail: "`sha256=<hex>` — an HMAC-SHA256 of the exact raw body. Only sent when the webhook has a secret.",
    },
  ],
  code: WEBHOOK_CODE,
  bullets: WEBHOOK_BULLETS,
  note: WEBHOOK_NOTE,
};

const AUTOMATE: DocSection = {
  id: "automate",
  title: "Automate",
  summary: "Workflows inside the workspace, webhooks out to everything else.",
  articles: [WORKFLOWS_ARTICLE, WEBHOOKS_ARTICLE],
};

const USE_CASES: DocSection = {
  id: "use-cases",
  title: "Use cases",
  summary: "Six end-to-end setups, built only from features that ship today.",
  articles: [
    {
      id: "use-event-registration",
      title: "Event registration with instant confirmations",
      body: [
        "Collect registrations, confirm every attendee automatically, and push each signup into your CRM or spreadsheet without exporting anything by hand.",
      ],
      steps: [
        "Start from the Event registration template — it already has Text, Email, Dropdown and Checkbox fields.",
        "Settings: write a confirmation message, set a close date for registrations, and turn on the response limit if seats are capped.",
        "Workflows: add Send confirmation email and Notify the team.",
        "Integrations: add a webhook for On submit pointed at your CRM, and one for On deadline so the final attendee count lands when registration closes.",
        "Share: download the QR code for printed signage and post the link wherever you are promoting the event.",
      ],
    },
    {
      id: "use-lead-capture",
      title: "Lead capture on a marketing site",
      body: ["Put the form inside your own site and have leads routed to sales the second they arrive."],
      steps: [
        "Build a short form: Text, Email, Phone, and a Dropdown for budget or interest.",
        "Publish it, then paste the script embed from the Share tab into your site's HTML.",
        "Workflows: Assign to a team member, Notify the team, and Update internal status to New.",
        "Integrations: add a webhook for On submit to your CRM, or to a chat tool's incoming-webhook URL.",
      ],
      note: "Keep it short. The script embed resizes to fit its content, so a two-field form stays a two-field form instead of leaving a tall empty box on the page.",
    },
    {
      id: "use-feedback-intake",
      title: "Support and product feedback intake",
      body: [
        "One form for everything, triaged automatically, then summarised with AI when you want the themes rather than the individual messages.",
      ],
      steps: [
        "Fields: Rating, Dropdown (topic), Paragraph (what happened), and File for a screenshot.",
        "Settings: set a confirmation message, and enable password protection if only staff should reach the form.",
        "Workflows: Update internal status to New and Notify the team on every response.",
        "Later, open Responses → AI Analysis and ask which complaints come up most; export the rows behind the answer.",
      ],
      note: "Screenshots stay private: reviewers open them through short-lived signed download links, not public URLs.",
    },
    {
      id: "use-job-applications",
      title: "Job applications with private files",
      body: ["Collect CVs, portfolios and cover letters without exposing anyone's documents."],
      steps: [
        "Fields: Text (full name), Email, Phone, Dropdown (role), and File for the CV and portfolio.",
        "Settings: set a close date so the posting archives itself, plus a response limit if you expect a flood.",
        "Workflows: Send confirmation email to the applicant, and Notify the team so the hiring manager sees each one.",
        "Review downloads go through signed links generated for your workspace only.",
      ],
      note: "Use the File field's accepted-types and size limits so applicants cannot attach an unreadable 200 MB file.",
    },
    {
      id: "use-post-event-survey",
      title: "Post-event survey that closes and reports itself",
      body: ["Send a survey when the event ends and let the deadline webhook hand you the wrap-up."],
      steps: [
        "Fields: Rating (overall), Rating (venue), Radio buttons (would you attend again?), and a Paragraph for anything else.",
        "Settings: turn on Close on date and pick the day the survey should stop accepting responses.",
        "Integrations: add a webhook for On deadline pointing at the channel or endpoint that should receive the final count.",
        "Read the trends in Analytics, or ask the AI Analysis tab a plain-English question such as what people liked most.",
      ],
    },
    {
      id: "use-paid-workshop",
      title: "Paid workshop signup",
      body: ["Take payment and registration in a single form, wherever MarzPay is configured for the deployment."],
      steps: [
        "Add a Payment field with its amount and currency, then the attendee details.",
        "Settings: set the response limit to the number of seats, and a close date for the booking window.",
        "Workflows: Send confirmation email to the attendee and Notify the team.",
        "Integrations: add a webhook for On submit so your finance sheet or accounting tool sees each sale.",
      ],
      note: "Payment fields only work when the deployment has MarzPay configured. If it does not, leave the field out and collect payment elsewhere.",
    },
  ],
};

const SECURITY: DocSection = {
  id: "security",
  title: "Security, plans and access",
  summary: "How protection is enforced, what each plan includes, and how teams share a workspace.",
  articles: [
    {
      id: "protection",
      title: "How access and protection are enforced",
      bullets: [
        "Row Level Security in Postgres: every form, response, file and workflow row is scoped to the workspace that owns it, enforced in the database rather than only in the UI.",
        "Form passwords are stored as a hash, and the hash column is denied at the database level — so it cannot be read through a direct browser-side client call either.",
        "The submit endpoint re-validates every answer against the form's schema on the server, then enforces the password gate, close date and response limit before writing anything.",
        "Password protection, close dates and response limits cannot be bypassed by editing the page: they are checked server-side on submit.",
        "Submissions are rate-limited per IP and honeypot-protected. Bot submissions that trip the honeypot are dropped silently.",
        "Uploaded files live in a private bucket and are served only through short-lived signed URLs.",
      ],
      note: 'Self-hosting note: the built-in rate limiter is in-memory and per instance, so a multi-instance deployment should put a shared store (for example Redis) in front of it for strict limits. Form passwords are a "keep casual visitors out" gate rather than a vault — move hashing to bcrypt or argon2 if you need stronger guarantees.',
    },
    {
      id: "plans",
      title: "Plans and credits",
      body: [
        "Plans set the limits the product actually enforces — forms, monthly responses, storage, workflows, file uploads and AI credits. These are the same numbers the pricing page reads from.",
      ],
      table: { headers: PLAN_HEADERS, rows: personalPlanRows },
      bullets: [
        "Personal plans are for one person; organisation plans replace the member limit and are listed in the next article.",
        "Credit packs are available from the Wallet when AI credits, workflow runs or outgoing emails run low.",
        "AI actions, workflow runs and each email actually sent are metered in credits.",
      ],
    },
    {
      id: "organisations",
      title: "Organisation workspaces",
      body: [
        "An organisation workspace is shared: members, roles, folders, an activity log, and a plan sized for teams rather than individuals.",
      ],
      table: { headers: ORG_PLAN_HEADERS, rows: orgPlanRows },
      bullets: [
        "Members have roles and permissions; workflows can assign a response to an active member or notify specific people.",
        "The activity log records what happened and who did it. System events, such as a workflow firing, show no actor because nobody signed in.",
        "Folders organise forms without deleting anything — removing a folder returns its forms to Uncategorized.",
      ],
    },
  ],
};

const FAQ: DocSection = {
  id: "faq",
  title: "FAQ and troubleshooting",
  summary: "The handful of issues that account for almost every support question.",
  articles: [
    {
      id: "troubleshooting",
      title: "Common questions",
      facts: [
        {
          term: "AI buttons return `503 AI isn't configured yet`",
          detail:
            "This deployment has no AI key. Set `AI_API_KEY` (and `AI_BASE_URL` / `AI_MODEL` if you are not on the defaults) and redeploy.",
        },
        {
          term: "A workflow email action reports that email is not configured",
          detail:
            "Set `RESEND_API_KEY` and a sender address, and verify the sending domain. The workflow still runs — only the email step reports the miss.",
        },
        {
          term: "My form link returns 404",
          detail: "Only published forms are public. Publish the form from the builder.",
        },
        {
          term: "The embed shows nothing",
          detail:
            "Publish the form first — the embed endpoint returns 404 for drafts — then paste the snippet where it can actually load.",
        },
        {
          term: "Nothing arrived at my webhook",
          detail:
            "Press Test on the webhook card and read Recent deliveries. Your endpoint must answer within 8 seconds with a 2xx status.",
        },
        {
          term: "A submission webhook failed and never retried",
          detail:
            "Submission deliveries are fire-once by design and are recorded in the delivery log. Only deadline webhooks retry, hourly, until they succeed.",
        },
        {
          term: "Is there a REST API for creating forms?",
          detail:
            "No. The integration surface is webhooks going out, plus the public form and embed endpoints. Managing forms themselves happens in the workspace.",
        },
      ],
    },
  ],
};

/* -------------------------------------------------------------------- export */

export const DOC_SECTIONS: DocSection[] = [GETTING_STARTED, BUILD, SHARE, COLLECT, AUTOMATE, USE_CASES, SECURITY, FAQ];

/** Slim, serializable view for the sticky sidebar client component. */
export function docNavSections(): DocNavSection[] {
  return DOC_SECTIONS.map((section) => ({
    id: section.id,
    title: section.title,
    articles: section.articles.map((article) => ({ id: article.id, title: article.title })),
  }));
}
