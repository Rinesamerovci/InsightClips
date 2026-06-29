import { useState, type CSSProperties } from "react";

import type { PodcastClipMetrics } from "./api";

export type AnalyticsTheme = {
  card: string;
  cardAlt: string;
  border: string;
  borderSub: string;
  text: string;
  textSub: string;
  textFaint: string;
  accent: string;
  chip: string;
  errorText: string;
};

export const defaultAnalyticsTheme: AnalyticsTheme = {
  card: "rgba(13,20,11,.88)",
  cardAlt: "rgba(16,24,13,.94)",
  border: "rgba(60,105,40,.34)",
  borderSub: "rgba(60,105,40,.18)",
  text: "#dff0d8",
  textSub: "rgba(163,210,128,.68)",
  textFaint: "rgba(100,148,72,.42)",
  accent: "#5a9e3a",
  chip: "rgba(90,158,58,.12)",
  errorText: "#efaaaa",
};

export function formatAnalyticsChange(value: number): string {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(1)}%`;
}

export function buildAnalyticsSnapshot(metrics: PodcastClipMetrics | null): {
  topClip: PodcastClipMetrics["top_clips"][number] | null;
  totalVisibility: number;
  publishRate: number;
  averageDownloadsPerClip: number;
} {
  const topClip = metrics?.top_clips[0] ?? null;
  const totalVisibility = metrics ? metrics.total_downloads : 0;
  const publishRate =
    metrics && metrics.total_clips > 0
      ? Math.round((metrics.published_clips / metrics.total_clips) * 100)
      : 0;
  const averageDownloadsPerClip =
    metrics && metrics.total_clips > 0
      ? Math.round(metrics.total_downloads / metrics.total_clips)
      : 0;

  return {
    topClip,
    totalVisibility,
    publishRate,
    averageDownloadsPerClip,
  };
}


type TrendPoint = {
  x: number;
  y: number;
  clip: PodcastClipMetrics["top_clips"][number];
};

function buildTrendChart(
  clips: PodcastClipMetrics["top_clips"],
  width = 720,
  height = 320,
) {
  if (clips.length === 0) {
    return {
      points: [] as TrendPoint[],
      linePath: "",
      areaPath: "",
      maxValue: 0,
    };
  }

  const paddingX = 56;
  const paddingY = 26;
  const chartWidth = Math.max(1, width - paddingX * 2);
  const chartHeight = Math.max(1, height - paddingY * 2);
  const maxValue = Math.max(...clips.map((clip) => clip.downloads), 1);
  const step = clips.length > 1 ? chartWidth / (clips.length - 1) : 0;

  const points = clips.map((clip, index) => {
    const normalized = clip.downloads / maxValue;
    const x = paddingX + step * index;
    const y = paddingY + chartHeight - normalized * chartHeight;
    return { x, y, clip };
  });

  const linePath = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");

  const areaPath =
    points.length > 0
      ? `${linePath} L ${points[points.length - 1].x.toFixed(2)} ${height - paddingY} L ${points[0].x.toFixed(2)} ${height - paddingY} Z`
      : "";

  return { points, linePath, areaPath, maxValue };
}

function buildYAxisTicks(maxValue: number): number[] {
  if (maxValue <= 0) {
    return [0];
  }

  return Array.from(
    new Set(
      [0, 0.25, 0.5, 0.75, 1].map((ratio) => Math.round(maxValue * ratio)),
    ),
  ).sort((left, right) => left - right);
}

function formatChartCount(value: number): string {
  if (value >= 1000) {
    const rounded = Math.round(value / 100) / 10;
    return `${rounded.toFixed(rounded >= 10 ? 0 : 1)}k`;
  }

  return `${Math.round(value)}`;
}
type AnalyticsMetricsDisplayProps = {
  metrics: PodcastClipMetrics | null;
  loadingMetrics: boolean;
  isMobile: boolean;
  theme?: AnalyticsTheme;
};

export function AnalyticsMetricsDisplay({
  metrics,
  loadingMetrics,
  isMobile,
  theme = defaultAnalyticsTheme,
}: AnalyticsMetricsDisplayProps) {
  const snapshot = buildAnalyticsSnapshot(metrics);
  const chartClips = metrics?.top_clips ?? [];
  const chart = buildTrendChart(chartClips);
  const yTicks = buildYAxisTicks(chart.maxValue);
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null);
  const metricCards = metrics
    ? [
        { label: "Downloads", value: metrics.total_downloads },
        { label: "Published", value: metrics.published_clips },
        {
          label: "Click Trend",
          value: formatAnalyticsChange(metrics.average_click_trend),
        },
      ]
    : [];

  if (loadingMetrics) {
    return (
      <div style={{ display: "grid", gap: 18 }}>
        <div style={{ color: theme.textSub, lineHeight: 1.8 }}>
          Loading clip metrics...
        </div>
        <div style={{ color: theme.textSub, lineHeight: 1.8 }}>
          Building the ranking table...
        </div>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div style={{ display: "grid", gap: 18 }}>
        <div style={{ color: theme.textSub, lineHeight: 1.8 }}>
          No metrics yet for this podcast. Generate clips first to populate analytics.
        </div>
        <div style={{ color: theme.textSub, lineHeight: 1.8 }}>
          No top clips available yet for this podcast.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "repeat(4, 1fr)",
          gap: 14,
        }}
      >
        {metricCards.map((item) => (
          <div
            key={item.label}
            style={{
              borderRadius: 18,
              border: `1px solid ${theme.borderSub}`,
              background: theme.cardAlt,
              padding: 16,
            }}
          >
            <div
              style={{
                marginTop: 14,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: ".2em",
                textTransform: "uppercase",
                color: theme.textFaint,
              }}
            >
              {item.label}
            </div>
            <div
              style={{
                marginTop: 6,
                fontSize: 30,
                fontStyle: "italic",
              }}
            >
              {item.value}
            </div>
          </div>
        ))}
      </div>

      <section
        className="ic-premium-card"
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
          gap: 18,
        }}
      >
        <MetricPanel theme={theme} title="Reach Snapshot">
          <div style={{ fontSize: 34, lineHeight: 1.04, marginBottom: 8 }}>
            {snapshot.totalVisibility}
          </div>
        <div style={{ color: theme.textSub, lineHeight: 1.75 }}>
            Combined downloads across the selected podcast&apos;s clip set,
            averaging {snapshot.averageDownloadsPerClip} downloads per clip.
          </div>
        </MetricPanel>

        <MetricPanel theme={theme} title="Leading Clip">
          {snapshot.topClip ? (
            <>
              <div style={{ fontSize: 30, lineHeight: 1.04 }}>
                Clip {snapshot.topClip.clip_number}
              </div>
              <div style={{ marginTop: 8, color: theme.textSub, lineHeight: 1.75 }}>
                {snapshot.topClip.title}
              </div>
              <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <MetricBadge
                  background={theme.chip}
                  color={theme.accent}
                  label={`${snapshot.topClip.downloads} downloads`}
                />
                <MetricBadge
                  background={theme.cardAlt}
                  border={`1px solid ${theme.borderSub}`}
                  color={theme.textSub}
                  label={snapshot.topClip.published ? "Published" : "Private"}
                />
                <MetricBadge
                  background={theme.cardAlt}
                  border={`1px solid ${theme.borderSub}`}
                  color={theme.textSub}
                  label={formatAnalyticsChange(snapshot.topClip.click_trend)}
                />
                <MetricBadge
                  background={theme.cardAlt}
                  border={`1px solid ${theme.borderSub}`}
                  color={theme.textSub}
                  label={`${snapshot.publishRate}% publish rate`}
                />
              </div>
            </>
          ) : (
            <div style={{ color: theme.textSub, lineHeight: 1.75 }}>
              Once metrics are available, the strongest clip will surface here
              automatically.
            </div>
          )}
          </MetricPanel>
        </section>

      <section
        style={{
          borderRadius: 26,
          border: `1px solid ${theme.borderSub}`,
          background: `linear-gradient(180deg, ${theme.cardAlt}, ${theme.card})`,
          padding: 18,
          display: "grid",
          gap: 16,
          boxShadow: "0 18px 40px rgba(0,0,0,.05)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <div
              style={{
                fontSize: 11,
                letterSpacing: ".2em",
                textTransform: "uppercase",
                color: theme.textFaint,
                marginBottom: 6,
              }}
            >
              Download trend
            </div>
            <h3 style={{ margin: 0, fontSize: 28, lineHeight: 1.06 }}>
              Top clips by downloads
            </h3>
          </div>
          <div
            style={{
              borderRadius: 999,
              padding: "9px 14px",
              background: theme.chip,
              border: `1px solid ${theme.borderSub}`,
              color: theme.textSub,
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: ".02em",
            }}
          >
            Hover to inspect
          </div>
        </div>

        <div
          style={{
            position: "relative",
            borderRadius: 20,
            border: `1px solid ${theme.borderSub}`,
            background: `linear-gradient(180deg, ${theme.card}, ${theme.cardAlt})`,
            padding: 14,
            overflow: "hidden",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,.06)",
          }}
        >
          {chart.points.length > 0 ? (
            <svg
              viewBox="0 0 720 320"
              width="100%"
              height="320"
              preserveAspectRatio="none"
              role="img"
              aria-label="Download trend chart with hover details"
              tabIndex={0}
              onMouseMove={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                if (!rect.width || !rect.height || chart.points.length === 0) {
                  return;
                }

                const x = ((event.clientX - rect.left) / rect.width) * 720;
                let nearestIndex = 0;
                let nearestDistance = Number.POSITIVE_INFINITY;

                chart.points.forEach((point, index) => {
                  const distance = Math.abs(point.x - x);
                  if (distance < nearestDistance) {
                    nearestDistance = distance;
                    nearestIndex = index;
                  }
                });

                setHoveredPointIndex(nearestIndex);
              }}
              onMouseLeave={() => setHoveredPointIndex(null)}
              onFocus={() => setHoveredPointIndex(0)}
            >
              {/* Force the chart line and fill to be this brownish color, regardless of light/dark mode */}
              <defs>
                <linearGradient id="analyticsAreaFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#B08D70" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#B08D70" stopOpacity="0.02" />
                </linearGradient>
                <linearGradient id="analyticsLineGlow" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#B08D70" stopOpacity="1" />
                  <stop offset="100%" stopColor="#B08D70" stopOpacity="0.6" />
                </linearGradient>
              </defs>

              <text x="56" y="16" fill={theme.textFaint} fontSize="10" fontWeight="700" letterSpacing=".18em">
                Downloads
              </text>

              {yTicks.map((tick) => {
                const ratio = chart.maxValue > 0 ? tick / chart.maxValue : 0;
                const y = 26 + (320 - 52) * (1 - ratio);
                return (
                  <g key={`y-${tick}`}>
                    <line x1="56" x2="688" y1={y} y2={y} stroke={theme.borderSub} strokeWidth="1" opacity="0.5" />
                    <text x="46" y={y + 4} textAnchor="end" fill={theme.textFaint} fontSize="11" fontWeight="700">
                      {formatChartCount(tick)}
                    </text>
                  </g>
                );
              })}

              {chart.points.map((point) => (
                <line
                  key={`v-${point.clip.clip_id}`}
                  x1={point.x}
                  x2={point.x}
                  y1="26"
                  y2="294"
                  stroke={theme.borderSub}
                  strokeWidth="1"
                  opacity="0.4"
                />
              ))}

              {chart.areaPath ? <path d={chart.areaPath} fill="url(#analyticsAreaFill)" /> : null}
              {chart.linePath ? <path d={chart.linePath} fill="none" stroke="url(#analyticsLineGlow)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" /> : null}

              {chart.points.map((point, index) => {
                const isActive = hoveredPointIndex === index;
                return (
                  <g key={point.clip.clip_id}>
                    {isActive ? <line x1={point.x} x2={point.x} y1="26" y2="294" stroke="#B08D70" strokeWidth="1.5" strokeDasharray="4 5" opacity="0.65" /> : null}
                    <circle cx={point.x} cy={point.y} r={isActive ? 11 : 8} fill="#B08D70" fillOpacity={isActive ? 0.25 : 0.1} />
                    <circle cx={point.x} cy={point.y} r={isActive ? 5.8 : 4.4} fill="#B08D70" stroke={theme.card} strokeWidth={2} />
                    <text x={point.x} y="314" textAnchor="middle" fill={theme.text} fontSize="12" fontWeight="700">
                      Clip {index + 1}
                    </text>
                    {/* SVG tooltip removed in favor of HTML overlay */}
                  </g>
                );
              })}
            </svg>
          ) : (
            <div style={{ color: theme.textSub, lineHeight: 1.75, minHeight: 320, display: "grid", placeItems: "center" }}>
              Generate clips first, then the chart will show their ranking by downloads.
            </div>
          )}

          {/* HTML Overlay Tooltip */}
          {hoveredPointIndex !== null && chart.points[hoveredPointIndex] ? (() => {
            const point = chart.points[hoveredPointIndex];
            const clip = point.clip;
            // Map the SVG X coordinate (0-720) to a percentage for CSS positioning
            const leftPercent = (point.x / 720) * 100;
            // Decide whether to anchor the tooltip to the left or right of the cursor based on its position
            const isRightSide = point.x > 360;
            
            return (
              <div
                style={{
                  position: "absolute",
                  top: 24,
                  left: isRightSide ? "auto" : `${leftPercent}%`,
                  right: isRightSide ? `${100 - leftPercent}%` : "auto",
                  marginLeft: isRightSide ? 0 : 20,
                  marginRight: isRightSide ? 20 : 0,
                  width: "max-content",
                  maxWidth: 320,
                  background: theme.card,
                  border: `1px solid ${theme.borderSub}`,
                  borderRadius: 12,
                  padding: "12px 16px",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                  pointerEvents: "none",
                  zIndex: 10,
                }}
              >
                <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: ".15em", color: theme.errorText, textTransform: "uppercase", marginBottom: 6 }}>
                  Hover Detail
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: theme.text, lineHeight: 1.4, marginBottom: 8 }}>
                  Clip {clip.clip_number} – {clip.title}
                </div>
                <div style={{ fontSize: 11, color: theme.textSub, fontWeight: 600, marginBottom: 4 }}>
                  {clip.downloads} downloads
                </div>
                <div style={{ fontSize: 11, color: clip.click_trend > 0 ? theme.errorText : theme.textSub, fontWeight: 700 }}>
                  {clip.click_trend > 0 ? "+" : ""}{clip.click_trend.toFixed(1)}% click trend
                </div>
              </div>
            );
          })() : null}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))", gap: 10 }}>
          {[
            { label: "Peak", value: formatChartCount(chart.maxValue), sub: "highest download count" },
            { label: "Average", value: formatChartCount(metrics.total_downloads / Math.max(chartClips.length || 1, 1)), sub: "downloads per clip" },
            { label: "Ranking", value: `${chartClips.length} clips`, sub: "shown in chart" },
          ].map((item) => (
            <div
              key={item.label}
              style={{
                borderRadius: 16,
                border: `1px solid ${theme.borderSub}`,
                background: theme.card,
                padding: 12,
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".18em", textTransform: "uppercase", color: theme.textFaint, marginBottom: 4 }}>
                {item.label}
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: theme.text }}>
                {item.value}
              </div>
              <div style={{ fontSize: 12, color: theme.textSub, marginTop: 4 }}>
                {item.sub}
              </div>
            </div>
          ))}
        </div>
      </section>
      <section
        style={{
          borderRadius: 24,
          background: theme.card,
          border: `1px solid ${theme.border}`,
          padding: 20,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 11,
                letterSpacing: ".2em",
                textTransform: "uppercase",
                color: theme.textFaint,
                marginBottom: 6,
              }}
            >
              Top Clips Table
            </div>
            <h3 style={{ margin: 0, fontSize: 30, lineHeight: 1.05 }}>
              Downloads and click trends
            </h3>
          </div>
          {metrics.estimated ? (
            <div
              style={{
                borderRadius: 999,
                padding: "10px 14px",
                background: theme.cardAlt,
                border: `1px solid ${theme.borderSub}`,
                color: theme.textSub,
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              Estimated metrics
            </div>
          ) : null}
        </div>

        {metrics.top_clips.length === 0 ? (
          <div style={{ color: theme.textSub, lineHeight: 1.8 }}>
            No top clips available yet for this podcast.
          </div>
        ) : isMobile ? (
          <div style={{ display: "grid", gap: 10 }}>
            {metrics.top_clips.map((clip) => (
              <div
                key={clip.clip_id}
                style={{
                  borderRadius: 16,
                  border: `1px solid ${theme.borderSub}`,
                  background: theme.cardAlt,
                  padding: 14,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 800 }}>Clip {clip.clip_number}</div>
                    <div style={{ marginTop: 5, color: theme.textSub, lineHeight: 1.6, overflowWrap: "anywhere" }}>
                      {clip.title}
                    </div>
                  </div>
                  <span
                    style={{
                      flexShrink: 0,
                      borderRadius: 999,
                      padding: "6px 9px",
                      background: clip.published ? theme.chip : theme.card,
                      border: `1px solid ${clip.published ? theme.accent : theme.borderSub}`,
                      color: clip.published ? theme.accent : theme.textSub,
                      fontWeight: 700,
                      fontSize: 11,
                    }}
                  >
                    {clip.published ? "Published" : "Private"}
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 8, marginTop: 12 }}>
                  {[
                    { label: "Downloads", value: clip.downloads },
                    { label: "Trend", value: formatAnalyticsChange(clip.click_trend), tone: clip.click_trend >= 0 ? theme.accent : theme.errorText },
                  ].map((item) => (
                    <div key={item.label} style={{ borderRadius: 12, border: `1px solid ${theme.borderSub}`, padding: "9px 8px" }}>
                      <div style={{ fontSize: 9, letterSpacing: ".14em", textTransform: "uppercase", color: theme.textFaint, marginBottom: 4 }}>
                        {item.label}
                      </div>
                      <div style={{ fontWeight: 800, color: item.tone ?? theme.text }}>
                        {item.value}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
              <thead>
                <tr
                  style={{
                    textAlign: "left",
                    color: theme.textFaint,
                    fontSize: 11,
                    letterSpacing: ".18em",
                    textTransform: "uppercase",
                  }}
                >
                  <th style={{ padding: "0 0 12px" }}>Clip</th>
                  <th style={{ padding: "0 0 12px" }}>Downloads</th>
                  <th style={{ padding: "0 0 12px" }}>Click Trend</th>
                  <th style={{ padding: "0 0 12px" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {metrics.top_clips.map((clip) => (
                  <tr
                    key={clip.clip_id}
                    style={{ borderTop: `1px solid ${theme.borderSub}` }}
                  >
                    <td style={{ padding: "14px 0", verticalAlign: "top" }}>
                      <div style={{ fontWeight: 700 }}>Clip {clip.clip_number}</div>
                      <div
                        style={{
                          marginTop: 4,
                          color: theme.textSub,
                          lineHeight: 1.65,
                        }}
                      >
                        {clip.title}
                      </div>
                    </td>
                    <td style={{ padding: "14px 0", fontWeight: 700 }}>{clip.downloads}</td>
                    <td
                      style={{
                        padding: "14px 0",
                        fontWeight: 700,
                        color:
                          clip.click_trend >= 0 ? theme.accent : theme.errorText,
                      }}
                    >
                      {formatAnalyticsChange(clip.click_trend)}
                    </td>
                    <td style={{ padding: "14px 0" }}>
                      <span
                        style={{
                          borderRadius: 999,
                          padding: "7px 10px",
                          background: clip.published ? theme.chip : theme.cardAlt,
                          border: `1px solid ${
                            clip.published ? theme.accent : theme.borderSub
                          }`,
                          color: clip.published ? theme.accent : theme.textSub,
                          fontWeight: 700,
                          fontSize: 12,
                        }}
                      >
                        {clip.published ? "Published" : "Private"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function MetricPanel({
  children,
  theme,
  title,
}: {
  children: React.ReactNode;
  theme: AnalyticsTheme;
  title: string;
}) {
  return (
    <div
      className="ic-premium-card"
      style={{
        borderRadius: 24,
        background: theme.card,
        border: `1px solid ${theme.border}`,
        padding: 20,
      }}
    >
      <div
        style={{
          fontSize: 11,
          letterSpacing: ".2em",
          textTransform: "uppercase",
          color: theme.textFaint,
          marginBottom: 12,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function MetricBadge({
  background,
  border,
  color,
  label,
}: {
  background: string;
  border?: string;
  color: string;
  label: string;
}) {
  const style: CSSProperties = {
    borderRadius: 999,
    padding: "7px 10px",
    background,
    color,
    fontWeight: 700,
  };

  if (border) {
    style.border = border;
  }

  return <span style={style}>{label}</span>;
}
