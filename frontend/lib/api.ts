import {
  buildDiscoveryItem,
  buildEstimatedPodcastMetrics,
  filterDiscoveryItems,
  rankRecommendedItems,
  type ClipDiscoveryItem,
  type ClipMetricRow,
  type ClipStatusFilter,
  type PodcastMetricSummary,
} from "./clip-insights";

const configuredBackendUrl =
  process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, "") ?? "http://localhost:8000";
const uploadPreflightMode = process.env.NEXT_PUBLIC_UPLOAD_PREFLIGHT_MODE ?? "real";

export const BACKEND_TOKEN_KEY = "insightclips_backend_token";
export const FRONTEND_UPLOAD_PREFLIGHT_MODE =
  process.env.NEXT_PUBLIC_UPLOAD_PREFLIGHT_MODE?.trim().toLowerCase() ?? "live";

type JsonRecord = Record<string, unknown>;

export type UploadState =
  | "idle"
  | "file_selected"
  | "checking"
  | "free_ready"
  | "awaiting_payment"
  | "blocked"
  | "error";

export type UploadPreflightStatus = "free_ready" | "awaiting_payment" | "blocked";
export type ExportMode = "landscape" | "portrait";
export type CropMode = "none" | "center_crop" | "smart_crop";

export type ExportSettings = {
  export_mode: ExportMode;
  crop_mode: CropMode;
  mobile_optimized?: boolean;
  face_tracking_enabled?: boolean;
};

export type UploadPriceRequest = {
  filename: string;
  filesize_bytes: number;
  mime_type?: string;
  storage_path?: string;
  duration_seconds?: number;
};

export type UploadPriceResponse = {
  duration_seconds: number;
  duration_minutes: number;
  price: number;
  currency: "USD";
  free_trial_available: boolean;
  status: UploadPreflightStatus;
  message: string;
  detected_format?: string | null;
  validation_flags?: Record<string, boolean>;
  upload_reference?: string;
  is_mock?: boolean;
};

export type PrepareUploadRequest = {
  title: string;
  filename: string;
  filesize_bytes?: number;
  storage_path?: string;
  mime_type?: string;
  duration_seconds?: number;
  price?: number;
  status?: UploadPreflightStatus;
  export_settings?: ExportSettings;
};

export type PrepareUploadPayload = {
  title: string;
  filename: string;
  filesize_bytes: number;
  mime_type?: string | null;
  duration_seconds?: number;
  price?: number;
  status?: UploadPreflightStatus;
  upload_reference: string;
  mock?: boolean;
  export_settings?: ExportSettings;
};

export type PrepareUploadResponse = {
  podcast_id: string;
  status: "draft" | "free_ready" | "awaiting_payment" | "ready_for_processing" | "processing" | "done" | "blocked";
  storage_ready: boolean;
  checkout_required: boolean;
  payment_status: string;
  price: number;
  currency: "USD";
  export_settings?: ExportSettings | null;
  is_mock?: boolean;
};

type UploadRequestOptions = {
  token?: string | null;
  useMock?: boolean;
};

export type AnalysisWord = {
  word: string;
  start: number;
  end: number;
  confidence: number;
};

export type AnalyzePodcastPayload = {
  transcription?: {
    transcript_text: string;
    duration_seconds: number;
    detected_language: string;
    words: AnalysisWord[];
    model_used: string;
    processing_time_seconds: number;
  };
  transcription_model?: string;
};

export type ScoreSegment = {
  segment_start_seconds: number;
  segment_end_seconds: number;
  duration_seconds: number;
  virality_score: number;
  transcript_snippet: string;
  sentiment: "positive" | "neutral" | "negative";
  keywords: string[];
};

export type AnalysisResult = {
  podcast_id: string;
  total_segments_analyzed: number;
  top_scoring_segments: ScoreSegment[];
  average_score: number;
  processing_time_seconds: number;
};

export type AnalysisSummary = {
  podcast_id: string;
  total_scored_segments: number;
  highest_score: number;
  top_segments: ScoreSegment[];
};

export type Podcast = {
  id: string;
  user_id: string;
  title: string;
  duration: number;
  status: string;
  storage_path?: string | null;
  export_settings?: ExportSettings | null;
  created_at: string | null;
  updated_at: string | null;
};

export type PodcastsResponse = {
  podcasts: Podcast[];
  is_mock: boolean;
};

