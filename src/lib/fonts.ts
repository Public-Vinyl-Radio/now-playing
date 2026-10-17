export interface BroadcastFont {
  id: string;
  label: string;
  /** Same-origin file in public/fonts; one upright face per entry. */
  source: string;
}

/** Register local fonts here. Keep IDs stable because preferences store them. */
export const BROADCAST_FONTS: readonly BroadcastFont[] = [
  { id: "dm-mono", label: "DM Mono", source: "/fonts/dm-mono.ttf" },
  {
    id: "libre-caslon-display",
    label: "Libre Caslon Display",
    source: "/fonts/libre-caslon-display.ttf",
  },
  {
    id: "jetbrains-mono",
    label: "JetBrains Mono Bold",
    source: "/fonts/JetBrainsMono-Bold.ttf",
  },
];

export const METADATA_FIELDS = ["artist", "title", "album"] as const;
export type MetadataField = (typeof METADATA_FIELDS)[number];
export type MetadataFonts = Record<MetadataField, string[]>;

export const FALLBACK_FONTS: MetadataFonts = {
  artist: ["monospace"],
  title: ["monospace"],
  album: ["monospace"],
};

export function registeredFont(id: unknown) {
  return typeof id === "string"
    ? BROADCAST_FONTS.find((font) => font.id === id)
    : undefined;
}
