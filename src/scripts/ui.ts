import { site } from "../data/site.ts";
import { formatTimeInZone } from "./time.ts";

function initClock(): void {
  const els = document.querySelectorAll<HTMLElement>("[data-clock]");
  const placeEls = document.querySelectorAll<HTMLElement>("[data-tz]");
  if (!els.length && !placeEls.length) return;
  let timer: number | undefined;

  function tick(): void {
    const now = new Date();
    const text = `${formatTimeInZone(now, site.timeZone)} here`;
    els.forEach((el) => {
      el.textContent = text;
      el.setAttribute("datetime", now.toISOString());
    });
    placeEls.forEach((el) => {
      const tz = el.dataset.tz;
      if (!tz) return;
      try {
        el.textContent = ` · ${formatTimeInZone(now, tz)} there`;
      } catch {
        el.textContent = "";
      }
    });
  }

  function start(): void {
    tick();
    stop();
    timer = window.setInterval(tick, 30_000);
  }
  function stop(): void {
    if (timer !== undefined) window.clearInterval(timer);
    timer = undefined;
  }

  start();
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else start();
  });
}

function initToday(): void {
  const els = document.querySelectorAll<HTMLElement>("[data-today]");
  if (!els.length) return;
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: site.timeZone,
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const text = fmt.format(new Date()).replace(/,/g, "").toUpperCase();
  // Normalize "OCT 12 2026" or "12 OCT 2026" variants to "12 OCT 2026".
  const parts = text.split(/\s+/);
  let out = text;
  if (parts.length === 3 && /^\D+$/.test(parts[0])) out = `${parts[1]} ${parts[0]} ${parts[2]}`;
  els.forEach((el) => {
    el.textContent = out;
  });
}

function initCopy(): void {
  document.querySelectorAll<HTMLButtonElement>("[data-copy]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const value = btn.dataset.copy ?? "";
      if (!value) return;
      const original = btn.textContent;
      const restore = () => {
        window.setTimeout(() => {
          btn.textContent = original;
        }, 2000);
      };
      if (navigator.clipboard?.writeText) {
        navigator.clipboard
          .writeText(value)
          .then(() => {
            btn.textContent = "Copied";
            restore();
          })
          .catch(() => {
            location.href = `mailto:${value}`;
          });
      } else {
        location.href = `mailto:${value}`;
      }
    });
  });
}

function initPrint(): void {
  document.querySelectorAll<HTMLElement>("[data-print]").forEach((el) => {
    el.addEventListener("click", () => window.print());
  });
}

initClock();
initToday();
initCopy();
initPrint();
