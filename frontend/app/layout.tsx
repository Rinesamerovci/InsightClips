import type { Metadata } from "next";
import type { CSSProperties } from "react";
import "./globals.css";
import { AuthRouteGuard } from "@/components/AuthRouteGuard";
import { AuthProvider } from "@/context/AuthContext";

export const metadata: Metadata = {
  title: "InsightClips",
  description: "AI-based podcast moment extractor",
  icons: {
    icon: "/insightclips-logo.svg",
    shortcut: "/insightclips-logo.svg",
    apple: "/insightclips-logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-scroll-behavior="smooth" className="h-full antialiased">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,300;0,400;0,500;0,700;1,700&family=DM+Serif+Display:ital@0;1&display=swap"
        />
      </head>
      <body
        style={
          {
            "--font-app-sans": '"DM Sans", sans-serif',
            "--font-app-serif": '"DM Serif Display", serif',
            "--font-app-mono": '"JetBrains Mono", monospace',
          } as CSSProperties
        }
        className="min-h-full flex flex-col"
      >
        <AuthProvider>
          <AuthRouteGuard>{children}</AuthRouteGuard>
        </AuthProvider>
      </body>
    </html>
  );
}
