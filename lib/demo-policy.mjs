import { MAX_ANALYSIS_BATCH_SIZE } from './analysis-batching.mjs';

export const DEMO_MAX_SAMPLE = 1000;
// Fits 100 multilingual comments (up to 2,000 characters each) plus metadata.
export const DEMO_MAX_BODY_BYTES = 1024 * 1024;

// Explicit owner opt-in; missing/misspelled settings keep fair-use quotas.
export function demoUsageLimited(environment = process.env) {
  return environment.DEMO_USAGE_LIMITS !== 'off';
}

export class DemoError extends Error {
  constructor(message, status = 400, retryAfter = 0) {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

const rules = {
  '/api/analyze': { global: 5000, network: 2000, minute: 120 },
  '/api/suggestions': { global: 60, network: 10, minute: 5 },
  '/api/answer': { global: 40, network: 10, minute: 5 },
  '/api/youtube': { global: 30000, network: 5000, minute: 30 },
};

function string(value, max, name) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new DemoError(`${name} must be a nonempty string of at most ${max} characters.`);
}

export function demoCost(path, body) {
  if (!rules[path]) throw new DemoError('This endpoint is not available in the public demo.', 403);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new DemoError('Send a JSON object.');
  let units = 1;
  let characters = 0;
  if (path === '/api/analyze') {
    if (!Array.isArray(body.comments) || body.comments.length < 1 || body.comments.length > MAX_ANALYSIS_BATCH_SIZE) throw new DemoError(`Each demo analysis batch needs 1–${MAX_ANALYSIS_BATCH_SIZE} comments.`, 413);
    for (const comment of body.comments) {
      if (!comment || typeof comment !== 'object') throw new DemoError('Invalid comment.');
      string(comment.id, 200, 'Comment ID');
      string(comment.text, 2000, 'Comment text');
      characters += comment.text.length;
    }
    if (body.provider !== undefined && !['liquid', 'jev'].includes(body.provider)) throw new DemoError('Choose Liquid d1 or Jev.');
    if (body.audienceQuestion) {
      const q = body.audienceQuestion;
      string(q.id, 200, 'Question ID');
      string(q.prompt, 240, 'Question');
      if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 6) throw new DemoError('Give 2–6 answer choices.');
      for (const option of q.options) string(option, 80, 'Answer choice');
    }
    units = body.comments.length;
  } else if (path === '/api/youtube' || path === '/api/suggestions') {
    string(body.url, 2048, 'YouTube URL');
    if (path === '/api/youtube') {
      const size = body.batchSize ?? 250;
      if (!Number.isInteger(size) || size < 1 || size > DEMO_MAX_SAMPLE) throw new DemoError(`Demo imports support up to ${DEMO_MAX_SAMPLE} comments per request.`, 413);
      if (body.pageToken != null) string(body.pageToken, 2048, 'Page token');
      units = size;
    }
  } else {
    string(body.question, 240, 'Question');
    if (!Array.isArray(body.results) || body.results.length < 2 || body.results.length > 6) throw new DemoError('Give 2–6 result options.');
    for (const result of body.results) {
      if (!result || typeof result !== 'object') throw new DemoError('Invalid result option.');
      string(result.option, 80, 'Result option');
    }
    if (body.evidence !== undefined) {
      if (!Array.isArray(body.evidence) || body.evidence.length > 18) throw new DemoError('Give at most 18 evidence comments.');
      for (const item of body.evidence) {
        if (!item || typeof item !== 'object') throw new DemoError('Invalid evidence comment.');
        string(item.option, 80, 'Evidence option');
        string(item.text, 400, 'Evidence text');
      }
    }
  }
  return { units, characters };
}

export function demoReservations(path, network, cost, now = Date.now()) {
  const rule = rules[path];
  if (!rule) throw new DemoError('This endpoint is not available in the public demo.', 403);
  const day = Math.floor(now / 86400000);
  const minute = Math.floor(now / 60000);
  const dayReset = (day + 1) * 86400000;
  return [
    { key: `global:${path}:${day}`, amount: cost.units, limit: rule.global, reset: dayReset },
    { key: `network:${network}:${path}:${day}`, amount: cost.units, limit: rule.network, reset: dayReset },
    { key: `rate:${network}:${path}:${minute}`, amount: 1, limit: rule.minute, reset: (minute + 1) * 60000 },
    ...(cost.characters ? [{ key: `characters:${day}`, amount: cost.characters, limit: 2000000, reset: dayReset }] : []),
  ];
}

export async function readDemoBody(request) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new DemoError('Send application/json.', 415);
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > DEMO_MAX_BODY_BYTES) throw new DemoError('The demo request is too large.', 413);
  const reader = request.clone().body?.getReader();
  if (!reader) throw new DemoError('A JSON request body is required.');
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > DEMO_MAX_BODY_BYTES) {
        void reader.cancel().catch(() => {});
        throw new DemoError('The demo request is too large.', 413);
      }
      chunks.push(value);
    }
    const data = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.length; }
    try { return JSON.parse(new TextDecoder().decode(data)); }
    catch { throw new DemoError('The request body is not valid JSON.'); }
  } finally { reader.releaseLock(); }
}
