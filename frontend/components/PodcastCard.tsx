"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Calendar,
  ChevronDown,
  ChevronRight,
  Clock,
  CreditCard,
  Loader2,
  Play,
  Sparkles,
  Trash2,
} from "lucide-react";

type Podcast = {
  id: string;
  title: string;
  duration: number;
  status: string;
  price?: number;
  payment_status?: string;
  created_at: string | null;
  source_type?: "upload" | "youtube";
  import_metadata?: Record<string, unknown> | null;
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

type StatusChip = {
  label: string;
  dot: string;
  bg: string;
  fg: string;
  border: string;
};

type CardTheme = {
  card: string;
  border: string;
  divider: string;
  surface: string;
  surfaceStrong: string;
  text: string;
  textSub: string;
  textSoft: string;
  accent: string;
  accentStrong: string;
  accentText: string;
  accentBorder: string;
  track: string;
  buttonBg: string;
  buttonBorder: string;
  buttonText: string;
  buttonSurface: string;
  snippetBg: string;
  snippetBorder: string;
  paymentBg: string;
  paymentBorder: string;
  paymentText: string;
};

const fmtDur = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, "0")}`;

const fmtDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("en", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(new Date(value))
    : "Just now";

const fmtEta = (seconds: number) => {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes <= 3) return "~1 min";
  if (minutes <= 10) return "~3 min";
  return "~5 min";
};

const STAGES = (seconds: number) => [
  "Preparing the audio workspace",
  "Transcribing the episode",
  "Scoring the strongest moments",
  `Final review in progress - ${fmtEta(seconds)} left`,
];

function getTheme(dark: boolean): CardTheme {
  if (dark) {
    return {
      card: "linear-gradient(180deg, rgba(17,29,16,.98), rgba(12,21,12,.96))",
      border: "rgba(139, 200, 109, .16)",
      divider: "rgba(139, 200, 109, .11)",
      surface: "rgba(255, 255, 255, .035)",
      surfaceStrong: "rgba(139, 200, 109, .09)",
      text: "#f2f6ea",
      textSub: "#bfd0b5",
      textSoft: "#90a487",
      accent: "#8bc86d",
      accentStrong: "#69a94d",
      accentText: "#dff2d2",
      accentBorder: "rgba(139, 200, 109, .24)",
      track: "rgba(139, 200, 109, .16)",
      buttonBg: "rgba(139, 200, 109, .12)",
      buttonBorder: "rgba(139, 200, 109, .22)",
      buttonText: "#dff2d2",
      buttonSurface: "rgba(255, 255, 255, .04)",
      snippetBg: "rgba(255, 255, 255, .03)",
      snippetBorder: "rgba(139, 200, 109, .12)",
      paymentBg: "rgba(196, 112, 48, .12)",
      paymentBorder: "rgba(196, 112, 48, .24)",
      paymentText: "#f3c9a2",
    };
  }

  return {
    card: "linear-gradient(180deg, #ffffff, #fbfdf7)",
    border: "rgba(140, 200, 110, .24)",
    divider: "rgba(140, 200, 110, .12)",
    surface: "rgba(238, 248, 230, .45)",
    surfaceStrong: "rgba(90, 158, 58, .08)",
    text: "#162411",
    textSub: "#45613d",
    textSoft: "#90ab84",
    accent: "#5a9e3a",
    accentStrong: "#477f2d",
    accentText: "#2f7020",
    accentBorder: "rgba(90, 158, 58, .22)",
    track: "rgba(90, 158, 58, .12)",
    buttonBg: "rgba(90, 158, 58, .08)",
    buttonBorder: "rgba(90, 158, 58, .22)",
    buttonText: "#2f7020",
    buttonSurface: "#ffffff",
    snippetBg: "rgba(238, 248, 230, .55)",
    snippetBorder: "rgba(140, 200, 110, .16)",
    paymentBg: "rgba(196, 112, 48, .07)",
    paymentBorder: "rgba(196, 112, 48, .18)",
    paymentText: "#7a4018",
  };
}

function badge(status: string, dark: boolean): StatusChip {
  switch (status) {
    case "done":
    case "completed":
    case "free_ready":
      return dark
        ? {
            label: "Done",
            dot: "#8bc86d",
            bg: "rgba(139, 200, 109, .12)",
            fg: "#dff2d2",
            border: "rgba(139, 200, 109, .18)",
          }
        : {
            label: "Done",
            dot: "#5a9e3a",
            bg: "rgba(90, 158, 58, .1)",
            fg: "#2f7020",
            border: "rgba(90, 158, 58, .14)",
          };
    case "processing":
    case "queued":
      return dark
        ? {
            label: "Processing",
            dot: "#e2b450",
            bg: "rgba(226, 180, 80, .14)",
            fg: "#f6ddb0",
            border: "rgba(226, 180, 80, .2)",
          }
        : {
            label: "Processing",
            dot: "#c4962a",
            bg: "rgba(196, 150, 42, .1)",
            fg: "#7a5e18",
            border: "rgba(196, 150, 42, .14)",
          };
    case "ready_for_processing":
      return dark
        ? {
            label: "Ready",
            dot: "#72bddb",
            bg: "rgba(114, 189, 219, .14)",
            fg: "#d2edf8",
            border: "rgba(114, 189, 219, .2)",
          }
        : {
            label: "Ready",
            dot: "#3a829e",
            bg: "rgba(58, 130, 158, .1)",
            fg: "#1e5a72",
            border: "rgba(58, 130, 158, .14)",
          };
    case "awaiting_payment":
      return dark
        ? {
            label: "Payment due",
            dot: "#e3a15f",
            bg: "rgba(227, 161, 95, .14)",
            fg: "#f5d1b0",
            border: "rgba(227, 161, 95, .2)",
          }
        : {
            label: "Payment due",
            dot: "#c47030",
            bg: "rgba(196, 112, 48, .1)",
            fg: "#7a4018",
            border: "rgba(196, 112, 48, .14)",
          };
    case "blocked":
      return dark
        ? {
            label: "Blocked",
            dot: "#ef8686",
            bg: "rgba(239, 134, 134, .14)",
            fg: "#f9d0d0",
            border: "rgba(239, 134, 134, .2)",
          }
        : {
            label: "Blocked",
            dot: "#c44040",
            bg: "rgba(196, 64, 64, .1)",
            fg: "#7a1818",
            border: "rgba(196, 64, 64, .14)",
          };
    default:
      return dark
        ? {
            label: status.replace(/_/g, " "),
            dot: "#9db88d",
            bg: "rgba(157, 184, 141, .12)",
            fg: "#dfe8d8",
            border: "rgba(157, 184, 141, .16)",
          }
        : {
            label: status.replace(/_/g, " "),
            dot: "#8a9a80",
            bg: "rgba(130, 150, 110, .08)",
            fg: "#4a5a40",
            border: "rgba(130, 150, 110, .14)",
          };
  }
}

function Ring({ score, dark }: { score: number; dark: boolean }) {
  const theme = getTheme(dark);
  const radius = 14;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (circumference * Math.min(score, 100)) / 100;

  return (
    <svg width="40" height="40" viewBox="0 0 40 40" style={{ flexShrink: 0 }}>
      <circle
        cx="20"
        cy="20"
        r={radius}
        fill="none"
        stroke={theme.track}
        strokeWidth="3"
      />
      <circle
        cx="20"
        cy="20"
        r={radius}
        fill="none"
        stroke={theme.accent}
        strokeWidth="3"
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
        transform="rotate(-90 20 20)"
        style={{ transition: "stroke-dashoffset .7s cubic-bezier(.22,1,.36,1)" }}
      />
      <text
        x="20"
        y="24"
        textAnchor="middle"
        style={{
          fontSize: 10,
          fontWeight: 800,
          fill: theme.accentText,
          fontFamily: "sans-serif",
        }}
      >
        {score.toFixed(0)}
      </text>
    </svg>
  );
}

export function PodcastCard({
  podcast,
  analysis,
  analysisLoading = false,
  onAnalyze,
  onDelete,
  generatedClipsCount = 0,
  dark = false,
}: {
  podcast: Podcast;
  analysis?: AnalysisSummary | null;
  analysisLoading?: boolean;
  onAnalyze?: (language?: string, force?: boolean) => void;
  onDelete?: () => void;
  generatedClipsCount?: number;
  dark?: boolean;
}) {
  const [selectedLanguage, setSelectedLanguage] = useState<string>("auto");
  const theme = getTheme(dark);
  const hasAnalysis = Boolean(analysis && analysis.total_scored_segments > 0);
  const hasGeneratedVideos = generatedClipsCount > 0;
  const needsPayment = podcast.status === "awaiting_payment" && podcast.payment_status === "pending";
  const statusChip = badge(podcast.status, dark);
  const stages = STAGES(podcast.duration);
  const hasCachedTranscription = Boolean(podcast.import_metadata?.transcription_data);

  const sourceBadge =
    podcast.source_type === "youtube"
      ? dark
        ? {
            label: "YouTube",
            bg: "rgba(222, 94, 94, .15)",
            fg: "#f7d0d0",
            border: "rgba(222, 94, 94, .22)",
          }
        : {
            label: "YouTube",
            bg: "rgba(214, 64, 64, .1)",
            fg: "#8a2020",
            border: "rgba(214, 64, 64, .14)",
          }
      : null;

  const [idx, setIdx] = useState(0);
  const [prog, setProg] = useState(20);
  const [isHovered, setIsHovered] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!analysisLoading) {
      const resetTimeout = window.setTimeout(() => {
        setIdx(0);
        setProg(20);
      }, 0);

      return () => window.clearTimeout(resetTimeout);
    }

    const interval = window.setInterval(() => {
      setIdx((current) => (current + 1) % stages.length);
      setProg((current) => Math.min(current + Math.floor(Math.random() * 9 + 3), 84));
    }, 2800);

    return () => window.clearInterval(interval);
  }, [analysisLoading, stages.length]);

  return (
    <>
      <style>{`
        @keyframes ic-spin { to { transform: rotate(360deg); } }
        @keyframes ic-in {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .ic-card {
          min-width: 0;
          transition: transform .22s cubic-bezier(.22,1,.36,1), box-shadow .22s;
        }
        .ic-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 18px 36px rgba(25, 40, 20, .14);
        }
        .ic-btn {
          transition: background .15s, border-color .15s, transform .15s;
        }
        .ic-btn:hover {
          transform: translateY(-1px);
        }
        .ic-seg {
          animation: ic-in .2s cubic-bezier(.22,1,.36,1) both;
        }
        .ic-expand {
          transition: background .15s, border-color .15s;
        }
      `}</style>

      <article
        className="ic-card ic-premium-card"
        style={{
          borderRadius: 18,
          border: `1px solid ${theme.border}`,
          background: theme.card,
          overflow: "hidden",
          fontFamily: "'DM Sans',sans-serif",
          boxShadow: dark
            ? "0 10px 26px rgba(0, 0, 0, .24)"
            : "0 10px 24px rgba(74, 96, 61, .08)",
        }}
      >
        <div style={{ padding: "16px 16px 14px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              marginBottom: 10,
            }}
          >
            <span
              style={{
                fontSize: 9,
                fontWeight: 800,
                letterSpacing: ".22em",
                textTransform: "uppercase",
                color: theme.textSoft,
              }}
            >
              Episode
            </span>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                flexWrap: "wrap",
                justifyContent: "flex-end",
              }}
            >
              {sourceBadge ? (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "3px 9px",
                    borderRadius: 999,
                    background: sourceBadge.bg,
                    border: `1px solid ${sourceBadge.border}`,
                    fontSize: 9,
                    fontWeight: 800,
                    letterSpacing: ".1em",
                    textTransform: "uppercase",
                    color: sourceBadge.fg,
                    whiteSpace: "nowrap",
                  }}
                >
                  {sourceBadge.label}
                </span>
              ) : null}

              {needsPayment ? (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "3px 9px",
                    borderRadius: 999,
                    background: theme.paymentBg,
                    border: `1px solid ${theme.paymentBorder}`,
                    fontSize: 9,
                    fontWeight: 800,
                    letterSpacing: ".1em",
                    textTransform: "uppercase",
                    color: theme.paymentText,
                    whiteSpace: "nowrap",
                  }}
                >
                  Payment required
                </span>
              ) : null}

              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "3px 9px",
                  borderRadius: 999,
                  background: statusChip.bg,
                  border: `1px solid ${statusChip.border}`,
                  fontSize: 9,
                  fontWeight: 800,
                  letterSpacing: ".1em",
                  textTransform: "uppercase",
                  color: statusChip.fg,
                  whiteSpace: "nowrap",
                }}
              >
                <span
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: "50%",
                    background: statusChip.dot,
                    flexShrink: 0,
                  }}
                />
                {statusChip.label}
              </span>
            </div>
          </div>

          <h3
            style={{
              margin: 0,
              fontFamily: "'DM Serif Display',serif",
              fontSize: 16,
              fontStyle: "italic",
              letterSpacing: "-.02em",
              lineHeight: 1.35,
              color: theme.text,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              minHeight: 44,
            }}
          >
            {podcast.title}
          </h3>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            borderTop: `1px solid ${theme.divider}`,
            borderBottom: `1px solid ${theme.divider}`,
            background: theme.surface,
          }}
        >
          {[
            { Icon: Clock, label: "Duration", value: fmtDur(podcast.duration) },
            { Icon: Calendar, label: "Uploaded", value: fmtDate(podcast.created_at) },
          ].map(({ Icon, label, value }, index) => (
            <div
              key={label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 14px",
                borderLeft: index === 1 ? `1px solid ${theme.divider}` : "none",
              }}
            >
              <Icon size={12} color={theme.textSoft} strokeWidth={1.8} />
              <div>
                <div
                  style={{
                    fontSize: 8,
                    fontWeight: 800,
                    letterSpacing: ".18em",
                    textTransform: "uppercase",
                    color: theme.textSoft,
                    lineHeight: 1,
                  }}
                >
                  {label}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: theme.text,
                    marginTop: 3,
                  }}
                >
                  {value}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ padding: "14px 16px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
            <Sparkles size={12} color={theme.accent} strokeWidth={2} />
            <span
              style={{
                fontSize: 8,
                fontWeight: 800,
                letterSpacing: ".22em",
                textTransform: "uppercase",
                color: theme.textSoft,
              }}
            >
              Smart Clip Review
            </span>
          </div>

          {hasAnalysis && !analysisLoading ? (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: 12,
                  marginBottom: 10,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: "1 1 190px" }}>
                  <Ring score={hasGeneratedVideos ? 100 : analysis!.highest_score} dark={dark} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: theme.text }}>
                      {hasGeneratedVideos ? "Clips are ready to review" : "Highlights identified"}
                    </div>
                    <div style={{ fontSize: 10, color: theme.accent, marginTop: 2 }}>
                      {hasGeneratedVideos
                        ? `${generatedClipsCount} generated clip${generatedClipsCount === 1 ? "" : "s"} ready`
                        : `${analysis!.highest_score.toFixed(1)} top score across ${analysis!.total_scored_segments} segments`}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: theme.textSub,
                        marginTop: 5,
                        lineHeight: 1.5,
                        maxWidth: 220,
                      }}
                    >
                      {hasGeneratedVideos
                        ? "Open the clips view to review final exports, publish highlights, or download them."
                        : "The analysis found your strongest moments. Open clips to render them into final videos."}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "row",
                    alignItems: "center",
                    flexWrap: "wrap",
                    justifyContent: "flex-end",
                    gap: 6,
                    flex: "1 1 120px",
                  }}
                >
                  <span
                    style={{
                      padding: "4px 9px",
                      borderRadius: 999,
                      background: theme.buttonBg,
                      border: `1px solid ${theme.buttonBorder}`,
                      fontSize: 9,
                      fontWeight: 800,
                      letterSpacing: ".1em",
                      textTransform: "uppercase",
                      color: theme.buttonText,
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                    }}
                  >
                    {hasGeneratedVideos ? "Rendered" : "Analyzed"}
                  </span>

                  <Link
                    href={hasGeneratedVideos ? `/clips/generated?podcastId=${podcast.id}` : `/clips/generate?podcastId=${podcast.id}`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "6px 11px",
                      borderRadius: 999,
                      border: `1px solid ${theme.buttonBorder}`,
                      background: theme.buttonSurface,
                      fontSize: 10,
                      fontWeight: 800,
                      color: theme.buttonText,
                      textDecoration: "none",
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                    }}
                  >
                    {hasGeneratedVideos ? "Open clips" : "Generate clips"} <ChevronRight size={10} />
                  </Link>
                </div>
              </div>

              {(analysis?.top_segments?.length ?? 0) > 0 ? (
                <>
                  <button
                    type="button"
                    onClick={() => setExpanded((value) => !value)}
                    className="ic-expand"
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "8px 11px",
                      borderRadius: 10,
                      border: `1px solid ${theme.snippetBorder}`,
                      background: theme.snippetBg,
                      cursor: "pointer",
                      fontFamily: "'DM Sans',sans-serif",
                    }}
                  >
                    <span style={{ fontSize: 10, fontWeight: 800, color: theme.textSub }}>
                      {expanded ? "Hide preview moments" : "Preview top moments"}
                    </span>
                    <ChevronDown
                      size={12}
                      color={theme.textSoft}
                      style={{
                        transform: expanded ? "rotate(180deg)" : "none",
                        transition: "transform .2s",
                      }}
                    />
                  </button>

                  {expanded ? (
                    <div style={{ marginTop: 7, display: "flex", flexDirection: "column", gap: 6 }}>
                      {analysis!.top_segments!.slice(0, 3).map((segment, index) => (
                        <div
                          key={index}
                          className="ic-seg"
                          style={{
                            borderRadius: 10,
                            border: `1px solid ${theme.snippetBorder}`,
                            background: theme.snippetBg,
                            padding: "8px 10px",
                            animationDelay: `${index * 0.04}s`,
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              marginBottom: 4,
                            }}
                          >
                            <span
                              style={{
                                fontSize: 8,
                                fontWeight: 800,
                                letterSpacing: ".16em",
                                textTransform: "uppercase",
                                color: theme.textSoft,
                              }}
                            >
                              Moment {index + 1}
                            </span>
                            <span
                              style={{
                                fontSize: 9,
                                fontWeight: 800,
                                color: theme.buttonText,
                                background: theme.buttonBg,
                                border: `1px solid ${theme.buttonBorder}`,
                                padding: "2px 6px",
                                borderRadius: 999,
                              }}
                            >
                              {segment.virality_score.toFixed(1)}
                            </span>
                          </div>
                          <p
                            style={{
                              margin: 0,
                              fontSize: 11,
                              lineHeight: 1.5,
                              color: theme.textSub,
                              overflowWrap: "anywhere",
                              overflow: "hidden",
                              display: "-webkit-box",
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: "vertical",
                            }}
                          >
                            {segment.transcript_snippet.replace(/\s+/g, " ").trim()}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </>
              ) : null}
            </>
          ) : null}

          {analysisLoading ? (
            <div
              style={{
                borderRadius: 12,
                padding: "11px 12px",
                border: `1px solid ${theme.accentBorder}`,
                background: theme.surfaceStrong,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 7 }}>
                <Loader2
                  size={12}
                  color={theme.accent}
                  style={{ animation: "ic-spin 1s linear infinite" }}
                />
                <span style={{ fontSize: 11, fontWeight: 800, color: theme.buttonText }}>
                  Processing now
                </span>
              </div>
              <p style={{ margin: "0 0 8px", fontSize: 11, color: theme.textSub, lineHeight: 1.5 }}>
                {stages[idx]}
              </p>
              <div
                style={{
                  height: 4,
                  borderRadius: 999,
                  background: theme.track,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${prog}%`,
                    height: "100%",
                    borderRadius: 999,
                    background: `linear-gradient(90deg, ${theme.accentStrong}, ${theme.accent})`,
                    transition: "width .6s cubic-bezier(.22,1,.36,1)",
                  }}
                />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>
                <span style={{ fontSize: 9, color: theme.textSoft }}>
                  We will unlock clip actions when this finishes.
                </span>
                <span style={{ fontSize: 9, fontWeight: 800, color: theme.accent }}>
                  {prog}%
                </span>
              </div>
            </div>
          ) : null}

          {!hasAnalysis && !analysisLoading && needsPayment ? (
            <div
              style={{
                borderRadius: 10,
                padding: "10px 11px",
                background: theme.paymentBg,
                border: `1px solid ${theme.paymentBorder}`,
                fontSize: 11,
                color: theme.paymentText,
                lineHeight: 1.55,
              }}
            >
              Payment is needed before analysis can continue for this episode.
              <Link
                href={`/checkout?podcastId=${encodeURIComponent(podcast.id)}&amount=${encodeURIComponent(String(podcast.price ?? 0))}&currency=USD`}
                style={{
                  marginTop: 9,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  borderRadius: 999,
                  border: "1px solid rgba(158,138,32,.38)",
                  background: "transparent",
                  color: "#9e8a20",
                  padding: "6px 10px",
                  fontSize: 10,
                  fontWeight: 800,
                  textDecoration: "none",
                }}
              >
                <CreditCard size={11} />
                Pay now
              </Link>
            </div>
          ) : null}

          {!hasAnalysis && !analysisLoading && !needsPayment && onAnalyze ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {!hasCachedTranscription && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label
                    style={{
                      fontSize: 9,
                      fontWeight: 800,
                      letterSpacing: ".1em",
                      textTransform: "uppercase",
                      color: theme.textSoft,
                    }}
                  >
                    Spoken language (optional)
                  </label>
                  <select
                    value={selectedLanguage}
                    onChange={(e) => setSelectedLanguage(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: 10,
                      border: `1px solid ${theme.buttonBorder}`,
                      background: theme.buttonSurface,
                      color: theme.buttonText,
                      fontSize: 11,
                      fontWeight: 700,
                      outline: "none",
                      cursor: "pointer",
                    }}
                  >
                    <option value="auto" style={{ background: theme.buttonSurface, color: theme.text }}>Auto-detect language</option>
                    <option value="sq" style={{ background: theme.buttonSurface, color: theme.text }}>Albanian (Shqip)</option>
                    <option value="en" style={{ background: theme.buttonSurface, color: theme.text }}>English</option>
                    <option value="de" style={{ background: theme.buttonSurface, color: theme.text }}>German (Deutsch)</option>
                    <option value="it" style={{ background: theme.buttonSurface, color: theme.text }}>Italian (Italiano)</option>
                    <option value="fr" style={{ background: theme.buttonSurface, color: theme.text }}>French (Français)</option>
                    <option value="es" style={{ background: theme.buttonSurface, color: theme.text }}>Spanish (Español)</option>
                  </select>
                </div>
              )}

              <button
                type="button"
                onClick={() => onAnalyze(
                  selectedLanguage === "auto" ? undefined : selectedLanguage,
                  podcast.status === "processing" || podcast.status === "queued"
                )}
                className="ic-btn"
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 7,
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: `1px solid ${theme.buttonBorder}`,
                  background: theme.buttonBg,
                  fontSize: 11,
                  fontWeight: 800,
                  color: theme.buttonText,
                  cursor: "pointer",
                  fontFamily: "'DM Sans',sans-serif",
                }}
              >
                <Play size={11} strokeWidth={2.5} fill={theme.buttonText} />
                {hasCachedTranscription ? "Continue analysis" : "Analyze episode"}
              </button>
            </div>
          ) : null}

          {onDelete ? (
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="ic-btn"
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 7,
                marginTop: 10,
                padding: "10px 14px",
                borderRadius: 10,
                border: dark ? "1px solid rgba(239, 134, 134, .22)" : "1px solid rgba(196, 64, 64, .18)",
                background: dark ? "rgba(239, 134, 134, .08)" : "rgba(196, 64, 64, .07)",
                fontSize: 11,
                fontWeight: 800,
                color: dark ? "#f6b6b6" : "#8a2424",
                cursor: "pointer",
                fontFamily: "'DM Sans',sans-serif",
              }}
            >
              <Trash2 size={12} strokeWidth={2.4} />
              Delete podcast
            </button>
          ) : null}
        </div>
      </article>
      {onDelete && showDeleteConfirm ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 120,
            background: "rgba(10, 16, 8, .45)",
            backdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 18,
          }}
          onClick={() => setShowDeleteConfirm(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Confirm podcast deletion"
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "min(100%, 460px)",
              borderRadius: 22,
              border: `1px solid ${dark ? "rgba(239, 134, 134, .28)" : "rgba(196, 64, 64, .22)"}`,
              background: dark ? "rgba(20, 24, 15, .98)" : "rgba(255,255,255,.98)",
              boxShadow: dark ? "0 30px 80px rgba(0,0,0,.45)" : "0 24px 70px rgba(36,60,25,.18)",
              overflow: "hidden",
            }}
          >
            <div style={{ padding: "18px 18px 0" }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: dark ? "#ffcdcd" : "#8a2424", textTransform: "uppercase", letterSpacing: ".12em" }}>
                Confirm podcast deletion
              </div>
              <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                <div
                  style={{
                    borderRadius: 16,
                    border: `1px solid ${dark ? "rgba(239, 134, 134, .24)" : "rgba(196, 64, 64, .2)"}`,
                    background: dark ? "rgba(52,12,12,.78)" : "rgba(255,244,244,.95)",
                    padding: "12px 14px",
                    color: dark ? "#ffd2d2" : "#8a2424",
                    fontSize: 13,
                    lineHeight: 1.65,
                  }}
                >
                  <strong style={{ display: "block", marginBottom: 4 }}>What will be deleted</strong>
                  The podcast, source media, analysis data, generated clips, and related records will be removed from this workspace.
                </div>
                <div
                  style={{
                    borderRadius: 16,
                    border: `1px solid ${dark ? "rgba(90, 158, 58, .28)" : "rgba(90, 158, 58, .22)"}`,
                    background: dark ? "rgba(14,42,12,.78)" : "rgba(236,250,230,.96)",
                    padding: "12px 14px",
                    color: dark ? "#bfe4ab" : "#2d6122",
                    fontSize: 13,
                    lineHeight: 1.65,
                  }}
                >
                  <strong style={{ display: "block", marginBottom: 4 }}>Safe to cancel</strong>
                  If you change your mind, press Cancel and keep working. Nothing is removed until you choose Delete.
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, padding: 18 }}>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="ic-btn"
                style={{
                  flex: 1,
                  padding: "10px 14px",
                  borderRadius: 12,
                  border: `1px solid ${dark ? "rgba(90, 158, 58, .22)" : "rgba(90, 158, 58, .18)"}`,
                  background: dark ? "rgba(90, 158, 58, .2)" : "rgba(90, 158, 58, .12)",
                  color: dark ? "#9dce7a" : "#3a6e25",
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  onDelete();
                }}
                className="ic-btn"
                style={{
                  flex: 1,
                  padding: "10px 14px",
                  borderRadius: 12,
                  border: "none",
                  background: dark ? "rgba(239, 134, 134, .8)" : "rgba(196, 64, 64, .95)",
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Delete podcast
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
