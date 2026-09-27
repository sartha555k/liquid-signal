import { readSecret } from "@/lib/server-env";

const DEFAULT_MODEL = "gpt-5-mini";

type OptionResult = {
  option: string;
  count: number;
  share: number;
};

type Evidence = {
  option: string;
  text: string;
  confidence: number;
};

type AnswerRequest = {
  question?: string;
  videoTitle?: string;
  commentsAnalyzed?: number;
  relevantComments?: number;
  excludedComments?: number;
  results?: OptionResult[];
  evidence?: Evidence[];
};

type OpenAIResponse = {
  status?: string;
  incomplete_details?: { reason?: string } | null;
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
  error?: { message?: string };
};

function cleanBody(body: AnswerRequest) {
  const question = body.question?.trim().slice(0, 240);
  const results = (body.results ?? [])
    .map((item) => ({
      option: item.option?.trim().slice(0, 80),
      count: Math.max(0, Math.floor(Number(item.count) || 0)),
      share: Math.max(0, Math.min(100, Number(item.share) || 0)),
    }))
    .filter((item) => item.option)
    .slice(0, 6);
  const evidence = (body.evidence ?? [])
    .map((item) => ({
      option: item.option?.trim().slice(0, 80),
      text: item.text?.trim().slice(0, 400),
      confidence: Math.max(0, Math.min(1, Number(item.confidence) || 0)),
    }))
    .filter((item) => item.option && item.text)
    .slice(0, 18);

  if (!question || results.length < 2) return null;
  return {
    question,
    videoTitle: body.videoTitle?.trim().slice(0, 200) || "YouTube video",
    commentsAnalyzed: Math.max(0, Math.floor(Number(body.commentsAnalyzed) || 0)),
    relevantComments: Math.max(0, Math.floor(Number(body.relevantComments) || 0)),
    excludedComments: Math.max(0, Math.floor(Number(body.excludedComments) || 0)),
    results,
    evidence,
  };
}

function extractText(payload: OpenAIResponse) {
  const nestedText = (payload.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text" && item.text)
    .map((item) => item.text?.trim())
    .filter(Boolean)
    .join("\n\n");
  return nestedText || payload.output_text?.trim() || "";
}

export async function POST(request: Request) {
  try {
    const body = cleanBody(await request.json() as AnswerRequest);
    if (!body) {
      return Response.json({ error: "A question and at least two result options are required." }, { status: 400 });
    }

    const apiKey = readSecret("OPENAI_API_KEY");
    if (!apiKey) {
      return Response.json(
        { error: "AI answer synthesis is not configured yet.", code: "openai_not_configured" },
        { status: 503 }
      );
    }

    const model = readSecret("OPENAI_MODEL") ?? DEFAULT_MODEL;
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        store: false,
        reasoning: { effort: "minimal" },
        max_output_tokens: 640,
        instructions: [
          "You are the final research analyst for Jev Signal.",
          "Answer only from the aggregate results and representative comments provided.",
          "Lead with the direct conclusion, mention the winning option and percentage, then add one concise caveat about relevance or sample limitations.",
          "Do not claim the result proves objective product quality; describe it as the opinion expressed by this video's commenters.",
          "Use plain language, no markdown table, and no more than 110 words.",
        ].join(" "),
        input: JSON.stringify(body),
      }),
    });

    const payload = await response.json() as OpenAIResponse;
    if (!response.ok) {
      console.error("OpenAI answer synthesis failed", response.status, payload.error?.message);
      return Response.json({ error: "The final AI answer could not be generated." }, { status: 502 });
    }

    const answer = extractText(payload);
    if (!answer) {
      console.error("OpenAI answer was empty", payload.status, payload.incomplete_details?.reason);
      return Response.json({ error: "The final AI answer was empty." }, { status: 502 });
    }
    return Response.json({ answer, model });
  } catch (error) {
    console.error("Answer synthesis failed", error);
    return Response.json({ error: "The final AI answer could not be generated." }, { status: 500 });
  }
}
