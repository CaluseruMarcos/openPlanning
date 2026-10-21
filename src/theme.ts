/**
 * A cool paper-and-spine palette borrowed from a well-kept service binder.
 *
 * Evergreen chrome anchors the tab screens, petrol carries interaction, and a
 * dry oxblood marks attention: unread counts, unread rules, and destructive
 * actions. The paper base is deliberately green-gray rather than warm cream, so
 * the product feels like a working document instead of a lifestyle brand.
 *
 * Fraunces appears once, in the wordmark. Hanken Grotesk runs the interface and
 * all display type. Every fontFamily below is a loaded weight, so styles never
 * rely on fontWeight (which behaves differently across platforms for custom
 * fonts).
 */
export const colors = {
  ink: "#121A17",
  inkSoft: "#37443F",
  muted: "#62706A",
  faint: "#77837E",
  canvas: "#EFF1EC",
  paper: "#FBFCF9",
  paperBright: "#FFFFFF",
  line: "#DAE0D8",
  lineStrong: "#BEC7BD",
  chrome: "#17332D",
  chromeDeep: "#0D211C",
  chromeSoft: "#A9BDB4",
  accent: "#2F5D6B",
  accentDeep: "#234A56",
  accentTint: "#E2ECEE",
  signal: "#8E3B32",
  danger: "#8E3B32",
  dangerTint: "#F4E6E2",
} as const;

export const fonts = {
  brand: "Fraunces_600SemiBold",
  regular: "HankenGrotesk_400Regular",
  medium: "HankenGrotesk_500Medium",
  semibold: "HankenGrotesk_600SemiBold",
  bold: "HankenGrotesk_700Bold",
} as const;

/** Muted cloth tones so avatars stay inside the palette regardless of server data. */
const avatarTones = [
  { background: "#2E4A42", foreground: colors.paper },
  { background: "#3B5560", foreground: colors.paper },
  { background: "#6A3B36", foreground: colors.paper },
  { background: "#4A4F3F", foreground: colors.paper },
  { background: "#4A4058", foreground: colors.paper },
  { background: "#536056", foreground: colors.paper },
] as const;

export function avatarTone(id: string) {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) % 997;
  }
  return avatarTones[hash % avatarTones.length];
}
