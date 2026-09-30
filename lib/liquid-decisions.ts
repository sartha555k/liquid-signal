type Question = {
  type?: unknown;
  criteria?: unknown;
};

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function probability(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

/** Validate every requested answer before caching or returning any result. */
export function validateDecisionAnswers(payload: unknown, questions: Record<string, unknown>, label = "Liquid d1") {
  const result = record(payload);
  const answers = record(result?.answers);
  if (!answers) throw new Error(`${label} returned an incomplete response.`);
  for (const [name, rawQuestion] of Object.entries(questions)) {
    const question = rawQuestion as Question;
    const answer = record(answers[name]);
    const invalid = () => new Error(`${label} returned an incomplete or invalid answer for ${name}.`);
    if (!answer || answer.type !== question.type) throw invalid();
    if (question.type === "noul") {
      if (!probability(answer.noul)) throw invalid();
      continue;
    }
    const probabilities = record(answer.probabilities);
    const criteria = question.criteria;
    const keys = Array.isArray(criteria) ? criteria.map((_, i) => String(i))
      : Object.keys(record(criteria) ?? {});
    if (!keys.length || !probabilities || !probability(answer.confidence)) throw invalid();
    if (keys.some((key) => !probability(probabilities[key]))) throw invalid();
    const sum = keys.reduce((total, key) => total + (probabilities[key] as number), 0);
    if (Math.abs(sum - 1) > 0.02) throw invalid();
    if (question.type === "choice" && (typeof answer.choice !== "string" || !keys.includes(answer.choice))) {
      throw invalid();
    }
    if (question.type === "score" && (typeof answer.score !== "number"
      || !Number.isFinite(answer.score) || answer.score < 0 || answer.score > keys.length - 1)) {
      throw invalid();
    }
  }
}
