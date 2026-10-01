import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_ANALYSIS_BATCH_SIZE, ANALYSIS_WORKERS_PER_REQUEST, runDecisionWorkers } from '../lib/analysis-batching.mjs';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
test('100 classifications run with ten workers and preserve every result in order', async () => {
  assert.equal(MAX_ANALYSIS_BATCH_SIZE, 100);
  assert.equal(ANALYSIS_WORKERS_PER_REQUEST, 10);
  const items = Array.from({ length: 100 }, (_, i) => i);
  let active = 0;
  let peak = 0;
  const output = await runDecisionWorkers(items, async item => {
    active++;
    peak = Math.max(peak, active);
    await delay(1 + (item % 4));
    active--;
    return { id: item };
  }, new AbortController().signal);
  assert.equal(peak, 10);
  assert.deepEqual(output.results, items.map(id => ({ id })));
  assert.deepEqual(output.failures, []);
});

test('failed comments do not discard successful cacheable classifications', async () => {
  const output = await runDecisionWorkers([0, 1, 2], async item => {
    if (item === 1) throw new Error('retry me');
    return item;
  }, new AbortController().signal);
  assert.deepEqual(output.results, [0, 2]);
  assert.equal(output.failures.length, 1);
});

test('cancellation never becomes a successful partial response', async () => {
  const controller = new AbortController();
  await assert.rejects(runDecisionWorkers(Array.from({ length: 100 }, (_, i) => i), async item => {
    controller.abort();
    return item;
  }, controller.signal), { name: 'AbortError' });
});
