type Profile = {
  email: string;
  full_name: string | null;
  profile_picture_url: string | null;
  free_trial_used: boolean;
  created_at: string | null;
};

function formatMemberDate(value: string | null): string {
  if (!value) {
    return "Recently joined";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function UserProfileCard({ profile }: { profile: Profile }) {
  const initials = (profile.full_name || profile.email || "I")
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <section className="rounded-[2rem] border border-[#d9e5d3] bg-white p-6 shadow-[0_20px_50px_rgba(124,150,118,0.12)]">
      <div className="flex items-center gap-4">
        {profile.profile_picture_url ? (
          <img
            alt="Profile"
            className="h-16 w-16 rounded-[1.5rem] object-cover"
            src={profile.profile_picture_url}
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-[1.5rem] bg-[#d7e8d2] text-xl font-semibold text-[#2e4b35]">
            {initials}
          </div>
        )}
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-[#7c9676]">Profile</p>
          <h2 className="mt-1 text-2xl font-semibold text-[#203328]">
            {profile.full_name || "InsightClips Creator"}
          </h2>
          <p className="text-sm text-[#5b6f5f]">{profile.email}</p>
        </div>
      </div>

      <div className="mt-6 grid gap-3 rounded-[1.5rem] bg-[#f4f7ef] p-4 text-sm text-[#526352]">
        <div className="flex items-center justify-between">
          <span>Free trial</span>
          <span className="font-medium text-[#203328]">
            {profile.free_trial_used ? "Used" : "Available"}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span>Member since</span>
          <span className="font-medium text-[#203328]">
            {formatMemberDate(profile.created_at)}
          </span>
        </div>
      </div>
    </section>
  );
}
