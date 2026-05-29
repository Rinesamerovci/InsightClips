"use client";

import { Moon, SunMedium } from "lucide-react";

type ThemeToggleButtonProps = {
  dark: boolean;
  border: string;
  muted: string;
  panel: string;
  onToggle: () => void;
};

export function ThemeToggleButton({
  dark,
  border,
  muted,
  panel,
  onToggle,
}: ThemeToggleButtonProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        borderRadius: 999,
        border: `1px solid ${border}`,
        background: panel,
        color: muted,
        padding: "10px 14px",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: ".12em",
        textTransform: "uppercase",
        cursor: "pointer",
      }}
    >
      {dark ? <SunMedium size={14} /> : <Moon size={14} />}
      {dark ? "Light" : "Dark"}
    </button>
  );
}
