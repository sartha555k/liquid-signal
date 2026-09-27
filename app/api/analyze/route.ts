import { inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { analysisCache } from "@/db/schema";
import { readSecret } from "@/lib/server-env";
import type { AudienceQuestion, ObjectionKey, SignalComment } from "@/lib/types";

const MODEL = "jev-1.13.0";
const API_URL = "https://api.typesafe.ai/v1/systemone";
const MAX_BATCH_SIZE = 25;
const REQUEST_CONCURRENCY = 6;
const ANALYSIS_VERSION = "compact-v2";

type JevChoice = {
  type: "choice";
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
};

type JevResponse = {
  model: string;
  answers: {
    objection_type: JevChoice;
    purchase_intent: { type: "score"; score: number; confidence: number };
    moderation_status: JevChoice;
    audience_answer?: JevChoice;
  };
  usage?: { input_tokens?: number };
};

function cleanAudienceQuestion(value: unknown): AudienceQuestion | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<AudienceQuestion>;
  const prompt = candidate.prompt?.trim().slice(0, 240);
  const options = [...new Set((candidate.options ?? []).map((option) => option.trim()).filter(Boolean))].slice(0, 6);
  if (!candidate.id || !prompt || options.length < 2) return undefined;
  return { id: candidate.id, prompt, options };
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

function audienceCriteria(question: AudienceQuestion) {
  return {
    ...Object.fromEntries(question.options.map((option, index) => [`option_${index}`, option])),
    not_relevant: "The comment does not answer the question or its position is unclear.",
  };
}

async function cacheKey(comment: SignalComment, question?: AudienceQuestion) {
  const normalized = comment.text.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();
  const questionSignature = question
    ? `${question.prompt.toLocaleLowerCase()}|${question.options.map((option) => option.toLocaleLowerCase()).join("|")}`
    : "no-audience-question";
  const bytes = new TextEncoder().encode(`${ANALYSIS_VERSION}|${questionSignature}|${normalized}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function classify(comment: SignalComment, question: AudienceQuestion | undefined, apiKey: string) {
  const questions: Record<string, unknown> = {
    objection_type: {
      type: "choice",
      instructions: "Choose the comment's primary purchase objection, or none.",
      criteria: {
        none: "No purchase objection.",
        sensitive_skin_safety: "Safety, irritation, allergy, sensitivity or side effects.",
        price_value: "Price, affordability, value or a cheaper alternative.",
        trust_proof: "Trust, evidence, authenticity, reviews, claims or proof.",
        product_fit: "Suitability, compatibility, routine or lifestyle fit.",
        effectiveness: "Whether or how quickly the product works.",
        ethics: "Cruelty-free, vegan, sourcing or environmental concerns.",
        shipping_availability: "Shipping, delivery, stock, location or where to buy.",
        usage: "How, when or how often to use it.",
        other: "A different purchase barrier.",
      },
    },
    purchase_intent: {
      type: "score",
      instructions: "Rate purchase intent.",
      criteria: ["None or rejection", "Curious", "Considering", "Ready to buy"],
    },
    moderation_status: {
      type: "choice",
      instructions: "Classify moderation risk.",
      criteria: {
        clean: "Genuine, relevant and non-abusive.",
        spam: "Spam, scam, promotion or meaningless repetition.",
        abusive: "Direct abuse, threat or hate.",
        both: "Both spam and abusive.",
      },
    },
  };

  if (question) {
    questions.audience_answer = {
      type: "choice",
      instructions: question.prompt,
      criteria: audienceCriteria(question),
    };
  }

  const response = await fetch(API_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, state: comment.text, questions }),
  });

  const payload = await response.json() as JevResponse & { detail?: string; message?: string };
  if (!response.ok) throw new Error(payload.detail ?? payload.message ?? `Jev returned ${response.status}`);

  const objection = payload.answers.objection_type;
  const moderation = payload.answers.moderation_status;
  const isObjection = clamp(1 - (objection.probabilities.none ?? (objection.choice === "none" ? 1 : 0)));
  const chosenObjection = objection.choice === "none" ? "other" : objection.choice;
  const spam = clamp((moderation.probabilities.spam ?? 0) + (moderation.probabilities.both ?? 0));
  const abuse = clamp((moderation.probabilities.abusive ?? 0) + (moderation.probabilities.both ?? 0));
  const audience = payload.answers.audience_answer;
  const audienceChoice = audience?.choice?.startsWith("option_")
    ? question?.options[Number(audience.choice.slice(7))] ?? null
    : null;

  return {
    comment: {
      ...comment,
      analysis: {
        version: ANALYSIS_VERSION,
        isObjection,
        objectionType: chosenObjection as ObjectionKey,
        objectionConfidence: objection.confidence,
        purchaseIntent: clamp(payload.answers.purchase_intent.score / 3),
        spam,
        abuse,
        reviewRequired: (isObjection >= .35 && isObjection < .65)
          || (isObjection >= .65 && objection.confidence < .55),
        ...(question && audience ? {
          audienceAnswer: {
            questionId: question.id,
            choice: audienceChoice,
            confidence: audience.confidence,
            probabilities: Object.fromEntries([
              ...question.options.map((option, index) => [option, audience.probabilities[`option_${index}`] ?? 0] as const),
              ["Not relevant", audience.probabilities.not_relevant ?? 0],
            ]),
          },
        } : {}),
      },
    } satisfies SignalComment,
    inputTokens: payload.usage?.input_tokens ?? 0,
    model: payload.model,
  };
}

export async function POST(request: Request) {
  try {
    const apiKey = readSecret("TYPESAFE_API_KEY");
    if (!apiKey) return Response.json({ error: "Live Jev analysis is not configured yet." }, { status: 503 });

    const body = await request.json() as { comments?: SignalComment[]; audienceQuestion?: unknown };
    const comments = (body.comments ?? []).filter((comment) => comment.text?.trim()).slice(0, MAX_BATCH_SIZE);
    const question = cleanAudienceQuestion(body.audienceQuestion);
    if (!comments.length) return Response.json({ error: "No comments were provided." }, { status: 400 });
    if (body.audienceQuestion && !question) {
      return Response.json({ error: "An audience question needs a prompt and at least two distinct options." }, { status: 400 });
    }

    const keys = await Promise.all(comments.map((comment) => cacheKey(comment, question)));
    const cached = new Map<string, { analysis: SignalComment["analysis"]; model: string }>();
    try {
      const db = getDb();
      const rows = await db.select().from(analysisCache).where(inArray(analysisCache.key, keys));
      rows.forEach((row) => cached.set(row.key, { analysis: JSON.parse(row.analysisJson), model: row.model }));
    } catch (error) {
      console.warn("Analysis cache read unavailable", error);
    }

    const results: Array<Awaited<ReturnType<typeof classify>>> = [];
    const misses = comments.map((comment, index) => ({ comment, key: keys[index] })).filter(({ key }) => !cached.has(key));
    for (let index = 0; index < misses.length; index += REQUEST_CONCURRENCY) {
      const group = misses.slice(index, index + REQUEST_CONCURRENCY);
      results.push(...await Promise.all(group.map(({ comment }) => classify(comment, question, apiKey))));
    }

    if (results.length) {
      try {
        const db = getDb();
        const now = new Date().toISOString();
        const resultById = new Map(results.map((result) => [result.comment.id, result]));
        await db.insert(analysisCache).values(misses.flatMap(({ comment, key }) => {
          const result = resultById.get(comment.id);
          return result?.comment.analysis ? [{ key, analysisJson: JSON.stringify(result.comment.analysis), model: result.model, createdAt: now }] : [];
        })).onConflictDoNothing();
      } catch (error) {
        console.warn("Analysis cache write unavailable", error);
      }
    }

    const freshById = new Map(results.map((result) => [result.comment.id, result]));
    const output = comments.map((comment, index) => {
      const fresh = freshById.get(comment.id);
      if (fresh) return fresh.comment;
      return { ...comment, analysis: cached.get(keys[index])?.analysis };
    });
    const inputTokens = results.reduce((total, result) => total + result.inputTokens, 0);
    return Response.json({
      comments: output,
      model: results[0]?.model ?? cached.values().next().value?.model ?? MODEL,
      inputTokens,
      costUsd: Number(((inputTokens / 1_000_000) * .042).toFixed(6)),
      batchSize: MAX_BATCH_SIZE,
      cachedCount: comments.length - results.length,
      analysisVersion: ANALYSIS_VERSION,
    });
  } catch (error) {
    console.error("Jev analysis failed", error);
    return Response.json({ error: error instanceof Error ? error.message : "Jev analysis could not be completed." }, { status: 502 });
  }
}
