import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

// Run after build:render: tests the actual production bundler resolution, not
// just the SQLite adapter in isolation.
async function sources(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(await sources(filename));
    else if (entry.name.endsWith('.js')) result.push(await readFile(filename, 'utf8'));
  }
  return result.join('\n');
}
const bundle = await sources('dist/server');
assert.ok(!bundle.includes('Cloudflare D1 binding `DB` is unavailable'), 'Render must use SQLite, not the unbound Cloudflare database.');
assert.ok(bundle.includes('analysis_cache'));
assert.ok(/sqlite-driver|CREATE TABLE IF NOT EXISTS _liquid_migrations/.test(bundle));
console.log('Render production bundle uses the SQLite analysis cache.');
