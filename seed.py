#!/usr/bin/env python3
"""Seed "Computer Science Student Complaints" (20 fields) + 100 submissions.

Pushes realistic CS-student complaint responses into your Supabase project
using the service-role key (RLS bypassed - only run against YOUR project), so
the AI Analysis ("Ask your data") tab has filter/sort/group/aggregate data.

Setup
-----
Export in .env (the app already reads it) or as env vars:
    SUPABASE_URL=https://your-project.supabase.co   (or NEXT_PUBLIC_SUPABASE_URL)
    SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
    OWNER_EMAIL=mugumyadavis@gmail.com   # owner of the seeded form (default)

Usage
-----
    python3 seed.py                       # create the form + 100 responses
    python3 seed.py --dry-run             # print payloads, write nothing
    python3 seed.py --responses 50        # custom response count
    python3 seed.py --owner-email a@b.c   # override the owner account
    python3 seed.py --force               # clear existing form + responses, reseed

Stdlib only (urllib against PostgREST + the GoTrue admin API). Deterministic:
the generator is seeded so you can reproduce the same dataset.
"""

import argparse
import json
import os
import random
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

DEFAULT_TITLE = "Computer Science Student Complaints"
DEFAULT_RESPONSES = 100
SEED = 20240801
BATCH_SIZE = 25
TS_FMT = "%Y-%m-%dT%H:%M:%S.000Z"


