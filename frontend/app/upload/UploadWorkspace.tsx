"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  CreditCard,
  FileVideo2,
  Link2,
  Loader2,
  Monitor,
  Moon,
  Play,
  RefreshCcw,
  ShieldCheck,
  Smartphone,
  SunMedium,
  UploadCloud,
  XCircle,
  Zap,
} from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import {
  analyzePodcast,
  importYouTubePodcast,
    createCheckoutSession,
  type AudioEnhancementSettings,
  type ExportMode,
  type ExportSettings,
  type GenerationSettings,
  type PrepareUploadResponse,
  type SubtitleStyle,
  type UploadPriceResponse,
  type UploadState,
  type YouTubeImportResponse,
  shouldUseMockUploadFlow,
} from "@/lib/api";
import { getAudioEnhancementFeedback } from "@/lib/audio-enhancement";
import {
  buildDefaultGenerationSettings,
  describeGenerationSettings,
  loadSavedGenerationPreferences,
} from "@/lib/generation-settings";
import {
  SUBTITLE_PRESET_DETAILS,
  buildSubtitleStyleFromPreset,
  formatSubtitlePosition,
  hasSubtitleManualOverrides,
} from "@/lib/subtitle-style";
import { getStudioTheme, THEME_STORAGE_KEY } from "@/lib/brand";

const ACCEPTED_TYPES = ["video/mp4", "video/quicktime", "video/webm", "video/x-m4v"];
const ACCEPTED_EXT = [".mp4", ".mov", ".webm", ".m4v"];
const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
]);

const DEFAULT_AUDIO_ENHANCEMENT: AudioEnhancementSettings = {
  enabled: true,
  normalize_loudness: true,
  target_lufs: -16,
  true_peak_db: -1.5,
  status: "enabled",
};

const EXPORT_MODE_DETAILS: Record<
  ExportMode,
  {
    label: string;
    title: string;
    aspect: string;
    helper: string;
    platform: string;
    icon: typeof Smartphone;
  }
> = {
  portrait: {
    label: "Portrait",
    title: "Vertical social export",
    aspect: "9:16",
    helper: "Optimized for TikTok, Shorts, and Reels with speaker-aware reframing.",
    platform: "TikTok / Shorts",
    icon: Smartphone,
  },
  landscape: {
    label: "Landscape",
    title: "Wide video export",
    aspect: "16:9",
    helper: "Keeps the original widescreen framing for YouTube, web, and desktop playback.",
    platform: "YouTube / Web",
    icon: Monitor,
  },
};

type SocialPlatformId =
  | "tiktok"
  | "instagram_reels"
  | "youtube_shorts"
  | "youtube"
  | "facebook"
  | "linkedin";

const SOCIAL_PLATFORM_OPTIONS: Array<{
  id: SocialPlatformId;
  label: string;
  title: string;
  detail: string;
  exportMode: ExportMode;
}> = [
  {
    id: "tiktok",
    label: "TikTok",
    title: "Short-form vertical",
    detail: "Optimized for full-screen hooks and mobile-first watching.",
    exportMode: "portrait",
  },
  {
    id: "instagram_reels",
    label: "Instagram Reels",
    title: "Reels-ready framing",
    detail: "Best when you want mobile captions and creator-style pacing.",
    exportMode: "portrait",
  },
  {
    id: "youtube_shorts",
    label: "YouTube Shorts",
    title: "Shorts-first export",
    detail: "Keeps framing vertical for YouTube's short-form feed.",
    exportMode: "portrait",
  },
  {
    id: "youtube",
    label: "YouTube",
    title: "Classic wide video",
    detail: "Use widescreen framing for full episodes, explainers, or long-form clips.",
    exportMode: "landscape",
  },
  {
    id: "facebook",
    label: "Facebook",
    title: "Flexible social delivery",
    detail: "Good for wider feed playback and cross-posted video content.",
    exportMode: "landscape",
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    title: "Professional social share",
    detail: "Better suited for widescreen educational and talking-head posts.",
    exportMode: "landscape",
  },
];

export type UploadSourceMode = "file" | "youtube";

function buildExportSettings(
  exportMode: ExportMode,
  subtitleStyle: SubtitleStyle,
  generationSettings?: GenerationSettings,
): ExportSettings {
  if (exportMode === "portrait") {
    return {
      export_mode: "portrait",
      crop_mode: "smart_crop",
      mobile_optimized: true,
      face_tracking_enabled: true,
      subtitle_style: subtitleStyle,
      generation_settings: generationSettings,
      audio_enhancement: DEFAULT_AUDIO_ENHANCEMENT,
    };
  }

  return {
    export_mode: "landscape",
    crop_mode: "none",
    mobile_optimized: false,
    face_tracking_enabled: false,
    subtitle_style: subtitleStyle,
    generation_settings: generationSettings,
    audio_enhancement: DEFAULT_AUDIO_ENHANCEMENT,
  };
}

function fmtBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

function ext(name: string): string {
  const dotIndex = name.lastIndexOf(".");
  return dotIndex === -1 ? "" : name.slice(dotIndex).toLowerCase();
}

function titleFrom(name: string): string {
  return (
    name
      .replace(/\.[^.]+$/, "")
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80) || "New upload"
  );
}

function shortName(name: string, max = 48): string {
  return name.length <= max ? name : `${name.slice(0, max - 3).trim()}...`;
}

