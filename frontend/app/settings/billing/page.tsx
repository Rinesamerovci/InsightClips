"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
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
  const [savedCards, setSavedCards] = useState<SavedCard[]>(() => {
    if (typeof window === "undefined") {
      return [];
    }

    const stored = window.localStorage.getItem("mockSavedCards");
    if (!stored) {
      return [];
    }

    try {
      return JSON.parse(stored) as SavedCard[];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("mockSavedCards", JSON.stringify(savedCards));
    }
  }, [savedCards]);
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

            <Link href="/settings/billing" style={{ display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none", color: t.text, border: `1px solid ${t.accent}`, borderRadius: 999, padding: "10px 16px", background: t.chip }}>
              <CreditCard size={16} />
              Pricing
            </Link>
            <button type="button" onClick={() => setDark((value) => !value)} style={{ display: "inline-flex", alignItems: "center", gap: 8, border: `1px solid ${t.border}`, borderRadius: 999, padding: "10px 14px", background: t.card, color: t.textSub, cursor: "pointer" }}>
              {dark ? <SunMedium size={15} /> : <Moon size={15} />}
              {dark ? "Light mode" : "Dark mode"}
            </button>
          </div>
        </header>

        <section className="a-up glass ic-premium-card" style={{ borderRadius: 30, border: `1px solid ${t.border}`, background: t.shell, padding: isMobile ? "24px 20px" : "30px 32px", marginBottom: 40 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, borderRadius: 999, padding: "7px 12px", background: t.chip, color: t.accentLt, fontSize: 11, fontWeight: 700, letterSpacing: ".18em", textTransform: "uppercase" }}>
            <CreditCard size={14} />
            Pricing
          </div>
          <h1 style={{ marginTop: 16, marginBottom: 12, fontFamily: "'DM Serif Display', serif", fontSize: "clamp(34px, 4vw, 58px)", lineHeight: 1.02, letterSpacing: "-.04em" }}>
            Simple, transparent pricing.
          </h1>
          <p style={{ fontSize: 15, lineHeight: 1.8, color: t.textSub, maxWidth: 720 }}>
            No subscriptions, no hidden fees. Your first podcast is always free — then a flat per-upload fee based on length.
          </p>
        </section>

        <main className="a-up">
          <div style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)",
            gap: 20,
            maxWidth: 1000,
            margin: "0 auto",
          }}>
            {[
              {
                range: "Up to 30 min",
                price: "Free",
                sub: "first upload",
                highlight: true,
                perks: [
                  "AI clip extraction",
                  "Virality scoring",
                  "Subtitle generation",
                  "Download ready-to-post clips",
                ],
              },
              {
                range: "31 – 60 min",
                price: "$2",
                sub: "per upload",
                highlight: false,
                perks: [
                  "Everything in Free",
                  "Longer episode support",
                  "Smart cropping",
                  "Content calendar suggestions",
                ],
              },
              {
                range: "61 – 120 min",
                price: "$4",
                sub: "per upload",
                highlight: false,
                perks: [
                  "Everything in Starter",
                  "Extended episode support",
                  "Priority render queue",
                  "Overlay & branding layers",
                ],
              },
            ].map(({ range, price, sub, highlight, perks }, idx) => (
              <div
                key={range}
                style={{
                  borderRadius: 28,
                  border: `1px solid ${highlight ? t.accent + "55" : t.border}`,
                  background: highlight
                    ? `linear-gradient(145deg, ${t.accent}18, ${t.accent}05)`
                    : t.cardAlt,
                  padding: isMobile ? "36px 28px" : "44px 40px",
                  boxShadow: highlight ? `0 8px 48px ${t.accent}22` : "none",
                  position: "relative",
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                {highlight && (
                  <div style={{
                    position: "absolute", top: 20, right: 20,
                    borderRadius: 100,
                    background: `linear-gradient(135deg, ${t.accent}, ${t.accent})`,
                    color: dark ? "#0D1008" : "#fff",
                    fontSize: 9, fontWeight: 800, letterSpacing: ".2em",
                    textTransform: "uppercase", padding: "5px 12px",
                  }}>
                    Most popular
                  </div>
                )}

                <div style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: ".22em",
                  textTransform: "uppercase",
                  color: highlight ? t.accent : t.textSub,
                  marginBottom: 16,
                }}>
                  {range}
                </div>

                <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 8 }}>
                  <span style={{
                    fontFamily: "'DM Serif Display', serif",
                    fontSize: "clamp(48px,6vw,72px)",
                    lineHeight: 1, letterSpacing: "-.04em", color: t.text,
                  }}>
                    {price}
                  </span>
                  {price !== "Free" && (
                    <span style={{ color: t.textSub, fontSize: 14 }}>USD</span>
                  )}
                </div>
                <div style={{
                  color: t.textSub, fontSize: 13, fontWeight: 600,
                  letterSpacing: ".06em", marginBottom: 32,
                }}>
                  {sub}
                </div>

                <ul style={{ listStyle: "none", padding: 0, margin: "0 0 40px", display: "flex", flexDirection: "column", gap: 12, flexGrow: 1 }}>
                  {perks.map((perk) => (
                    <li key={perk} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: t.textSub }}>
                      <CheckCircle2 size={15} color={t.accent} style={{ flexShrink: 0 }} />
                      {perk}
                    </li>
                  ))}
                </ul>

                <Link
                  href="/upload"
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                    width: "100%",
                    padding: "14px 22px", borderRadius: 14,
                    background: highlight
                      ? `linear-gradient(135deg, ${t.accent}, ${t.accent})`
                      : "transparent",
                    border: highlight ? "none" : `1px solid ${t.border}`,
                    color: highlight ? (dark ? "#0D1008" : "#fff") : t.text,
                    fontSize: 12, fontWeight: 700, letterSpacing: ".14em", textTransform: "uppercase",
                    textDecoration: "none",
                    boxShadow: highlight ? `0 6px 28px ${t.accent}35` : "none",
                    transition: "all .3s",
                  }}
                >
                  {idx === 0 ? "Start for Free" : "Start"} <ArrowLeft size={15} style={{ transform: "rotate(180deg)" }} />
                </Link>
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
