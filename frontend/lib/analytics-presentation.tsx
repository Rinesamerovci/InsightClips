import type { CSSProperties } from "react";

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
  averageViewsPerClip: number;
} {
  const topClip = metrics?.top_clips[0] ?? null;
  const totalVisibility = metrics ? metrics.total_views + metrics.total_downloads : 0;
  const publishRate =
    metrics && metrics.total_clips > 0
      ? Math.round((metrics.published_clips / metrics.total_clips) * 100)
      : 0;
  const averageViewsPerClip =
    metrics && metrics.total_clips > 0
      ? Math.round(metrics.total_views / metrics.total_clips)
      : 0;

  return {
    topClip,
    totalVisibility,
    publishRate,
    averageViewsPerClip,
  };
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
  const metricCards = metrics
    ? [
        { label: "Views", value: metrics.total_views },
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
            Combined views and downloads across the selected podcast&apos;s clip set,
            averaging {snapshot.averageViewsPerClip} views per clip.
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
                  label={`${snapshot.topClip.views} views`}
                />
                <MetricBadge
                  background={theme.cardAlt}
                  border={`1px solid ${theme.borderSub}`}
                  color={theme.textSub}
                  label={`${snapshot.topClip.downloads} downloads`}
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
              Views, downloads, and click trends
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
                  <th style={{ padding: "0 0 12px" }}>Views</th>
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
                    <td style={{ padding: "14px 0", fontWeight: 700 }}>{clip.views}</td>
                    <td style={{ padding: "14px 0", fontWeight: 700 }}>
                      {clip.downloads}
                    </td>
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
