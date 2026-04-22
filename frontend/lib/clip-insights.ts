export type ClipStatusFilter =
  | "all"
  | "published"
  | "unpublished"
  | "ready"
  | "processing"
  | "failed";

export type ClipInsightInput = {
  id: string;
  clip_number: number;
  clip_start_seconds: number;
  clip_end_seconds: number;
  duration_seconds: number;
  virality_score: number;
  subtitle_text: string;
  status: "ready" | "processing" | "failed";
  published?: boolean;
  published_at?: string | null;
  download_url?: string | null;
  video_url?: string;
};

export type PodcastInsightInput = {
  id: string;
  title: string;
  status?: string;
  duration?: number;
};

export type ClipDiscoveryItem = ClipInsightInput & {
  podcast_id: string;
  podcast_title: string;
  match_reason?: string | null;
  recommendation_reason?: string | null;
};

export type ClipMetricRow = {
  clip_id: string;
  clip_number: number;
  title: string;
  views: number;
  downloads: number;
  click_trend: number;
  published: boolean;
  published_at?: string | null;
  virality_score: number;
  estimated: boolean;
};

export type PodcastMetricSummary = {
  podcast_id: string;
  podcast_title: string;
  total_clips: number;
  published_clips: number;
  unpublished_clips: number;
  total_views: number;
  total_downloads: number;
  average_click_trend: number;
  top_clips: ClipMetricRow[];
  estimated: boolean;
};

export function clipMatchesQuery(clip: ClipInsightInput, podcastTitle: string, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  const haystack = [
    podcastTitle,
    clip.subtitle_text,
    `clip ${clip.clip_number}`,
    clip.published ? "published" : "unpublished",
    clip.status,
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(normalizedQuery);
}

export function clipMatchesStatus(clip: ClipInsightInput, filter: ClipStatusFilter): boolean {
  if (filter === "all") {
    return true;
  }

  if (filter === "published") {
    return Boolean(clip.published);
  }

  if (filter === "unpublished") {
    return !clip.published;
  }

  return clip.status === filter;
}

export function buildDiscoveryItem(
  clip: ClipInsightInput,
  podcast: PodcastInsightInput,
  query = "",
): ClipDiscoveryItem {
  const normalizedQuery = query.trim().toLowerCase();
  let matchReason: string | null = null;

  if (normalizedQuery) {
    if (clip.subtitle_text.toLowerCase().includes(normalizedQuery)) {
      matchReason = "Matched clip transcript";
    } else if (podcast.title.toLowerCase().includes(normalizedQuery)) {
      matchReason = "Matched podcast title";
    } else if (`clip ${clip.clip_number}`.includes(normalizedQuery)) {
      matchReason = "Matched clip number";
    }
  }

  return {
    ...clip,
    podcast_id: podcast.id,
    podcast_title: podcast.title,
    match_reason: matchReason,
  };
}

export function filterDiscoveryItems(
  items: ClipDiscoveryItem[],
  options: {
    query?: string;
    status?: ClipStatusFilter;
    podcastId?: string;
  } = {},
): ClipDiscoveryItem[] {
  const query = options.query ?? "";
  const status = options.status ?? "all";

  return items.filter((item) => {
    const matchesPodcast = !options.podcastId || item.podcast_id === options.podcastId;
    return (
      matchesPodcast &&
      clipMatchesStatus(item, status) &&
      clipMatchesQuery(item, item.podcast_title, query)
    );
  });
}

export function rankRecommendedItems(items: ClipDiscoveryItem[], limit = 3): ClipDiscoveryItem[] {
  return [...items]
    .sort((left, right) => {
      const publishedDelta = Number(left.published) - Number(right.published);
      if (publishedDelta !== 0) {
        return publishedDelta;
      }

      if (right.virality_score !== left.virality_score) {
        return right.virality_score - left.virality_score;
      }

      return left.clip_number - right.clip_number;
    })
    .slice(0, limit)
    .map((item, index) => ({
      ...item,
      recommendation_reason:
        index === 0
          ? "Highest upside right now"
          : item.published
            ? "Already published and performing"
            : "Strong virality signal for next publish",
    }));
}

export function buildEstimatedMetricRow(clip: ClipInsightInput): ClipMetricRow {
  const publishedBoost = clip.published ? 140 : 28;
  const views = Math.round(
    clip.virality_score * 12 + clip.duration_seconds * 4 + clip.clip_number * 17 + publishedBoost,
  );
  const downloads = clip.published ? Math.max(1, Math.round(views * 0.18)) : 0;
  const clickTrend = Number(
    (((clip.virality_score - 50) / 4.5) + (clip.published ? 3.2 : -0.8)).toFixed(1),
  );

  return {
    clip_id: clip.id,
    clip_number: clip.clip_number,
    title: clip.subtitle_text.trim().slice(0, 72) || `Clip ${clip.clip_number}`,
    views,
    downloads,
    click_trend: clickTrend,
    published: Boolean(clip.published),
    published_at: clip.published_at ?? null,
    virality_score: clip.virality_score,
    estimated: true,
  };
}

export function buildEstimatedPodcastMetrics(
  podcast: PodcastInsightInput,
  clips: ClipInsightInput[],
): PodcastMetricSummary {
  const metricRows = clips.map(buildEstimatedMetricRow);
  const topClips = [...metricRows]
    .sort((left, right) => {
      if (right.views !== left.views) {
        return right.views - left.views;
      }
      return right.virality_score - left.virality_score;
    })
    .slice(0, 5);

  const totalViews = metricRows.reduce((sum, clip) => sum + clip.views, 0);
  const totalDownloads = metricRows.reduce((sum, clip) => sum + clip.downloads, 0);
  const averageClickTrend =
    metricRows.length > 0
      ? Number(
          (
            metricRows.reduce((sum, clip) => sum + clip.click_trend, 0) / metricRows.length
          ).toFixed(1),
        )
      : 0;

  return {
    podcast_id: podcast.id,
    podcast_title: podcast.title,
    total_clips: clips.length,
    published_clips: clips.filter((clip) => clip.published).length,
    unpublished_clips: clips.filter((clip) => !clip.published).length,
    total_views: totalViews,
    total_downloads: totalDownloads,
    average_click_trend: averageClickTrend,
    top_clips: topClips,
    estimated: true,
  };
}
