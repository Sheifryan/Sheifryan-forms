// Realistic football-registration form used across the ask-your-data tests.

import type { FormField, ResponseRowLike, ResponsesSource } from "../../lib/ai/analysis/types";

// Option ids mimic what the builder generates (nanoid-ish short ids).
export const FIELDS: FormField[] = [
  { id: "name", type: "short_text", label: "Full name", required: true },
  { id: "phone", type: "phone", label: "Phone number", required: true },
  { id: "email", type: "email", label: "Email address", required: false },
  { id: "age", type: "number", label: "Age", required: true },
  {
    id: "gender",
    type: "single_select",
    label: "Gender",
    required: true,
    options: [
      { id: "male", label: "Male" },
      { id: "female", label: "Female" },
    ],
  },
  {
    id: "position",
    type: "single_select",
    label: "Preferred position",
    required: true,
    options: [
      { id: "gk", label: "Goalkeeper" },
      { id: "def", label: "Defender" },
      { id: "mid", label: "Midfielder" },
      { id: "st", label: "Striker" },
    ],
  },
  {
    id: "availability",
    type: "multi_select",
    label: "Days available",
    required: false,
    options: [
      { id: "mon", label: "Monday" },
      { id: "tue", label: "Tuesday" },
      { id: "sat", label: "Saturday" },
      { id: "sun", label: "Sunday" },
    ],
  },
  { id: "experience", type: "long_text", label: "Playing experience", required: false },
];

export interface FixtureRow {
  id: string;
  created_at: string;
  answers: Record<string, unknown>;
}

export function row(id: string, createdAt: string, answers: Record<string, unknown>): FixtureRow {
  return { id, created_at: createdAt, answers };
}

/**
 * 8 registrations: 3 strikers (two 18-25 + available Sat), a 30yo keeper with
 * no phone, a 19yo defender, one 21yo midfielder, two female (GK + striker)…
 * deliberately messy so filters/aggregations have real work to do.
 */
export function footballDataset(): FixtureRow[] {
  return [
    row("r1", "2024-01-10T09:00:00.000Z", {
      name: "John Doe",
      phone: "+256771234567",
      email: "john@example.com",
      age: 19,
      gender: "male",
      position: "st",
      availability: ["mon", "sat"],
      experience: "Two seasons at a local club.",
    }),
    row("r2", "2024-01-10T10:00:00.000Z", {
      name: "David Kato",
      phone: "+256700111222",
      email: "david@example.com",
      age: 24,
      gender: "male",
      position: "def",
      availability: ["sat"],
    }),
    row("r3", "2024-01-11T08:30:00.000Z", {
      name: "Sarah Nambi",
      phone: "+256772333444",
      email: "sarah@example.com",
      age: 21,
      gender: "female",
      position: "st",
      availability: ["sun", "sat"],
      experience: "Plays for the university team.",
    }),
    row("r4", "2024-01-12T14:00:00.000Z", {
      name: "Ali Mukasa",
      phone: null, // no phone provided
      email: "ali@example.com",
      age: 30,
      gender: "male",
      position: "gk",
      availability: ["sun"],
    }),
    row("r5", "2024-01-13T11:00:00.000Z", {
      name: "Grace Achieng",
      phone: "+256703555666",
      email: "grace@example.com",
      age: 18,
      gender: "female",
      position: "gk",
      availability: ["sat"],
    }),
    row("r6", "2024-01-14T09:15:00.000Z", {
      name: "Peter Okello",
      phone: "+256741777888",
      email: "",
      age: 35,
      gender: "male",
      position: "mid",
      availability: ["mon"],
      experience: "Long-running Sunday league player.",
    }),
    row("r7", "2024-01-15T10:45:00.000Z", {
      name: "Ivan Ssemakula",
      phone: "+256755999000",
      email: "ivan@example.com",
      age: 22,
      gender: "male",
      position: "st",
      availability: ["sat", "sun"],
    }),
    row("r8", "2024-01-16T13:20:00.000Z", {
      name: "Mary Tumusiime",
      phone: "+256700111333",
      email: "mary@example.com",
      age: 27,
      gender: "female",
      position: "def",
      availability: ["sun"],
      experience: "Coaches juniors on weekends.",
    }),
  ];
}

export function arraySource(rows: FixtureRow[]): ResponsesSource {
  return {
    async count() {
      return rows.length;
    },
    async latestCreatedAt() {
      return rows.length ? rows[rows.length - 1].created_at : null;
    },
    async range(start: number, end: number) {
      return rows.slice(start, end) as unknown as ResponseRowLike[];
    },
  };
}
