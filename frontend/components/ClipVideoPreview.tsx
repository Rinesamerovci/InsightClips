"use client";

import { useEffect, useRef, useState } from "react";

type SubtitleCue = {
  start: number;
  end: number;
  text: string;
};

type ClipVideoPreviewProps = {
  src: string;
  subtitleUrl?: string | null;
  subtitleText?: string | null;
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

export default function ClipVideoPreview({
  src,
  subtitleUrl,
  subtitleText,
  aspectRatio,
  dark,
}: ClipVideoPreviewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [subtitleCues, setSubtitleCues] = useState<SubtitleCue[]>([]);
  const [subtitleTrackUrl, setSubtitleTrackUrl] = useState<string | null>(null);
  const [subtitleLoadFailed, setSubtitleLoadFailed] = useState(false);

  const fallbackText = wrapSubtitleText(subtitleText ?? "");
  const cueSource = subtitleUrl?.trim() ?? "";

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

    return () => {
      window.cancelAnimationFrame(raf);
      video.removeEventListener("loadedmetadata", showCaptions);
      video.removeEventListener("loadeddata", showCaptions);
    };
  }, [subtitleTrackUrl, src]);

  const useOverlayFallback = Boolean(fallbackText) && !subtitleTrackUrl;

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
        {subtitleTrackUrl ? (
          <track kind="captions" label="English" src={subtitleTrackUrl} srcLang="en" default />
        ) : null}
      </video>

      {useOverlayFallback ? (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: "2.5rem",
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
              borderRadius: 18,
              padding: "8px 12px",
              background: dark ? "rgba(6, 12, 7, 0.78)" : "rgba(12, 22, 10, 0.72)",
              color: "#fff",
              border: "1px solid rgba(255,255,255,.14)",
              boxShadow: dark ? "0 10px 20px rgba(0,0,0,.22)" : "0 10px 20px rgba(20,34,16,.16)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              textAlign: "center",
              fontSize: 12,
              lineHeight: 1.35,
              fontWeight: 800,
              letterSpacing: "0.01em",
              textShadow: "0 1px 2px rgba(0,0,0,.45)",
              whiteSpace: "pre-line",
            }}
          >
            {fallbackText}
          </div>
        </div>
      ) : null}
    </div>
  );
}


