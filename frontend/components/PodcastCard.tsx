type Podcast = {
  id: string;
  title: string;
  duration: number;
  status: string;
  created_at: string | null;
};

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

function formatDate(value: string | null): string {
  if (!value) {
    return "Just now";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function PodcastCard({ podcast }: { podcast: Podcast }) {
  const statusClassName =
    podcast.status === "completed"
      ? "bg-[#dff0db] text-[#35553c]"
      : podcast.status === "processing"
        ? "bg-[#fff3d8] text-[#8a6b1f]"
        : "bg-[#e9ece7] text-[#5f6f63]";

  return (
    <article className="rounded-[2rem] border border-[#d9e5d3] bg-white p-6 shadow-[0_20px_50px_rgba(124,150,118,0.12)] transition hover:-translate-y-1 hover:shadow-[0_24px_60px_rgba(124,150,118,0.16)]">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-[#7c9676]">Podcast</p>
          <h3 className="mt-2 text-xl font-semibold text-[#203328]">{podcast.title}</h3>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${statusClassName}`}>
          {podcast.status}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 rounded-[1.5rem] bg-[#f4f7ef] p-4 text-sm text-[#526352]">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[#8aa084]">Duration</p>
          <p className="mt-1 font-medium text-[#203328]">{formatDuration(podcast.duration)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[#8aa084]">Uploaded</p>
          <p className="mt-1 font-medium text-[#203328]">{formatDate(podcast.created_at)}</p>
        </div>
      </div>
    </article>
  );
}
