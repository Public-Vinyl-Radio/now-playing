export interface TextMeasurement { width: number; height: number; }

/** Pause at the beginning and end, then repeat at a constant reading speed. */
export function marqueeOffset(elapsed: number, distance: number, speed: number) {
  if (distance <= 0 || speed <= 0) return 0;
  const pause = 3;
  const travel = distance / speed;
  const phase = Math.max(0, elapsed) % (pause * 2 + travel);
  return Math.min(distance, Math.max(0, phase - pause) * speed);
}

/** Wrap first, then reduce the font to a readable floor before adding an ellipsis. */
export function fitMetadata(
  value: string,
  size: number,
  minimumSize: number,
  width: number,
  height: number,
  measure: (value: string, size: number) => TextMeasurement,
) {
  if (!value) return { value: "", size, height: 0 };
  const fits = (text: string, fontSize: number) => {
    const bounds = measure(text, fontSize);
    return bounds.width <= width && bounds.height <= height;
  };
  while (size > minimumSize && !fits(value, size)) size = Math.max(minimumSize, size - 1);
  if (fits(value, size)) return { value, size, height: measure(value, size).height };

  const characters = Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value), ({ segment }) => segment);
  let low = 0;
  let high = characters.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const candidate = characters.slice(0, middle).join("").trimEnd() + "…";
    if (fits(candidate, size)) low = middle;
    else high = middle - 1;
  }
  const clipped = characters.slice(0, low).join("").trimEnd() + "…";
  // Extremely small viewports may not have room for even one line.
  return fits(clipped, size)
    ? { value: clipped, size, height: measure(clipped, size).height }
    : { value: "", size, height: 0 };
}
