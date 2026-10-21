/**
 * Neutral corporate palette with a warm paper base.
 *
 * Slate-navy chrome anchors the tab screens, steel blue carries interaction,
 * and a muted brass marks attention (unread counts, unread rules, your own
 * reactions). Warm off-white surfaces keep the product from feeling cold.
 *
 * Fraunces sets the display moments — the wordmark, screen titles, and
 * conversation names — while Hanken Grotesk runs the interface. Every fontFamily
 * below is a loaded weight, so styles never rely on fontWeight (which behaves
 * differently across platforms for custom fonts).
 */
export const colors = {
  ink: "#121A21",
  inkSoft: "#3B4852",
  muted: "#64717B",
  faint: "#6E7A83",
  canvas: "#F4F3EE",
  paper: "#FFFFFF",
  paperBright: "#FFFFFF",
  line: "#E1DFD7",
  lineStrong: "#C6C4BA",
  chrome: "#1B2A36",
  chromeDeep: "#121E27",
  chromeSoft: "#A9B7C2",
  positive: "#2F7A52",
  signal: "#8A5A22",
  signalTint: "#F1E8D9",
  signalBright: "#C9975A",
  infoTint: "#E9EFF5",
  infoText: "#3B5468",
  accent: "#2A5C8F",
  accentDeep: "#1D4368",
  accentTint: "#E4ECF5",
  danger: "#9C3A32",
  dangerTint: "#F7E9E6",
} as const;

export const fonts = {
  brand: "Fraunces_600SemiBold",
  regular: "HankenGrotesk_400Regular",
  medium: "HankenGrotesk_500Medium",
  semibold: "HankenGrotesk_600SemiBold",
  bold: "HankenGrotesk_700Bold",
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 18,
  pill: 999,
} as const;

/** Muted cloth tones so avatars stay inside the palette regardless of server data. */
const avatarTones = [
  { background: "#2C4457", foreground: colors.paper },
  { background: "#4A5A66", foreground: colors.paper },
  { background: "#2E5A54", foreground: colors.paper },
  { background: "#6B4A3C", foreground: colors.paper },
  { background: "#4E4463", foreground: colors.paper },
  { background: "#54626B", foreground: colors.paper },
] as const;

export function avatarTone(id: string) {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) % 997;
  }
  return avatarTones[hash % avatarTones.length];
}
