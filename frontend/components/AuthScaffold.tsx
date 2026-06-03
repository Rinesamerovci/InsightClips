"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { BrandMark } from "@/components/BrandMark";
import { ThemeToggleButton } from "@/components/ThemeToggleButton";

type AuthScaffoldProps = {
  dark: boolean;
  backHref: string;
  backLabel: string;
  showcaseBadge: string;
  showcaseTitle: ReactNode;
  showcaseBody: ReactNode;
  showcaseContent: ReactNode;
  statusLabel: string;
  shell: {
    bg: string;
    panel: string;
    shell: string;
    border: string;
    borderStrong: string;
    text: string;
    muted: string;
    faint: string;
    accent: string;
    accentStrong: string;
    accentSoft: string;
    highlight: string;
    showcase: string;
  };
  onToggleTheme: () => void;
  children: ReactNode;
  footerLabel: string;
};

export function AuthScaffold({
  dark,
  backHref,
  backLabel,
  showcaseBadge,
  showcaseTitle,
  showcaseBody,
  showcaseContent,
  statusLabel,
  shell,
  onToggleTheme,
  children,
  footerLabel,
}: AuthScaffoldProps) {
  return (
    <div
      className="auth-stage"
      style={{
        minHeight: "100vh",
        background: shell.bg,
        color: shell.text,
        fontFamily: "var(--font-sans)",
      }}
    >
      <section
        className="auth-showcase ic-premium-card"
        style={{
          background: shell.showcase,
          borderRight: `1px solid ${shell.border}`,
        }}
      >
        <div
          className="ambient-orb"
          style={{
            top: "-6%",
            right: "-4%",
            width: 260,
            height: 260,
            background: `${shell.accent}2c`,
          }}
        />
        <div
          className="ambient-orb"
          style={{
            bottom: "-8%",
            left: "-6%",
            width: 240,
            height: 240,
            background: `${shell.highlight}26`,
          }}
        />

        <div style={{ position: "relative", zIndex: 1, maxWidth: 620, margin: "0 auto" }}>
          <BrandMark accent={shell.accent} inverse />

          <div
            className="ic-premium-card"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              borderRadius: 999,
              border: `1px solid ${shell.borderStrong}`,
              background: shell.accentSoft,
              color: shell.accent,
              padding: "8px 14px",
              marginTop: 42,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: ".18em",
              textTransform: "uppercase",
            }}
          >
            {showcaseBadge}
          </div>

          <h1
            style={{
              marginTop: 22,
              fontFamily: "var(--font-serif)",
              fontSize: "clamp(38px, 5vw, 66px)",
              lineHeight: 0.94,
              letterSpacing: "-0.05em",
              maxWidth: 620,
            }}
          >
            {showcaseTitle}
          </h1>

          <p
            style={{
              marginTop: 18,
              maxWidth: 540,
              color: shell.muted,
              fontSize: 15,
              lineHeight: 1.8,
            }}
          >
            {showcaseBody}
          </p>

          <div style={{ marginTop: 32 }}>{showcaseContent}</div>

          <div
            style={{
              marginTop: 28,
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              color: shell.muted,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: ".18em",
              textTransform: "uppercase",
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                background: shell.accent,
                boxShadow: `0 0 0 8px ${shell.accentSoft}`,
              }}
            />
            {statusLabel}
          </div>
        </div>
      </section>

      <section
        className="auth-panel"
        style={{
          background: dark ? "rgba(13,16,8,.94)" : "rgba(245,248,238,.96)",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 470,
            display: "flex",
            flexDirection: "column",
            minHeight: "100%",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
              marginBottom: 28,
            }}
          >
            <Link
              href={backHref}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                textDecoration: "none",
                color: shell.muted,
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              <ArrowLeft size={15} />
              {backLabel}
            </Link>

            <ThemeToggleButton
              dark={dark}
              border={shell.border}
              muted={shell.muted}
              panel={shell.panel}
              onToggle={onToggleTheme}
            />
          </div>

          <div
            style={{
              borderRadius: 28,
              border: `1px solid ${shell.border}`,
              background: `linear-gradient(180deg, ${shell.panel}, ${shell.shell})`,
              boxShadow: dark
                ? "0 24px 70px rgba(0,0,0,.32)"
                : "0 24px 70px rgba(58, 92, 26, .10)",
              padding: "28px",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
            }}
          >
            {children}
          </div>

          <p
            style={{
              marginTop: "auto",
              paddingTop: 24,
              textAlign: "center",
              color: shell.faint,
              fontSize: 11,
              letterSpacing: ".18em",
              textTransform: "uppercase",
            }}
          >
            {footerLabel}
          </p>
        </div>
      </section>
    </div>
  );
}
