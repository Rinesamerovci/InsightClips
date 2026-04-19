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
  status: "free_ready" | "awaiting_payment" | "blocked";
  message: string;
  detected_format?: string | null;
  validation_flags?: Record<string, boolean>;
};

export type PrepareUploadRequest = {
  title: string;
  filename: string;
  filesize_bytes?: number;
  storage_path?: string;
  mime_type?: string;
  duration_seconds?: number;
  price?: number;
  status?: "free_ready" | "awaiting_payment" | "blocked";
};

export type PrepareUploadResponse = {
  podcast_id: string;
  status: "draft" | "free_ready" | "awaiting_payment" | "ready_for_processing" | "blocked";
  storage_ready: boolean;
  checkout_required: boolean;
  payment_status: string;
  price: number;
  currency: "USD";
};

type UploadRequestOptions = {
  token?: string | null;
  useMock?: boolean;
};

export type UploadPreflightStatus = "free_ready" | "awaiting_payment" | "blocked";

export type UploadPricePayload = {
  file: File;
  filename: string;
  filesize_bytes: number;
  mime_type?: string | null;
  detected_duration_seconds?: number | null;
  mock?: boolean;
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
  upload_reference: string;
  is_mock?: boolean;
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
};

export type PrepareUploadResponse = {
  podcast_id: string;
  status: "draft" | "free_ready" | "awaiting_payment" | "ready_for_processing" | "blocked";
  storage_ready: boolean;
  checkout_required: boolean;
  payment_status: string;
  price: number;
  currency: "USD";
  is_mock?: boolean;
};

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

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH";
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

async function requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body) {
    headers["Content-Type"] = "application/json";
  }
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  let lastError: Error | null = null;

  for (const backendUrl of buildBackendCandidates()) {
    try {
      const response = await fetch(`${backendUrl}${path}`, {
        method: options.method ?? "GET",
        headers,
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
