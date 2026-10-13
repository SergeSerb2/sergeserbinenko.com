/** Pure math for the ambient particle field. No DOM access; unit-tested. */

export function particleCount(width: number, height: number): number {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return 0;
  return Math.min(70, Math.round(width * height * 0.000035));
}

export function cappedDpr(dpr: number): number {
  if (!Number.isFinite(dpr) || dpr <= 0) return 1;
  return Math.min(dpr, 1.5);
}

/** Depth in px for a particle: motes 4–14, bokeh 14–24. `r` is a [0, 1) roll. */
export function depthFor(bokeh: boolean, r: number): number {
  const roll = Math.min(Math.max(r, 0), 1);
  return bokeh ? 14 + roll * 10 : 4 + roll * 10;
}

/** Sideways sway offset in px at time `t` (seconds). */
export function swayX(t: number, amplitude: number, periodSec: number, phase: number): number {
  if (!(periodSec > 0)) return 0;
  return Math.sin(phase + (t * 2 * Math.PI) / periodSec) * amplitude;
}

/** Twinkle multiplier in [0.35, 1] at time `t` (seconds). */
export function twinkle(t: number, periodSec: number, phase: number): number {
  if (!(periodSec > 0)) return 1;
  return 0.675 + 0.325 * Math.sin(phase + (t * 2 * Math.PI) / periodSec);
}

/** Parallax offset in px for a unit pointer value and a particle depth. */
export function parallaxOffset(unit: number, depth: number): number {
  const u = Math.min(Math.max(unit, -1), 1);
  return -u * depth;
}

/** Wrap a coordinate into [0, max), tolerating negative values. */
export function wrap(value: number, max: number): number {
  if (!(max > 0)) return 0;
  return ((value % max) + max) % max;
}

/** Mix white toward an rgb accent by `amount` (0.25 = 25% accent). */
export function tintToward(r: number, g: number, b: number, amount: number): [number, number, number] {
  const a = Math.min(Math.max(amount, 0), 1);
  const mix = (c: number) => Math.round(255 * (1 - a) + c * a);
  return [mix(r), mix(g), mix(b)];
}

/* ---------- Canvas field (DOM) ---------- */
import { getParallax } from "./motion.ts";

interface Particle {
  x: number;
  y: number;
  radius: number;
  alpha: number;
  speed: number;
  swayAmp: number;
  swayPeriod: number;
  phase: number;
  twinklePeriod: number;
  depth: number;
  bokeh: boolean;
}

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let particles: Particle[] = [];
let width = 0;
let height = 0;
let dpr = 1;
let raf = 0;
let running = false;
let lastTime = 0;
let tint: [number, number, number] = [255, 255, 255];
let bokehSprite: HTMLCanvasElement | null = null;
let resizeTimer = 0;

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function makeParticles(): void {
  const count = particleCount(width, height);
  particles = new Array<Particle>(count);
  for (let i = 0; i < count; i += 1) {
    const bokeh = i >= count * 0.8;
    particles[i] = {
      x: Math.random() * width,
      y: Math.random() * height,
      radius: bokeh ? 6 + Math.random() * 12 : 0.6 + Math.random() * 1.2,
      alpha: bokeh ? 0.05 + Math.random() * 0.07 : 0.25 + Math.random() * 0.35,
      speed: 4 + Math.random() * 10,
      swayAmp: 6 + Math.random() * 14,
      swayPeriod: 6 + Math.random() * 8,
      phase: Math.random() * Math.PI * 2,
      twinklePeriod: 3 + Math.random() * 5,
      depth: depthFor(bokeh, Math.random()),
      bokeh,
    };
  }
}

function makeSprite(): void {
  const size = 64;
  bokehSprite = document.createElement("canvas");
  bokehSprite.width = size;
  bokehSprite.height = size;
  const g = bokehSprite.getContext("2d");
  if (!g) return;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, `rgba(${tint[0]},${tint[1]},${tint[2]},1)`);
  grad.addColorStop(0.55, `rgba(${tint[0]},${tint[1]},${tint[2]},0.45)`);
  grad.addColorStop(1, `rgba(${tint[0]},${tint[1]},${tint[2]},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
}

export function refreshAmbientTint(): void {
  const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
  if (accent) {
    const probe = document.createElement("canvas");
    probe.width = 1;
    probe.height = 1;
    const pctx = probe.getContext("2d", { willReadFrequently: true });
    if (pctx) {
      pctx.fillStyle = accent;
      pctx.fillRect(0, 0, 1, 1);
      const [r, g, b] = pctx.getImageData(0, 0, 1, 1).data;
      tint = tintToward(r, g, b, 0.25);
    }
  }
  makeSprite();
  if (reducedMotion()) drawFrame(0, 0);
}

function resize(): void {
  if (!canvas) return;
  width = window.innerWidth;
  height = window.innerHeight;
  dpr = cappedDpr(window.devicePixelRatio || 1);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  makeParticles();
  if (reducedMotion()) drawFrame(0, 0);
}

function drawFrame(tSec: number, dt: number): void {
  if (!ctx || !canvas) return;
  const par = getParallax();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = `rgb(${tint[0]},${tint[1]},${tint[2]})`;
  for (let i = 0; i < particles.length; i += 1) {
    const p = particles[i];
    if (dt > 0) p.y = wrap(p.y - p.speed * dt + p.radius, height + p.radius * 2) - p.radius;
    const x = p.x + swayX(tSec, p.swayAmp, p.swayPeriod, p.phase) + parallaxOffset(par.x, p.depth);
    const y = p.y + parallaxOffset(par.y, p.depth);
    ctx.globalAlpha = p.alpha * twinkle(tSec, p.twinklePeriod, p.phase);
    if (p.bokeh && bokehSprite) {
      const d = p.radius * 2;
      ctx.drawImage(bokehSprite, x - p.radius, y - p.radius, d, d);
    } else {
      ctx.beginPath();
      ctx.arc(x, y, p.radius, 0, 6.283185307179586);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function loop(now: number): void {
  if (!running) return;
  const tSec = now / 1000;
  const dt = lastTime ? Math.min((now - lastTime) / 1000, 0.1) : 0;
  lastTime = now;
  drawFrame(tSec, dt);
  raf = requestAnimationFrame(loop);
}

function start(): void {
  if (running || reducedMotion() || document.hidden) return;
  running = true;
  lastTime = 0;
  raf = requestAnimationFrame(loop);
}

function stop(): void {
  running = false;
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
}

export function initAmbient(el: HTMLCanvasElement | null): void {
  if (!el || canvas === el) {
    if (el) start();
    return;
  }
  stop();
  canvas = el;
  ctx = el.getContext("2d");
  refreshAmbientTint();
  resize();
  if (reducedMotion()) {
    drawFrame(0, 0);
  } else {
    start();
  }
  window.addEventListener(
    "resize",
    () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(resize, 150);
    },
    { passive: true },
  );
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else start();
  });
}
