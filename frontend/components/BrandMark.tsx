"use client";

import Image from "next/image";
import Link from "next/link";

type BrandMarkProps = {
  accent: string;
  href?: string;
  inverse?: boolean;
};

export function BrandMark({ accent, href = "/", inverse = false }: BrandMarkProps) {
  const content = (
    <>
      <Image
        src="/insightclips-logo.svg"
        alt="InsightClips logo"
        width={44}
        height={44}
        style={{
          width: 44,
          height: 44,
          borderRadius: 14,
          boxShadow: `0 14px 30px ${accent}30`,
        }}
      />
      <span
        style={{
          fontFamily: "var(--font-serif)",
          fontSize: 22,
          lineHeight: 1,
          letterSpacing: "-0.04em",
          color: inverse ? "#e8f0dc" : "#1a2510",
        }}
      >
        Insight<span style={{ color: accent }}>Clips</span>
      </span>
    </>
  );

  return (
    <Link
      href={href}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 12,
        textDecoration: "none",
      }}
    >
      {content}
    </Link>
  );
}
