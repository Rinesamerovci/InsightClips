"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Moon, Sparkles, SunMedium } from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import { analyzePodcast, confirmMockPayment, generateClips, getClips, ApiRequestError } from "@/lib/api";
import { getStudioTheme, THEME_STORAGE_KEY } from "@/lib/brand";

type CompletionPhase = "loading" | "processing" | "error";

export default function UploadCompletePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { backendToken, loading: authLoading, syncBackendSession } = useAuth();

  const [dark, setDark] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.localStorage.getItem(THEME_STORAGE_KEY) === "dark";
  });
  const podcastId = searchParams.get("podcast_id")?.trim() ?? "";
  const payment = searchParams.get("payment")?.trim().toLowerCase() ?? "success";
  const finalizeStorageKey = podcastId ? `insightclips:checkout-finalize:${podcastId}` : "";
  const initialError =
    payment !== "success"
      ? "Payment was not completed."
      : !podcastId
        ? "Missing podcast id from the checkout return."
        : "";
  const shortPodcastId =
    podcastId.length > 14 ? `${podcastId.slice(0, 8)}...${podcastId.slice(-4)}` : podcastId || "Missing";
  const [phase, setPhase] = useState<CompletionPhase>(() => {
    if (initialError) {
      return "error";
    }

    if (typeof window !== "undefined" && finalizeStorageKey) {
      return window.sessionStorage.getItem(finalizeStorageKey) === "running" ? "processing" : "loading";
    }

    return "loading";
  });
  const [detail, setDetail] = useState("Verifying your payment and preparing the clip workspace.");
  const [error, setError] = useState(initialError);
  const finalizeStartedRef = useRef(false);
  const t = useMemo(() => getStudioTheme(dark), [dark]);

  useEffect(() => {
    window.localStorage.setItem(THEME_STORAGE_KEY, dark ? "dark" : "light");
  }, [dark]);

  useEffect(() => {
    if (authLoading || phase !== "loading") {
      return;
    }
    if (finalizeStartedRef.current) {
      return;
    }
    finalizeStartedRef.current = true;
    if (finalizeStorageKey) {
      window.sessionStorage.setItem(finalizeStorageKey, "running");
    }

    let cancelled = false;

    const finalizeCheckout = async () => {
      setPhase("processing");

      try {
        const token = backendToken ?? (await syncBackendSession());
        if (!token) {
          if (finalizeStorageKey) {
            window.sessionStorage.removeItem(finalizeStorageKey);
          }
          router.replace("/login");
          return;
        }

        setDetail("Marking the episode as paid.");
        await confirmMockPayment(podcastId, "paid", token);

        setDetail("Analyzing the recording and building your clips.");
        const analysis = await analyzePodcast(podcastId, {}, token);

        setDetail("Rendering your clips.");
        await generateClips(
          podcastId,
          {
            score_segments: analysis.top_scoring_segments,
            use_preferred_generation_settings: true,
            visual_output_mode: "original_people",
          },
          token,
        );

        if (!cancelled) {
          if (finalizeStorageKey) {
            window.sessionStorage.removeItem(finalizeStorageKey);
          }
          router.replace(`/clips/generated?podcastId=${encodeURIComponent(podcastId)}`);
        }
      } catch (err) {
        if (cancelled) {
          return;
        }
        if (err instanceof ApiRequestError && err.status === 409) {
          setDetail("Clip rendering is already in progress.");
          setPhase("processing");
          return;
        }
        setError(err instanceof Error ? err.message : "Unable to finish payment processing.");
        setPhase("error");
        finalizeStartedRef.current = false;
        if (finalizeStorageKey) {
          window.sessionStorage.removeItem(finalizeStorageKey);
        }
      }
    };

    void finalizeCheckout();

    return () => {
      cancelled = true;
    };
  }, [authLoading, backendToken, finalizeStorageKey, payment, phase, podcastId, router, syncBackendSession]);

  useEffect(() => {
    if (phase !== "processing" || !podcastId) {
      return;
    }

    let cancelled = false;
    let timeoutId: number | null = null;

    const pollForAnalysis = async () => {
      try {
        const token = backendToken ?? (await syncBackendSession());
        if (!token || cancelled) {
          return;
        }

        const result = await getClips(podcastId, token);
        if (cancelled) {
          return;
        }

        if (result.clips.length === 0) {
          timeoutId = window.setTimeout(() => {
            void pollForAnalysis();
          }, 3500);
          return;
        }

        if (finalizeStorageKey) {
          window.sessionStorage.removeItem(finalizeStorageKey);
        }
        router.replace(`/clips/generated?podcastId=${encodeURIComponent(podcastId)}`);
      } catch (err) {
        if (cancelled) {
          return;
        }

        if (err instanceof ApiRequestError && err.status === 404) {
          timeoutId = window.setTimeout(() => {
            void pollForAnalysis();
          }, 3500);
          return;
        }

        setError(err instanceof Error ? err.message : "Unable to confirm clip processing.");
        setPhase("error");
        finalizeStartedRef.current = false;
        if (finalizeStorageKey) {
          window.sessionStorage.removeItem(finalizeStorageKey);
        }
      }
    };

    void pollForAnalysis();

    return () => {
      cancelled = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [backendToken, finalizeStorageKey, phase, podcastId, router, syncBackendSession]);

  if (authLoading || phase === "processing") {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: t.bg,
          color: t.text,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "28px 16px",
          fontFamily: "'DM Sans',sans-serif",
        }}
      >
        <main
          style={{
            width: "100%",
            maxWidth: 560,
            borderRadius: 28,
            border: `1px solid ${t.border}`,
            background: t.card,
            padding: 28,
            boxShadow: "0 24px 60px rgba(0,0,0,.16)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 10, color: t.textSub, fontSize: 13, fontWeight: 700 }}>
              <Sparkles size={16} color={t.accent} />
              Finalizing checkout
            </div>
            <button
              type="button"
              onClick={() => setDark((value) => !value)}
              style={{
                borderRadius: 999,
                border: `1px solid ${t.border}`,
                background: t.card,
                color: t.textSub,
                padding: "9px 12px",
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                cursor: "pointer",
                fontWeight: 700,
                fontSize: 12,
              }}
            >
              {dark ? <SunMedium size={14} /> : <Moon size={14} />}
              {dark ? "Light" : "Dark"}
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                border: `2px solid ${t.border}`,
                borderTopColor: t.accent,
                animation: "spin 1s linear infinite",
                flex: "0 0 auto",
              }}
            />
            <div>
              <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 34, fontStyle: "italic", lineHeight: 1.05, marginBottom: 8 }}>
                {phase === "processing" ? "Preparing your clips" : "Loading"}
              </div>
              <div style={{ color: t.textSub, lineHeight: 1.7, fontSize: 14 }}>{detail}</div>
            </div>
          </div>

          <div
            style={{
              marginTop: 24,
              borderRadius: 18,
              border: `1px solid ${t.borderSub}`,
              background: t.bg,
              padding: 16,
              color: t.textSub,
              fontSize: 13,
              lineHeight: 1.6,
            }}
          >
            Podcast ID: <span style={{ fontFamily: "var(--font-app-mono)" }}>{shortPodcastId}</span>
          </div>
        </main>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Serif+Display:ital@0;1&display=swap');
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: t.bg,
        color: t.text,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "28px 16px",
        fontFamily: "'DM Sans',sans-serif",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Serif+Display:ital@0;1&display=swap');
      `}</style>
      <main
        style={{
          width: "100%",
          maxWidth: 560,
          borderRadius: 28,
          border: `1px solid ${t.border}`,
          background: t.card,
          padding: 28,
          boxShadow: "0 24px 60px rgba(0,0,0,.16)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 10, color: t.textSub, fontSize: 13, fontWeight: 700 }}>
            <Sparkles size={16} color={t.accent} />
            Checkout error
          </div>
          <button
            type="button"
            onClick={() => setDark((value) => !value)}
            style={{
              borderRadius: 999,
              border: `1px solid ${t.border}`,
              background: t.card,
              color: t.textSub,
              padding: "9px 12px",
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              cursor: "pointer",
              fontWeight: 700,
              fontSize: 12,
            }}
          >
            {dark ? <SunMedium size={14} /> : <Moon size={14} />}
            {dark ? "Light" : "Dark"}
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: "rgba(192,57,43,.12)",
              border: "1px solid rgba(192,57,43,.24)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flex: "0 0 auto",
            }}
          >
            <AlertTriangle size={28} color="#c0392b" />
          </div>
          <div>
            <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 34, fontStyle: "italic", lineHeight: 1.05, marginBottom: 8 }}>
              Payment needs attention
            </div>
            <div style={{ color: t.textSub, lineHeight: 1.7, fontSize: 14 }}>{error}</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 24 }}>
          <button
            type="button"
            onClick={() => {
              setError("");
              setDetail("Verifying your payment and preparing the clip workspace.");
              setPhase("loading");
              finalizeStartedRef.current = false;
            }}
            style={{
              border: "none",
              borderRadius: 14,
              background: t.accent,
              color: "#fff",
              padding: "12px 18px",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Retry checkout handoff
          </button>
          <Link
            href="/upload"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 14,
              background: "transparent",
              border: `1px solid ${t.border}`,
              color: t.textSub,
              padding: "12px 18px",
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            Back to upload
          </Link>
        </div>

        <div
          style={{
            marginTop: 24,
            borderRadius: 18,
            border: `1px solid ${t.borderSub}`,
            background: t.bg,
            padding: 16,
            color: t.textSub,
            fontSize: 13,
            lineHeight: 1.6,
          }}
        >
          Podcast ID: <span style={{ fontFamily: "var(--font-app-mono)" }}>{shortPodcastId}</span>
        </div>
      </main>
    </div>
  );
}
