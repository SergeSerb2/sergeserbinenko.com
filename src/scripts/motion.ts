/**
 * Motion state for Scenery OS: JS sets classes and CSS variables here;
 * all animation itself lives in the stylesheet. Pure helpers are at the
 * top (unit-tested, no DOM); DOM effects bind once and re-scan swapped
 * markup on every page load.
 */

/* ---------- Pure helpers ---------- */
export function lerp(current: number, target: number, factor: number): number {
  return current + (target - current) * factor;
}

export function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(-1, value));
}

/** Pointer position in [-1, 1] relative to the viewport center. */
export function pointerUnit(clientX: number, clientY: number, w: number, h: number): { x: number; y: number } {
  return {
    x: w > 0 ? clampUnit((clientX / w) * 2 - 1) : 0,
    y: h > 0 ? clampUnit((clientY / h) * 2 - 1) : 0,
  };
}

type Rect = { left: number; top: number; width: number; height: number };

/**
 * Pointer position inside an element, in the element's own CSS pixels.
 * `rect` is the on-screen box; `width` and `height` are the layout size
 * (offsetWidth/offsetHeight). The window is zoomed on big screens, so the
 * two differ, and offsets written back into CSS must be divided by the ratio.
 */
export function localPoint(clientX: number, clientY: number, rect: Rect, width = rect.width, height = rect.height): { x: number; y: number } {
  const sx = rect.width > 0 && width > 0 ? rect.width / width : 1;
  const sy = rect.height > 0 && height > 0 ? rect.height / height : 1;
  return { x: (clientX - rect.left) / sx, y: (clientY - rect.top) / sy };
}

/** Glare position as pixel strings clamped to the element's box, e.g. "37px". */
export function glareOffset(clientX: number, clientY: number, rect: Rect, width = rect.width, height = rect.height): { gx: string; gy: string } {
  const { x, y } = localPoint(clientX, clientY, rect, width, height);
  const px = Math.min(Math.max(0, width), Math.max(0, x));
  const py = Math.min(Math.max(0, height), Math.max(0, y));
  return { gx: `${Math.round(px)}px`, gy: `${Math.round(py)}px` };
}

/** Split plain text into word tokens, keeping whitespace as its own tokens. */
export function wordTokens(text: string): Array<{ word: boolean; text: string }> {
  return text
    .split(/(\s+)/)
    .filter((part) => part.length > 0)
    .map((part) => ({ word: !/^\s+$/.test(part), text: part }));
}

/* ---------- Shared state ---------- */
const $ = (s: string) => document.querySelector<HTMLElement>(s);
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = () => window.matchMedia("(pointer: fine)").matches;

/* ---------- Boot gate ---------- */
let booted = false;
let bootScheduled = false;
function applyBoot(): void {
  document.documentElement.dataset.booted = "";
}
function scheduleBoot(): void {
  if (booted) {
    applyBoot();
    return;
  }
  if (bootScheduled) return;
  bootScheduled = true;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      booted = true;
      bootScheduled = false;
      applyBoot();
    });
  });
}

/* ---------- Stagger + split headings ---------- */
let enteringTimer = 0;
function applyStagger(): void {
  const inner = $(".view-inner");
  if (!inner) return;
  const first = inner.firstElementChild;
  if (first) {
    Array.from(first.children).forEach((child, i) => {
      (child as HTMLElement).style.setProperty("--i", String(i));
    });
  }
  document.querySelectorAll<HTMLElement>(".cards").forEach((grid) => {
    grid.querySelectorAll<HTMLElement>(".card").forEach((card, i) => {
      card.style.setProperty("--i", String(i));
    });
  });
  inner.classList.add("is-entering");
  window.clearTimeout(enteringTimer);
  enteringTimer = window.setTimeout(() => inner.classList.remove("is-entering"), 1400);
}

function splitHeading(): void {
  const h1 = document.querySelector<HTMLElement>(".view-inner h1.hello, .view-inner h1.title");
  if (!h1 || h1.querySelector(".w")) return;
  let index = 0;
  Array.from(h1.childNodes).forEach((node) => {
    if (node.nodeType !== Node.TEXT_NODE) return;
    const frag = document.createDocumentFragment();
    wordTokens(node.textContent || "").forEach((token) => {
      if (!token.word) {
        frag.append(document.createTextNode(token.text));
      } else {
        const span = document.createElement("span");
        span.className = "w";
        span.style.setProperty("--i", String(index));
        index += 1;
        span.textContent = token.text;
        frag.append(span);
      }
    });
    node.replaceWith(frag);
  });
}

