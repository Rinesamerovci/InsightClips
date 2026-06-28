"use client";

import { useEffect, useRef, useState } from "react";

import type { SubtitleStyle } from "@/lib/api";

type SubtitleCue = {
  start: number;
  end: number;
  text: string;
};

type ClipVideoPreviewProps = {
  src: string;
  subtitleUrl?: string | null;
  subtitleText?: string | null;
  subtitleStyle?: SubtitleStyle | null;
  aspectRatio: string;
  dark: boolean;
};

function normalizeSubtitleText(value: string | null | undefined): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function wrapSubtitleText(text: string): string {
  const words = normalizeSubtitleText(text).split(" ").filter(Boolean);
  if (words.length === 0) {
    return "";
  }

  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && candidate.length > 34) {
      lines.push(current);
      current = word;
      continue;
    }

    current = candidate;
  }

  if (current) {
    lines.push(current);
  }

  return lines.slice(0, 3).join("\n");
}

function parseTimestamp(value: string): number {
  const cleaned = value.trim().replace(",", ".");
  const parts = cleaned.split(":");
  if (parts.length !== 3) {
    return 0;
  }

  const hours = Number(parts[0] ?? 0);
  const minutes = Number(parts[1] ?? 0);
  const seconds = Number(parts[2] ?? 0);
  if ([hours, minutes, seconds].some((part) => Number.isNaN(part))) {
    return 0;
  }

  return hours * 3600 + minutes * 60 + seconds;
}

function formatTimestamp(seconds: number): string {
  const totalMilliseconds = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(totalMilliseconds / 3_600_000);
  const minutes = Math.floor((totalMilliseconds % 3_600_000) / 60_000);
  const remainingMilliseconds = totalMilliseconds % 60_000;
  const wholeSeconds = Math.floor(remainingMilliseconds / 1000);
  const milliseconds = remainingMilliseconds % 1000;

  return [
    hours.toString().padStart(2, "0"),
    minutes.toString().padStart(2, "0"),
    wholeSeconds.toString().padStart(2, "0"),
  ].join(":") + `.${milliseconds.toString().padStart(3, "0")}`;
}

function parseSubtitleFile(content: string): SubtitleCue[] {
  const cleaned = content.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!cleaned) {
    return [];
  }

  return cleaned.split(/\n{2,}/).flatMap((block) => {
    const lines = block
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0 || lines[0].toUpperCase() === "WEBVTT") {
      return [];
    }

    const timeIndex = lines.findIndex((line) => line.includes("-->"));
    if (timeIndex === -1) {
      return [];
    }

    const [startRaw, endRaw] = lines[timeIndex]
      .split("-->")
      .map((part) => part.trim().split(/\s+/)[0] ?? "");
    const text = lines
      .slice(timeIndex + 1)
      .filter((line) => !/^\d+$/.test(line))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    const start = parseTimestamp(startRaw);
    const end = parseTimestamp(endRaw);
    if (!text || end < start) {
      return [];
    }

    return [{ start, end, text }];
  });
}

function buildVttDocument(cues: SubtitleCue[]): string {
  const lines = ["WEBVTT", ""];

  for (const cue of cues) {
    lines.push(`${formatTimestamp(cue.start)} --> ${formatTimestamp(cue.end)}`);
    lines.push(cue.text);
    lines.push("");
  }

  return lines.join("\n");
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) {
    return `rgba(0,0,0,${alpha})`;
  }

  const red = Number.parseInt(clean.slice(0, 2), 16);
  const green = Number.parseInt(clean.slice(2, 4), 16);
  const blue = Number.parseInt(clean.slice(4, 6), 16);
  return `rgba(${red},${green},${blue},${alpha})`;
}

function getVisibleCue(cues: SubtitleCue[], time: number): SubtitleCue | null {
  return cues.find((cue) => time >= cue.start && time <= cue.end) ?? null;
}

