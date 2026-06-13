"use client";

import { Suspense } from "react";

import { ClipsPageContent } from "../page";

export default function GenerateClipsPage() {
  return (
    <Suspense fallback={null}>
      <ClipsPageContent mode="generate" />
    </Suspense>
  );
}
