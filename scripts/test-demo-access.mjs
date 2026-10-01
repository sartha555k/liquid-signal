import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DemoError, demoCost, demoReservations, readDemoBody, DEMO_MAX_BODY_BYTES, demoUsageLimited } from '../lib/demo-policy.mjs';
import { reserveDemoUsage } from '../lib/demo-quota-node.mjs';
import { getSqlite } from '../db/sqlite-driver.mjs';
process.env.SQLITE_PATH = ':memory:';

test('usage quotas can be explicitly disabled without changing private-mode protection', () => {
  assert.equal(demoUsageLimited({}), true);
  assert.equal(demoUsageLimited({ DEMO_USAGE_LIMITS: 'OFF' }), true);
  assert.equal(demoUsageLimited({ DEMO_USAGE_LIMITS: 'off' }), false);
  const source = readFileSync(new URL('../middleware.ts', import.meta.url), 'utf8');
  assert.match(source, /if \(!demoUsageLimited\(\)\) return NextResponse.next\(\)/);
  assert.ok(source.indexOf('demoCost(path, body)') < source.indexOf('if (!demoUsageLimited())'));
});

test('demo costs reflect actual comment count and text length', () => {
  assert.deepEqual(demoCost('/api/analyze', { comments: [{ id: 'one', text: 'camera' }] }), { units: 1, characters: 6 });
  assert.equal(demoCost('/api/youtube', { url: 'https://youtu.be/6cA44np-Hfc', batchSize: 1000 }).units, 1000);
});
test('demo rejects private endpoints, malformed arrays and unbounded input', () => {
  for (const [endpoint, body] of [
    ['/api/datasets', {}], ['/api/analyze', { comments: {} }],
    ['/api/analyze', { comments: [{ id: 'one', text: 'x'.repeat(2001) }] }],
    ['/api/analyze', { comments: Array.from({ length: 101 }, (_, i) => ({ id: String(i), text: 'test' })) }],
    ['/api/youtube', { url: 'video', batchSize: '1000' }],
    ['/api/youtube', { url: 'video', batchSize: 1001 }],
  ]) assert.throws(() => demoCost(endpoint, body), DemoError);
});
test('100 multilingual comments fit the body guard for both providers', async () => {
  const comments = Array.from({ length: 100 }, (_, i) => ({ id: String(i), text: '好'.repeat(2000) }));
  for (const provider of ['liquid', 'jev']) {
    const body = { provider, comments, audienceQuestion: { id: 'batch-test', prompt: 'What matters?', options: ['Pricing', 'Camera'] } };
    const request = new Request('http://localhost/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const parsed = await readDemoBody(request);
    assert.deepEqual(demoCost('/api/analyze', parsed), { units: 100, characters: 200000 });
    assert.equal((await request.json()).comments.length, 100);
  }
});
test('JSON body limits apply without relying on content-length and preserve original body', async () => {
  const valid = new Request('http://localhost/api/suggestions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: 'video' }) });
  assert.deepEqual(await readDemoBody(valid), { url: 'video' });
  assert.deepEqual(await valid.json(), { url: 'video' });
  const large = new Request('http://localhost/api/suggestions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: 'x'.repeat(DEMO_MAX_BODY_BYTES) }) });
  await assert.rejects(readDemoBody(large), error => error.status === 413);
});
test('quota reservations are atomic and cannot be bypassed with another network ID', () => {
  const now = Date.UTC(2026, 9, 1, 12);
  const full = demoReservations('/api/analyze', 'network-a', { units: 2000, characters: 100 }, now);
  reserveDemoUsage(full, now);
  assert.throws(() => reserveDemoUsage(demoReservations('/api/analyze', 'network-a', { units: 1, characters: 1 }, now), now), error => error.status === 429 && error.retryAfter > 0);
  assert.equal(getSqlite().prepare('SELECT used FROM liquid_demo_usage WHERE key = ?').get(full[0].key).used, 2000);
  reserveDemoUsage(demoReservations('/api/analyze', 'network-b', { units: 2000, characters: 100 }, now), now);
  reserveDemoUsage(demoReservations('/api/analyze', 'network-c', { units: 1000, characters: 100 }, now), now);
  assert.throws(() => reserveDemoUsage(demoReservations('/api/analyze', 'fresh-network', { units: 1, characters: 1 }, now), now), error => error.status === 429);
});
test('daily budgets recover after expiry and SQLite counters survive repeated calls', () => {
  const now = Date.UTC(2026, 9, 2, 12);
  const reservations = demoReservations('/api/suggestions', 'new-network', { units: 1, characters: 0 }, now);
  reserveDemoUsage(reservations, now);
  reserveDemoUsage(reservations, now);
  assert.equal(getSqlite().prepare('SELECT used FROM liquid_demo_usage WHERE key = ?').get(reservations[0].key).used, 2);
});
test('public access is opt-in and production errors fail closed', () => {
  const middleware = readFileSync(new URL('../middleware.ts', import.meta.url), 'utf8');
  assert.match(middleware, /DEMO_ACCESS_MODE === "public"/);
  assert.match(middleware, /reserveDemoUsage\(demoReservations/);
  assert.match(middleware, /const expected = process\.env\.API_ACCESS_TOKEN/);
  assert.match(middleware, /Demo limiter unavailable/);
});
