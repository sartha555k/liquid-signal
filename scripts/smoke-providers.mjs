import assert from "node:assert/strict";

const base = process.env.LIQUID_TEST_BASE || "http://localhost:5174";
const question = { id: "provider-smoke", prompt: "What influenced this opinion most?", options: ["Pricing", "Camera"] };
const comments = [{ id: "provider-price", text: "Too expensive. The price is why I will not buy it.", source: "csv" }];

async function request(body, status = 200) {
  const response = await fetch(`${base}/api/analyze`, {
    method: "POST", headers: { "Content-Type": "application/json", ...(process.env.API_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.API_ACCESS_TOKEN}` } : {}) },
    body: JSON.stringify(body), signal: AbortSignal.timeout(90_000),
  });
  const payload = await response.json();
  assert.equal(response.status, status, payload.error ?? `Unexpected HTTP ${response.status}`);
  return payload;
}

await request({ provider: "unknown", comments }, 400);
const outputs = {};
for (const provider of ["liquid", "jev"]) {
  const first = await request({ provider, comments, audienceQuestion: question });
  assert.equal(first.provider, provider);
  assert.equal(first.comments.length, comments.length);
  assert.equal(first.comments[0].analysis.provider, provider);
  assert.equal(first.comments[0].analysis.audienceAnswer.questionId, question.id);
  const repeat = await request({ provider, comments, audienceQuestion: { ...question, id: "provider-repeat" } });
  assert.equal(repeat.cachedCount, comments.length);
  assert.equal(repeat.inputTokens, 0);
  assert.equal(repeat.comments[0].analysis.audienceAnswer.questionId, "provider-repeat");
  const followup = { id: "provider-followup", prompt: "Does this commenter intend to buy?", options: ["Intends to buy", "Does not intend to buy"] };
  const next = await request({ provider, comments: first.comments, audienceQuestion: followup, audienceOnly: true });
  const core = ({ audienceAnswer, ...rest }) => rest;
  assert.deepEqual(core(next.comments[0].analysis), core(first.comments[0].analysis));
  outputs[provider] = first;
  console.log(JSON.stringify({ provider, model: first.model, version: first.analysisVersion, completed: first.comments.length, cached: first.cachedCount, answer: first.comments[0].analysis.audienceAnswer.choice }));
}
assert.notEqual(outputs.liquid.analysisVersion, outputs.jev.analysisVersion);
await request({ provider: "jev", comments: outputs.liquid.comments, audienceQuestion: question, audienceOnly: true }, 400);
await request({ provider: "liquid", comments: outputs.jev.comments, audienceQuestion: question, audienceOnly: true }, 400);
console.log("Both providers passed: routing, complete output, isolated cache, and question-only compatibility.");
