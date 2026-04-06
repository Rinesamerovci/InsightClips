"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, LogOut, Moon, Plus, SunMedium } from "lucide-react";

import { PodcastCard } from "@/components/PodcastCard";
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

type Podcast = {
  id: string;
  user_id: string;
  title: string;
  duration: number;
  status: string;
  created_at: string | null;
  updated_at: string | null;
};

type PodcastsResponse = {
  podcasts: Podcast[];
  is_mock: boolean;
};

export default function DashboardPage() {
  const router = useRouter();
  const { backendToken, loading: authLoading, signOut, syncBackendSession } = useAuth();
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [podcasts, setPodcasts] = useState<Podcast[]>([]);
  const [isMock, setIsMock] = useState(false);
  const [loading, setLoading] = useState(true);
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.localStorage.getItem("insightclips-theme") === "dark";
  });
  const [error, setError] = useState("");

  useEffect(() => {
    window.localStorage.setItem("insightclips-theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    const loadDashboard = async () => {
      setLoading(true);
      setError("");

      try {
        const token = backendToken ?? (await syncBackendSession());
        if (!token) {
          router.replace("/login");
          return;
        }

        const [profileData, podcastsData] = await Promise.all([
          getJson<ProfileResponse>("/users/profile", token),
          getJson<PodcastsResponse>("/podcasts", token),
        ]);

        setProfile(profileData);
        setPodcasts(podcastsData.podcasts);
        setIsMock(podcastsData.is_mock);
      } catch (caughtError) {
        const message =
          caughtError instanceof Error ? caughtError.message : "Unable to load dashboard.";
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    void loadDashboard();
  }, [authLoading, backendToken, router, syncBackendSession]);

  if (loading || authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f4f7ef]">
        <Loader2 className="animate-spin text-[#4f6f52]" size={36} />
      </div>
    );
  }

  return (
    <div className={darkMode ? "min-h-screen bg-[#1a211b] text-[#eff5eb]" : "min-h-screen bg-[#f4f7ef] text-[#203328]"}>
      <div className="mx-auto max-w-7xl px-6 py-8">
        <header className={darkMode ? "rounded-[2rem] border border-[#2d3a2f] bg-[#202922] p-6" : "rounded-[2rem] border border-[#d9e5d3] bg-[#d7e8d2] p-6"}>
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-[#7c9676]">Creator dashboard</p>
              <h1 className="mt-2 text-4xl font-semibold">
                {profile?.full_name ? `Welcome back, ${profile.full_name.split(" ")[0]}` : "Welcome to InsightClips"}
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-[#5b6f5f]">
                Manage your profile, browse your uploaded podcasts, and prepare your workspace for clipping and transcription.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => setDarkMode((current) => !current)}
                className="inline-flex items-center gap-2 rounded-full border border-[#b7cbb0] bg-white px-4 py-3 text-sm font-medium text-[#35553c]"
              >
                {darkMode ? <SunMedium size={16} /> : <Moon size={16} />}
                {darkMode ? "Light mode" : "Dark mode"}
              </button>
              <button
                onClick={() => router.push("/upload")}
                className="inline-flex items-center gap-2 rounded-full bg-[#4f6f52] px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(79,111,82,0.25)]"
              >
                <Plus size={16} />
                Upload podcast
              </button>
              <button
                onClick={() => void signOut()}
                className="inline-flex items-center gap-2 rounded-full border border-[#e2c8c8] bg-white px-4 py-3 text-sm font-medium text-[#8f4a4a]"
              >
                <LogOut size={16} />
                Logout
              </button>
            </div>
          </div>
        </header>

        {error ? (
          <div className="mt-6 rounded-[1.5rem] border border-[#e6b7b7] bg-[#fff4f4] px-4 py-3 text-sm text-[#9d4b4b]">
            {error}
          </div>
        ) : null}

        <div className="mt-8 grid gap-8 lg:grid-cols-[320px_1fr]">
          {profile ? <UserProfileCard profile={profile} /> : null}

          <section>
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold">Your podcasts</h2>
                <p className="text-sm text-[#5b6f5f]">
                  {isMock
                    ? "Showing starter mock data until you upload your first podcast."
                    : "Only your authenticated podcasts appear here."}
                </p>
              </div>
              <Link href="/profile" className="text-sm font-medium text-[#4f6f52] underline-offset-4 hover:underline">
                Open profile
              </Link>
            </div>

            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {podcasts.map((podcast) => (
                <PodcastCard key={podcast.id} podcast={podcast} />
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
