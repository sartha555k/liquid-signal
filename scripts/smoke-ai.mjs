import assert from "node:assert/strict";
const base = process.env.LIQUID_TEST_BASE || "http://localhost:5174";
async function post(path, body) {
  const response = await fetch(base + path, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(90_000),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}: ${payload.error}`);
  return payload;
}
const suggestions = await post("/api/suggestions", { url: "https://www.youtube.com/watch?v=6cA44np-Hfc" });
assert.ok(suggestions.suggestions.length >= 2);
for (const item of suggestions.suggestions) {
  assert.ok(item.question.trim());
  assert.ok(item.options.length >= 2 && item.options.length <= 6);
}
console.log(JSON.stringify({ suggestions: suggestions.suggestions.length, model: suggestions.model, videoTitle: suggestions.videoTitle }));
const answer = await post("/api/answer", {
  question: "Which part of the video influenced viewers most?", videoTitle: "Synthetic test fixture",
  commentsAnalyzed: 3, relevantComments: 2, excludedComments: 1,
  results: [{ option: "Pricing", count: 1, share: 50 }, { option: "Camera", count: 1, share: 50 }],
  evidence: [{ option: "Pricing", text: "Too expensive", confidence: .8 }, { option: "Camera", text: "I liked the camera sample", confidence: .7 }],
});
assert.ok(answer.answer?.trim());
console.log(JSON.stringify({ narrative: "returned", model: answer.model, characters: answer.answer.length }));
console.log("OpenAI suggestions and narrative checks passed.");
