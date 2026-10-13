export type Mode = "auto" | "day" | "night" | "off";
export type Daylight = "day" | "night";
export type Tone = "light" | "dark";

export function parseMode(v: unknown): Mode {
  if (v === "auto" || v === "day" || v === "night" || v === "off") return v;
  return "auto";
}

export function resolveDaylight(mode: Mode, hour: number): Daylight {
  if (mode === "night") return "night";
  if (mode === "day") return "day";
  return hour >= 19 || hour < 6 ? "night" : "day";
}

export function resolveTone(mode: Mode, daylight: Daylight, prefersDark: boolean): Tone {
  if (mode !== "off" && daylight === "night") return "dark";
  if (prefersDark) return "dark";
  return "light";
}

export function sceneFor(dayId: string, daylight: Daylight, nightId?: string): string {
  if (daylight === "night" && nightId) return nightId;
  return dayId;
}

export type Variant = "day" | "night";

export function variantFor(daylight: Daylight, hasNight: boolean): Variant {
  return daylight === "night" && hasNight ? "night" : "day";
}
