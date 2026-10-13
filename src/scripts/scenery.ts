import { parseMode, resolveDaylight, resolveTone, variantFor } from "./daylight.ts";
import type { Daylight, Mode, Variant } from "./daylight.ts";

const html = document.documentElement;
let mode: Mode = parseMode(html.dataset.scenery);
let daylight: Daylight = resolveDaylight(mode, new Date().getHours());
let activeIndex = 0;
const near = new Set<number>();

const scrubbed =
  CSS.supports("animation-timeline: view()") &&
  !matchMedia("(prefers-reduced-motion: reduce)").matches;
if (!scrubbed) html.classList.add("no-scrub");

const stops = Array.from(
  document.querySelectorAll<HTMLElement>("section.stop[data-stop-index], .page[data-stop-index]"),
).sort((a, b) => Number(a.dataset.stopIndex ?? 0) - Number(b.dataset.stopIndex ?? 0));

const sceneEls = new Map<number, HTMLElement>();
document.querySelectorAll<HTMLElement>(".scene[data-stop-index]").forEach((el) => {
  sceneEls.set(Number(el.dataset.stopIndex), el);
});
const placeEls = new Map<number, HTMLElement>();
document.querySelectorAll<HTMLElement>(".place[data-stop-index]").forEach((el) => {
  placeEls.set(Number(el.dataset.stopIndex), el);
});

function prefersDark(): boolean {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
}

function applyDatasets(): void {
  html.dataset.scenery = mode;
  html.dataset.daylight = daylight;
  html.dataset.tone = resolveTone(mode, daylight, prefersDark());
}

function setInert(el: HTMLElement, inert: boolean): void {
  if (inert) el.setAttribute("inert", "");
  else el.removeAttribute("inert");
  try {
    (el as HTMLElement & { inert?: boolean }).inert = inert;
  } catch {
    // Attribute alone is enough where the property is missing.
  }
}

function hasNight(index: number): boolean {
  const scene = sceneEls.get(index);
  if (scene) return scene.hasAttribute("data-has-night");
  const place = placeEls.get(index);
  return Boolean(place?.querySelector('.place__variant[data-variant="night"]'));
}

function resolvedVariant(index: number): Variant {
  return variantFor(daylight, hasNight(index));
}

function imgFor(index: number, variant: Variant): HTMLImageElement | null {
  const scene = sceneEls.get(index);
  if (!scene) return null;
  return scene.querySelector<HTMLImageElement>(`.scene__img[data-variant="${variant}"]`);
}

function watchLoaded(img: HTMLImageElement): void {
  if (img.classList.contains("is-loaded")) return;
  const mark = () => img.classList.add("is-loaded");
  if (img.getAttribute("src") && img.complete) {
    // A cached image can complete before JS runs; an error also completes.
    if (img.naturalWidth > 0) mark();
    return;
  }
  img.addEventListener("load", mark, { once: true });
}

function ensureLoading(img: HTMLImageElement): void {
  if (mode === "off") return;
  watchLoaded(img);
  if (img.getAttribute("srcset") || img.getAttribute("src")) {
    if (img.complete && img.naturalWidth > 0) img.classList.add("is-loaded");
    return;
  }
  const srcset = img.dataset.srcset;
  const src = img.dataset.src;
  if (!srcset && !src) return;
  img.sizes = "100vw";
  if (srcset) img.srcset = srcset;
  if (src) img.src = src;
  if (img.complete && img.naturalWidth > 0) img.classList.add("is-loaded");
}

function loadStop(index: number): void {
  if (mode === "off") return;
  const img = imgFor(index, resolvedVariant(index));
  if (img) ensureLoading(img);
}

function accentFor(index: number): string | undefined {
  const scene = sceneEls.get(index);
  if (!scene) return undefined;
  if (resolvedVariant(index) === "night") {
    const nightImg = imgFor(index, "night");
    return nightImg?.dataset.accent ?? scene.dataset.accent;
  }
  return scene.dataset.accent;
}

function syncPlaces(): void {
  placeEls.forEach((place, index) => {
    const isActivePlace = index === activeIndex;
    place.classList.toggle("is-active", isActivePlace);
    setInert(place, !isActivePlace);
    const want = resolvedVariant(index);
    place.querySelectorAll<HTMLElement>(".place__variant[data-variant]").forEach((v) => {
      setInert(v, !(isActivePlace && v.dataset.variant === want));
    });
  });
}