def load_dotenv(path=".env"):
    """Read KEY=VALUE lines into os.environ (does not override real env vars)."""
    if not os.path.exists(path):
        return
    with open(path, "r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value


def api(method, url, token, body=None, expect_json=True, headers_extra=None):
    """Single request to the Supabase REST/admin API. Returns parsed body."""
    headers = {
        "apikey": token,
        "Authorization": "Bearer {}".format(token),
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    if headers_extra:
        headers.update(headers_extra)
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read()
            if not raw:
                return None
            return json.loads(raw.decode("utf-8")) if expect_json else raw.decode("utf-8")
    except urllib.error.HTTPError as err:
        detail = err.read().decode("utf-8", errors="replace")
        raise RuntimeError("HTTP {} from {}: {}".format(err.code, url, detail[:500])) from err

# ---------------------------------------------------------------------------
# Option sets for the schema (ids match builder conventions)
# ---------------------------------------------------------------------------

GENDERS = [("male", "Male"), ("female", "Female"), ("other", "Non-binary / other"), ("undisclosed", "Prefer not to say")]
YEARS = [("y1", "1st year"), ("y2", "2nd year"), ("y3", "3rd year"), ("y4", "4th year"), ("pg", "Postgraduate")]
COURSES = [
    ("cs", "Computer Science"),
    ("se", "Software Engineering"),
    ("is", "Information Systems"),
    ("cyber", "Cyber Security"),
    ("ds", "Data Science"),
]
MODES = [("full", "Full-time"), ("evening", "Evening"), ("distance", "Distance e-learning")]
CATEGORIES = [
    ("lecturing", "Lecturing & teaching"),
    ("content", "Course content & curriculum"),
    ("labs", "Labs & equipment"),
    ("internet", "Internet & Wi-Fi"),
    ("library", "Library services"),
    ("exams", "Exams & grading"),
    ("admin", "Registration & administration"),
    ("fees", "Fees & finance"),
    ("welfare", "Student welfare"),
    ("other", "Other"),
]
SEVERITIES = [("low", "Low"), ("med", "Medium"), ("high", "High"), ("urgent", "Urgent")]
FREQUENCIES = [("once", "First time"), ("occ", "Occasionally"), ("freq", "Frequently"), ("every", "Every session")]
CHANNELS = [
    ("rep", "Class representative"),
    ("portal", "Online complaint portal"),
    ("email", "Email"),
    ("walkin", "Walk-in office"),
    ("phone", "Phone call"),
]
DEPTS = [
    ("dean", "Dean's office"),
    ("it", "IT helpdesk"),
    ("exams", "Exams office"),
    ("registrar", "Registrar"),
    ("finance", "Finance office"),
    ("affairs", "Student affairs"),
    ("other", "Other"),
]
STATUSES = [
    ("not_ack", "Not acknowledged"),
    ("ack", "Acknowledged"),
    ("in_progress", "In progress"),
    ("resolved", "Resolved"),
    ("dismissed", "Dismissed"),
]


def opt(oid, label):
    return {"id": oid, "label": label}


def choice(fid, label, options, required=True):
    return {
        "id": fid,
        "type": "single_select",
        "label": label,
        "required": required,
        "options": [opt(o, l) for o, l in options],
    }


def dropdown(fid, label, options, required=True):
    return {
        "id": fid,
        "type": "dropdown",
        "label": label,
        "required": required,
        "options": [opt(o, l) for o, l in options],
    }


def build_schema():
    """Return the 20-field form schema exactly as the app stores it (JSONB)."""
    fields = [
        {"id": "full_name", "type": "short_text", "label": "Full name", "required": True},
        {"id": "reg_no", "type": "short_text", "label": "Registration number", "required": True},
        {"id": "email", "type": "email", "label": "Email address", "required": False},
        {"id": "phone", "type": "phone", "label": "Phone number", "required": False},
        choice("gender", "Gender", GENDERS),
        {"id": "age", "type": "number", "label": "Age", "required": True},
        dropdown("year_of_study", "Year of study", YEARS),
        choice("course", "Course / programme", COURSES),
        dropdown("study_mode", "Study mode", MODES),
        choice("category", "Complaint category", CATEGORIES),
        {"id": "complaint_text", "type": "long_text", "label": "Complaint details", "required": True},
        choice("severity", "Severity", SEVERITIES),
        dropdown("frequency", "How often it happens", FREQUENCIES),
        dropdown("channel", "How did you report it?", CHANNELS),
        choice("dept", "Department reported to", DEPTS),
        choice("resolution_status", "Resolution status", STATUSES),
        {"id": "date_reported", "type": "date", "label": "Date reported", "required": True},
        {"id": "expected_outcome", "type": "long_text", "label": "What outcome would fix this for you?", "required": False},
        {"id": "would_recommend", "type": "checkbox", "label": "Would you recommend this programme to a friend?", "required": False},
        {"id": "satisfaction", "type": "rating", "label": "Overall satisfaction", "required": False},
    ]
    return {"fields": fields}


# ---------------------------------------------------------------------------
# Content pools for realistic complaint responses
# ---------------------------------------------------------------------------

DEFAULT_OWNER_EMAIL = "mugumyadavis@gmail.com"

FIRST_MALE = ["John", "David", "Peter", "Ivan", "Brian", "Daniel", "Samuel", "Elijah", "Andrew", "Joseph", "James", "Mark", "Kevin", "Derrick", "Simon", "Emmanuel"]
FIRST_FEMALE = ["Sarah", "Grace", "Mary", "Jane", "Esther", "Ruth", "Alice", "Patience", "Aisha", "Nakato", "Doreen", "Joan", "Clare", "Brenda", "Martha", "Phiona"]
LAST = ["Kato", "Okello", "Mukasa", "Ssemakula", "Nambi", "Achieng", "Tumusiime", "Namugga", "Wasswa", "Lubega", "Ochieng", "Ampaire", "Byaruhanga", "Kizza", "Muwanga", "Nabirye", "Ssebunya", "Odongo", "Akello", "Kasujja", "Magezi", "Asiimwe"]

COMPLAINT_TEMPLATES = {
    "lecturing": [
        "The lecturer for our algorithms module cancels class at the last minute and no replacement session is ever scheduled, so we are behind the syllabus.",
        "The teaching assistant marks our code submissions without comments and only tells us they failed, which makes it impossible to learn from the mistakes.",
        "Lectures start twenty minutes late every week and end early, yet the coursework deadlines were never adjusted to match the lost time.",
    ],
    "content": [
        "Most of the database course content is from before 2019 and does not mention modern tools we will need in internships.",
        "The web development module teaches only theory; the practical labs use a framework that was deprecated two years ago.",
        "Course outlines promise cloud computing topics that were never covered, and nobody in the department has addressed it.",
    ],
    "labs": [
        "Half of the machines in lab 3 fail to boot and the rest cannot run the IDEs we need for the group project.",
        "The computer lab has only two working printers and the supervisor closes the lab an hour before the posted closing time.",
        "The lab software is not updated for our networking practicals, so we cannot complete the packet tracer exercises during lab hours.",
    ],
    "internet": [
        "Campus Wi-Fi drops constantly in the science block and the student portal times out whenever we try to submit assignments.",
        "The Wi-Fi bandwidth is too low for e-learning and video lectures buffer endlessly, making evening classes almost unusable.",
        "We cannot access some of the library e-resources from the hostel network at all, which blocks our research for the final year project.",
    ],
    "library": [
        "The main library has only three copies of the recommended data structures textbook for a class of over two hundred students.",
        "The library computer area is reserved for staff most afternoons and students are turned away even during exam revision weeks.",
        "Journal access from the library network times out frequently and the librarian says there is no IT support available on weekends.",
    ],
}

COMPLAINT_TEMPLATES.update({
    "exams": [
        "My continuous assessment marks were not entered into the system and I have now missed the deadline to raise an appeal.",
        "The exam timetable placed two of our programming papers on the same morning, and the exams office will not reschedule.",
        "Grades for last semester's operating systems paper still show as pending two months after results were published.",
    ],
    "admin": [
        "I registered for a course change in week one but the portal still shows my old unit list, so I almost sat the wrong exam.",
        "The faculty office asked me to bring the same clearance documents three times because they kept misplacing the file.",
        "My student ID card took four months to be issued because the registration office lost the batch of applications.",
    ],
    "fees": [
        "The finance office charged my tuition twice and have not processed a refund even though I submitted the bank statement.",
        "The fee statement on the portal does not match what I paid, and the accounts clerk says the error is on my side.",
        "Library fines were applied to my account from a card that was reported stolen, and finance refuses to reverse them without a manager.",
    ],
    "welfare": [
        "The hostel room I was allocated has a leaking ceiling and broken sockets, but maintenance has not responded in three weeks.",
        "There is no quiet study space on campus after 10pm even during exam week, and the security guard locks the reading room early.",
        "The medical centre refers students to town for common prescriptions, yet the student handbook promises on-site dispensary services.",
    ],
    "other": [
        "The class schedule conflicts between my core unit and an elective, and the departmental noticeboard only posted the change a day before.",
        "The official email list for my course missed half the students, so many of us never received the project briefing.",
        "The new timetable was published without warning and clashes with my part-time internship hours which were approved last semester.",
    ],
})

OUTCOMES = [
    "Please escalate this to the right office and confirm the next steps by email.",
    "I would like the department to acknowledge the issue and give us a clear timeline for a solution.",
    "A written response confirming that this has been received and an expected resolution date would be enough for now.",
    "I would appreciate a meeting with the head of department so we can agree on how this will be handled.",
    "Please provide a formal update and, where possible, compensate the affected time (for example by scheduling a catch-up session).",
    "I want this documented and followed up so that the same problem does not affect the next cohort of students.",
]

# Skewed so the dataset looks like real-world complaints.
CATEGORY_WEIGHTS = [
    ("internet", 18), ("labs", 16), ("exams", 12), ("lecturing", 12),
    ("content", 9), ("fees", 8), ("admin", 8), ("library", 7),
    ("welfare", 6), ("other", 4),
]
CATEGORY_POOL = [cid for cid, w in CATEGORY_WEIGHTS for _ in range(w)]
STATUS_POOL_OLD = ["resolved"] * 5 + ["in_progress"] * 3 + ["ack"] * 2 + ["not_ack"] + ["dismissed"]
STATUS_POOL_NEW = ["not_ack"] * 4 + ["ack"] * 3 + ["in_progress"] * 2 + ["resolved"] + ["dismissed"]
YEAR_BASE_AGE = {"y1": 18, "y2": 19, "y3": 20, "y4": 21, "pg": 23}
DEPT_BY_CATEGORY = {
    "internet": "it", "labs": "it", "exams": "exams", "fees": "finance",
    "admin": "registrar", "lecturing": "dean", "content": "dean",
    "library": "registrar", "welfare": "affairs", "other": "other",
}
SEVERITY_POOL = ["low"] * 3 + ["med"] * 4 + ["high"] * 2 + ["urgent"]
FREQ_POOL = ["once", "occ"] * 3 + ["freq"] * 2 + ["every"]

def make_responses(count, rng):
    """Return `count` response rows keyed to the 20-field schema."""
    rows = []
    now = datetime.now(timezone.utc)
    gender_ids = [g for g, _ in GENDERS]
    year_ids = [y for y, _ in YEARS]
    course_ids = [c for c, _ in COURSES]
    mode_ids = [m for m, _ in MODES]

    for i in range(count):
        gender = rng.choice(gender_ids[:2]) if rng.random() < 0.92 else rng.choice(gender_ids[2:])
        first_pool = FIRST_FEMALE if gender == "female" else FIRST_MALE
        first = rng.choice(first_pool)
        last = rng.choice(LAST)
        name = "{} {}".format(first, last)

        year = rng.choice(year_ids[:4]) if rng.random() < 0.9 else "pg"
        age = rng.randint(YEAR_BASE_AGE[year], YEAR_BASE_AGE[year] + 3)
        course = rng.choice(course_ids)
        mode = rng.choice(mode_ids)
        category = rng.choice(CATEGORY_POOL)

        reported = now - timedelta(days=rng.randint(0, 165))
        created = reported + timedelta(days=rng.randint(0, 2))
        is_old = (now - reported).days > 45
        status = rng.choice(STATUS_POOL_OLD if is_old else STATUS_POOL_NEW)
        if status == "resolved":
            satisfaction = rng.randint(4, 5)
        elif status == "not_ack":
            satisfaction = rng.randint(1, 2)
        else:
            satisfaction = rng.randint(2, 4)
        recommend = satisfaction >= 4 or (rng.random() < 0.25 and satisfaction >= 3)

        answers = {
            "full_name": name,
            "reg_no": "CS/{}/{:03d}".format(rng.choice(["2021", "2022", "2023", "2024"]), i + 1),
            "gender": gender,
            "age": age,
            "year_of_study": year,
            "course": course,
            "study_mode": mode,
            "category": category,
            "complaint_text": rng.choice(COMPLAINT_TEMPLATES[category]),
            "severity": rng.choice(SEVERITY_POOL),
            "frequency": rng.choice(FREQ_POOL),
            "channel": rng.choice(["rep", "portal", "email", "walkin", "phone"]),
            "dept": DEPT_BY_CATEGORY[category],
            "resolution_status": status,
            "date_reported": reported.strftime("%Y-%m-%d"),
            "expected_outcome": "{} {}".format(rng.choice(OUTCOMES), first),
            "would_recommend": recommend,
            "satisfaction": satisfaction,
        }
        # A handful of records intentionally omit contact info so queries like
        # "who didn't provide a phone number" return real results.
        if i % 13 == 4:
            answers.pop("phone", None)
        else:
            answers["phone"] = "+2567{}".format(rng.randint(10_000_000, 99_999_999))
        if i % 17 == 0:
            answers.pop("email", None)
        else:
            answers["email"] = "{}.{}{}@student.uni.ac.ug".format(first.lower(), last.lower(), 100 + i)

        rows.append(
            {
                "answers": answers,
                "meta": {"source": "seed.py", "seed_index": i},
                "created_at": created.strftime(TS_FMT),
            }
        )
    return rows

# ---------------------------------------------------------------------------
# Supabase helpers (service role)
# ---------------------------------------------------------------------------

def find_owner_id(base_url, token, email):
    """Look up an auth user id by email via the GoTrue admin API."""
    if not email:
        return None
    url = "{}/auth/v1/admin/users?per_page=1000".format(base_url)
    data = api("GET", url, token)
    users = data.get("users") if isinstance(data, dict) else (data or [])
    for user in users:
        if str(user.get("email", "")).lower() == email.strip().lower():
            return user.get("id")
    return None


def find_existing_form(rest, token, owner_id, title):
    params = urllib.parse.urlencode(
        {"select": "id", "title": "eq." + title, "owner_id": "eq." + owner_id, "limit": "1"}
    )
    data = api("GET", "{}?{}".format(rest + "/forms", params), token)
    if isinstance(data, list) and data:
        return data[0].get("id")
    return None


def count_responses(rest, token, form_id):
    params = urllib.parse.urlencode({"select": "id", "form_id": "eq." + form_id, "limit": "1000"})
    data = api("GET", "{}?{}".format(rest + "/responses", params), token)
    return len(data) if isinstance(data, list) else 0


def delete_where(rest, token, table, form_id):
    params = urllib.parse.urlencode({"form_id": "eq." + form_id})
    api("DELETE", "{}?{}".format(rest + "/" + table, params), token, expect_json=False)


def create_form(rest, token, owner_id, title):
    body = {
        "owner_id": owner_id,
        "title": title,
        "description": "Complaints and feedback raised by Computer Science students - seed data for AI analysis.",
        "schema": build_schema(),
        "schema_version": 1,
        "status": "published",
        "settings": {
            "confirmationMessage": "Thanks - your complaint has been recorded.",
            "redirectUrl": "",
            "notifyEmail": "",
            "allowMultiple": True,
            "limitResponses": False,
            "maxResponses": 1000,
            "closeOnDate": False,
            "closeDate": "",
            "passwordProtected": False,
        },
    }
    data = api(
        "POST", rest + "/forms", token, body,
        headers_extra={"Prefer": "return=representation"},
    )
    return data[0] if isinstance(data, list) and data else data


def insert_responses(rest, token, form_id, responses, batch_size=BATCH_SIZE):
    inserted = 0
    for start in range(0, len(responses), batch_size):
        batch = []
        for r in responses[start:start + batch_size]:
            batch.append(
                {
                    "form_id": form_id,
                    "schema_version": 1,
                    "answers": r["answers"],
                    "meta": r["meta"],
                    "created_at": r["created_at"],
                }
            )
        api("POST", rest + "/responses", token, batch, expect_json=False)
        inserted += len(batch)
    return inserted

def env(name, default=None):
    return os.environ.get(name, default)


def main(argv=None):
    parser = argparse.ArgumentParser(description="Seed a CS student complaints form + responses.")
    parser.add_argument("--title", default=DEFAULT_TITLE)
    parser.add_argument("--responses", type=int, default=DEFAULT_RESPONSES, help="how many submissions to create (default: 100)")
    parser.add_argument("--seed", type=int, default=SEED, help="random seed for reproducible data")
    parser.add_argument("--owner-email", default=None, help="auth user that owns the form (default: {})".format(DEFAULT_OWNER_EMAIL))
    parser.add_argument("--owner-id", default=None, help="skip email lookup and use this user id")
    parser.add_argument("--force", action="store_true", help="delete the existing form + responses, then reseed")
    parser.add_argument("--dry-run", action="store_true", help="print payloads without contacting Supabase")
    args = parser.parse_args(argv)
    if args.responses < 1:
        parser.error("--responses must be >= 1")

    rng = random.Random(args.seed)
    schema = build_schema()
    responses = make_responses(args.responses, rng)

    if args.dry_run:
        print("=== DRY RUN (nothing will be written) ===")
        print("form title :", args.title)
        print("fields     : {} (schema-compatible types)".format(len(schema["fields"])))
        print("responses  :", len(responses))
        print("sample schema (first 5 fields):")
        for f in schema["fields"][:5]:
            print("   -", json.dumps(f))
        print("sample response[0]:")
        print(json.dumps(responses[0], indent=2))
        print("sample response[1]:")
        print(json.dumps(responses[1], indent=2))
        return 0

    load_dotenv()
    base_url = (env("SUPABASE_URL") or env("NEXT_PUBLIC_SUPABASE_URL") or "").rstrip("/")
    token = env("SUPABASE_SERVICE_ROLE_KEY")
    if not base_url or not token:
        print("error: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env (or the environment).")
        return 2

    owner_email = (args.owner_email or env("OWNER_EMAIL") or DEFAULT_OWNER_EMAIL).strip()
    owner_id = args.owner_id or env("OWNER_ID")
    if not owner_id:
        owner_id = find_owner_id(base_url, token, owner_email)
    if not owner_id:
        print("error: could not find a Supabase auth user for '{}'.".format(owner_email))
        print("Pass --owner-id <uuid> (or set OWNER_ID) to skip the lookup, or create the account first.")
        return 2

    rest = base_url + "/rest/v1"
    form_id = find_existing_form(rest, token, owner_id, args.title)

    if form_id and args.force:
        print("force mode: clearing existing responses + form '{}'".format(args.title))
        delete_where(rest, token, "responses", form_id)
        params = urllib.parse.urlencode({"id": "eq." + form_id})
        api("DELETE", "{}?{}".format(rest + "/forms", params), token, expect_json=False)
        form_id = None

    if not form_id:
        row = create_form(rest, token, owner_id, args.title)
        form_id = row["id"]
        print("created form '{}' (id={}) for owner {}".format(args.title, form_id, owner_email))
    else:
        existing = count_responses(rest, token, form_id)
        if existing > 0:
            print("form '{}' already exists with {} response(s). Nothing to do (use --force to reseed).".format(args.title, existing))
            return 0
        print("reusing existing form '{}' (id={})".format(args.title, form_id))

    inserted = insert_responses(rest, token, form_id, responses)
    print("inserted {} response(s) into form '{}'".format(inserted, args.title))
    print("open: /submissions?form={}  -> AI Analysis tab".format(form_id))
    return 0


if __name__ == "__main__":
    sys.exit(main())

