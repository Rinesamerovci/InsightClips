const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, "") ?? "http://localhost:8000";
const uploadPreflightMode = process.env.NEXT_PUBLIC_UPLOAD_PREFLIGHT_MODE ?? "real";

export const BACKEND_TOKEN_KEY = "insightclips_backend_token";

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
  method?: "GET" | "POST";
  body?: JsonRecord;
  token?: string | null;
};

async function requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body) {
    headers["Content-Type"] = "application/json";
  }
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

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
}

export async function postJson<T>(path: string, body: JsonRecord, token?: string | null): Promise<T> {
  return requestJson<T>(path, { method: "POST", body, token });
}

export async function getJson<T>(path: string, token?: string | null): Promise<T> {
  return requestJson<T>(path, { method: "GET", token });
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
