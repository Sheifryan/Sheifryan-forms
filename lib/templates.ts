import { nanoid } from "nanoid";
import type { FormField, FieldType } from "@/lib/schema";
import { FIELD_LABELS } from "@/lib/schema";

type FieldOpts = {
  /** Mark the field as required in the pre-built form. */
  required?: boolean;
  /** Placeholder text (also the visible label for checkbox fields). */
  placeholder?: string;
  /** Help text shown under the field label. */
  helpText?: string;
  /** Option labels for single_select / multi_select / dropdown fields. */
  options?: string[];
};

// Build a FormField with sensible defaults. Choice fields get explicit,
// realistic options when provided — otherwise "Option 1 / Option 2".
function field(type: FieldType, label: string, opts: FieldOpts = {}): FormField {
  const needsOptions = type === "single_select" || type === "multi_select" || type === "dropdown";
  return {
    id: nanoid(8),
    type,
    label,
    required: opts.required ?? false,
    placeholder: opts.placeholder,
    helpText: opts.helpText,
    options: needsOptions
      ? (opts.options ?? ["Option 1", "Option 2"]).map((o) => ({ id: nanoid(6), label: o }))
      : undefined,
  };
}

export interface FormTemplate {
  id: string;
  title: string;
  category: string;
  description: string;
  /** Featured templates float to the top of the gallery and the dashboard hero. */
  featured?: boolean;
  build: () => FormField[];
}

