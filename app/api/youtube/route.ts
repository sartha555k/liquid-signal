import { readSecret } from "@/lib/server-env";
import type { SignalComment, SignalDataset } from "@/lib/types";

type YouTubeApiError = {
  error?: {
    message?: string;
    errors?: Array<{ reason?: string }>;
  };
};

function youtubeErrorMessage(status: number, payload: YouTubeApiError) {
  const reason = payload.error?.errors?.[0]?.reason;

  switch (reason) {
    case "commentsDisabled":
      return "Comments are disabled for this video. Choose a public video whose comments are visible on YouTube, or upload a CSV.";
    case "quotaExceeded":
    case "dailyLimitExceeded":
      return "The YouTube Data API daily quota is exhausted. Wait for the quota to reset, request more quota, or upload a CSV.";
    case "keyInvalid":
      return "The YouTube API key is invalid. Create or replace it in Google Cloud, then try again.";
    case "accessNotConfigured":
      return "YouTube Data API v3 is not enabled for this Google Cloud project. Enable it, wait a few minutes, then retry.";
    case "forbidden":
      return "YouTube cannot access this video's comments. The video may be private, age-restricted, members-only, or otherwise restricted. Try a different public video.";
    case "videoNotFound":
      return "YouTube could not find this video. Check the URL and make sure the video is public.";
    default:
      if (status === 403) {
        return payload.error?.message
          ? `YouTube blocked this import: ${payload.error.message}`
          : "YouTube blocked this import. Try a public video with comments enabled, or upload a CSV.";
      }
      return payload.error?.message ?? "YouTube could not return comments.";
  }
}

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

    const googleHeaders = { "x-goog-api-key": apiKey };
    const videoResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${encodeURIComponent(videoId)}`,
      { headers: googleHeaders }
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
      });
      if (pageToken) params.set("pageToken", pageToken);

      const response = await fetch(`https://www.googleapis.com/youtube/v3/commentThreads?${params}`, {
        headers: googleHeaders,
      });
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
        error?: YouTubeApiError["error"];
      };
      if (!response.ok) {
        const reason = payload.error?.errors?.[0]?.reason;
        return Response.json(
          { error: youtubeErrorMessage(response.status, payload), reason },
          { status: response.status }
        );
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
