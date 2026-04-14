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
    <article className="flex h-full min-w-0 flex-col rounded-[2rem] border border-[#d9e5d3] bg-white p-6 shadow-[0_20px_50px_rgba(124,150,118,0.12)] transition hover:-translate-y-1 hover:shadow-[0_24px_60px_rgba(124,150,118,0.16)]">
      <div className="mb-5 space-y-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.25em] text-[#7c9676]">Podcast</p>
          <h3
            className="mt-2 text-xl font-semibold leading-8 text-[#203328]"
            style={{
              display: "-webkit-box",
              WebkitBoxOrient: "vertical",
              WebkitLineClamp: 3,
              overflow: "hidden",
            }}
          >
            {podcast.title}
          </h3>
        </div>
        <span className={`inline-flex w-fit max-w-full rounded-full px-3 py-1 text-xs font-semibold uppercase ${statusClassName}`}>
          {podcast.status}
        </span>
      </div>

      <div className="mt-auto grid grid-cols-2 gap-4 rounded-[1.5rem] bg-[#f4f7ef] p-4 text-sm text-[#526352]">
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