export const TEMPLATES: FormTemplate[] = [
  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------
  {
    id: "event",
    title: "Event registration",
    category: "Registration",
    description: "Collect attendee details, count of guests and dietary needs.",
    featured: true,
    build: () => [
      field("short_text", "Full name", { required: true }),
      field("email", "Email address", { required: true }),
      field("phone", "Phone number"),
      field("number", "Number of guests"),
      field("dropdown", "Dietary restrictions", {
        options: ["Vegetarian", "Vegan", "Gluten-free", "Kosher", "Halal", "None"],
      }),
      field("dropdown", "How did you hear about this event?", {
        options: ["Social media", "Email", "Friend or colleague", "Website", "Other"],
      }),
      field("checkbox", "Updates", { placeholder: "I agree to receive updates about this event" }),
    ],
  },
  {
    id: "webinar",
    title: "Webinar registration",
    category: "Registration",
    description: "Reserve a seat and capture what attendees want to hear about.",
    build: () => [
      field("short_text", "Full name", { required: true }),
      field("email", "Email address", { required: true }),
      field("short_text", "Job title"),
      field("short_text", "Company"),
      field("multi_select", "Which topics interest you?", {
        options: ["Product demos", "Industry trends", "Case studies", "Live Q&A"],
      }),
      field("dropdown", "How did you hear about this webinar?", {
        options: ["Social media", "Email", "Search engine", "Other"],
      }),
    ],
  },
  {
    id: "workshop",
    title: "Workshop sign-up",
    category: "Registration",
    description: "Reserve a seat and pick your experience level.",
    build: () => [
      field("short_text", "Full name", { required: true }),
      field("email", "Email address", { required: true }),
      field("phone", "Phone number"),
      field("dropdown", "Workshop level", { options: ["Beginner", "Intermediate", "Advanced"] }),
      field("date", "Preferred date"),
      field("long_text", "Accessibility requirements"),
    ],
  },
  {
    id: "volunteer",
    title: "Volunteer sign-up",
    category: "Registration",
    description: "Gather availability and skills from volunteers.",
    build: () => [
      field("short_text", "Full name", { required: true }),
      field("email", "Email address", { required: true }),
      field("phone", "Phone number"),
      field("multi_select", "Availability", { options: ["Weekdays", "Weekends", "Mornings", "Evenings"] }),
      field("long_text", "Relevant skills"),
      field("short_text", "Emergency contact name"),
      field("phone", "Emergency contact phone"),
    ],
  },
  // ---------------------------------------------------------------------------
  // HR
  // ---------------------------------------------------------------------------
  {
    id: "job",
    title: "Job application",
    category: "HR",
    description: "Standard application form with resume upload.",
    featured: true,
    build: () => [
      field("short_text", "Full name", { required: true }),
      field("email", "Email address", { required: true }),
      field("phone", "Phone number"),
      field("dropdown", "Position applying for", {
        options: ["Software Engineer", "Product Designer", "Data Analyst", "Marketing Manager", "Project Manager", "Other"],
      }),
      field("dropdown", "How did you find this position?", {
        options: ["Referral", "Company website", "LinkedIn", "Job board", "Recruiter"],
      }),
      field("file", "Resume", { required: true }),
      field("long_text", "Cover letter"),
      field("single_select", "Work authorization", {
        required: true,
        options: ["Yes, I am authorized to work", "No, I will require sponsorship"],
      }),
      field("date", "Earliest start date"),
    ],
  },
  {
    id: "onboarding",
    title: "New hire onboarding",
    category: "HR",
    description: "Collect the basics your team needs before day one.",
    build: () => [
      field("short_text", "Full name", { required: true }),
      field("email", "Work email", { required: true }),
      field("date", "Start date"),
      field("dropdown", "Department", {
        options: ["Engineering", "Design", "Marketing", "Sales", "Operations", "People"],
      }),
      field("dropdown", "T-shirt size", { options: ["XS", "S", "M", "L", "XL", "XXL"] }),
      field("short_text", "Emergency contact name"),
      field("phone", "Emergency contact phone"),
      field("checkbox", "Confirmation", { placeholder: "I confirm my details are correct", required: true }),
    ],
  },
  {
    id: "exit",
    title: "Exit interview",
    category: "HR",
    description: "Gather honest feedback from departing employees.",
    build: () => [
      field("dropdown", "Department", {
        options: ["Engineering", "Design", "Marketing", "Sales", "Operations", "People"],
      }),
      field("dropdown", "Length of service", { options: ["Less than 1 year", "1–3 years", "3–5 years", "5+ years"] }),
      field("rating", "Overall experience"),
      field("long_text", "What made you decide to leave?", { required: true }),
      field("long_text", "What could we have done to keep you?"),
      field("rating", "Would you recommend working here?"),
      field("long_text", "Any other feedback?"),
    ],
  },
  {
    id: "review",
    title: "Performance review",
    category: "HR",
    description: "Score competencies and capture written feedback.",
    build: () => [
      field("short_text", "Employee name", { required: true }),
      field("dropdown", "Review period", { options: ["Q1", "Q2", "Q3", "Q4", "Annual"] }),
      field("rating", "Job knowledge"),
      field("rating", "Quality of work"),
      field("rating", "Communication"),
      field("long_text", "Key achievements this period"),
      field("long_text", "Areas for improvement"),
      field("rating", "Overall rating"),
      field("short_text", "Reviewer name"),
    ],
  },
  // ---------------------------------------------------------------------------
  // Feedback
  // ---------------------------------------------------------------------------
  {
    id: "feedback",
    title: "Customer feedback",
    category: "Feedback",
    description: "A simple satisfaction survey with a rating field.",
    featured: true,
    build: () => [
      field("short_text", "Full name"),
      field("email", "Email address"),
      field("rating", "How likely are you to recommend us?", { required: true }),
      field("rating", "How satisfied are you with our product?"),
      field("long_text", "What do you like most?"),
      field("long_text", "What could we improve?"),
      field("long_text", "Any other comments?"),
    ],
  },
  {
    id: "nps",
    title: "NPS survey",
    category: "Feedback",
    description: "Measure loyalty with a score and an open follow-up.",
    featured: true,
    build: () => [
      field("rating", "How likely are you to recommend us?", {
        required: true,
        helpText: "0 = not at all, 5 = extremely likely",
      }),
      field("long_text", "What is the main reason for your score?", { required: true }),
      field("dropdown", "Which product do you use most?", {
        options: ["Starter", "Pro", "Enterprise", "Not a customer yet"],
      }),
      field("single_select", "Follow-up", { options: ["Yes, you may contact me", "No, thanks"] }),
      field("email", "Email address"),
    ],
  },
  {
    id: "product",
    title: "Product feedback",
    category: "Feedback",
    description: "Learn how people use your product and what's missing.",
    build: () => [
      field("short_text", "Name"),
      field("email", "Email address"),
      field("dropdown", "Which product did you use?", { options: ["Starter", "Pro", "Enterprise"] }),
      field("rating", "How would you rate ease of use?"),
      field("short_text", "What feature did you use most?"),
      field("long_text", "What is missing?"),
      field("rating", "Would you recommend it?"),
    ],
  },
  {
    id: "eventFeedback",
    title: "Event feedback",
    category: "Feedback",
    description: "See what landed and what to change for the next event.",
    build: () => [
      field("rating", "Overall event rating", { required: true }),
      field("rating", "How well organized was the event?"),
      field("multi_select", "Which sessions did you attend?", {
        options: ["Keynote", "Workshops", "Panel discussion", "Networking"],
      }),
      field("long_text", "Best part of the event"),
      field("long_text", "What could be improved?"),
      field("single_select", "Would you attend again?", { options: ["Yes", "No", "Maybe"] }),
    ],
  },
  // ---------------------------------------------------------------------------
  // Marketing
  // ---------------------------------------------------------------------------
  {
    id: "contest",
    title: "Contest entry",
    category: "Marketing",
    description: "Run a giveaway and collect entries in one place.",
    build: () => [
      field("short_text", "Full name", { required: true }),
      field("email", "Email address", { required: true }),
      field("phone", "Phone number"),
      field("dropdown", "Which contest?", {
        options: ["Summer giveaway", "Referral contest", "Photo challenge", "Other"],
      }),
      field("long_text", "Tell us why you should win", { required: true }),
      field("file", "Photo or video entry"),
      field("checkbox", "Terms", { placeholder: "I agree to the terms and conditions", required: true }),
    ],
  },
  {
    id: "newsletter",
    title: "Newsletter signup",
    category: "Marketing",
    description: "Grow your list and learn what subscribers want.",
    build: () => [
      field("short_text", "Full name"),
      field("email", "Email address", { required: true }),
      field("multi_select", "What topics interest you?", {
        options: ["Product news", "Tips & tutorials", "Company updates", "Events"],
      }),
      field("dropdown", "How often would you like emails?", { options: ["Weekly", "Monthly", "Rarely"] }),
      field("checkbox", "Consent", { placeholder: "I consent to receive emails", required: true }),
    ],
  },
  {
    id: "lead",
    title: "Lead generation",
    category: "Marketing",
    description: "Qualify new leads with a short, focused form.",
    build: () => [
      field("short_text", "Full name", { required: true }),
      field("email", "Work email", { required: true }),
      field("short_text", "Company"),
      field("dropdown", "Company size", { options: ["1–10", "11–50", "51–200", "201–1000", "1000+"] }),
      field("long_text", "What are you looking for?"),
      field("time", "Best time to contact"),
      field("dropdown", "How did you find us?", {
        options: ["Search", "Advertisement", "Referral", "Social media", "Other"],
      }),
    ],
  },
  // ---------------------------------------------------------------------------
  // Sales
  // ---------------------------------------------------------------------------
  {
    id: "order",
    title: "Order form",
    category: "Sales",
    description: "Capture a product order with shipping details.",
    featured: true,
    build: () => [
      field("short_text", "Full name", { required: true }),
      field("email", "Email address", { required: true }),
      field("dropdown", "Product", {
        options: ["Starter Plan — $29/mo", "Pro Plan — $79/mo", "Enterprise — Contact us", "Add-ons & accessories"],
      }),
      field("number", "Quantity", { required: true }),
      field("long_text", "Shipping address", { required: true }),
      field("single_select", "Delivery method", { options: ["Standard", "Express", "Overnight"] }),
      field("dropdown", "Payment method", {
        options: ["Credit card", "PayPal", "Bank transfer", "Purchase order"],
      }),
      field("checkbox", "Terms", { placeholder: "I agree to the terms and conditions", required: true }),
    ],
  },
  {
    id: "quote",
    title: "Quote request",
    category: "Sales",
    description: "Fast-track inbound sales with a quote request form.",
    build: () => [
      field("short_text", "Full name", { required: true }),
      field("short_text", "Company"),
      field("email", "Work email", { required: true }),
      field("phone", "Phone number"),
      field("short_text", "Product or service of interest"),
      field("number", "Estimated quantity"),
      field("dropdown", "Target budget", { options: ["Under $1k", "$1k–$5k", "$5k–$10k", "$10k+"] }),
      field("date", "When do you need it?"),
      field("long_text", "Additional requirements"),
    ],
  },
  {
    id: "rfq",
    title: "Request for proposal",
    category: "Sales",
    description: "Invite bids with a clear project brief.",
    build: () => [
      field("short_text", "Company name", { required: true }),
      field("short_text", "Contact person", { required: true }),
      field("email", "Contact email", { required: true }),
      field("long_text", "Project overview", { required: true }),
      field("date", "Target start date"),
      field("dropdown", "Budget range", { options: ["Under $5k", "$5k–$20k", "$20k–$50k", "$50k+"] }),
      field("dropdown", "How did you hear about us?", {
        options: ["Search engine", "Referral", "Conference", "Other"],
      }),
    ],
  },
  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------
  {
    id: "rsvp",
    title: "Event RSVP",
    category: "Events",
    description: "Get a head count with one short RSVP.",
    build: () => [
      field("short_text", "Full name", { required: true }),
      field("email", "Email address", { required: true }),
      field("single_select", "Will you attend?", { required: true, options: ["Yes", "No", "Maybe"] }),
      field("number", "Number of guests"),
      field("long_text", "Dietary restrictions"),
      field("long_text", "Questions for the host?"),
    ],
  },
  {
    id: "speaker",
    title: "Speaker application",
    category: "Events",
    description: "Run a structured call-for-proposals.",
    build: () => [
      field("short_text", "Full name", { required: true }),
      field("email", "Email address", { required: true }),
      field("short_text", "Talk title", { required: true }),
      field("long_text", "Talk description", { required: true }),
      field("dropdown", "Target audience", { options: ["Beginners", "Intermediate", "Advanced", "All levels"] }),
      field("dropdown", "Session length", { options: ["15 min", "30 min", "45 min", "90 min"] }),
      field("url", "Links to previous talks"),
      field("multi_select", "Availability", { options: ["Weekdays", "Weekends", "Any"] }),
    ],
  },
  // ---------------------------------------------------------------------------
  // Education
  // ---------------------------------------------------------------------------
  {
    id: "quiz",
    title: "Quiz / Test",
    category: "Education",
    description: "A quick knowledge check with mixed question types.",
    build: () => [
      field("short_text", "Full name", { required: true }),
      field("email", "Email address"),
      field("single_select", "1. What is 2 + 2?", { options: ["3", "4", "5", "6"] }),
      field("multi_select", "2. Select all prime numbers", { options: ["2", "3", "4", "9"] }),
      field("single_select", "3. True or false: Paris is the capital of France", { options: ["True", "False"] }),
      field("short_text", "4. Name one web framework"),
    ],
  },
  {
    id: "eval",
    title: "Course evaluation",
    category: "Education",
    description: "Understand what worked in your course.",
    build: () => [
      field("rating", "Overall course rating", { required: true }),
      field("rating", "How clear was the instructor?"),
      field("rating", "How useful were the materials?"),
      field("long_text", "What was the most valuable part?"),
      field("long_text", "What would you improve?"),
      field("single_select", "Would you recommend this course?", { options: ["Yes", "No"] }),
    ],
  },
  // ---------------------------------------------------------------------------
  // Healthcare
  // ---------------------------------------------------------------------------
  {
    id: "appointment",
    title: "Appointment booking",
    category: "Healthcare",
    description: "Let patients book a time slot in minutes.",
    featured: true,
    build: () => [
      field("short_text", "Full name", { required: true }),
      field("email", "Email address", { required: true }),
      field("phone", "Phone number", { required: true }),
      field("dropdown", "Service", {
        options: ["Consultation", "Follow-up", "Lab test", "Specialist referral", "Vaccination"],
      }),
      field("date", "Preferred date", { required: true }),
      field("time", "Preferred time"),
      field("single_select", "First visit?", { options: ["Yes, this is my first visit", "No, I have been here before"] }),
      field("long_text", "Reason for visit"),
      field("short_text", "Insurance provider"),
    ],
  },
  {
    id: "intake",
    title: "Patient intake",
    category: "Healthcare",
    description: "Collect medical history before an appointment.",
    build: () => [
      field("short_text", "Full name", { required: true }),
      field("date", "Date of birth", { required: true }),
      field("email", "Email address", { required: true }),
      field("phone", "Phone number"),
      field("single_select", "Gender", { options: ["Female", "Male", "Non-binary", "Prefer not to say"] }),
      field("short_text", "Emergency contact name"),
      field("phone", "Emergency contact phone"),
      field("long_text", "Current medications"),
      field("long_text", "Allergies"),
      field("long_text", "Primary reason for visit", { required: true }),
      field("checkbox", "Consent", { placeholder: "I consent to treatment", required: true }),
    ],
  },
  // ---------------------------------------------------------------------------
  // Hospitality
  // ---------------------------------------------------------------------------
  {
    id: "reservation",
    title: "Table reservation",
    category: "Hospitality",
    description: "Book tables and note special occasions.",
    build: () => [
      field("short_text", "Full name", { required: true }),
      field("email", "Email address", { required: true }),
      field("phone", "Phone number"),
      field("number", "Number of guests", { required: true }),
      field("date", "Date", { required: true }),
      field("time", "Time", { required: true }),
      field("dropdown", "Occasion", { options: ["Birthday", "Anniversary", "Business", "Just dinner"] }),
      field("long_text", "Special requests"),
    ],
  },
  // ---------------------------------------------------------------------------
  // Real Estate
  // ---------------------------------------------------------------------------
  {
    id: "property",
    title: "Property inquiry",
    category: "Real Estate",
    description: "Capture leads browsing your listings.",
    build: () => [
      field("short_text", "Full name", { required: true }),
      field("email", "Email address", { required: true }),
      field("phone", "Phone number"),
      field("single_select", "Are you buying or renting?", { required: true, options: ["Buying", "Renting"] }),
      field("short_text", "Property of interest"),
      field("dropdown", "Budget range", { options: ["Under $200k", "$200k–$500k", "$500k–$1M", "$1M+"] }),
      field("date", "Preferred move-in date"),
      field("long_text", "Message"),
    ],
  },
  {
    id: "rental",
    title: "Rental application",
    category: "Real Estate",
    description: "Screen applicants with essential qualifying info.",
    build: () => [
      field("short_text", "Full name", { required: true }),
      field("email", "Email address", { required: true }),
      field("phone", "Phone number", { required: true }),
      field("short_text", "Property address", { required: true }),
      field("date", "Desired move-in date"),
      field("number", "Monthly budget"),
      field("short_text", "Current employer"),
      field("number", "Annual income"),
      field("long_text", "References"),
      field("checkbox", "Consent", { placeholder: "I consent to a credit check", required: true }),
    ],
  },
  // ---------------------------------------------------------------------------
  // Support
  // ---------------------------------------------------------------------------
  {
    id: "ticket",
    title: "Support ticket",
    category: "Support",
    description: "Triage issues the moment they arrive.",
    build: () => [
      field("short_text", "Full name", { required: true }),
      field("email", "Email address", { required: true }),
      field("dropdown", "Priority", { options: ["Low", "Medium", "High", "Urgent"] }),
      field("short_text", "Subject", { required: true }),
      field("long_text", "Description", { required: true }),
      field("dropdown", "Where did the issue occur?", {
        options: ["Web app", "Mobile app", "API", "Billing", "Other"],
      }),
      field("file", "Attachments"),
    ],
  },
  {
    id: "bug",
    title: "Bug report",
    category: "Support",
    description: "Reproduction-ready bug reports from users.",
    build: () => [
      field("short_text", "Your name"),
      field("email", "Email address", { required: true }),
      field("long_text", "What were you doing?", { required: true }),
      field("long_text", "What did you expect to happen?"),
      field("long_text", "What actually happened?", { required: true }),
      field("long_text", "Steps to reproduce"),
      field("file", "Screenshots or logs"),
    ],
  },
  {
    id: "feature",
    title: "Feature request",
    category: "Support",
    description: "Collect and prioritize product ideas.",
    build: () => [
      field("short_text", "Name"),
      field("email", "Email address", { required: true }),
      field("dropdown", "Which product?", { options: ["Starter", "Pro", "Enterprise"] }),
      field("long_text", "Describe the feature you'd like", { required: true }),
      field("long_text", "Why is it important to you?"),
      field("single_select", "Would you beta test?", { options: ["Yes", "No"] }),
    ],
  },
  // ---------------------------------------------------------------------------
  // Non-profit
  // ---------------------------------------------------------------------------
  {
    id: "donation",
    title: "Donation form",
    category: "Non-profit",
    description: "Collect one-time or recurring gifts.",
    build: () => [
      field("short_text", "Full name", { required: true }),
      field("email", "Email address", { required: true }),
      field("single_select", "Donation amount", {
        required: true,
        options: ["$25", "$50", "$100", "$250", "$500", "Other"],
      }),
      field("single_select", "Frequency", { options: ["One-time", "Monthly"] }),
      field("dropdown", "Where should your gift go?", {
        options: ["General fund", "Education programs", "Emergency relief", "Other"],
      }),
      field("long_text", "Leave a message"),
      field("checkbox", "Updates", { placeholder: "I'd like to receive updates" }),
    ],
  },
];

// Re-export for convenience where only labels are needed (e.g. icons lookup).
export { FIELD_LABELS };