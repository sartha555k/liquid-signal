import type { SignalDataset } from "./types";

const rows = [
  ["I love the idea, but every retinol I’ve tried made my cheeks burn. Is this actually safe for sensitive skin?", "sensitive_skin_safety", .97, .31],
  ["Can someone with rosacea use this, or is it going to cause another flare?", "sensitive_skin_safety", .94, .28],
  ["Why would I pay this much when the pharmacy one has the same percentage? Genuine question.", "price_value", .93, .24],
  ["For that price I need to see clinical proof, not just before and after photos.", "trust_proof", .91, .2],
  ["Is the finished product and every ingredient cruelty-free? I can’t find a clear answer.", "ethics", .92, .35],
  ["Where can I buy this in India? The link doesn’t show international shipping.", "shipping_availability", .9, .82],
  ["Okay, I’m convinced. Drop the link please!", "other", .12, .96],
  ["Does it work under makeup or will it pill?", "product_fit", .84, .61],
  ["How many nights a week are you actually supposed to use it?", "usage", .79, .56],
  ["I used it for six weeks and saw no difference at all.", "effectiveness", .88, .08],
  ["Claim your free crypto now at this link!!!", "other", .04, .01],
  ["My order arrived yesterday and the texture is beautiful.", "other", .06, .44],
] as const;

const multipliers = [37, 34, 29, 24, 18, 17, 15, 13, 12, 11, 9, 8];

const comments = rows.flatMap(([text, type, confidence, intent], rowIndex) =>
  Array.from({ length: multipliers[rowIndex] }, (_, copyIndex) => ({
    id: `demo-${rowIndex}-${copyIndex}`,
    text: copyIndex === 0 ? text : `${text} ${copyIndex % 4 === 0 ? "Anyone know?" : ""}`.trim(),
    source: "demo" as const,
    analysis: {
      isObjection: type === "other" ? (rowIndex === 10 ? .03 : .08) : confidence,
      objectionType: type,
      objectionConfidence: confidence,
      purchaseIntent: intent,
      spam: rowIndex === 10 ? .995 : .01,
      abuse: 0.01,
      reviewRequired: confidence < .75,
    },
  }))
);

export const demoDataset: SignalDataset = {
  id: "glow-serum-demo",
  name: "Glow serum launch",
  source: "demo",
  sourceLabel: "Showcase dataset",
  comments,
  analyzedAt: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
  model: "jev-1.13.0",
  inputTokens: 97842,
  costUsd: .0041,
};