/* ---------- Sliding sidebar plates ---------- */
function rowYWithinNav(row: HTMLElement, nav: HTMLElement): number {
  let y = 0;
  let el: HTMLElement | null = row;
  while (el && el !== nav) {
    y += el.offsetTop;
    el = el.offsetParent as HTMLElement | null;
  }
  if (el === nav) return y;
  const rowRect = row.getBoundingClientRect();
  const navRect = nav.getBoundingClientRect();
  return Math.round(rowRect.top - navRect.top + nav.scrollTop - nav.clientTop);
}

function positionPlate(plate: HTMLElement | null, row: HTMLElement | null, nav: HTMLElement | null): void {
  if (!plate || !nav) return;
  if (!row || row.hidden || row.offsetHeight === 0) {
    plate.classList.remove("is-visible");
    return;
  }
  const wasVisible = plate.classList.contains("is-visible");
  plate.style.setProperty("--y", `${rowYWithinNav(row, nav)}px`);
  plate.style.setProperty("--h", `${row.offsetHeight}px`);
  if (!wasVisible) {
    plate.classList.add("is-instant");
    plate.classList.add("is-visible");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => plate.classList.remove("is-instant"));
    });
  } else {
    plate.classList.add("is-visible");
  }
}

export function updateActivePlate(): void {
  const nav = $("#nav");
  const plate = nav?.querySelector<HTMLElement>(".nav-plate--active") ?? null;
  const row = nav?.querySelector<HTMLElement>('.row[aria-current="page"]') ?? null;
  positionPlate(plate, row, nav);
}

function updateHoverPlate(row: HTMLElement | null): void {
  const nav = $("#nav");
  const plate = nav?.querySelector<HTMLElement>(".nav-plate--hover") ?? null;
  positionPlate(plate, row, nav);
}

function ensurePlates(): void {
  const nav = $("#nav");
  if (!nav || nav.querySelector(".nav-plate")) return;
  const hover = document.createElement("span");
  hover.className = "nav-plate nav-plate--hover";
  hover.setAttribute("aria-hidden", "true");
  const active = document.createElement("span");
  active.className = "nav-plate nav-plate--active";
  active.setAttribute("aria-hidden", "true");
  nav.prepend(hover, active);
}

/* ---------- Parallax + window sheen (one lerped rAF loop) ---------- */
const parallax = { x: 0, y: 0 };
const parallaxTarget = { x: 0, y: 0 };
const sheen = { x: 0, y: 0 };
const sheenTarget = { x: 0, y: 0 };
let sheenLit = false;
let lastClient = { x: -1, y: -1 };
let pointerLoopRunning = false;

export function getParallax(): { x: number; y: number } {
  return parallax;
}

function pointerFrame(): void {
  const backdrop = $(".backdrop");
  parallax.x = lerp(parallax.x, parallaxTarget.x, 0.06);
  parallax.y = lerp(parallax.y, parallaxTarget.y, 0.06);
  if (backdrop) {
    backdrop.style.setProperty("--px", parallax.x.toFixed(4));
    backdrop.style.setProperty("--py", parallax.y.toFixed(4));
  }
  const win = $(".window");
  if (win && sheenLit && lastClient.x >= 0) {
    const target = localPoint(lastClient.x, lastClient.y, win.getBoundingClientRect(), win.offsetWidth, win.offsetHeight);
    sheenTarget.x = target.x;
    sheenTarget.y = target.y;
    sheen.x = lerp(sheen.x, sheenTarget.x, 0.18);
    sheen.y = lerp(sheen.y, sheenTarget.y, 0.18);
    win.style.setProperty("--mx", `${sheen.x.toFixed(1)}px`);
    win.style.setProperty("--my", `${sheen.y.toFixed(1)}px`);
  }
  const settled =
    Math.abs(parallax.x - parallaxTarget.x) < 0.001 &&
    Math.abs(parallax.y - parallaxTarget.y) < 0.001 &&
    Math.abs(sheen.x - sheenTarget.x) < 0.1 &&
    Math.abs(sheen.y - sheenTarget.y) < 0.1;
  if (!settled && !document.hidden) {
    requestAnimationFrame(pointerFrame);
  } else {
    pointerLoopRunning = false;
  }
}

