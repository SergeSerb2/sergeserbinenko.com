/** Pure helpers for the backdrop scene. No DOM access; unit-tested. */

/** WCAG relative luminance of a `#rrggbb` color. */
export function relativeLuminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/** Dark scenes get more opaque glass so ink text keeps its contrast. */
export function isDarkColor(hex: string): boolean {
  return relativeLuminance(hex) < 0.12;
}

/**
 * Glass custom-property values for a scene color: the darker the place, the more opaque
 * the glass, so small gray labels keep their contrast over it.
 */
export function glassForColor(hex: string): { glass: string; side: string } {
  const l = relativeLuminance(hex);
  if (l < 0.12) return { glass: ".76", side: ".32" };
  if (l < 0.35) return { glass: ".64", side: ".28" };
  return { glass: ".56", side: ".26" };
}

const BACKDROP_BUCKETS = [1200, 1600, 2400, 3200];

/**
 * Width bucket for the Unsplash backdrop URL, from the viewport width and
 * device pixel ratio (capped at 2). Falls back to 2400 for bad input.
 */
export function backdropWidth(viewportWidth: number, dpr: number): number {
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) return 2400;
  const ratio = Number.isFinite(dpr) && dpr > 0 ? Math.min(dpr, 2) : 1;
  const need = Math.ceil(viewportWidth * ratio);
  return BACKDROP_BUCKETS.find((b) => b >= need) ?? 3200;
}
