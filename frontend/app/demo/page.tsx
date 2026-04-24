"use client";

import Link from "next/link";
import { ArrowLeft, CheckCircle2, PlayCircle, Sparkles, Wand2 } from "lucide-react";

const palette = {
  bg: "#0D1008",
  panel: "#141A0E",
  panelAlt: "rgba(255,255,255,0.03)",
  border: "rgba(163,208,107,0.14)",
  text: "#E8F0DC",
  textMuted: "#8A9D72",
  accent: "#A3D06B",
  accentDark: "#6E9C3A",
  glow: "rgba(163,208,107,0.18)",
};

const steps = [
  {
    title: "Upload your long-form episode",
    body: "Start from the dashboard, add a podcast file, and let the app inspect the media before analysis begins.",
    icon: PlayCircle,
  },
  {
    title: "Analyze and generate clips",
    body: "InsightClips scores the content, finds strong moments, and creates short vertical-ready highlights for you.",
    icon: Wand2,
  },
  {
    title: "Publish the best moment",
    body: "Review the generated clips, publish the strongest one, and use the finished asset for sharing or demo playback.",
    icon: Sparkles,
  },
];

export default function DemoPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top left, rgba(163,208,107,0.12), transparent 28%), radial-gradient(circle at bottom right, rgba(110,156,58,0.16), transparent 26%), #0D1008",
        color: palette.text,
        padding: "36px 20px 72px",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Serif+Display:ital@0;1&display=swap');
        * { box-sizing: border-box; }
        html { scroll-behavior: smooth; }
      `}</style>

      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <Link
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            color: palette.textMuted,
            textDecoration: "none",
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: ".12em",
            textTransform: "uppercase",
            marginBottom: 28,
          }}
        >
          <ArrowLeft size={16} />
          Back to landing
        </Link>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: 24,
            alignItems: "stretch",
          }}
        >
          <div
            style={{
              borderRadius: 28,
              padding: 28,
              background: palette.panel,
              border: `1px solid ${palette.border}`,
              boxShadow: `0 24px 70px ${palette.glow}`,
            }}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 14px",
                borderRadius: 999,
                border: `1px solid ${palette.border}`,
                background: "rgba(163,208,107,0.08)",
                color: palette.accent,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: ".16em",
                textTransform: "uppercase",
              }}
            >
              <CheckCircle2 size={14} />
              Demo Walkthrough
            </div>

            <h1
              style={{
                margin: "22px 0 14px",
                fontFamily: "'DM Serif Display', serif",
                fontSize: "clamp(42px, 7vw, 74px)",
                lineHeight: 0.94,
                letterSpacing: "-.04em",
              }}
            >
              See how the app works in under a minute.
            </h1>

            <p style={{ color: palette.textMuted, fontSize: 17, lineHeight: 1.7, maxWidth: 540 }}>
              This page gives you a clean demo flow: first the simple product steps, then a real finished clip you can play right away.
            </p>

            <div style={{ display: "grid", gap: 14, marginTop: 28 }}>
              {steps.map(({ title, body, icon: Icon }, index) => (
                <article
                  key={title}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "auto 1fr",
                    gap: 16,
                    borderRadius: 22,
                    padding: 18,
                    background: palette.panelAlt,
                    border: `1px solid ${palette.border}`,
                  }}
                >
                  <div
                    style={{
                      width: 46,
                      height: 46,
                      borderRadius: 14,
                      background: "rgba(163,208,107,0.12)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: palette.accent,
                      flexShrink: 0,
                    }}
                  >
                    <Icon size={20} />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: palette.accent, fontWeight: 700, letterSpacing: ".16em", textTransform: "uppercase", marginBottom: 6 }}>
                      Step {index + 1}
                    </div>
                    <h2 style={{ fontSize: 20, margin: 0 }}>{title}</h2>
                    <p style={{ margin: "8px 0 0", color: palette.textMuted, lineHeight: 1.7 }}>{body}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div
            style={{
              borderRadius: 28,
              padding: 24,
              background: palette.panel,
              border: `1px solid ${palette.border}`,
              display: "grid",
              gap: 18,
            }}
          >
            <div>
              <div style={{ fontSize: 11, color: palette.accent, fontWeight: 700, letterSpacing: ".18em", textTransform: "uppercase", marginBottom: 8 }}>
                Finished Clip Preview
              </div>
              <h2 style={{ margin: 0, fontFamily: "'DM Serif Display', serif", fontSize: 34, lineHeight: 1.02 }}>
                One real clip, ready to show.
              </h2>
            </div>

            <video
              controls
              preload="metadata"
              style={{
                width: "100%",
                borderRadius: 22,
                border: `1px solid ${palette.border}`,
                background: "#000",
                minHeight: 520,
                objectFit: "cover",
              }}
            >
              <source src="/demo/finished-clip.mp4" type="video/mp4" />
              Your browser does not support the demo video.
            </video>

            <div
              style={{
                borderRadius: 20,
                padding: 18,
                background: "rgba(163,208,107,0.08)",
                border: `1px solid ${palette.border}`,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: palette.accent, letterSpacing: ".14em", textTransform: "uppercase", marginBottom: 8 }}>
                Demo tip
              </div>
              <p style={{ margin: 0, color: palette.textMuted, lineHeight: 1.7 }}>
                Use this page during your presentation: explain the 3-step flow on the left, then play the finished clip on the right to show the final output users get.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
