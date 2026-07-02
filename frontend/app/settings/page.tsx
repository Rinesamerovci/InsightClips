"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CreditCard,
  Loader2,
  Mail,
  MessageSquare,
  Moon,
  Send,
  Settings2,
  ShieldAlert,
  SunMedium,
} from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import {
  submitContactMessage,
  submitFeedback,
  submitSupportRequest,
  type UserMessageCategory,
  type UserMessageResponse,
  type UserMessageType,
} from "@/lib/api";
import { getStudioTheme, THEME_STORAGE_KEY } from "@/lib/brand";

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Serif+Display:ital@0;1&display=swap');
  *{box-sizing:border-box}
  body{font-family:'DM Sans',sans-serif}
  @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
  .a-up{animation:fadeUp .55s cubic-bezier(.22,1,.36,1) both}
  .glass{backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px)}
`;

export default function SettingsPage() {
  const router = useRouter();
  const { user, backendToken, loading: authLoading, syncBackendSession } = useAuth();

  const [viewportWidth, setViewportWidth] = useState(1280);
  const [dark, setDark] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.localStorage.getItem(THEME_STORAGE_KEY) === "dark";
  });
  const [messageType, setMessageType] = useState<UserMessageType>("feedback");
  const [messageCategory, setMessageCategory] =
    useState<UserMessageCategory>("feature_request");
  const [messageSubject, setMessageSubject] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [messageSending, setMessageSending] = useState(false);
  const [messageFeedback, setMessageFeedback] = useState<{
    tone: "success" | "error" | "info";
    message: string;
  } | null>(null);

  const isMobile = viewportWidth < 900;
  const messageCategories: Record<UserMessageType, UserMessageCategory[]> = {
    feedback: ["feature_request", "bug", "general"],
    support: ["technical_support", "billing", "bug", "general"],
    contact: ["general", "feature_request", "billing"],
  };
  const signedInEmail = user?.email?.trim() ?? "";

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

    let active = true;
    const ensureSession = async () => {
      const token = backendToken ?? (await syncBackendSession());
      if (!token && active) {
        router.replace("/login");
      }
    };

    void ensureSession();
    return () => {
      active = false;
    };
  }, [authLoading, backendToken, router, syncBackendSession]);

  useEffect(() => {
    if (signedInEmail) {
      setContactEmail(signedInEmail);
    }
  }, [signedInEmail]);

  const palette = useMemo(() => {
    const base = getStudioTheme(dark);
    return {
      bg: base.bg,
      shell: base.shell,
      card: base.card,
      border: base.border,
      subBorder: base.borderSub,
      text: base.text,
      muted: base.textSub,
      accent: base.accent,
      accentLight: base.accentLt,
      chip: base.chip,
      successBg: dark ? "rgba(18,48,14,.8)" : "rgba(228,251,220,.9)",
      successBorder: dark ? "rgba(90,158,58,.35)" : "rgba(130,205,110,.5)",
      successText: dark ? "#bfe4ab" : "#25591a",
      errorBg: base.errorBg,
      errorBorder: base.errorBd,
      errorText: base.errorText,
    };
  }, [dark]);

  const messageFeedbackStyles =
    messageFeedback?.tone === "success"
      ? {
          background: palette.successBg,
          border: palette.successBorder,
          color: palette.successText,
        }
      : messageFeedback?.tone === "error"
        ? {
            background: palette.errorBg,
            border: palette.errorBorder,
            color: palette.errorText,
          }
        : {
            background: palette.chip,
            border: palette.subBorder,
            color: palette.text,
          };

  const handleMessageTypeChange = (nextType: UserMessageType) => {
    setMessageType(nextType);
    setMessageCategory(messageCategories[nextType][0] ?? "general");
    setMessageFeedback(null);
  };

  const handleSubmitMessage = async () => {
    if (messageSending) {
      return;
    }

    const cleanedMessage = messageBody.trim();
    if (cleanedMessage.length < 10) {
      setMessageFeedback({
        tone: "error",
        message: "Please write at least 10 characters before submitting.",
      });
      return;
    }

    setMessageSending(true);
    setMessageFeedback({
      tone: "info",
      message:
        messageType === "support"
          ? "Sending your support request..."
          : messageType === "contact"
            ? "Sending your contact message..."
            : "Sending your feedback...",
    });

    try {
      const token = backendToken ?? (await syncBackendSession());
      if (!token) {
        router.replace("/login");
        return;
      }

      const resolvedContactEmail = signedInEmail || contactEmail.trim();
      const payload = {
        category: messageCategory,
        subject: messageSubject.trim() || null,
        message: cleanedMessage,
        contact_email: resolvedContactEmail || null,
      };

      let response: UserMessageResponse;
      if (messageType === "support") {
        response = await submitSupportRequest(payload, token);
      } else if (messageType === "contact") {
        response = await submitContactMessage(payload, token);
      } else {
        response = await submitFeedback(payload, token);
      }

      setMessageSubject("");
      setMessageBody("");
      setContactEmail(resolvedContactEmail);
      setMessageFeedback({
        tone: "success",
        message: `${
          messageType === "support"
            ? "Support request submitted."
            : messageType === "contact"
              ? "Contact message submitted."
              : "Feedback submitted."
        } ${
          response.email_notification_sent
            ? "Email notification was sent to the team inbox."
            : "It was saved in Supabase, but email notification is not configured or could not be sent from this environment."
        }`,
      });
    } catch (error) {
      setMessageFeedback({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "Unable to submit your message right now.",
      });
    } finally {
      setMessageSending(false);
    }
  };

  if (authLoading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: palette.bg,
          color: palette.text,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        <style>{CSS}</style>
        <Loader2 size={28} className="animate-spin" />
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: palette.bg,
        color: palette.text,
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      <style>{CSS}</style>

      <div style={{ maxWidth: 1180, margin: "0 auto", padding: isMobile ? "24px 16px 36px" : "40px 24px 56px" }}>
        <header
          className="a-up"
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 14,
            flexWrap: "wrap",
            alignItems: "center",
            marginBottom: 28,
          }}
        >
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link
              href="/dashboard"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                textDecoration: "none",
                color: "inherit",
                border: `1px solid ${palette.border}`,
                borderRadius: 999,
                padding: "10px 16px",
                background: palette.card,
              }}
            >
              <ArrowLeft size={16} />
              Dashboard
            </Link>

            <Link
              href="/settings/billing"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                textDecoration: "none",
                color: "inherit",
                border: `1px solid ${palette.border}`,
                borderRadius: 999,
                padding: "10px 16px",
                background: palette.card,
              }}
            >
              <CreditCard size={16} />
              Pricing
            </Link>
            <button
              type="button"
              onClick={() => setDark((value) => !value)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                border: `1px solid ${palette.border}`,
                borderRadius: 999,
                padding: "10px 14px",
                background: palette.card,
                color: palette.muted,
                cursor: "pointer",
              }}
            >
              {dark ? <SunMedium size={15} /> : <Moon size={15} />}
              {dark ? "Light mode" : "Dark mode"}
            </button>
          </div>
        </header>

        <section
          className="a-up glass ic-premium-card"
          style={{
            borderRadius: 32,
            border: `1px solid ${palette.border}`,
            background: dark
              ? "linear-gradient(180deg, rgba(9,14,8,.94), rgba(13,20,11,.9))"
              : "linear-gradient(180deg, rgba(244,249,239,.97), rgba(255,255,255,.95))",
            padding: isMobile ? "24px 20px" : "34px 36px",
            marginBottom: 24,
            boxShadow: dark
              ? "0 22px 60px rgba(0,0,0,.18)"
              : "0 24px 64px rgba(90,158,58,.08)",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "minmax(0,1.15fr) minmax(280px,.85fr)",
              gap: isMobile ? 18 : 24,
              alignItems: "stretch",
            }}
          >
            <div
              style={{
                borderRadius: 24,
                border: `1px solid ${palette.subBorder}`,
                background: dark ? "rgba(255,255,255,.03)" : "rgba(255,255,255,.72)",
                padding: isMobile ? "18px" : "20px 22px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                minHeight: "100%",
              }}
            >
              <div>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  borderRadius: 999,
                  padding: "7px 12px",
                  background: palette.chip,
                  color: palette.accentLight,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: ".18em",
                  textTransform: "uppercase",
                }}
              >
                <MessageSquare size={14} />
                Creator Inbox
              </div>
              <h1
                style={{
                  marginTop: 16,
                  marginBottom: 12,
                  fontFamily: "'DM Serif Display', serif",
                  fontSize: "clamp(32px, 4vw, 52px)",
                  lineHeight: 1.06,
                  letterSpacing: "-.04em",
                }}
              >
                Keep feedback and support in one calm place.
              </h1>
              <p style={{ fontSize: 15, lineHeight: 1.8, color: palette.muted, maxWidth: 680 }}>
                Send feedback, ask for help, or leave a contact note without extra generator settings crowding the page.
              </p>
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 18 }}>
                {["Fast product notes", "Support follow-up"].map((item) => (
                  <div
                    key={item}
                    style={{
                      borderRadius: 999,
                      border: `1px solid ${palette.subBorder}`,
                      background: palette.card,
                      padding: "9px 12px",
                      fontSize: 12,
                      fontWeight: 700,
                      color: palette.text,
                    }}
                  >
                    {item}
                  </div>
                ))}
              </div>
            </div>

            <div
              style={{
                borderRadius: 24,
                border: `1px solid ${palette.subBorder}`,
                background: dark ? "rgba(255,255,255,.03)" : "rgba(255,255,255,.86)",
                padding: "20px 22px",
                display: "grid",
                gap: 12,
                minHeight: "100%",
                alignContent: "start",
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".2em", textTransform: "uppercase", color: palette.muted }}>
                Inbox Summary
              </div>
              {[
                {
                  title: "Feedback / Support / Contact",
                  text: "Switch the lane you need without leaving this page.",
                },
                {
                  title: "Reply-ready",
                  text: "Leave an email only if you want a follow-up from the team.",
                },
              ].map((item) => (
                <div
                  key={item.title}
                  style={{
                    borderRadius: 18,
                    border: `1px solid ${palette.subBorder}`,
                    background: dark ? "rgba(90,158,58,.06)" : "rgba(90,158,58,.04)",
                    padding: "14px 15px",
                  }}
                >
                  <div style={{ fontSize: 15, fontWeight: 700, color: palette.text, marginBottom: 5 }}>
                    {item.title}
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1.65, color: palette.muted }}>
                    {item.text}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section
          className="a-up ic-premium-card"
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "minmax(250px,.78fr) minmax(0,1.22fr)",
            gap: 18,
            alignItems: "stretch",
          }}
        >
          <aside
            className="glass ic-premium-card"
            style={{
              borderRadius: 24,
              background: dark ? "rgba(13,20,11,.84)" : "rgba(255,255,255,.9)",
              border: `1px solid ${palette.border}`,
              padding: isMobile ? 18 : 20,
              display: "grid",
              gap: 14,
              height: "100%",
              alignContent: "start",
            }}
          >
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".2em", textTransform: "uppercase", color: palette.muted, marginBottom: 8 }}>
                Message guide
              </div>
              <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 30, lineHeight: 1.08 }}>
                Better notes,
                <br />
                faster replies.
              </div>
            </div>

            {[
              {
                title: "Feedback",
                text: "Use this for product ideas, rough edges, or workflow improvements you want the team to review.",
              },
              {
                title: "Support",
                text: "Best for blockers, bugs, account problems, or anything stopping you from finishing work.",
              },
              {
                title: "Contact",
                text: "Use this when you want a more general conversation, intro, or direct follow-up.",
              },
            ].map((item) => (
              <div
                key={item.title}
                style={{
                  borderRadius: 18,
                  border: `1px solid ${palette.subBorder}`,
                  background: dark ? "rgba(90,158,58,.05)" : "rgba(90,158,58,.04)",
                  padding: "14px 15px",
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 700, color: palette.text, marginBottom: 5 }}>
                  {item.title}
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.65, color: palette.muted }}>
                  {item.text}
                </div>
              </div>
            ))}

            <div
              style={{
                borderRadius: 18,
                border: `1px solid ${palette.subBorder}`,
                background: dark ? "rgba(255,255,255,.03)" : "rgba(255,255,255,.78)",
                padding: "14px 15px",
                display: "grid",
                gap: 10,
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".18em", textTransform: "uppercase", color: palette.muted }}>
                Quick checklist
              </div>
              {[
                "Say what happened.",
                "Say what you expected.",
                "Add enough context for a reply.",
              ].map((item) => (
                <div
                  key={item}
                  style={{
                    borderRadius: 12,
                    border: `1px solid ${palette.subBorder}`,
                    background: dark ? "rgba(90,158,58,.05)" : "rgba(90,158,58,.04)",
                    padding: "9px 11px",
                    fontSize: 12,
                    fontWeight: 700,
                    color: palette.text,
                  }}
                >
                  {item}
                </div>
              ))}
            </div>


          </aside>

          <div
            className="glass ic-premium-card"
            style={{
              borderRadius: 26,
              background: dark
                ? "linear-gradient(180deg, rgba(13,20,11,.9), rgba(10,18,8,.88))"
                : "linear-gradient(180deg, rgba(255,255,255,.96), rgba(249,252,246,.95))",
              border: `1px solid ${palette.border}`,
              padding: isMobile ? 18 : 24,
              boxShadow: dark
                ? "0 18px 48px rgba(0,0,0,.16)"
                : "0 18px 50px rgba(90,158,58,.08)",
              height: "100%",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <MessageSquare size={18} color={palette.accent} />
              <div style={{ fontSize: 11, letterSpacing: ".18em", textTransform: "uppercase", color: palette.muted }}>
                Feedback & Support
              </div>
            </div>

            <div style={{ fontSize: 14, lineHeight: 1.7, color: palette.muted, marginBottom: 18, maxWidth: 620 }}>
              Send one clear message to the team. Pick the right lane below, then add enough context so we can act on it quickly.
            </div>

            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))", gap: 10, marginBottom: 18 }}>
              {[
                { id: "feedback" as const, label: "Feedback", icon: MessageSquare, hint: "Ideas and product notes" },
                { id: "support" as const, label: "Support", icon: ShieldAlert, hint: "Need help or blocked" },
                { id: "contact" as const, label: "Contact", icon: Mail, hint: "General message" },
              ].map((item) => {
                const Icon = item.icon;
                const active = messageType === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleMessageTypeChange(item.id)}
                    style={{
                      borderRadius: 18,
                      border: `1px solid ${active ? palette.accent : palette.subBorder}`,
                      background: active
                        ? dark
                          ? "rgba(90,158,58,.14)"
                          : "rgba(90,158,58,.09)"
                        : dark
                          ? "rgba(255,255,255,.03)"
                          : "rgba(255,255,255,.82)",
                      padding: "14px 12px",
                      color: active ? palette.accent : palette.text,
                      display: "grid",
                      justifyItems: "center",
                      gap: 6,
                      cursor: "pointer",
                      textAlign: "center",
                    }}
                  >
                    <Icon size={16} />
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{item.label}</span>
                    <span style={{ fontSize: 11, color: active ? palette.accent : palette.muted }}>{item.hint}</span>
                  </button>
                );
              })}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0,.9fr) minmax(0,1.1fr)", gap: 12, marginBottom: 12 }}>
              <label>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".16em", textTransform: "uppercase", color: palette.muted, marginBottom: 6 }}>
                  Category
                </div>
                <select
                  value={messageCategory}
                  onChange={(event) => setMessageCategory(event.target.value as UserMessageCategory)}
                  style={{
                    width: "100%",
                    borderRadius: 14,
                    border: `1px solid ${palette.subBorder}`,
                    background: dark ? "rgba(255,255,255,.03)" : "rgba(255,255,255,.88)",
                    color: palette.text,
                    padding: "13px 14px",
                  }}
                >
                  {messageCategories[messageType].map((category) => (
                    <option key={category} value={category}>
                      {category.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".16em", textTransform: "uppercase", color: palette.muted, marginBottom: 6 }}>
                  Subject
                </div>
                <input
                  value={messageSubject}
                  onChange={(event) => setMessageSubject(event.target.value)}
                  placeholder="Add a short summary"
                  style={{
                    width: "100%",
                    borderRadius: 14,
                    border: `1px solid ${palette.subBorder}`,
                    background: dark ? "rgba(255,255,255,.03)" : "rgba(255,255,255,.88)",
                    color: palette.text,
                    padding: "13px 14px",
                  }}
                />
              </label>
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              <label>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".16em", textTransform: "uppercase", color: palette.muted, marginBottom: 6 }}>
                  Message
                </div>
                <textarea
                  value={messageBody}
                  onChange={(event) => setMessageBody(event.target.value)}
                  placeholder={
                    messageType === "support"
                      ? "Describe the issue, what you expected, what happened, and anything you already tried."
                      : messageType === "contact"
                        ? "Tell us why you want to get in touch and what kind of reply would help."
                        : "Share the workflow improvement, friction point, or idea you want to see next."
                  }
                  rows={7}
                  style={{
                    width: "100%",
                    borderRadius: 16,
                    border: `1px solid ${palette.subBorder}`,
                    background: dark ? "rgba(255,255,255,.03)" : "rgba(255,255,255,.88)",
                    color: palette.text,
                    padding: "14px 15px",
                    resize: "vertical",
                    lineHeight: 1.6,
                  }}
                />
              </label>

              <label>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".16em", textTransform: "uppercase", color: palette.muted, marginBottom: 6 }}>
                  Contact email
                </div>
                <input
                  value={signedInEmail || contactEmail}
                  readOnly
                  aria-readonly="true"
                  placeholder="Loaded from your signed-in account"
                  style={{
                    width: "100%",
                    borderRadius: 14,
                    border: `1px solid ${palette.subBorder}`,
                    background: dark ? "rgba(255,255,255,.03)" : "rgba(255,255,255,.88)",
                    color: palette.text,
                    padding: "13px 14px",
                    cursor: "not-allowed",
                  }}
                />
                <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.55, color: palette.muted }}>
                  We use the email from your signed-in account so the team can reply to the correct user.
                </div>
              </label>
            </div>

            {messageFeedback ? (
              <div
                style={{
                  marginTop: 14,
                  borderRadius: 16,
                  padding: "12px 14px",
                  background: messageFeedbackStyles.background,
                  border: `1px solid ${messageFeedbackStyles.border}`,
                  color: messageFeedbackStyles.color,
                  fontSize: 13,
                  lineHeight: 1.65,
                }}
              >
                {messageFeedback.message}
              </div>
            ) : null}

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: isMobile ? "stretch" : "center", gap: 12, flexDirection: isMobile ? "column" : "row", marginTop: 16 }}>
              <div style={{ fontSize: 12, lineHeight: 1.65, color: palette.muted }}>
                {messageType === "support"
                  ? "Support requests work best when you include what happened, what you expected, and any error you saw."
                  : messageType === "contact"
                    ? "Leave your email if you want a direct reply from the team."
                    : "Feature feedback works best when you describe the exact workflow friction."}
              </div>
              <button
                type="button"
                onClick={() => void handleSubmitMessage()}
                disabled={messageSending}
                style={{
                  border: "none",
                  borderRadius: 999,
                  background: `linear-gradient(135deg, ${palette.accent}, ${palette.accentLight})`,
                  color: "#fff",
                  padding: "13px 20px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  fontWeight: 700,
                  cursor: messageSending ? "default" : "pointer",
                  opacity: messageSending ? 0.72 : 1,
                  whiteSpace: "nowrap",
                  boxShadow: "0 14px 32px rgba(90,158,58,.22)",
                }}
              >
                {messageSending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                {messageSending ? "Sending..." : "Submit message"}
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
