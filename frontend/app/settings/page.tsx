"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Moon, SunMedium, Shield, FileText, Lock, Eye, Zap } from "lucide-react";

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,700;12..96,800&family=Outfit:wght@300;400;500;600&display=swap');
  :root { --transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
  *{box-sizing:border-box;margin:0;padding:0}
  .hd{font-family:'Bricolage Grotesque',sans-serif}
  .bd{font-family:'Outfit',sans-serif; transition: var(--transition);}
  @keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
  .a-up { animation: fadeUp 0.7s cubic-bezier(0.16, 1, 0.3, 1) both; }
  .glass-card {
    backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
    background: var(--surface); border: 1px solid var(--border); transition: var(--transition);
  }
  .glass-card:hover { transform: translateY(-4px); border-color: #5a9e3a; box-shadow: 0 20px 40px var(--shadow); }
  .list-row {
    display:flex; align-items:flex-start; gap:12px; padding:14px 16px;
    border-radius:14px; border:1px solid var(--border); background: var(--row-bg);
  }
`;

function SettingRow({
  icon: Icon,
  title,
  text,
}: {
  icon: React.ElementType;
  title: string;
  text: string;
}) {
  return (
    <div className="list-row">
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: 10,
          background: "rgba(90, 158, 58, 0.1)",
          border: "1px solid rgba(90, 158, 58, 0.18)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon size={16} color="#5a9e3a" />
      </div>
      <div>
        <div className="hd" style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
          {title}
        </div>
        <p style={{ fontSize: 13, lineHeight: 1.65, opacity: 0.74 }}>{text}</p>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [viewportWidth, setViewportWidth] = useState(1280);
  const [dark, setDark] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("insightclips-theme") === "dark";
  });
  const isMobile = viewportWidth < 780;
  const isTablet = viewportWidth < 980;

  useEffect(() => {
    window.localStorage.setItem("insightclips-theme", dark ? "dark" : "light");
  }, [dark]);

  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const theme = useMemo(
    () => ({
      bg: dark ? "#0b1309" : "#f0f7eb",
      surface: dark ? "rgba(20, 35, 15, 0.7)" : "rgba(255, 255, 255, 0.75)",
      border: dark ? "rgba(90, 158, 58, 0.25)" : "rgba(90, 158, 58, 0.15)",
      text: dark ? "#dff0d4" : "#1a2e18",
      muted: dark ? "rgba(157, 206, 122, 0.6)" : "rgba(74, 124, 52, 0.65)",
      rowBg: dark ? "rgba(255, 255, 255, 0.03)" : "rgba(90, 158, 58, 0.04)",
      shadow: dark ? "rgba(0,0,0,0.4)" : "rgba(90, 158, 58, 0.1)",
    }),
    [dark],
  );

  return (
    <div
      className="bd"
      style={{
        minHeight: "100vh",
        background: theme.bg,
        color: theme.text,
        "--surface": theme.surface,
        "--border": theme.border,
        "--shadow": theme.shadow,
        "--row-bg": theme.rowBg,
      } as React.CSSProperties}
    >
      <style>{CSS}</style>

      <div style={{ maxWidth: "1100px", margin: "0 auto", padding: isMobile ? "24px 16px 32px" : "40px 24px" }}>
        <header className="a-up" style={{ display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "stretch" : "center", gap: isMobile ? "14px" : "0", justifyContent: "space-between", marginBottom: "40px" }}>
          <Link
            href="/dashboard"
            className="glass-card"
            style={{
              padding: "10px 20px",
              borderRadius: "50px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              textDecoration: "none",
              color: "inherit",
              fontSize: "14px",
            }}
          >
            <ArrowLeft size={16} /> Dashboard
          </Link>
          <button
            onClick={() => setDark(!dark)}
            className="glass-card"
            style={{ padding: "10px", borderRadius: "50%", cursor: "pointer", color: "#5a9e3a" }}
          >
            {dark ? <SunMedium size={20} /> : <Moon size={20} />}
          </button>
        </header>

        <section className="a-up" style={{ marginBottom: "32px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
            <div style={{ width: "32px", height: "2px", background: "#5a9e3a" }} />
            <span style={{ fontSize: "12px", letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 700, color: "#5a9e3a" }}>
              Settings
            </span>
          </div>
          <h1 className="hd" style={{ fontSize: "clamp(32px, 5vw, 48px)", fontWeight: 800 }}>
            Privacy and terms
          </h1>
          <p style={{ fontSize: "15px", lineHeight: 1.7, marginTop: "10px", color: theme.muted, maxWidth: "760px" }}>
            Review how your account data is handled, what content protections apply, and the platform rules that matter while using InsightClips.
          </p>
        </section>

        <div style={{ display: "grid", gridTemplateColumns: isTablet ? "1fr" : "1fr 1fr", gap: "24px" }}>
          <section className="glass-card a-up" style={{ borderRadius: "24px", padding: "28px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "18px" }}>
              <Shield size={18} color="#5a9e3a" />
              <h2 className="hd" style={{ fontSize: "22px", fontWeight: 800 }}>Privacy</h2>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <SettingRow
                icon={Lock}
                title="Account security"
                text="Your account relies on authenticated access, password protection, and secure session handling."
              />
              <SettingRow
                icon={Eye}
                title="Content visibility"
                text="Uploaded podcast data is intended for the authenticated account owner and related processing flows inside the product."
              />
              <SettingRow
                icon={Zap}
                title="Processing data"
                text="Audio, transcripts, timing, and analysis outputs are used to generate highlights and improve downstream clipping workflows."
              />
            </div>
          </section>

          <section className="glass-card a-up" style={{ borderRadius: "24px", padding: "28px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "18px" }}>
              <FileText size={18} color="#5a9e3a" />
              <h2 className="hd" style={{ fontSize: "22px", fontWeight: 800 }}>Terms</h2>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <SettingRow
                icon={FileText}
                title="Acceptable use"
                text="Only upload content you have rights to use, edit, analyze, and transform into clips."
              />
              <SettingRow
                icon={Shield}
                title="Platform responsibility"
                text="Generated insights and clips should be reviewed before publishing; creators remain responsible for final content use."
              />
              <SettingRow
                icon={Lock}
                title="Account conduct"
                text="Keep your login secure, avoid sharing access, and do not misuse the service in ways that harm other users or the platform."
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