export type ClipOverlay = {
  clip_id: string;
  podcast_id: string;
  keyword?: string | null;
  overlay_category?: string | null;
  overlay_asset?: string | null;
  asset_path?: string | null;
  matched_text?: string | null;
  position?: string | null;
  scale?: number | null;
  opacity?: number | null;
  margin_x?: number | null;
  margin_y?: number | null;
  render_start_seconds?: number | null;
  render_end_seconds?: number | null;
  applied: boolean;
  rendered?: boolean;
  render_status?: string | null;
  confidence?: number | null;
};

export type ClipResult = {
  id: string;
  clip_number: number;
  clip_start_seconds: number;
  clip_end_seconds: number;
  duration_seconds: number;
  virality_score: number;
  video_url: string;
  subtitle_text: string;
  status: "ready" | "processing" | "failed";
  published?: boolean;
  download_url?: string | null;
  published_at?: string | null;
  overlay?: ClipOverlay | null;
  export_settings?: ExportSettings | null;
};

export type ClipGenerationResult = {
  podcast_id: string;
  total_clips_generated: number;
  clips: ClipResult[];
  processing_time_seconds: number;
  download_folder_url: string;
  export_settings?: ExportSettings | null;
};

export type ClipPublicationStatus = {
  clip_id: string;
  published: boolean;
  download_url?: string | null;
  published_at?: string | null;
};

export type ClipPublicationResult = {
  podcast_id: string;
  total_clips_published: number;
  published_clips: ClipPublicationStatus[];
  processing_time_seconds: number;
};

export type ClipRevocationResult = {
  clip_id: string;
  revoked: boolean;
  published: boolean;
};

export type ClipSearchResult = ClipDiscoveryItem;

export type ClipSearchResponse = {
  query: string;
  total_results: number;
  clips: ClipSearchResult[];
  estimated?: boolean;
};

export type ClipRecommendation = ClipDiscoveryItem;

export type ClipRecommendationsResponse = {
  podcast_id: string;
  recommendations: ClipRecommendation[];
  estimated?: boolean;
};

export type PodcastClipMetrics = PodcastMetricSummary & {
  top_clips: ClipMetricRow[];
};

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT";
  body?: JsonRecord;
  token?: string | null;
};

function buildBackendCandidates(): string[] {
  const candidates = [configuredBackendUrl];

  try {
    const parsed = new URL(configuredBackendUrl);
    if (parsed.hostname === "localhost") {
      candidates.push(`${parsed.protocol}//127.0.0.1${parsed.port ? `:${parsed.port}` : ""}`);
    } else if (parsed.hostname === "127.0.0.1") {
      candidates.push(`${parsed.protocol}//localhost${parsed.port ? `:${parsed.port}` : ""}`);
    }
  } catch {
    return candidates;
  }

  return [...new Set(candidates)];
}

function buildHeaders(options: RequestOptions): Record<string, string> {
  const headers: Record<string, string> = {};
  if (options.body) {
    headers["Content-Type"] = "application/json";
  }
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }
  return headers;
}

async function requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let lastError: Error | null = null;

  for (const backendUrl of buildBackendCandidates()) {
    try {
      const response = await fetch(`${backendUrl}${path}`, {
        method: options.method ?? "GET",
        headers: buildHeaders(options),
        body: options.body ? JSON.stringify(options.body) : undefined,
      });

      const payload = (await response.json().catch(() => ({}))) as JsonRecord;
      if (!response.ok) {
        const detail = typeof payload.detail === "string" ? payload.detail : "Request failed.";
        throw new Error(detail);
      }

      return payload as T;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Request failed.");
    }
  }

  throw lastError ?? new Error("Request failed.");
}

