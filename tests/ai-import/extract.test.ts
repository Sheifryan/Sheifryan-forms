// Regression cover for the form importer's file handling.
//
// The extractors are pure functions over bytes, so they are tested against
// committed fixtures (see make_fixtures.py) — no network, no AI, no Supabase.
//
// Two measured realities these tests pin down:
//   * a digital PDF's text items arrive positionally, so a naive join produces
//     "2026Full name:" — lines must be rebuilt from the y/x transforms;
//   * a scanned PDF has no text layer at all and must fall back to its embedded
//     page JPEGs, which is what makes photos of paper forms importable.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  DOCX_MIME,
  UnsupportedFileError,
  embeddedJpegs,
  extractSource,
  htmlToText,
  linesFromTextItems,
  looksLikeText,
  sniffMime,
} from "../../lib/ai/import/extract";

// `npm run test:import` runs from the repo root.
const FIXTURES = path.resolve(process.cwd(), "tests/ai-import/fixtures");
const fixture = (name: string) => new Uint8Array(readFileSync(path.join(FIXTURES, name)));

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
const PLAIN_ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...new Array(64).fill(0)]);

test("sniffMime trusts magic bytes over the declared type", () => {
  assert.equal(sniffMime(PNG, "application/octet-stream"), "image/png");
  assert.equal(sniffMime(JPEG, "text/plain"), "image/jpeg");
  assert.equal(sniffMime(PDF, "application/octet-stream"), "application/pdf");

  const csv = new Uint8Array(Buffer.from("Full name,Email\nAda,ada@example.com", "utf8"));
  assert.equal(sniffMime(csv, ""), "text/plain");
  assert.equal(sniffMime(csv, "text/csv"), "text/csv");
  assert.equal(sniffMime(new Uint8Array([0, 1, 2, 3, 200, 201]), ""), "application/octet-stream");
});

test("a docx is recognised from its zip listing, not just its name", () => {
  assert.equal(sniffMime(fixture("minimal.docx"), "", "upload.bin"), DOCX_MIME);
  assert.equal(sniffMime(PLAIN_ZIP, "", "archive.zip"), "application/zip");
});

test("looksLikeText separates text from binary", () => {
  assert.equal(looksLikeText(new Uint8Array(Buffer.from("hello world\n", "utf8"))), true);
  assert.equal(looksLikeText(new Uint8Array([0x68, 0x00, 0x69])), false);
});

test("htmlToText keeps a table row on one line as 'label | answer'", () => {
  const html =
    "<p>Course Feedback Form</p><table><tr><td><p>Gender</p></td><td><p>Male   Female</p></td></tr></table>";
  assert.deepEqual(htmlToText(html).split("\n"), ["Course Feedback Form", "Gender | Male Female"]);
  assert.equal(htmlToText("<p>A &amp; B</p>"), "A & B");
});

test("PDF text items are rebuilt into lines instead of being concatenated", () => {
  const items = [
    { str: "Form 2026", transform: [1, 0, 0, 1, 300, 700], width: 60 },
    { str: "STUDENT", transform: [1, 0, 0, 1, 72, 700], width: 66 },
    { str: "REGISTRATION", transform: [1, 0, 0, 1, 145, 700], width: 90 },
    { str: "Full name:", transform: [1, 0, 0, 1, 72, 670], width: 62 },
    { str: "Ada", transform: [1, 0, 0, 1, 200, 670], width: 24 },
  ];
  assert.deepEqual(linesFromTextItems(items), ["STUDENT REGISTRATION Form 2026", "Full name: Ada"]);
});

test("embeddedJpegs only takes real /DCTDecode JPEG streams", () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 1, 2, 3, 0xff, 0xd9]);
  const scan = Buffer.concat([
    Buffer.from("%PDF-1.4\n5 0 obj << /Filter /DCTDecode /Length 9 >>\nstream\n", "latin1"),
    jpeg,
    Buffer.from("\nendstream\n", "latin1"),
  ]);
  assert.equal(embeddedJpegs(new Uint8Array(scan)).length, 1);

  const flate = Buffer.concat([
    Buffer.from("%PDF-1.4\n5 0 obj << /Filter /FlateDecode >>\nstream\n", "latin1"),
    Buffer.from([0x78, 0x9c, 0x01, 0x02]),
    Buffer.from("\nendstream\n", "latin1"),
  ]);
  assert.equal(embeddedJpegs(new Uint8Array(flate)).length, 0);
});

test("a digital PDF becomes text with real line breaks", async () => {
  const source = await extractSource({
    bytes: fixture("minimal.pdf"),
    declaredMime: "application/pdf",
    filename: "minimal.pdf",
  });
  assert.equal(source.kind, "pdf_text");
  assert.equal(source.images.length, 0);
  assert.equal(source.pages, 1);

  const lines = source.text.split("\n");
  assert.ok(lines.includes("STUDENT REGISTRATION FORM 2026"), source.text.slice(0, 300));
  assert.ok(lines.includes("Full name: ______________________"), source.text.slice(0, 300));
  assert.ok(lines.includes("Gender: ( ) Male ( ) Female"), source.text.slice(0, 300));
});

test("a scanned PDF falls back to its embedded page image", async () => {
  const source = await extractSource({
    bytes: fixture("scanned.pdf"),
    declaredMime: "application/pdf",
    filename: "scanned.pdf",
  });
  assert.equal(source.kind, "image");
  assert.equal(source.images.length, 1);
  assert.equal(source.images[0].mimeType, "image/jpeg");
  assert.ok(source.images[0].dataUrl.startsWith("data:image/jpeg;base64,"));
  assert.match(source.warnings.join(" "), /no text layer/i);
});

test("a Word document keeps its table rows as labels and answers", async () => {
  const source = await extractSource({
    bytes: fixture("minimal.docx"),
    declaredMime: DOCX_MIME,
    filename: "minimal.docx",
  });
  assert.equal(source.kind, "docx_text");

  const lines = source.text.split("\n");
  assert.ok(lines.includes("Course Feedback Form"), source.text);
  assert.ok(lines.includes("Gender | Male Female"), source.text);
  assert.ok(lines.includes("Full name | ____________________"), source.text);
  assert.ok(lines.includes("Email address: ____________________"), source.text);
});

test("images and text files pass through; anything else is rejected", async () => {
  const image = await extractSource({ bytes: PNG, declaredMime: "image/png", filename: "form.png" });
  assert.equal(image.kind, "image");
  assert.equal(image.images.length, 1);
  assert.equal(image.text, "");

  const csv = await extractSource({
    bytes: new Uint8Array(Buffer.from("Name,Email\n")),
    declaredMime: "text/csv",
    filename: "responses.csv",
  });
  assert.equal(csv.kind, "plain_text");
  assert.match(csv.text, /Name,Email/);

  await assert.rejects(
    () =>
      extractSource({
        bytes: new Uint8Array([0, 1, 2, 3, 200, 201, 202]),
        declaredMime: "application/octet-stream",
        filename: "mystery.bin",
      }),
    (err: unknown) => err instanceof UnsupportedFileError
  );
});

