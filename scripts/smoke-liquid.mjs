import assert from "node:assert/strict";

const base = process.env.LIQUID_TEST_BASE || "http://localhost:5174";
const question = { id: "liquid-smoke", prompt: "Which part of the video influenced this commenter's opinion most?", options: ["Pricing", "Camera", "Performance"] };
const comments = [
  { id: "smoke-price", text: "The price convinced me not to buy it. Too expensive compared with Samsung.", source: "csv" },
  { id: "smoke-camera", text: "कैमरा का वीडियो सैंपल बहुत अच्छा लगा, मैं इसे खरीदने की सोच रहा हूँ।", source: "csv" },
  { id: "smoke-irrelevant", text: "First! Have a nice day everybody.", source: "csv" },
];

const health = await fetch(`${base}/api/health`);
assert.equal(health.status, 200, "Backend health failed");
assert.equal((await health.json()).provider, "liquid");

async function analyze(body) {
  const res = await fetch(`${base}/api/analyze`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(90_000),
  });
  const payload = await res.json();
  if (!res.ok) throw new Error(`Analysis HTTP ${res.status}: ${payload.error}`);
  assert.equal(payload.provider, "liquid");
  assert.equal(payload.comments.length, comments.length);
  assert.equal(payload.outputTokens, 0);
  for (const comment of payload.comments) {
    assert.equal(comment.analysis.version, "liquid-d1-v1");
    assert.equal(comment.analysis.audienceAnswer.questionId, body.audienceQuestion.id);
    assert.ok(Number.isFinite(comment.analysis.purchaseIntent));
    assert.ok(Number.isFinite(comment.analysis.audienceAnswer.confidence));
  }
  console.log(JSON.stringify({
    model: payload.model, completed: payload.comments.length, elapsedMs: payload.elapsedMs,
    inputTokens: payload.inputTokens, cachedCount: payload.cachedCount,
    answers: payload.comments.map(c => ({ id: c.id, choice: c.analysis.audienceAnswer.choice, confidence: c.analysis.audienceAnswer.confidence })),
  }, null, 2));
  return payload;
}

const first = await analyze({ comments, audienceQuestion: question });
const repeated = await analyze({ comments, audienceQuestion: { ...question, id: "liquid-smoke-new-run" } });
assert.equal(repeated.cachedCount, comments.length, "Repeat should reuse cached decisions");
assert.equal(repeated.inputTokens, 0, "Repeat should not spend input tokens");
const secondQuestion = { id: "liquid-smoke-second", prompt: "Is the commenter considering purchasing the product?", options: ["Considering purchase", "Not considering purchase", "No clear position"] };
const second = await analyze({ comments: first.comments, audienceQuestion: secondQuestion, audienceOnly: true });
for (let i = 0; i < first.comments.length; i++) {
  const coreFirst = { ...first.comments[i].analysis };
  const coreSecond = { ...second.comments[i].analysis };
  delete coreFirst.audienceAnswer;
  delete coreSecond.audienceAnswer;
  assert.deepEqual(coreSecond, coreFirst, "Question-only pass changed core signals");
}
console.log("Liquid smoke checks passed: initial analysis, repeat, and question-only reanalysis.");
