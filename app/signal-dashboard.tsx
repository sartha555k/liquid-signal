"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  CircleDot,
  Download,
  FileUp,
  LayoutDashboard,
  MessageSquareText,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Video,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toaster } from "@/components/ui/sonner";
import { demoDataset } from "@/lib/demo-data";
import type { AudienceQuestion, ObjectionKey, SignalComment, SignalDataset } from "@/lib/types";

type SignalView = "all" | "objections" | "intent";
type CommentFilter = "all" | "objections" | "intent" | "review" | "flagged" | "unanalyzed";
type YouTubeImportSession = {
  comments: SignalComment[];
  nextPageToken: string | null;
  videoTitle: string;
};

type YouTubeBatchResponse = {
  videoTitle?: string;
  comments?: SignalComment[];
  nextPageToken?: string | null;
  error?: string;
};

const YOUTUBE_IMPORT_MILESTONE = 10_000;
const YOUTUBE_BATCH_SIZE = 1000;
const D1_BATCH_SIZE = 25;
const D1_BATCH_CONCURRENCY = 2;
const ANALYSIS_VERSION = "liquid-d1-v1";

function normalizeCommentText(text: string) {
  return text.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

function analysisMatches(comment: SignalComment, question?: AudienceQuestion) {
  if (comment.analysis?.version !== ANALYSIS_VERSION) return false;
  return !question || comment.analysis.audienceAnswer?.questionId === question.id;
}

const COMMENT_FILTERS: Array<{ key: CommentFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "objections", label: "Objections" },
  { key: "intent", label: "High intent" },
  { key: "review", label: "Needs review" },
  { key: "flagged", label: "Spam / abuse" },
  { key: "unanalyzed", label: "Not analysed" },
];

const CATEGORY: Record<ObjectionKey, { label: string; color: string; hook: string }> = {
  sensitive_skin_safety: {
    label: "Sensitive-skin safety",
    color: "#dfff58",
    hook: "Gentle enough for reactive skin. Strong enough to show up.",
  },
  price_value: {
    label: "Price & value",
    color: "#ff9c78",
    hook: "One bottle. A full routine’s worth of results.",
  },
  trust_proof: {
    label: "Trust & proof",
    color: "#8dd9ff",
    hook: "Not another promise—here is the proof.",
  },
  product_fit: {
    label: "Product fit",
    color: "#c3a6ff",
    hook: "Made to fit the routine you already have.",
  },
  effectiveness: {
    label: "Effectiveness",
    color: "#ffc857",
    hook: "What visible progress actually looks like.",
  },
  ethics: {
    label: "Ethics & ingredients",
    color: "#72e1c2",
    hook: "Clear ingredients. Clear conscience.",
  },
  shipping_availability: {
    label: "Shipping & availability",
    color: "#ff78b7",
    hook: "Your routine upgrade now ships to you.",
  },
  usage: {
    label: "How to use",
    color: "#78a8ff",
    hook: "Three nights a week. No complicated ritual.",
  },
  other: {
    label: "Other",
    color: "#94a3b8",
    hook: "Answer the question your audience keeps asking.",
  },
};

function parseCsvLine(line: string) {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        value += '"';
        i += 1;
      } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(value.trim());
      value = "";
    } else value += char;
  }
  values.push(value.trim());
  return values;
}

function parseCsv(contents: string): SignalComment[] {
  const lines = contents.split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return [];
  const headers = parseCsvLine(lines[0]).map((header) => header.toLowerCase().trim());
  const textIndex = headers.findIndex((header) => ["comment", "text", "message", "comment_text"].includes(header));
  const start = textIndex >= 0 ? 1 : 0;
  const column = textIndex >= 0 ? textIndex : 0;
  return lines
    .slice(start)
    .map(parseCsvLine)
    .map((row, index) => ({
      id: `csv-${Date.now()}-${index}`,
      text: row[column]?.trim() ?? "",
      source: "csv" as const,
    }))
    .filter((comment) => comment.text.length > 1)
    .slice(0, 1000);
}

function formatTime(iso?: string) {
  if (!iso) return "Not analysed";
  const minutes = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return minutes < 60 ? `${minutes} min ago` : `${Math.round(minutes / 60)} hr ago`;
}

async function persistDataset(dataset: SignalDataset) {
  try {
    await fetch("/api/datasets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dataset),
    });
  } catch {
    // Persistence is best-effort; the active in-browser dataset remains usable.
  }
}

