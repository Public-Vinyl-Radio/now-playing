import { registeredFont, type MetadataFonts, METADATA_FIELDS } from "./fonts";
import type { VisualPreferences } from "./preferences";

const loads = new Map<string, Promise<string[]>>();

async function withFontTimeout<T>(loading: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      loading,
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Font load timed out")), 3000); }),
    ]);
  } finally { clearTimeout(timer); }
}

export async function loadStationFonts() {
  try {
    await withFontTimeout(Promise.allSettled([
      document.fonts.load('16px "DM Mono"'), document.fonts.load('16px "Libre Caslon Display"'),
    ]));
  } catch { /* The logo and secondary labels can use system fallbacks. */ }
}

function loadFont(id: string): Promise<string[]> {
  const font = registeredFont(id);
  if (!font) return Promise.resolve(["monospace"]);
  const cached = loads.get(id);
  if (cached) return cached;
  const loading = (async () => {
    try {
      // A unique family keeps selectable faces independent of settings CSS.
      const family = `PVR Metadata ${font.id}`;
      const face = new FontFace(family, `url(${JSON.stringify(font.source)})`);
      await withFontTimeout(face.load());
      document.fonts.add(face);
      return [family, "monospace"];
    } catch {
      // A missing, corrupt or removed file must never stop the broadcast.
      return ["monospace"];
    }
  })();
  loads.set(id, loading);
  return loading;
}

export async function loadMetadataFonts(preferences: VisualPreferences): Promise<MetadataFonts> {
  const families = await Promise.all(METADATA_FIELDS.map((field) => loadFont(preferences[`${field}Font`])));
  return Object.fromEntries(METADATA_FIELDS.map((field, index) => [field, families[index]])) as MetadataFonts;
}
