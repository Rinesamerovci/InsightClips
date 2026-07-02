"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useAppTheme } from "../../lib/theme";

export default function TermsOfService() {
  const { isDark, t } = useAppTheme();

  return (
    <div style={{ minHeight: "100vh", backgroundColor: t.bg, color: t.text, fontFamily: "'DM Sans', sans-serif", padding: "60px 20px", transition: "background-color 0.4s ease, color 0.4s ease" }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 8, color: t.accent, textDecoration: "none", fontSize: 14, marginBottom: 40, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em" }}>
          <ArrowLeft size={16} /> Back to Home
        </Link>
        <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: "clamp(36px, 5vw, 56px)", marginBottom: 24, lineHeight: 1.1 }}>Terms of Service</h1>
        <p style={{ color: t.textMuted, fontSize: 16, marginBottom: 32 }}>Last updated: {new Date().toLocaleDateString()}</p>
        
        <div style={{ display: "flex", flexDirection: "column", gap: 24, fontSize: 15, lineHeight: 1.7, color: t.textMuted }}>
          <p>
            Welcome to InsightClips. By accessing or using our website and services, you agree to be bound by these Terms of Service.
          </p>
          <h2 style={{ color: t.text, fontSize: 24, marginTop: 16, fontFamily: "'DM Serif Display', serif" }}>1. Acceptance of Terms</h2>
          <p>
            By creating an account or using InsightClips, you agree to comply with and be legally bound by these Terms. If you do not agree to these Terms, you may not use our services.
          </p>
          <h2 style={{ color: t.text, fontSize: 24, marginTop: 16, fontFamily: "'DM Serif Display', serif" }}>2. User Responsibilities</h2>
          <p>
            You are responsible for your use of the services and for any content you provide. You must only upload videos for which you have the necessary rights and permissions. You may not use our services for any illegal or unauthorized purpose.
          </p>
          <h2 style={{ color: t.text, fontSize: 24, marginTop: 16, fontFamily: "'DM Serif Display', serif" }}>3. Intellectual Property</h2>
          <p>
            The service and its original content, features, and functionality are owned by InsightClips. Your uploaded content remains your property, but you grant us a license to process and display it to provide our services.
          </p>
          <h2 style={{ color: t.text, fontSize: 24, marginTop: 16, fontFamily: "'DM Serif Display', serif" }}>4. Termination</h2>
          <p>
            We may terminate or suspend access to our service immediately, without prior notice or liability, for any reason whatsoever, including without limitation if you breach the Terms.
          </p>
        </div>
      </div>
    </div>
  );
}
