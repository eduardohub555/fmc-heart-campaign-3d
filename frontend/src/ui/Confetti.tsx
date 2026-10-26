import { useEffect, useRef } from "react";

const COLORS = ["#1f5fbf", "#5aa0ff", "#ffffff", "#e63946", "#ffd166", "#8ecae6"];

/** Full-screen confetti burst (no dependencies). Plays once, then removes itself. */
export function Confetti({ onDone, duration = 3800 }: { onDone: () => void; duration?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext("2d")!;
    const resize = () => { c.width = window.innerWidth; c.height = window.innerHeight; };
    resize();
    const pieces = Array.from({ length: 260 }, () => ({
      x: c.width / 2 + (Math.random() - 0.5) * c.width * 0.3,
      y: c.height * 0.55,
      vx: (Math.random() - 0.5) * 18,
      vy: -10 - Math.random() * 14,
      w: 6 + Math.random() * 8,
      h: 8 + Math.random() * 10,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.4,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    }));
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = now - start;
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.globalAlpha = t > duration - 800 ? Math.max(0, (duration - t) / 800) : 1;
      for (const p of pieces) {
        p.vy += 0.38;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.strokeStyle = "rgba(31,79,143,0.25)";
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.strokeRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (t < duration) frame = requestAnimationFrame(tick);
      else onDone();
    };
    frame = requestAnimationFrame(tick);
    window.addEventListener("resize", resize);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("resize", resize); };
  }, [duration, onDone]);
  return <canvas ref={ref} className="confetti" />;
}
