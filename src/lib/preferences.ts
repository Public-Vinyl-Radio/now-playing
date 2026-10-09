export type ColorProfile = "warm" | "green" | "amber" | "mono";

export interface VisualPreferences {
  curvature: number;
  scanlines: number;
  bloom: number;
  noise: number;
  aberration: number;
  glitches: number;
  colorProfile: ColorProfile;
  renderScale: number;
  fps: number;
  motion: boolean;
}

export const STORAGE_KEY = "pvr.analog.preferences.v1";
export const DEFAULT_PREFERENCES: VisualPreferences = {
  curvature: 0.18,
  scanlines: 0.25,
  bloom: 0.3,
  noise: 0.13,
  aberration: 0.22,
  glitches: 0.08,
  colorProfile: "warm",
  renderScale: 0.85,
  fps: 30,
  motion: true,
};

export const PARAMETER_RANGES = {
  curvature: [0, 0.5],
  scanlines: [0, 0.7],
  bloom: [0, 0.8],
  noise: [0, 0.5],
  aberration: [0, 1],
  glitches: [0, 1],
  renderScale: [0.5, 1],
  fps: [15, 60],
} as const;

export function sanitizePreferences(input: unknown): VisualPreferences {
  const result = { ...DEFAULT_PREFERENCES };
  if (!input || typeof input !== "object" || Array.isArray(input)) return result;
  const value = input as Record<string, unknown>;
  for (const key of Object.keys(PARAMETER_RANGES) as (keyof typeof PARAMETER_RANGES)[]) {
    const candidate = value[key];
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      const [min, max] = PARAMETER_RANGES[key];
      result[key] = Math.max(min, Math.min(max, candidate));
    }
  }
  if (["warm", "green", "amber", "mono"].includes(String(value.colorProfile))) {
    result.colorProfile = value.colorProfile as ColorProfile;
  }
  if (typeof value.motion === "boolean") result.motion = value.motion;
  return result;
}

export function renderResolution(width: number, height: number, dpr: number, scale: number) {
  // Limit full-size targets to ~2.4 megapixels even on a Retina screen.
  return Math.min(Math.min(dpr, 2) * scale, Math.sqrt(2_400_000 / Math.max(1, width * height)));
}
