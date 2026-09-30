import test from "node:test";
import assert from "node:assert/strict";
import { validateDecisionAnswers } from "../lib/liquid-decisions.ts";

const questions = {
  audience_answer: { type: "choice", criteria: { option_0: "Pricing", not_relevant: "Unclear" } },
  purchase_intent: { type: "score", criteria: ["None", "Curious", "Considering", "Ready"] },
};
function valid() {
  return { answers: {
    audience_answer: { type: "choice", choice: "option_0", probabilities: { option_0: .8, not_relevant: .2 }, confidence: .7 },
    purchase_intent: { type: "score", score: 2.2, probabilities: { 0: .1, 1: .1, 2: .3, 3: .5 }, confidence: .5 },
  } };
}
test("accepts all complete typed answers", () => assert.doesNotThrow(() => validateDecisionAnswers(valid(), questions)));
test("rejects a missing audience answer instead of caching incomplete results", () => {
  const p = valid(); delete p.answers.audience_answer;
  assert.throws(() => validateDecisionAnswers(p, questions), /audience_answer/);
});
test("rejects missing category probabilities", () => {
  const p = valid(); delete p.answers.audience_answer.probabilities.not_relevant;
  assert.throws(() => validateDecisionAnswers(p, questions));
});
test("rejects invented options and nonfinite scores", () => {
  const p = valid(); p.answers.audience_answer.choice = "invented";
  assert.throws(() => validateDecisionAnswers(p, questions));
  const p2 = valid(); p2.answers.purchase_intent.score = NaN;
  assert.throws(() => validateDecisionAnswers(p2, questions));
});
test("rejects a wrong answer type and invalid distributions", () => {
  const p = valid(); p.answers.audience_answer.type = "noul";
  assert.throws(() => validateDecisionAnswers(p, questions));
  const p2 = valid(); p2.answers.audience_answer.probabilities.option_0 = .1;
  assert.throws(() => validateDecisionAnswers(p2, questions));
});
