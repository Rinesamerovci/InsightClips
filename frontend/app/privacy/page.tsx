"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useAppTheme } from "../../lib/theme";

export default function PrivacyPolicy() {
  const { isDark, t } = useAppTheme();

  return (
    <div style={{ minHeight: "100vh", backgroundColor: t.bg, color: t.text, fontFamily: "'DM Sans', sans-serif", padding: "60px 20px", transition: "background-color 0.4s ease, color 0.4s ease" }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 8, color: t.accent, textDecoration: "none", fontSize: 14, marginBottom: 40, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em" }}>
          <ArrowLeft size={16} /> Back to Home
        </Link>
        <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: "clamp(36px, 5vw, 56px)", marginBottom: 24, lineHeight: 1.1 }}>Privacy Policy</h1>
        <p style={{ color: t.textMuted, fontSize: 16, marginBottom: 32 }}>Last updated: {new Date().toLocaleDateString()}</p>
        
        <div style={{ display: "flex", flexDirection: "column", gap: 24, fontSize: 15, lineHeight: 1.7, color: t.textMuted }}>
          <p>
            At InsightClips, we take your privacy seriously. This Privacy Policy explains how we collect, use, and protect your personal information when you use our services.
          </p>
          <h2 style={{ color: t.text, fontSize: 24, marginTop: 16, fontFamily: "'DM Serif Display', serif" }}>1. Information We Collect</h2>
          <p>
            We collect information you provide directly to us, such as when you create an account, upload videos, or communicate with us. This may include your name, email address, and video content. We also automatically collect certain technical data about your device and usage patterns.
          </p>
          <h2 style={{ color: t.text, fontSize: 24, marginTop: 16, fontFamily: "'DM Serif Display', serif" }}>2. How We Use Your Information</h2>
          <p>
            We use the information we collect to operate, maintain, and improve our services, to process your video uploads, to communicate with you, and to personalize your experience. We use AI processing exclusively to deliver the functionality of our product.
          </p>
          <h2 style={{ color: t.text, fontSize: 24, marginTop: 16, fontFamily: "'DM Serif Display', serif" }}>3. Data Security</h2>
          <p>
            We implement appropriate security measures to protect your personal information from unauthorized access, alteration, disclosure, or destruction. However, no internet transmission is completely secure, and we cannot guarantee absolute security.
          </p>
          <h2 style={{ color: t.text, fontSize: 24, marginTop: 16, fontFamily: "'DM Serif Display', serif" }}>4. Contact Us</h2>
          <p>
            If you have any questions about this Privacy Policy, please contact us at privacy@insightclips.com.
          </p>
        </div>
      </div>
    </div>
  );
}
