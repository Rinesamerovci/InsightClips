"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Play, Clock, Calendar, Zap, ChevronRight, Loader2, ChevronDown } from "lucide-react";

type Podcast = {
  id: string; title: string; duration: number;
  status: string; created_at: string | null;
};
type AnalysisSummary = {
  total_scored_segments: number; highest_score: number;
  top_segments?: Array<{ transcript_snippet: string; virality_score: number; sentiment: string }>;
};

const fmtDur  = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
const fmtDate = (v: string | null) => v
  ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(v))
  : "Just now";
const fmtEta = (s: number) => { const m = Math.max(1, Math.round(s / 60)); return m <= 3 ? "~1 min" : m <= 10 ? "~3 min" : "~5 min"; };
const STAGES = (s: number) => ["Preparing audio…", "Transcribing…", "Scoring moments…", `Still working · ${fmtEta(s)} left`];

type SC = { label: string; dot: string; bg: string; fg: string };
function badge(status: string): SC {
  switch (status) {
    case "done": case "completed": case "free_ready":
      return { label: "Done",        dot: "#5a9e3a", bg: "rgba(90,158,58,.1)",   fg: "#2f7020" };
    case "processing": case "queued":
      return { label: "Processing",  dot: "#c4962a", bg: "rgba(196,150,42,.1)", fg: "#7a5e18" };
    case "ready_for_processing":
      return { label: "Ready",       dot: "#3a829e", bg: "rgba(58,130,158,.1)", fg: "#1e5a72" };
    case "awaiting_payment":
      return { label: "Payment due", dot: "#c47030", bg: "rgba(196,112,48,.1)", fg: "#7a4018" };
    case "blocked":
      return { label: "Blocked",     dot: "#c44040", bg: "rgba(196,64,64,.1)",  fg: "#7a1818" };
    default:
      return { label: status.replace(/_/g, " "), dot: "#8a9a80", bg: "rgba(130,150,110,.08)", fg: "#4a5a40" };
  }
}

/* ── score ring ── */
function Ring({ score }: { score: number }) {
  const r = 14, c = 2 * Math.PI * r;
  const dash = c - (c * Math.min(score, 100)) / 100;
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" style={{ flexShrink: 0 }}>
      <circle cx="18" cy="18" r={r} fill="none" stroke="rgba(90,158,58,.12)" strokeWidth="2.5"/>
      <circle cx="18" cy="18" r={r} fill="none" stroke="#5a9e3a" strokeWidth="2.5"
        strokeDasharray={c} strokeDashoffset={dash} strokeLinecap="round"
        transform="rotate(-90 18 18)"
        style={{ transition: "stroke-dashoffset .7s cubic-bezier(.22,1,.36,1)" }}/>
      <text x="18" y="22" textAnchor="middle"
        style={{ fontSize: 9, fontWeight: 700, fill: "#2f7020", fontFamily: "sans-serif" }}>
        {score.toFixed(0)}
      </text>
    </svg>
  );
}

