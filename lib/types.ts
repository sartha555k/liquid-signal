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

export type SignalComment = {
  id: string;
  text: string;
  source: "youtube" | "csv" | "demo";
  sourceId?: string;
  publishedAt?: string;
  analysis?: {
    isObjection: number;
    objectionType: ObjectionKey;
    objectionConfidence: number;
    purchaseIntent: number;
    spam: number;
    abuse: number;
    reviewRequired: boolean;
  };
};

export type SignalDataset = {
  id: string;
  name: string;
  source: "youtube" | "csv" | "demo";
  sourceLabel: string;
  comments: SignalComment[];
  analyzedAt?: string;
  model?: string;
  inputTokens?: number;
  costUsd?: number;
};
