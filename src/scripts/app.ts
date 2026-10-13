/**
 * Scenery OS client behavior: scene crossfade on ClientRouter navigation,
 * sidebar search, keyboard shortcuts, peek mode, composer mailto, copy-link
 * toast, and the Vancouver clock. Bound once; per-page work runs on
 * `astro:page-load`, and everything that targets swapped-in markup uses
 * document-level delegation.
 */
import { scenes, photoSrc, photographerHref } from "../data/scenes.ts";
import type { SceneId } from "../data/scenes.ts";
import { site } from "../data/site.ts";
import { formatTimeInZone } from "./time.ts";
import { glassForColor, backdropWidth } from "./scene.ts";

declare global {
  interface Window {
    __sceneryOsInit?: boolean;
  }
}

const $ = (s: string) => document.querySelector<HTMLElement>(s);
const $$ = (s: string) => Array.from(document.querySelectorAll<HTMLElement>(s));
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function sceneUrl(id: SceneId): string {
  return photoSrc(scenes[id], backdropWidth(window.innerWidth, window.devicePixelRatio || 1));
}

/* ---------- Clock ---------- */
function tick(): void {
  const t = formatTimeInZone(new Date(), site.timeZone);
  $$(".clock").forEach((el) => {
    el.textContent = t;
  });
}

/* ---------- Scene crossfade ---------- */
let front: HTMLElement | null = null;
let back: HTMLElement | null = null;
let currentScene: string | null = null;
let sceneToken = 0;
const warmed = new Set<string>();

function warm(id: string): void {
  if (!id || warmed.has(id) || !(id in scenes)) return;
  warmed.add(id);
  const img = new Image();
  img.src = sceneUrl(id as SceneId);
}

function setScene(key: string, instant = false): void {
  if (key === currentScene || !(key in scenes) || !front || !back) return;
  currentScene = key;
  const s = scenes[key as SceneId];
  const token = ++sceneToken;
  const rootStyle = document.documentElement.style;
  rootStyle.setProperty("--accent", s.accent);
  const { glass, side } = glassForColor(s.color);
  rootStyle.setProperty("--glass", glass);
  rootStyle.setProperty("--side", side);
  const backdrop = $(".backdrop");
  if (backdrop) backdrop.style.background = s.color;

  const url = sceneUrl(key as SceneId);
  warmed.add(key);
  const pre = new Image();
  const swap = () => {
    if (token !== sceneToken || !front || !back) return;
    back.style.backgroundImage = `url('${url}')`;
    back.style.setProperty("--focal", s.focal);
    back.style.zIndex = "2";
    front.style.zIndex = "1";
    back.classList.add("is-on");
    const old = front;
    front = back;
    back = old;
    window.setTimeout(() => {
      if (token === sceneToken) old.classList.remove("is-on");
    }, instant ? 0 : 650);
    const cap = $("#caption");
    if (!cap) return;
    cap.classList.add("is-swapping");
    window.setTimeout(() => {
      const place = $("#capPlace");
      const who = document.querySelector<HTMLAnchorElement>("#capWho");
      if (place) place.textContent = s.place;
      if (who) {
        who.textContent = s.photographer;
        who.href = photographerHref(s);
      }
      cap.classList.remove("is-swapping");
    }, instant ? 0 : 240);
  };
  pre.onload = swap;
  pre.onerror = swap;
  pre.src = url;
}

/* ---------- Thread sync (runs on every page load) ---------- */
let firstSync = true;
function syncThread(): void {
  const thread = document.documentElement.dataset.thread || "about";
  const sceneKey = document.documentElement.dataset.scene || "tofino";

  if (!front || !back) {
    front = $(".scene.is-on") || $("#sceneA");
    back = front?.id === "sceneA" ? $("#sceneB") : $("#sceneA");
  }

  if (currentScene === null) {
    // First paint is already correct from the server; adopt its scene.
    currentScene = sceneKey;
    warmed.add(sceneKey);
  } else {
    setScene(sceneKey, reducedMotion());
  }

  $$(".row[data-thread][aria-current], .pill[data-thread][aria-current]").forEach((el) => el.removeAttribute("aria-current"));
  $$(`.row[data-thread="${CSS.escape(thread)}"], .pill[data-thread="${CSS.escape(thread)}"]`).forEach((el) => el.setAttribute("aria-current", "page"));

  if (document.body.classList.contains("peek")) togglePeek(false);

  const pill = document.querySelector<HTMLElement>(`.pill[data-thread="${CSS.escape(thread)}"]`);
  if (pill) {
    pill.scrollIntoView({
      inline: "center",
      block: "nearest",
      behavior: firstSync || reducedMotion() ? "auto" : "smooth",
    });
  }
  firstSync = false;
  tick();
}