function syncScenesAndAccent(): void {
  sceneEls.forEach((scene, index) => {
    scene.classList.toggle("is-active", index === activeIndex);
  });
  const accent = accentFor(activeIndex);
  if (accent) html.style.setProperty("--accent", accent);
}

function syncRoute(): void {
  const stopEl = stops.find((s) => Number(s.dataset.stopIndex) === activeIndex);
  const stop = stopEl?.dataset.stop;
  if (!stop) return;
  document.querySelectorAll<HTMLElement>(".route__stop[data-stop]").forEach((el) => {
    if (el.dataset.stop === stop) el.setAttribute("aria-current", "location");
    else el.removeAttribute("aria-current");
  });
}

function setActive(index: number): void {
  activeIndex = index;
  syncScenesAndAccent();
  syncPlaces();
  syncRoute();
  loadStop(index);
}

function onDaylightChanged(): void {
  applyDatasets();
  near.forEach((index) => loadStop(index));
  loadStop(activeIndex);
  syncScenesAndAccent();
  syncPlaces();
}

function syncModeUI(): void {
  document.querySelectorAll<HTMLButtonElement>(".mode__opt[data-mode]").forEach((btn) => {
    const checked = btn.dataset.mode === mode;
    btn.setAttribute("aria-checked", checked ? "true" : "false");
    btn.tabIndex = checked ? 0 : -1;
  });
}

function setMode(next: Mode, focusEl?: HTMLElement): void {
  mode = next;
  try {
    localStorage.setItem("scenery", mode);
  } catch {
    // Private mode or blocked storage: keep the in-memory value.
  }
  daylight = resolveDaylight(mode, new Date().getHours());
  syncModeUI();
  if (focusEl) focusEl.focus();
  onDaylightChanged();
}

function initModeSwitch(): void {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>(".mode__opt[data-mode]"));
  if (!buttons.length) return;
  syncModeUI();
  buttons.forEach((btn, i) => {
    btn.addEventListener("click", () => setMode(parseMode(btn.dataset.mode)));
    btn.addEventListener("keydown", (event) => {
      const key = event.key;
      if (key === " " || key === "Enter") {
        event.preventDefault();
        setMode(parseMode(btn.dataset.mode));
        return;
      }
      let nextIndex: number | null = null;
      if (key === "ArrowRight" || key === "ArrowDown") nextIndex = (i + 1) % buttons.length;
      if (key === "ArrowLeft" || key === "ArrowUp") nextIndex = (i - 1 + buttons.length) % buttons.length;
      if (key === "Home") nextIndex = 0;
      if (key === "End") nextIndex = buttons.length - 1;
      if (nextIndex === null) return;
      event.preventDefault();
      const target = buttons[nextIndex];
      setMode(parseMode(target.dataset.mode), target);
    });
  });
}

// Pick up the first-paint state before observers run.
document.querySelectorAll<HTMLImageElement>(".scene__img").forEach((img) => watchLoaded(img));
const painted = document.querySelector<HTMLElement>(".scene.is-active[data-stop-index]");
if (painted) activeIndex = Number(painted.dataset.stopIndex ?? 0) || 0;

applyDatasets();
initModeSwitch();
syncScenesAndAccent();
syncPlaces();
syncRoute();
loadStop(activeIndex);
near.add(activeIndex);

// Auto follows the clock, so an open tab must cross 06:00 and 19:00 on its own.
setInterval(() => {
  const next = resolveDaylight(mode, new Date().getHours());
  if (next === daylight) return;
  daylight = next;
  onDaylightChanged();
}, 60_000);

try {
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => applyDatasets());
} catch {
  // Older browsers: tone stays as set on load.
}

if (stops.length && "IntersectionObserver" in window) {
  const activeObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const index = Number((entry.target as HTMLElement).dataset.stopIndex ?? 0);
        if (index !== activeIndex) setActive(index);
      }
    },
    { rootMargin: "-45% 0px -45% 0px", threshold: 0 },
  );
  stops.forEach((s) => activeObserver.observe(s));

  const loadObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const index = Number((entry.target as HTMLElement).dataset.stopIndex ?? 0);
        if (entry.isIntersecting) {
          near.add(index);
          loadStop(index);
        } else {
          near.delete(index);
        }
      }
    },
    { rootMargin: "150% 0px 150% 0px", threshold: 0 },
  );
  stops.forEach((s) => loadObserver.observe(s));
}
