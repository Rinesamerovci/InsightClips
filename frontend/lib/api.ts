import {
  buildDiscoveryItem,
  buildEstimatedMetricRow,
  buildEstimatedPodcastMetrics,
  filterDiscoveryItems,
  rankRecommendedItems,
  type ClipDiscoveryItem,
  type ClipMetricRow,
  type ClipStatusFilter,
  type PodcastMetricSummary,
} from "./clip-insights";

const configuredBackendUrl =
  process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, "") ??
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ??
  "http://localhost:8000";
const uploadPreflightMode = process.env.NEXT_PUBLIC_UPLOAD_PREFLIGHT_MODE?.trim().toLowerCase() ?? "real";
const BACKEND_IS_LOCAL = (() => {
  try {
    const host = new URL(configuredBackendUrl).hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return true;
  }
})();
const CLIENT_IS_LOCALHOST = (() => {
  if (typeof window === "undefined") {
    return false;
  }

  const hostname = window.location.hostname.toLowerCase();
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
})();

export const BACKEND_TOKEN_KEY = "insightclips_backend_token";
export const FRONTEND_UPLOAD_PREFLIGHT_MODE =
  uploadPreflightMode === "mock" && BACKEND_IS_LOCAL && CLIENT_IS_LOCALHOST ? "mock" : "live";

export function shouldUseMockUploadFlow(): boolean {
  return FRONTEND_UPLOAD_PREFLIGHT_MODE === "mock";
}

export function isMockPodcastId(podcastId: string): boolean {
  return podcastId === "mock-podcast-id" || podcastId === "mock-youtube-import";
}

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
export type PodcastSourceType = "upload" | "youtube";
export type ExportMode = "landscape" | "portrait";
export type CropMode = "none" | "center_crop" | "smart_crop";
export type SubtitleStylePreset = "classic" | "bold" | "minimal" | "boxed";
export type SubtitlePosition = "top" | "center" | "bottom";
export type GenerationTemplateId = "hook_spotlight" | "story_arc" | "expert_take";
export type VisualOutputMode = "original_people" | "book_like" | "stylized_animated";

export type SubtitleStyle = {
  preset: SubtitleStylePreset;
  font_family: string;
  font_size: number;
  primary_color: string;
  outline_color: string;
  background_color: string;
  background_opacity: number;
  position: SubtitlePosition;
  bold: boolean;
  italic: boolean;
};

export type AudioEnhancementSettings = {
  enabled: boolean;
  normalize_loudness: boolean;
  target_lufs: number;
  true_peak_db: number;
  status?: "enabled" | "disabled" | "failed" | string | null;
};

export type ExportSettings = {
  export_mode: ExportMode;
  crop_mode: CropMode;
  mobile_optimized?: boolean;
  face_tracking_enabled?: boolean;
  subtitle_style?: SubtitleStyle;
  audio_enhancement?: AudioEnhancementSettings;
  generation_settings?: GenerationSettings;
};

export type GenerationSettings = {
  clip_duration_seconds: number;
  number_of_clips: number;
  topic_focus: string;
  subtitles_enabled: boolean;
};

export type GenerateClipsPayload = {
  score_segments?: ScoreSegment[];
  generation_settings?: GenerationSettings;
  export_settings?: ExportSettings;
  visual_output_mode?: VisualOutputMode;
  save_generation_settings?: boolean;
  use_preferred_generation_settings?: boolean;
};

export type ProfileResponse = {
  id: string;
  email: string;
  free_trial_used: boolean;
  full_name: string | null;
  profile_picture_url: string | null;
  export_settings: ExportSettings;
  created_at: string | null;
  updated_at: string | null;
};

export type UpdateProfilePayload = {
  full_name?: string | null;
  profile_picture_url?: string | null;
};

export type UserExportSettingsResponse = {
  user_id: string;
  export_settings: ExportSettings;
};

export type UserMessageType = "feedback" | "support" | "contact";
export type UserMessageCategory =
  | "bug"
  | "feature_request"
  | "general"
  | "billing"
  | "technical_support";

export type UserMessagePayload = {
  message_type?: UserMessageType;
  category?: UserMessageCategory;
  subject?: string | null;
  message: string;
  contact_email?: string | null;
};

export type UserMessageResponse = {
  id: string;
  user_id: string;
  message_type: UserMessageType;
  category: UserMessageCategory;
  subject?: string | null;
  message: string;
  contact_email?: string | null;
  status: "received" | "triaged";
  created_at?: string | null;
  email_notification_sent?: boolean;
};

