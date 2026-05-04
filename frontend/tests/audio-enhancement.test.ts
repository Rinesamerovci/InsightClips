import assert from "node:assert/strict";

import { getAudioEnhancementFeedback } from "../lib/audio-enhancement";

export function runAudioEnhancementTests(): void {
  const setupFeedback = getAudioEnhancementFeedback({
    audioEnhancement: {
      enabled: true,
      normalize_loudness: true,
      target_lufs: -16,
      true_peak_db: -1.5,
      status: "enabled",
    },
    context: "setup",
  });

  assert.equal(setupFeedback.tone, "enabled");
  assert.equal(setupFeedback.badge, "Audio leveling on");

  const savedFeedback = getAudioEnhancementFeedback({
    audioEnhancement: {
      enabled: false,
      normalize_loudness: false,
      target_lufs: -16,
      true_peak_db: -1.5,
      status: "disabled",
    },
    context: "saved",
  });

  assert.equal(savedFeedback.tone, "disabled");
  assert.equal(savedFeedback.title, "Audio will stay as recorded");

  const failedFeedback = getAudioEnhancementFeedback({
    audioEnhancement: {
      enabled: true,
      normalize_loudness: true,
      target_lufs: -16,
      true_peak_db: -1.5,
      status: "failed",
    },
    clipStatus: "failed",
    context: "clip",
  });

  assert.equal(failedFeedback.tone, "failed");
  assert.equal(failedFeedback.badge, "Audio issue");
}
