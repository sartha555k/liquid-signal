import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { comments, datasets } from "@/db/schema";
import type { SignalDataset } from "@/lib/types";

export async function GET() {
  try {
    const db = getDb();
    const rows = await db.select().from(datasets).orderBy(desc(datasets.updatedAt)).limit(10);
    return Response.json({ datasets: rows });
  } catch (error) {
    console.error("Dataset list unavailable", error);
    return Response.json({ datasets: [], cacheAvailable: false });
  }
}

export async function POST(request: Request) {
  try {
    const dataset = await request.json() as SignalDataset;
    if (!dataset.id || !dataset.name || !Array.isArray(dataset.comments)) {
      return Response.json({ error: "Invalid dataset." }, { status: 400 });
    }
    const db = getDb();
    const now = new Date().toISOString();
    await db.batch([
      db.insert(datasets).values({
        id: dataset.id,
        name: dataset.name,
        source: dataset.source,
        sourceLabel: dataset.sourceLabel,
        commentCount: dataset.comments.length,
        analyzedAt: dataset.analyzedAt,
        model: dataset.model,
        inputTokens: dataset.inputTokens,
        costMicros: dataset.costUsd == null ? null : Math.round(dataset.costUsd * 1_000_000),
        audienceQuestionJson: dataset.audienceQuestion ? JSON.stringify(dataset.audienceQuestion) : null,
        createdAt: now,
        updatedAt: now,
      }).onConflictDoUpdate({
        target: datasets.id,
        set: {
          name: dataset.name,
          commentCount: dataset.comments.length,
          analyzedAt: dataset.analyzedAt,
          model: dataset.model,
          inputTokens: dataset.inputTokens,
          costMicros: dataset.costUsd == null ? null : Math.round(dataset.costUsd * 1_000_000),
          audienceQuestionJson: dataset.audienceQuestion ? JSON.stringify(dataset.audienceQuestion) : null,
          updatedAt: now,
        },
      }),
      db.delete(comments).where(eq(comments.datasetId, dataset.id)),
    ]);
    if (dataset.comments.length) {
      await db.insert(comments).values(dataset.comments.map((comment) => ({
        id: comment.id,
        datasetId: dataset.id,
        source: comment.source,
        sourceId: comment.sourceId,
        text: comment.text,
        publishedAt: comment.publishedAt,
        analysisJson: comment.analysis ? JSON.stringify(comment.analysis) : null,
        createdAt: now,
      })));
    }
    return Response.json({ cached: true });
  } catch (error) {
    console.error("Dataset cache unavailable", error);
    return Response.json({ cached: false }, { status: 202 });
  }
}
