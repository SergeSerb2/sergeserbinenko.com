import { parseMode, resolveDaylight, resolveTone, sceneFor } from "./daylight.ts";
import type { Mode } from "./daylight.ts";

const html = document.documentElement;
let mode: Mode = parseMode(html.dataset.scenery);
let daylight = resolveDaylight(mode, new Date().getHours());
let token = 0;
let current: HTMLElement | null = null;

const sections = Array.from(document.querySelectorAll<HTMLElement>("[data-scene]")).filter(
  (el) => el instanceof HTMLElement && (el.tagName === "SECTION" || el.classList.contains("page")),
);

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

function imgFor(sceneId: string): HTMLImageElement | null {
  return document.querySelector<HTMLImageElement>(`img.scenery__img[data-scene="${CSS.escape(sceneId)}"]`);
}

function ensureLoading(img: HTMLImageElement): void {
  if (mode === "off") return;
  if (img.getAttribute("srcset")) return;
  const srcset = img.dataset.srcset;
  const src = img.dataset.src;
  if (!srcset && !src) return;
  img.sizes = "100vw";
  if (srcset) img.srcset = srcset;
  if (src) img.src = src;
}

function resolvedId(section: HTMLElement): string {
  const dayId = section.dataset.scene ?? "";
  const dayImg = imgFor(dayId);
  const nightId = dayImg?.dataset.night || undefined;
  return sceneFor(dayId, daylight, nightId);
}

function preloadNext(section: HTMLElement): void {
  if (mode === "off") return;
  const idx = sections.indexOf(section);
  const next = sections[idx + 1];
  if (!next) return;
  const img = imgFor(resolvedId(next));
  if (img) ensureLoading(img);
}

async function activate(section: HTMLElement): Promise<void> {
  current = section;
  const myToken = ++token;
  const id = resolvedId(section);
  if (!id) return;
  const img = imgFor(id);
  if (!img) return;

  const alreadyActive = img.classList.contains("is-active") && img.getAttribute("srcset");
  if (mode !== "off" && !alreadyActive) {
    ensureLoading(img);
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, 2500));
    const decoded = img.decode ? img.decode().catch(() => {}) : Promise.resolve();
    await Promise.race([decoded, timeout]);
    if (myToken !== token) return;
  }

  document.querySelectorAll<HTMLImageElement>("img.scenery__img.is-active").forEach((el) => {
    if (el !== img) el.classList.remove("is-active");
  });
  img.classList.add("is-active");

  document.querySelectorAll<HTMLElement>(".place[data-scene]").forEach((place) => {
    const active = place.dataset.scene === id;
    place.classList.toggle("is-active", active);
    if (active) place.removeAttribute("inert");
    else place.setAttribute("inert", "");
  });

  if (img.dataset.accent) html.style.setProperty("--accent", img.dataset.accent);
  const sceneryEl = document.querySelector<HTMLElement>(".scenery");
  if (sceneryEl && img.dataset.color) sceneryEl.style.setProperty("--wash", img.dataset.color);
  html.dataset.scene = id;

  const stop = section.dataset.stop;
  if (stop) {
    document.querySelectorAll<HTMLElement>(".route__stop[data-stop]").forEach((el) => {
      if (el.dataset.stop === stop) el.setAttribute("aria-current", "location");
      else el.removeAttribute("aria-current");
    });
  }

  preloadNext(section);
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
  applyDatasets();
  syncModeUI();
  if (focusEl) focusEl.focus();
  if (current) void activate(current);
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

applyDatasets();
initModeSwitch();

// Auto follows the clock, so an open tab must cross 06:00 and 19:00 on its own.
setInterval(() => {
  const next = resolveDaylight(mode, new Date().getHours());
  if (next === daylight) return;
  daylight = next;
  applyDatasets();
  if (current) void activate(current);
}, 60_000);

try {
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => applyDatasets());
} catch {
  // Older browsers: tone stays as set on load.
}

if (sections.length) {
  const first = sections[0];
  void activate(first);

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) void activate(entry.target as HTMLElement);
        }
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 },
    );
    sections.forEach((s) => observer.observe(s));
  }
}
