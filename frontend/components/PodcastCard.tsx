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

      <div className="grid grid-cols-2 gap-4 rounded-[1.5rem] bg-[#f4f7ef] p-4 text-sm text-[#526352]">
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
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[#8aa084]">Virality Analysis</p>
            {analysis ? (
              <p className="mt-1 text-sm font-medium text-[#203328]">
                Top score {analysis.highest_score.toFixed(1)} · {analysis.total_scored_segments} segments
              </p>
            ) : (
              <p className="mt-1 text-sm font-medium text-[#526352]">
                {analysisLoading ? "Analyzing..." : "No analysis saved yet"}
              </p>
            )}
          </div>
          {!analysis && onAnalyze ? (
            <button
              type="button"
              onClick={onAnalyze}
              disabled={analysisLoading}
              className="rounded-full bg-[#dff0db] px-4 py-2 text-xs font-semibold text-[#35553c] transition hover:bg-[#cfe9c9] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {analysisLoading ? "Running..." : "Analyze"}
            </button>
          ) : null}
          {analysis && !analysisLoading ? (
            <span className="rounded-full bg-[#edf8e8] px-4 py-2 text-xs font-semibold text-[#3f7543]">
              Analyzed
            </span>
          ) : null}
        </div>

        {analysis?.top_segments?.length ? (
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
