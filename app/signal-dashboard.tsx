"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  ChevronDown,
  CircleDot,
  FileUp,
  LayoutDashboard,
  Loader2,
  MessageSquareText,
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
import type { ObjectionKey, SignalComment, SignalDataset } from "@/lib/types";

type SignalView = "all" | "objections" | "intent";
type CommentFilter = "all" | "objections" | "intent" | "review" | "flagged" | "unanalyzed";

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
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [query, setQuery] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

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
      : analyzed;

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

  async function importYouTube() {
    if (!youtubeUrl.trim()) return;
    setImporting(true);
    try {
      const response = await fetch("/api/youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: youtubeUrl, maxResults: 100 }),
      });
      const payload = await response.json() as { dataset?: SignalDataset; error?: string };
      if (!response.ok || !payload.dataset) throw new Error(payload.error ?? "YouTube import failed");
      setDataset(payload.dataset);
      void persistDataset(payload.dataset);
      setYoutubeOpen(false);
      toast.success(`Imported ${payload.dataset.comments.length} comments`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "YouTube import failed", {
        description: "You can continue with a CSV or the showcase dataset.",
      });
    } finally {
      setImporting(false);
    }
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
    toast.success(`Loaded ${comments.length} comments`, { description: "Ready for a capped Jev analysis run." });
  }

  async function analyzeWithJev() {
    if (analyzing) return;
    const cap = Math.min(dataset.comments.length, 25);
    if (!cap) return;
    setAnalyzing(true);
    setAnalysisProgress(12);
    const timer = window.setInterval(() => setAnalysisProgress((value) => Math.min(88, value + 7)), 450);
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          comments: dataset.comments.slice(0, cap),
          context: { product: dataset.name, source: dataset.source },
        }),
      });
      const payload = await response.json() as {
        comments?: SignalComment[];
        model?: string;
        inputTokens?: number;
        costUsd?: number;
        error?: string;
      };
      if (!response.ok || !payload.comments) throw new Error(payload.error ?? "Analysis failed");
      const analyzedById = new Map(payload.comments.map((comment) => [comment.id, comment]));
      setDataset((current) => {
        const next = {
          ...current,
          comments: current.comments.map((comment) => analyzedById.get(comment.id) ?? comment),
          analyzedAt: new Date().toISOString(),
          model: payload.model,
          inputTokens: payload.inputTokens,
          costUsd: payload.costUsd,
        };
        void persistDataset(next);
        return next;
      });
      setAnalysisProgress(100);
      toast.success(`Analysed ${payload.comments.length} comments with Jev`, {
        description: `Estimated cost: $${(payload.costUsd ?? 0).toFixed(4)}`,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Analysis failed", {
        description: "The showcase dataset remains available while API credentials are configured.",
      });
    } finally {
      window.clearInterval(timer);
      setAnalyzing(false);
      window.setTimeout(() => setAnalysisProgress(0), 800);
    }
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
          <a href="#" className="flex items-center gap-2.5" aria-label="Jev Signal home">
            <span className="grid size-9 place-items-center rounded-[11px] bg-[#101827] text-[#dfff58] shadow-[inset_0_0_0_1px_rgba(255,255,255,.12)]">
              <CircleDot className="size-5" />
            </span>
            <span className="text-[17px] font-black tracking-[-0.04em]">Jev Signal</span>
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
              <span>Spend guard</span><span>25 / run</span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full w-[24%] rounded-full bg-[#dfff58]" />
            </div>
            <p className="mt-3 text-xs leading-relaxed text-slate-400">Every live run is capped before it can spend your remaining TypeSafe credit.</p>
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
                <Button onClick={analyzeWithJev} disabled={analyzing} className="h-11 w-full rounded-xl bg-[#101827] px-5 text-white sm:w-auto">
                  {analyzing ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4 text-[#dfff58]" />}
                  {analyzing ? "Analysing…" : "Analyse with Jev"}
                </Button>
              )}
            </div>
          </div>

          {analysisProgress > 0 && (
            <div className="mt-5 rounded-2xl border border-black/10 bg-white p-4">
              <div className="mb-2 flex items-center justify-between text-sm font-semibold">
                <span>Running a protected Jev analysis</span><span>{analysisProgress}%</span>
              </div>
              <Progress value={analysisProgress} className="h-2" />
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

          <div className="mt-5 grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
            <article className="overflow-hidden rounded-[26px] bg-[#101827] text-white shadow-[0_20px_60px_rgba(16,24,39,.14)]">
              <div className="flex items-start justify-between border-b border-white/10 p-5 sm:p-7">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#dfff58]">{signalView === "intent" ? "Purchase signals" : signalView === "objections" ? "Objection focus" : "Signal overview"}</p>
                  <h2 className="mt-2 text-2xl font-bold tracking-[-0.035em]">{signalView === "intent" ? "Who looks ready to buy?" : "What is stopping the sale?"}</h2>
                </div>
                <Badge className="rounded-full bg-white/10 px-3 text-slate-200 hover:bg-white/10">{signalView === "intent" ? `${intentComments.length} strong signals` : `${objectionComments.length} objections`}</Badge>
              </div>
              <div className="p-5 sm:p-7">
                {signalView === "intent" && intentComments.length ? (
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
                      <p className="mt-1 text-sm text-slate-400">Run the capped Jev analysis to build your objection map.</p>
                    </div>
                  </div>
                )}
                <button onClick={() => openComments(signalView === "intent" ? "intent" : signalView === "objections" ? "objections" : "all")} className="mt-7 flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/[.055] p-4 text-left transition hover:bg-white/[.09]">
                  <span>
                    <span className="block text-sm font-semibold">Explore comments behind this view</span>
                    <span className="mt-1 block text-xs text-slate-400">{signalView === "intent" ? `${intentComments.length} strong-intent comments` : `${filterCounts.review} uncertain classifications need review`}</span>
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
                      <Badge variant="secondary" className="max-w-[70%] truncate rounded-full bg-white text-[11px]">{CATEGORY[comment.analysis!.objectionType].label}</Badge>
                      <span className="text-[11px] font-semibold text-emerald-700">{signalView === "intent" ? `${Math.round(comment.analysis!.purchaseIntent * 100)}% intent` : `${Math.round(comment.analysis!.objectionConfidence * 100)}% confidence`}</span>
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
            <span>Jev Signal · Decisions by Jev, actions controlled by you.</span>
            <span>{dataset.model ?? "Awaiting analysis"} {dataset.costUsd != null ? `· $${dataset.costUsd.toFixed(4)} estimated` : ""}</span>
          </footer>
        </section>
      </div>

      <Dialog open={youtubeOpen} onOpenChange={setYoutubeOpen}>
        <DialogContent className="max-w-lg rounded-[26px] border-black/10 bg-[#f8f7f2] p-0">
          <div className="rounded-t-[25px] bg-[#ff2e2e] p-6 text-white">
            <div className="grid size-11 place-items-center rounded-2xl bg-white/15"><Video className="size-5" /></div>
            <DialogHeader className="mt-5 text-left">
              <DialogTitle className="text-2xl font-black tracking-[-0.04em]">Import YouTube comments</DialogTitle>
              <DialogDescription className="text-white/75">Paste a public video URL. We’ll fetch up to 100 top-level comments and cache the dataset.</DialogDescription>
            </DialogHeader>
          </div>
          <div className="space-y-5 p-6">
            <div className="space-y-2">
              <Label htmlFor="youtube-url">YouTube video URL</Label>
              <Input id="youtube-url" value={youtubeUrl} onChange={(event) => setYoutubeUrl(event.target.value)} placeholder="https://youtube.com/watch?v=…" className="h-12 rounded-xl bg-white" />
            </div>
            <div className="flex items-start gap-3 rounded-xl border border-black/10 bg-white p-3 text-sm text-slate-600">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
              Public comment text is imported without profile images. A quota error never removes your cached or CSV data.
            </div>
            <Button onClick={importYouTube} disabled={importing || !youtubeUrl.trim()} className="h-12 w-full rounded-xl bg-[#101827]">
              {importing ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
              {importing ? "Importing comments…" : "Import comments"}
            </Button>
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
              <DialogDescription className="text-slate-400">Directions are templated from Jev’s ranked decisions—not invented evidence.</DialogDescription>
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
