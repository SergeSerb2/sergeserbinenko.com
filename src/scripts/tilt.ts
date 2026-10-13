const canTilt =
  matchMedia("(hover: hover) and (pointer: fine)").matches &&
  !matchMedia("(prefers-reduced-motion: reduce)").matches;

if (canTilt) {
  document.querySelectorAll<HTMLElement>("[data-tilt]").forEach((el) => {
    let raf = 0;
    let lastX = 0;
    let lastY = 0;

    function frame(): void {
      raf = 0;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const px = Math.min(1, Math.max(0, (lastX - rect.left) / rect.width));
      const py = Math.min(1, Math.max(0, (lastY - rect.top) / rect.height));
      const rx = (0.5 - py) * 10;
      const ry = (px - 0.5) * 12;
      el.style.setProperty("--rx", `${rx.toFixed(2)}deg`);
      el.style.setProperty("--ry", `${ry.toFixed(2)}deg`);
      el.style.setProperty("--mx", `${Math.round(px * 100)}%`);
      el.style.setProperty("--my", `${Math.round(py * 100)}%`);
    }

    el.addEventListener("pointermove", (event) => {
      el.classList.add("is-tilting");
      lastX = event.clientX;
      lastY = event.clientY;
      if (!raf) raf = requestAnimationFrame(frame);
    });
    el.addEventListener("pointerenter", () => el.classList.add("is-tilting"));
    el.addEventListener("pointerleave", () => {
      el.classList.remove("is-tilting");
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      el.style.setProperty("--rx", "0deg");
      el.style.setProperty("--ry", "0deg");
      el.style.setProperty("--mx", "50%");
      el.style.setProperty("--my", "50%");
    });
  });
}
