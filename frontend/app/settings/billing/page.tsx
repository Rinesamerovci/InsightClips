"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CreditCard,
  HelpCircle,
  Loader2,
  Moon,
  Plus,
  Settings2,
  SunMedium,
  Trash2,
} from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import { getStudioTheme, THEME_STORAGE_KEY } from "@/lib/brand";

type SavedCard = {
  id: string;
  last4: string;
  brand: string;
  expiry: string;
  isDefault: boolean;
};

type BillingHistoryItem = {
  id: string;
  date: string;
  description: string;
  amount: number;
  currency: string;
  status: "paid" | "pending" | "failed";
};

type FieldName = "cardNumber" | "expiry" | "cvv";
type FieldErrors = Partial<Record<FieldName, string>>;

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Serif+Display:ital@0;1&display=swap');
  *{box-sizing:border-box}
  body{font-family:'DM Sans',sans-serif}
  @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
  .a-up{animation:fadeUp .55s cubic-bezier(.22,1,.36,1) both}
  .glass{backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px)}
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
  cardNumber: string;
  expiry: string;
  cvv: string;
}): FieldErrors {
  const errors: FieldErrors = {};
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

function randomId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `card_${Date.now()}`;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export default function BillingSettingsPage() {
  const router = useRouter();
  const { user, loading: authLoading, profile, backendToken, syncBackendSession } = useAuth();

  const [viewportWidth, setViewportWidth] = useState(1280);
  const [dark, setDark] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.localStorage.getItem(THEME_STORAGE_KEY) === "dark";
  });
  const [savedCards, setSavedCards] = useState<SavedCard[]>([]);
  const [billingHistory] = useState<BillingHistoryItem[]>([
    { id: "pay_mock_001", date: "2025-05-14", description: "Processing fee - 45 min podcast", amount: 2.0, currency: "USD", status: "paid" },
    { id: "pay_mock_002", date: "2025-04-30", description: "Processing fee - 90 min podcast", amount: 4.0, currency: "USD", status: "paid" },
    { id: "pay_mock_003", date: "2025-04-08", description: "Processing fee - 32 min podcast", amount: 2.0, currency: "USD", status: "pending" },
  ]);
  const [showAddCard, setShowAddCard] = useState(false);
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [savingCard, setSavingCard] = useState(false);

  const t = getStudioTheme(dark);
  const isMobile = viewportWidth < 900;

  const fieldErrors = useMemo(
    () => validateFields({ cardNumber, expiry, cvv }),
    [cardNumber, cvv, expiry],
  );

  useEffect(() => {
    window.localStorage.setItem(THEME_STORAGE_KEY, dark ? "dark" : "light");
  }, [dark]);

  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (authLoading) {
      return;
    }
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!backendToken) {
      void syncBackendSession().catch(() => {});
    }
  }, [authLoading, backendToken, router, syncBackendSession, user]);

  const visibleError = (field: FieldName) =>
    (touched[field] || submitAttempted) ? fieldErrors[field] : undefined;

  const inputClass = (field: FieldName) =>
    visibleError(field) ? "mock-input error" : "mock-input";

  const resetCardForm = () => {
    setCardNumber("");
    setExpiry("");
    setCvv("");
    setTouched({});
    setSubmitAttempted(false);
  };

  const handleSaveCard = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitAttempted(true);
    const errors = validateFields({ cardNumber, expiry, cvv });
    if (Object.keys(errors).length > 0) {
      return;
    }

    setSavingCard(true);
    await wait(1200);
    // INTEGRATION POINT: Replace with tokenization API call (e.g. Stripe.createPaymentMethod) and store token in backend
    setSavedCards((current) => [
      ...current,
      {
        id: randomId(),
        last4: digitsOnly(cardNumber).slice(-4),
        brand: "Visa",
        expiry,
        isDefault: current.length === 0,
      },
    ]);
    setSavingCard(false);
    setShowAddCard(false);
    resetCardForm();
  };

  const statusStyle = (status: BillingHistoryItem["status"]) => {
    if (status === "paid") {
      return { background: "rgba(90,158,58,.12)", border: "rgba(90,158,58,.26)", color: t.accent };
    }
    if (status === "pending") {
      return { background: "rgba(158,138,32,.12)", border: "rgba(158,138,32,.26)", color: "#9e8a20" };
    }
    return { background: "rgba(192,57,43,.12)", border: "rgba(192,57,43,.28)", color: "#c0392b" };
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
          fontFamily: "'DM Sans', sans-serif",
        } as React.CSSProperties
      }
    >
      <style>{CSS}</style>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: isMobile ? "24px 16px 36px" : "40px 24px 56px" }}>
        <header className="a-up" style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap", alignItems: "center", marginBottom: 28 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href="/dashboard" style={{ display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none", color: "inherit", border: `1px solid ${t.border}`, borderRadius: 999, padding: "10px 16px", background: t.card }}>
              <ArrowLeft size={16} />
              Dashboard
            </Link>
            <Link href="/settings" style={{ display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none", color: t.textSub, border: `1px solid ${t.border}`, borderRadius: 999, padding: "10px 16px", background: t.card }}>
              <Settings2 size={16} />
              Feedback
            </Link>
            <Link href="/settings/export" style={{ display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none", color: t.textSub, border: `1px solid ${t.border}`, borderRadius: 999, padding: "10px 16px", background: t.card }}>
              <Settings2 size={16} />
              Export settings
            </Link>
            <Link href="/settings/billing" style={{ display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none", color: t.text, border: `1px solid ${t.accent}`, borderRadius: 999, padding: "10px 16px", background: t.chip }}>
              <CreditCard size={16} />
              Billing
            </Link>
            <button type="button" onClick={() => setDark((value) => !value)} style={{ display: "inline-flex", alignItems: "center", gap: 8, border: `1px solid ${t.border}`, borderRadius: 999, padding: "10px 14px", background: t.card, color: t.textSub, cursor: "pointer" }}>
              {dark ? <SunMedium size={15} /> : <Moon size={15} />}
              {dark ? "Light mode" : "Dark mode"}
            </button>
          </div>
        </header>

        <section className="a-up glass ic-premium-card" style={{ borderRadius: 30, border: `1px solid ${t.border}`, background: t.shell, padding: isMobile ? "24px 20px" : "30px 32px", marginBottom: 22 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, borderRadius: 999, padding: "7px 12px", background: t.chip, color: t.accentLt, fontSize: 11, fontWeight: 700, letterSpacing: ".18em", textTransform: "uppercase" }}>
            <CreditCard size={14} />
            Billing
          </div>
          <h1 style={{ marginTop: 16, marginBottom: 12, fontFamily: "'DM Serif Display', serif", fontSize: "clamp(34px, 4vw, 58px)", lineHeight: 1.02, letterSpacing: "-.04em" }}>
            Payment controls for pay-as-you-go processing.
          </h1>
          <p style={{ fontSize: 15, lineHeight: 1.8, color: t.textSub, maxWidth: 720 }}>
            Manage mock payment methods, review simulated charges, and keep the pricing model visible before real payment rails are added.
          </p>
        </section>

        <main style={{ display: "grid", gap: 18 }}>
          <section className="glass a-up ic-premium-card" style={{ borderRadius: 20, border: `1px solid ${t.border}`, background: t.card, padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".12em", textTransform: "uppercase", color: t.textSub, marginBottom: 6 }}>
                  Payment Methods
                </div>
                <h2 style={{ margin: 0, fontFamily: "'DM Serif Display', serif", fontSize: 30, lineHeight: 1.05 }}>Saved Payment Methods</h2>
              </div>
              <button type="button" onClick={() => setShowAddCard(true)} style={{ borderRadius: 999, border: `1px solid ${t.border}`, background: "transparent", color: t.text, padding: "10px 14px", display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 700, cursor: "pointer" }}>
                <Plus size={16} />
                Add payment method
              </button>
            </div>

            {savedCards.length === 0 ? (
              <div style={{ borderRadius: 18, border: `1px dashed ${t.border}`, background: t.cardAlt, padding: 26, textAlign: "center", color: t.textSub }}>
                <CreditCard size={34} style={{ margin: "0 auto 12px" }} />
                No payment methods saved yet
              </div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {savedCards.map((card) => (
                  <div key={card.id} style={{ borderRadius: 16, border: `1px solid ${t.borderSub}`, background: t.cardAlt, padding: "14px 16px", display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                        <strong>{card.brand}</strong>
                        {card.isDefault ? <span style={{ borderRadius: 999, background: t.chip, color: t.accent, padding: "3px 8px", fontSize: 10, fontWeight: 800, textTransform: "uppercase" }}>Default</span> : null}
                      </div>
                      <div style={{ color: t.textSub, fontSize: 13 }}>.... .... .... {card.last4} - Expires {card.expiry}</div>
                    </div>
                    <button type="button" onClick={() => setSavedCards((current) => current.filter((item) => item.id !== card.id))} style={{ border: "none", background: "transparent", color: "#c0392b", display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 700, cursor: "pointer" }}>
                      <Trash2 size={14} />
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}

            {showAddCard ? (
              <form onSubmit={handleSaveCard} style={{ marginTop: 16, borderRadius: 18, border: `1px solid ${t.borderSub}`, background: t.cardAlt, padding: 18, display: "grid", gap: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".12em", textTransform: "uppercase", color: t.textSub }}>
                  Add card
                </div>
                <label htmlFor="billing-card">
                  <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".12em", textTransform: "uppercase", color: t.textSub, marginBottom: 6 }}>Card Number</div>
                  <input id="billing-card" value={cardNumber} required inputMode="numeric" placeholder="1234 5678 9012 3456" className={inputClass("cardNumber")} aria-describedby="billing-card-error" onBlur={() => setTouched((current) => ({ ...current, cardNumber: true }))} onChange={(event) => setCardNumber(formatCardNumber(event.target.value))} />
                  <div id="billing-card-error" style={{ fontSize: 12, color: "#c0392b", marginTop: 4, minHeight: 16 }}>{visibleError("cardNumber") ?? ""}</div>
                </label>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
                  <label htmlFor="billing-expiry">
                    <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".12em", textTransform: "uppercase", color: t.textSub, marginBottom: 6 }}>Expiry Date</div>
                    <input id="billing-expiry" value={expiry} required inputMode="numeric" placeholder="MM / YY" className={inputClass("expiry")} aria-describedby="billing-expiry-error" onBlur={() => setTouched((current) => ({ ...current, expiry: true }))} onChange={(event) => setExpiry(formatExpiry(event.target.value))} />
                    <div id="billing-expiry-error" style={{ fontSize: 12, color: "#c0392b", marginTop: 4, minHeight: 16 }}>{visibleError("expiry") ?? ""}</div>
                  </label>
                  <label htmlFor="billing-cvv">
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".12em", textTransform: "uppercase", color: t.textSub }}>CVV</span>
                      <HelpCircle size={14} color={t.textSub} title="3 digits on the back of your card (4 for Amex)" />
                    </div>
                    <input id="billing-cvv" value={cvv} required inputMode="numeric" maxLength={4} placeholder="123" className={inputClass("cvv")} aria-describedby="billing-cvv-error" onBlur={() => setTouched((current) => ({ ...current, cvv: true }))} onChange={(event) => setCvv(digitsOnly(event.target.value).slice(0, 4))} />
                    <div id="billing-cvv-error" style={{ fontSize: 12, color: "#c0392b", marginTop: 4, minHeight: 16 }}>{visibleError("cvv") ?? ""}</div>
                  </label>
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <button type="submit" disabled={savingCard} style={{ border: "none", borderRadius: 999, background: t.accent, color: "#fff", padding: "11px 16px", display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 800, cursor: savingCard ? "default" : "pointer", opacity: savingCard ? 0.72 : 1 }}>
                    {savingCard ? <Loader2 size={15} className="animate-spin" /> : <CreditCard size={15} />}
                    {savingCard ? "Saving..." : "Save card"}
                  </button>
                  <button type="button" onClick={() => { setShowAddCard(false); resetCardForm(); }} style={{ border: "none", background: "transparent", color: t.textSub, fontWeight: 700, cursor: "pointer" }}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : null}
          </section>

          <section className="glass a-up ic-premium-card" style={{ borderRadius: 20, border: `1px solid ${t.border}`, background: t.card, padding: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".12em", textTransform: "uppercase", color: t.textSub, marginBottom: 6 }}>
              Payment History
            </div>
            {/* INTEGRATION POINT: Replace with GET /users/billing-history endpoint returning real Stripe charges */}
            <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
              {billingHistory.map((item) => {
                const badge = statusStyle(item.status);
                return (
                  <div key={item.id} style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "120px minmax(0,1fr) 110px 100px", gap: 12, alignItems: "center", borderRadius: 16, border: `1px solid ${t.borderSub}`, background: t.cardAlt, padding: "13px 15px" }}>
                    <div style={{ color: t.textSub, fontSize: 13 }}>{item.date}</div>
                    <div style={{ fontWeight: 700 }}>{item.description}</div>
                    <div style={{ fontFamily: "var(--font-app-mono)", fontSize: 13 }}>{item.currency} {item.amount.toFixed(2)}</div>
                    <span style={{ justifySelf: isMobile ? "start" : "end", borderRadius: 999, border: `1px solid ${badge.border}`, background: badge.background, color: badge.color, padding: "4px 9px", fontSize: 10, fontWeight: 800, textTransform: "uppercase" }}>
                      {item.status}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="glass a-up ic-premium-card" style={{ borderRadius: 20, border: `1px solid ${t.border}`, background: t.card, padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".12em", textTransform: "uppercase", color: t.textSub, marginBottom: 6 }}>
                  Current Plan
                </div>
                <h2 style={{ margin: 0, fontFamily: "'DM Serif Display', serif", fontSize: 30, lineHeight: 1.05 }}>Pay-as-you-go</h2>
              </div>
              <span style={{ borderRadius: 999, background: profile?.free_trial_used ? "rgba(158,138,32,.12)" : "rgba(90,158,58,.12)", color: profile?.free_trial_used ? "#9e8a20" : t.accent, border: `1px solid ${profile?.free_trial_used ? "rgba(158,138,32,.28)" : "rgba(90,158,58,.28)"}`, padding: "7px 11px", fontSize: 11, fontWeight: 800, textTransform: "uppercase" }}>
                {profile?.free_trial_used ? "Free trial used" : "Free trial available"}
              </span>
            </div>
            {/* INTEGRATION POINT: Replace static pricing with GET /users/plan endpoint when subscription tiers are added */}
            <p style={{ margin: "0 0 16px", color: t.textSub, lineHeight: 1.7 }}>
              You are charged per podcast processed. First podcast (&lt;=30 min) is always free.
            </p>
            <div style={{ display: "grid", gap: 10 }}>
              {[
                ["Up to 30 min", "Free (first upload)"],
                ["31-60 min", "$2.00"],
                ["61-120 min", "$4.00"],
              ].map(([label, value]) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 12, borderRadius: 14, border: `1px solid ${t.borderSub}`, background: t.cardAlt, padding: "12px 14px" }}>
                  <span style={{ color: t.textSub }}>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