async function requestBlob(path: string, token?: string | null): Promise<Blob> {
  let lastError: Error | null = null;

  for (const backendUrl of buildBackendCandidates()) {
    try {
      const response = await fetch(`${backendUrl}${path}`, {
        method: "GET",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as JsonRecord;
        const detail = typeof payload.detail === "string" ? payload.detail : "Download failed.";
        throw new Error(detail);
      }

      return await response.blob();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Download failed.");
    }
  }

  throw lastError ?? new Error("Download failed.");
}

function buildMockUploadPrice(payload: UploadPriceRequest): UploadPriceResponse {
  const durationMinutes = Math.max(5, Math.min(135, Math.round(payload.filesize_bytes / (18 * 1024 * 1024))));
  const durationSeconds = durationMinutes * 60;

  if (durationMinutes > 120) {
    return {
      duration_seconds: durationSeconds,
      duration_minutes: durationMinutes,
      price: 0,
      currency: "USD",
      free_trial_available: false,
      status: "blocked",
      message: "Mock mode: files above 120 minutes are blocked in Sprint 2.",
      detected_format: payload.mime_type ?? null,
      validation_flags: { mock_mode: true, duration_detected: true },
    };
  }

  if (durationMinutes <= 30) {
    return {
      duration_seconds: durationSeconds,
      duration_minutes: durationMinutes,
      price: 0,
      currency: "USD",
      free_trial_available: true,
      status: "free_ready",
      message: "Mock mode: this file qualifies for the free-tier upload.",
      detected_format: payload.mime_type ?? null,
      validation_flags: { mock_mode: true, duration_detected: true },
    };
  }

  return {
    duration_seconds: durationSeconds,
    duration_minutes: durationMinutes,
    price: durationMinutes <= 60 ? 2 : 4,
    currency: "USD",
    free_trial_available: false,
    status: "awaiting_payment",
    message: "Mock mode: payment is required before processing can continue.",
    detected_format: payload.mime_type ?? null,
    validation_flags: { mock_mode: true, duration_detected: true },
  };
}

function buildMockPrepareResponse(payload: PrepareUploadRequest): PrepareUploadResponse {
  const status = payload.status === "free_ready" ? "ready_for_processing" : payload.status ?? "draft";
  return {
    podcast_id: "mock-podcast-id",
    status,
    storage_ready: status === "ready_for_processing",
    checkout_required: status === "awaiting_payment",
    payment_status: status === "ready_for_processing" ? "not_required" : "pending",
    price: payload.price ?? 0,
    currency: "USD",
  };
}

export function getStoredBackendToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(BACKEND_TOKEN_KEY);
}

export function storeBackendToken(token: string): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(BACKEND_TOKEN_KEY, token);
}

export function clearBackendToken(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(BACKEND_TOKEN_KEY);
}

export function getBackendBaseUrl(): string {
  return configuredBackendUrl;
}

