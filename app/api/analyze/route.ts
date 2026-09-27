import { readSecret } from "@/lib/server-env";
import type { ObjectionKey, SignalComment } from "@/lib/types";

const MODEL = "jev-1.13.0";
const API_URL = "https://api.typesafe.ai/v1/systemone";
const MAX_BATCH_SIZE = 25;

type JevChoice = {
  type: "choice";
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
};

type JevResponse = {
  model: string;
  answers: {
    is_objection: { type: "noul"; noul: number };
    objection_type: JevChoice;
    purchase_intent: { type: "score"; score: number; confidence: number };
    is_spam: { type: "noul"; noul: number };
    is_abusive: { type: "noul"; noul: number };
  };
  usage?: { input_tokens?: number };
};

async function classify(comment: SignalComment, context: unknown, apiKey: string) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      state: { comment: comment.text, campaign_context: context },
      questions: {
        is_objection: {
          type: "noul",
          instructions: "Does this comment express a concern, hesitation, barrier, doubt, or reason someone may avoid purchasing?",
          criteria: {
            true: "A specific purchase barrier, concern, doubt, negative comparison, or unresolved product question is present.",
            false: "Praise, neutral conversation, purchase confirmation, spam, or a comment without a purchase barrier.",
          },
        },
        objection_type: {
          type: "choice",
          instructions: "What is the primary purchase objection expressed in the comment? Choose other when no clear objection exists.",
          criteria: {
            sensitive_skin_safety: "Safety, irritation, sensitivity, allergy, side effects, or suitability for reactive skin.",
            price_value: "Price, affordability, value, discounts, or comparison with a cheaper alternative.",
            trust_proof: "Trust, evidence, authenticity, reviews, claims, ingredients, or proof.",
            product_fit: "Suitability for a person, skin type, routine, lifestyle, or compatibility with other products.",
            effectiveness: "Whether the product works, how well it works, or how quickly results appear.",
            ethics: "Cruelty-free, vegan, environmental, sourcing, or other ethical concerns.",
            shipping_availability: "Shipping cost, delivery time, country availability, stock, or where to purchase.",
            usage: "How, when, or how often to use the product.",
            other: "No clear objection, or an objection outside the available categories.",
          },
        },
        purchase_intent: {
          type: "score",
          instructions: "How strongly does this comment indicate that the author may purchase the product?",
          criteria: [
            "No purchase intent or explicit rejection.",
            "Mild curiosity with no buying signal.",
            "Considering purchase but needs an answer.",
            "Strong intent: asks for a link, availability, price, or says they plan to buy.",
          ],
        },
        is_spam: {
          type: "noul",
          instructions: "Is this comment unsolicited spam, a scam, irrelevant promotion, or meaningless repetition?",
          criteria: { true: "Spam, scam, irrelevant promotion, or automated junk.", false: "A genuine audience comment, including criticism." },
        },
        is_abusive: {
          type: "noul",
          instructions: "Is this comment directly abusive, threatening, or hateful toward a person or protected group?",
          criteria: { true: "Direct abuse, threat, or hateful attack.", false: "Normal criticism, disagreement, frustration, or non-abusive language." },
        },
      },
    }),
  });

  const payload = await response.json() as JevResponse & { detail?: string; message?: string };
  if (!response.ok) throw new Error(payload.detail ?? payload.message ?? `Jev returned ${response.status}`);

  const objection = payload.answers.objection_type;
  const objectionType = objection.choice as ObjectionKey;
  const objectionLikelihood = payload.answers.is_objection.noul;
  return {
    comment: {
      ...comment,
      analysis: {
        isObjection: objectionLikelihood,
        objectionType,
        objectionConfidence: objection.confidence,
        purchaseIntent: Math.max(0, Math.min(1, payload.answers.purchase_intent.score / 3)),
        spam: payload.answers.is_spam.noul,
        abuse: payload.answers.is_abusive.noul,
        reviewRequired: (objectionLikelihood >= .35 && objectionLikelihood < .65)
          || (objectionLikelihood >= .65 && objection.confidence < .55),
      },
    },
    inputTokens: payload.usage?.input_tokens ?? 0,
    model: payload.model,
  };
}

export async function POST(request: Request) {
  try {
    const apiKey = readSecret("TYPESAFE_API_KEY");
    if (!apiKey) {
      return Response.json(
        { error: "Live Jev analysis is not configured yet." },
        { status: 503 }
      );
    }
    const body = await request.json() as { comments?: SignalComment[]; context?: unknown };
    const comments = (body.comments ?? []).filter((comment) => comment.text?.trim()).slice(0, MAX_BATCH_SIZE);
    if (!comments.length) return Response.json({ error: "No comments were provided." }, { status: 400 });

    const results: Awaited<ReturnType<typeof classify>>[] = [];
    for (let index = 0; index < comments.length; index += 5) {
      const batch = comments.slice(index, index + 5);
      results.push(...await Promise.all(batch.map((comment) => classify(comment, body.context ?? {}, apiKey))));
    }
    const inputTokens = results.reduce((total, result) => total + result.inputTokens, 0);
    return Response.json({
      comments: results.map((result) => result.comment),
      model: results[0]?.model ?? MODEL,
      inputTokens,
      costUsd: Number(((inputTokens / 1_000_000) * .042).toFixed(6)),
      batchSize: MAX_BATCH_SIZE,
    });
  } catch (error) {
    console.error("Jev analysis failed", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Jev analysis could not be completed." },
      { status: 502 }
    );
  }
}
