import { readSecret } from "@/lib/server-env";
import type { SignalComment, SignalDataset } from "@/lib/types";

function extractVideoId(raw: string) {
  try {
    const url = new URL(raw);
    if (url.hostname === "youtu.be") return url.pathname.split("/").filter(Boolean)[0] ?? null;
    if (url.hostname.endsWith("youtube.com")) {
      if (url.pathname === "/watch") return url.searchParams.get("v");
      const parts = url.pathname.split("/").filter(Boolean);
      if (["shorts", "live", "embed"].includes(parts[0])) return parts[1] ?? null;
    }
  } catch {
    return /^[\w-]{11}$/.test(raw.trim()) ? raw.trim() : null;
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { url?: string; maxResults?: number };
    const videoId = extractVideoId(body.url ?? "");
    if (!videoId) return Response.json({ error: "Enter a valid YouTube video URL." }, { status: 400 });

    const apiKey = readSecret("YOUTUBE_API_KEY");
    if (!apiKey) {
      return Response.json(
        { error: "Live YouTube import is not configured yet." },
        { status: 503 }
      );
    }

    const target = Math.min(Math.max(body.maxResults ?? 100, 1), 200);
    const comments: SignalComment[] = [];
    let pageToken: string | undefined;
    let videoTitle = "YouTube comments";

    const videoResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${encodeURIComponent(videoId)}&key=${encodeURIComponent(apiKey)}`
    );
    if (videoResponse.ok) {
      const videoPayload = await videoResponse.json() as { items?: Array<{ snippet?: { title?: string } }> };
      videoTitle = videoPayload.items?.[0]?.snippet?.title ?? videoTitle;
    }

    while (comments.length < target) {
      const params = new URLSearchParams({
        part: "snippet",
        videoId,
        maxResults: String(Math.min(100, target - comments.length)),
        textFormat: "plainText",
        order: "relevance",
        key: apiKey,
      });
      if (pageToken) params.set("pageToken", pageToken);

      const response = await fetch(`https://www.googleapis.com/youtube/v3/commentThreads?${params}`);
      const payload = await response.json() as {
        nextPageToken?: string;
        items?: Array<{
          id: string;
          snippet?: {
            topLevelComment?: {
              id?: string;
              snippet?: { textDisplay?: string; publishedAt?: string };
            };
          };
        }>;
        error?: { message?: string };
      };
      if (!response.ok) {
        const message = response.status === 403
          ? "YouTube quota or permissions blocked this import. Upload a CSV or use the cached showcase."
          : payload.error?.message ?? "YouTube could not return comments.";
        return Response.json({ error: message }, { status: response.status });
      }

      for (const item of payload.items ?? []) {
        const snippet = item.snippet?.topLevelComment?.snippet;
        const text = snippet?.textDisplay?.trim();
        if (!text) continue;
        comments.push({
          id: crypto.randomUUID(),
          source: "youtube",
          sourceId: item.snippet?.topLevelComment?.id ?? item.id,
          text,
          publishedAt: snippet?.publishedAt,
        });
      }
      pageToken = payload.nextPageToken;
      if (!pageToken) break;
    }

    const dataset: SignalDataset = {
      id: crypto.randomUUID(),
      name: videoTitle,
      source: "youtube",
      sourceLabel: "Live YouTube import",
      comments,
    };
    return Response.json({ dataset });
  } catch (error) {
    console.error("YouTube import failed", error);
    return Response.json({ error: "The YouTube import could not be completed." }, { status: 500 });
  }
}