export function resolveBackendUrl(pathOrUrl: string): string {
  const trimmed = pathOrUrl.trim();
  if (!trimmed) {
    return trimmed;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  const backendBaseUrl = getBackendBaseUrl();
  return new URL(
    trimmed.startsWith("/") ? trimmed : `/${trimmed}`,
    backendBaseUrl.endsWith("/") ? backendBaseUrl : `${backendBaseUrl}/`,
  ).toString();
}

export function buildAuthenticatedBackendUrl(
  pathOrUrl: string,
  token?: string | null,
): string {
  const resolvedUrl = resolveBackendUrl(pathOrUrl);
  if (!resolvedUrl || !token) {
    return resolvedUrl;
  }

  try {
    const url = new URL(resolvedUrl);
    const backendUrl = new URL(getBackendBaseUrl());
    const isBackendDownloadRoute =
      url.origin === backendUrl.origin &&
      /\/podcasts\/clips\/[^/]+\/download$/i.test(url.pathname);

    if (isBackendDownloadRoute && !url.searchParams.has("access_token")) {
      url.searchParams.set("access_token", token);
    }

    return url.toString();
  } catch {
    return resolvedUrl;
  }
}

export async function postJson<T>(path: string, body: JsonRecord, token?: string | null): Promise<T> {
  return requestJson<T>(path, { method: "POST", body, token });
}

export async function putJson<T>(path: string, body: JsonRecord, token?: string | null): Promise<T> {
  return requestJson<T>(path, { method: "PUT", body, token });
}

export async function getJson<T>(path: string, token?: string | null): Promise<T> {
  return requestJson<T>(path, { method: "GET", token });
}

export async function patchJson<T>(path: string, body: JsonRecord, token?: string | null): Promise<T> {
  return requestJson<T>(path, { method: "PATCH", body, token });
}

export async function calculateUploadPrice(
  payload: UploadPriceRequest,
  options: UploadRequestOptions = {},
): Promise<UploadPriceResponse> {
  if (options.useMock ?? uploadPreflightMode === "mock") {
    return buildMockUploadPrice(payload);
  }

  return postJson<UploadPriceResponse>("/upload/calculate-price", payload, options.token);
}

export async function prepareUpload(
  payload: PrepareUploadRequest,
  options: UploadRequestOptions = {},
): Promise<PrepareUploadResponse> {
  if (options.useMock ?? uploadPreflightMode === "mock") {
    return buildMockPrepareResponse(payload);
  }

  return postJson<PrepareUploadResponse>("/upload/prepare", payload, options.token);
}

export async function analyzePodcast(
  podcastId: string,
  payload: AnalyzePodcastPayload,
  token?: string | null,
): Promise<AnalysisResult> {
  return postJson<AnalysisResult>(`/podcasts/${podcastId}/analyze`, payload as JsonRecord, token);
}

export async function getPodcastAnalysis(
  podcastId: string,
  token?: string | null,
): Promise<AnalysisSummary> {
  return getJson<AnalysisSummary>(`/podcasts/${podcastId}/analysis`, token);
}

export async function generateClips(
  podcastId: string,
  token?: string | null,
): Promise<ClipGenerationResult> {
  return postJson<ClipGenerationResult>(`/podcasts/${podcastId}/generate-clips`, {}, token);
}

export async function getClips(
  podcastId: string,
  token?: string | null,
): Promise<ClipGenerationResult> {
  return getJson<ClipGenerationResult>(`/podcasts/${podcastId}/clips`, token);
}

export async function downloadClip(
  clipId: string,
  token?: string | null,
): Promise<Blob> {
  return requestBlob(`/podcasts/clips/${clipId}/download`, token);
}

export async function publishClips(
  podcastId: string,
  clipIds: string[],
  token?: string | null,
): Promise<ClipPublicationResult> {
  return postJson<ClipPublicationResult>(`/podcasts/${podcastId}/publish-clips`, { clip_ids: clipIds }, token);
}

export async function revokeClipDownload(
  clipId: string,
  token?: string | null,
): Promise<ClipRevocationResult> {
  return postJson<ClipRevocationResult>(`/clips/${clipId}/revoke-download`, {}, token);
}

async function getAllDiscoveryClips(token?: string | null): Promise<ClipDiscoveryItem[]> {
  const podcastsResponse = await getJson<PodcastsResponse>("/podcasts", token);
  const clipGroups = await Promise.all(
    podcastsResponse.podcasts.map(async (podcast) => {
      try {
        const result = await getClips(podcast.id, token);
        return result.clips.map((clip) => buildDiscoveryItem(clip, podcast));
      } catch {
        return [];
      }
    }),
  );

  return clipGroups.flat();
}

export async function searchClips(
  options: {
    query?: string;
    podcastId?: string;
    status?: ClipStatusFilter;
  } = {},
  token?: string | null,
): Promise<ClipSearchResponse> {
  const params = new URLSearchParams();
  if (options.query?.trim()) {
    params.set("query", options.query.trim());
  }
  if (options.podcastId) {
    params.set("podcast_id", options.podcastId);
  }
  if (options.status && options.status !== "all") {
    params.set("status", options.status);
  }

  try {
    const path = params.size ? `/clips/search?${params.toString()}` : "/clips/search";
    return await getJson<ClipSearchResponse>(path, token);
  } catch {
    const allClips = await getAllDiscoveryClips(token);
    const filtered = filterDiscoveryItems(allClips, {
      query: options.query,
      status: options.status,
      podcastId: options.podcastId,
    })
      .map((item) =>
        buildDiscoveryItem(
          item,
          { id: item.podcast_id, title: item.podcast_title },
          options.query ?? "",
        ),
      )
      .sort((left, right) => {
        if (right.virality_score !== left.virality_score) {
          return right.virality_score - left.virality_score;
        }
        return left.clip_number - right.clip_number;
      });

    return {
      query: options.query ?? "",
      total_results: filtered.length,
      clips: filtered,
      estimated: true,
    };
  }
}

export async function getRecommendations(
  podcastId: string,
  token?: string | null,
): Promise<ClipRecommendationsResponse> {
  try {
    return await getJson<ClipRecommendationsResponse>(
      `/podcasts/${podcastId}/recommendations`,
      token,
    );
  } catch {
    const podcastsResponse = await getJson<PodcastsResponse>("/podcasts", token);
    const podcast = podcastsResponse.podcasts.find((item) => item.id === podcastId);
    if (!podcast) {
      throw new Error("Podcast not found for recommendations.");
    }

    const result = await getClips(podcastId, token);
    const discoveryItems = result.clips.map((clip) => buildDiscoveryItem(clip, podcast));
    return {
      podcast_id: podcastId,
      recommendations: rankRecommendedItems(discoveryItems, 4),
      estimated: true,
    };
  }
}

export async function getClipMetrics(
  podcastId: string,
  token?: string | null,
): Promise<PodcastClipMetrics> {
  try {
    return await getJson<PodcastClipMetrics>(`/podcasts/${podcastId}/metrics`, token);
  } catch {
    const podcastsResponse = await getJson<PodcastsResponse>("/podcasts", token);
    const podcast = podcastsResponse.podcasts.find((item) => item.id === podcastId);
    if (!podcast) {
      throw new Error("Podcast not found for metrics.");
    }

    const clipsResult = await getClips(podcastId, token);
    return buildEstimatedPodcastMetrics(podcast, clipsResult.clips);
  }
}
