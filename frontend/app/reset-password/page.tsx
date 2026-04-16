"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Loader2, Lock, ShieldAlert } from "lucide-react";

import { supabase } from "@/lib/supabase";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [sessionValid, setSessionValid] = useState<boolean | null>(null);

  useEffect(() => {
    const checkSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setSessionValid(Boolean(session));
    };

    void checkSession();
  }, []);

  const handleUpdatePassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    setSuccess(true);
    await supabase.auth.signOut();
    setTimeout(() => router.push("/login"), 2500);
  };

  if (sessionValid === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f4f7ef]">
        <Loader2 className="animate-spin text-[#4f6f52]" size={36} />
      </div>
    );
  }

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
            <p className="text-xs uppercase tracking-[0.25em] text-[#7c9676]">Security update</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight">Set a new password and return safely.</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-[#5b6f5f]">
              Finish password recovery, then head back into the dashboard and Sprint 2 upload flow.
            </p>
          </section>

          <section className="rounded-[2rem] border border-[#d9e5d3] bg-white p-8 shadow-[0_20px_50px_rgba(124,150,118,0.12)] md:p-10">
            {!sessionValid ? (
              <div className="flex flex-col items-center py-8 text-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-full border border-[#e6b7b7] bg-[#fff4f4] text-[#934949]">
                  <ShieldAlert size={38} />
                </div>
                <h2 className="mt-6 text-3xl font-semibold tracking-tight">Recovery session expired</h2>
                <p className="mt-3 max-w-md text-sm leading-6 text-[#5b6f5f]">
                  Please request a new password reset link and try again.
                </p>
                <Link
                  href="/forgot-password"
                  className="mt-8 inline-flex items-center justify-center rounded-full bg-[#4f6f52] px-6 py-4 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(79,111,82,0.25)]"
                >
                  Request new reset link
                </Link>
              </div>
            ) : !success ? (
              <>
                <div>
                  <p className="text-xs uppercase tracking-[0.25em] text-[#7c9676]">New password</p>
                  <h2 className="mt-2 text-3xl font-semibold tracking-tight">Update password</h2>
                </div>

                <form className="mt-8 space-y-5" onSubmit={handleUpdatePassword}>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-[#35553c]" htmlFor="password">
                      New password
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-[#7c9676]" size={18} />
                      <input
                        id="password"
                        required
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="At least 6 characters"
                        className="w-full rounded-2xl border border-[#d9e5d3] bg-[#f9fbf7] py-4 pl-12 pr-4 text-sm outline-none transition focus:border-[#4f6f52] focus:bg-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-[#35553c]" htmlFor="confirmPassword">
                      Confirm password
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-[#7c9676]" size={18} />
                      <input
                        id="confirmPassword"
                        required
                        type="password"
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        placeholder="Repeat your password"
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
                        Updating...
                      </>
                    ) : (
                      "Update password"
                    )}
                  </button>
                </form>
              </>
            ) : (
              <div className="flex flex-col items-center py-8 text-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-full border border-[#b9d6b4] bg-[#eef8eb] text-[#2e5b33]">
                  <CheckCircle2 size={38} />
                </div>
                <h2 className="mt-6 text-3xl font-semibold tracking-tight">Password updated</h2>
                <p className="mt-3 max-w-md text-sm leading-6 text-[#5b6f5f]">
                  Your password was changed successfully. Redirecting you back to login.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
