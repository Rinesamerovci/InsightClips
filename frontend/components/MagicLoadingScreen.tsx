import React, { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";

const LOADING_MESSAGES = [
  "Listening to the video...",
  "Finding the most interesting moments...",
  "Calculating virality score...",
  "Cutting the clips...",
  "Preparing subtitles...",
  "Getting everything ready for you..."
];

type MagicLoadingTheme = {
  accent: string;
  text: string;
};

export function MagicLoadingScreen({ generating, t }: { generating: boolean; t: MagicLoadingTheme }) {
  const [tick, setTick] = useState(0);
  const index = generating ? tick % LOADING_MESSAGES.length : 0;

  useEffect(() => {
    if (!generating) {
      return;
    }

    const interval = setInterval(() => {
      setTick((prev) => prev + 1);
    }, 2800);

    return () => clearInterval(interval);
  }, [generating]);

  if (!generating) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <Loader2 size={42} className="animate-spin" style={{ margin: "0 auto 16px", color: t.accent }} />
      <h3
        style={{
          margin: 0,
          fontFamily: "'DM Serif Display', serif",
          fontSize: 32,
          color: t.text,
          transition: "opacity 0.4s ease-in-out",
        }}
        key={index}
        className="magic-text-fade"
      >
        {LOADING_MESSAGES[index]}
      </h3>
      <p style={{ marginTop: 14, lineHeight: 1.8, fontSize: 15, opacity: 0.8 }}>
        Our system is working its magic. Your clips will appear here as soon as they are ready.
      </p>
      
      <style>{`
        @keyframes fadeInOut {
          0% { opacity: 0; transform: translateY(4px); }
          15% { opacity: 1; transform: translateY(0); }
          85% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-4px); }
        }
        .magic-text-fade {
          animation: fadeInOut 2.8s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
