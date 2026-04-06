"use client";

import Link from "next/link";
import { ArrowLeft, UploadCloud } from "lucide-react";

export default function UploadPage() {
  return (
    <div className="min-h-screen bg-[#f4f7ef] px-6 py-10 text-[#203328]">
      <div className="mx-auto max-w-4xl">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 rounded-full border border-[#d9e5d3] bg-white px-4 py-3 text-sm font-medium text-[#4f6f52]"
        >
          <ArrowLeft size={16} />
          Back to dashboard
        </Link>

        <div className="mt-8 rounded-[2rem] border border-[#d9e5d3] bg-white p-10 shadow-[0_20px_50px_rgba(124,150,118,0.12)]">
          <div className="flex h-16 w-16 items-center justify-center rounded-[1.5rem] bg-[#d7e8d2] text-[#4f6f52]">
            <UploadCloud size={30} />
          </div>
          <p className="mt-6 text-xs uppercase tracking-[0.25em] text-[#7c9676]">Upload queue</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight">Podcast uploads are next.</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-[#5b6f5f]">
            This placeholder keeps the dashboard flow complete for Sprint 1. The real upload,
            transcription, and clipping pipeline can plug into this page in Sprint 2 without
            changing the current auth or dashboard structure.
          </p>
        </div>
      </div>
    </div>
  );
}
