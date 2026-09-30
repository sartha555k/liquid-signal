export const decisionModels = {
  liquid: { label: "Liquid d1", model: "d1:free", version: "liquid-d1-v1" },
  jev: { label: "Jev", model: "jev-1.13.0", version: "jev-signal-v1" },
} as const;

export type DecisionProvider = keyof typeof decisionModels;

export function isDecisionProvider(value: unknown): value is DecisionProvider {
  return value === "liquid" || value === "jev";
}
