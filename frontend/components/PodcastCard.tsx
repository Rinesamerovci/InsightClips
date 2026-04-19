import { useEffect, useState } from "react";

type Podcast = {
  id: string;
  title: string;
  duration: number;
  status: string;
  created_at: string | null;
};

type AnalysisSummary = {
  total_scored_segments: number;
  highest_score: number;
  top_segments?: Array<{
    transcript_snippet: string;
    virality_score: number;
    sentiment: string;
  }>;
};

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

function formatDate(value: string | null): string {
  if (!value) {
    return "Just now";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatStatus(status: string): string {
  return status
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function clipSnippet(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= 88) {
    return normalized;
  }
  return `${normalized.slice(0, 85).trim()}...`;
}

function estimateAnalysisTime(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes <= 3) {
    return "about 1-2 minutes";
  }
  if (minutes <= 10) {
    return "a few minutes";
  }
  return "several minutes";
}

function buildAnalysisStages(seconds: number): string[] {
  const estimated = estimateAnalysisTime(seconds);
  return [
    "Preparing audio",
    "Transcribing spoken content",
    "Scoring viral moments",
    `Still processing — this can take ${estimated}`,
  ];
}

function buildProgressValue(stageIndex: number, stageCount: number): number {
  if (stageCount <= 1) {
    return 24;
  }
  const progress = 24 + (stageIndex * (56 / (stageCount - 1)));
  return Math.min(Math.round(progress), 80);
}

export function PodcastCard({
  podcast,
  analysis,
  analysisLoading = false,
  onAnalyze,
}: {
  podcast: Podcast;
  analysis?: AnalysisSummary | null;
  analysisLoading?: boolean;
  onAnalyze?: () => void;
}) {
  const hasAnalysis = Boolean(analysis && analysis.total_scored_segments > 0);
  const requiresPayment = podcast.status === "awaiting_payment";
  const stages = buildAnalysisStages(podcast.duration);
  const [stageIndex, setStageIndex] = useState(0);
  const progressValue = buildProgressValue(stageIndex, stages.length);

  useEffect(() => {
    if (!analysisLoading) {
      return;
    }

    const interval = window.setInterval(() => {
      setStageIndex((current) => (current + 1) % stages.length);
    }, 2800);

    return () => window.clearInterval(interval);
  }, [analysisLoading, stages.length]);

  const statusClassName =
    podcast.status === "completed"
      ? "bg-[#dff0db] text-[#35553c]"
      : podcast.status === "processing"
        ? "bg-[#fff3d8] text-[#8a6b1f]"
        : podcast.status === "ready_for_processing"
          ? "bg-[#d8efe6] text-[#2f6a56]"
          : podcast.status === "awaiting_payment"
            ? "bg-[#fff3d8] text-[#8a6b1f]"
            : podcast.status === "blocked"
              ? "bg-[#fff0f0] text-[#9d4b4b]"
              : podcast.status === "free_ready"
                ? "bg-[#dff0db] text-[#35553c]"
                : "bg-[#e9ece7] text-[#5f6f63]";

  return (
    <article className="rounded-[2rem] border border-[#d9e5d3] bg-white p-6 shadow-[0_20px_50px_rgba(124,150,118,0.12)] transition hover:-translate-y-1 hover:shadow-[0_24px_60px_rgba(124,150,118,0.16)]">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-[0.25em] text-[#7c9676]">Podcast</p>
          <h3 className="mt-2 break-words text-xl font-semibold leading-9 text-[#203328]">
            {podcast.title}
          </h3>
        </div>
        <span
          className={`max-w-[10rem] shrink-0 rounded-full px-3 py-1 text-center text-xs font-semibold ${statusClassName}`}
          title={formatStatus(podcast.status)}
        >
          {formatStatus(podcast.status)}
        </span>
      </div>

      <div className="mt-auto grid grid-cols-2 gap-4 rounded-[1.5rem] bg-[#f4f7ef] p-4 text-sm text-[#526352]">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[#8aa084]">Duration</p>
          <p className="mt-1 font-medium text-[#203328]">{formatDuration(podcast.duration)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[#8aa084]">Uploaded</p>
          <p className="mt-1 font-medium text-[#203328]">{formatDate(podcast.created_at)}</p>
        </div>
      </div>

      <div className="mt-4 rounded-[1.25rem] border border-[#d9e5d3] bg-[#fbfdf8] p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-[0.2em] text-[#8aa084]">Virality Analysis</p>
            {hasAnalysis ? (
              <p className="mt-1 text-sm font-medium text-[#203328]">
                Top score {analysis!.highest_score.toFixed(1)} · {analysis!.total_scored_segments} segments
              </p>
            ) : (
              <p className="mt-1 text-sm font-medium text-[#526352]">
                {analysisLoading
                  ? "Analysis is running now..."
                  : requiresPayment
                    ? "Payment is required before analysis can begin"
                    : "No analysis saved yet"}
              </p>
            )}
            {analysisLoading ? (
              <div className="mt-3 rounded-2xl border border-[#d9e5d3] bg-white px-3 py-3 text-sm text-[#526352]">
                <div className="flex items-center gap-2 font-medium text-[#2f5f34]">
                  <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-[#5a9e3a]" />
                  Processing in progress
                </div>
                <p className="mt-2 text-sm font-semibold text-[#203328]">
                  {stages[stageIndex]}
                </p>
                <div className="mt-3">
                  <div className="h-2 overflow-hidden rounded-full bg-[#edf4e8]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#5a9e3a] via-[#74b356] to-[#9dcf7f] transition-[width] duration-700 ease-out"
                      style={{ width: `${progressValue}%` }}
                    />
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.14em] text-[#7c9676]">
                    <span>Working</span>
                    <span>{progressValue}%</span>
                  </div>
                </div>
                <p className="mt-2 leading-6">
                  We are transcribing and scoring this episode now. This can take {estimateAnalysisTime(podcast.duration)}, especially for longer videos or when local AI transcription is being used.
                </p>
                <p className="mt-1 text-xs font-medium uppercase tracking-[0.14em] text-[#7c9676]">
                  Please wait while the analysis completes.
                </p>
              </div>
            ) : null}
          </div>
          {!hasAnalysis && !requiresPayment && onAnalyze ? (
            <button
              type="button"
              onClick={onAnalyze}
              disabled={analysisLoading}
              className="inline-flex w-full items-center justify-center rounded-[1.1rem] border border-[#cde3c4] bg-[#dff0db] px-5 py-3 text-sm font-semibold text-[#2f5f34] shadow-[0_10px_24px_rgba(124,150,118,0.14)] transition hover:bg-[#cfe9c9] sm:w-auto disabled:cursor-not-allowed disabled:opacity-60"
            >
              {analysisLoading ? "Analyzing now..." : "Analyze podcast"}
            </button>
          ) : null}
          {!hasAnalysis && requiresPayment ? (
            <span className="rounded-full bg-[#fff3d8] px-4 py-2 text-xs font-semibold text-[#8a6b1f]">
              Payment required
            </span>
          ) : null}
          {hasAnalysis && !analysisLoading ? (
            <span className="rounded-full bg-[#edf8e8] px-4 py-2 text-xs font-semibold text-[#3f7543]">
              Analyzed
            </span>
          ) : null}
        </div>

        {hasAnalysis && analysis?.top_segments?.length ? (
          <div className="mt-4 space-y-2">
            {analysis.top_segments.slice(0, 3).map((segment, index) => (
              <div
                key={`${segment.virality_score}-${index}`}
                className="rounded-2xl border border-[#e2ecd9] bg-white/90 px-3 py-2"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#7c9676]">
                    Segment {index + 1}
                  </span>
                  <span className="rounded-full bg-[#f0f7ea] px-2.5 py-1 text-[11px] font-semibold text-[#35553c]">
                    {segment.virality_score.toFixed(1)}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6 text-[#314535]">
                  {clipSnippet(segment.transcript_snippet)}
                </p>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}
