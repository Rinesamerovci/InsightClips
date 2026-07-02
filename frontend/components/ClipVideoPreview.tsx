"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { SubtitleStyle } from "@/lib/api";

type ClipVideoPreviewProps = {
  src: string;
  subtitleUrl?: string | null;
  subtitleText?: string | null;
  subtitleStyle?: SubtitleStyle | null;
  aspectRatio: string;
  dark: boolean;
};

type SubtitleCue = {
  start: number;
  end: number;
  text: string;
};

function normalizeSubtitleText(value: string | null | undefined): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function parseTimestamp(value: string): number {
  const cleaned = value.trim().replace(",", ".");
  const parts = cleaned.split(":");

  if (parts.length === 3) {
    const hours = Number(parts[0] ?? 0);
    const minutes = Number(parts[1] ?? 0);
    const seconds = Number(parts[2] ?? 0);
    return hours * 3600 + minutes * 60 + seconds;
  }

  if (parts.length === 2) {
    const minutes = Number(parts[0] ?? 0);
    const seconds = Number(parts[1] ?? 0);
    return minutes * 60 + seconds;
  }

  const sec = Number(cleaned);
  return Number.isNaN(sec) ? 0 : sec;
}

function parseSubtitleFile(content: string): SubtitleCue[] {
  const cleaned = content.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!cleaned) return [];

  return cleaned.split(/\n{2,}/).flatMap((block) => {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    if (lines.length === 0 || lines[0].toUpperCase() === "WEBVTT") return [];

    const timeIndex = lines.findIndex((line) => line.includes("-->"));
    if (timeIndex === -1) return [];

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
    if (!text || end <= start) return [];

    return [{ start, end, text }];
  });
}

function generateCuesFromText(text: string, duration: number): SubtitleCue[] {
  const words = normalizeSubtitleText(text).split(" ").filter(Boolean);
  if (words.length === 0 || !duration) return [];

  const cues: SubtitleCue[] = [];
  const wordsPerCue = 4;
  const totalCues = Math.ceil(words.length / wordsPerCue);
  const timePerCue = duration / totalCues;

  for (let i = 0; i < totalCues; i++) {
    const start = i * timePerCue;
    const end = (i + 1) * timePerCue;
    const cueText = words.slice(i * wordsPerCue, (i + 1) * wordsPerCue).join(" ");
    cues.push({ start, end, text: cueText });
  }

  return cues;
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
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [subtitleCues, setSubtitleCues] = useState<SubtitleCue[]>([]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const syncDuration = () => {
      if (video.duration) {
        setDuration(video.duration);
      }
      setCurrentTime(video.currentTime || 0);
    };

    const syncCurrentTime = () => {
      setCurrentTime(video.currentTime || 0);
    };

    video.addEventListener("loadedmetadata", syncDuration);
    video.addEventListener("timeupdate", syncCurrentTime);
    video.addEventListener("seeked", syncCurrentTime);
    if (video.duration) syncDuration();

    return () => {
      video.removeEventListener("loadedmetadata", syncDuration);
      video.removeEventListener("timeupdate", syncCurrentTime);
      video.removeEventListener("seeked", syncCurrentTime);
    };
  }, [src]);

  useEffect(() => {
    let cancelled = false;

    const loadSubtitles = async () => {
      const subtitleSource = subtitleUrl?.trim() ?? "";
      if (subtitleSource) {
        try {
          const response = await fetch(subtitleSource);
          if (!response.ok) {
            throw new Error(`Failed to fetch subtitles: ${response.status}`);
          }

          const content = await response.text();
          if (cancelled) return;

          const parsed = parseSubtitleFile(content);
          if (parsed.length > 0) {
            setSubtitleCues(parsed);
            return;
          }
        } catch {
          // Fall back to text-based cues below.
        }
      }

      const text = normalizeSubtitleText(subtitleText);
      if (!text) {
        setSubtitleCues([]);
        return;
      }

      const fallbackDuration = duration || 30;
      const fallbackCues = generateCuesFromText(text, fallbackDuration);
      if (!cancelled) {
        setSubtitleCues(fallbackCues);
      }
    };

    void loadSubtitles();

    return () => {
      cancelled = true;
    };
  }, [duration, subtitleText, subtitleUrl]);

  const activeCue = useMemo(() => {
    if (subtitleCues.length === 0) return null;

    return (
      subtitleCues.find((cue) => currentTime >= cue.start && currentTime <= cue.end) ??
      subtitleCues[0] ??
      null
    );
  }, [currentTime, subtitleCues]);

  const subtitleLayerStyle: CSSProperties = useMemo(
    () => {
      const position = subtitleStyle?.position ?? "bottom";
      return {
        position: "absolute",
        left: 10,
        right: 10,
        top: position === "top" ? 52 : position === "center" ? "50%" : "auto",
        bottom: position === "bottom" ? 52 : "auto",
        transform: position === "center" ? "translateY(-50%)" : "none",
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
        zIndex: 3,
      };
    },
    [subtitleStyle?.position],
  );

  const subtitleBoxStyle: CSSProperties = useMemo(
    () => ({
      maxWidth: "100%",
      padding:
        subtitleStyle?.background_opacity && subtitleStyle.background_opacity > 0
          ? "8px 12px"
          : "0",
      borderRadius: 12,
      background:
        subtitleStyle?.background_opacity && subtitleStyle.background_opacity > 0
          ? `rgba(0,0,0,${Math.min(0.75, subtitleStyle.background_opacity)})`
          : "transparent",
      color: subtitleStyle?.primary_color ?? "#FFFFFF",
      fontFamily: subtitleStyle?.font_family ?? "Arial",
      fontSize: `${Math.max(14, (subtitleStyle?.font_size ?? 18) - 2)}px`,
      lineHeight: 1.15,
      fontWeight: subtitleStyle?.bold ? 700 : 600,
      fontStyle: subtitleStyle?.italic ? "italic" : "normal",
      textAlign: "center",
      letterSpacing: subtitleStyle?.font_family === "DM Sans" ? "0.01em" : "0",
      textTransform: subtitleStyle?.force_uppercase ? "uppercase" : "none",
      overflow: "hidden",
      textOverflow: "ellipsis",
      display: "-webkit-box",
      WebkitLineClamp: 2,
      WebkitBoxOrient: "vertical",
      boxShadow:
        subtitleStyle?.background_opacity && subtitleStyle.background_opacity > 0
          ? "0 6px 18px rgba(0,0,0,.24)"
          : "none",
      textShadow: `0 1px 0 ${subtitleStyle?.outline_color ?? "#000"}, 0 0 10px rgba(0,0,0,.45)`,
    }),
    [subtitleStyle],
  );

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
      <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
        <video
          ref={videoRef}
          controls
          controlsList="nodownload noplaybackrate"
          disablePictureInPicture
          preload="metadata"
          crossOrigin="anonymous"
          src={src}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            display: "block",
            background: "#000",
          }}
        />
        {activeCue ? (
          <div style={subtitleLayerStyle}>
            <div style={subtitleBoxStyle}>{activeCue.text}</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
