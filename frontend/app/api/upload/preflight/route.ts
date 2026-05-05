import { NextRequest, NextResponse } from "next/server";

import { stageUploadFile } from "@/lib/upload-staging";

export const runtime = "nodejs";

const backendUrl =
  process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, "") ?? "http://localhost:8000";
const FREE_TRIAL_MAX_MINUTES = 30;
const ABSOLUTE_MAX_MINUTES = 120;

type UploadPreflightStatus = "free_ready" | "awaiting_payment" | "blocked";

type UploadPriceResponse = {
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

function getErrorDetail(payload: unknown, fallback: string): string {
  if (
    payload &&
    typeof payload === "object" &&
    "detail" in payload &&
    typeof payload.detail === "string"
  ) {
    return payload.detail;
  }

  return fallback;
}

function determineMockPrice(
  durationMinutes: number,
  freeTrialAvailable: boolean
): Pick<UploadPriceResponse, "price" | "status" | "message" | "free_trial_available"> {
  if (durationMinutes > ABSOLUTE_MAX_MINUTES) {
    return {
      price: 0,
      status: "blocked",
      message: "Videos longer than 120 minutes are blocked in Sprint 2.",
      free_trial_available: false,
    };
  }

  if (durationMinutes <= FREE_TRIAL_MAX_MINUTES && freeTrialAvailable) {
    return {
      price: 0,
      status: "free_ready",
      message: "This upload qualifies for the one-time free trial.",
      free_trial_available: true,
    };
  }

  if (durationMinutes <= FREE_TRIAL_MAX_MINUTES) {
    return {
      price: 1,
      status: "awaiting_payment",
      message: "Payment is required before processing can continue.",
      free_trial_available: false,
    };
  }

  if (durationMinutes <= 60) {
    return {
      price: 2,
      status: "awaiting_payment",
      message: "Payment is required before processing can continue.",
      free_trial_available: false,
    };
  }

  return {
    price: 4,
    status: "awaiting_payment",
    message: "Payment is required before processing can continue.",
    free_trial_available: false,
  };
}

function buildMockResponse(input: {
  uploadReference: string;
  filename: string;
  mimeType: string | null;
  detectedDurationSeconds: number;
}): UploadPriceResponse {
  const durationSeconds = Number.isFinite(input.detectedDurationSeconds)
    ? Number(input.detectedDurationSeconds)
    : 0;
  const durationMinutes = Math.round((durationSeconds / 60) * 100) / 100;
  const priceDecision = determineMockPrice(durationMinutes, true);

  return {
    duration_seconds: durationSeconds,
    duration_minutes: durationMinutes,
    price: priceDecision.price,
    currency: "USD",
    free_trial_available: priceDecision.free_trial_available,
    status: priceDecision.status,
    message: priceDecision.message,
    detected_format: input.mimeType?.replace("video/", "") ?? null,
    validation_flags: {
      ffprobe_available: false,
      file_exists: true,
      mime_type_supported: true,
      duration_detected: durationSeconds > 0,
    },
    upload_reference: input.uploadReference,
    is_mock: true,
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authorization = request.headers.get("authorization");
  if (!authorization) {
    return NextResponse.json({ detail: "Missing authorization header." }, { status: 401 });
  }

  const formData = await request.formData();
  const fileEntry = formData.get("file");

  if (!(fileEntry instanceof File)) {
    return NextResponse.json({ detail: "A media file is required." }, { status: 400 });
  }

  try {
    const stagedUpload = await stageUploadFile(fileEntry);
    const filename = String(formData.get("filename") || stagedUpload.filename);
    const mimeType = String(formData.get("mime_type") || stagedUpload.mime_type || "").trim() || null;
    const mockEnabled = String(formData.get("mock") || "").toLowerCase() === "true";
    const detectedDurationSeconds = Number(formData.get("detected_duration_seconds") || 0);

    if (mockEnabled) {
      return NextResponse.json(
        buildMockResponse({
          uploadReference: stagedUpload.upload_reference,
          filename,
          mimeType,
          detectedDurationSeconds,
        })
      );
    }

    const response = await fetch(`${backendUrl}/upload/calculate-price`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authorization,
      },
      body: JSON.stringify({
        filename,
        filesize_bytes: stagedUpload.filesize_bytes,
        mime_type: mimeType,
        storage_path: stagedUpload.storage_path,
      }),
      cache: "no-store",
    });

    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    if (!response.ok) {
      return NextResponse.json(
        { detail: getErrorDetail(payload, "Upload pre-flight failed.") },
        { status: response.status }
      );
    }

    return NextResponse.json({
      ...payload,
      upload_reference: stagedUpload.upload_reference,
      is_mock: false,
    });
  } catch (error) {
    return NextResponse.json(
      {
        detail:
          error instanceof Error
            ? error.message
            : "Unable to reach the upload pre-flight service.",
      },
      { status: 502 }
    );
  }
}