export type DeleteAccountResponse = {
  deleted: boolean;
  user_id: string;
  podcasts_deleted: number;
  source_objects_removed: number;
  clip_objects_removed: number;
  auth_user_deleted: boolean;
  email_notification_sent: boolean;
};

export type DeletePodcastResponse = {
  deleted: boolean;
  podcast_id: string;
  source_objects_removed: number;
  clip_objects_removed: number;
  database_rows_removed: number;
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

export type YouTubeImportPayload = {
  url: string;
  title?: string;
  export_settings?: ExportSettings;
};

export type YouTubeImportResponse = {
  podcast_id: string;
  status: "draft" | "free_ready" | "awaiting_payment" | "ready_for_processing" | "processing" | "done" | "blocked";
  source_type: "youtube";
  source_url: string;
  video_id: string;
  title: string;
  storage_path: string;
  duration_seconds: number;
  storage_ready: boolean;
  checkout_required: boolean;
  payment_status: string;
  price: number;
  currency: "USD";
  metadata: Record<string, unknown>;
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
  language?: string;
  force?: boolean;
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
  source_type?: PodcastSourceType;
  source_url?: string | null;
  external_source_id?: string | null;
  import_metadata?: Record<string, unknown> | null;
  export_settings?: ExportSettings | null;
  created_at: string | null;
  updated_at: string | null;
};

export type PodcastResponse = Podcast;

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
  generation_settings?: GenerationSettings | null;
  visual_output_mode?: VisualOutputMode | null;
  effective_visual_output_mode?: VisualOutputMode | null;
  render_fallback_reason?: string | null;
};

export type ClipGenerationResult = {
  podcast_id: string;
  total_clips_generated: number;
  clips: ClipResult[];
  processing_time_seconds: number;
  download_folder_url: string;
  export_settings?: ExportSettings | null;
  generation_settings?: GenerationSettings | null;
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

export type ContentCalendarPlatform = "tiktok" | "linkedin" | "youtube";

export type ContentCalendarSuggestion = {
  clip_id: string;
  clip_number: number;
  platform: ContentCalendarPlatform;
  scheduled_day: number;
  best_time_local: string;
  title: string;
  caption: string;
  hashtags: string[];
  call_to_action: string;
  repurpose_angle: string;
};

export type ContentCalendarResponse = {
  podcast_id: string;
  total_suggestions: number;
  suggestions: ContentCalendarSuggestion[];
  estimated?: boolean;
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

export type TopPerformingClip = {
  clip_id: string;
  podcast_id: string;
  podcast_title: string;
  clip_number: number;
  virality_score: number;
  views: number;
  downloads: number;
  published: boolean;
  published_at?: string | null;
  estimated?: boolean;
};

export type PodcastAnalyticsSummary = {
  podcast_id: string;
  title: string;
  status: string;
  duration: number;
  total_clips: number;
  published_clips: number;
  total_views: number;
  total_downloads: number;
  average_virality_score: number;
  latest_published_at?: string | null;
  estimated?: boolean;
};

export type UserPodcastAnalytics = {
  user_id: string;
  total_podcasts: number;
  total_clips: number;
  published_clips: number;
  private_clips: number;
  total_views: number;
  total_downloads: number;
  average_virality_score: number;
  publish_rate: number;
  top_clips: TopPerformingClip[];
  podcasts: PodcastAnalyticsSummary[];
  estimated?: boolean;
};

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: JsonRecord;
  token?: string | null;
};

export class ApiRequestError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = "ApiRequestError";
    this.status = status;
    this.detail = detail;
  }
}

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

function buildBackendConnectionErrorMessage(path: string, candidates: string[]): string {
  const targets = candidates.join(" or ");
  return `Unable to reach the backend at ${targets} while requesting ${path}. Start the FastAPI server on port 8000, or set NEXT_PUBLIC_BACKEND_URL to the correct API URL.`;
}

