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

function parseTimestamp(value: string): number {
  const cleaned = value.trim().replace(",", ".");
  const parts = cleaned.split(":");
  
  if (parts.length === 3) {
    const hours = Number(parts[0] ?? 0);
    const minutes = Number(parts[1] ?? 0);
    const seconds = Number(parts[2] ?? 0);
    return hours * 3600 + minutes * 60 + seconds;
  } else if (parts.length === 2) {
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

    const [startRaw, endRaw] = lines[timeIndex].split("-->").map((part) => part.trim().split(/\s+/)[0] ?? "");
    const text = lines.slice(timeIndex + 1).filter((line) => !/^\d+$/.test(line)).join(" ")
      .replace(/\s+/g, " ")
      .trim();
    
    const start = parseTimestamp(startRaw);
    const end = parseTimestamp(endRaw);
    if (!text || end < start) return [];

    return [{ start, end, text }];
  });
}

// Funksioni kritik për të kthyer kohën në formatin zyrtar WebVTT (HH:MM:SS.mmm)
function formatVTTTime(secs: number): string {
  const h = Math.floor(secs / 3600).toString().padStart(2, "0");
  const m = Math.floor((secs % 3600) / 60).toString().padStart(2, "0");
  const s = Math.floor(secs % 60).toString().padStart(2, "0");
  const ms = Math.floor((secs % 1) * 1000).toString().padStart(3, "0");
  return `${h}:${m}:${s}.${ms}`;
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
  const [vttBlobUrl, setVttBlobUrl] = useState<string>("");
  const [duration, setDuration] = useState(0);

  const cueSource = subtitleUrl?.trim() ?? "";

  // Hapi 1: Ngarkimi dhe leximi i të dhënave të titrave
  useEffect(() => {
    let cancelled = false;

    async function loadSubtitles() {
      if (!cueSource) {
        if (subtitleText && duration) {
          setSubtitleCues(generateCuesFromText(subtitleText, duration));
        }
        return;
      }

      try {
        const response = await fetch(cueSource);
        if (!response.ok) throw new Error();
        const content = await response.text();
        if (cancelled) return;

        const parsed = parseSubtitleFile(content);
        if (parsed.length > 0) {
          setSubtitleCues(parsed);
        } else if (subtitleText && duration) {
          setSubtitleCues(generateCuesFromText(subtitleText, duration));
        }
      } catch {
        if (!cancelled && subtitleText && duration) {
          setSubtitleCues(generateCuesFromText(subtitleText, duration));
        }
      }
    }

    void loadSubtitles();
    return () => {
      cancelled = true;
    };
  }, [cueSource, subtitleText, duration]);

  // Hapi 2: Krijimi i skedarit WebVTT dinamik nga kuesit që kemi mbledhur
  useEffect(() => {
    if (subtitleCues.length === 0) {
      setVttBlobUrl("");
      return;
    }

    // Ndërtojmë strukturën zyrtare të një skedari .vtt
    let vttContent = "WEBVTT\n\n";
    subtitleCues.forEach((cue, index) => {
      vttContent += `${index + 1}\n`;
      vttContent += `${formatVTTTime(cue.start)} --> ${formatVTTTime(cue.end)}\n`;
      vttContent += `${cue.text}\n\n`;
    });

    // E kthejmë në Blob URL që videoja ta lexojë si skedar lokal
    const blob = new Blob([vttContent], { type: "text/vtt" });
    const url = URL.createObjectURL(blob);
    setVttBlobUrl(url);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [subtitleCues]);

  // Hapi 3: Ndjekja e kohëzgjatjes së videos
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const syncDuration = () => {
      if (video.duration) {
        setDuration(video.duration);
      }
    };

    video.addEventListener("loadedmetadata", syncDuration);
    if (video.duration) syncDuration();

    return () => {
      video.removeEventListener("loadedmetadata", syncDuration);
    };
  }, [src]);

  // Kur track-u aktivizohet, i tregojmë browser-it t'i shfaqë titrat menjëherë
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !vttBlobUrl) return;

    const textTracks = video.textTracks;
    if (textTracks && textTracks[0]) {
      textTracks[0].mode = "showing";
    }
  }, [vttBlobUrl]);

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
      <div style={{ position: "relative", width: "100%", height: "100%" }}>
        <video
          ref={videoRef}
          controls
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
        >
          {/* Kjo pjesë e re fut titrat direkt brenda videos për Fullscreen nativ */}
          {vttBlobUrl && (
            <track
              src={vttBlobUrl}
              kind="subtitles"
              srcLang="en"
              label="English"
              default
            />
          )}
        </video>
      </div>
    </div>
  );
}