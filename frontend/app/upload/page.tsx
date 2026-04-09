"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  FileVideo2,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  UploadCloud,
} from "lucide-react";

import { UploadPreflightResultCard } from "@/components/upload/UploadPreflightResultCard";
import {
  PaymentPendingBanner,
  UploadStateBanner,
} from "@/components/upload/UploadStateBanner";
import { useAuth } from "@/context/AuthContext";
import {
  FRONTEND_UPLOAD_PREFLIGHT_MODE,
  calculateUploadPrice,
  prepareUpload,
  type PrepareUploadResponse,
  type UploadPriceResponse,
} from "@/lib/api";

type UploadClientState =
  | "idle"
  | "file_selected"
  | "checking"
  | "free_ready"
  | "awaiting_payment"
  | "blocked"
  | "error";

type SelectedFileState = {
  file: File;
  localDurationSeconds: number | null;
  isDetectingMetadata: boolean;
};

const ACCEPTED_EXTENSIONS = [".mp4", ".mov", ".m4v", ".webm"];
const ACCEPTED_MIME_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-m4v",
]);

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(value >= 100 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

function formatDuration(seconds: number | null): string {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) {
    return "Pending pre-flight";
  }

  const wholeSeconds = Math.round(seconds);
  const minutes = Math.floor(wholeSeconds / 60);
  const remainder = wholeSeconds % 60;
  return `${minutes}m ${String(remainder).padStart(2, "0")}s`;
}

function deriveTitle(filename: string): string {
  return filename.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim() || "Untitled upload";
}

function isSupportedVideo(file: File): boolean {
  const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  return ACCEPTED_MIME_TYPES.has(file.type) || ACCEPTED_EXTENSIONS.includes(extension);
}

async function detectVideoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const objectUrl = URL.createObjectURL(file);

    const cleanup = () => {
      URL.revokeObjectURL(objectUrl);
      video.removeAttribute("src");
      video.load();
    };

    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : null;
      cleanup();
      resolve(duration);
    };
    video.onerror = () => {
      cleanup();
      resolve(null);
    };
    video.src = objectUrl;
  });
}

function isBlockingMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("unsupported") ||
    normalized.includes("blocked") ||
    normalized.includes("longer than") ||
    normalized.includes("over-limit")
  );
}

