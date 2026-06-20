"use client";

// PAYMENT INTEGRATION POINT
// This page is a mock checkout. To integrate a real payment provider (e.g. Stripe):
// 1. Replace the setTimeout simulation with a real payment intent creation call
// 2. Replace the inline card form with the provider's hosted fields or Elements
// 3. The PATCH /podcasts/{podcastId}/payment endpoint on the backend should be
//    triggered by the provider's webhook, not by this client directly
// 4. The podcastId and amount are passed as URL params - wire them to your intent metadata

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  CreditCard,
  HelpCircle,
  Loader2,
  Moon,
  ShieldCheck,
  SunMedium,
} from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import { confirmMockPayment, isMockPodcastId } from "@/lib/api";
import { getStudioTheme, THEME_STORAGE_KEY } from "@/lib/brand";

type FieldName = "name" | "cardNumber" | "expiry" | "cvv";
type FieldErrors = Partial<Record<FieldName, string>>;

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Serif+Display:ital@0;1&display=swap');
  *{box-sizing:border-box}
  body{font-family:'DM Sans',sans-serif}
  @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
  @keyframes scaleCheck{0%{opacity:0;transform:scale(.6)}70%{opacity:1;transform:scale(1.08)}100%{opacity:1;transform:scale(1)}}
  .a-up{animation:fadeUp .5s cubic-bezier(.22,1,.36,1) both}
  .mock-input{width:100%;border-radius:12px;border:1px solid var(--border);background:transparent;color:var(--text);padding:11px 14px;font-size:14px;outline:none;font-family:'DM Sans',sans-serif}
  .mock-input:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(90,158,58,.15)}
  .mock-input.error{border-color:#c0392b;box-shadow:0 0 0 3px rgba(192,57,43,.12)}
`;

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

function formatCardNumber(value: string): string {
  return digitsOnly(value).slice(0, 16).replace(/(.{4})/g, "$1 ").trim();
}

function formatExpiry(value: string): string {
  const raw = digitsOnly(value).slice(0, 4);
  if (raw.length <= 2) {
    return raw;
  }
  return `${raw.slice(0, 2)} / ${raw.slice(2)}`;
}

function validateExpiry(value: string): string | null {
  const raw = digitsOnly(value);
  if (raw.length !== 4) {
    return "Enter expiry as MM / YY.";
  }

  const month = Number(raw.slice(0, 2));
  const year = Number(raw.slice(2));
  const currentYear = new Date().getFullYear() % 100;
  if (month < 1 || month > 12) {
    return "Use a valid month from 01 to 12.";
  }
  if (year < currentYear) {
    return "Expiry year cannot be in the past.";
  }
  return null;
}

function validateFields(values: {
  name: string;
  cardNumber: string;
  expiry: string;
  cvv: string;
}): FieldErrors {
  const errors: FieldErrors = {};
  if (!values.name.trim()) {
    errors.name = "Cardholder name is required.";
  }
  if (digitsOnly(values.cardNumber).length !== 16) {
    errors.cardNumber = "Card number must be exactly 16 digits.";
  }
  const expiryError = validateExpiry(values.expiry);
  if (expiryError) {
    errors.expiry = expiryError;
  }
  if (!/^\d{3,4}$/.test(values.cvv)) {
    errors.cvv = "CVV must be 3 or 4 digits.";
  }
  return errors;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function CheckoutContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading, backendToken, syncBackendSession } = useAuth();

  const [dark, setDark] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.localStorage.getItem(THEME_STORAGE_KEY) === "dark";
  });
  const [name, setName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [success, setSuccess] = useState(false);

  const t = getStudioTheme(dark);
  const podcastId = searchParams.get("podcastId")?.trim() ?? "";
  const amountValue = Number(searchParams.get("amount") ?? 0);
  const amount = Number.isFinite(amountValue) ? amountValue : 0;
  const currency = (searchParams.get("currency")?.trim().toUpperCase() || "USD").slice(0, 8);
  const displayAmount = `${currency} ${amount.toFixed(2)}`;
  const shortPodcastId = podcastId.length > 14 ? `${podcastId.slice(0, 8)}...${podcastId.slice(-4)}` : podcastId || "Missing";

  const fieldErrors = useMemo(
    () => validateFields({ name, cardNumber, expiry, cvv }),
    [cardNumber, cvv, expiry, name],
  );

  useEffect(() => {
    window.localStorage.setItem(THEME_STORAGE_KEY, dark ? "dark" : "light");
  }, [dark]);

  useEffect(() => {
    if (authLoading) {
      return;
    }
    if (!user) {
      router.replace("/login");
    }
  }, [authLoading, router, user]);

  const visibleError = (field: FieldName) =>
    (touched[field] || submitAttempted) ? fieldErrors[field] : undefined;

  const inputClass = (field: FieldName) =>
    visibleError(field) ? "mock-input error" : "mock-input";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitAttempted(true);
    setPaymentError("");

    const errors = validateFields({ name, cardNumber, expiry, cvv });
    if (Object.keys(errors).length > 0 || !podcastId) {
      return;
    }

    setSubmitting(true);
    try {
      const token = backendToken ?? (await syncBackendSession());
      if (!token) {
        router.replace("/login");
        return;
      }

      await Promise.all([
        wait(1800),
        isMockPodcastId(podcastId) ? Promise.resolve() : confirmMockPayment(podcastId, "paid", token),
      ]);
      setSuccess(true);
    } catch {
      setPaymentError("Payment simulation failed - please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <div style={{ minHeight: "100vh", background: t.bg, color: t.text, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <style>{CSS}</style>
        <Loader2 size={28} className="animate-spin" />
      </div>
    );
  }

  return (
    <div
      style={
        {
          "--border": t.border,
          "--text": t.text,
          "--accent": t.accent,
          minHeight: "100vh",
          background: t.bg,
          color: t.text,
          fontFamily: "'DM Sans',sans-serif",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "28px 16px",
        } as React.CSSProperties
      }
    >
      <style>{CSS}</style>
      <main style={{ width: "100%", maxWidth: 480, display: "grid", gap: 14 }}>
        <div className="a-up" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <Link href="/upload" style={{ color: t.textSub, textDecoration: "none", fontSize: 13, fontWeight: 700 }}>
            &larr; Back to upload
          </Link>
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

        <section className="a-up" style={{ borderRadius: 20, border: `1px solid ${t.border}`, background: t.card, padding: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <ShieldCheck size={18} color={t.accent} />
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: t.textSub }}>
              Order Summary
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 10 }}>
            <span style={{ color: t.textSub, fontSize: 13 }}>Podcast</span>
            <span style={{ fontFamily: "var(--font-app-mono)", fontSize: 13 }}>{shortPodcastId}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 12 }}>
            <span style={{ color: t.textSub, fontSize: 13 }}>Total</span>
            <span style={{ fontFamily: "'DM Serif Display',serif", fontSize: 30, fontStyle: "italic", lineHeight: 1 }}>{displayAmount}</span>
          </div>
          <div style={{ borderTop: `1px solid ${t.borderSub}`, paddingTop: 12, color: t.textSub, fontSize: 13 }}>
            One-time processing fee - no subscription
          </div>
        </section>

        <section className="a-up" style={{ borderRadius: 20, border: `1px solid ${t.border}`, background: t.card, padding: 24 }}>
          {success ? (
            <div style={{ textAlign: "center", padding: "12px 0 4px" }}>
              <div
                style={{
                  width: 92,
                  height: 92,
                  borderRadius: "50%",
                  margin: "0 auto 20px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "rgba(90,158,58,.12)",
                  border: "1px solid rgba(90,158,58,.32)",
                  animation: "scaleCheck .45s cubic-bezier(.22,1,.36,1) both",
                }}
              >
                <CheckCircle2 size={56} color="#5a9e3a" />
              </div>
              <h1 style={{ margin: "0 0 10px", fontFamily: "'DM Serif Display',serif", fontSize: 36, fontStyle: "italic", lineHeight: 1 }}>
                Payment confirmed
              </h1>
              <p style={{ margin: "0 0 22px", color: t.textSub, lineHeight: 1.7, fontSize: 14 }}>
                Your podcast is now queued for AI processing. Clips will be ready shortly.
              </p>
              <Link
                href={`/clips/generated?podcastId=${encodeURIComponent(podcastId)}&autogen=1`}
                style={{
                  width: "100%",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 14,
                  background: t.accent,
                  color: "#fff",
                  padding: "13px 18px",
                  fontWeight: 800,
                  textDecoration: "none",
                  marginBottom: 14,
                }}
              >
                View my clips &rarr;
              </Link>
              <Link href="/dashboard" style={{ color: t.textSub, fontSize: 13, fontWeight: 700, textDecoration: "none" }}>
                Back to dashboard
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: "grid", gap: 15 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <CreditCard size={18} color={t.accent} />
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: t.textSub }}>
                  Secure mock card
                </div>
              </div>

              {paymentError ? (
                <div style={{ borderRadius: 14, border: "1px solid rgba(192,57,43,.28)", background: "rgba(192,57,43,.1)", color: "#c0392b", padding: "12px 14px", fontSize: 13, lineHeight: 1.6 }}>
                  {paymentError}
                </div>
              ) : null}

              <label htmlFor="checkout-name">
                <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".12em", textTransform: "uppercase", color: t.textSub, marginBottom: 6 }}>
                  Cardholder Name
                </div>
                <input
                  id="checkout-name"
                  value={name}
                  required
                  placeholder="Jane Smith"
                  className={inputClass("name")}
                  aria-describedby="checkout-name-error"
                  onBlur={() => setTouched((current) => ({ ...current, name: true }))}
                  onChange={(event) => setName(event.target.value)}
                />
                <div id="checkout-name-error" style={{ fontSize: 12, color: "#c0392b", marginTop: 4, minHeight: 16 }}>
                  {visibleError("name") ?? ""}
                </div>
              </label>

              <label htmlFor="checkout-card">
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".12em", textTransform: "uppercase", color: t.textSub }}>
                    Card Number
                  </span>
                  <CreditCard size={15} color={t.textSub} />
                </div>
                <input
                  id="checkout-card"
                  value={cardNumber}
                  required
                  inputMode="numeric"
                  placeholder="1234 5678 9012 3456"
                  className={inputClass("cardNumber")}
                  aria-describedby="checkout-card-error"
                  onBlur={() => setTouched((current) => ({ ...current, cardNumber: true }))}
                  onChange={(event) => setCardNumber(formatCardNumber(event.target.value))}
                />
                <div id="checkout-card-error" style={{ fontSize: 12, color: "#c0392b", marginTop: 4, minHeight: 16 }}>
                  {visibleError("cardNumber") ?? ""}
                </div>
              </label>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label htmlFor="checkout-expiry">
                  <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".12em", textTransform: "uppercase", color: t.textSub, marginBottom: 6 }}>
                    Expiry Date
                  </div>
                  <input
                    id="checkout-expiry"
                    value={expiry}
                    required
                    inputMode="numeric"
                    placeholder="MM / YY"
                    className={inputClass("expiry")}
                    aria-describedby="checkout-expiry-error"
                    onBlur={() => setTouched((current) => ({ ...current, expiry: true }))}
                    onChange={(event) => setExpiry(formatExpiry(event.target.value))}
                  />
                  <div id="checkout-expiry-error" style={{ fontSize: 12, color: "#c0392b", marginTop: 4, minHeight: 16 }}>
                    {visibleError("expiry") ?? ""}
                  </div>
                </label>

                <label htmlFor="checkout-cvv">
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".12em", textTransform: "uppercase", color: t.textSub }}>
                      CVV
                    </span>
                    <span title="3 digits on the back of your card (4 for Amex)">
                      <HelpCircle size={14} color={t.textSub} aria-hidden="true" />
                    </span>
                  </div>
                  <input
                    id="checkout-cvv"
                    value={cvv}
                    required
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="123"
                    className={inputClass("cvv")}
                    aria-describedby="checkout-cvv-error"
                    onBlur={() => setTouched((current) => ({ ...current, cvv: true }))}
                    onChange={(event) => setCvv(digitsOnly(event.target.value).slice(0, 4))}
                  />
                  <div id="checkout-cvv-error" style={{ fontSize: 12, color: "#c0392b", marginTop: 4, minHeight: 16 }}>
                    {visibleError("cvv") ?? ""}
                  </div>
                </label>
              </div>

              <button
                type="submit"
                disabled={submitting || !podcastId}
                style={{
                  width: "100%",
                  border: "none",
                  borderRadius: 14,
                  background: t.accent,
                  color: "#fff",
                  padding: "14px 18px",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  fontWeight: 800,
                  cursor: submitting || !podcastId ? "default" : "pointer",
                  opacity: submitting || !podcastId ? 0.7 : 1,
                }}
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <CreditCard size={16} />}
                {submitting ? "Processing payment..." : `Pay ${displayAmount}`}
              </button>
            </form>
          )}
        </section>
      </main>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={null}>
      <CheckoutContent />
    </Suspense>
  );
}
