"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Moon, Sparkles, SunMedium } from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import { confirmStripeCheckoutSession, getPodcastById } from "@/lib/api";
import { getStudioTheme, THEME_STORAGE_KEY } from "@/lib/brand";

type CompletionPhase = "loading" | "processing" | "redirect" | "error";

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

    return "loading";
  });
  const [detail, setDetail] = useState("Verifying your payment and preparing the clip workspace.");
  const [error, setError] = useState(initialError);
  const finalizeStartedRef = useRef(false);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const t = useMemo(() => getStudioTheme(dark), [dark]);

  useEffect(() => {
    window.localStorage.setItem(THEME_STORAGE_KEY, dark ? "dark" : "light");
  }, [dark]);

  useEffect(() => {
    if (authLoading || initialError) {
      return;
    }
    if (finalizeStartedRef.current) {
      return;
    }
    finalizeStartedRef.current = true;

    let cancelled = false;

    const clipsUrl = `/clips/generate?podcastId=${encodeURIComponent(podcastId)}&fresh=1`;
    const pollIntervalMs = 2500;
    const maxWaitMs = 90000;
    const getCurrentSessionId = () => {
      if (typeof window === "undefined") {
        return "";
      }
      return new URLSearchParams(window.location.search).get("session_id")?.trim() ?? "";
    };

    const waitForStripeConfirmation = async (token: string) => {
      const startedAt = Date.now();
      while (Date.now() - startedAt < maxWaitMs) {
        const podcast = await getPodcastById(podcastId, token);
        if (!podcast) {
          throw new Error("Could not find the podcast after checkout.");
        }

        if (podcast.payment_status === "failed" || podcast.status === "blocked") {
          throw new Error("Stripe payment was not completed successfully.");
        }

        const paymentSettled =
          podcast.payment_status === "paid" ||
          podcast.payment_status === "not_required" ||
          podcast.status === "ready_for_processing" ||
          podcast.status === "processing" ||
          podcast.status === "done";
        if (paymentSettled) {
          return podcast;
        }

        const currentSessionId = getCurrentSessionId();
        if (currentSessionId) {
          try {
            const confirmed = await confirmStripeCheckoutSession(podcastId, currentSessionId, token);
            const confirmedSettled =
              confirmed.payment_status === "paid" ||
              confirmed.payment_status === "not_required" ||
              confirmed.status === "ready_for_processing" ||
              confirmed.status === "processing" ||
              confirmed.status === "done";
            if (confirmedSettled) {
              return confirmed;
            }
          } catch {
            // Ignore transient Stripe lookup errors and keep polling the podcast row.
          }
        }

        await new Promise((resolve) => window.setTimeout(resolve, pollIntervalMs));
      }

      throw new Error("Stripe is still confirming the payment. Please refresh in a moment.");
    };

    const finalizeCheckout = async () => {
      setPhase("processing");

      // Safety net: if redirect hasn't happened within 12s, show a manual button
      redirectTimerRef.current = setTimeout(() => {
        if (!cancelled) {
          setDetail("Taking longer than expected. Use the button below to continue.");
          setPhase("redirect");
        }
      }, 12000);

      try {
        const token = backendToken ?? (await syncBackendSession());
        if (!token) {
          if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
          router.replace("/login");
          return;
        }

        setDetail("Waiting for Stripe to confirm the payment.");
        await waitForStripeConfirmation(token);

        if (!cancelled) {
          if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
          setDetail("Payment confirmed! Redirecting to clip setup...");
          setPhase("redirect");
          router.replace(clipsUrl);
        }
      } catch (err) {
        if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
        if (cancelled) {
          return;
        }
        setError(err instanceof Error ? err.message : "Unable to finish payment processing.");
        setPhase("error");
        finalizeStartedRef.current = false;
      }
    };

    void finalizeCheckout();

    return () => {
      cancelled = true;
      finalizeStartedRef.current = false;
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
    };
  }, [authLoading, backendToken, initialError, podcastId, router, syncBackendSession]);

  const clipsUrl = `/clips/generate?podcastId=${encodeURIComponent(podcastId)}&fresh=1`;

  if (authLoading || phase === "processing" || phase === "redirect") {
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
                {phase === "redirect" ? "Payment confirmed!" : phase === "processing" ? "Preparing your clips" : "Loading"}
              </div>
              <div style={{ color: t.textSub, lineHeight: 1.7, fontSize: 14 }}>{detail}</div>
              {phase === "redirect" && (
                <a
                  href={clipsUrl}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    marginTop: 14,
                    borderRadius: 14,
                    background: t.accent,
                    color: "#fff",
                    padding: "11px 18px",
                    fontWeight: 800,
                    fontSize: 14,
                    textDecoration: "none",
                    cursor: "pointer",
                  }}
                >
                  Go to my clips &rarr;
                </a>
              )}
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

