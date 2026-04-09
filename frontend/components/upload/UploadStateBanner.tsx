"use client";

import { AlertTriangle, CheckCircle2, CreditCard, Info, Loader2 } from "lucide-react";

type BannerTone = "success" | "error" | "info" | "warning" | "pending";

type UploadStateBannerProps = {
  tone: BannerTone;
  title: string;
  message: string;
};

const bannerStyles: Record<
  BannerTone,
  {
    container: string;
    icon: typeof CheckCircle2;
    iconClassName: string;
  }
> = {
  success: {
    container: "border-[#b9ddc2] bg-[#f1fbf3] text-[#29563a]",
    icon: CheckCircle2,
    iconClassName: "text-[#3f8f59]",
  },
  error: {
    container: "border-[#edc1c1] bg-[#fff5f5] text-[#8f4a4a]",
    icon: AlertTriangle,
    iconClassName: "text-[#c15353]",
  },
  info: {
    container: "border-[#d9e5d3] bg-white text-[#4f6f52]",
    icon: Info,
    iconClassName: "text-[#4f6f52]",
  },
  warning: {
    container: "border-[#ead7b2] bg-[#fffaf0] text-[#7b6131]",
    icon: AlertTriangle,
    iconClassName: "text-[#b28731]",
  },
  pending: {
    container: "border-[#d9e5d3] bg-[#f7fbf5] text-[#4f6f52]",
    icon: Loader2,
    iconClassName: "animate-spin text-[#4f6f52]",
  },
};

export function UploadStateBanner({
  tone,
  title,
  message,
}: UploadStateBannerProps) {
  const config = bannerStyles[tone];
  const Icon = config.icon;

  return (
    <div className={`rounded-[1.75rem] border px-5 py-4 ${config.container}`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-full bg-white/80 p-2">
          <Icon className={config.iconClassName} size={18} />
        </div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em]">{title}</p>
          <p className="mt-2 text-sm leading-6">{message}</p>
        </div>
      </div>
    </div>
  );
}

export function PaymentPendingBanner({
  price,
  currency,
}: {
  price: number;
  currency: string;
}) {
  return (
    <div className="rounded-[1.75rem] border border-[#ead7b2] bg-[#fffaf0] px-5 py-4 text-[#7b6131]">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-full bg-white/80 p-2">
          <CreditCard className="text-[#b28731]" size={18} />
        </div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em]">Payment required</p>
          <p className="mt-2 text-sm leading-6">
            This file is ready for the billing step. Stripe is intentionally not wired in yet, so
            the upload stays queued until payment is added in a later sprint.
          </p>
          <p className="mt-3 text-sm font-semibold">
            Due now: {new Intl.NumberFormat("en-US", { style: "currency", currency }).format(price)}
          </p>
        </div>
      </div>
    </div>
  );
}
