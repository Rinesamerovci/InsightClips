"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Moon, SunMedium, Shield, Star,
  Calendar, Mail, ChevronRight, Headphones, Edit3, Bell, Globe, Check, X
} from "lucide-react";

import { UserProfileCard } from "@/components/UserProfileCard";
import { useAuth } from "@/context/AuthContext";
import { getJson } from "@/lib/api";

type ProfileResponse = {
  id: string; email: string; full_name: string | null;
  profile_picture_url: string | null; free_trial_used: boolean;
  created_at: string | null; updated_at: string | null;
};

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,700;12..96,800&family=Outfit:wght@300;400;500;600&display=swap');
  
  :root { --transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
  *{box-sizing:border-box;margin:0;padding:0}
  .hd{font-family:'Bricolage Grotesque',sans-serif}
  .bd{font-family:'Outfit',sans-serif; transition: var(--transition);}

  @keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
  @keyframes shimmer{0%{background-position:-200% center}100%{background-position:200% center}}
  @keyframes ring{0%{transform:scale(.8);opacity:.8}100%{transform:scale(2.2);opacity:0}}

  .a-up { animation: fadeUp 0.7s cubic-bezier(0.16, 1, 0.3, 1) both; }
  .shimmer {
    background: linear-gradient(90deg, var(--c-text) 0%, #5a9e3a 50%, var(--c-text) 100%);
    background-size: 200% auto; -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    animation: shimmer 3s linear infinite;
  }

  .glass-card {
    backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
    background: var(--surface); border: 1px solid var(--border); transition: var(--transition);
  }
  .glass-card:hover { transform: translateY(-4px); border-color: #5a9e3a; box-shadow: 0 20px 40px var(--shadow); }

  .action-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 16px; border-radius: 14px; border: 1px solid var(--border);
    background: var(--row-bg); text-decoration: none; transition: var(--transition);
  }
  .action-row:hover { transform: translateX(6px); background: var(--row-hover); }
  
  .edit-input {
    background: rgba(90, 158, 58, 0.05); border: 2px solid #5a9e3a;
    border-radius: 12px; padding: 8px 16px; color: var(--c-text);
    outline: none; width: 100%; max-width: 400px;
  }
`;

export default function ProfilePage() {
  const router = useRouter();
  const { backendToken, loading: authLoading, syncBackendSession } = useAuth();
  
  // States
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dark, setDark] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("insightclips-theme") === "dark";
  });

  // Edit States
  const [isEditing, setIsEditing] = useState(false);
  const [newName, setNewName] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => { 
    window.localStorage.setItem("insightclips-theme", dark ? "dark" : "light");
  }, [dark]);

  useEffect(() => {
    if (authLoading) return;
    const load = async () => {
      setLoading(true);
      try {
        const token = backendToken ?? (await syncBackendSession());
        if (!token) { router.replace("/login"); return; }
        const data = await getJson<ProfileResponse>("/users/profile", token);
        setProfile(data);
        setNewName(data.full_name || "");
      } catch (e) {
        setError("Error loading profile data.");
      } finally { setLoading(false); }
    };
    void load();
  }, [authLoading, backendToken, router, syncBackendSession]);

  const handleSaveName = async () => {
    if (!backendToken || isSaving) return;
    setIsSaving(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/users/profile`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${backendToken}`
        },
        body: JSON.stringify({ full_name: newName })
      });

      if (!res.ok) throw new Error("Update failed");

      setProfile(prev => prev ? { ...prev, full_name: newName } : null);
      setIsEditing(false);
    } catch (err) {
      setError("Failed to save changes. Try again.");
    } finally { setIsSaving(false); }
  };

  const theme = useMemo(() => ({
    bg: dark ? "#0b1309" : "#f0f7eb",
    surface: dark ? "rgba(20, 35, 15, 0.7)" : "rgba(255, 255, 255, 0.75)",
    border: dark ? "rgba(90, 158, 58, 0.25)" : "rgba(90, 158, 58, 0.15)",
    text: dark ? "#dff0d4" : "#1a2e18",
    muted: dark ? "rgba(157, 206, 122, 0.6)" : "rgba(74, 124, 52, 0.65)",
    rowBg: dark ? "rgba(255, 255, 255, 0.03)" : "rgba(90, 158, 58, 0.04)",
    shadow: dark ? "rgba(0,0,0,0.4)" : "rgba(90, 158, 58, 0.1)",
  }), [dark]);

  if (loading || authLoading) return (
    <div className="bd" style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", background: theme.bg }}>
      <style>{CSS}</style>
      <Headphones className="shimmer" size={32} />
    </div>
  );

  return (
    <div className="bd" style={{
      minHeight: "100vh", background: theme.bg, color: theme.text,
      "--surface": theme.surface, "--border": theme.border, "--c-text": theme.text,
      "--muted": theme.muted, "--row-bg": theme.rowBg, "--shadow": theme.shadow
    } as React.CSSProperties}>
      <style>{CSS}</style>

      <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "40px 24px" }}>
        
        {/* Header */}
        <header className="a-up" style={{ display: "flex", justifyContent: "space-between", marginBottom: "40px" }}>
          <Link href="/dashboard" className="glass-card" style={{ padding: "10px 20px", borderRadius: "50px", display: "flex", alignItems: "center", gap: "8px", textDecoration: "none", color: "inherit", fontSize: "14px" }}>
            <ArrowLeft size={16} /> Dashboard
          </Link>
          <button onClick={() => setDark(!dark)} className="glass-card" style={{ padding: "10px", borderRadius: "50%", cursor: "pointer", color: "#5a9e3a" }}>
            {dark ? <SunMedium size={20} /> : <Moon size={20} />}
          </button>
        </header>

        {/* Hero Section - Editable Name */}
        <section className="a-up" style={{ marginBottom: "32px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
            <div style={{ width: "32px", height: "2px", background: "#5a9e3a" }} />
            <span style={{ fontSize: "12px", letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 700, color: "#5a9e3a" }}>Profile</span>
          </div>

          {isEditing ? (
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <input 
                className="hd edit-input" 
                style={{ fontSize: "28px", fontWeight: 800 }} 
                value={newName} 
                onChange={(e) => setNewName(e.target.value)}
                autoFocus
              />
              <button onClick={handleSaveName} disabled={isSaving} style={{ background: "#5a9e3a", border: "none", borderRadius: "12px", padding: "12px", cursor: "pointer", color: "white" }}>
                {isSaving ? "..." : <Check size={20} />}
              </button>
              <button onClick={() => { setIsEditing(false); setNewName(profile?.full_name || ""); }} style={{ background: "rgba(255,0,0,0.1)", border: "none", borderRadius: "12px", padding: "12px", cursor: "pointer", color: "#ff4444" }}>
                <X size={20} />
              </button>
            </div>
          ) : (
            <h1 className="hd" style={{ fontSize: "clamp(32px, 5vw, 48px)", fontWeight: 800 }}>
              {profile?.full_name ? <>Welcome, <span className="shimmer">{profile.full_name}</span></> : "Your Account"}
            </h1>
          )}
        </section>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "24px" }}>
          
          <main style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            <div className="glass-card a-up" style={{ borderRadius: "24px", padding: "32px" }}>
              {profile && <UserProfileCard profile={profile} />}
            </div>

            <div className="glass-card a-up" style={{ borderRadius: "24px", padding: "28px" }}>
              <h3 className="hd" style={{ fontSize: "14px", opacity: 0.6, marginBottom: "20px" }}>ACCOUNT DETAILS</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div className="action-row" style={{ cursor: "default" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}><Mail size={16} color="#5a9e3a" /> <span>Email</span></div>
                  <span style={{ fontWeight: 600 }}>{profile?.email}</span>
                </div>
                <div className="action-row" style={{ cursor: "default" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}><Calendar size={16} color="#5a9e3a" /> <span>Member Since</span></div>
                  <span style={{ fontWeight: 600 }}>{new Date(profile?.created_at || "").getFullYear()}</span>
                </div>
              </div>
            </div>
          </main>

          <aside style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            <div className="glass-card a-up" style={{ borderRadius: "24px", padding: "24px" }}>
              <h3 className="hd" style={{ fontSize: "14px", opacity: 0.6, marginBottom: "16px" }}>SETTINGS</h3>
              <button onClick={() => setIsEditing(true)} className="action-row" style={{ width: "100%", cursor: "pointer" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <Edit3 size={16} color="#5a9e3a" /> <span>Edit Full Name</span>
                </div>
                <ChevronRight size={14} />
              </button>
              <div className="action-row" style={{ marginTop: "10px", opacity: 0.5 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}><Bell size={16} /> <span>Notifications</span></div>
              </div>
            </div>

            <div className="glass-card a-up" style={{ borderRadius: "24px", padding: "24px", background: "linear-gradient(135deg, var(--surface) 0%, rgba(90,158,58,0.1) 100%)" }}>
              <div className="hd" style={{ fontSize: "20px", fontWeight: 800, color: "#5a9e3a" }}>InsightClips Free</div>
              <p style={{ fontSize: "13px", marginTop: "8px", opacity: 0.7 }}>
                {profile?.free_trial_used ? "Usage limit reached." : "1 free video left."}
              </p>
              <Link href="/upload" style={{ 
                display: "block", textAlign: "center", padding: "12px", borderRadius: "14px", 
                background: "#5a9e3a", color: "white", textDecoration: "none", fontWeight: 700, marginTop: "16px"
              }}>
                Upload Now
              </Link>
            </div>
          </aside>
        </div>

        {error && <div style={{ color: "#ff4444", textAlign: "center", marginTop: "20px" }}>{error}</div>}
      </div>
    </div>
  );
}