function ensurePointerLoop(): void {
  if (pointerLoopRunning || document.hidden) return;
  pointerLoopRunning = true;
  requestAnimationFrame(pointerFrame);
}

/* ---------- Scene reveal origin ---------- */
let navOrigin: { x: number; y: number } | null = null;
let revealTimer = 0;
export function noteNavOrigin(x: number, y: number): void {
  if (x === 0 && y === 0) return;
  navOrigin = { x, y };
}
export function applyRevealOrigin(layer: HTMLElement): void {
  const origin = navOrigin ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  navOrigin = null;
  layer.style.setProperty("--ox", `${Math.round(origin.x)}px`);
  layer.style.setProperty("--oy", `${Math.round(origin.y)}px`);
  if (reducedMotion()) return;
  layer.classList.add("is-revealing");
  window.clearTimeout(revealTimer);
  revealTimer = window.setTimeout(() => layer.classList.remove("is-revealing"), 1400);
}

/* ---------- Glare ---------- */
let glarePending: { el: HTMLElement; x: number; y: number } | null = null;
let glareRaf = 0;
function flushGlare(): void {
  glareRaf = 0;
  if (!glarePending || document.hidden) return;
  const { el, x, y } = glarePending;
  glarePending = null;
  const { gx, gy } = glareOffset(x, y, el.getBoundingClientRect(), el.offsetWidth, el.offsetHeight);
  // The first position on entry is instant. Later ones ease (CSS), so the
  // glare trails the pointer slightly and catches up when it stops.
  if (el.classList.contains("is-hover")) el.classList.add("is-tracking");
  el.style.setProperty("--gx", gx);
  el.style.setProperty("--gy", gy);
  el.classList.add("is-hover");
}

/* ---------- Composer typewriter ---------- */
const ABOUT_PROMPTS = [
  "Ask me anything about my work",
  "What are you building?",
  "How does the scenery in T3 Pretty work?",
  "Want to work on something together?",
  "What are you working on right now?",
];
const CONTACT_PROMPTS = [
  "Write a note, it opens in your mail app",
  "Say hi in English, Russian, or French",
  "Tell me what you are building",
];
let typewriterCleanup: (() => void) | null = null;

/** Stop the rotating placeholder and leave the current text alone (chat mode pins its own). */
export function stopTypewriter(): void {
  typewriterCleanup?.();
  typewriterCleanup = null;
}

/** (Re)start the rotating placeholder on the current page's composer. */
export function initTypewriter(): void {
  stopTypewriter();
  const area = document.querySelector<HTMLTextAreaElement>("[data-ask]");
  if (!area) return;
  const prompts = document.documentElement.dataset.thread === "contact" ? CONTACT_PROMPTS : ABOUT_PROMPTS;
  const fallbackText = prompts[0];
  if (reducedMotion()) {
    area.placeholder = fallbackText;
    return;
  }
  let timer = 0;
  let stopped = false;
  let promptIndex = 0;
  let charCount = 0;

  const schedule = (fn: () => void, ms: number) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(fn, ms);
  };
  const canRun = () => !stopped && area.value === "" && document.activeElement !== area;
  const typeStep = () => {
    if (stopped) return;
    if (!canRun()) return;
    if (document.hidden) {
      schedule(typeStep, 500);
      return;
    }
    const text = prompts[promptIndex];
    charCount += 1;
    area.placeholder = text.slice(0, charCount);
    if (charCount >= text.length) schedule(deleteStep, 2200);
    else schedule(typeStep, 38);
  };
  const deleteStep = () => {
    if (stopped) return;
    if (!canRun()) return;
    if (document.hidden) {
      schedule(deleteStep, 500);
      return;
    }
    charCount -= 1;
    area.placeholder = prompts[promptIndex].slice(0, Math.max(charCount, 0));
    if (charCount <= 0) {
      promptIndex = (promptIndex + 1) % prompts.length;
      schedule(typeStep, 400);
    } else {
      schedule(deleteStep, 18);
    }
  };
  const stopAndRestore = () => {
    window.clearTimeout(timer);
    area.placeholder = fallbackText;
  };
  const onFocus = () => stopAndRestore();
  const onInput = () => {
    if (area.value !== "") stopAndRestore();
  };
  const onBlur = () => {
    if (stopped || area.value !== "") return;
    promptIndex = 0;
    charCount = 0;
    schedule(typeStep, 1500);
  };
  area.addEventListener("focus", onFocus);
  area.addEventListener("input", onInput);
  area.addEventListener("blur", onBlur);
  typewriterCleanup = () => {
    stopped = true;
    window.clearTimeout(timer);
    area.removeEventListener("focus", onFocus);
    area.removeEventListener("input", onInput);
    area.removeEventListener("blur", onBlur);
  };
  if (canRun()) {
    charCount = 0;
    area.placeholder = "";
    schedule(typeStep, 400);
  }
}

