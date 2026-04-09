const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, "") ?? "http://localhost:8000";

export const BACKEND_TOKEN_KEY = "insightclips_backend_token";
export const FRONTEND_UPLOAD_PREFLIGHT_MODE =
  process.env.NEXT_PUBLIC_UPLOAD_PREFLIGHT_MODE?.trim().toLowerCase() ?? "live";

type JsonRecord = Record<string, unknown>;

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

export async function calculateUploadPrice(
  payload: UploadPricePayload,
  token: string
): Promise<UploadPriceResponse> {
  const formData = new FormData();
  formData.set("file", payload.file);
  formData.set("filename", payload.filename);
  formData.set("filesize_bytes", String(payload.filesize_bytes));

  if (payload.mime_type) {
    formData.set("mime_type", payload.mime_type);
  }

  if (typeof payload.detected_duration_seconds === "number" && Number.isFinite(payload.detected_duration_seconds)) {
    formData.set("detected_duration_seconds", String(payload.detected_duration_seconds));
  }

  if (payload.mock || FRONTEND_UPLOAD_PREFLIGHT_MODE === "mock") {
    formData.set("mock", "true");
  }

  const response = await fetch("/api/upload/preflight", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  const responsePayload = (await response.json().catch(() => ({}))) as JsonRecord;

  if (!response.ok) {
    const detail =
      typeof responsePayload.detail === "string"
        ? responsePayload.detail
        : "Upload pre-flight failed.";
    throw new Error(detail);
  }

  return responsePayload as UploadPriceResponse;
}

export async function prepareUpload(
  payload: PrepareUploadPayload,
  token: string
): Promise<PrepareUploadResponse> {
  const response = await fetch("/api/upload/prepare", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      ...payload,
      mock:
        payload.mock || FRONTEND_UPLOAD_PREFLIGHT_MODE === "mock"
          ? true
          : undefined,
    }),
  });

  const responsePayload = (await response.json().catch(() => ({}))) as JsonRecord;

  if (!response.ok) {
    const detail =
      typeof responsePayload.detail === "string"
        ? responsePayload.detail
        : "Upload preparation failed.";
    throw new Error(detail);
  }

  return responsePayload as PrepareUploadResponse;
}
