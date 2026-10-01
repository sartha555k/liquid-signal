import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../app/privacy/page.tsx", import.meta.url), "utf8");
test("public privacy policy identifies the operator, contact, date, and recipients", () => {
  for (const text of ["Sarthak Patel", "beyondthebuildofficial@gmail.com", "2 October 2026", "Render", "YouTube", "OpenAI", "TypeSafe", "Liquid AI"]) assert.ok(page.includes(text), text);
  assert.doesNotMatch(page, /process\.env|cookies\(|getSession|Date\.now|Math\.random/);
});
test("policy accurately describes retention, consent, and incidental personal data", () => {
  for (const text of ["Reports older than 30 days are removed when a new report is saved", "no automatic expiry", "not automatically redacted", "Pause AI processing", "store: false", "Limited Use"]) assert.ok(page.includes(text), text);
});
