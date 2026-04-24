"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, ArrowLeft, CheckCircle2, CreditCard,
  FileVideo2, Loader2, Moon, RefreshCcw, SunMedium,
  UploadCloud, XCircle, Zap, ShieldCheck, Clock,
} from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import {
  type PrepareUploadResponse, type UploadPriceResponse, type UploadState,
} from "@/lib/api";

const ACCEPTED_TYPES = ["video/mp4","video/quicktime","video/webm","video/x-m4v"];
const ACCEPTED_EXT   = [".mp4",".mov",".webm",".m4v"];
const PREFLIGHT_MODE = process.env.NEXT_PUBLIC_UPLOAD_PREFLIGHT_MODE ?? "real";

function fmtBytes(b: number) {
  if (!Number.isFinite(b) || b <= 0) return "0 B";
  const u = ["B","KB","MB","GB","TB"];
  const e = Math.min(Math.floor(Math.log(b)/Math.log(1024)), u.length-1);
  const v = b/1024**e;
  return `${v.toFixed(v>=10||e===0?0:1)} ${u[e]}`;
}
function ext(n: string) { const d=n.lastIndexOf("."); return d===-1?"":n.slice(d).toLowerCase(); }
function titleFrom(n: string) { return n.replace(/\.[^.]+$/,"").replace(/[-_]+/g," ").replace(/\s+/g," ").trim().slice(0,80)||"New upload"; }
function shortName(n: string, max = 48) { return n.length <= max ? n : n.slice(0, max - 1).trim() + "…"; }

async function getDuration(file: File): Promise<number> {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<number>((res, rej) => {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.onloadedmetadata = () => res(v.duration);
      v.onerror = () => rej(new Error("Couldn't read duration. Try another file."));
      v.src = url;
    });
  } finally { URL.revokeObjectURL(url); }
}

function validate(file: File): string | null {
  const e = ext(file.name), m = file.type.toLowerCase();
  if (!ACCEPTED_TYPES.includes(m) && !ACCEPTED_EXT.includes(e))
    return "Unsupported format. Please use MP4, MOV, WebM, or M4V.";
  return null;
}