export default function ClipVideoPreview({
  src,
  subtitleUrl,
  subtitleText,
  subtitleStyle,
  aspectRatio,
  dark,
}: ClipVideoPreviewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [subtitleCues, setSubtitleCues] = useState<SubtitleCue[]>([]);
  const [subtitleTrackUrl, setSubtitleTrackUrl] = useState<string | null>(null);
  const [subtitleLoadFailed, setSubtitleLoadFailed] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  const fallbackText = wrapSubtitleText(subtitleText ?? "");
  const cueSource = subtitleUrl?.trim() ?? "";
  const activeCue = getVisibleCue(subtitleCues, currentTime);
  const style = subtitleStyle ?? {
    preset: "classic" as const,
    font_family: "Arial",
    font_size: 18,
    primary_color: "#FFFFFF",
    outline_color: "#000000",
    background_color: "#000000",
    background_opacity: 0.2,
    position: "bottom" as const,
    bold: false,
    italic: false,
  };

  useEffect(() => {
    let cancelled = false;

    async function loadSubtitles() {
      if (!cueSource) {
        setSubtitleCues([]);
        setSubtitleLoadFailed(false);
        return;
      }

      try {
        const response = await fetch(cueSource);
        if (!response.ok) {
          throw new Error("Unable to load subtitle file.");
        }

        const content = await response.text();
        if (cancelled) {
          return;
        }

        setSubtitleCues(parseSubtitleFile(content));
        setSubtitleLoadFailed(false);
      } catch {
        if (!cancelled) {
          setSubtitleCues([]);
          setSubtitleLoadFailed(true);
        }
      }
    }

    void loadSubtitles();
    return () => {
      cancelled = true;
    };
  }, [cueSource]);

  useEffect(() => {
    if (!subtitleCues.length) {
      setSubtitleTrackUrl(null);
      return;
    }

    const blob = new Blob([buildVttDocument(subtitleCues)], { type: "text/vtt" });
    const blobUrl = URL.createObjectURL(blob);
    setSubtitleTrackUrl(blobUrl);

    return () => {
      URL.revokeObjectURL(blobUrl);
    };
  }, [subtitleCues]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    const syncTime = () => setCurrentTime(video.currentTime || 0);
    const showCaptions = () => {
      for (const track of Array.from(video.textTracks)) {
        if (track.kind === "subtitles" || track.kind === "captions") {
          track.mode = "showing";
        }
      }
    };

    video.load();
    const raf = window.requestAnimationFrame(showCaptions);
    video.addEventListener("loadedmetadata", showCaptions);
    video.addEventListener("loadeddata", showCaptions);
    video.addEventListener("timeupdate", syncTime);
    video.addEventListener("seeked", syncTime);

    return () => {
      window.cancelAnimationFrame(raf);
      video.removeEventListener("loadedmetadata", showCaptions);
      video.removeEventListener("loadeddata", showCaptions);
      video.removeEventListener("timeupdate", syncTime);
      video.removeEventListener("seeked", syncTime);
    };
  }, [subtitleTrackUrl, src]);

  const useOverlayFallback = Boolean(fallbackText) && !cueSource;
  const overlayText = activeCue?.text ?? (useOverlayFallback ? fallbackText : "");
  const overlayVisible = Boolean(overlayText);
  const positionStyle =
    style.position === "top"
      ? { top: "14%" }
      : style.position === "center"
        ? { top: "50%", transform: "translateY(-50%)" }
        : { bottom: "14%" };

  return (
    <div
      style={{
        width: "100%",
        maxWidth: aspectRatio === "9 / 16" ? 220 : 320,
        aspectRatio,
        margin: "0 auto",
        borderRadius: 14,
        overflow: "hidden",
        background: "#000",
        boxShadow: dark ? "0 10px 22px rgba(0,0,0,.28)" : "0 10px 22px rgba(20,34,16,.12)",
        position: "relative",
      }}
    >
      <video
        ref={videoRef}
        controls
        preload="metadata"
        src={src}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          display: "block",
          background: "#000",
        }}
      >
      </video>

      {overlayVisible ? (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            ...positionStyle,
            display: "flex",
            justifyContent: "center",
            padding: "0 12px",
            pointerEvents: "none",
            zIndex: 2,
          }}
        >
          <div
            style={{
              maxWidth: "88%",
              borderRadius: style.preset === "boxed" ? 20 : 18,
              padding: style.preset === "boxed" ? "10px 14px" : "8px 12px",
              background: style.background_opacity > 0
                ? hexToRgba(style.background_color, style.background_opacity)
                : "transparent",
              color: style.primary_color,
              border: `1px solid ${hexToRgba(style.outline_color, 0.28)}`,
              boxShadow: dark ? "0 10px 20px rgba(0,0,0,.22)" : "0 10px 20px rgba(20,34,16,.16)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              textAlign: "center",
              fontFamily: style.font_family,
              fontSize: Math.max(12, Math.round(style.font_size * (aspectRatio === "9 / 16" ? 0.72 : 0.62))),
              lineHeight: 1.35,
              fontWeight: style.bold ? 900 : 800,
              fontStyle: style.italic ? "italic" : "normal",
              letterSpacing: "0.01em",
              textShadow: `0 1px 2px ${style.outline_color}, 0 0 10px ${hexToRgba(style.outline_color, 0.35)}`,
              whiteSpace: "pre-line",
            }}
          >
            {overlayText}
          </div>
        </div>
      ) : null}
    </div>
  );
}


