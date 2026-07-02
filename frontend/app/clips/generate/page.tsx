"use client";
// Suspense përdoret për lazy loading / async data në React (Next.js App Router)
import { Suspense } from "react";
// Importon komponentin kryesor të faqes Clips (nga parent folder)
import { ClipsPageContent } from "../page";

export default function GenerateClipsPage() {
  return (
    <Suspense fallback={null}>
       {/* 
        ClipsPageContent është komponenti kryesor i faqes.
        mode="generate" i tregon që kjo faqe është për "generate clips"
        (jo listim, jo editim, por krijim/gjenerim).
      */}
      <ClipsPageContent mode="generate" />
    </Suspense>
  );
}
