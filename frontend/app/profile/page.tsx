"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Save } from "lucide-react";

import { UserProfileCard } from "@/components/UserProfileCard";
import { useAuth } from "@/context/AuthContext";
import { getJson, putJson } from "@/lib/api";

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
  const [saving, setSaving] = useState(false);
  const [fullName, setFullName] = useState("");
  const [profilePictureUrl, setProfilePictureUrl] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
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
        setFullName(profileData.full_name ?? "");
        setProfilePictureUrl(profileData.profile_picture_url ?? "");
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

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSaveMessage("");

    try {
      const token = backendToken ?? (await syncBackendSession());
      if (!token) {
        router.replace("/login");
        return;
      }

      const updatedProfile = await putJson<ProfileResponse>(
        "/users/profile",
        {
          full_name: fullName.trim() || null,
          profile_picture_url: profilePictureUrl.trim() || null,
        },
        token
      );

      setProfile(updatedProfile);
      setFullName(updatedProfile.full_name ?? "");
      setProfilePictureUrl(updatedProfile.profile_picture_url ?? "");
      setSaveMessage("Profile updated successfully.");
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : "Unable to save profile.";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

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
            <p className="text-xs uppercase tracking-[0.25em] text-[#7c9676]">Edit profile</p>
            <h2 className="mt-2 text-2xl font-semibold">Update your details</h2>
            <p className="mt-3 text-sm leading-6 text-[#5b6f5f]">
              Change your display name or profile image link here. This is not tied to billing.
            </p>

            <div className="mt-6 space-y-4">
              <label className="block">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#7c9676]">
                  Full name
                </span>
                <input
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  placeholder="InsightClips Creator"
                  className="mt-3 w-full rounded-[1.25rem] border border-[#d9e5d3] bg-white px-4 py-4 text-sm font-medium text-[#203328] outline-none transition-colors focus:border-[#98b48f]"
                />
              </label>

              <label className="block">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#7c9676]">
                  Profile picture URL
                </span>
                <input
                  value={profilePictureUrl}
                  onChange={(event) => setProfilePictureUrl(event.target.value)}
                  placeholder="https://example.com/avatar.jpg"
                  className="mt-3 w-full rounded-[1.25rem] border border-[#d9e5d3] bg-white px-4 py-4 text-sm font-medium text-[#203328] outline-none transition-colors focus:border-[#98b48f]"
                />
              </label>

              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#4f6f52] px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(79,111,82,0.25)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? (
                  <>
                    Saving
                    <Loader2 size={16} className="animate-spin" />
                  </>
                ) : (
                  <>
                    Save changes
                    <Save size={16} />
                  </>
                )}
              </button>

              {saveMessage ? (
                <div className="rounded-[1.25rem] border border-[#cfe0c9] bg-[#f4f9f1] px-4 py-3 text-sm text-[#35553c]">
                  {saveMessage}
                </div>
              ) : null}
            </div>
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
