import { useSyncExternalStore } from "react";

export const theme = {
  dark: {
    bg:          "#0D1008",
    bgCard:      "#141A0E",
    bgCardHover: "#1A2213",
    border:      "rgba(163,208,107,0.08)",
    borderHover: "rgba(163,208,107,0.22)",
    text:        "#E8F0DC",
    textMuted:   "#7A9060",
    textFaint:   "#3D5030",
    accent:      "#A3D06B",
    accentDark:  "#6E9C3A",
    accentLight: "#C9E89A",
    glowA:       "rgba(163,208,107,0.14)",
    glowB:       "rgba(140,190,60,0.10)",
  },
  light: {
    bg:          "#F5F8EE",
    bgCard:      "#FFFFFF",
    bgCardHover: "#EFF5E4",
    border:      "rgba(100,140,60,0.12)",
    borderHover: "rgba(100,140,60,0.28)",
    text:        "#1A2510",
    textMuted:   "#5A7040",
    textFaint:   "#9AB878",
    accent:      "#5A8C28",
    accentDark:  "#3D6018",
    accentLight: "#8BBF45",
    glowA:       "rgba(140,190,60,0.15)",
    glowB:       "rgba(100,160,50,0.10)",
  },
};

export const THEME_STORAGE_KEY = "ic-theme";

function subscribeTheme(callback: () => void) {
  const handler = (event: Event) => {
    const storageEvent = event as StorageEvent;
    if (storageEvent.type === "storage" && storageEvent.key && storageEvent.key !== THEME_STORAGE_KEY) {
      return;
    }
    callback();
  };

  window.addEventListener("storage", handler);
  window.addEventListener("ic-theme-change", handler);

  return () => {
    window.removeEventListener("storage", handler);
    window.removeEventListener("ic-theme-change", handler);
  };
}

function getThemeSnapshot() {
  if (typeof window === "undefined") return "dark";
  return window.localStorage.getItem(THEME_STORAGE_KEY) === "light" ? "light" : "dark";
}

function getThemeServerSnapshot() {
  return "dark";
}

export function useAppTheme() {
  const currentTheme = useSyncExternalStore(subscribeTheme, getThemeSnapshot, getThemeServerSnapshot);
  const isDark = currentTheme === "dark";
  const t = isDark ? theme.dark : theme.light;
  return { isDark, t };
}