/* ─── RESULT CARD ─── */
type RCProps = { result: UploadPriceResponse; state: UploadState; prep: PrepareUploadResponse | null; dark: boolean };
function ResultCard({ result, state, prep, dark: d }: RCProps) {
  const map = {
    free_ready:       { Icon: CheckCircle2, label: "Free upload available", c: "#3a9e38", bg: d?"rgba(16,52,14,.9)":"rgba(220,252,210,.92)", bd: d?"rgba(58,158,56,.38)":"rgba(140,215,130,.65)" },
    awaiting_payment: { Icon: CreditCard,   label: "Payment required",      c: "#9e8a20", bg: d?"rgba(52,42,6,.9)":"rgba(255,252,218,.92)",  bd: d?"rgba(158,135,32,.38)":"rgba(215,198,110,.65)" },
    blocked:          { Icon: XCircle,      label: "Upload blocked",         c: "#9e2020", bg: d?"rgba(52,8,8,.9)":"rgba(255,232,232,.92)",   bd: d?"rgba(158,32,32,.38)":"rgba(215,148,148,.65)" },
  };
  const cfg = map[state as keyof typeof map] ?? map.blocked;
  const { Icon } = cfg;

  return (
    <div style={{
      borderRadius: 20, border: `1px solid ${cfg.bd}`, background: cfg.bg,
      padding: 24, color: cfg.c,
      animation: "resultIn .5s cubic-bezier(.16,1,.3,1) both",
    }}>
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:14, flexWrap:"wrap", marginBottom:18 }}>
        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
          <div style={{
            width:50, height:50, borderRadius:15, flexShrink:0,
            background:"rgba(255,255,255,.18)", border:`1px solid ${cfg.bd}`,
            display:"flex", alignItems:"center", justifyContent:"center",
            animation:"popIn .55s cubic-bezier(.34,1.56,.64,1) both",
          }}>
            <Icon size={22}/>
          </div>
          <div>
            <div style={{ fontSize:10, letterSpacing:".24em", textTransform:"uppercase", opacity:.6, marginBottom:3 }}>Pre-flight result</div>
            <div style={{ fontFamily:"'Bricolage Grotesque',sans-serif", fontSize:22, fontWeight:700 }}>{cfg.label}</div>
          </div>
        </div>
        <div style={{
          borderRadius:50, border:`1px solid ${cfg.bd}`, background:"rgba(255,255,255,.18)",
          padding:"7px 18px", fontFamily:"monospace", fontSize:16, fontWeight:700,
        }}>
          {result.currency} {result.price.toFixed(2)}
        </div>
      </div>

      <p style={{ fontSize:14, lineHeight:1.72, opacity:.84, marginBottom:16 }}>{result.message}</p>

      {state === "blocked" && (
        <div style={{ borderRadius:14, background:"rgba(255,255,255,.12)", border:`1px solid ${cfg.bd}`, padding:"13px 16px", fontSize:13, fontWeight:500, marginBottom:14 }}>
          Videos longer than 120 minutes cannot be processed. Please trim your video and try again.
        </div>
      )}

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
        {[
          { label:"Duration", value:`${result.duration_minutes.toFixed(1)} min` },
          { label:"Free tier", value:result.free_trial_available?"Available":"Used" },
        ].map(({ label, value }) => (
          <div key={label} style={{ borderRadius:14, background:"rgba(255,255,255,.14)", padding:"14px 16px" }}>
            <div style={{ fontSize:10, letterSpacing:".2em", textTransform:"uppercase", opacity:.6, marginBottom:5 }}>{label}</div>
            <div style={{ fontFamily:"'Bricolage Grotesque',sans-serif", fontSize:18, fontWeight:700 }}>{value}</div>
          </div>
        ))}
      </div>

      {prep && (
        <div style={{ marginTop:14, borderRadius:14, border:`1px solid ${cfg.bd}`, background:"rgba(255,255,255,.12)", padding:"14px 16px", fontSize:13 }}>
          <div style={{ display:"flex", alignItems:"center", gap:7, fontWeight:600, marginBottom:7 }}>
            <CheckCircle2 size={14}/> Record created successfully
          </div>
          <div style={{ opacity:.75, fontFamily:"monospace" }}>ID: {prep.podcast_id}</div>
          <div style={{ opacity:.65, marginTop:4 }}>Status: <strong>{prep.status}</strong></div>
        </div>
      )}
    </div>
  );
}

