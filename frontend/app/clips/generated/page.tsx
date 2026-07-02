"use client";

import { Suspense } from "react";

import { ClipsPageContent } from "../page";

export default function GeneratedClipsPage() {
  // Suspense wrapper for async rendering support
    // fallback={null} means no loading UI is shown while loading
  return (
    <Suspense fallback={null}>
      <ClipsPageContent mode="results" />
    </Suspense>
  );
}
