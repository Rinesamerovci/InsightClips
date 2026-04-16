"use client";

import { Clock3, DollarSign, FileVideo2, Gift, ShieldCheck } from "lucide-react";

import type { UploadPriceResponse } from "@/lib/api";

type UploadPreflightResultCardProps = {
  result: UploadPriceResponse;
};

function formatPrice(value: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(value);
}

function formatMinutes(value: number): string {
  return `${value.toFixed(value % 1 === 0 ? 0 : 2)} min`;
}

export function UploadPreflightResultCard({
  result,
}: UploadPreflightResultCardProps) {
  return (
    <section className="rounded-[2rem] border border-[#d9e5d3] bg-white p-6 shadow-[0_20px_50px_rgba(124,150,118,0.1)]">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-[#7c9676]">Pre-flight result</p>
          <h2 className="mt-2 text-2xl font-semibold text-[#203328]">Upload pricing summary</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#5b6f5f]">{result.message}</p>
        </div>
        <div className="rounded-full border border-[#d9e5d3] bg-[#f7fbf5] px-4 py-2 text-[11px] font-black uppercase tracking-[0.22em] text-[#4f6f52]">
          {result.is_mock ? "Mock response" : "Live response"}
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-[1.5rem] border border-[#dfead9] bg-[#f7fbf5] p-4">
          <div className="flex items-center gap-2 text-[#4f6f52]">
            <Clock3 size={16} />
            <span className="text-[10px] font-black uppercase tracking-[0.22em]">Detected duration</span>
          </div>
          <p className="mt-3 text-2xl font-semibold text-[#203328]">{formatMinutes(result.duration_minutes)}</p>
          <p className="mt-1 text-xs text-[#6f8570]">{Math.round(result.duration_seconds)} seconds</p>
        </div>

        <div className="rounded-[1.5rem] border border-[#dfead9] bg-[#f7fbf5] p-4">
          <div className="flex items-center gap-2 text-[#4f6f52]">
            <DollarSign size={16} />
            <span className="text-[10px] font-black uppercase tracking-[0.22em]">Calculated price</span>
          </div>
          <p className="mt-3 text-2xl font-semibold text-[#203328]">
            {formatPrice(result.price, result.currency)}
          </p>
          <p className="mt-1 text-xs text-[#6f8570]">
            {result.status === "free_ready" ? "Covered by free tier" : "Processing fee preview"}
          </p>
        </div>

        <div className="rounded-[1.5rem] border border-[#dfead9] bg-[#f7fbf5] p-4">
          <div className="flex items-center gap-2 text-[#4f6f52]">
            <Gift size={16} />
            <span className="text-[10px] font-black uppercase tracking-[0.22em]">Free trial</span>
          </div>
          <p className="mt-3 text-2xl font-semibold text-[#203328]">
            {result.free_trial_available ? "Available" : "Used"}
          </p>
          <p className="mt-1 text-xs text-[#6f8570]">One free upload up to 30 minutes</p>
        </div>

        <div className="rounded-[1.5rem] border border-[#dfead9] bg-[#f7fbf5] p-4">
          <div className="flex items-center gap-2 text-[#4f6f52]">
            <FileVideo2 size={16} />
            <span className="text-[10px] font-black uppercase tracking-[0.22em]">Detected format</span>
          </div>
          <p className="mt-3 text-2xl font-semibold capitalize text-[#203328]">
            {result.detected_format ?? "Unknown"}
          </p>
          <p className="mt-1 text-xs text-[#6f8570]">Validated by the current pre-flight service</p>
        </div>
      </div>

      <div className="mt-5 rounded-[1.5rem] border border-[#d9e5d3] bg-[#fbfdf9] p-4">
        <div className="flex items-center gap-2 text-[#4f6f52]">
          <ShieldCheck size={16} />
          <span className="text-[10px] font-black uppercase tracking-[0.22em]">Validation flags</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {Object.entries(result.validation_flags ?? {}).map(([key, passed]) => (
            <span
              key={key}
              className={`rounded-full px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] ${
                passed
                  ? "border border-[#cfe3d0] bg-[#eef8ef] text-[#3c7b4a]"
                  : "border border-[#f0cccc] bg-[#fff3f3] text-[#b95252]"
              }`}
            >
              {key.replace(/_/g, " ")}: {passed ? "ok" : "fail"}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
