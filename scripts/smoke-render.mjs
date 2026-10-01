import assert from "node:assert/strict";

const base = process.env.RENDER_TEST_BASE || "https://liquid-signal.onrender.com";
const token = process.env.API_ACCESS_TOKEN;
let publicDemo = false;
async function call(path, body, authorized = true, status = 200) {
  const response = await fetch(base + path, { method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", ...(authorized && !publicDemo && token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(90_000) });
  const payload = await response.json();
  assert.equal(response.status, status, payload.error ?? `Unexpected HTTP ${response.status}`);
  console.log(JSON.stringify({ endpoint: path, status: response.status }));
  return payload;
}

const health = await call("/api/health");
publicDemo = Boolean(health.demo?.enabled);
assert.ok(publicDemo || token, "Private mode requires API_ACCESS_TOKEN through an ignored environment file.");
assert.equal(health.providers.liquid, true);
assert.equal(health.providers.jev, true);
await call("/api/analyze", { comments: [] }, false, publicDemo ? 413 : 401);
if (publicDemo) {
  await call("/api/datasets", undefined, false, 403);
  await call("/api/youtube", { url: "https://youtu.be/6cA44np-Hfc", batchSize: 1001 }, false, 413);
}
const url = "https://youtu.be/6cA44np-Hfc";
const imported = await call("/api/youtube", { url, batchSize: 3 });
assert.ok(imported.comments.length > 0);
console.log(JSON.stringify({ importedComments: imported.comments.length, videoTitle: imported.videoTitle }));
const suggestions = await call("/api/suggestions", { url });
assert.ok(suggestions.suggestions?.length >= 2);
console.log(JSON.stringify({ suggestions: suggestions.suggestions.length }));
const question = { id: "render-e2e", prompt: "Which part of the video influenced this opinion most?", options: ["Pricing", "Camera", "Performance"] };
let analyzed;
for (const provider of ["liquid", "jev"]) {
  const result = await call("/api/analyze", { provider, comments: imported.comments, audienceQuestion: question });
  assert.equal(result.provider, provider);
  assert.equal(result.comments.length, imported.comments.length);
  assert.ok(result.comments.every(comment => comment.analysis?.provider === provider && comment.analysis?.audienceAnswer?.questionId === question.id));
  console.log(JSON.stringify({ provider, model: result.model, analyzed: result.comments.length }));
  analyzed = result.comments;
}
const relevant = analyzed.filter(comment => comment.analysis.audienceAnswer.choice);
const counts = question.options.map(option => ({ option, count: relevant.filter(comment => comment.analysis.audienceAnswer.choice === option).length }));
const final = await call("/api/answer", { question: question.prompt, videoTitle: imported.videoTitle,
  commentsAnalyzed: analyzed.length, relevantComments: relevant.length, excludedComments: analyzed.length - relevant.length,
  results: counts.map(item => ({ ...item, share: relevant.length ? Math.round(item.count / relevant.length * 100) : 0 })),
  evidence: relevant.map(comment => ({ option: comment.analysis.audienceAnswer.choice, text: comment.text.slice(0, 400), confidence: comment.analysis.audienceAnswer.confidence })) });
assert.ok(final.answer?.length > 20);
assert.ok(final.model);
console.log(JSON.stringify({ summaryModel: final.model, answerCharacters: final.answer.length }));
console.log("Render end-to-end checks passed.");
