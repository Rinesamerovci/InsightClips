import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext"; // Import the Authentication Context

export const metadata: Metadata = {
  title: "InsightClips",
  description: "AI-based podcast moment extractor",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
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
