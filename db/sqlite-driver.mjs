import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

let database;
export function getSqlite() {
  if (database) return database;
  const filename = process.env.SQLITE_PATH || path.join(process.cwd(), ".data", "liquid-signal.sqlite");
  if (filename !== ":memory:") mkdirSync(path.dirname(filename), { recursive: true });
  const candidate = new DatabaseSync(filename);
  try {
    candidate.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;");
    candidate.exec("CREATE TABLE IF NOT EXISTS _liquid_migrations (name TEXT PRIMARY KEY);");
    const migrationsDir = path.join(process.cwd(), "drizzle");
    for (const name of readdirSync(migrationsDir).filter(name => name.endsWith(".sql")).sort()) {
      if (candidate.prepare("SELECT name FROM _liquid_migrations WHERE name = ?").get(name)) continue;
      candidate.exec("BEGIN IMMEDIATE");
      try {
        candidate.exec(readFileSync(path.join(migrationsDir, name), "utf8"));
        candidate.prepare("INSERT INTO _liquid_migrations(name) VALUES (?)").run(name);
        candidate.exec("COMMIT");
      } catch (error) { candidate.exec("ROLLBACK"); throw error; }
    }
    database = candidate;
    return database;
  } catch (error) { candidate.close(); throw error; }
}

export function executeSync(sql, params, method) {
  const statement = getSqlite().prepare(sql);
  if (method === "run") { statement.run(...params); return { rows: [] }; }
  statement.setReturnArrays(true);
  return { rows: method === "get" ? statement.get(...params) ?? [] : statement.all(...params) };
}

export async function executeSqlite(sql, params, method) { return executeSync(sql, params, method); }

export async function executeSqliteBatch(queries) {
  const db = getSqlite();
  db.exec("BEGIN IMMEDIATE");
  try {
    const results = queries.map(query => executeSync(query.sql, query.params, query.method));
    db.exec("COMMIT");
    return results;
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}
