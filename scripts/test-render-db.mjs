import test from "node:test";
import assert from "node:assert/strict";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema.ts";
import { executeSqlite, executeSqliteBatch } from "../db/sqlite-driver.mjs";

process.env.SQLITE_PATH = ":memory:";
const db = drizzle(executeSqlite, executeSqliteBatch, { schema });
test("Render SQLite adapter migrates, returns typed rows, and rolls back batches", async () => {
  const row = { id: "render-test", name: "Test", source: "csv", sourceLabel: "Test", createdAt: "now", updatedAt: "now" };
  await db.insert(schema.datasets).values(row);
  const rows = await db.select().from(schema.datasets).where(eq(schema.datasets.id, row.id));
  assert.equal(rows[0].name, "Test");
  await db.batch([db.update(schema.datasets).set({ name: "Updated" }).where(eq(schema.datasets.id, row.id)), db.insert(schema.analysisCache).values({ key: "key", analysisJson: "{}", model: "d1:free", createdAt: "now" })]);
  assert.equal((await db.select().from(schema.datasets))[0].name, "Updated");
  await assert.rejects(db.batch([db.delete(schema.datasets).where(eq(schema.datasets.id, row.id)), db.insert(schema.comments).values({ id: "bad", datasetId: "nonexistent", source: "csv", text: "Test", createdAt: "now" })]));
  assert.equal((await db.select().from(schema.datasets))[0].name, "Updated");
  assert.equal((await db.select().from(schema.analysisCache))[0].model, "d1:free");
});