export default function SignalDashboard() {
  const [dataset, setDataset] = useState<SignalDataset>(demoDataset);
  const [signalView, setSignalView] = useState<SignalView>("all");
  const [commentFilter, setCommentFilter] = useState<CommentFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<ObjectionKey | "all">("all");
  const [youtubeOpen, setYoutubeOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [briefOpen, setBriefOpen] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [importCount, setImportCount] = useState(0);
  const [importGoal, setImportGoal] = useState(YOUTUBE_IMPORT_MILESTONE);
  const [importTitle, setImportTitle] = useState("");
  const [pendingImport, setPendingImport] = useState<YouTubeImportSession | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisCount, setAnalysisCount] = useState(0);
  const [questionOpen, setQuestionOpen] = useState(false);
  const [questionPrompt, setQuestionPrompt] = useState("");
  const [questionOptions, setQuestionOptions] = useState(["", ""]);
  const [query, setQuery] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const importAbortRef = useRef<AbortController | null>(null);
  const importAbortActionRef = useRef<"use" | "discard">("discard");
  const importSessionRef = useRef<YouTubeImportSession | null>(null);
  const analysisAbortRef = useRef<AbortController | null>(null);

  const analyzed = useMemo(
    () => dataset.comments.filter((comment) => comment.analysis),
    [dataset.comments]
  );

  const objectionComments = useMemo(
    () => analyzed.filter((comment) => (comment.analysis?.isObjection ?? 0) >= .65),
    [analyzed]
  );

  const intentComments = useMemo(
    () => analyzed.filter((comment) => (comment.analysis?.purchaseIntent ?? 0) >= .75),
    [analyzed]
  );

  const readyAnalysisCount = useMemo(
    () => dataset.comments.filter((comment) => analysisMatches(comment, dataset.audienceQuestion)).length,
    [dataset.comments, dataset.audienceQuestion]
  );

  const coreAnalysisCount = useMemo(
    () => dataset.comments.filter((comment) => comment.analysis?.version === ANALYSIS_VERSION).length,
    [dataset.comments]
  );
  const questionOnlyReady = Boolean(
    dataset.audienceQuestion
    && coreAnalysisCount === dataset.comments.length
    && readyAnalysisCount < dataset.comments.length
  );

  const audienceSummary = useMemo(() => {
    const question = dataset.audienceQuestion;
    if (!question) return null;
    const answers = dataset.comments
      .map((comment) => comment.analysis?.audienceAnswer)
      .filter((answer) => answer?.questionId === question.id);
    const relevant = answers.filter((answer) => answer?.choice);
    const counts = new Map(question.options.map((option) => [option, 0]));
    relevant.forEach((answer) => {
      if (answer?.choice && counts.has(answer.choice)) counts.set(answer.choice, (counts.get(answer.choice) ?? 0) + 1);
    });
    return {
      question,
      answered: answers.length,
      relevant: relevant.length,
      notRelevant: answers.length - relevant.length,
      options: question.options.map((option) => ({
        option,
        count: counts.get(option) ?? 0,
        share: relevant.length ? Math.round(((counts.get(option) ?? 0) / relevant.length) * 100) : 0,
      })).sort((a, b) => b.count - a.count),
    };
  }, [dataset.audienceQuestion, dataset.comments]);

  const ranked = useMemo(() => {
    const counts = new Map<ObjectionKey, number>();
    objectionComments.forEach((comment) => {
      const key = comment.analysis?.objectionType ?? "other";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return [...counts.entries()]
      .map(([key, count]) => ({
        key,
        count,
        value: objectionComments.length ? Math.round((count / objectionComments.length) * 100) : 0,
        ...CATEGORY[key],
      }))
      .sort((a, b) => b.count - a.count);
  }, [objectionComments]);

  const strongIntent = intentComments.length;
  const strongIntentShare = analyzed.length ? Math.round((strongIntent / analyzed.length) * 100) : 0;
  const flagged = analyzed.filter((comment) => (comment.analysis?.spam ?? 0) >= .95 || (comment.analysis?.abuse ?? 0) >= .95).length;
  const top = ranked[0] ?? { key: "other" as const, label: "No dominant objection", hook: "Your next hook will appear after analysis", value: 0, count: 0, color: "#94a3b8" };

  const filterCounts = useMemo(() => ({
    all: dataset.comments.length,
    objections: objectionComments.length,
    intent: intentComments.length,
    review: analyzed.filter((comment) => comment.analysis?.reviewRequired).length,
    flagged: analyzed.filter((comment) => (comment.analysis?.spam ?? 0) >= .95 || (comment.analysis?.abuse ?? 0) >= .95).length,
    unanalyzed: dataset.comments.length - analyzed.length,
  }), [dataset.comments.length, objectionComments.length, intentComments.length, analyzed]);

  const signalSummary = useMemo(() => [
    {
      key: "objections" as const,
      label: "Objections",
      count: objectionComments.length,
      share: analyzed.length ? Math.round((objectionComments.length / analyzed.length) * 100) : 0,
      description: "Concerns or barriers that could stop a purchase",
      color: "#ff9c78",
    },
    {
      key: "intent" as const,
      label: "Strong purchase intent",
      count: intentComments.length,
      share: strongIntentShare,
      description: "People showing clear signs they may buy",
      color: "#dfff58",
    },
    {
      key: "review" as const,
      label: "Needs review",
      count: filterCounts.review,
      share: analyzed.length ? Math.round((filterCounts.review / analyzed.length) * 100) : 0,
      description: "Uncertain decisions worth checking manually",
      color: "#ffc857",
    },
    {
      key: "flagged" as const,
      label: "Spam or abuse",
      count: filterCounts.flagged,
      share: analyzed.length ? Math.round((filterCounts.flagged / analyzed.length) * 100) : 0,
      description: "High-confidence moderation candidates",
      color: "#ff78b7",
    },
  ], [analyzed.length, objectionComments.length, intentComments.length, strongIntentShare, filterCounts.review, filterCounts.flagged]);

  const overviewEvidence = useMemo(() => {
    const candidates = [
      objectionComments[0],
      intentComments.find((comment) => comment.id !== objectionComments[0]?.id),
      analyzed.find((comment) =>
        (comment.analysis?.isObjection ?? 0) < .65
        && (comment.analysis?.purchaseIntent ?? 0) < .75
        && (comment.analysis?.spam ?? 0) < .95
        && (comment.analysis?.abuse ?? 0) < .95
      ),
    ].filter((comment): comment is SignalComment => Boolean(comment));
    const unique = [...new Map(candidates.map((comment) => [comment.id, comment])).values()];
    if (unique.length < 3) {
      analyzed.forEach((comment) => {
        if (unique.length < 3 && !unique.some((item) => item.id === comment.id)) unique.push(comment);
      });
    }
    return unique;
  }, [analyzed, objectionComments, intentComments]);

  const visibleComments = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return dataset.comments.filter((comment) => {
      const analysis = comment.analysis;
      const matchesFilter = commentFilter === "all"
        || (commentFilter === "objections" && (analysis?.isObjection ?? 0) >= .65)
        || (commentFilter === "intent" && (analysis?.purchaseIntent ?? 0) >= .75)
        || (commentFilter === "review" && analysis?.reviewRequired)
        || (commentFilter === "flagged" && ((analysis?.spam ?? 0) >= .95 || (analysis?.abuse ?? 0) >= .95))
        || (commentFilter === "unanalyzed" && !analysis);
      const matchesCategory = categoryFilter === "all" || analysis?.objectionType === categoryFilter;
      const matchesQuery = !normalized
        || comment.text.toLowerCase().includes(normalized)
        || (analysis && CATEGORY[analysis.objectionType].label.toLowerCase().includes(normalized));
      return matchesFilter && matchesCategory && matchesQuery;
    });
  }, [dataset.comments, query, commentFilter, categoryFilter]);

  const evidenceComments = signalView === "intent"
    ? intentComments
    : signalView === "objections"
      ? objectionComments
      : overviewEvidence;

  function openComments(filter: CommentFilter = "all", category: ObjectionKey | "all" = "all") {
    setCommentFilter(filter);
    setCategoryFilter(category);
    setQuery("");
    setCommentsOpen(true);
  }

  function changeSignalView(value: string) {
    const next = value as SignalView;
    setSignalView(next);
  }

  function evidenceMeta(comment: SignalComment) {
    const analysis = comment.analysis!;
    if (signalView === "intent") {
      return { label: "Strong purchase intent", score: `${Math.round(analysis.purchaseIntent * 100)}% intent` };
    }
    if (signalView === "objections") {
      return { label: CATEGORY[analysis.objectionType].label, score: `${Math.round(analysis.objectionConfidence * 100)}% confidence` };
    }
    if (analysis.spam >= .95 || analysis.abuse >= .95) {
      return { label: "Moderation signal", score: `${Math.round(Math.max(analysis.spam, analysis.abuse) * 100)}% confidence` };
    }
    if (analysis.purchaseIntent >= .75) {
      return { label: "Strong purchase intent", score: `${Math.round(analysis.purchaseIntent * 100)}% intent` };
    }
    if (analysis.isObjection >= .65) {
      return { label: CATEGORY[analysis.objectionType].label, score: `${Math.round(analysis.isObjection * 100)}% objection` };
    }
    return { label: "General feedback", score: `${Math.round((1 - analysis.isObjection) * 100)}% non-objection` };
  }

  useEffect(() => {
    function onShortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openComments();
      }
    }
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, []);

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const registrations = [
      context.registerTool({
        name: "load_showcase_dataset",
        title: "Load showcase dataset",
        description: "Replace the active dataset with the built-in skincare showcase and update the visible dashboard.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute() {
          setDataset(demoDataset);
          return { dataset: demoDataset.name, comments: demoDataset.comments.length };
        },
      }, { signal: lifecycle.signal }),
      context.registerTool({
        name: "open_youtube_import",
        title: "Open YouTube import",
        description: "Open the visible YouTube import dialog so a video URL can be entered.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute() {
          setYoutubeOpen(true);
          return { opened: true };
        },
      }, { signal: lifecycle.signal }),
      context.registerTool({
        name: "read_signal_summary",
        title: "Read signal summary",
        description: "Read the active dataset's ranked objection and purchase-intent summary without changing it.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute() {
          return {
            dataset: dataset.name,
            comments: dataset.comments.length,
            analyzed: analyzed.length,
            topObjections: ranked.slice(0, 3).map(({ label, value, count }) => ({ label, value, count })),
            strongPurchaseIntentPercent: strongIntentShare,
          };
        },
      }, { signal: lifecycle.signal }),
    ];
    registrations.forEach((registration) => Promise.resolve(registration).catch(() => undefined));
    return () => lifecycle.abort();
  }, [dataset, analyzed.length, ranked, strongIntentShare]);

  function finishYouTubeImport(session: YouTubeImportSession) {
    if (!session.comments.length) return;
    const next: SignalDataset = {
      id: crypto.randomUUID(),
      name: session.videoTitle,
      source: "youtube",
      sourceLabel: "Newest YouTube comments",
      comments: session.comments,
    };
    setDataset(next);
    // The database cache is deliberately kept small for this proof of concept.
    // Large live imports remain available in the current browser session.
    if (next.comments.length <= 1000) void persistDataset(next);
    setPendingImport(null);
    setYoutubeOpen(false);
    toast.success(`Import complete — ${next.comments.length.toLocaleString()} comments ready`, {
      description: "Click Analyse with D1 to classify every imported comment.",
    });
  }

  async function importYouTube(resume?: YouTubeImportSession) {
    if (!youtubeUrl.trim() || importing) return;

    const controller = new AbortController();
    importAbortRef.current = controller;
    importAbortActionRef.current = "discard";
    const startingComments = resume?.comments ?? [];
    let session: YouTubeImportSession = {
      comments: [...startingComments],
      nextPageToken: resume?.nextPageToken ?? null,
      videoTitle: resume?.videoTitle ?? "YouTube comments",
    };
    const target = (Math.floor(startingComments.length / YOUTUBE_IMPORT_MILESTONE) + 1) * YOUTUBE_IMPORT_MILESTONE;

    importSessionRef.current = session;
    setPendingImport(null);
    setImporting(true);
    setImportCount(session.comments.length);
    setImportGoal(target);
    setImportTitle(session.videoTitle === "YouTube comments" ? "Reading newest comments…" : session.videoTitle);

    try {
      while (session.comments.length < target) {
        const response = await fetch("/api/youtube", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: youtubeUrl,
            pageToken: session.nextPageToken || undefined,
            batchSize: Math.min(YOUTUBE_BATCH_SIZE, target - session.comments.length),
          }),
          signal: controller.signal,
        });
        const payload = await response.json() as YouTubeBatchResponse;
        if (!response.ok || !payload.comments) throw new Error(payload.error ?? "YouTube import failed");

        const knownIds = new Set(session.comments.map((comment) => comment.sourceId).filter(Boolean));
        const uniqueComments = payload.comments.filter((comment) => !comment.sourceId || !knownIds.has(comment.sourceId));
        session = {
          comments: [...session.comments, ...uniqueComments],
          nextPageToken: payload.nextPageToken ?? null,
          videoTitle: payload.videoTitle ?? session.videoTitle,
        };
        importSessionRef.current = session;
        setImportCount(session.comments.length);
        setImportTitle(session.videoTitle);

        if (!session.nextPageToken) {
          finishYouTubeImport(session);
          return;
        }
      }

      setPendingImport(session);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        const partial = importSessionRef.current;
        if ((importAbortActionRef.current as "use" | "discard") === "use" && partial?.comments.length) finishYouTubeImport(partial);
        return;
      }
      toast.error(error instanceof Error ? error.message : "YouTube import failed", {
        description: "You can continue with a CSV or the showcase dataset.",
      });
    } finally {
      importAbortRef.current = null;
      setImporting(false);
    }
  }

  function stopYouTubeImport() {
    importAbortActionRef.current = "use";
    importAbortRef.current?.abort();
  }

  function changeYoutubeDialog(open: boolean) {
    if (!open && importing) {
      importAbortActionRef.current = "discard";
      importAbortRef.current?.abort();
    }
    setYoutubeOpen(open);
    if (!open) setPendingImport(null);
  }

  async function onCsv(file?: File) {
    if (!file) return;
    const comments = parseCsv(await file.text());
    if (!comments.length) {
      toast.error("No comment text found", { description: "Use a column named comment, text, message, or comment_text." });
      return;
    }
    const next: SignalDataset = {
      id: crypto.randomUUID(),
      name: file.name.replace(/\.csv$/i, ""),
      source: "csv",
      sourceLabel: "CSV upload",
      comments,
    };
    setDataset(next);
    void persistDataset(next);
    toast.success(`Imported ${comments.length} comments`, { description: "Import complete. Click Analyse with D1 when you’re ready." });
  }

  function downloadImportedCsv() {
    const escape = (value?: string) => `"${(value ?? "").replace(/"/g, '""')}"`;
    const rows = [
      ["source", "source_id", "published_at", "comment"].map(escape).join(","),
      ...dataset.comments.map((comment) => [comment.source, comment.sourceId, comment.publishedAt, comment.text].map(escape).join(",")),
    ];
    const blob = new Blob(["\ufeff", rows.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${dataset.name.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "youtube-comments"}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast.success(`Downloaded ${dataset.comments.length.toLocaleString()} comments as CSV`);
  }

  function editAudienceQuestion() {
    setQuestionPrompt(dataset.audienceQuestion?.prompt ?? "");
    setQuestionOptions(dataset.audienceQuestion?.options ?? ["", ""]);
    setQuestionOpen(true);
  }

  function startNewAudienceQuestion() {
    setQuestionPrompt("");
    setQuestionOptions(["", ""]);
    setQuestionOpen(true);
  }

  function saveAudienceQuestion() {
    const prompt = questionPrompt.trim();
    const options = questionOptions
      .map((option) => option.trim())
      .filter((option, index, values) => option && values.findIndex((value) => value.toLocaleLowerCase() === option.toLocaleLowerCase()) === index)
      .slice(0, 6);
    if (!prompt || options.length < 2) {
      toast.error("Add a question and at least two different options");
      return;
    }
    const audienceQuestion: AudienceQuestion = { id: crypto.randomUUID(), prompt, options };
    setDataset((current) => ({ ...current, audienceQuestion }));
    setQuestionOpen(false);
    toast.success("Audience question added", { description: "D1 will answer it during the same analysis run." });
  }

  function removeAudienceQuestion() {
    setDataset((current) => ({ ...current, audienceQuestion: undefined }));
    setQuestionOpen(false);
    setQuestionPrompt("");
    setQuestionOptions(["", ""]);
  }

  async function analyzeWithD1() {
    if (analyzing) return;
    const audienceOnly = Boolean(
      dataset.audienceQuestion
      && dataset.comments.every((comment) => comment.analysis?.version === ANALYSIS_VERSION)
    );

    const groups = new Map<string, SignalComment[]>();
    dataset.comments.forEach((comment) => {
      const key = normalizeCommentText(comment.text);
      groups.set(key, [...(groups.get(key) ?? []), comment]);
    });
    const reusable = new Map<string, NonNullable<SignalComment["analysis"]>>();
    const pendingComments: SignalComment[] = [];
    let alreadyAnalyzed = 0;
    groups.forEach((comments, key) => {
      const existing = comments.find((comment) => analysisMatches(comment, dataset.audienceQuestion))?.analysis;
      if (existing) {
        reusable.set(key, existing);
        alreadyAnalyzed += comments.length;
      } else pendingComments.push(comments[0]);
    });

    if (reusable.size) {
      setDataset((current) => ({
        ...current,
        comments: current.comments.map((comment) => {
          const analysis = reusable.get(normalizeCommentText(comment.text));
          return analysis ? { ...comment, analysis } : comment;
        }),
      }));
    }
    if (!pendingComments.length) {
      toast.success("Every comment is already analysed");
      return;
    }

    const controller = new AbortController();
    analysisAbortRef.current = controller;
    let processed = 0;
    let cacheHits = 0;
    let totalInputTokens = dataset.inputTokens ?? 0;
    let totalCost = dataset.costUsd ?? 0;
    let model = dataset.model;
    const duplicateSavings = dataset.comments.length - groups.size;

    setAnalyzing(true);
    setAnalysisCount(alreadyAnalyzed);
    setAnalysisProgress(Math.round((alreadyAnalyzed / dataset.comments.length) * 100));

    const batches: SignalComment[][] = [];
    for (let index = 0; index < pendingComments.length; index += D1_BATCH_SIZE) {
      batches.push(pendingComments.slice(index, index + D1_BATCH_SIZE));
    }

    const requestBatch = async (comments: SignalComment[]) => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const response = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ comments, audienceQuestion: dataset.audienceQuestion, audienceOnly }),
          signal: controller.signal,
        });
        const payload = await response.json() as {
          comments?: SignalComment[];
          model?: string;
          inputTokens?: number;
          costUsd?: number;
          cachedCount?: number;
          error?: string;
        };
        if (response.ok && payload.comments) return payload;
        if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 2) {
          throw new Error(payload.error ?? "Analysis failed");
        }
        await new Promise((resolve) => window.setTimeout(resolve, 500 * (2 ** attempt)));
        if (controller.signal.aborted) throw new DOMException("Analysis stopped", "AbortError");
      }
      throw new Error("Analysis failed");
    };

    try {
      for (let index = 0; index < batches.length; index += D1_BATCH_CONCURRENCY) {
        const wave = batches.slice(index, index + D1_BATCH_CONCURRENCY);
        const waveResults = await Promise.allSettled(wave.map(requestBatch));
        const payloads = waveResults.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
        const completedComments = payloads.flatMap((payload) => payload.comments ?? []);
        const completedByText = new Map(completedComments.flatMap((comment) => comment.analysis
          ? [[normalizeCommentText(comment.text), comment.analysis] as const]
          : []));
        let completedCoverage = 0;
        completedByText.forEach((_, key) => { completedCoverage += groups.get(key)?.length ?? 0; });

        processed += completedCoverage;
        cacheHits += payloads.reduce((sum, payload) => sum + (payload.cachedCount ?? 0), 0);
        totalInputTokens += payloads.reduce((sum, payload) => sum + (payload.inputTokens ?? 0), 0);
        totalCost += payloads.reduce((sum, payload) => sum + (payload.costUsd ?? 0), 0);
        model = payloads.find((payload) => payload.model)?.model ?? model;
        const completedTotal = alreadyAnalyzed + processed;

        setAnalysisCount(completedTotal);
        setAnalysisProgress(Math.round((completedTotal / dataset.comments.length) * 100));
        setDataset((current) => ({
          ...current,
          comments: current.comments.map((comment) => {
            const analysis = completedByText.get(normalizeCommentText(comment.text));
            return analysis ? { ...comment, analysis } : comment;
          }),
          analyzedAt: new Date().toISOString(),
          model,
          inputTokens: totalInputTokens,
          costUsd: Number(totalCost.toFixed(6)),
        }));

        const failed = waveResults.find((result) => result.status === "rejected");
        if (failed?.status === "rejected") throw failed.reason;
      }

      setAnalysisProgress(100);
      setDataset((current) => {
        if (current.comments.length <= 1000) void persistDataset(current);
        return current;
      });
      toast.success(`Analysed all ${dataset.comments.length.toLocaleString()} comments with D1`, {
        description: `$${totalCost.toFixed(4)} total · ${duplicateSavings.toLocaleString()} duplicate calls avoided · ${cacheHits.toLocaleString()} cache hits`,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        toast.info(`Analysis stopped at ${(alreadyAnalyzed + processed).toLocaleString()} comments`, {
          description: "Click Resume analysis whenever you’re ready. Completed results are preserved.",
        });
        return;
      }
      toast.error(error instanceof Error ? error.message : "Analysis failed", {
        description: processed
          ? `${processed.toLocaleString()} new results were saved. Click Resume analysis to continue.`
          : "No comments were changed. Try again when the API is available.",
      });
    } finally {
      analysisAbortRef.current = null;
      setAnalyzing(false);
      window.setTimeout(() => setAnalysisProgress(0), 1200);
    }
  }

  function stopD1Analysis() {
    analysisAbortRef.current?.abort();
  }

  return (
    <main className="min-h-screen bg-[#f3f1e9] text-[#111827]">
      <Toaster richColors position="top-right" />
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(event) => onCsv(event.target.files?.[0])}
      />
      <header className="sticky top-0 z-40 border-b border-black/10 bg-[#f3f1e9]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1480px] items-center gap-4 px-4 sm:px-7">
          <a href="#" className="flex items-center gap-2.5" aria-label="Liquid Signal home">
            <span className="grid size-9 place-items-center rounded-[11px] bg-[#101827] text-[#dfff58] shadow-[inset_0_0_0_1px_rgba(255,255,255,.12)]">
              <CircleDot className="size-5" />
            </span>
            <span className="text-[17px] font-black tracking-[-0.04em]">Liquid Signal</span>
          </a>
          <button
            onClick={() => openComments()}
            className="ml-auto hidden w-full max-w-sm items-center gap-2 rounded-full border border-black/10 bg-white/70 px-3 py-2 text-left md:flex"
          >
            <Search className="size-4 text-slate-400" />
            <span className="text-sm text-slate-500">Search comments or signals</span>
            <kbd className="ml-auto rounded-md border border-black/10 bg-white px-1.5 py-0.5 text-[11px] text-slate-400">⌘K</kbd>
          </button>
          <Badge variant="outline" className="ml-auto hidden rounded-full border-emerald-600/20 bg-emerald-50 px-3 py-1 text-emerald-800 sm:flex md:ml-2">
            <span className="mr-1.5 size-1.5 rounded-full bg-emerald-500" /> Demo ready
          </Badge>
          <Button size="icon" variant="ghost" className="rounded-full" aria-label="Settings">
            <Settings2 className="size-4" />
          </Button>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1480px] grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="hidden min-h-[calc(100vh-64px)] border-r border-black/10 px-4 py-6 lg:flex lg:flex-col">
          <nav className="space-y-1" aria-label="Main navigation">
            <a className="flex items-center gap-3 rounded-xl bg-[#101827] px-3 py-2.5 text-sm font-semibold text-white" href="#overview">
              <LayoutDashboard className="size-4 text-[#dfff58]" /> Overview
            </a>
            <button onClick={() => openComments()} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-black/5">
              <MessageSquareText className="size-4" /> Comments
              <span className="ml-auto text-xs text-slate-400">{dataset.comments.length.toLocaleString()}</span>
            </button>
            <button onClick={() => setBriefOpen(true)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-black/5">
              <Sparkles className="size-4" /> Creative brief
            </button>
          </nav>
          <div className="mt-8 border-t border-black/10 pt-5">
            <p className="px-3 text-[11px] font-bold uppercase tracking-[0.13em] text-slate-400">Active dataset</p>
            <div className="mt-3 flex items-center gap-3 rounded-xl bg-black/[.045] px-3 py-2.5 text-sm">
              <span className={`size-2 shrink-0 rounded-full ${dataset.source === "youtube" ? "bg-red-500" : dataset.source === "csv" ? "bg-blue-500" : "bg-[#101827]"}`} />
              <span className="min-w-0 flex-1 truncate font-medium">{dataset.name}</span>
              <span className="text-xs text-slate-400">{dataset.comments.length}</span>
            </div>
          </div>
          <div className="mt-auto rounded-2xl bg-[#101827] p-4 text-white">
            <div className="flex items-center justify-between text-xs text-slate-300">
              <span>Optimised analysis</span><span>5× per job</span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full w-[24%] rounded-full bg-[#dfff58]" />
            </div>
            <p className="mt-3 text-xs leading-relaxed text-slate-400">Compact questions, duplicate reuse, and a persistent result cache reduce both waiting time and repeat spend.</p>
          </div>
        </aside>

        <section id="overview" className="min-w-0 px-4 py-6 sm:px-7 lg:px-10 lg:py-9">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
                {dataset.name} <ChevronDown className="size-4" />
                <Badge variant="secondary" className="rounded-full text-[10px]">{dataset.sourceLabel}</Badge>
              </div>
              <h1 className="mt-2 max-w-3xl text-3xl font-black leading-[1.02] tracking-[-0.05em] sm:text-5xl">
                Your audience already wrote the next brief.
              </h1>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" onClick={() => fileRef.current?.click()} className="h-11 flex-1 rounded-xl border-black/15 bg-white/60 px-4 sm:flex-none">
                <FileUp className="size-4" /> Upload CSV
              </Button>
              <Button onClick={() => setYoutubeOpen(true)} className="h-11 flex-1 rounded-xl bg-[#ff2e2e] px-5 text-white shadow-[0_8px_24px_rgba(255,46,46,.22)] hover:bg-[#e52323] sm:flex-none">
                <Video className="size-4" /> Import YouTube
              </Button>
              {dataset.source !== "demo" && (
                <Button onClick={downloadImportedCsv} variant="outline" className="h-11 w-full rounded-xl border-black/15 bg-white px-4 sm:w-auto">
                  <Download className="size-4" /> Download CSV
                </Button>
              )}
            </div>
          </div>

          {dataset.source !== "demo" && (readyAnalysisCount < dataset.comments.length || questionOpen) && !analyzing && (
            <div className="mt-5 rounded-2xl border border-emerald-700/20 bg-emerald-50 p-4 sm:p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-emerald-600 text-white"><CheckCircle2 className="size-5" /></span>
                  <div>
                    <p className="font-bold text-emerald-950">{questionOnlyReady ? "New question ready" : readyAnalysisCount ? "Analysis paused — your results are saved" : "Import complete"}</p>
                    <p className="mt-1 text-sm leading-relaxed text-emerald-900/70">
                      {questionOnlyReady
                        ? `Your existing signals are saved. D1 will only classify ${dataset.comments.length.toLocaleString()} comments for this new question.`
                        : readyAnalysisCount
                        ? `${readyAnalysisCount.toLocaleString()} of ${dataset.comments.length.toLocaleString()} comments are complete. Resume to finish the remaining ${(dataset.comments.length - readyAnalysisCount).toLocaleString()}.`
                        : `${dataset.comments.length.toLocaleString()} comments are ready for signals, purchase intent${dataset.audienceQuestion ? ", and your audience question" : ""}.`}
                    </p>
                    {dataset.audienceQuestion && !questionOpen && (
                      <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-emerald-950"><CircleHelp className="size-4" /> “{dataset.audienceQuestion.prompt}” · {dataset.audienceQuestion.options.length} choices</p>
                    )}
                  </div>
                </div>
                {!questionOpen && (
                  <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                    <Button onClick={editAudienceQuestion} variant="outline" className="h-11 rounded-xl border-emerald-800/20 bg-white/70 text-emerald-950">
                      <CircleHelp className="size-4" /> {dataset.audienceQuestion ? "Edit question" : "Add audience question"}
                    </Button>
                    <Button onClick={analyzeWithD1} className="h-11 rounded-xl bg-[#101827] px-5 text-white hover:bg-[#1b2638]">
                      <Sparkles className="size-4 text-[#dfff58]" /> {questionOnlyReady ? "Analyse new question" : readyAnalysisCount ? "Resume analysis" : dataset.audienceQuestion ? "Analyse both" : "Analyse with D1"}
                    </Button>
                  </div>
                )}
              </div>

              {questionOpen && (
                <div className="mt-5 rounded-2xl border border-emerald-900/15 bg-white p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-bold text-[#101827]">Ask the audience one specific question</p>
                      <p className="mt-1 text-sm text-slate-500">D1 will classify every relevant comment into one of your choices. Unclear comments are excluded automatically.</p>
                    </div>
                    <Button onClick={() => setQuestionOpen(false)} variant="ghost" size="icon" className="size-8 rounded-lg" aria-label="Close question editor"><X className="size-4" /></Button>
                  </div>
                  <div className="mt-4 space-y-2">
                    <Label htmlFor="audience-question">Your question</Label>
                    <Input id="audience-question" value={questionPrompt} onChange={(event) => setQuestionPrompt(event.target.value)} maxLength={240} placeholder="Which phone do people think has better battery life?" className="h-12 rounded-xl bg-white" />
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {questionOptions.map((option, index) => (
                      <div key={index} className="space-y-2">
                        <Label htmlFor={`audience-option-${index}`}>Choice {index + 1}</Label>
                        <div className="flex gap-2">
                          <Input id={`audience-option-${index}`} value={option} onChange={(event) => setQuestionOptions((current) => current.map((value, optionIndex) => optionIndex === index ? event.target.value : value))} maxLength={80} placeholder={index === 0 ? "iPhone" : index === 1 ? "Samsung" : "Another choice"} className="h-11 rounded-xl" />
                          {questionOptions.length > 2 && <Button onClick={() => setQuestionOptions((current) => current.filter((_, optionIndex) => optionIndex !== index))} variant="ghost" size="icon" className="size-11 shrink-0 rounded-xl" aria-label={`Remove choice ${index + 1}`}><X className="size-4" /></Button>}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                    {questionOptions.length < 6 && <Button onClick={() => setQuestionOptions((current) => [...current, ""])} variant="outline" className="rounded-xl"><Plus className="size-4" /> Add choice</Button>}
                    <div className="flex gap-2 sm:ml-auto">
                      {dataset.audienceQuestion && <Button onClick={removeAudienceQuestion} variant="ghost" className="rounded-xl text-slate-500">Remove question</Button>}
                      <Button onClick={saveAudienceQuestion} className="rounded-xl bg-[#101827] text-white">Use this question <ArrowRight className="size-4" /></Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {analyzing && (
            <div className="mt-5 rounded-2xl border border-black/10 bg-white p-4">
              <div className="mb-2 flex items-center justify-between gap-4 text-sm font-semibold">
                <span>D1 is analysing every imported comment</span><span>{analysisCount.toLocaleString()} / {dataset.comments.length.toLocaleString()}</span>
              </div>
              <Progress value={analysisProgress} className="h-2" />
              <div className="mt-3 flex items-center justify-between gap-4">
                <p className="text-xs text-slate-500">Results appear as each protected batch finishes.</p>
                <Button onClick={stopD1Analysis} variant="ghost" size="sm" className="rounded-lg text-slate-600"><X className="size-4" /> Stop</Button>
              </div>
            </div>
          )}

          <div className="mt-7 flex flex-col gap-4 rounded-2xl border border-black/10 bg-white/60 p-3 sm:flex-row sm:items-center">
            <Tabs value={signalView} onValueChange={changeSignalView} className="w-full sm:w-auto">
              <TabsList className="h-10 w-full rounded-xl bg-black/[.055] p-1 sm:w-auto">
                <TabsTrigger value="all" className="rounded-lg px-4">All signals <span className="ml-1.5 text-[10px] opacity-55">{analyzed.length}</span></TabsTrigger>
                <TabsTrigger value="objections" className="rounded-lg px-4">Objections <span className="ml-1.5 text-[10px] opacity-55">{objectionComments.length}</span></TabsTrigger>
                <TabsTrigger value="intent" className="rounded-lg px-4">Purchase intent <span className="ml-1.5 text-[10px] opacity-55">{intentComments.length}</span></TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 sm:ml-auto">
              <span className={`size-2 rounded-full ${analyzed.length ? "bg-emerald-500" : "bg-amber-500"}`} />
              {analyzed.length
                ? `${dataset.source === "demo" ? "Showcase snapshot" : `Analysed ${formatTime(dataset.analyzedAt)}`} · ${analyzed.length.toLocaleString()} comments`
                : `${dataset.comments.length} comments ready to analyse`}
            </div>
          </div>

          {dataset.source !== "demo" && readyAnalysisCount === dataset.comments.length && !audienceSummary && !questionOpen && !analyzing && (
            <div className="mt-5 flex flex-col gap-4 rounded-2xl border border-blue-700/15 bg-[#eaf6ff] p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-blue-600 text-white"><CircleHelp className="size-5" /></span>
                <div>
                  <p className="font-bold text-[#101827]">Have another question for this audience?</p>
                  <p className="mt-1 text-sm text-slate-600">Add your choices and run a fast question-only pass without recomputing the existing signals.</p>
                </div>
              </div>
              <Button onClick={startNewAudienceQuestion} className="shrink-0 rounded-xl bg-[#101827] text-white"><Plus className="size-4" /> Add another question</Button>
            </div>
          )}

          {audienceSummary && audienceSummary.answered > 0 && (
            <article className="mt-5 overflow-hidden rounded-[26px] border border-black/10 bg-white">
              <div className="flex flex-col gap-4 border-b border-black/10 bg-[#eaf6ff] p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.13em] text-blue-700">Your audience question</p>
                  <h2 className="mt-2 text-xl font-bold tracking-[-0.035em] sm:text-2xl">{audienceSummary.question.prompt}</h2>
                  <p className="mt-2 text-sm text-slate-500">{audienceSummary.relevant.toLocaleString()} relevant opinions · {audienceSummary.notRelevant.toLocaleString()} unclear or unrelated comments excluded</p>
                </div>
                {!analyzing && <Button onClick={startNewAudienceQuestion} variant="outline" className="shrink-0 rounded-xl border-black/15 bg-white"><Plus className="size-4" /> Ask another question</Button>}
              </div>
              <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6 lg:grid-cols-3">
                {audienceSummary.options.map((item, index) => (
                  <div key={item.option} className="rounded-2xl border border-black/10 bg-[#f8f7f2] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-sm font-bold">{item.option}</span>
                      <strong className="text-xl tracking-[-0.04em]">{item.share}%</strong>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/[.07]">
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${item.share}%`, backgroundColor: ["#101827", "#ff2e2e", "#2d82c7", "#7c3aed", "#059669", "#d97706"][index % 6] }} />
                    </div>
                    <p className="mt-3 text-xs font-semibold text-slate-500">{item.count.toLocaleString()} comments</p>
                  </div>
                ))}
              </div>
            </article>
          )}

          <div className="mt-5 grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
            <article className="overflow-hidden rounded-[26px] bg-[#101827] text-white shadow-[0_20px_60px_rgba(16,24,39,.14)]">
              <div className="flex items-start justify-between border-b border-white/10 p-5 sm:p-7">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#dfff58]">{signalView === "intent" ? "Purchase signals" : signalView === "objections" ? "Objection focus" : "Signal overview"}</p>
                  <h2 className="mt-2 text-2xl font-bold tracking-[-0.035em]">{signalView === "intent" ? "Who looks ready to buy?" : signalView === "objections" ? "What is stopping the sale?" : "What did D1 find?"}</h2>
                </div>
                <Badge className="rounded-full bg-white/10 px-3 text-slate-200 hover:bg-white/10">{signalView === "intent" ? `${intentComments.length} strong signals` : signalView === "objections" ? `${objectionComments.length} objections` : `${analyzed.length} analysed`}</Badge>
              </div>
              <div className="p-5 sm:p-7">
                {signalView === "all" ? (
                  <div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {signalSummary.map((item) => (
                        <button
                          key={item.key}
                          onClick={() => openComments(item.key)}
                          className="group rounded-2xl border border-white/10 bg-white/[.055] p-4 text-left transition hover:-translate-y-0.5 hover:bg-white/[.09]"
                        >
                          <span className="flex items-center justify-between gap-4">
                            <span className="flex items-center gap-2 text-sm font-semibold"><span className="size-2.5 rounded-full" style={{ backgroundColor: item.color }} />{item.label}</span>
                            <ArrowUpRight className="size-4 text-slate-500 transition group-hover:text-[#dfff58]" />
                          </span>
                          <span className="mt-4 flex items-end gap-2">
                            <strong className="text-4xl tracking-[-0.055em]">{item.count}</strong>
                            <span className="pb-1 text-sm font-semibold text-slate-400">{item.share}%</span>
                          </span>
                          <span className="mt-2 block text-xs leading-relaxed text-slate-400">{item.description}</span>
                        </button>
                      ))}
                    </div>
                    <p className="mt-4 text-xs leading-relaxed text-slate-500">Signals can overlap: a purchase-ready comment may also contain an objection that needs answering.</p>
                  </div>
                ) : signalView === "intent" && intentComments.length ? (
                  <div className="space-y-3">
                    {intentComments.slice(0, 5).map((comment) => (
                      <button key={comment.id} onClick={() => openComments("intent")} className="flex w-full items-start gap-4 rounded-2xl border border-white/10 bg-white/[.055] p-4 text-left transition hover:bg-white/[.09]">
                        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#dfff58] text-sm font-black text-[#101827]">{Math.round(comment.analysis!.purchaseIntent * 100)}</span>
                        <span className="min-w-0">
                          <span className="line-clamp-2 block text-sm leading-relaxed text-slate-100">“{comment.text}”</span>
                          <span className="mt-1.5 block text-xs text-slate-400">Strong purchase intent · {Math.round(comment.analysis!.purchaseIntent * 100)}% score</span>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : signalView === "intent" ? (
                  <div className="grid min-h-64 place-items-center text-center">
                    <div>
                      <CircleDot className="mx-auto size-9 text-slate-500" />
                      <p className="mt-3 font-semibold">No strong purchase intent found</p>
                      <p className="mx-auto mt-1 max-w-sm text-sm text-slate-400">None of the analysed comments crossed the 75% strong-intent threshold. This is a valid result, not a loading error.</p>
                    </div>
                  </div>
                ) : ranked.length ? (
                  <div className="space-y-6">
                    {ranked.slice(0, 5).map((item, index) => (
                      <button key={item.key} onClick={() => openComments("objections", item.key)} className="block w-full text-left">
                        <div className="mb-2.5 flex items-end justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-bold text-slate-500">0{index + 1}</span>
                            <span className="font-semibold">{item.label}</span>
                          </div>
                          <strong className="text-2xl tracking-[-0.04em]">{item.value}%</strong>
                        </div>
                        <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
                          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(4, item.value * 2.75)}%`, backgroundColor: item.color }} />
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="grid min-h-64 place-items-center text-center">
                    <div>
                      <BarChart3 className="mx-auto size-9 text-slate-500" />
                      <p className="mt-3 font-semibold">Signals will appear here</p>
                      <p className="mt-1 text-sm text-slate-400">Run D1 analysis to build your objection map.</p>
                    </div>
                  </div>
                )}
                <button onClick={() => openComments(signalView === "intent" ? "intent" : signalView === "objections" ? "objections" : "all")} className="mt-7 flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/[.055] p-4 text-left transition hover:bg-white/[.09]">
                  <span>
                    <span className="block text-sm font-semibold">Explore comments behind this view</span>
                    <span className="mt-1 block text-xs text-slate-400">{signalView === "intent" ? `${intentComments.length} strong-intent comments` : signalView === "objections" ? `${objectionComments.length} comments contain objections` : `${analyzed.length} analysed comments across every signal`}</span>
                  </span>
                  <ArrowUpRight className="size-5 text-[#dfff58]" />
                </button>
              </div>
            </article>

            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-1">
              <button onClick={() => openComments("intent")} className="rounded-[26px] border border-black/10 bg-[#dfff58] p-6 text-left transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#101827]">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-black uppercase tracking-[0.12em]">Strong purchase intent</p>
                  <ArrowUpRight className="size-4" />
                </div>
                <p className="mt-7 text-6xl font-black tracking-[-0.07em]">{strongIntentShare}%</p>
                <p className="mt-2 max-w-xs text-sm font-medium leading-relaxed text-[#34400d]">{strongIntent} people asked where to buy, requested a link, or showed clear intent to try it.</p>
                <span className="mt-4 block text-xs font-bold text-[#34400d]">View purchase-ready comments →</span>
              </button>
              <article className="rounded-[26px] border border-black/10 bg-white p-6">
                <div className="flex items-center gap-2">
                  <span className="grid size-8 place-items-center rounded-full bg-[#101827] text-[#dfff58]"><Sparkles className="size-4" /></span>
                  <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Creative move</p>
                </div>
                <blockquote className="mt-5 text-xl font-bold leading-snug tracking-[-0.035em]">“{top.hook}”</blockquote>
                <p className="mt-4 text-sm leading-relaxed text-slate-500">Lead with {top.label.toLowerCase()}—the most common expressed objection in this dataset.</p>
                <Button onClick={() => setBriefOpen(true)} variant="outline" className="mt-5 w-full rounded-xl border-black/15">Open creative brief <ArrowUpRight className="size-4" /></Button>
              </article>
            </div>
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_270px]">
            <section className="rounded-[26px] border border-black/10 bg-white p-5 sm:p-7">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.13em] text-slate-400">Evidence</p>
                  <h2 className="mt-1 text-xl font-bold tracking-[-0.035em]">Comments behind the signal</h2>
                </div>
                <Button onClick={() => openComments(signalView === "intent" ? "intent" : signalView === "objections" ? "objections" : "all")} variant="ghost" className="justify-start rounded-xl text-slate-600 sm:justify-center">View matching comments <ArrowUpRight className="size-4" /></Button>
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-3">
                {evidenceComments.slice(0, 3).map((comment) => (
                  <article key={comment.id} className="rounded-2xl border border-black/10 bg-[#f8f7f2] p-4">
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="secondary" className="max-w-[70%] truncate rounded-full bg-white text-[11px]">{evidenceMeta(comment).label}</Badge>
                      <span className="text-[11px] font-semibold text-emerald-700">{evidenceMeta(comment).score}</span>
                    </div>
                    <p className="mt-4 line-clamp-4 text-sm leading-relaxed text-slate-700">“{comment.text}”</p>
                  </article>
                ))}
                {!evidenceComments.length && <p className="col-span-full rounded-2xl border border-dashed border-black/15 p-8 text-center text-sm text-slate-500">No comments match this signal view yet.</p>}
              </div>
            </section>
            <aside className="rounded-[26px] border border-black/10 bg-[#ffebe5] p-6">
              <ShieldCheck className="size-7 text-[#ff2e2e]" />
              <p className="mt-5 text-4xl font-black tracking-[-0.06em]">{flagged}</p>
              <p className="mt-1 font-bold">high-confidence junk signals</p>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">Flagged for review only. This showcase never hides or deletes a comment.</p>
            </aside>
          </div>

          <footer className="flex flex-col gap-2 py-8 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <span>Liquid Signal · Decisions by D1, actions controlled by you.</span>
            <span>{dataset.model ?? "Awaiting analysis"} {dataset.costUsd != null ? `· $${dataset.costUsd.toFixed(4)} estimated` : ""}</span>
          </footer>
        </section>
      </div>

      <Dialog open={youtubeOpen} onOpenChange={changeYoutubeDialog}>
        <DialogContent className="max-w-lg rounded-[26px] border-black/10 bg-[#f8f7f2] p-0">
          <div className="rounded-t-[25px] bg-[#ff2e2e] p-6 text-white">
            <div className="grid size-11 place-items-center rounded-2xl bg-white/15"><Video className="size-5" /></div>
            <DialogHeader className="mt-5 text-left">
              <DialogTitle className="text-2xl font-black tracking-[-0.04em]">Import YouTube comments</DialogTitle>
              <DialogDescription className="text-white/75">Paste a public video URL. We’ll page through its newest top-level comments and pause every 10,000.</DialogDescription>
            </DialogHeader>
          </div>
          <div className="space-y-5 p-6">
            <div className="space-y-2">
              <Label htmlFor="youtube-url">YouTube video URL</Label>
              <Input id="youtube-url" value={youtubeUrl} onChange={(event) => setYoutubeUrl(event.target.value)} disabled={importing || Boolean(pendingImport)} placeholder="https://youtube.com/watch?v=…" className="h-12 rounded-xl bg-white" />
            </div>
            {(importing || pendingImport) && (
              <div className="rounded-2xl border border-black/10 bg-white p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-[#101827]">{importTitle || pendingImport?.videoTitle}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {importing
                        ? `${importCount.toLocaleString()} newest comments imported`
                        : `${pendingImport?.comments.length.toLocaleString()} comments ready`}
                    </p>
                  </div>
                  <Badge className="shrink-0 rounded-full bg-[#101827] text-[#dfff58] hover:bg-[#101827]">
                    {Math.min(100, Math.round((importCount / importGoal) * 100))}%
                  </Badge>
                </div>
                <Progress value={Math.min(100, (importCount / importGoal) * 100)} className="mt-4 h-2" />
                <p className="mt-3 text-xs leading-relaxed text-slate-500">
                  Newest first · about one YouTube quota unit per 100 comments · duplicates removed
                </p>
              </div>
            )}
            {pendingImport && (
              <div className="rounded-2xl border border-[#b7cf38] bg-[#f4ffc4] p-4">
                <p className="font-bold text-[#253000]">Do you want to import more comments?</p>
                <p className="mt-1.5 text-sm leading-relaxed text-[#526014]">
                  We have taken the first fresh new {pendingImport.comments.length.toLocaleString()} comments into consideration.
                </p>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <Button onClick={() => finishYouTubeImport(pendingImport)} variant="outline" className="rounded-xl border-black/15 bg-white">
                    Use these comments
                  </Button>
                  <Button onClick={() => importYouTube(pendingImport)} className="rounded-xl bg-[#101827] text-white">
                    Import 10,000 more <ArrowRight className="size-4" />
                  </Button>
                </div>
              </div>
            )}
            <div className="flex items-start gap-3 rounded-xl border border-black/10 bg-white p-3 text-sm text-slate-600">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
              Public comment text is imported without profile images. Only top-level comments are included in this proof of concept.
            </div>
            {!pendingImport && (
              <Button onClick={importing ? stopYouTubeImport : () => importYouTube()} disabled={!youtubeUrl.trim()} variant={importing ? "outline" : "default"} className="h-12 w-full rounded-xl border-black/15 bg-[#101827] text-white hover:bg-[#1b2638]">
                {importing ? <X className="size-4" /> : <ArrowRight className="size-4" />}
                {importing ? "Stop and use imported comments" : "Import newest comments"}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={commentsOpen} onOpenChange={setCommentsOpen}>
        <DialogContent className="max-h-[90vh] overflow-hidden rounded-[26px] border-black/10 p-0 sm:max-w-4xl">
          <div className="border-b border-black/10 bg-[#f3f1e9] p-6">
            <DialogHeader className="text-left">
              <DialogTitle className="text-2xl font-black tracking-[-0.04em]">Comment evidence</DialogTitle>
              <DialogDescription>{visibleComments.length} matching · {analyzed.length} analysed · {dataset.comments.length} total · identities omitted</DialogDescription>
            </DialogHeader>
            <div className="mt-5 flex items-center gap-2 rounded-xl border border-black/10 bg-white px-3">
              <Search className="size-4 text-slate-400" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search text or objection type…" className="h-11 border-0 px-0 shadow-none focus-visible:ring-0" />
              {query && <Button onClick={() => setQuery("")} variant="ghost" size="icon" className="size-8 rounded-lg"><X className="size-4" /></Button>}
            </div>
            <div className="mt-3 flex flex-col gap-3">
              <div className="flex min-w-0 flex-wrap gap-2">
                {COMMENT_FILTERS.map((filter) => (
                  <button
                    key={filter.key}
                    onClick={() => setCommentFilter(filter.key)}
                    className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold transition ${commentFilter === filter.key ? "border-[#101827] bg-[#101827] text-white" : "border-black/10 bg-white text-slate-600 hover:border-black/25"}`}
                  >
                    {filter.label} <span className={commentFilter === filter.key ? "text-[#dfff58]" : "text-slate-400"}>{filterCounts[filter.key]}</span>
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 text-xs font-bold text-slate-500">
                Type
                <select
                  value={categoryFilter}
                  onChange={(event) => setCategoryFilter(event.target.value as ObjectionKey | "all")}
                  className="h-9 rounded-xl border border-black/10 bg-white px-3 text-xs font-semibold text-slate-700 outline-none focus:border-black/30"
                  aria-label="Filter by objection type"
                >
                  <option value="all">All categories</option>
                  {Object.entries(CATEGORY).map(([key, category]) => <option key={key} value={key}>{category.label}</option>)}
                </select>
              </label>
            </div>
          </div>
          <div className="min-w-0 max-h-[58vh] space-y-3 overflow-y-auto p-5">
            {visibleComments.slice(0, 100).map((comment) => (
              <article key={comment.id} className="min-w-0 overflow-hidden rounded-2xl border border-black/10 p-4">
                <p className="break-words text-sm leading-relaxed text-slate-700">“{comment.text}”</p>
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-black/[.07] pt-3">
                  {comment.analysis ? (
                    <>
                      <Badge variant="secondary" className="rounded-full">{CATEGORY[comment.analysis.objectionType].label}</Badge>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">Objection {Math.round(comment.analysis.isObjection * 100)}%</span>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">Type confidence {Math.round(comment.analysis.objectionConfidence * 100)}%</span>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">Purchase intent {Math.round(comment.analysis.purchaseIntent * 100)}%</span>
                      {comment.analysis.purchaseIntent >= .75 && <Badge className="rounded-full bg-[#dfff58] text-[#101827] hover:bg-[#dfff58]">High intent</Badge>}
                      {comment.analysis.spam >= .95 && <Badge variant="destructive" className="rounded-full">Likely spam</Badge>}
                      {comment.analysis.abuse >= .95 && <Badge variant="destructive" className="rounded-full">Likely abuse</Badge>}
                      {comment.analysis.reviewRequired && <Badge variant="outline" className="rounded-full border-amber-400 bg-amber-50 text-amber-800">Needs review</Badge>}
                    </>
                  ) : <Badge variant="outline" className="rounded-full">Not analysed</Badge>}
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400">
                  <span>Source: {comment.source === "youtube" ? "YouTube" : comment.source === "csv" ? "CSV" : "Showcase"}</span>
                  {comment.publishedAt && <span>Published {new Date(comment.publishedAt).toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" })}</span>}
                  {comment.sourceId && <span>Reference {comment.sourceId.slice(0, 12)}</span>}
                </div>
              </article>
            ))}
            {!visibleComments.length && (
              <div className="grid min-h-48 place-items-center rounded-2xl border border-dashed border-black/15 text-center">
                <div>
                  <Search className="mx-auto size-8 text-slate-300" />
                  <p className="mt-3 font-semibold">No comments match these filters</p>
                  <button onClick={() => { setQuery(""); setCommentFilter("all"); setCategoryFilter("all"); }} className="mt-2 text-sm font-bold text-blue-700 hover:underline">Clear all filters</button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={briefOpen} onOpenChange={setBriefOpen}>
        <DialogContent className="max-w-2xl overflow-hidden rounded-[26px] border-black/10 p-0">
          <div className="bg-[#101827] p-6 text-white sm:p-8">
            <Badge className="rounded-full bg-[#dfff58] text-[#101827] hover:bg-[#dfff58]">Creative brief · {dataset.name}</Badge>
            <DialogHeader className="mt-5 text-left">
              <DialogTitle className="text-3xl font-black tracking-[-0.05em] text-white">Three hooks grounded in what people actually said.</DialogTitle>
              <DialogDescription className="text-slate-400">Directions are templated from D1’s ranked decisions—not invented evidence.</DialogDescription>
            </DialogHeader>
          </div>
          <div className="space-y-3 bg-[#f3f1e9] p-5 sm:p-6">
            {ranked.slice(0, 3).map((item, index) => (
              <article key={item.key} className="flex gap-4 rounded-2xl border border-black/10 bg-white p-4">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl text-sm font-black" style={{ backgroundColor: item.color }}>0{index + 1}</span>
                <div>
                  <div className="flex flex-wrap items-center gap-2"><strong>{item.label}</strong><span className="text-xs text-slate-400">{item.value}% of objections</span></div>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-600">Hook direction: “{item.hook}”</p>
                </div>
              </article>
            ))}
            <div className="flex items-start gap-3 rounded-2xl border border-amber-500/20 bg-amber-50 p-4 text-sm text-amber-900">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              Validate every claim against product evidence before publishing creative.
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