export default function UploadPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const router = useRouter();
  const { user, backendToken, loading: authLoading, syncBackendSession } = useAuth();
  const [authResolved, setAuthResolved] = useState(false);
  const [resolvedToken, setResolvedToken] = useState<string | null>(backendToken);
  const [clientState, setClientState] = useState<UploadClientState>("idle");
  const [selectedFile, setSelectedFile] = useState<SelectedFileState | null>(null);
  const [title, setTitle] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [preflightResult, setPreflightResult] = useState<UploadPriceResponse | null>(null);
  const [preparedUpload, setPreparedUpload] = useState<PrepareUploadResponse | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (authLoading) {
      return;
    }

    const resolveAccess = async () => {
      if (!user) {
        router.replace("/login");
        setAuthResolved(true);
        return;
      }

      try {
        const token = backendToken ?? (await syncBackendSession());
        if (!token) {
          router.replace("/login");
          return;
        }

        setResolvedToken(token);
      } catch {
        router.replace("/login");
      } finally {
        setAuthResolved(true);
      }
    };

    void resolveAccess();
  }, [authLoading, backendToken, router, syncBackendSession, user]);

  const resetFlow = () => {
    setClientState("idle");
    setSelectedFile(null);
    setTitle("");
    setPreflightResult(null);
    setPreparedUpload(null);
    setErrorMessage("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSelectedFile = async (file: File) => {
    setPreparedUpload(null);
    setPreflightResult(null);
    setErrorMessage("");
    setTitle(deriveTitle(file.name));
    setSelectedFile({
      file,
      localDurationSeconds: null,
      isDetectingMetadata: true,
    });

    if (!isSupportedVideo(file)) {
      setClientState("blocked");
      setErrorMessage("Only MP4, MOV, M4V, and WebM video files are supported right now.");
      setSelectedFile({
        file,
        localDurationSeconds: null,
        isDetectingMetadata: false,
      });
      return;
    }

    setClientState("file_selected");
    const duration = await detectVideoDuration(file);
    setSelectedFile({
      file,
      localDurationSeconds: duration,
      isDetectingMetadata: false,
    });
  };

  const handleInputChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    await handleSelectedFile(file);
  };

  const handleDrop = async (event: React.DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) {
      return;
    }

    await handleSelectedFile(file);
  };

  const handlePreflightCheck = async () => {
    if (!selectedFile || !resolvedToken) {
      return;
    }

    setPreparedUpload(null);
    setErrorMessage("");
    setClientState("checking");

    try {
      const result = await calculateUploadPrice(
        {
          file: selectedFile.file,
          filename: selectedFile.file.name,
          filesize_bytes: selectedFile.file.size,
          mime_type: selectedFile.file.type || null,
          detected_duration_seconds: selectedFile.localDurationSeconds,
        },
        resolvedToken
      );

      setPreflightResult(result);
      setClientState(result.status);
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to run upload pre-flight.";
      setErrorMessage(message);
      setClientState(isBlockingMessage(message) ? "blocked" : "error");
    }
  };

  const handlePrepareUpload = async () => {
    if (!selectedFile || !preflightResult || !resolvedToken) {
      return;
    }

    setFinalizing(true);
    setErrorMessage("");

    try {
      const response = await prepareUpload(
        {
          title: title.trim() || deriveTitle(selectedFile.file.name),
          filename: selectedFile.file.name,
          filesize_bytes: selectedFile.file.size,
          mime_type: selectedFile.file.type || null,
          duration_seconds: preflightResult.duration_seconds,
          price: preflightResult.price,
          status: preflightResult.status,
          upload_reference: preflightResult.upload_reference,
        },
        resolvedToken
      );

      setPreparedUpload(response);
      setClientState(response.status === "blocked" ? "blocked" : preflightResult.status);
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : "Unable to prepare upload.";
      setErrorMessage(message);
      setClientState("error");
    } finally {
      setFinalizing(false);
    }
  };

  if (authLoading || !authResolved) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f4f7ef]">
        <Loader2 className="animate-spin text-[#4f6f52]" size={36} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f4f7ef] px-6 py-10 text-[#203328]">
      <div className="mx-auto max-w-6xl">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 rounded-full border border-[#d9e5d3] bg-white px-4 py-3 text-sm font-medium text-[#4f6f52]"
        >
          <ArrowLeft size={16} />
          Back to dashboard
        </Link>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1.3fr_0.7fr]">
          <section className="rounded-[2.5rem] border border-[#d9e5d3] bg-white p-8 shadow-[0_20px_50px_rgba(124,150,118,0.12)]">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex h-16 w-16 items-center justify-center rounded-[1.5rem] bg-[#d7e8d2] text-[#4f6f52]">
                  <UploadCloud size={30} />
                </div>
                <p className="mt-6 text-xs uppercase tracking-[0.25em] text-[#7c9676]">
                  Upload pre-flight
                </p>
                <h1 className="mt-2 text-4xl font-semibold tracking-tight">
                  Validate the next podcast before we process anything.
                </h1>
                <p className="mt-4 max-w-3xl text-base leading-7 text-[#5b6f5f]">
                  Drop in a video file, check duration and pricing, and see whether the upload is
                  free, paid, or blocked. Sprint 2 stops before Stripe checkout and AI execution.
                </p>
              </div>

              <div className="rounded-[1.75rem] border border-[#d9e5d3] bg-[#f7fbf5] px-5 py-4">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#4f6f52]">
                  Current mode
                </p>
                <p className="mt-2 text-sm font-semibold text-[#203328]">
                  {FRONTEND_UPLOAD_PREFLIGHT_MODE === "mock" ? "Mock pre-flight" : "Live pre-flight"}
                </p>
                <p className="mt-2 max-w-xs text-sm leading-6 text-[#5b6f5f]">
                  {FRONTEND_UPLOAD_PREFLIGHT_MODE === "mock"
                    ? "Pricing can be tested without relying on backend media inspection."
                    : "This uses the backend pricing endpoint through a small Next.js staging bridge."}
                </p>
              </div>
            </div>

            <div className="mt-8">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
                className={`flex w-full flex-col items-center justify-center rounded-[2rem] border border-dashed px-6 py-12 text-center transition-all ${
                  dragActive
                    ? "border-[#4f6f52] bg-[#eef7ea]"
                    : "border-[#cfe0c9] bg-[#f8fbf5] hover:border-[#98b48f] hover:bg-[#f1f8ed]"
                }`}
              >
                <div className="flex h-16 w-16 items-center justify-center rounded-[1.5rem] bg-white text-[#4f6f52] shadow-[0_10px_30px_rgba(124,150,118,0.12)]">
                  <FileVideo2 size={28} />
                </div>
                <p className="mt-5 text-lg font-semibold text-[#203328]">
                  Drag a video here or click to choose a file
                </p>
                <p className="mt-2 text-sm text-[#5b6f5f]">
                  Supported formats: MP4, MOV, M4V, WebM
                </p>
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/quicktime,video/webm,video/x-m4v,.mp4,.mov,.m4v,.webm"
                className="hidden"
                onChange={(event) => void handleInputChange(event)}
              />
            </div>

            <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_auto]">
              <div className="rounded-[2rem] border border-[#d9e5d3] bg-[#fbfdf9] p-6">
                <div className="flex items-center gap-2 text-[#4f6f52]">
                  <Sparkles size={16} />
                  <p className="text-[10px] font-black uppercase tracking-[0.22em]">
                    Selected file summary
                  </p>
                </div>

                {selectedFile ? (
                  <div className="mt-4 space-y-4">
                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="rounded-[1.5rem] border border-[#dfead9] bg-white p-4">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#7c9676]">
                          File name
                        </p>
                        <p className="mt-3 break-all text-sm font-semibold text-[#203328]">
                          {selectedFile.file.name}
                        </p>
                      </div>

                      <div className="rounded-[1.5rem] border border-[#dfead9] bg-white p-4">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#7c9676]">
                          File size
                        </p>
                        <p className="mt-3 text-sm font-semibold text-[#203328]">
                          {formatFileSize(selectedFile.file.size)}
                        </p>
                      </div>

                      <div className="rounded-[1.5rem] border border-[#dfead9] bg-white p-4">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#7c9676]">
                          Local preview
                        </p>
                        <p className="mt-3 text-sm font-semibold text-[#203328]">
                          {selectedFile.isDetectingMetadata
                            ? "Reading metadata..."
                            : formatDuration(selectedFile.localDurationSeconds)}
                        </p>
                      </div>
                    </div>

                    <label className="block">
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#7c9676]">
                        Podcast title
                      </span>
                      <input
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                        placeholder="Episode title"
                        className="mt-3 w-full rounded-[1.25rem] border border-[#d9e5d3] bg-white px-4 py-4 text-sm font-medium text-[#203328] outline-none transition-colors focus:border-[#98b48f]"
                      />
                    </label>
                  </div>
                ) : (
                  <p className="mt-4 text-sm leading-6 text-[#5b6f5f]">
                    Choose a file to see its filename, size, detected duration, and pricing
                    eligibility before anything is finalized.
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-3 xl:justify-end">
                <button
                  type="button"
                  onClick={() => void handlePreflightCheck()}
                  disabled={!selectedFile || clientState === "checking" || finalizing}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-[#4f6f52] px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(79,111,82,0.25)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {clientState === "checking" ? (
                    <>
                      Checking
                      <Loader2 size={16} className="animate-spin" />
                    </>
                  ) : (
                    <>
                      Run pre-flight
                      <ShieldCheck size={16} />
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={resetFlow}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-[#d9e5d3] bg-white px-5 py-3 text-sm font-medium text-[#4f6f52]"
                >
                  Reset
                  <RefreshCw size={16} />
                </button>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              {clientState === "idle" ? (
                <UploadStateBanner
                  tone="info"
                  title="Upload guide"
                  message="The first successful upload under 30 minutes is free. Longer files get a price preview, and anything over 120 minutes is blocked before processing."
                />
              ) : null}

              {clientState === "file_selected" ? (
                <UploadStateBanner
                  tone="info"
                  title="Ready for pricing"
                  message="Your file is selected. Run the pre-flight check to confirm duration, free-tier availability, and whether payment will be required."
                />
              ) : null}

              {clientState === "checking" ? (
                <UploadStateBanner
                  tone="pending"
                  title="Checking upload"
                  message="We’re validating the file and calculating pricing now. The action buttons stay disabled until the pre-flight response comes back."
                />
              ) : null}

              {clientState === "free_ready" && !preparedUpload ? (
                <UploadStateBanner
                  tone="success"
                  title="Free upload available"
                  message="This file qualifies for the one-time free tier. You can finalize the upload record now, and the processing pipeline will still remain off for Sprint 2."
                />
              ) : null}

              {clientState === "awaiting_payment" && preflightResult ? (
                <PaymentPendingBanner
                  price={preflightResult.price}
                  currency={preflightResult.currency}
                />
              ) : null}

              {clientState === "blocked" && errorMessage ? (
                <UploadStateBanner
                  tone="warning"
                  title="Upload blocked"
                  message={errorMessage}
                />
              ) : null}

              {clientState === "error" && errorMessage ? (
                <UploadStateBanner
                  tone="error"
                  title="Something went wrong"
                  message={errorMessage}
                />
              ) : null}

              {preparedUpload ? (
                <UploadStateBanner
                  tone="success"
                  title="Upload prepared"
                  message={`Podcast record ${preparedUpload.podcast_id} is ready with status ${preparedUpload.status}. No AI jobs or Stripe checkout were started from this page.`}
                />
              ) : null}
            </div>

            {preflightResult ? (
              <div className="mt-6 space-y-5">
                <UploadPreflightResultCard result={preflightResult} />

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => void handlePreflightCheck()}
                    disabled={clientState === "checking" || finalizing}
                    className="inline-flex items-center gap-2 rounded-full border border-[#d9e5d3] bg-white px-5 py-3 text-sm font-medium text-[#4f6f52] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Re-check quote
                    <RefreshCw size={16} />
                  </button>

                  {preflightResult.status === "free_ready" ? (
                    <button
                      type="button"
                      onClick={() => void handlePrepareUpload()}
                      disabled={finalizing}
                      className="inline-flex items-center gap-2 rounded-full bg-[#203328] px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(32,51,40,0.18)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {finalizing ? (
                        <>
                          Finalizing
                          <Loader2 size={16} className="animate-spin" />
                        </>
                      ) : (
                        "Finalize free upload"
                      )}
                    </button>
                  ) : null}

                  {preflightResult.status === "awaiting_payment" ? (
                    <button
                      type="button"
                      disabled
                      className="inline-flex items-center gap-2 rounded-full border border-[#ead7b2] bg-[#fffaf0] px-5 py-3 text-sm font-medium text-[#7b6131]"
                    >
                      Payment step comes next
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </section>

          <aside className="space-y-6">
            <section className="rounded-[2rem] border border-[#d9e5d3] bg-white p-6 shadow-[0_20px_50px_rgba(124,150,118,0.08)]">
              <p className="text-xs uppercase tracking-[0.25em] text-[#7c9676]">Pricing rules</p>
              <h2 className="mt-2 text-2xl font-semibold text-[#203328]">Free tier and guardrails</h2>
              <div className="mt-5 space-y-3 text-sm leading-6 text-[#5b6f5f]">
                <div className="rounded-[1.25rem] border border-[#dfead9] bg-[#f7fbf5] p-4">
                  <p className="font-semibold text-[#203328]">0 to 30 minutes</p>
                  <p>One upload is free. Additional files in this band are priced at $1.</p>
                </div>
                <div className="rounded-[1.25rem] border border-[#dfead9] bg-[#f7fbf5] p-4">
                  <p className="font-semibold text-[#203328]">30 to 60 minutes</p>
                  <p>Uploads in this range require a $2 payment before processing.</p>
                </div>
                <div className="rounded-[1.25rem] border border-[#dfead9] bg-[#f7fbf5] p-4">
                  <p className="font-semibold text-[#203328]">60 to 120 minutes</p>
                  <p>Uploads in this range require a $4 payment before processing.</p>
                </div>
                <div className="rounded-[1.25rem] border border-[#f0d3d3] bg-[#fff6f6] p-4 text-[#8f4a4a]">
                  <p className="font-semibold">Over 120 minutes</p>
                  <p>The file is blocked during pre-flight and cannot continue.</p>
                </div>
              </div>
            </section>

            <section className="rounded-[2rem] border border-[#d9e5d3] bg-[#d7e8d2] p-6">
              <p className="text-xs uppercase tracking-[0.25em] text-[#5e7a61]">Sprint 2 boundary</p>
              <h2 className="mt-2 text-2xl font-semibold text-[#203328]">What this page does not trigger</h2>
              <p className="mt-3 text-sm leading-6 text-[#4f6f52]">
                Pre-flight only verifies eligibility and can create the guarded upload record for a
                free file. Stripe checkout, transcription, clipping, and AI execution are still
                intentionally outside this screen.
              </p>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