async function getDuration(file: File): Promise<number> {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<number>((resolve, reject) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => resolve(video.duration);
      video.onerror = () => reject(new Error("Could not read duration. Try another file."));
      video.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function validateFile(file: File): string | null {
  const extension = ext(file.name);
  const mimeType = file.type.toLowerCase();
  if (!ACCEPTED_TYPES.includes(mimeType) && !ACCEPTED_EXT.includes(extension)) {
    return "Unsupported format. Please use MP4, MOV, WebM, or M4V.";
  }
  return null;
}

type NormalizedYouTubeUrl =
  | {
      normalizedUrl: string;
      videoId: string;
      hadPlaylistContext: boolean;
    }
  | {
      error: string;
    };

function normalizeYouTubeImportUrl(url: string): NormalizedYouTubeUrl {
  const cleanedUrl = url.trim();
  if (!cleanedUrl) {
    return { error: "Paste a YouTube video URL to continue." };
  }

  let parsed: URL;
  try {
    parsed = new URL(cleanedUrl);
  } catch {
    return { error: "Enter a valid YouTube URL." };
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return { error: "Only http or https YouTube URLs are supported." };
  }

  const host = parsed.hostname.toLowerCase();
  if (!YOUTUBE_HOSTS.has(host)) {
    return { error: "Only youtube.com or youtu.be links are supported." };
  }

  const pathParts = parsed.pathname.split("/").filter(Boolean);
  let videoId = "";
  if (host === "youtu.be") {
    videoId = pathParts[0] ?? "";
  } else if (pathParts[0] === "watch") {
    videoId = parsed.searchParams.get("v") ?? "";
  } else if (["shorts", "embed", "live"].includes(pathParts[0] ?? "")) {
    videoId = pathParts[1] ?? "";
  }

  if (!YOUTUBE_VIDEO_ID_PATTERN.test(videoId)) {
    if (parsed.searchParams.has("list")) {
      return {
        error: "This looks like a playlist link. Open one video from the playlist and paste that video URL instead.",
      };
    }
    return { error: "A valid single-video YouTube URL is required." };
  }

  return {
    normalizedUrl: `https://www.youtube.com/watch?v=${videoId}`,
    videoId,
    hadPlaylistContext: parsed.searchParams.has("list"),
  };
}

function formatDurationLabel(durationSeconds: number): string {
  const minutes = durationSeconds / 60;
  return `${minutes >= 10 ? minutes.toFixed(0) : minutes.toFixed(1)} min`;
}

type UploadWorkspaceProps = {
  initialSourceMode: UploadSourceMode;
  alternateHref?: string;
};

export default function UploadWorkspace({
  initialSourceMode,
  alternateHref,
}: UploadWorkspaceProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { backendToken, loading: authLoading, syncBackendSession } = useAuth();

  const [dark, setDark] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(1280);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
      setDark(saved === "dark");
    } catch {}
  }, []);
  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  const sourceMode = initialSourceMode;
  const [exportMode, setExportMode] = useState<ExportMode>("portrait");
  const [socialPlatform, setSocialPlatform] = useState<SocialPlatformId>("tiktok");
  const [subtitleStyle] = useState<SubtitleStyle>(() => buildSubtitleStyleFromPreset("classic"));
  const [generationSettings, setGenerationSettings] = useState<GenerationSettings>(() =>
    buildDefaultGenerationSettings(),
  );
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<UploadState>("idle");
  const [err, setErr] = useState("");
  const [result, setResult] = useState<UploadPriceResponse | null>(null);
  const [prep, setPrep] = useState<PrepareUploadResponse | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [uploadReference, setUploadReference] = useState<string | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [youtubeTitle, setYoutubeTitle] = useState("");
  const [youtubeImport, setYoutubeImport] = useState<YouTubeImportResponse | null>(null);
  const [youtubeSubmitting, setYoutubeSubmitting] = useState(false);
  const [youtubeAnalyzing, setYoutubeAnalyzing] = useState(false);

  const d = dark;
  const theme = getStudioTheme(d);
  const bg = theme.bg;
  const card = theme.card;
  const border = theme.border;
  const subBorder = theme.borderSub;
  const muted = theme.textSub;
  const text = theme.text;
  const hi = theme.accent;
  const hi2 = theme.accentLt;
  const isMobile = viewportWidth < 760;
  const isTablet = viewportWidth < 1080;

  const exportDetails = EXPORT_MODE_DETAILS[exportMode];
  const socialPlatformDetails =
    SOCIAL_PLATFORM_OPTIONS.find((option) => option.id === socialPlatform) ??
    SOCIAL_PLATFORM_OPTIONS[0];
  const exportSettings = useMemo(
    () => buildExportSettings(exportMode, subtitleStyle, generationSettings),
    [exportMode, generationSettings, subtitleStyle],
  );
  const activeSubtitlePreset = SUBTITLE_PRESET_DETAILS[subtitleStyle.preset];
  const subtitleHasManualOverrides = hasSubtitleManualOverrides(subtitleStyle);
  const subtitleStyleLabel = subtitleHasManualOverrides
    ? `${activeSubtitlePreset.label} + custom`
    : activeSubtitlePreset.label;
  const subtitleStyleSummary = `${formatSubtitlePosition(subtitleStyle.position)} aligned | ${subtitleStyle.font_size}px | ${subtitleStyle.primary_color.toUpperCase()}`;
  const generationSummary = describeGenerationSettings(generationSettings);
  const selectedAudioFeedback = getAudioEnhancementFeedback({
    audioEnhancement: exportSettings.audio_enhancement,
    context: "setup",
  });

  useEffect(() => {
    const savedPreferences = loadSavedGenerationPreferences();
    setGenerationSettings(savedPreferences.settings);
  }, []);

  const fileMeta = useMemo(() => {
    if (!file) return null;
    return {
      name: file.name,
      short: shortName(file.name),
      size: fmtBytes(file.size),
      type: file.type || ext(file.name).replace(".", "").toUpperCase() || "Video",
    };
  }, [file]);

  const youtubeChannel =
    typeof youtubeImport?.metadata.channel === "string" ? youtubeImport.metadata.channel : null;
  const youtubeNeedsPayment = Boolean(youtubeImport?.checkout_required || youtubeImport?.status === "awaiting_payment");
  const youtubeReadyForProcessing = Boolean(youtubeImport?.storage_ready && !youtubeNeedsPayment);
  const normalizedYouTubeCandidate = useMemo(() => {
    if (!youtubeUrl.trim()) return null;
    const normalized = normalizeYouTubeImportUrl(youtubeUrl);
    return "error" in normalized ? null : normalized;
  }, [youtubeUrl]);
  const wizardSteps = [
    {
      title: "Source",
      detail: sourceMode === "file" ? "Choose the video file." : "Paste the video link.",
      complete: sourceMode === "file" ? Boolean(fileMeta) : Boolean(normalizedYouTubeCandidate || youtubeImport),
    },
    {
      title: "Platform",
      detail: `${socialPlatformDetails.label} / ${exportDetails.aspect}`,
      complete: true,
    },
    {
      title: "Defaults",
      detail: `${subtitleStyleLabel} / ${generationSettings.number_of_clips} clips`,
      complete: true,
    },
    {
      title: "Review",
      detail: sourceMode === "file" ? "Pre-flight and reserve." : "Import and continue.",
      complete: sourceMode === "file" ? Boolean(result || prep) : Boolean(youtubeImport),
    },
  ];

  const runServerPreflight = async (
    selectedFile: File,
    token: string | null,
    mock: boolean,
  ) => {
    if (mock) {
      const duration = await getDuration(selectedFile);
      const formData = new FormData();
      formData.set("file", selectedFile);
      formData.set("filename", selectedFile.name);
      if (selectedFile.type) formData.set("mime_type", selectedFile.type);
      formData.set("detected_duration_seconds", String(duration));
      formData.set("mock", "true");

      const response = await fetch("/api/upload/preflight", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof payload.detail === "string" ? payload.detail : "Unable to inspect file.");
      }

      const typed = payload as UploadPriceResponse & { upload_reference?: string };
      if (!typed.upload_reference) {
        throw new Error("Upload staging failed. No upload reference was returned.");
      }
      setUploadReference(typed.upload_reference);
      return typed as UploadPriceResponse;
    }

    // REAL MODE: Upload directly to Render backend
    const backendUrl =
      process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, "") ?? "http://localhost:8000";

    const uploadFormData = new FormData();
    uploadFormData.append("file", selectedFile);

    const uploadResponse = await fetch(`${backendUrl}/upload/file`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: uploadFormData,
    });

    if (!uploadResponse.ok) {
      const errorPayload = await uploadResponse.json().catch(() => ({}));
      throw new Error(
        typeof errorPayload.detail === "string"
          ? errorPayload.detail
          : "Failed to upload file to backend."
      );
    }

    const uploadData = (await uploadResponse.json()) as {
      storage_path: string;
      filesize_bytes: number;
    };

    const priceResponse = await fetch(`${backendUrl}/upload/calculate-price`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        filename: selectedFile.name,
        filesize_bytes: uploadData.filesize_bytes,
        mime_type: selectedFile.type || undefined,
        storage_path: uploadData.storage_path,
      }),
    });

    if (!priceResponse.ok) {
      const errorPayload = await priceResponse.json().catch(() => ({}));
      throw new Error(
        typeof errorPayload.detail === "string"
          ? errorPayload.detail
          : "Failed to calculate upload price."
      );
    }

    const priceData = (await priceResponse.json()) as UploadPriceResponse;
    setUploadReference(uploadData.storage_path);
    return priceData;
  };

  const runServerPrepare = async (
    selectedFile: File,
    quote: UploadPriceResponse,
    token: string | null,
    mock: boolean,
  ) => {
    if (!uploadReference) {
      throw new Error("Upload staging is missing. Please run the pre-flight check again.");
    }

    if (mock) {
      const response = await fetch("/api/upload/prepare", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          title: titleFrom(selectedFile.name),
          filename: selectedFile.name,
          filesize_bytes: selectedFile.size,
          mime_type: selectedFile.type || undefined,
          duration_seconds: quote.duration_seconds,
          price: quote.price,
          status: quote.status,
          upload_reference: uploadReference,
          mock,
          export_settings: exportSettings,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof payload.detail === "string" ? payload.detail : "Unable to create record.");
      }
      return payload as PrepareUploadResponse;
    }

    // REAL MODE: Call prepare directly on backend
    const backendUrl =
      process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, "") ?? "http://localhost:8000";

    const response = await fetch(`${backendUrl}/upload/prepare`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        title: titleFrom(selectedFile.name),
        filename: selectedFile.name,
        filesize_bytes: selectedFile.size,
        mime_type: selectedFile.type || undefined,
        duration_seconds: quote.duration_seconds,
        price: quote.price,
        status: quote.status,
        storage_path: uploadReference,
        export_settings: exportSettings,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(typeof payload.detail === "string" ? payload.detail : "Unable to create record.");
    }
    return payload as PrepareUploadResponse;
  };

  const runPreflight = async (override?: File) => {
    const selectedFile = override ?? file;
    if (!selectedFile) {
      setState("error");
      setErr("Please select a file first.");
      return;
    }

    const validationError = validateFile(selectedFile);
    if (validationError) {
      setState("error");
      setErr(validationError);
      return;
    }

    setState("checking");
    setErr("");
    setResult(null);
    setPrep(null);
    setUploadReference(null);

    try {
      const mock = shouldUseMockUploadFlow();
      const token = backendToken ?? (await syncBackendSession());
      if (!token && !mock) {
        router.replace("/login");
        return;
      }

      const response = await runServerPreflight(selectedFile, token, mock);
      setResult(response);
      setState(response.status);
    } catch (error) {
      setResult(null);
      setPrep(null);
      setUploadReference(null);
      setState("error");
      setErr(error instanceof Error ? error.message : "Unable to inspect file.");
    }
  };

  const pickFile = (selectedFile: File | null) => {
    setFile(selectedFile);
    setPrep(null);
    setResult(null);
    setErr("");
    setUploadReference(null);
    if (!selectedFile) {
      setState("idle");
      return;
    }

    const validationError = validateFile(selectedFile);
    if (validationError) {
      setState("error");
      setErr(validationError);
      return;
    }

    setState("file_selected");
    void runPreflight(selectedFile);
  };

  const selectExportMode = (mode: ExportMode) => {
    setExportMode(mode);
    setPrep(null);
    setYoutubeImport(null);
    setErr("");
  };

  const selectSocialPlatform = (platformId: SocialPlatformId) => {
    const selected =
      SOCIAL_PLATFORM_OPTIONS.find((option) => option.id === platformId) ??
      SOCIAL_PLATFORM_OPTIONS[0];
    setSocialPlatform(selected.id);
    setExportMode(selected.exportMode);
    setPrep(null);
    setYoutubeImport(null);
    setErr("");
  };

  const reserveRecord = async () => {
    if (!file || !result) return;

    setPreparing(true);
    setErr("");
    try {
      const mock = shouldUseMockUploadFlow();
      const token = backendToken ?? (await syncBackendSession());
      if (!token && !mock) {
        router.replace("/login");
        return;
      }
      setPrep(await runServerPrepare(file, result, token, mock));
    } catch (error) {
      setPrep(null);
      setState("error");
      setErr(error instanceof Error ? error.message : "Unable to create record.");
    } finally {
      setPreparing(false);
    }
  };

  const handleStartCheckout = async (podcastId: string, amount: number) => {
    setErr("");
    try {
      const token = backendToken ?? (await syncBackendSession());
      if (!token) {
        router.replace("/login");
        return;
      }
      const resp = await createCheckoutSession(podcastId, amount, token);
      if (resp?.checkout_url) {
        window.location.href = resp.checkout_url;
      } else {
        setErr("Unable to start checkout.");
      }
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Unable to start checkout.");
    }
  };

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const payment = params.get("payment");
      const podcastId = params.get("podcast_id");
      if (payment === "success" && podcastId) {
        (async () => {
          setErr("");
          try {
            const token = backendToken ?? (await syncBackendSession());
            if (!token) return;
            await analyzePodcast(podcastId, {}, token);
            router.push(`/clips?podcastId=${encodeURIComponent(podcastId)}`);
          } catch (err) {
            setErr(err instanceof Error ? err.message : "Payment succeeded but processing failed.");
          }
        })();
      }
    } catch {}
  }, [backendToken, router, syncBackendSession]);

  const submitYouTubeImport = async () => {
    const normalizedImport = normalizeYouTubeImportUrl(youtubeUrl);
    if ("error" in normalizedImport) {
      setErr(normalizedImport.error);
      return;
    }

    setYoutubeSubmitting(true);
    setErr("");

    try {
      const mock = shouldUseMockUploadFlow();
      const token = backendToken ?? (await syncBackendSession());
      if (!token && !mock) {
        router.replace("/login");
        return;
      }

      const response = await importYouTubePodcast(
        {
          url: normalizedImport.normalizedUrl,
          title: youtubeTitle.trim() || undefined,
          export_settings: exportSettings,
        },
        { token, useMock: mock },
      );
      setYoutubeUrl(normalizedImport.normalizedUrl);
      setYoutubeImport(response);
    } catch (error) {
      setYoutubeImport(null);
      setErr(error instanceof Error ? error.message : "Unable to import this YouTube video.");
    } finally {
      setYoutubeSubmitting(false);
    }
  };

  const analyzeImportedPodcast = async () => {
    if (!youtubeImport) return;
    if (!youtubeReadyForProcessing) {
      setErr("Payment is required before this YouTube import can be analyzed or used to generate clips.");
      return;
    }

    setYoutubeAnalyzing(true);
    setErr("");
    try {
      const mock = shouldUseMockUploadFlow();
      const token = backendToken ?? (await syncBackendSession());
      if (!token && !mock) {
        router.replace("/login");
        return;
      }
      await analyzePodcast(youtubeImport.podcast_id, {}, token);
      router.push(`/clips?podcastId=${youtubeImport.podcast_id}`);
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Unable to analyze the imported video yet.");
    } finally {
      setYoutubeAnalyzing(false);
    }
  };

  const stateLabel: Record<string, string> = {
    idle: "Waiting",
    file_selected: "File selected",
    checking: "Checking...",
    free_ready: "Ready",
    awaiting_payment: "Payment needed",
    blocked: "Blocked",
    error: "Error",
  };

  const stateAccent: Record<string, string> = {
    checking: hi,
    free_ready: "#3a9e38",
    awaiting_payment: "#9e8a20",
    blocked: "#9e2020",
    error: "#9e2020",
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Serif+Display:ital@0;1&display=swap');
        * { box-sizing: border-box; }
        @keyframes floatOrb { 0%,100%{transform:translate(0,0)} 50%{transform:translate(24px,-18px)} }
        @keyframes slideUp { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:translateY(0)} }
        @keyframes shimmer { 0%{background-position:-250% center} 100%{background-position:250% center} }
        @keyframes spin { to{transform:rotate(360deg)} }
        .orbA { animation: floatOrb 16s ease-in-out infinite; }
        .orbB { animation: floatOrb 22s -4s ease-in-out infinite; }
        .slide-up { animation: slideUp .52s cubic-bezier(.22,1,.36,1) both; }
        .shimmer-text {
          background: linear-gradient(90deg, currentColor 0%, ${hi} 35%, ${hi2} 55%, currentColor 100%);
          background-size: 240% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: shimmer 4s linear infinite;
        }
      `}</style>

      <div
        style={{
          minHeight: "100vh",
          background: bg,
          color: text,
          fontFamily: "'DM Sans', sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }}>
          <div
            className="orbA"
            style={{
              position: "absolute",
              top: -120,
              right: -90,
              width: 440,
              height: 440,
              borderRadius: "50%",
              background: d ? "rgba(24,68,14,.52)" : "rgba(190,232,162,.34)",
              filter: "blur(88px)",
            }}
          />
          <div
            className="orbB"
            style={{
              position: "absolute",
              bottom: -120,
              left: -80,
              width: 420,
              height: 420,
              borderRadius: "50%",
              background: d ? "rgba(15,52,8,.46)" : "rgba(210,245,182,.32)",
              filter: "blur(84px)",
            }}
          />
        </div>

        <div
          style={{
            position: "relative",
            zIndex: 1,
            maxWidth: 1220,
            margin: "0 auto",
            padding: isMobile ? "20px 14px 44px" : isTablet ? "24px 18px 56px" : "28px 22px 64px",
          }}
        >
          <div
            className="slide-up"
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 22, flexWrap: "wrap" }}
          >
            <Link
              href="/dashboard"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                border: `1px solid ${border}`,
                borderRadius: 999,
                padding: "10px 16px",
                background: card,
                color: muted,
                fontSize: 13,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              <ArrowLeft size={14} />
              Dashboard
            </Link>

            <button
              type="button"
              onClick={() =>
                setDark((value) => {
                  const next = !value;
                  try {
                    window.localStorage.setItem(THEME_STORAGE_KEY, next ? "dark" : "light");
                  } catch {}
                  return next;
                })
              }
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                border: `1px solid ${border}`,
                borderRadius: 999,
                padding: "10px 14px",
                background: card,
                color: muted,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {d ? <SunMedium size={14} /> : <Moon size={14} />}
              {d ? "Light mode" : "Dark mode"}
            </button>
          </div>

          <section
            className="slide-up ic-premium-card"
            style={{
              borderRadius: 20,
              border: `1px solid ${border}`,
              background: card,
              padding: isMobile ? "20px 16px" : "26px 24px",
              marginBottom: 16,
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isTablet ? "1fr" : "minmax(0, 1.25fr) minmax(280px, .75fr)",
                gap: 18,
              }}
            >
              <div>
                <div
                  style={{
                    width: 54,
                    height: 54,
                    borderRadius: 16,
                    marginBottom: 18,
                    background: d ? "rgba(90,158,58,.14)" : "rgba(90,158,58,.09)",
                    border: `1px solid ${subBorder}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {sourceMode === "file" ? <UploadCloud size={24} color={hi} /> : <Link2 size={24} color={hi} />}
                </div>
                <div style={{ fontSize: 10, letterSpacing: ".24em", textTransform: "uppercase", color: hi2, fontWeight: 700, marginBottom: 12 }}>
                  {sourceMode === "file" ? "Pre-flight check" : "YouTube import"}
                </div>
                <h1
                  style={{
                    margin: 0,
                    fontFamily: "'DM Serif Display', serif",
                    fontSize: "clamp(30px, 4vw, 42px)",
                    lineHeight: 1.04,
                    letterSpacing: "0",
                  }}
                >
                  {sourceMode === "file" ? (
                    <>
                      Check before <span className="shimmer-text">you upload.</span>
                    </>
                  ) : (
                    <>
                      Import without <span className="shimmer-text">uploading a file.</span>
                    </>
                  )}
                </h1>
                <p style={{ marginTop: 14, fontSize: 14, lineHeight: 1.75, color: muted }}>
                  {sourceMode === "file"
                    ? "Select a video, see duration and pricing clearly, then confirm when you are ready."
                    : "Paste one public YouTube video and keep the same clip settings used for file uploads."}
                </p>
              </div>

              <div
                style={{
                  borderRadius: 20,
                  border: `1px solid ${subBorder}`,
                  background: d ? "rgba(10,20,8,.68)" : "rgba(241,250,235,.9)",
                  padding: "18px 18px 16px",
                  display: "grid",
                  gap: 10,
                }}
              >
                <div style={{ fontSize: 10, letterSpacing: ".24em", textTransform: "uppercase", color: hi2, fontWeight: 700 }}>
                  {sourceMode === "file" ? "Pricing tiers" : "Import flow"}
                </div>
                {sourceMode === "file" ? (
                  <>
                    {[
                      { label: "0 - 30 min", value: "Free *", dot: "#5a9e3a" },
                      { label: "30 - 60 min", value: "$2.00", dot: "#8ab55c" },
                      { label: "60 - 120 min", value: "$4.00", dot: "#d4a83a" },
                      { label: "120+ min", value: "Blocked", dot: "#e07070" },
                    ].map((item) => (
                      <div key={item.label} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13 }}>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, color: muted }}>
                          <span style={{ width: 7, height: 7, borderRadius: "50%", background: item.dot, flexShrink: 0 }} />
                          {item.label}
                        </div>
                        <strong style={{ color: text }}>{item.value}</strong>
                      </div>
                    ))}
                    <div style={{ paddingTop: 10, borderTop: `1px solid ${subBorder}`, fontSize: 11, color: muted }}>
                      * First upload only
                    </div>
                  </>
                ) : (
                  <>
                    {[
                      "Paste a public video URL.",
                      "Save the same export profile used for clips.",
                      "Open the imported episode and continue to analysis.",
                    ].map((step) => (
                      <div
                        key={step}
                        style={{
                          borderRadius: 12,
                          border: `1px solid ${subBorder}`,
                          background: d ? "rgba(90,158,58,.08)" : "rgba(90,158,58,.05)",
                          padding: "11px 12px",
                          fontSize: 12,
                          lineHeight: 1.55,
                          color: muted,
                        }}
                      >
                        {step}
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          </section>

          <div
            className="slide-up ic-premium-card"
            style={{
              borderRadius: 18,
              border: `1px solid ${d ? "rgba(155,115,25,.35)" : "rgba(215,188,100,.55)"}`,
              background: d ? "rgba(44,30,4,.78)" : "rgba(255,252,218,.9)",
              padding: "13px 16px",
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              color: d ? "#d4a83a" : "#6d5010",
              fontSize: 13,
              marginBottom: 16,
            }}
          >
            <AlertTriangle size={15} style={{ marginTop: 1, flexShrink: 0 }} />
            <span>
              {sourceMode === "file" ? (
                <>
                  <strong>120-minute limit.</strong> Videos over this length are blocked automatically during pre-flight.
                </>
              ) : (
                <>
                  <strong>Single-video links only.</strong> Playlists, bulk channel imports, and private videos are outside this sprint.
                </>
              )}
            </span>
          </div>

          <section
            className="slide-up ic-premium-card"
            style={{
              borderRadius: 20,
              border: `1px solid ${border}`,
              background: d ? "rgba(255,255,255,.035)" : "rgba(255,255,255,.76)",
              padding: "16px",
              marginBottom: 16,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
              <div>
                <div className="ic-step-kicker" style={{ borderColor: subBorder, background: d ? "rgba(90,158,58,.1)" : "rgba(90,158,58,.08)", color: hi }}>
                  Upload wizard
                </div>
                <div style={{ marginTop: 10, fontFamily: "'DM Serif Display',serif", fontSize: 22, lineHeight: 1.1, color: text }}>
                  One guided flow from source to review.
                </div>
              </div>
              <div style={{ color: muted, fontSize: 12, lineHeight: 1.6, maxWidth: 360 }}>
                Complete the visible steps in order. The controls are the same, but the path is easier to scan.
              </div>
            </div>

            <div className="ic-wizard-rail ic-mobile-scroll">
              {wizardSteps.map((step, index) => (
                <div
                  key={step.title}
                  className="ic-wizard-item"
                  style={{
                    borderColor: step.complete ? hi : subBorder,
                    background: step.complete
                      ? d
                        ? "rgba(90,158,58,.11)"
                        : "rgba(90,158,58,.07)"
                      : d
                        ? "rgba(10,18,8,.48)"
                        : "rgba(255,255,255,.68)",
                  }}
                >
                  <span className="ic-wizard-index" style={{ background: step.complete ? hi : d ? "rgba(255,255,255,.08)" : "rgba(20,34,16,.08)", color: step.complete ? "#fff" : hi }}>
                    {index + 1}
                  </span>
                  <div className="ic-wizard-title" style={{ color: text }}>{step.title}</div>
                  <div className="ic-wizard-copy" style={{ color: muted, opacity: 1 }}>{step.detail}</div>
                  <div
                    className="ic-wizard-status"
                    style={{
                      background: step.complete ? (d ? "rgba(90,158,58,.18)" : "rgba(90,158,58,.1)") : "transparent",
                      border: `1px solid ${step.complete ? hi : subBorder}`,
                      color: step.complete ? hi : muted,
                    }}
                  >
                    {step.complete ? "Ready" : "Next"}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section
            className="slide-up ic-premium-card"
            style={{
              borderRadius: 18,
              border: `1px solid ${border}`,
              background: card,
              padding: "16px 18px",
              marginBottom: 16,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              <div>
                <div className="ic-step-kicker" style={{ borderColor: subBorder, background: d ? "rgba(90,158,58,.1)" : "rgba(90,158,58,.08)", color: hi, marginBottom: 8 }}>
                  Step 01 / Source
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: text, marginBottom: 4 }}>
                  {sourceMode === "file" ? "File upload workspace" : "YouTube import workspace"}
                </div>
                <div style={{ fontSize: 13, color: muted, lineHeight: 1.6 }}>
                  {sourceMode === "file"
                    ? "Choose a file, run pre-flight, then continue."
                    : "Paste one public YouTube link and import it."}
                </div>
              </div>
              {alternateHref ? (
                <Link
                  href={alternateHref}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    borderRadius: 999,
                    border: `1px solid ${border}`,
                    background: d ? "rgba(90,158,58,.08)" : "rgba(90,158,58,.05)",
                    color: text,
                    padding: "10px 14px",
                    fontSize: 13,
                    fontWeight: 600,
                    textDecoration: "none",
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                >
                  {sourceMode === "file" ? <Link2 size={14} /> : <FileVideo2 size={14} />}
                  {sourceMode === "file" ? "Open YouTube import page" : "Go to file upload"}
                </Link>
              ) : null}
            </div>
          </section>

          <section
            className="slide-up ic-premium-card"
            style={{
              borderRadius: 20,
              border: `1px solid ${border}`,
              background: card,
              padding: isMobile ? "18px 16px" : "22px",
              marginBottom: 16,
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isTablet ? "1fr" : "minmax(0,1.08fr) minmax(300px,.92fr)",
                gap: 18,
                alignItems: "start",
              }}
            >
              <div>
                <div className="ic-step-kicker" style={{ borderColor: subBorder, background: d ? "rgba(90,158,58,.1)" : "rgba(90,158,58,.08)", color: hi, marginBottom: 10 }}>
                  Step 02 / Platform
                </div>
                <h2 style={{ margin: 0, fontFamily: "'DM Serif Display', serif", fontStyle: "italic", fontSize: 26, fontWeight: 400 }}>
                  Choose where the clip should publish first
                </h2>
                <p style={{ fontSize: 13, color: muted, lineHeight: 1.72, margin: "12px 0 16px" }}>
                  Keep this step light: choose the destination, set the framing, then continue to upload. Fine-tuning happens later in Clips.
                </p>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: isMobile
                      ? "1fr"
                      : isTablet
                        ? "repeat(2,minmax(0,1fr))"
                        : "repeat(3,minmax(0,1fr))",
                    gap: 10,
                    marginBottom: 18,
                  }}
                >
                  {SOCIAL_PLATFORM_OPTIONS.map((option) => {
                    const active = socialPlatform === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => selectSocialPlatform(option.id)}
                        className="ic-premium-card"
                        style={{
                          textAlign: "left",
                          borderRadius: 18,
                          padding: "15px 15px 14px",
                          border: `1px solid ${active ? hi : subBorder}`,
                          background: active
                            ? d
                              ? "rgba(90,158,58,.16)"
                              : "rgba(90,158,58,.1)"
                            : d
                              ? "rgba(11,18,9,.52)"
                              : "rgba(248,252,245,.82)",
                          color: text,
                          cursor: "pointer",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 9 }}>
                          <div style={{ fontSize: 15, fontWeight: 700 }}>{option.label}</div>
                          <div
                            style={{
                              borderRadius: 999,
                              border: `1px solid ${active ? "rgba(255,255,255,.22)" : subBorder}`,
                              padding: "4px 8px",
                              fontSize: 9,
                              fontWeight: 700,
                              color: active ? "#dff0d8" : hi2,
                              letterSpacing: ".12em",
                              textTransform: "uppercase",
                            }}
                          >
                            {option.exportMode === "portrait" ? "9:16" : "16:9"}
                          </div>
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: active ? (d ? "#dff0d8" : hi) : hi2, marginBottom: 6 }}>
                          {option.title}
                        </div>
                        <div style={{ fontSize: 12, color: active ? (d ? "rgba(232,245,223,.82)" : "rgba(21,36,18,.8)") : muted, lineHeight: 1.6 }}>
                          {option.detail}
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div style={{ fontSize: 10, letterSpacing: ".26em", textTransform: "uppercase", color: hi2, fontWeight: 700, marginBottom: 8 }}>
                  Export mode
                </div>
                <h2 style={{ margin: 0, fontFamily: "'DM Serif Display', serif", fontStyle: "italic", fontSize: 26, fontWeight: 400 }}>
                  Choose how your clips should be framed
                </h2>
                <p style={{ fontSize: 13, color: muted, lineHeight: 1.72, margin: "12px 0 16px" }}>
                  Portrait is tuned for TikTok and YouTube Shorts. Landscape keeps the classic widescreen layout.
                </p>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: isMobile ? "1fr" : "repeat(2,minmax(0,1fr))",
                    gap: 10,
                  }}
                >
                  {(["portrait", "landscape"] as ExportMode[]).map((mode) => {
                    const details = EXPORT_MODE_DETAILS[mode];
                    const Icon = details.icon;
                    const active = exportMode === mode;
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => selectExportMode(mode)}
                        className="ic-premium-card"
                        style={{
                          textAlign: "left",
                          borderRadius: 18,
                          padding: "16px",
                          border: `1px solid ${active ? hi : subBorder}`,
                          background: active
                            ? d
                              ? "rgba(90,158,58,.16)"
                              : "rgba(90,158,58,.1)"
                            : d
                              ? "rgba(11,18,9,.52)"
                              : "rgba(248,252,245,.82)",
                          color: text,
                          cursor: "pointer",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 10 }}>
                          <div
                            style={{
                              width: 38,
                              height: 38,
                              borderRadius: 12,
                              background: active ? "rgba(255,255,255,.14)" : d ? "rgba(90,158,58,.11)" : "rgba(90,158,58,.08)",
                              border: `1px solid ${active ? "rgba(255,255,255,.2)" : subBorder}`,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <Icon size={18} color={active ? "#dff0d8" : hi} />
                          </div>
                          <div
                            style={{
                              borderRadius: 999,
                              border: `1px solid ${active ? "rgba(255,255,255,.22)" : subBorder}`,
                              padding: "4px 10px",
                              fontSize: 10,
                              fontWeight: 700,
                              color: active ? "#dff0d8" : hi2,
                            }}
                          >
                            {details.aspect}
                          </div>
                        </div>
                        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{details.label}</div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: active ? text : hi2, marginBottom: 6 }}>{details.title}</div>
                        <div style={{ fontSize: 12, lineHeight: 1.6, color: muted }}>{details.helper}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gap: 14,
                }}
              >
                <div
                  style={{
                    borderRadius: 18,
                    border: `1px solid ${subBorder}`,
                    background: d ? "rgba(11,18,9,.92)" : "rgba(247,252,243,.96)",
                    padding: "18px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 14, alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: 10, letterSpacing: ".22em", textTransform: "uppercase", color: hi2, fontWeight: 700, marginBottom: 5 }}>
                        Selected output
                      </div>
                      <div style={{ fontSize: 20, fontWeight: 700 }}>{exportDetails.label} preview</div>
                    </div>
                    <div
                      style={{
                        borderRadius: 999,
                        border: `1px solid ${subBorder}`,
                        background: d ? "rgba(90,158,58,.12)" : "rgba(90,158,58,.08)",
                        padding: "6px 12px",
                        fontSize: 11,
                        fontWeight: 700,
                        color: hi,
                      }}
                    >
                      {socialPlatformDetails.label}
                    </div>
                  </div>

                  <div
                    style={{
                      minHeight: isMobile ? 150 : 190,
                      borderRadius: 18,
                      border: `1px solid ${subBorder}`,
                      background: d
                        ? "linear-gradient(160deg, rgba(18,35,13,.96), rgba(11,18,9,.92))"
                        : "linear-gradient(160deg, rgba(238,248,231,.96), rgba(248,252,245,.98))",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "20px 16px",
                    }}
                  >
                    <div
                      style={{
                        width: exportMode === "portrait" ? 106 : 190,
                        height: exportMode === "portrait" ? 190 : 106,
                        borderRadius: 20,
                        border: `1px solid ${exportMode === "portrait" ? hi : border}`,
                        background:
                          exportMode === "portrait"
                            ? "linear-gradient(180deg, rgba(90,158,58,.22), rgba(122,181,92,.08))"
                            : "linear-gradient(180deg, rgba(90,158,58,.16), rgba(122,181,92,.06))",
                        boxShadow:
                          exportMode === "portrait"
                            ? "0 18px 42px rgba(90,158,58,.2)"
                            : "0 14px 30px rgba(90,158,58,.12)",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between",
                        padding: "14px 12px",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ width: 36, height: 5, borderRadius: 999, background: hi, opacity: 0.72 }} />
                        <div style={{ fontSize: 9, fontWeight: 700, color: hi2 }}>{exportDetails.aspect}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: text, marginBottom: 4 }}>
                          {exportMode === "portrait" ? "Social-safe framing" : "Original wide framing"}
                        </div>
                        <div style={{ fontSize: 11, lineHeight: 1.55, color: muted }}>
                          {exportMode === "portrait"
                            ? "Focused for vertical feeds and fullscreen phone playback."
                            : "Best when you want the full widescreen composition."}
                        </div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                        {[1, 2].map((item) => (
                          <div
                            key={item}
                            style={{
                              height: exportMode === "portrait" ? 34 : 22,
                              borderRadius: 10,
                              background: d ? "rgba(255,255,255,.08)" : "rgba(255,255,255,.72)",
                              border: `1px solid ${subBorder}`,
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    borderRadius: 18,
                    border: `1px solid ${subBorder}`,
                    background: d ? "rgba(12,22,10,.9)" : "rgba(249,252,246,.96)",
                    padding: "18px",
                  }}
                >
                  <div style={{ fontSize: 10, letterSpacing: ".22em", textTransform: "uppercase", color: hi2, fontWeight: 700, marginBottom: 8 }}>
                    Workflow split
                  </div>
                  <div style={{ fontSize: 21, fontWeight: 700, color: text, marginBottom: 10 }}>
                    Upload stays simple. Clips handles the creative work.
                  </div>
                  <div style={{ display: "grid", gap: 10 }}>
                    {[
                      "Choose the source, target platform, and framing here.",
                      "Open Clips after analysis to tune prompt, subtitles, timing, and final visual feel.",
                      "This keeps the first step fast for every age and every device.",
                    ].map((step) => (
                      <div
                        key={step}
                        style={{
                          borderRadius: 14,
                          border: `1px solid ${subBorder}`,
                          background: d ? "rgba(90,158,58,.08)" : "rgba(90,158,58,.05)",
                          padding: "12px 13px",
                          fontSize: 12,
                          lineHeight: 1.65,
                          color: muted,
                        }}
                      >
                        {step}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section
            className="slide-up ic-premium-card"
            style={{
              borderRadius: 16,
              border: `1px solid ${border}`,
              background: d ? "rgba(255,255,255,.035)" : "rgba(255,255,255,.74)",
              padding: "16px",
              marginBottom: 16,
            }}
          >
            <div className="ic-studio-steps ic-mobile-scroll">
              {[
                ["Source", sourceMode === "file" ? "Choose your video file." : "Paste a public video URL."],
                ["Format", "Pick the social destination."],
                ["Defaults", "Carry captions and generation settings forward."],
                ["Continue", "Open analysis and clips when ready."],
              ].map(([title, copy], index) => (
                <div key={title} className="ic-studio-step" style={{ borderColor: subBorder, background: d ? "rgba(10,18,8,.54)" : "rgba(255,255,255,.72)" }}>
                  <span className="ic-studio-step-index" style={{ background: d ? "rgba(90,158,58,.12)" : "rgba(90,158,58,.08)", color: hi }}>
                    {index + 1}
                  </span>
                  <div className="ic-studio-step-title" style={{ color: text }}>{title}</div>
                  <div className="ic-studio-step-copy" style={{ color: muted, opacity: 1 }}>{copy}</div>
                </div>
              ))}
            </div>
          </section>

          <section
            className="slide-up ic-premium-card"
            style={{
              borderRadius: 22,
              border: `1px solid ${border}`,
              background: card,
              padding: isMobile ? "18px 18px 20px" : "22px 24px 24px",
              marginBottom: 16,
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isTablet ? "1fr" : "minmax(0,.9fr) minmax(0,1.1fr)",
                gap: 16,
                alignItems: "start",
              }}
            >
              <div>
                <div className="ic-step-kicker" style={{ borderColor: subBorder, background: d ? "rgba(90,158,58,.1)" : "rgba(90,158,58,.08)", color: hi, marginBottom: 10 }}>
                  Step 03 / Defaults
                </div>
                <h2 style={{ margin: 0, fontFamily: "'DM Serif Display', serif", fontStyle: "italic", fontSize: 26, fontWeight: 400 }}>
                  Your starting defaults are ready
                </h2>
                <p style={{ fontSize: 13, color: muted, lineHeight: 1.72, margin: "12px 0 0" }}>
                  Nothing heavy to manage here. These are the defaults that follow the episode into Clips, where you can refine every creative detail later.
                </p>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "1fr" : "repeat(3,minmax(0,1fr))",
                  gap: 10,
                }}
              >
                {[
                  {
                    label: "Clip setup",
                    value: generationSummary,
                    detail: generationSettings.topic_focus.trim()
                      ? generationSettings.topic_focus
                      : "No extra topic focus yet. You can add it in Clips.",
                  },
                  {
                    label: "Subtitle starter",
                    value: subtitleStyleLabel,
                    detail: `${subtitleStyleSummary}. Final font and position can be refined later.`,
                  },
                  {
                    label: "Audio leveling",
                    value: selectedAudioFeedback.badge,
                    detail: selectedAudioFeedback.description,
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    style={{
                      borderRadius: 16,
                      border: `1px solid ${subBorder}`,
                      background: d ? "rgba(90,158,58,.08)" : "rgba(90,158,58,.05)",
                      padding: "14px 14px 15px",
                    }}
                  >
                    <div style={{ fontSize: 9, letterSpacing: ".18em", textTransform: "uppercase", color: muted, fontWeight: 700, marginBottom: 6 }}>
                      {item.label}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: text, marginBottom: 5, lineHeight: 1.45 }}>{item.value}</div>
                    <div style={{ fontSize: 12, lineHeight: 1.6, color: muted }}>{item.detail}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {sourceMode === "file" ? (
            <>
              <section
                className="slide-up ic-premium-card"
                style={{
                  borderRadius: 22,
                  border: `2px dashed ${dragging ? hi : border}`,
                  background: dragging ? (d ? "rgba(30,68,16,.55)" : "rgba(215,248,198,.65)") : card,
                  padding: isMobile ? "36px 18px" : "54px 24px",
                  textAlign: "center",
                  marginBottom: 16,
                  cursor: "pointer",
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={(event) => {
                  event.preventDefault();
                  setDragging(false);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  pickFile(event.dataTransfer.files[0] ?? null);
                }}
                onClick={() => inputRef.current?.click()}
              >
                <div className="ic-step-kicker" style={{ borderColor: subBorder, background: d ? "rgba(90,158,58,.1)" : "rgba(90,158,58,.08)", color: hi, margin: "0 auto 18px" }}>
                  Step 04 / Review
                </div>
                <input
                  ref={inputRef}
                  type="file"
                  accept={ACCEPTED_EXT.join(",")}
                  style={{ display: "none" }}
                  onChange={(event) => pickFile(event.target.files?.[0] ?? null)}
                />

                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <div
                    style={{
                      width: 88,
                      height: 88,
                      borderRadius: 24,
                      marginBottom: 20,
                      background: d ? "rgba(90,158,58,.14)" : "rgba(90,158,58,.09)",
                      border: `1px solid ${border}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <FileVideo2 size={36} color={hi} />
                  </div>
                  <h2 style={{ margin: 0, fontFamily: "'DM Serif Display', serif", fontStyle: "italic", fontSize: 24 }}>
                    {dragging ? "Drop to analyze" : "Drag and drop your video"}
                  </h2>
                  <p style={{ margin: "8px 0 20px", fontSize: 13, color: muted }}>Supports MP4, MOV, WebM, and M4V</p>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      inputRef.current?.click();
                    }}
                    className="ic-action"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 9,
                      borderRadius: 999,
                      padding: "13px 26px",
                      border: "none",
                      background: `linear-gradient(135deg, #3e7a28, ${hi})`,
                      color: "#fff",
                      fontSize: 14,
                      fontWeight: 700,
                      cursor: "pointer",
                      boxShadow: "0 10px 30px rgba(90,158,58,.28)",
                    }}
                  >
                    <UploadCloud size={16} />
                    Browse file
                  </button>
                </div>
              </section>

              {fileMeta ? (
                <section
                  className="slide-up ic-premium-card"
                  style={{
                    borderRadius: 20,
                    border: `1px solid ${border}`,
                    background: card,
                    padding: 22,
                    marginBottom: 16,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 16 }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 10, letterSpacing: ".24em", textTransform: "uppercase", color: muted, fontWeight: 700, marginBottom: 5 }}>
                        Selected file
                      </div>
                      <div
                        title={fileMeta.name}
                        style={{
                          fontFamily: "'DM Serif Display', serif",
                          fontSize: 20,
                          fontStyle: "italic",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {fileMeta.short}
                      </div>
                    </div>
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        borderRadius: 999,
                        padding: "6px 14px",
                        background: state === "checking" ? (d ? "rgba(90,158,58,.22)" : "rgba(90,158,58,.12)") : d ? "rgba(55,92,38,.18)" : "rgba(175,215,150,.25)",
                        border: `1px solid ${subBorder}`,
                        color: stateAccent[state] || muted,
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: ".14em",
                        textTransform: "uppercase",
                      }}
                    >
                      {state === "checking" ? (
                        <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />
                      ) : null}
                      {stateLabel[state] || state}
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))", gap: 10, marginBottom: 18 }}>
                    {[
                      { label: "Filename", value: fileMeta.name },
                      { label: "File size", value: fileMeta.size },
                      { label: "Format", value: fileMeta.type },
                      { label: "Export", value: `${exportDetails.label} (${exportDetails.aspect})` },
                    ].map((item) => (
                      <div
                        key={item.label}
                        style={{
                          borderRadius: 14,
                          border: `1px solid ${subBorder}`,
                          background: d ? "rgba(90,158,58,.09)" : "rgba(90,158,58,.06)",
                          padding: "12px 14px",
                        }}
                      >
                        <div style={{ fontSize: 9, letterSpacing: ".18em", textTransform: "uppercase", color: muted, fontWeight: 700, marginBottom: 5 }}>
                          {item.label}
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: text, lineHeight: 1.45 }}>{item.value}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: "grid", gap: 10, marginBottom: 18 }}>
                    {[
                      {
                        label: "Subtitle style",
                        value: subtitleStyleLabel,
                        detail: `${subtitleStyleSummary}. ${activeSubtitlePreset.description}`,
                      },
                      {
                        label: "Clip generation",
                        value: generationSummary,
                        detail: generationSettings.topic_focus.trim()
                          ? generationSettings.topic_focus
                          : "No extra topic focus yet. These defaults carry into the clips page.",
                      },
                      {
                        label: "Audio leveling",
                        value: selectedAudioFeedback.badge,
                        detail: selectedAudioFeedback.description,
                      },
                    ].map((item) => (
                      <div
                        key={item.label}
                        style={{
                          borderRadius: 14,
                          border: `1px solid ${subBorder}`,
                          background: d ? "rgba(90,158,58,.09)" : "rgba(90,158,58,.06)",
                          padding: "12px 14px",
                        }}
                      >
                        <div style={{ fontSize: 9, letterSpacing: ".18em", textTransform: "uppercase", color: muted, fontWeight: 700, marginBottom: 5 }}>
                          {item.label}
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: text, marginBottom: 4 }}>{item.value}</div>
                        <div style={{ fontSize: 12, lineHeight: 1.6, color: muted }}>{item.detail}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => void runPreflight()}
                      disabled={state === "checking" || authLoading}
                      className="ic-action"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        borderRadius: 999,
                        padding: "11px 22px",
                        border: "none",
                        background: `linear-gradient(135deg, #3e7a28, ${hi})`,
                        color: "#fff",
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: "pointer",
                        opacity: state === "checking" ? 0.68 : 1,
                      }}
                    >
                      {state === "checking" ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <RefreshCcw size={14} />}
                      {state === "checking" ? "Analyzing..." : "Re-run pre-flight"}
                    </button>
                    <button
                      type="button"
                      onClick={() => pickFile(null)}
                      className="ic-premium-card"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        borderRadius: 999,
                        padding: "11px 20px",
                        border: `1px solid ${border}`,
                        background: "transparent",
                        color: muted,
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Clear
                    </button>
                  </div>
                </section>
              ) : null}

              {err ? (
                <section
                  className="slide-up ic-premium-card"
                  style={{
                    borderRadius: 16,
                    border: `1px solid ${d ? "rgba(231,184,106,.24)" : "rgba(190,134,48,.28)"}`,
                    background: d ? "rgba(68,45,12,.36)" : "rgba(255,247,228,.94)",
                    padding: "16px",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 12,
                    color: d ? "#f0c980" : "#7a541e",
                    marginBottom: 16,
                  }}
                >
                  <AlertTriangle size={16} style={{ marginTop: 1, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontWeight: 700, marginBottom: 5 }}>Error</div>
                    <div style={{ lineHeight: 1.65 }}>{err}</div>
                    {file ? (
                      <button
                        type="button"
                        onClick={() => void runPreflight()}
                        style={{
                          marginTop: 10,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          borderRadius: 999,
                          border: "1px solid currentColor",
                          padding: "7px 14px",
                          background: "rgba(255,255,255,.1)",
                          color: "currentColor",
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        <RefreshCcw size={11} />
                        Retry
                      </button>
                    ) : null}
                  </div>
                </section>
              ) : null}

              {result ? (
                <section
                  className="slide-up ic-premium-card"
                  style={{
                    borderRadius: 20,
                    border: `1px solid ${
                      state === "free_ready"
                        ? d
                          ? "rgba(58,158,56,.38)"
                          : "rgba(140,215,130,.65)"
                        : state === "awaiting_payment"
                          ? d
                            ? "rgba(158,135,32,.38)"
                            : "rgba(215,198,110,.65)"
                          : d
                            ? "rgba(158,32,32,.38)"
                            : "rgba(215,148,148,.65)"
                    }`,
                    background:
                      state === "free_ready"
                        ? d
                          ? "rgba(16,52,14,.9)"
                          : "rgba(220,252,210,.92)"
                        : state === "awaiting_payment"
                          ? d
                            ? "rgba(52,42,6,.9)"
                            : "rgba(255,252,218,.92)"
                          : d
                            ? "rgba(52,8,8,.9)"
                            : "rgba(255,232,232,.92)",
                    padding: 22,
                    color:
                      state === "free_ready"
                        ? "#3a9e38"
                        : state === "awaiting_payment"
                          ? "#9e8a20"
                          : "#9e2020",
                    marginBottom: 16,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 16 }}>
                    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                      <div
                        style={{
                          width: 48,
                          height: 48,
                          borderRadius: 15,
                          border: "1px solid rgba(255,255,255,.18)",
                          background: "rgba(255,255,255,.18)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {state === "free_ready" ? <CheckCircle2 size={22} /> : state === "awaiting_payment" ? <CreditCard size={22} /> : <XCircle size={22} />}
                      </div>
                      <div>
                        <div style={{ fontSize: 10, letterSpacing: ".24em", textTransform: "uppercase", opacity: 0.72, marginBottom: 3 }}>
                          Pre-flight result
                        </div>
                        <div style={{ fontSize: 22, fontWeight: 800 }}>
                          {state === "free_ready"
                            ? "Free upload available"
                            : state === "awaiting_payment"
                              ? "Payment required"
                              : "Upload blocked"}
                        </div>
                      </div>
                    </div>
                    <div
                      style={{
                        borderRadius: 999,
                        border: "1px solid rgba(255,255,255,.18)",
                        background: "rgba(255,255,255,.18)",
                        padding: "7px 16px",
                        fontFamily: "monospace",
                        fontSize: 16,
                        fontWeight: 700,
                      }}
                    >
                      {result.currency} {result.price.toFixed(2)}
                    </div>
                  </div>
                  <p style={{ margin: "0 0 16px", fontSize: 14, lineHeight: 1.72, opacity: 0.86 }}>{result.message}</p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 160px), 1fr))", gap: 10 }}>
                    {[
                      { label: "Duration", value: `${result.duration_minutes.toFixed(1)} min` },
                      { label: "Free tier", value: result.free_trial_available ? "Available" : "Used" },
                    ].map((item) => (
                      <div key={item.label} style={{ borderRadius: 14, background: "rgba(255,255,255,.14)", padding: "14px 16px" }}>
                        <div style={{ fontSize: 10, letterSpacing: ".2em", textTransform: "uppercase", opacity: 0.65, marginBottom: 5 }}>{item.label}</div>
                        <div style={{ fontSize: 18, fontWeight: 800 }}>{item.value}</div>
                      </div>
                    ))}
                  </div>
                  {prep ? (
                    <div style={{ marginTop: 14, borderRadius: 14, border: "1px solid rgba(255,255,255,.18)", background: "rgba(255,255,255,.12)", padding: "14px 16px", fontSize: 13 }}>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 7, fontWeight: 700, marginBottom: 7 }}>
                        <CheckCircle2 size={14} />
                        Record created successfully
                      </div>
                      <div style={{ fontFamily: "monospace", opacity: 0.82 }}>ID: {prep.podcast_id}</div>
                      <div style={{ opacity: 0.72, marginTop: 4 }}>Status: <strong>{prep.status}</strong></div>
                      <div style={{ opacity: 0.72, marginTop: 4 }}>Export: <strong>{exportDetails.label}</strong> ({exportDetails.aspect})</div>
                      <div style={{ opacity: 0.72, marginTop: 4 }}>{selectedAudioFeedback.description}</div>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
                        {prep.checkout_required ? (
                          <button
                            type="button"
                            onClick={() => void handleStartCheckout(prep.podcast_id, result.price)}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 8,
                              borderRadius: 999,
                              padding: "10px 16px",
                              background: "#9e8a20",
                              border: "1px solid rgba(255,255,255,.24)",
                              color: "#fff",
                              fontSize: 12,
                              fontWeight: 800,
                              cursor: "pointer",
                            }}
                          >
                            <CreditCard size={13} />
                            Pay & Unlock
                          </button>
                        ) : null}
                        <Link
                          href={`/clips?podcastId=${prep.podcast_id}`}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 8,
                            borderRadius: 999,
                            padding: "10px 16px",
                            background: "rgba(255,255,255,.18)",
                            border: "1px solid rgba(255,255,255,.22)",
                            color: "#fff",
                            fontSize: 12,
                            fontWeight: 700,
                            textDecoration: "none",
                          }}
                        >
                          <Play size={13} />
                          Open clips generation
                        </Link>
                      </div>
                    </div>
                  ) : null}
                </section>
              ) : null}

              {result && state !== "blocked" ? (
                <section
                  className="slide-up ic-premium-card"
                  style={{
                    borderRadius: 20,
                    border: `1px solid ${border}`,
                    background: card,
                    padding: "24px 24px 22px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 18, flexWrap: "wrap", alignItems: "center" }}>
                    <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                      <div
                        style={{
                          width: 46,
                          height: 46,
                          borderRadius: 14,
                          background: d ? "rgba(90,158,58,.18)" : "rgba(90,158,58,.1)",
                          border: `1px solid ${subBorder}`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        {state === "free_ready" ? <ShieldCheck size={20} color={hi} /> : <Zap size={20} color={hi} />}
                      </div>
                      <div>
                        <div style={{ fontSize: 10, letterSpacing: ".24em", textTransform: "uppercase", color: hi2, fontWeight: 700, marginBottom: 5 }}>
                          Next step
                        </div>
                        <div style={{ fontFamily: "'DM Serif Display', serif", fontStyle: "italic", fontSize: 20, marginBottom: 4 }}>
                          {state === "free_ready" ? "Reserve your free upload" : "Create payment record"}
                        </div>
                        <div style={{ fontSize: 13, color: muted, lineHeight: 1.65 }}>
                          <Clock size={13} style={{ verticalAlign: "middle", marginRight: 6 }} />
                          {exportDetails.label} export with {subtitleStyleLabel} subtitles selected. {generationSummary}.{" "}
                          {selectedAudioFeedback.tone === "enabled" ? "Audio leveling will be included." : "Audio leveling is currently off."}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => void reserveRecord()}
                      disabled={preparing}
                      className="ic-action"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        borderRadius: 14,
                        padding: "12px 22px",
                        border: `1px solid ${d ? "rgba(90,158,58,.5)" : border}`,
                        background: d ? "rgba(90,158,58,.14)" : "rgba(90,158,58,.08)",
                        color: d ? "#9dce7a" : "#3a6e25",
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: "pointer",
                        opacity: preparing ? 0.65 : 1,
                      }}
                    >
                      {preparing ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <CheckCircle2 size={14} />}
                      {preparing ? "Saving..." : `Create ${exportDetails.label.toLowerCase()} record`}
                    </button>
                    {prep ? (
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        {prep.checkout_required ? (
                          <button
                            type="button"
                            onClick={() => void handleStartCheckout(prep.podcast_id, result.price)}
                            className="ic-premium-card"
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 8,
                              borderRadius: 14,
                              padding: "12px 18px",
                              border: "1px solid rgba(158,138,32,.38)",
                              background: "#9e8a20",
                              color: "#fff",
                              fontSize: 13,
                              fontWeight: 800,
                              cursor: "pointer",
                            }}
                          >
                            <CreditCard size={14} />
                            Pay & Unlock
                          </button>
                        ) : null}
                        <Link
                          href={`/clips?podcastId=${prep.podcast_id}`}
                          className="ic-premium-card"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 8,
                            borderRadius: 14,
                            padding: "12px 18px",
                            border: `1px solid ${d ? "rgba(90,158,58,.5)" : border}`,
                            background: d ? "rgba(255,255,255,.04)" : "rgba(255,255,255,.84)",
                            color: text,
                            fontSize: 13,
                            fontWeight: 700,
                            textDecoration: "none",
                          }}
                        >
                          <Play size={14} />
                          Go to clips generation
                        </Link>
                      </div>
                    ) : null}
                  </div>
                </section>
              ) : null}
            </>
          ) : (
            <>
              <section
                className="slide-up ic-premium-card"
                style={{
                  borderRadius: 20,
                  border: `1px solid ${border}`,
                  background: d
                    ? "linear-gradient(180deg, rgba(14,24,11,.94), rgba(10,18,8,.9))"
                    : "linear-gradient(180deg, rgba(255,255,255,.96), rgba(246,251,241,.96))",
                  padding: isMobile ? "18px 16px" : "22px",
                  marginBottom: 16,
                  boxShadow: d
                    ? "0 14px 36px rgba(0,0,0,.14)"
                    : "0 14px 34px rgba(90,158,58,.07)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 18 }}>
                  <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 12,
                        background: d ? "rgba(90,158,58,.14)" : "rgba(90,158,58,.1)",
                        border: `1px solid ${subBorder}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <Link2 size={22} color={hi} />
                    </div>
                    <div>
                      <div style={{ fontSize: 10, letterSpacing: ".22em", textTransform: "uppercase", color: hi2, fontWeight: 700, marginBottom: 6 }}>
                        YouTube import
                      </div>
                      <h2 style={{ margin: 0, fontFamily: "'DM Serif Display', serif", fontStyle: "italic", fontSize: isMobile ? 26 : 30, fontWeight: 400, lineHeight: 1.12 }}>
                        Import one public video.
                      </h2>
                      <p style={{ marginTop: 9, fontSize: 13, lineHeight: 1.65, color: muted, maxWidth: 560 }}>
                        Paste the link, save it to your library, then analyze it from the ready state.
                      </p>
                    </div>
                  </div>
                  <div
                    style={{
                      borderRadius: 999,
                      border: `1px solid ${subBorder}`,
                      background: d ? "rgba(90,158,58,.12)" : "rgba(90,158,58,.08)",
                    padding: "7px 11px",
                    color: hi,
                    fontSize: 11,
                    fontWeight: 700,
                    }}
                  >
                    Single public video
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: isTablet ? "1fr" : "minmax(0, 1.22fr) minmax(240px, .78fr)",
                    gap: 14,
                    alignItems: "start",
                  }}
                >
                  <div
                    style={{
                      borderRadius: 16,
                      border: `1px solid ${subBorder}`,
                      background: d ? "rgba(8,14,8,.56)" : "rgba(255,255,255,.88)",
                      padding: isMobile ? "14px" : "16px",
                    }}
                  >
                    <div style={{ display: "grid", gap: 12, marginBottom: 16 }}>
                      <label style={{ display: "grid", gap: 6 }}>
                        <span style={{ fontSize: 11, letterSpacing: ".18em", textTransform: "uppercase", color: muted, fontWeight: 700 }}>
                          Video URL
                        </span>
                        <input
                          value={youtubeUrl}
                          onChange={(event) => {
                            setYoutubeUrl(event.target.value);
                            setYoutubeImport(null);
                            if (err) setErr("");
                          }}
                          placeholder="https://www.youtube.com/watch?v=..."
                          style={{
                            width: "100%",
                            borderRadius: 14,
                            border: `1px solid ${border}`,
                            background: d ? "rgba(6,12,6,.82)" : "#fff",
                            color: text,
                            padding: "14px 15px",
                            outline: "none",
                            fontSize: 14,
                            boxShadow: d ? "inset 0 1px 0 rgba(255,255,255,.02)" : "0 1px 0 rgba(0,0,0,.02)",
                          }}
                        />
                      </label>

                      {normalizedYouTubeCandidate ? (
                        <div
                          style={{
                            borderRadius: 14,
                            border: `1px solid ${subBorder}`,
                            background: d ? "rgba(90,158,58,.09)" : "rgba(90,158,58,.06)",
                            padding: "12px 13px",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                            <CheckCircle2 size={14} color={hi} />
                            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".16em", textTransform: "uppercase", color: hi2 }}>
                              Ready to import
                            </div>
                          </div>
                          <div style={{ fontSize: 12, color: muted, lineHeight: 1.6 }}>
                            {normalizedYouTubeCandidate.hadPlaylistContext
                              ? "Playlist context was detected. We will import only the selected video."
                              : "This link points to one supported video and can be imported directly."}
                          </div>
                          <div style={{ marginTop: 8, fontSize: 12, color: text, fontFamily: "monospace", overflowWrap: "anywhere" }}>
                            {normalizedYouTubeCandidate.normalizedUrl}
                          </div>
                        </div>
                      ) : null}

                      <label style={{ display: "grid", gap: 6 }}>
                        <span style={{ fontSize: 11, letterSpacing: ".18em", textTransform: "uppercase", color: muted, fontWeight: 700 }}>
                          Optional title
                        </span>
                        <input
                          value={youtubeTitle}
                          onChange={(event) => {
                            setYoutubeTitle(event.target.value);
                            setYoutubeImport(null);
                            if (err) setErr("");
                          }}
                          placeholder="Override the imported episode title if needed"
                          style={{
                            width: "100%",
                            borderRadius: 14,
                            border: `1px solid ${border}`,
                            background: d ? "rgba(6,12,6,.82)" : "#fff",
                            color: text,
                            padding: "14px 15px",
                            outline: "none",
                            fontSize: 14,
                          }}
                        />
                      </label>
                    </div>

                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={() => void submitYouTubeImport()}
                        disabled={youtubeSubmitting || authLoading}
                        className="ic-action"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 8,
                          borderRadius: 999,
                          padding: "12px 22px",
                          border: "none",
                          background: `linear-gradient(135deg, #3e7a28, ${hi})`,
                          color: "#fff",
                          fontSize: 13,
                          fontWeight: 700,
                          cursor: "pointer",
                          opacity: youtubeSubmitting ? 0.68 : 1,
                          boxShadow: "0 12px 28px rgba(90,158,58,.22)",
                        }}
                      >
                        {youtubeSubmitting ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Link2 size={14} />}
                        {youtubeSubmitting ? "Importing..." : "Import from YouTube"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setYoutubeUrl("");
                          setYoutubeTitle("");
                          setYoutubeImport(null);
                          setErr("");
                        }}
                        className="ic-premium-card"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 8,
                          borderRadius: 999,
                          padding: "12px 20px",
                          border: `1px solid ${border}`,
                          background: "transparent",
                          color: muted,
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  <div style={{ display: "grid", gap: 12 }}>
                    <div
                      style={{
                        borderRadius: 16,
                        border: `1px solid ${subBorder}`,
                        background: d ? "rgba(10,18,8,.74)" : "rgba(248,252,244,.94)",
                        padding: "14px",
                      }}
                    >
                      <div style={{ fontSize: 10, letterSpacing: ".18em", textTransform: "uppercase", color: hi2, fontWeight: 700, marginBottom: 10 }}>
                        Accepted links
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {[
                          "youtube.com/watch?v=...",
                          "youtu.be/...",
                          "youtube.com/shorts/...",
                        ].map((item) => (
                          <div
                            key={item}
                            style={{
                              borderRadius: 999,
                              border: `1px solid ${subBorder}`,
                              background: d ? "rgba(90,158,58,.08)" : "rgba(90,158,58,.05)",
                              padding: "8px 10px",
                              fontSize: 11,
                              color: text,
                              fontFamily: "monospace",
                            }}
                          >
                            {item}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div
                      style={{
                        borderRadius: 16,
                        border: `1px solid ${subBorder}`,
                        background: d ? "rgba(10,18,8,.74)" : "rgba(248,252,244,.94)",
                        padding: "14px",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                        <Clock size={14} color={hi} />
                        <div style={{ fontSize: 10, letterSpacing: ".18em", textTransform: "uppercase", color: hi2, fontWeight: 700 }}>
                          Next steps
                        </div>
                      </div>
                      <div style={{ display: "grid", gap: 9 }}>
                        {[
                          "Save video to library",
                          "Analyze when ready",
                          "Open clips workspace",
                        ].map((item, index) => (
                          <div key={item} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12, color: muted, lineHeight: 1.5 }}>
                            <span
                              style={{
                                width: 22,
                                height: 22,
                                borderRadius: 999,
                                background: d ? "rgba(90,158,58,.12)" : "rgba(90,158,58,.08)",
                                color: hi,
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 11,
                                fontWeight: 800,
                                flexShrink: 0,
                              }}
                            >
                              {index + 1}
                            </span>
                            {item}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {err ? (
                <section
                  className="slide-up ic-premium-card"
                  style={{
                    borderRadius: 18,
                    border: `1px solid ${d ? "rgba(175,70,70,.35)" : "rgba(210,148,148,.55)"}`,
                    background: d ? "rgba(44,8,8,.75)" : "rgba(255,232,232,.9)",
                    padding: "18px 20px",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 12,
                    color: d ? "#e08080" : "#934545",
                    marginBottom: 16,
                  }}
                >
                  <AlertTriangle size={16} style={{ marginTop: 1, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontWeight: 700, marginBottom: 5 }}>Import issue</div>
                    <div style={{ lineHeight: 1.65 }}>{err}</div>
                    {err.toLowerCase().includes("playlist") ? (
                      <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.6, opacity: 0.82 }}>
                        Tip: open the exact video you want, then paste the URL from that video page. If the link includes both
                        `v=` and `list=`, we now ignore the playlist and import only the video.
                      </div>
                    ) : null}
                    {youtubeUrl.trim() ? (
                      <button
                        type="button"
                        onClick={() => void submitYouTubeImport()}
                        style={{
                          marginTop: 10,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          borderRadius: 999,
                          border: "1px solid currentColor",
                          padding: "7px 14px",
                          background: "rgba(255,255,255,.1)",
                          color: "currentColor",
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        <RefreshCcw size={11} />
                        Retry import
                      </button>
                    ) : null}
                  </div>
                </section>
              ) : null}

              {youtubeImport ? (
                <section
                  className="slide-up ic-premium-card"
                  style={{
                    borderRadius: 18,
                    border: `1px solid ${d ? "rgba(130,205,110,.3)" : "rgba(130,205,110,.48)"}`,
                    background: d ? "rgba(18,48,14,.82)" : "rgba(238,250,229,.96)",
                    padding: isMobile ? "18px 16px" : "20px",
                    color: d ? "#c9e89a" : "#2f6f20",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 16 }}>
                    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                      <div
                        style={{
                          width: 48,
                          height: 48,
                          borderRadius: 15,
                          border: "1px solid rgba(255,255,255,.18)",
                          background: "rgba(255,255,255,.18)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <CheckCircle2 size={22} />
                      </div>
                      <div>
                        <div style={{ fontSize: 10, letterSpacing: ".24em", textTransform: "uppercase", opacity: 0.72, marginBottom: 3 }}>
                          {youtubeNeedsPayment ? "Imported - payment needed" : "Imported and ready"}
                        </div>
                        <div style={{ fontSize: isMobile ? 18 : 20, fontWeight: 800, lineHeight: 1.25 }}>{youtubeImport.title}</div>
                      </div>
                    </div>
                    <div
                      style={{
                        borderRadius: 999,
                        border: "1px solid rgba(255,255,255,.18)",
                        background: "rgba(255,255,255,.18)",
                        padding: "7px 14px",
                        fontSize: 12,
                        fontWeight: 700,
                      }}
                    >
                      {youtubeImport.status.replaceAll("_", " ")}
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))", gap: 10, marginBottom: 16 }}>
                    {[
                      { label: "Duration", value: formatDurationLabel(youtubeImport.duration_seconds) },
                      { label: "Source", value: "YouTube import" },
                      { label: "Price", value: youtubeImport.checkout_required ? `$${youtubeImport.price.toFixed(2)} ${youtubeImport.currency}` : "No payment needed" },
                      { label: "Channel", value: youtubeChannel ?? "Unknown channel" },
                    ].map((item) => (
                      <div key={item.label} style={{ borderRadius: 14, background: "rgba(255,255,255,.14)", padding: "14px 16px" }}>
                        <div style={{ fontSize: 10, letterSpacing: ".2em", textTransform: "uppercase", opacity: 0.65, marginBottom: 5 }}>{item.label}</div>
                        <div style={{ fontSize: 14, fontWeight: 800, lineHeight: 1.45 }}>{item.value}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ borderRadius: 14, border: "1px solid rgba(255,255,255,.18)", background: "rgba(255,255,255,.12)", padding: "14px 16px", marginBottom: 16 }}>
                    <div style={{ fontSize: 10, letterSpacing: ".2em", textTransform: "uppercase", opacity: 0.65, marginBottom: 6 }}>
                      Imported URL
                    </div>
                    <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8, fontFamily: "monospace", overflowWrap: "anywhere" }}>
                      {youtubeImport.source_url}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => void analyzeImportedPodcast()}
                      disabled={youtubeAnalyzing || !youtubeReadyForProcessing}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        borderRadius: 999,
                        padding: "12px 20px",
                        border: "none",
                        background: `linear-gradient(135deg, #3e7a28, ${hi})`,
                        color: "#fff",
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: youtubeReadyForProcessing ? "pointer" : "not-allowed",
                        opacity: youtubeAnalyzing || !youtubeReadyForProcessing ? 0.7 : 1,
                      }}
                    >
                      {youtubeAnalyzing ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Play size={14} />}
                      {youtubeAnalyzing ? "Analyzing..." : youtubeNeedsPayment ? "Payment required" : "Analyze and open clips"}
                    </button>
                    <Link
                      href="/podcasts"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        borderRadius: 999,
                        padding: "12px 18px",
                        border: "1px solid rgba(255,255,255,.18)",
                        background: "rgba(255,255,255,.12)",
                        color: "inherit",
                        fontSize: 13,
                        fontWeight: 700,
                        textDecoration: "none",
                      }}
                    >
                      Open library
                    </Link>
                  </div>
                </section>
              ) : null}
            </>
          )}
        </div>
      </div>
    </>
  );
}
