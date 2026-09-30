export type ObjectionKey =
  | "sensitive_skin_safety"
  | "price_value"
  | "trust_proof"
  | "product_fit"
  | "effectiveness"
  | "ethics"
  | "shipping_availability"
  | "usage"
  | "other";

export type AudienceQuestion = {
  id: string;
  prompt: string;
  options: string[];
};

export type SignalComment = {
  id: string;
  text: string;
  source: "youtube" | "csv" | "demo";
  sourceId?: string;
  publishedAt?: string;
  analysis?: {
    provider?: "liquid" | "jev";
    model?: string;
    version?: string;
    isObjection: number;
    objectionType: ObjectionKey;
    objectionConfidence: number;
    purchaseIntent: number;
    spam: number;
    abuse: number;
    reviewRequired: boolean;
    audienceAnswer?: {
      questionId: string;
      choice: string | null;
      confidence: number;
      probabilities: Record<string, number>;
    };
  };
};

export type SignalDataset = {
  id: string;
  name: string;
  source: "youtube" | "csv" | "demo";
  sourceLabel: string;
  comments: SignalComment[];
  audienceQuestion?: AudienceQuestion;
  analyzedAt?: string;
  model?: string;
  inputTokens?: number;
  costUsd?: number;
};