/* ════ EXPORT ════ */
export function PodcastCard({
  podcast, analysis, analysisLoading = false, onAnalyze,
}: {
  podcast: Podcast; analysis?: AnalysisSummary | null;
  analysisLoading?: boolean; onAnalyze?: () => void;
}) {
  const hasAnalysis  = Boolean(analysis && analysis.total_scored_segments > 0);
  const needsPayment = podcast.status === "awaiting_payment";
  const b            = badge(podcast.status);
  const stages       = STAGES(podcast.duration);

  const [idx,      setIdx]      = useState(0);
  const [prog,     setProg]     = useState(20);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!analysisLoading) { setIdx(0); setProg(20); return; }
    const iv = window.setInterval(() => {
      setIdx(c => (c + 1) % stages.length);
      setProg(c => Math.min(c + Math.floor(Math.random() * 9 + 3), 84));
    }, 2800);
    return () => window.clearInterval(iv);
  }, [analysisLoading, stages.length]);

  return (
    <>
      <style>{`
        @keyframes ic-spin { to{transform:rotate(360deg)} }
        @keyframes ic-in   { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
        .ic-card { transition:transform .22s cubic-bezier(.22,1,.36,1),box-shadow .22s; }
        .ic-card:hover { transform:translateY(-3px); box-shadow:0 12px 30px rgba(90,158,58,.1); }
        .ic-btn  { transition:background .15s,border-color .15s; }
        .ic-btn:hover { background:rgba(90,158,58,.12) !important; border-color:rgba(90,158,58,.45) !important; }
        .ic-seg  { animation:ic-in .2s cubic-bezier(.22,1,.36,1) both; }
        .ic-expand { transition:background .15s; }
        .ic-expand:hover { background:rgba(90,158,58,.07) !important; }
      `}</style>

      <article className="ic-card" style={{
        borderRadius: 14,
        border: "1px solid rgba(140,200,110,.25)",
        background: "#fff",
        overflow: "hidden",
        fontFamily: "'DM Sans',sans-serif",
      }}>

        {/* ── HEADER ── */}
        <div style={{ padding: "13px 14px 11px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".22em", textTransform: "uppercase", color: "#9abb80" }}>
              Podcast
            </span>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              padding: "2px 8px", borderRadius: 100,
              background: b.bg, fontSize: 9, fontWeight: 700,
              letterSpacing: ".1em", textTransform: "uppercase",
              color: b.fg, whiteSpace: "nowrap",
            }}>
              <span style={{ width: 4, height: 4, borderRadius: "50%", background: b.dot, flexShrink: 0 }}/>
              {b.label}
            </span>
          </div>

          <h3 style={{
            margin: 0,
            fontFamily: "'DM Serif Display',serif",
            fontSize: 14, fontStyle: "italic", letterSpacing: "-.02em",
            lineHeight: 1.4, color: "#142210",
            display: "-webkit-box", WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical", overflow: "hidden",
          }}>
            {podcast.title}
          </h3>
        </div>

        {/* ── META ── */}
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr",
          borderTop: "1px solid rgba(140,200,110,.12)",
          borderBottom: "1px solid rgba(140,200,110,.12)",
          background: "rgba(238,248,230,.45)",
        }}>
          {[
            { Icon: Clock,    label: "Duration", value: fmtDur(podcast.duration) },
            { Icon: Calendar, label: "Uploaded", value: fmtDate(podcast.created_at) },
          ].map(({ Icon, label, value }, i) => (
            <div key={label} style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "8px 14px",
              borderLeft: i === 1 ? "1px solid rgba(140,200,110,.12)" : "none",
            }}>
              <Icon size={11} color="#9abb80" strokeWidth={1.8}/>
              <div>
                <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: ".18em", textTransform: "uppercase", color: "#aac890", lineHeight: 1 }}>
                  {label}
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#1e3418", marginTop: 2 }}>
                  {value}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ── ANALYSIS ── */}
        <div style={{ padding: "11px 14px 13px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 9 }}>
            <Zap size={10} color="#5a9e3a" strokeWidth={2}/>
            <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: ".22em", textTransform: "uppercase", color: "#9abb80" }}>
              Virality Analysis
            </span>
          </div>

          {/* has analysis */}
          {hasAnalysis && !analysisLoading && (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 9 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <Ring score={analysis!.highest_score}/>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#1e3418" }}>
                      {analysis!.highest_score.toFixed(1)} top score
                    </div>
                    <div style={{ fontSize: 10, color: "#7aaa55", marginTop: 1 }}>
                      {analysis!.total_scored_segments} segments
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{
                    padding: "3px 8px", borderRadius: 100,
                    background: "rgba(90,158,58,.1)", border: "1px solid rgba(90,158,58,.2)",
                    fontSize: 9, fontWeight: 700, letterSpacing: ".1em",
                    textTransform: "uppercase", color: "#2f7020", whiteSpace: "nowrap",
                  }}>Analyzed</span>
                  <Link href={`/clips?podcastId=${podcast.id}`} style={{
                    display: "inline-flex", alignItems: "center", gap: 3,
                    padding: "4px 10px", borderRadius: 100,
                    border: "1px solid rgba(140,200,110,.35)",
                    background: "#fff",
                    fontSize: 10, fontWeight: 700, color: "#2f7020",
                    textDecoration: "none", whiteSpace: "nowrap",
                  }}>
                    Clips <ChevronRight size={10}/>
                  </Link>
                </div>
              </div>

              {/* collapsible segments */}
              {(analysis?.top_segments?.length ?? 0) > 0 && (
                <>
                  <button
                    onClick={() => setExpanded(v => !v)}
                    className="ic-expand"
                    style={{
                      width: "100%", display: "flex", alignItems: "center",
                      justifyContent: "space-between",
                      padding: "6px 10px", borderRadius: 8,
                      border: "1px solid rgba(140,200,110,.16)",
                      background: "rgba(238,248,230,.5)",
                      cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
                    }}
                  >
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#3a6a28" }}>
                      {expanded ? "Hide" : "Show"} top moments
                    </span>
                    <ChevronDown size={11} color="#7aaa55"
                      style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform .2s" }}/>
                  </button>

                  {expanded && (
                    <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
                      {analysis!.top_segments!.slice(0, 3).map((seg, i) => (
                        <div key={i} className="ic-seg" style={{
                          borderRadius: 8,
                          border: "1px solid rgba(140,200,110,.16)",
                          background: "rgba(238,248,230,.55)",
                          padding: "6px 10px",
                          animationDelay: `${i * 0.04}s`,
                        }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
                            <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: ".16em", textTransform: "uppercase", color: "#9abb80" }}>
                              #{i + 1}
                            </span>
                            <span style={{
                              fontSize: 9, fontWeight: 700, color: "#2f7020",
                              background: "rgba(90,158,58,.1)", padding: "1px 5px", borderRadius: 100,
                            }}>
                              {seg.virality_score.toFixed(1)}
                            </span>
                          </div>
                          <p style={{
                            margin: 0, fontSize: 11, lineHeight: 1.45, color: "#2e4a28",
                            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                          }}>
                            {seg.transcript_snippet.replace(/\s+/g, " ").trim()}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* processing */}
          {analysisLoading && (
            <div style={{
              borderRadius: 10, padding: "10px 11px",
              border: "1px solid rgba(90,158,58,.16)",
              background: "rgba(238,248,230,.65)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <Loader2 size={11} color="#5a9e3a" style={{ animation: "ic-spin 1s linear infinite" }}/>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#2f7020" }}>Processing…</span>
              </div>
              <p style={{ margin: "0 0 7px", fontSize: 11, color: "#526352", lineHeight: 1.45 }}>
                {stages[idx]}
              </p>
              <div style={{ height: 3, borderRadius: 2, background: "rgba(90,158,58,.1)", overflow: "hidden" }}>
                <div style={{
                  width: `${prog}%`, height: "100%", borderRadius: 2,
                  background: "linear-gradient(90deg,#5a9e3a,#7ab55c)",
                  transition: "width .6s cubic-bezier(.22,1,.36,1)",
                }}/>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 3 }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: "#5a9e3a" }}>{prog}%</span>
              </div>
            </div>
          )}

          {/* payment */}
          {!hasAnalysis && !analysisLoading && needsPayment && (
            <div style={{
              borderRadius: 9, padding: "8px 11px",
              background: "rgba(196,112,48,.07)",
              border: "1px solid rgba(196,112,48,.18)",
              fontSize: 11, color: "#7a4018", lineHeight: 1.55,
            }}>
              Payment required to continue.
            </div>
          )}

          {/* analyze button */}
          {!hasAnalysis && !analysisLoading && !needsPayment && onAnalyze && (
            <button
              type="button"
              onClick={onAnalyze}
              className="ic-btn"
              style={{
                width: "100%", display: "flex", alignItems: "center",
                justifyContent: "center", gap: 6,
                padding: "9px 14px", borderRadius: 9,
                border: "1px solid rgba(90,158,58,.28)",
                background: "rgba(90,158,58,.06)",
                fontSize: 11, fontWeight: 700, color: "#2f7020",
                cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
              }}
            >
              <Play size={11} strokeWidth={2.5} fill="#2f7020"/>
              Analyze podcast
            </button>
          )}
        </div>
      </article>
    </>
  );
}