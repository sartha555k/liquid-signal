import { drizzle } from "drizzle-orm/sqlite-proxy";
import { executeSqlite, executeSqliteBatch } from "./sqlite-driver.mjs";
import * as schema from "./schema";

const db = drizzle(executeSqlite, executeSqliteBatch, { schema });
export function getDb() { return db; }