async function requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let lastError: Error | null = null;
  const candidates = buildBackendCandidates();

  for (const backendUrl of candidates) {
    try {
      const response = await fetch(`${backendUrl}${path}`, {
        method: options.method ?? "GET",
        headers: buildHeaders(options),
        body: options.body ? JSON.stringify(options.body) : undefined,
      });

      const payload = (await response.json().catch(() => ({}))) as JsonRecord;
      if (!response.ok) {
        const detail = typeof payload.detail === "string" ? payload.detail : "Request failed.";
        throw new ApiRequestError(response.status, detail);
      }

      return payload as T;
    } catch (error) {
      if (error instanceof ApiRequestError) {
        throw error;
      }
      lastError = error instanceof Error ? error : new Error("Request failed.");
    }
  }

  if (lastError?.name === "TypeError" || /failed to fetch/i.test(lastError?.message ?? "")) {
    throw new Error(buildBackendConnectionErrorMessage(path, candidates));
  }

  throw lastError ?? new Error("Request failed.");
}

async function requestBlob(path: string, token?: string | null): Promise<Blob> {
  let lastError: Error | null = null;
  const candidates = buildBackendCandidates();

  for (const backendUrl of candidates) {
    try {
      const response = await fetch(`${backendUrl}${path}`, {
        method: "GET",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as JsonRecord;
        const detail = typeof payload.detail === "string" ? payload.detail : "Download failed.";
        throw new ApiRequestError(response.status, detail);
      }

      return await response.blob();
    } catch (error) {
      if (error instanceof ApiRequestError) {
        throw error;
      }
      lastError = error instanceof Error ? error : new Error("Download failed.");
    }
  }

  if (lastError?.name === "TypeError" || /failed to fetch/i.test(lastError?.message ?? "")) {
    throw new Error(buildBackendConnectionErrorMessage(path, candidates));
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
    export_settings: payload.export_settings,
  };
}

function buildMockYouTubeImportResponse(
  payload: YouTubeImportPayload,
): YouTubeImportResponse {
  const trimmedUrl = payload.url.trim();
  const matchedVideoId =
    trimmedUrl.match(
      /(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/|\/live\/)([A-Za-z0-9_-]{11})/i,
    )?.[1] ?? "mockvideo01";
  const normalizedUrl = `https://www.youtube.com/watch?v=${matchedVideoId}`;

  return {
    podcast_id: "mock-youtube-import",
    status: "ready_for_processing",
    source_type: "youtube",
    source_url: normalizedUrl,
    video_id: matchedVideoId,
    title: payload.title?.trim() || "Mock YouTube import",
    storage_path: `.generated/youtube-imports/mock-user/${matchedVideoId}.mp4`,
    duration_seconds: 1680,
    storage_ready: true,
    checkout_required: false,
    payment_status: "not_required",
    price: 0,
    currency: "USD",
    metadata: {
      channel: "Mock Creator",
      normalized_url: normalizedUrl,
      original_url: trimmedUrl || normalizedUrl,
    },
    export_settings: payload.export_settings ?? null,
    is_mock: true,
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

export async function deleteJson<T>(path: string, body: JsonRecord, token?: string | null): Promise<T> {
  return requestJson<T>(path, { method: "DELETE", body, token });
}

export async function getUserProfile(token?: string | null): Promise<ProfileResponse> {
  return getJson<ProfileResponse>("/users/profile", token);
}

export async function updateUserProfile(
  payload: UpdateProfilePayload,
  token?: string | null,
): Promise<ProfileResponse> {
  return patchJson<ProfileResponse>("/users/profile", payload, token);
}

export async function deleteUserAccount(
  confirmationEmail: string,
  token?: string | null,
): Promise<DeleteAccountResponse> {
  return deleteJson<DeleteAccountResponse>(
    "/users/account",
    { confirmation_email: confirmationEmail },
    token,
  );
}

export async function deletePodcast(
  podcastId: string,
  token?: string | null,
): Promise<DeletePodcastResponse> {
  return deleteJson<DeletePodcastResponse>(`/podcasts/${podcastId}`, {}, token);
}

export async function getUserExportSettings(
  token?: string | null,
): Promise<UserExportSettingsResponse> {
  return getJson<UserExportSettingsResponse>("/users/export-settings", token);
}

export async function updateUserExportSettings(
  exportSettings: ExportSettings,
  token?: string | null,
): Promise<UserExportSettingsResponse> {
  return patchJson<UserExportSettingsResponse>(
    "/users/export-settings",
    { export_settings: exportSettings },
    token,
  );
}

async function submitUserMessage(
  route: "feedback" | "support" | "contact",
  payload: UserMessagePayload,
  token?: string | null,
): Promise<UserMessageResponse> {
  return postJson<UserMessageResponse>(
    `/users/${route}`,
    {
      ...payload,
      message_type: route,
      category: payload.category ?? "general",
      subject: payload.subject ?? null,
      contact_email: payload.contact_email ?? null,
    },
    token,
  );
}

export async function submitFeedback(
  payload: UserMessagePayload,
  token?: string | null,
): Promise<UserMessageResponse> {
  return submitUserMessage("feedback", payload, token);
}

export async function submitSupportRequest(
  payload: UserMessagePayload,
  token?: string | null,
): Promise<UserMessageResponse> {
  return submitUserMessage("support", payload, token);
}

export async function submitContactMessage(
  payload: UserMessagePayload,
  token?: string | null,
): Promise<UserMessageResponse> {
  return submitUserMessage("contact", payload, token);
}

export async function calculateUploadPrice(
  payload: UploadPriceRequest,
  options: UploadRequestOptions = {},
): Promise<UploadPriceResponse> {
  if (options.useMock ?? shouldUseMockUploadFlow()) {
    return buildMockUploadPrice(payload);
  }

  return postJson<UploadPriceResponse>("/upload/calculate-price", payload, options.token);
}

export async function prepareUpload(
  payload: PrepareUploadRequest,
  options: UploadRequestOptions = {},
): Promise<PrepareUploadResponse> {
  if (options.useMock ?? shouldUseMockUploadFlow()) {
    return buildMockPrepareResponse(payload);
  }

  return postJson<PrepareUploadResponse>("/upload/prepare", payload, options.token);
}

export async function importYouTubePodcast(
  payload: YouTubeImportPayload,
  options: UploadRequestOptions = {},
): Promise<YouTubeImportResponse> {
  if (options.useMock ?? shouldUseMockUploadFlow()) {
    return buildMockYouTubeImportResponse(payload);
  }

  return postJson<YouTubeImportResponse>("/upload/youtube", payload as JsonRecord, options.token);
}

export async function createCheckoutSession(
  podcastId: string,
  price: number,
  token?: string | null,
): Promise<{ checkout_url: string }> {
  return postJson<{ checkout_url: string }>("/upload/checkout-session", { podcast_id: podcastId, price }, token);
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
  payloadOrToken?: GenerateClipsPayload | string | null,
  maybeToken?: string | null,
): Promise<ClipGenerationResult> {
  const payload =
    payloadOrToken && typeof payloadOrToken === "object" && !Array.isArray(payloadOrToken)
      ? payloadOrToken
      : undefined;
  const token =
    typeof payloadOrToken === "string" || payloadOrToken == null
      ? payloadOrToken ?? maybeToken
      : maybeToken;

  const requestBody: JsonRecord = {};
  if (payload?.score_segments) {
    requestBody.score_segments = payload.score_segments;
  }
  if (payload?.generation_settings) {
    requestBody.generation_settings = payload.generation_settings;
  }
  if (payload?.export_settings) {
    requestBody.export_settings = payload.export_settings;
  }
  if (payload?.visual_output_mode) {
    requestBody.visual_output_mode = payload.visual_output_mode;
  }
  if (typeof payload?.save_generation_settings === "boolean") {
    requestBody.save_generation_settings = payload.save_generation_settings;
  }
  if (typeof payload?.use_preferred_generation_settings === "boolean") {
    requestBody.use_preferred_generation_settings = payload.use_preferred_generation_settings;
  }

  try {
    return await postJson<ClipGenerationResult>(
      `/podcasts/${podcastId}/generate-clips`,
      requestBody,
      token,
    );
  } catch (error) {
    if (!payload?.generation_settings) {
      throw error;
    }

    const legacyBody = payload.export_settings
      ? ({ export_settings: payload.export_settings } as JsonRecord)
      : {};

    return postJson<ClipGenerationResult>(
      `/podcasts/${podcastId}/generate-clips`,
      legacyBody,
      token,
    );
  }
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

// INTEGRATION POINT: In production, payment status should be set by backend webhook, not client
export async function confirmMockPayment(
  podcastId: string,
  paymentStatus: "paid" | "failed",
  token: string,
): Promise<PodcastResponse> {
  return patchJson<PodcastResponse>(
    `/podcasts/${podcastId}/payment`,
    { payment_status: paymentStatus },
    token,
  );
}

function normalizeCalendarText(value: string): string {
  return value.split(/\s+/).filter(Boolean).join(" ").trim();
}

function truncateCalendarWords(value: string, limit: number): string {
  const words = normalizeCalendarText(value).split(" ").filter(Boolean);
  if (words.length === 0) {
    return "Generated clip";
  }

  const shortened = words.slice(0, limit).join(" ");
  return words.length <= limit ? shortened : `${shortened}...`;
}

function extractCalendarKeywords(value: string): string[] {
  const blocked = new Set([
    "this",
    "that",
    "with",
    "from",
    "your",
    "have",
    "will",
    "about",
    "into",
    "they",
    "them",
  ]);

  const words: string[] = [];
  for (const rawWord of normalizeCalendarText(value)
    .toLowerCase()
    .replace(/[?.,]/g, " ")
    .split(/\s+/)) {
    const cleaned = rawWord.replace(/[^a-z0-9]/g, "");
    if (!cleaned || blocked.has(cleaned) || words.includes(cleaned)) {
      continue;
    }
    words.push(cleaned);
  }

  return words.slice(0, 3);
}

function buildPlatformHashtags(
  platform: ContentCalendarPlatform,
  subtitle: string,
): string[] {
  const base =
    platform === "tiktok"
      ? ["#PodcastClips", "#CreatorTips", "#InsightClips"]
      : platform === "linkedin"
        ? ["#Leadership", "#ContentStrategy", "#Podcast"]
        : ["#Podcast", "#Shorts", "#Highlights"];

  const keywords = extractCalendarKeywords(subtitle)
    .filter((word) => word.length > 3)
    .map((word) => `#${word.charAt(0).toUpperCase()}${word.slice(1)}`);

  return [...new Set([...base, ...keywords])].slice(0, 6);
}

export function buildEstimatedContentCalendar(
  podcastId: string,
  clips: ClipResult[],
): ContentCalendarResponse {
  const platforms: ContentCalendarPlatform[] = ["tiktok", "linkedin", "youtube"];
  const readyClips = [...clips]
    .filter((clip) => ["ready", "done", "completed"].includes(clip.status))
    .sort((left, right) => {
      if (right.virality_score !== left.virality_score) {
        return right.virality_score - left.virality_score;
      }
      return left.clip_number - right.clip_number;
    })
    .slice(0, 5);

  const suggestions = readyClips.flatMap((clip, clipIndex) => {
    const subtitle = normalizeCalendarText(clip.subtitle_text || "");
    const titleSeed = subtitle || `Clip ${clip.clip_number}`;

    return platforms.map((platform, platformIndex) => {
      const scheduled_day = ((clipIndex + platformIndex) % 7) + 1;
      const title = truncateCalendarWords(titleSeed, 9);
      const platformTitle =
        platform === "linkedin"
          ? `Insight: ${title}`
          : platform === "youtube"
            ? `${title} | Podcast Clip`
            : title;
      const caption =
        platform === "linkedin"
          ? `${truncateCalendarWords(titleSeed, 18)}\n\nA concise takeaway from the full conversation.`
          : platform === "youtube"
            ? `${truncateCalendarWords(titleSeed, 18)}\n\nWatch this highlight and save the full episode for later.`
            : `${truncateCalendarWords(titleSeed, 18)} Watch until the end for the key takeaway.`;
      const call_to_action =
        platform === "linkedin"
          ? "Comment with the takeaway you would apply first."
          : platform === "youtube"
            ? "Subscribe for more clips from this podcast."
            : "Follow for more short podcast takeaways.";
      const repurpose_angle =
        platform === "linkedin"
          ? "Frame the clip as a professional lesson or discussion prompt."
          : platform === "youtube"
            ? "Package the clip as a searchable highlight from the episode."
            : subtitle.includes("?")
              ? "Open with the question and let the answer drive retention."
              : "Lead with the strongest hook in the first two seconds.";
      const best_time_local =
        platform === "linkedin" ? "09:00" : platform === "youtube" ? "17:00" : "19:30";

      return {
        clip_id: clip.id,
        clip_number: clip.clip_number,
        platform,
        scheduled_day,
        best_time_local,
        title: platformTitle,
        caption,
        hashtags: buildPlatformHashtags(platform, subtitle),
        call_to_action,
        repurpose_angle,
      };
    });
  });

  return {
    podcast_id: podcastId,
    total_suggestions: suggestions.length,
    suggestions,
    estimated: true,
  };
}

export async function getContentCalendar(
  podcastId: string,
  token?: string | null,
): Promise<ContentCalendarResponse> {
  try {
    return await getJson<ContentCalendarResponse>(
      `/podcasts/${podcastId}/content-calendar`,
      token,
    );
  } catch {
    const clipsResult = await getClips(podcastId, token);
    return buildEstimatedContentCalendar(podcastId, clipsResult.clips);
  }
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

export function buildEstimatedUserAnalytics(
  userId: string,
  podcasts: Podcast[],
  clipsByPodcastId: Record<string, ClipResult[]>,
): UserPodcastAnalytics {
  const summaries = podcasts.map((podcast) => {
    const clips = clipsByPodcastId[podcast.id] ?? [];
    const metrics = buildEstimatedPodcastMetrics(podcast, clips);
    const averageViralityScore =
      clips.length > 0
        ? Number(
            (
              clips.reduce((sum, clip) => sum + clip.virality_score, 0) / clips.length
            ).toFixed(2),
          )
        : 0;
    const latestPublishedAt = clips
      .filter((clip) => clip.published && clip.published_at)
      .map((clip) => clip.published_at ?? null)
      .sort()
      .at(-1) ?? null;

    return {
      podcast_id: podcast.id,
      title: podcast.title,
      status: podcast.status,
      duration: podcast.duration,
      total_clips: metrics.total_clips,
      published_clips: metrics.published_clips,
      total_views: metrics.total_views,
      total_downloads: metrics.total_downloads,
      average_virality_score: averageViralityScore,
      latest_published_at: latestPublishedAt,
      estimated: true,
    };
  });

  const allTopClips = podcasts
    .flatMap((podcast) =>
      (clipsByPodcastId[podcast.id] ?? []).map((clip) => {
        const metrics = buildEstimatedMetricRow(clip);
        return {
          clip_id: clip.id,
          podcast_id: podcast.id,
          podcast_title: podcast.title,
          clip_number: clip.clip_number,
          virality_score: clip.virality_score,
          views: metrics.views,
          downloads: metrics.downloads,
          published: Boolean(clip.published),
          published_at: clip.published_at ?? null,
          estimated: true,
        };
      }),
    )
    .sort((left, right) => {
      if (right.views !== left.views) {
        return right.views - left.views;
      }
      if (right.downloads !== left.downloads) {
        return right.downloads - left.downloads;
      }
      if (right.virality_score !== left.virality_score) {
        return right.virality_score - left.virality_score;
      }
      return left.clip_number - right.clip_number;
    })
    .slice(0, 5);

  const totalClips = summaries.reduce((sum, item) => sum + item.total_clips, 0);
  const publishedClips = summaries.reduce((sum, item) => sum + item.published_clips, 0);
  const totalViews = summaries.reduce((sum, item) => sum + item.total_views, 0);
  const totalDownloads = summaries.reduce((sum, item) => sum + item.total_downloads, 0);
  const viralityScores = Object.values(clipsByPodcastId).flatMap((clips) =>
    clips.map((clip) => clip.virality_score),
  );

  return {
    user_id: userId.trim() || podcasts[0]?.user_id || "current-user",
    total_podcasts: podcasts.length,
    total_clips: totalClips,
    published_clips: publishedClips,
    private_clips: Math.max(0, totalClips - publishedClips),
    total_views: totalViews,
    total_downloads: totalDownloads,
    average_virality_score:
      viralityScores.length > 0
        ? Number(
            (
              viralityScores.reduce((sum, score) => sum + score, 0) /
              viralityScores.length
            ).toFixed(2),
          )
        : 0,
    publish_rate: totalClips
      ? Number(((publishedClips / totalClips) * 100).toFixed(2))
      : 0,
    top_clips: allTopClips,
    podcasts: summaries,
    estimated: true,
  };
}

export async function getPodcastAnalytics(
  token?: string | null,
): Promise<UserPodcastAnalytics> {
  try {
    return await getJson<UserPodcastAnalytics>("/podcasts/analytics", token);
  } catch {
    const podcastsResponse = await getJson<PodcastsResponse>("/podcasts", token);
    const clipEntries = await Promise.all(
      podcastsResponse.podcasts.map(async (podcast) => {
        try {
          const result = await getClips(podcast.id, token);
          return [podcast.id, result.clips] as const;
        } catch {
          return [podcast.id, []] as const;
        }
      }),
    );

    return buildEstimatedUserAnalytics(
      podcastsResponse.podcasts[0]?.user_id ?? "current-user",
      podcastsResponse.podcasts,
      Object.fromEntries(clipEntries),
    );
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
