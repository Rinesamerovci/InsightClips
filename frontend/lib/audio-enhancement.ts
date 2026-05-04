import type { AudioEnhancementSettings } from "./api";

export type AudioEnhancementTone = "enabled" | "disabled" | "failed" | "unknown";
export type AudioEnhancementContext = "setup" | "saved" | "clip";

type AudioEnhancementLike =
  | (Partial<AudioEnhancementSettings> & { status?: string | null })
  | null
  | undefined;

export type AudioEnhancementFeedback = {
  tone: AudioEnhancementTone;
  badge: string;
  title: string;
  description: string;
};

function resolveTone(
  audioEnhancement?: AudioEnhancementLike,
  clipStatus?: string | null,
): AudioEnhancementTone {
  const normalizedClipStatus =
    typeof clipStatus === "string" ? clipStatus.trim().toLowerCase() : "";
  const rawStatus =
    typeof audioEnhancement?.status === "string"
      ? audioEnhancement.status.trim().toLowerCase()
      : "";

  if (
    normalizedClipStatus === "failed" ||
    rawStatus === "failed" ||
    rawStatus === "error"
  ) {
    return "failed";
  }

  if (!audioEnhancement) {
    return "unknown";
  }

  if (rawStatus === "enabled") {
    return "enabled";
  }

  if (rawStatus === "disabled") {
    return "disabled";
  }

  const enabled = audioEnhancement.enabled !== false;
  const normalizeLoudness = audioEnhancement.normalize_loudness !== false;

  if (enabled && normalizeLoudness) {
    return "enabled";
  }

  if (!enabled || !normalizeLoudness) {
    return "disabled";
  }

  return "unknown";
}

export function getAudioEnhancementFeedback(options: {
  audioEnhancement?: AudioEnhancementLike;
  clipStatus?: string | null;
  context?: AudioEnhancementContext;
}): AudioEnhancementFeedback {
  const tone = resolveTone(options.audioEnhancement, options.clipStatus);
  const context = options.context ?? "clip";

  if (context === "setup") {
    switch (tone) {
      case "enabled":
        return {
          tone,
          badge: "Audio leveling on",
          title: "Volume will be evened out",
          description: "Clips will export with smoother, more consistent sound.",
        };
      case "disabled":
        return {
          tone,
          badge: "Audio leveling off",
          title: "Original volume will be kept",
          description: "The export will keep the source audio without extra leveling.",
        };
      case "failed":
        return {
          tone,
          badge: "Audio check failed",
          title: "Audio improvement could not be confirmed",
          description: "If export runs into a problem, we will show that clearly here.",
        };
      default:
        return {
          tone,
          badge: "Audio info pending",
          title: "Audio setting is not confirmed yet",
          description: "We will confirm the final audio result after the export record is saved.",
        };
    }
  }

  if (context === "saved") {
    switch (tone) {
      case "enabled":
        return {
          tone,
          badge: "Enhanced audio",
          title: "Audio improvement is saved for export",
          description: "This upload is set to export with smoother, more even volume.",
        };
      case "disabled":
        return {
          tone,
          badge: "Original audio",
          title: "Audio will stay as recorded",
          description: "This upload is saved without extra volume changes.",
        };
      case "failed":
        return {
          tone,
          badge: "Audio issue",
          title: "Audio improvement could not be confirmed",
          description: "The export settings were saved, but the final audio result may need another try.",
        };
      default:
        return {
          tone,
          badge: "Pending audio",
          title: "Audio export details are not available yet",
          description: "The record was created, but the final audio result has not been confirmed.",
        };
    }
  }

  switch (tone) {
    case "enabled":
      return {
        tone,
        badge: "Enhanced audio",
        title: "Exported with improved audio",
        description: "This clip was exported with smoother, more even volume.",
      };
    case "disabled":
      return {
        tone,
        badge: "Original audio",
        title: "Exported without audio changes",
        description: "This clip kept the original volume from the source video.",
      };
    case "failed":
      return {
        tone,
        badge: "Audio issue",
        title: "Audio improvement could not be confirmed",
        description: "This export did not finish cleanly, so the audio result may be incomplete.",
      };
    default:
      return {
        tone,
        badge: "Audio unknown",
        title: "Audio result was not returned",
        description: "This clip is available, but we could not verify whether audio improvement was applied.",
      };
  }
}
