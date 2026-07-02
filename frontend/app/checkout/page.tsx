"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CreditCard, Loader2, Moon, ShieldCheck, Sparkles, SunMedium } from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import { createCheckoutSession } from "@/lib/api";
import { getStudioTheme, THEME_STORAGE_KEY } from "@/lib/brand";

function CheckoutPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading, backendToken, syncBackendSession } = useAuth();
// Dark mode state (ruhet në localStorage)
  const [dark, setDark] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.localStorage.getItem(THEME_STORAGE_KEY) === "dark";
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [redirecting, setRedirecting] = useState(false);
 // Theme i UI (dark/light)
  const t = useMemo(() => getStudioTheme(dark), [dark]);
  const podcastId = searchParams.get("podcastId")?.trim() ?? "";
  const amountValue = Number(searchParams.get("amount") ?? 0);
  const amount = Number.isFinite(amountValue) ? amountValue : 0;
  const currency = (searchParams.get("currency")?.trim().toUpperCase() || "USD").slice(0, 8);
  const displayAmount = `${currency} ${amount.toFixed(2)}`;
  const shortPodcastId = podcastId.length > 14 ? `${podcastId.slice(0, 8)}...${podcastId.slice(-4)}` : podcastId || "Missing";

  useEffect(() => {
    window.localStorage.setItem(THEME_STORAGE_KEY, dark ? "dark" : "light");
  }, [dark]);

  useEffect(() => {
    if (authLoading) {
      return;
    }
    if (!user) {
      router.replace("/login");
      return;
    }

    if (!podcastId || amount <= 0) {
      setError("Missing podcast details for checkout.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    const launchStripeCheckout = async () => {
      setLoading(true);
      setRedirecting(true);
      setError("");

      try {
        const token = backendToken ?? (await syncBackendSession());
        if (!token) {
          router.replace("/login");
          return;
        }

        const response = await createCheckoutSession(podcastId, amount, token);
        if (!response.checkout_url) {
          throw new Error("Stripe checkout could not be started.");
        }

        if (!cancelled) {
          window.location.assign(response.checkout_url);
        }
      } catch (checkoutError) {
        if (!cancelled) {
          setError(checkoutError instanceof Error ? checkoutError.message : "Unable to start Stripe checkout.");
          setRedirecting(false);
          setLoading(false);
        }
      }
    };

    void launchStripeCheckout();

    return () => {
      cancelled = true;
    };
  }, [amount, authLoading, backendToken, podcastId, router, syncBackendSession, user]);

  const handleManualCheckout = async () => {
    setRedirecting(true);
    setError("");
    try {
      const token = backendToken ?? (await syncBackendSession());
      if (!token) {
        router.replace("/login");
        return;
      }

      const response = await createCheckoutSession(podcastId, amount, token);
      if (!response.checkout_url) {
        throw new Error("Stripe checkout could not be started.");
      }
      window.location.assign(response.checkout_url);
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : "Unable to start Stripe checkout.");
      setRedirecting(false);
    }
  };

  if (authLoading || loading || redirecting) {
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
              Stripe checkout
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
                Redirecting to Stripe
              </div>
              <div style={{ color: t.textSub, lineHeight: 1.7, fontSize: 14 }}>
                {error || `Opening secure test checkout for ${displayAmount}.`}
              </div>
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
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 10 }}>
              <span>Podcast</span>
              <span style={{ fontFamily: "var(--font-app-mono)" }}>{shortPodcastId}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
              <span>Total</span>
              <span style={{ color: t.text, fontWeight: 800 }}>{displayAmount}</span>
            </div>
          </div>
        </main>
        <style>{`\n          @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Serif+Display:ital@0;1&display=swap');\n          @keyframes spin { to { transform: rotate(360deg); } }\n        `}</style>
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
      <style>{`\n        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Serif+Display:ital@0;1&display=swap');\n      `}</style>
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
            <ShieldCheck size={16} color={t.accent} />
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

        <h1 style={{ margin: "0 0 10px", fontFamily: "'DM Serif Display',serif", fontSize: 36, fontStyle: "italic", lineHeight: 1 }}>
          Stripe checkout could not start
        </h1>
        <p style={{ margin: "0 0 20px", color: t.textSub, lineHeight: 1.7, fontSize: 14 }}>
          {error || "We could not create a Stripe session for this podcast."}
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => void handleManualCheckout()}
            style={{
              border: "none",
              borderRadius: 14,
              background: t.accent,
              color: "#fff",
              padding: "13px 18px",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          <Link
            href="/dashboard"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 14,
              border: `1px solid ${t.border}`,
              background: t.card,
              color: t.textSub,
              padding: "13px 18px",
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            Back to dashboard
          </Link>
        </div>
      </main>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={null}>
      <CheckoutPageContent />
    </Suspense>
  );
}
