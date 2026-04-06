"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";

import { UserProfileCard } from "@/components/UserProfileCard";
import { useAuth } from "@/context/AuthContext";
import { getJson } from "@/lib/api";

type ProfileResponse = {
  id: string;
  email: string;
  full_name: string | null;
  profile_picture_url: string | null;
  free_trial_used: boolean;
  created_at: string | null;
  updated_at: string | null;
};

export default function ProfilePage() {
  const router = useRouter();
  const { backendToken, loading: authLoading, syncBackendSession } = useAuth();
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (authLoading) {
      return;
    }

    const loadProfile = async () => {
      setLoading(true);
      setError("");

      try {
        const token = backendToken ?? (await syncBackendSession());
        if (!token) {
          router.replace("/login");
          return;
        }

        const profileData = await getJson<ProfileResponse>("/users/profile", token);
        setProfile(profileData);
      } catch (caughtError) {
        const message =
          caughtError instanceof Error ? caughtError.message : "Unable to load profile.";
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    void loadProfile();
  }, [authLoading, backendToken, router, syncBackendSession]);

  if (loading || authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f4f7ef]">
        <Loader2 className="animate-spin text-[#4f6f52]" size={34} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f4f7ef] px-6 py-10 text-[#203328]">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 rounded-full border border-[#d9e5d3] bg-white px-4 py-3 text-sm font-medium text-[#4f6f52]"
        >
          <ArrowLeft size={16} />
          Back to dashboard
        </Link>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_280px]">
          {profile ? <UserProfileCard profile={profile} /> : null}

          <aside className="rounded-[2rem] border border-[#d9e5d3] bg-white p-6 shadow-[0_20px_50px_rgba(124,150,118,0.12)]">
            <p className="text-xs uppercase tracking-[0.25em] text-[#7c9676]">Account notes</p>
            <h2 className="mt-2 text-2xl font-semibold">Sprint 2 ready</h2>
            <p className="mt-3 text-sm leading-6 text-[#5b6f5f]">
              This profile page is now backed by the API so we can safely add uploads,
              podcast history, and billing data in the next sprint without changing the
              auth base.
            </p>
          </aside>
        </div>

        {error ? (
          <div className="mt-6 rounded-[1.5rem] border border-[#e6b7b7] bg-[#fff4f4] px-4 py-3 text-sm text-[#9d4b4b]">
            {error}
          </div>
        ) : null}
      </div>
    </div>
  );
}
