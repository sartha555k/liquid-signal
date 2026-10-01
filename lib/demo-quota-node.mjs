import { getSqlite } from '../db/sqlite-driver.mjs';
import { DemoError } from './demo-policy.mjs';

// Render's free disk is ephemeral. These are per-instance demo safeguards,
// not durable billing caps; use a persistent store before a public launch.
export function reserveDemoUsage(reservations, now = Date.now()) {
  const db = getSqlite();
  db.exec('CREATE TABLE IF NOT EXISTS liquid_demo_usage (key TEXT PRIMARY KEY, used INTEGER NOT NULL, resets_at INTEGER NOT NULL)');
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('DELETE FROM liquid_demo_usage WHERE resets_at <= ?').run(now);
    for (const reservation of reservations) {
      const used = db.prepare('SELECT used FROM liquid_demo_usage WHERE key = ?').get(reservation.key)?.used ?? 0;
      if (used + reservation.amount > reservation.limit) {
        throw new DemoError('The demo fair-use limit has been reached. Please try after the limit resets.', 429, Math.max(1, Math.ceil((reservation.reset - now) / 1000)));
      }
    }
    for (const reservation of reservations) {
      db.prepare('INSERT INTO liquid_demo_usage(key, used, resets_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET used = used + excluded.used')
        .run(reservation.key, reservation.amount, reservation.reset);
    }
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
