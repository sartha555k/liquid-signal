import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const datasets = sqliteTable(
  "datasets",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    source: text("source").notNull(),
    sourceLabel: text("source_label").notNull(),
    commentCount: integer("comment_count").notNull().default(0),
    analyzedAt: text("analyzed_at"),
    model: text("model"),
    inputTokens: integer("input_tokens"),
    costMicros: integer("cost_micros"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_datasets_updated_at").on(table.updatedAt),
  ]
);

export const comments = sqliteTable(
  "comments",
  {
    id: text("id").primaryKey(),
    datasetId: text("dataset_id").notNull().references(() => datasets.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    sourceId: text("source_id"),
    text: text("text").notNull(),
    publishedAt: text("published_at"),
    analysisJson: text("analysis_json"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_comments_dataset_id").on(table.datasetId),
    index("idx_comments_source_id").on(table.sourceId),
  ]
);
