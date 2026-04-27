import { NextRequest, NextResponse } from "next/server";

import { getStagedUpload } from "@/lib/upload-staging";

export const runtime = "nodejs";

const backendUrl =
  process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, "") ?? "http://localhost:8000";

type PrepareRequestBody = {
  title?: string;
  filename?: string;
  filesize_bytes?: number;
  mime_type?: string | null;
  duration_seconds?: number;
  price?: number;
  status?: "free_ready" | "awaiting_payment" | "blocked";
  upload_reference?: string;
  mock?: boolean;
  export_settings?: {
    export_mode: "landscape" | "portrait";
    crop_mode?: "none" | "center_crop" | "smart_crop";
    mobile_optimized?: boolean;
    face_tracking_enabled?: boolean;
  };
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

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authorization = request.headers.get("authorization");
  if (!authorization) {
    return NextResponse.json({ detail: "Missing authorization header." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as PrepareRequestBody;
  const uploadReference = body.upload_reference?.trim();

  if (!uploadReference) {
    return NextResponse.json({ detail: "Upload reference is required." }, { status: 400 });
  }

  if (body.mock) {
    return NextResponse.json({
      podcast_id: `mock-${uploadReference}`,
      status: body.status ?? "free_ready",
      storage_ready: body.status !== "awaiting_payment" && body.status !== "blocked",
      checkout_required: body.status === "awaiting_payment",
      payment_status:
        body.status === "awaiting_payment"
          ? "unpaid"
          : body.status === "blocked"
            ? "blocked"
            : "free",
      price: body.price ?? 0,
      currency: "USD",
      export_settings: body.export_settings ?? null,
      is_mock: true,
    });
  }

  const stagedUpload = await getStagedUpload(uploadReference);
  if (!stagedUpload) {
    return NextResponse.json(
      { detail: "The staged upload could not be found. Please retry the pre-flight check." },
      { status: 404 }
    );
  }

  try {
    const response = await fetch(`${backendUrl}/upload/prepare`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authorization,
      },
      body: JSON.stringify({
        title: body.title || stagedUpload.filename.replace(/\.[^.]+$/, ""),
        filename: body.filename || stagedUpload.filename,
        filesize_bytes: body.filesize_bytes ?? stagedUpload.filesize_bytes,
        mime_type: body.mime_type ?? stagedUpload.mime_type,
        storage_path: stagedUpload.storage_path,
        duration_seconds: body.duration_seconds,
        price: body.price,
        status: body.status,
        export_settings: body.export_settings,
      }),
      cache: "no-store",
    });

    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    if (!response.ok) {
      return NextResponse.json(
        { detail: getErrorDetail(payload, "Upload preparation failed.") },
        { status: response.status }
      );
    }

    return NextResponse.json({
      ...payload,
      is_mock: false,
    });
  } catch {
    return NextResponse.json(
      { detail: "Unable to reach the upload preparation service." },
      { status: 502 }
    );
  }
}
