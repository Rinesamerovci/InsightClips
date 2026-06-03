export const THEME_STORAGE_KEY = "insightclips-theme";

export const studioTheme = {
  dark: {
    bg: "#0d1008",
    shell: "rgba(12,18,10,.9)",
    card: "rgba(18,26,14,.84)",
    cardAlt: "rgba(21,31,16,.92)",
    cardSolid: "#11180d",
    sidebar: "#0c1209",
    topbar: "rgba(12,18,10,.94)",
    border: "rgba(163,208,107,.16)",
    borderSub: "rgba(163,208,107,.08)",
    text: "#e8f0dc",
    textSub: "rgba(196,221,165,.72)",
    textFaint: "rgba(126,154,96,.42)",
    muted: "rgba(196,221,165,.72)",
    accent: "#a3d06b",
    accentLt: "#c9e89a",
    accentGlow: "rgba(163,208,107,.18)",
    chip: "rgba(163,208,107,.1)",
    red: "#ff9bae",
    redBg: "rgba(86,28,40,.72)",
    redBord: "rgba(236,122,140,.26)",
    errorBg: "rgba(86,28,40,.72)",
    errorBd: "rgba(236,122,140,.26)",
    errorText: "#ffc1cb",
  },
  light: {
    bg: "#f5f8ee",
    shell: "rgba(255,255,255,.88)",
    card: "rgba(255,255,255,.92)",
    cardAlt: "rgba(247,250,240,.96)",
    cardSolid: "#ffffff",
    sidebar: "#f1f6e8",
    topbar: "rgba(255,255,255,.94)",
    border: "rgba(100,140,60,.16)",
    borderSub: "rgba(100,140,60,.1)",
    text: "#1a2510",
    textSub: "rgba(90,112,64,.72)",
    textFaint: "rgba(122,144,96,.52)",
    muted: "rgba(90,112,64,.72)",
    accent: "#5a8c28",
    accentLt: "#8bbf45",
    accentGlow: "rgba(140,190,60,.14)",
    chip: "rgba(140,190,60,.08)",
    red: "#c64d65",
    redBg: "rgba(255,236,239,.92)",
    redBord: "rgba(224,140,156,.36)",
    errorBg: "rgba(255,236,239,.92)",
    errorBd: "rgba(224,140,156,.36)",
    errorText: "#9b314b",
  },
} as const;

export const authTheme = {
  dark: {
    bg: "#0d1008",
    panel: "rgba(14,24,11,.88)",
    shell: "rgba(16,28,12,.9)",
    border: "rgba(163,208,107,.18)",
    borderStrong: "rgba(163,208,107,.3)",
    text: "#e8f5e2",
    muted: "rgba(181,214,145,.72)",
    faint: "rgba(122,164,92,.48)",
    accent: "#a3d06b",
    accentStrong: "#6e9c3a",
    accentSoft: "rgba(163,208,107,.12)",
    highlight: "#c9e89a",
    showcase: "linear-gradient(150deg, #091007 0%, #12200c 54%, #0d1809 100%)",
  },
  light: {
    bg: "#f5f8ee",
    panel: "rgba(255,255,255,.92)",
    shell: "rgba(248,250,242,.96)",
    border: "rgba(100,140,60,.16)",
    borderStrong: "rgba(100,140,60,.26)",
    text: "#1a2e14",
    muted: "rgba(74,112,48,.72)",
    faint: "rgba(138,184,112,.5)",
    accent: "#5a9e3a",
    accentStrong: "#4d8a2f",
    accentSoft: "rgba(90,158,58,.08)",
    highlight: "#8bbf45",
    showcase: "linear-gradient(150deg, #daf0c8 0%, #eef7e3 54%, #e2f2d3 100%)",
  },
} as const;

export function getStudioTheme(dark: boolean) {
  return dark ? studioTheme.dark : studioTheme.light;
}

export function getAuthTheme(dark: boolean) {
  return dark ? authTheme.dark : authTheme.light;
}