/* ---------- Wiring ---------- */
export function onMotionPageLoad(): void {
  scheduleBoot();
  ensurePlates();
  applyStagger();
  splitHeading();
  updateActivePlate();
  initTypewriter();
}

let motionInit = false;
export function initMotion(): void {
  if (motionInit) return;
  motionInit = true;
  ensurePlates();

  document.addEventListener("astro:after-swap", () => {
    if (booted) applyBoot();
    // Swapped markup keeps the parallax target; drop any stale sheen.
    sheenLit = false;
  });

  const nav = $("#nav");
  if (nav) {
    nav.addEventListener(
      "pointerover",
      (e) => {
        const row = (e.target as HTMLElement).closest<HTMLElement>(".row");
        if (row && nav.contains(row)) updateHoverPlate(row);
      },
      { passive: true },
    );
    nav.addEventListener("pointerleave", () => updateHoverPlate(null));
    nav.addEventListener("focusin", (e) => {
      const row = (e.target as HTMLElement).closest<HTMLElement>(".row");
      if (row) updateHoverPlate(row);
    });
    nav.addEventListener("focusout", (e) => {
      if (!nav.contains(e.relatedTarget as Node)) updateHoverPlate(null);
    });
  }

  document.addEventListener(
    "pointermove",
    (e) => {
      if (document.hidden) return;
      const target = e.target as HTMLElement;
      // Parallax follows the pointer anywhere (fine pointers only here).
      if (finePointer() && !reducedMotion()) {
        const unit = pointerUnit(e.clientX, e.clientY, window.innerWidth, window.innerHeight);
        parallaxTarget.x = unit.x;
        parallaxTarget.y = unit.y;
        ensurePointerLoop();
      }
      // Window sheen.
      const win = $(".window");
      if (win) {
        const overWindow = target.closest(".window") === win;
        if (overWindow && finePointer() && !reducedMotion()) {
          lastClient = { x: e.clientX, y: e.clientY };
          if (!sheenLit) {
            sheenLit = true;
            const start = localPoint(e.clientX, e.clientY, win.getBoundingClientRect(), win.offsetWidth, win.offsetHeight);
            sheen.x = start.x;
            sheen.y = start.y;
            win.classList.add("is-lit");
          }
          ensurePointerLoop();
        } else if (!overWindow && sheenLit) {
          sheenLit = false;
          win.classList.remove("is-lit");
        }
      }
      // Glare (delegated, rAF-throttled).
      if (finePointer() && !reducedMotion()) {
        const el = target.closest<HTMLElement>("[data-glare], .card");
        if (el) {
          glarePending = { el, x: e.clientX, y: e.clientY };
          if (!glareRaf) glareRaf = requestAnimationFrame(flushGlare);
        }
      }
    },
    { passive: true },
  );

  document.addEventListener(
    "pointerout",
    (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>("[data-glare], .card");
      if (el && !el.contains(e.relatedTarget as Node)) el.classList.remove("is-hover", "is-tracking");
      const win = $(".window");
      if (win && e.target === win && !win.contains(e.relatedTarget as Node)) {
        sheenLit = false;
        win.classList.remove("is-lit");
      }
    },
    { passive: true },
  );

  window.addEventListener("resize", () => updateActivePlate(), { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) ensurePointerLoop();
  });

  // Phone tilt: only where the platform needs no permission prompt.
  const doe = window.DeviceOrientationEvent as unknown as { requestPermission?: unknown } | undefined;
  if (!finePointer() && typeof window.DeviceOrientationEvent !== "undefined" && typeof doe?.requestPermission !== "function") {
    window.addEventListener(
      "deviceorientation",
      (e) => {
        if (reducedMotion() || document.hidden || e.gamma === null) return;
        parallaxTarget.x = clampUnit((e.gamma || 0) / 30);
        parallaxTarget.y = clampUnit(((e.beta || 45) - 45) / 30);
        ensurePointerLoop();
      },
      { passive: true },
    );
  }
}
