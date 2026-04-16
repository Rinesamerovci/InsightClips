"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Mail, ShieldCheck } from "lucide-react";

import { supabase } from "@/lib/supabase";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSendReset = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (resetError) {
      setError(resetError.message);
    } else {
      setSuccess(true);
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#f4f7ef] px-6 py-8 text-[#203328]">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl flex-col justify-center">
        <Link
          href="/login"
          className="inline-flex items-center gap-2 rounded-full border border-[#d9e5d3] bg-white px-4 py-3 text-sm font-medium text-[#4f6f52]"
        >
          <ArrowLeft size={16} />
          Back to login
        </Link>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_0.95fr]">
          <section className="rounded-[2rem] border border-[#d9e5d3] bg-[#d7e8d2] p-8 shadow-[0_20px_50px_rgba(124,150,118,0.12)] md:p-10">
            <p className="text-xs uppercase tracking-[0.25em] text-[#7c9676]">Account recovery</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight">Request a secure password reset.</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-[#5b6f5f]">
              We&apos;ll send you a recovery link so you can set a new password and continue back into
              the dashboard and upload flow.
            </p>
          </section>

          <section className="rounded-[2rem] border border-[#d9e5d3] bg-white p-8 shadow-[0_20px_50px_rgba(124,150,118,0.12)] md:p-10">
            {!success ? (
              <>
                <div>
                  <p className="text-xs uppercase tracking-[0.25em] text-[#7c9676]">Reset email</p>
                  <h2 className="mt-2 text-3xl font-semibold tracking-tight">Send recovery link</h2>
                </div>

                <form className="mt-8 space-y-5" onSubmit={handleSendReset}>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-[#35553c]" htmlFor="email">
                      Email
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-[#7c9676]" size={18} />
                      <input
                        id="email"
                        required
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="you@example.com"
                        className="w-full rounded-2xl border border-[#d9e5d3] bg-[#f9fbf7] py-4 pl-12 pr-4 text-sm outline-none transition focus:border-[#4f6f52] focus:bg-white"
                      />
                    </div>
                  </div>

                  {error ? (
                    <div className="rounded-[1.25rem] border border-[#e6b7b7] bg-[#fff4f4] px-4 py-3 text-sm text-[#934949]">
                      {error}
                    </div>
                  ) : null}

                  <button
                    type="submit"
                    disabled={loading}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#4f6f52] px-5 py-4 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(79,111,82,0.25)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loading ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Sending...
                      </>
                    ) : (
                      "Send reset link"
                    )}
                  </button>
                </form>
              </>
            ) : (
              <div className="flex flex-col items-center py-8 text-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-full border border-[#b9d6b4] bg-[#eef8eb] text-[#2e5b33]">
                  <ShieldCheck size={38} />
                </div>
                <h2 className="mt-6 text-3xl font-semibold tracking-tight">Check your email</h2>
                <p className="mt-3 max-w-md text-sm leading-6 text-[#5b6f5f]">
                  We sent a recovery link to your email address. Open it to continue to the reset page.
                </p>
                <button
                  type="button"
                  onClick={() => router.push("/login")}
                  className="mt-8 inline-flex items-center justify-center rounded-full bg-[#4f6f52] px-6 py-4 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(79,111,82,0.25)]"
                >
                  Return to login
                </button>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
