import type { Metadata } from "next";
import { DM_Sans, DM_Serif_Display, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext"; // Import the Authentication Context

const sans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-app-sans",
});

const serif = DM_Serif_Display({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-app-serif",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-app-mono",
});

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
      <body className={`${sans.variable} ${serif.variable} ${mono.variable} min-h-full flex flex-col`}>
        {/* Wrap children with AuthProvider to ensure authentication state 
          is accessible throughout the entire application.
        */}
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
