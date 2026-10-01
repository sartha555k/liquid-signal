import assert from 'node:assert/strict';

const base = process.env.RENDER_TEST_BASE || 'https://liquid-signal.onrender.com';
async function post(path, body, status = 200) {
  const response = await fetch(base + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(90_000),
  });
  const payload = await response.json();
  assert.equal(response.status, status, payload.error ?? `Unexpected HTTP ${response.status}`);
  return payload;
}
const imported = await post('/api/youtube', { url: 'https://youtu.be/6cA44np-Hfc', batchSize: 100 });
assert.equal(imported.comments.length, 100, 'Smoke video must provide a full 100-comment batch.');
const comments = imported.comments.map(comment => ({ ...comment, text: comment.text.slice(0, 2000) }));
const question = { id: 'batch-100-smoke', prompt: 'Which part of the video influenced this opinion most?', options: ['Pricing', 'Camera', 'Performance'] };
for (const provider of ['liquid', 'jev']) {
  const started = Date.now();
  const result = await post('/api/analyze', { provider, comments, audienceQuestion: question });
  assert.equal(result.provider, provider);
  assert.equal(result.batchSize, 100);
  assert.equal(result.concurrency, 10);
  assert.deepEqual(result.comments.map(comment => comment.id), comments.map(comment => comment.id));
  assert.ok(result.comments.every(comment => comment.analysis?.provider === provider && comment.analysis?.audienceAnswer?.questionId === question.id));
  console.log(JSON.stringify({ provider, comments: result.comments.length, workers: result.concurrency, cached: result.cachedCount, elapsedMs: Date.now() - started }));
  const repeat = await post('/api/analyze', { provider, comments, audienceQuestion: { ...question, id: 'batch-100-repeat' } });
  assert.equal(repeat.cachedCount, 100);
  assert.equal(repeat.inputTokens, 0);
  assert.ok(repeat.comments.every(comment => comment.analysis.audienceAnswer.questionId === 'batch-100-repeat'));
  await post('/api/analyze', { provider, comments: [...comments, { ...comments[0], id: 'overflow' }] }, 413);
}
console.log('Both providers passed full 100-comment batches, ordering, cache reuse and 101-comment rejection.');