/* ─── PAGE ─── */
export default function UploadPage() {
  const router   = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { backendToken, loading: authLoading, syncBackendSession } = useAuth();

  const [dark, setDark] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("insightclips-theme") === "dark";
  });
  const [dragging,        setDragging]        = useState(false);
  const [file,            setFile]            = useState<File | null>(null);
  const [state,           setState]           = useState<UploadState>("idle");
  const [err,             setErr]             = useState("");
  const [result,          setResult]          = useState<UploadPriceResponse | null>(null);
  const [prep,            setPrep]            = useState<PrepareUploadResponse | null>(null);
  const [preparing,       setPreparing]       = useState(false);
  const [uploadReference, setUploadReference] = useState<string | null>(null);

  const d       = dark;
  const bg      = d ? "#080f07"              : "#f2f8ee";
  const card    = d ? "rgba(14,24,11,.88)"   : "rgba(255,255,255,.9)";
  const bord    = d ? "rgba(60,100,44,.45)"  : "rgba(160,210,135,.65)";
  const subBord = d ? "rgba(60,100,44,.22)"  : "rgba(160,210,135,.3)";
  const muted   = d ? "rgba(150,200,120,.5)" : "rgba(55,95,38,.48)";
  const hi      = "#5a9e3a";
  const hi2     = "#7ab55c";

  const fileMeta = useMemo(() => {
    if (!file) return null;
    return {
      name: file.name,
      short: shortName(file.name),
      size: fmtBytes(file.size),
      type: file.type || ext(file.name).replace(".", "").toUpperCase() || "Video",
    };
  }, [file]);

  const runServerPreflight = async (f: File, token: string | null, mock: boolean) => {
    const dur = await getDuration(f);
    const formData = new FormData();
    formData.set("file", f);
    formData.set("filename", f.name);
    if (f.type) formData.set("mime_type", f.type);
    formData.set("detected_duration_seconds", String(dur));
    if (mock) formData.set("mock", "true");

    const response = await fetch("/api/upload/preflight", {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof payload.detail === "string" ? payload.detail : "Unable to inspect file.");

    const typed = payload as UploadPriceResponse & { upload_reference?: string };
    if (!typed.upload_reference) throw new Error("Upload staging failed. No upload reference was returned.");
    setUploadReference(typed.upload_reference);
    return typed as UploadPriceResponse;
  };

  const runServerPrepare = async (f: File, quote: UploadPriceResponse, token: string | null, mock: boolean) => {
    if (!uploadReference) throw new Error("Upload staging is missing. Please run the pre-flight check again.");
    const response = await fetch("/api/upload/prepare", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({
        title: titleFrom(f.name), filename: f.name, filesize_bytes: f.size,
        mime_type: f.type || undefined, duration_seconds: quote.duration_seconds,
        price: quote.price, status: quote.status, upload_reference: uploadReference, mock,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof payload.detail === "string" ? payload.detail : "Unable to create record.");
    return payload as PrepareUploadResponse;
  };

  const runPreflight = async (override?: File) => {
    const f = override ?? file;
    if (!f) { setState("error"); setErr("Please select a file first."); return; }
    const ve = validate(f);
    if (ve) { setState("error"); setErr(ve); return; }
    setState("checking"); setErr(""); setResult(null); setPrep(null); setUploadReference(null);
    try {
      const mock  = PREFLIGHT_MODE === "mock";
      const token = backendToken ?? (await syncBackendSession());
      if (!token && !mock) { router.replace("/login"); return; }
      const res = await runServerPreflight(f, token, mock);
      setResult(res); setState(res.status);
    } catch (e) {
      setResult(null); setPrep(null); setUploadReference(null);
      setState("error"); setErr(e instanceof Error ? e.message : "Unable to inspect file.");
    }
  };

  const pickFile = (f: File | null) => {
    setFile(f); setPrep(null); setResult(null); setErr(""); setUploadReference(null);
    if (!f) { setState("idle"); return; }
    const ve = validate(f);
    if (ve) { setState("error"); setErr(ve); return; }
    setState("file_selected");
    void runPreflight(f);
  };

  const reserveRecord = async () => {
    if (!file || !result) return;
    setPreparing(true); setErr("");
    try {
      const mock  = PREFLIGHT_MODE === "mock";
      const token = backendToken ?? (await syncBackendSession());
      if (!token && !mock) { router.replace("/login"); return; }
      setPrep(await runServerPrepare(file, result, token, mock));
    } catch (e) {
      setPrep(null); setState("error");
      setErr(e instanceof Error ? e.message : "Unable to create record.");
    } finally { setPreparing(false); }
  };

  const stateLabel: Record<string, string> = {
    idle: "Waiting", file_selected: "File selected", checking: "Checking…",
    free_ready: "Ready", awaiting_payment: "Payment needed", blocked: "Blocked", error: "Error",
  };
  const stateColor: Record<string, string> = {
    checking: hi, free_ready: "#3a9e38", awaiting_payment: "#9e8a20", blocked: "#9e2020", error: "#9e2020",
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600;700&display=swap');
        *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
        body { font-family:'DM Sans',sans-serif; }

        @keyframes fu       { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes orb      { 0%,100%{transform:translate(0,0)} 50%{transform:translate(28px,-18px)} }
        @keyframes shimmer  { 0%{background-position:-300% center} 100%{background-position:300% center} }
        @keyframes spin     { to{transform:rotate(360deg)} }
        @keyframes dropPulse{ 0%,100%{transform:scale(1)} 50%{transform:scale(1.08)} }
        @keyframes sweep    { from{background-position:200% center} to{background-position:-200% center} }
        @keyframes resultIn { from{opacity:0;transform:translateY(12px) scale(.97)} to{opacity:1;transform:translateY(0) scale(1)} }
        @keyframes popIn    { 0%{transform:scale(0) rotate(-15deg);opacity:0} 70%{transform:scale(1.12) rotate(3deg)} 100%{transform:scale(1) rotate(0);opacity:1} }
        @keyframes glow     { 0%,100%{box-shadow:0 8px 24px rgba(90,158,58,.26)} 50%{box-shadow:0 12px 38px rgba(90,158,58,.48)} }

        .a0{animation:fu .55s .00s cubic-bezier(.16,1,.3,1) both}
        .a1{animation:fu .55s .08s cubic-bezier(.16,1,.3,1) both}
        .a2{animation:fu .55s .16s cubic-bezier(.16,1,.3,1) both}
        .a3{animation:fu .55s .24s cubic-bezier(.16,1,.3,1) both}
        .a4{animation:fu .55s .32s cubic-bezier(.16,1,.3,1) both}
        .a5{animation:fu .55s .40s cubic-bezier(.16,1,.3,1) both}
        .orb { animation:orb 16s ease-in-out infinite; }

        .shimmer-text {
          background:linear-gradient(90deg,currentColor 0%,${hi} 32%,${hi2} 52%,currentColor 100%);
          background-size:300% auto;
          -webkit-background-clip:text; -webkit-text-fill-color:transparent;
          background-clip:text;
          animation:shimmer 4.5s linear infinite;
        }

        .glass { backdrop-filter:blur(28px) saturate(1.6); -webkit-backdrop-filter:blur(28px) saturate(1.6); }

        .drop-zone { transition:all .3s cubic-bezier(.16,1,.3,1); cursor:pointer; }
        .drop-zone:hover { transform:scale(1.006); }
        .drop-zone.over { transform:scale(1.014); border-color:${hi} !important; }
        .drop-zone.over .drop-icon { animation:dropPulse .55s ease-in-out infinite; }

        .btn-primary {
          position:relative; overflow:hidden; cursor:pointer;
          transition:transform .2s cubic-bezier(.34,1.56,.64,1), box-shadow .2s;
          animation:glow 3s ease-in-out infinite;
        }
        .btn-primary:hover  { transform:translateY(-3px); box-shadow:0 20px 50px rgba(90,158,58,.44) !important; }
        .btn-primary:active { transform:scale(.97); animation:none; }
        .btn-primary::after {
          content:''; position:absolute; inset:0;
          background:linear-gradient(105deg,transparent 40%,rgba(255,255,255,.22) 50%,transparent 60%);
          background-size:200% 100%; background-position:100%;
          transition:background-position .5s;
        }
        .btn-primary:hover::after { background-position:-100%; }

        .btn-ghost { transition:transform .2s cubic-bezier(.34,1.56,.64,1), opacity .2s; cursor:pointer; }
        .btn-ghost:hover  { transform:translateY(-2px); }
        .btn-ghost:active { transform:scale(.96); }

        .back-link { transition:transform .2s cubic-bezier(.34,1.56,.64,1); }
        .back-link:hover { transform:translateX(-4px); }

        .chip { transition:transform .2s cubic-bezier(.34,1.56,.64,1); }
        .chip:hover { transform:scale(1.03); }

        .sweep-bar {
          background:linear-gradient(90deg,transparent,rgba(90,158,58,.7),${hi2},rgba(90,158,58,.7),transparent);
          background-size:400% 100%;
          animation:sweep 1.5s ease-in-out infinite;
        }

        .theme-thumb { transition:transform .38s cubic-bezier(.34,1.56,.64,1); }
        .theme-track { transition:background .3s; }

        ::-webkit-scrollbar { width:4px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:${bord}; border-radius:4px; }
      `}</style>

      <div style={{ minHeight:"100vh", background:bg, color:d?"#e8f5df":"#152412", transition:"background .4s, color .4s", fontFamily:"'DM Sans',sans-serif" }}>

        {/* ORBS */}
        <div style={{ position:"fixed", inset:0, pointerEvents:"none", zIndex:0, overflow:"hidden" }}>
          <div className="orb" style={{ position:"absolute", top:"-120px", right:"-90px", width:520, height:520, borderRadius:"50%", background:d?"rgba(28,70,16,.58)":"rgba(158,220,128,.40)", filter:"blur(100px)" }}/>
          <div className="orb" style={{ position:"absolute", bottom:"-90px", left:"-80px", width:440, height:440, borderRadius:"50%", background:d?"rgba(16,52,10,.5)":"rgba(185,238,158,.36)", filter:"blur(90px)", animationDelay:"-8s" }}/>
        </div>

        <div style={{ position:"relative", zIndex:1, maxWidth:780, margin:"0 auto", padding:"24px 22px 64px" }}>

          {/* TOP BAR */}
          <div className="a0" style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:24 }}>
            <Link href="/dashboard" className="back-link glass" style={{
              display:"flex", alignItems:"center", gap:8,
              border:`1px solid ${bord}`, borderRadius:50, padding:"9px 18px",
              background:card, color:d?"#9dce7a":"#3a6e25",
              fontSize:13, fontWeight:500, textDecoration:"none",
            }}>
              <ArrowLeft size={14}/> Dashboard
            </Link>

            <button
              onClick={() => { setDark(v => !v); window.localStorage.setItem("insightclips-theme", dark ? "light" : "dark"); }}
              className="btn-ghost glass"
              style={{
                display:"flex", alignItems:"center", gap:8,
                border:`1px solid ${bord}`, borderRadius:50, padding:"8px 14px",
                background:card, color:d?"#9dce7a":"#3a6e25", fontSize:12, fontWeight:500,
              }}
            >
              <div className="theme-track" style={{ position:"relative", width:32, height:18, borderRadius:9, background:d?hi:"rgba(155,210,130,.55)" }}>
                <div className="theme-thumb" style={{ position:"absolute", top:1, width:16, height:16, borderRadius:"50%", background:"white", boxShadow:"0 1px 4px rgba(0,0,0,.2)", transform:d?"translateX(14px)":"translateX(1px)" }}/>
              </div>
              {d ? <SunMedium size={13}/> : <Moon size={13}/>}
            </button>
          </div>

          {/* HERO CARD */}
          <div className="a1 glass" style={{
            borderRadius:24, border:`1px solid ${bord}`, background:card,
            padding:"36px 36px 32px", marginBottom:16, position:"relative", overflow:"hidden",
          }}>
            <div style={{ position:"absolute", top:-60, right:-60, width:200, height:200, borderRadius:"50%", background:d?"rgba(90,158,58,.08)":"rgba(90,158,58,.06)", border:`1px solid ${subBord}` }}/>
            <div style={{ position:"absolute", top:-30, right:-30, width:120, height:120, borderRadius:"50%", background:d?"rgba(90,158,58,.06)":"rgba(90,158,58,.04)", border:`1px solid ${subBord}` }}/>

            <div style={{ display:"flex", flexWrap:"wrap", alignItems:"flex-start", justifyContent:"space-between", gap:24 }}>
              <div style={{ maxWidth:420 }}>
                <div style={{
                  width:54, height:54, borderRadius:16, marginBottom:20,
                  background:`linear-gradient(145deg,rgba(90,158,58,${d?.22:.14}),rgba(147,196,125,${d?.12:.08}))`,
                  border:`1px solid ${bord}`,
                  display:"flex", alignItems:"center", justifyContent:"center",
                }}>
                  <UploadCloud size={24} color={hi}/>
                </div>

                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
                  <div style={{ width:24, height:2, borderRadius:2, background:hi }}/>
                  <span style={{ fontSize:10, letterSpacing:".3em", textTransform:"uppercase", color:hi2, fontWeight:700 }}>Pre-flight check</span>
                </div>

                <h1 style={{ fontFamily:"'DM Serif Display',serif", fontSize:"clamp(26px,4vw,38px)", fontStyle:"italic", fontWeight:400, lineHeight:1.1, marginBottom:14 }}>
                  Check before{" "}
                  <span className="shimmer-text">you upload.</span>
                </h1>
                <p style={{ fontSize:14, color:muted as string, lineHeight:1.75 }}>
                  Select a video, instantly see duration and pricing, then confirm — before any credits are used.
                </p>
              </div>

              {/* Pricing panel */}
              <div style={{
                borderRadius:18, border:`1px solid ${bord}`,
                background:d?"rgba(10,20,8,.65)":"rgba(238,252,228,.72)",
                padding:"18px 20px", minWidth:185, flexShrink:0,
              }}>
                <div style={{ fontSize:10, letterSpacing:".26em", textTransform:"uppercase", color:hi2, fontWeight:700, marginBottom:14 }}>Pricing tiers</div>
                {[
                  { dot:"#5a9e3a", r:"0 – 30 min",   p:"Free *" },
                  { dot:"#8ab55c", r:"30 – 60 min",  p:"$2.00" },
                  { dot:"#d4a83a", r:"60 – 120 min", p:"$4.00" },
                  { dot:"#e07070", r:"120+ min",      p:"Blocked" },
                ].map(({ dot, r, p }) => (
                  <div key={r} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10, fontSize:13, gap:10 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <div style={{ width:7, height:7, borderRadius:"50%", background:dot, flexShrink:0 }}/>
                      <span style={{ color:muted as string }}>{r}</span>
                    </div>
                    <span style={{ fontWeight:600, color:d?"#e8f5df":"#152412", whiteSpace:"nowrap" }}>{p}</span>
                  </div>
                ))}
                <div style={{ marginTop:10, paddingTop:10, borderTop:`1px solid ${subBord}`, fontSize:11, color:muted as string }}>
                  * First upload only
                </div>
              </div>
            </div>
          </div>

          {/* WARNING BANNER */}
          <div className="a2 glass" style={{
            borderRadius:16,
            border:`1px solid ${d?"rgba(155,115,25,.35)":"rgba(215,188,100,.55)"}`,
            background:d?"rgba(44,30,4,.75)":"rgba(255,252,218,.88)",
            padding:"13px 18px", display:"flex", alignItems:"flex-start", gap:11,
            fontSize:13, color:d?"#d4a83a":"#6d5010", marginBottom:16,
          }}>
            <AlertTriangle size={15} style={{ marginTop:1, flexShrink:0 }}/>
            <span><strong>120-minute limit.</strong> Videos over this length are blocked automatically during pre-flight.</span>
          </div>

          {/* DROP ZONE */}
          <div
            className={`a2 drop-zone glass${dragging ? " over" : ""}`}
            style={{
              borderRadius:22,
              border:`2px dashed ${dragging ? hi : bord}`,
              background:dragging ? (d?"rgba(30,68,16,.55)":"rgba(215,248,198,.65)") : card,
              padding:"56px 24px", textAlign:"center", marginBottom:16,
            }}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={e => { e.preventDefault(); setDragging(false); }}
            onDrop={e => { e.preventDefault(); setDragging(false); pickFile(e.dataTransfer.files[0] ?? null); }}
            onClick={() => inputRef.current?.click()}
          >
            <input ref={inputRef} type="file" accept={ACCEPTED_EXT.join(",")} style={{ display:"none" }}
              onChange={e => pickFile(e.target.files?.[0] ?? null)}/>

            <div style={{ display:"flex", flexDirection:"column", alignItems:"center" }}>
              <div className="drop-icon" style={{
                width:88, height:88, borderRadius:24, marginBottom:22,
                background:d?"rgba(90,158,58,.14)":"rgba(90,158,58,.09)",
                border:`1px solid ${bord}`,
                display:"flex", alignItems:"center", justifyContent:"center",
              }}>
                <FileVideo2 size={36} color={hi}/>
              </div>

              <h2 style={{ fontFamily:"'DM Serif Display',serif", fontStyle:"italic", fontSize:22, fontWeight:400, marginBottom:8 }}>
                {dragging ? "Drop to analyze ✓" : "Drag & drop your video"}
              </h2>
              <p style={{ fontSize:13, color:muted as string, marginBottom:22 }}>
                Supports MP4 · MOV · WebM · M4V
              </p>

              <button
                type="button"
                onClick={e => { e.stopPropagation(); inputRef.current?.click(); }}
                className="btn-primary"
                style={{
                  display:"inline-flex", alignItems:"center", gap:9,
                  borderRadius:50, padding:"13px 30px", border:"none",
                  background:`linear-gradient(135deg,#3e7a28,${hi})`,
                  color:"white", fontSize:14, fontWeight:600,
                  boxShadow:`0 10px 30px rgba(90,158,58,.30)`,
                  fontFamily:"'DM Sans',sans-serif",
                }}
              >
                <UploadCloud size={16}/> Browse file
              </button>
            </div>
          </div>

          {/* FILE INFO */}
          {fileMeta && (
            <div className="a3 glass" style={{ borderRadius:20, border:`1px solid ${bord}`, background:card, padding:22, marginBottom:16 }}>

              {/* Header row */}
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, marginBottom:16 }}>
                <div style={{ minWidth:0, flex:1 }}>
                  <div style={{ fontSize:10, letterSpacing:".24em", textTransform:"uppercase", color:muted as string, fontWeight:600, marginBottom:5 }}>
                    Selected file
                  </div>
                  {/* ── FIXED: short name + tooltip via title attr ── */}
                  <div
                    title={fileMeta.name}
                    style={{
                      fontFamily:"'DM Serif Display',serif",
                      fontSize:18, fontStyle:"italic",
                      overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
                      maxWidth:"100%",
                    }}
                  >
                    {fileMeta.short}
                  </div>
                </div>

                {/* Status pill */}
                <div style={{
                  display:"flex", alignItems:"center", gap:6, flexShrink:0,
                  borderRadius:50, padding:"5px 13px",
                  background:state==="checking"
                    ? d?"rgba(90,158,58,.22)":"rgba(90,158,58,.12)"
                    : d?"rgba(55,92,38,.18)":"rgba(175,215,150,.25)",
                  border:`1px solid ${subBord}`,
                  fontSize:11, fontWeight:600, letterSpacing:".14em", textTransform:"uppercase",
                  color:stateColor[state] || (muted as string),
                }}>
                  {state === "checking" && (
                    <div style={{ width:7, height:7, borderRadius:"50%", border:`1.5px solid ${hi}`, borderTopColor:"transparent", animation:"spin .8s linear infinite", flexShrink:0 }}/>
                  )}
                  {stateLabel[state] || state}
                </div>
              </div>

              {/* Progress bar */}
              {state === "checking" && (
                <div style={{ marginBottom:16, height:3, borderRadius:2, background:d?"rgba(55,92,38,.4)":"rgba(175,215,150,.45)", overflow:"hidden" }}>
                  <div className="sweep-bar" style={{ height:"100%", borderRadius:2, width:"100%" }}/>
                </div>
              )}

              {/* ── FIXED CHIPS: filename full width, size+format below ── */}
              <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:18 }}>
                {/* Filename — full width */}
                <div className="chip" style={{
                  borderRadius:12, padding:"11px 14px",
                  background:d?"rgba(90,158,58,.09)":"rgba(90,158,58,.06)",
                  border:`1px solid ${subBord}`,
                }}>
                  <div style={{ fontSize:9, letterSpacing:".18em", textTransform:"uppercase", color:muted as string, fontWeight:600, marginBottom:4 }}>
                    Filename
                  </div>
                  <div style={{
                    fontSize:12, fontWeight:600,
                    overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
                    color:d?"#dff0d8":"#1e3418",
                  }}
                    title={fileMeta.name}
                  >
                    {fileMeta.name}
                  </div>
                </div>

                {/* Size + Format — 2 col */}
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                  {[
                    { label:"File size", value:fileMeta.size },
                    { label:"Format",   value:fileMeta.type },
                  ].map(({ label, value }) => (
                    <div key={label} className="chip" style={{
                      borderRadius:12, padding:"11px 14px",
                      background:d?"rgba(90,158,58,.09)":"rgba(90,158,58,.06)",
                      border:`1px solid ${subBord}`,
                    }}>
                      <div style={{ fontSize:9, letterSpacing:".18em", textTransform:"uppercase", color:muted as string, fontWeight:600, marginBottom:4 }}>
                        {label}
                      </div>
                      <div style={{ fontSize:13, fontWeight:600, color:d?"#dff0d8":"#1e3418" }}>
                        {value}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                <button
                  type="button"
                  onClick={() => void runPreflight()}
                  disabled={state === "checking" || authLoading}
                  className="btn-primary"
                  style={{
                    display:"inline-flex", alignItems:"center", gap:8,
                    borderRadius:50, padding:"10px 24px", border:"none",
                    background:`linear-gradient(135deg,#3e7a28,${hi})`,
                    color:"white", fontSize:13, fontWeight:600,
                    opacity:state==="checking" ? .65 : 1,
                    boxShadow:`0 8px 22px rgba(90,158,58,.26)`,
                    fontFamily:"'DM Sans',sans-serif",
                  }}
                >
                  {state === "checking" ? <Loader2 size={14} style={{ animation:"spin 1s linear infinite" }}/> : <UploadCloud size={14}/>}
                  {state === "checking" ? "Analyzing…" : "Re-analyze"}
                </button>

                <button
                  type="button"
                  onClick={() => pickFile(null)}
                  className="btn-ghost glass"
                  style={{
                    display:"inline-flex", alignItems:"center", gap:8,
                    borderRadius:50, padding:"10px 20px",
                    border:`1px solid ${bord}`, background:"transparent",
                    color:d?"#9dce7a":"#3a6e25", fontSize:13, fontWeight:500,
                    fontFamily:"'DM Sans',sans-serif",
                  }}
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          {/* ERROR */}
          {err && (
            <div className="a4 glass" style={{
              borderRadius:18,
              border:`1px solid ${d?"rgba(175,70,70,.35)":"rgba(210,148,148,.55)"}`,
              background:d?"rgba(44,8,8,.75)":"rgba(255,232,232,.9)",
              padding:"18px 20px", display:"flex", alignItems:"flex-start", gap:12,
              fontSize:13, color:d?"#e08080":"#934545", marginBottom:16,
            }}>
              <AlertTriangle size={16} style={{ marginTop:1, flexShrink:0 }}/>
              <div>
                <div style={{ fontWeight:600, marginBottom:5 }}>Error</div>
                <div style={{ opacity:.82, lineHeight:1.65 }}>{err}</div>
                {file && (
                  <button
                    type="button"
                    onClick={() => void runPreflight()}
                    className="btn-ghost"
                    style={{
                      marginTop:10, display:"inline-flex", alignItems:"center", gap:6,
                      borderRadius:50, border:"1px solid currentColor", padding:"6px 14px",
                      background:"rgba(255,255,255,.1)", color:"currentColor",
                      fontSize:12, fontWeight:500, fontFamily:"'DM Sans',sans-serif",
                    }}
                  >
                    <RefreshCcw size={11}/> Retry
                  </button>
                )}
              </div>
            </div>
          )}

          {/* RESULT */}
          {result && (
            <div style={{ marginBottom:16 }}>
              <ResultCard result={result} state={state} prep={prep} dark={d}/>
            </div>
          )}

          {/* NEXT STEP */}
          {result && state !== "blocked" && (
            <div className="a5 glass" style={{ borderRadius:20, border:`1px solid ${bord}`, background:card, padding:"24px 26px" }}>
              <div style={{ display:"flex", flexWrap:"wrap", alignItems:"center", justifyContent:"space-between", gap:18 }}>
                <div style={{ display:"flex", alignItems:"flex-start", gap:16 }}>
                  <div style={{
                    width:46, height:46, borderRadius:14, flexShrink:0,
                    background:d?"rgba(90,158,58,.18)":"rgba(90,158,58,.1)",
                    border:`1px solid ${subBord}`,
                    display:"flex", alignItems:"center", justifyContent:"center",
                  }}>
                    {state === "free_ready" ? <ShieldCheck size={20} color={hi}/> : <Zap size={20} color={hi}/>}
                  </div>
                  <div>
                    <div style={{ fontSize:10, letterSpacing:".24em", textTransform:"uppercase", color:hi2, fontWeight:700, marginBottom:5 }}>Next step</div>
                    <div style={{ fontFamily:"'DM Serif Display',serif", fontStyle:"italic", fontSize:19, marginBottom:4 }}>
                      {state === "free_ready" ? "Reserve your free upload" : "Create payment record"}
                    </div>
                    <div style={{ fontSize:13, color:muted as string, lineHeight:1.65, display:"flex", alignItems:"center", gap:7 }}>
                      <Clock size={13}/> Payment checkout and AI processing come in the next step.
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => void reserveRecord()}
                  disabled={preparing}
                  className="btn-ghost"
                  style={{
                    display:"inline-flex", alignItems:"center", gap:8,
                    borderRadius:14, padding:"12px 22px",
                    border:`1px solid ${d?"rgba(90,158,58,.5)":bord}`,
                    background:d?"rgba(90,158,58,.14)":"rgba(90,158,58,.08)",
                    color:d?"#9dce7a":"#3a6e25", fontSize:13, fontWeight:600,
                    opacity:preparing ? .6 : 1,
                    fontFamily:"'DM Sans',sans-serif",
                  }}
                >
                  {preparing ? <Loader2 size={14} style={{ animation:"spin 1s linear infinite" }}/> : <CheckCircle2 size={14}/>}
                  {preparing ? "Saving…" : "Create record"}
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
}