/* ---------- Search ---------- */
function filter(q: string): void {
  const query = q.trim().toLowerCase();
  let shown = 0;
  $$("#nav .row").forEach((r) => {
    const hit = !query || (r.dataset.q || "").includes(query);
    r.hidden = !hit;
    if (hit) shown += 1;
  });
  $$("#nav .group").forEach((g) => {
    g.hidden = !g.querySelector(".row:not([hidden])");
  });
  const empty = $("#empty");
  if (empty) empty.hidden = shown > 0;
}

/* ---------- Peek ---------- */
function togglePeek(force?: boolean): void {
  const on = force ?? !document.body.classList.contains("peek");
  document.body.classList.toggle("peek", on);
  const win = $("#window");
  if (win) {
    if (on) win.setAttribute("inert", "");
    else win.removeAttribute("inert");
  }
}

/* ---------- Thread stepping ---------- */
function stepThread(delta: number): void {
  const rows = $$("#nav .row[data-thread]");
  if (rows.length === 0) return;
  const current = document.documentElement.dataset.thread || "about";
  const i = rows.findIndex((r) => r.dataset.thread === current);
  const next = i === -1 ? rows[0] : rows[(i + delta + rows.length) % rows.length];
  next?.click();
}

function init(): void {
  if (window.__sceneryOsInit) return;
  window.__sceneryOsInit = true;

  document.addEventListener("astro:page-load", syncThread);
  syncThread();
  window.setInterval(tick, 15000);

  const search = document.querySelector<HTMLInputElement>("#search");
  search?.addEventListener("input", (e) => filter((e.target as HTMLInputElement).value));
  search?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const first = document.querySelector<HTMLElement>("#nav .row:not([hidden])");
      if (first) {
        first.click();
        search.blur();
      }
    }
  });

  document.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    if (document.body.classList.contains("peek") && !target.closest(".caption-credit")) {
      togglePeek(false);
      return;
    }
    const actionEl = target.closest<HTMLElement>("[data-action]");
    const action = actionEl?.dataset.action;
    if (action === "peek") {
      e.stopPropagation();
      togglePeek(true);
      return;
    }
    if (action === "next") {
      e.stopPropagation();
      stepThread(1);
      return;
    }
    if (action === "copy") {
      void (async () => {
        try {
          await navigator.clipboard.writeText(location.href);
        } catch {
          /* clipboard unavailable; still show the toast like the mockup */
        }
        const toast = $("[data-toast]");
        if (toast) {
          toast.classList.add("show");
          window.setTimeout(() => toast.classList.remove("show"), 1400);
        }
      })();
      return;
    }
    if (target.closest("[data-print]")) {
      window.print();
    }
  });

  document.addEventListener("submit", (e) => {
    const form = (e.target as HTMLElement).closest<HTMLFormElement>("[data-composer]");
    if (!form) return;
    e.preventDefault();
    const q = form.querySelector<HTMLTextAreaElement>("[data-ask]")?.value.trim() || "";
    const subject = form.dataset.subject || "Hello";
    location.href = `mailto:${site.email}?subject=${encodeURIComponent(subject)}${q ? `&body=${encodeURIComponent(q)}` : ""}`;
  });

  document.addEventListener("keydown", (e) => {
    const target = e.target as HTMLElement;
    if (target.matches("[data-ask]") && e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      (target as HTMLTextAreaElement).form?.requestSubmit();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      const input = document.querySelector<HTMLInputElement>("#search");
      input?.focus();
      input?.select();
      return;
    }
    if (e.key === "Escape") {
      if (document.body.classList.contains("peek")) togglePeek(false);
      else if (document.activeElement instanceof HTMLElement && document.activeElement.id === "search") {
        const input = document.activeElement as unknown as HTMLInputElement;
        input.value = "";
        filter("");
        input.blur();
      }
      return;
    }
    const active = document.activeElement;
    const typing = active instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(active.tagName);
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "p" || e.key === "P") togglePeek();
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      stepThread(e.key === "ArrowDown" ? 1 : -1);
    }
  });

  // Preload a row's scene photo on hover so the crossfade is instant.
  document.addEventListener("pointerover", (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>("[data-thread][data-scene]");
    if (row?.dataset.scene) warm(row.dataset.scene);
  });

  // Warm the first few places on idle, like the mockup.
  const warmFirst = () => {
    const seen: string[] = [];
    $$("#nav .row[data-scene]").forEach((r) => {
      const s = r.dataset.scene || "";
      if (s && !seen.includes(s) && s !== currentScene) seen.push(s);
    });
    seen.slice(0, 5).forEach(warm);
  };
  if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(warmFirst);
  else window.setTimeout(warmFirst, 1200);
}

init();
