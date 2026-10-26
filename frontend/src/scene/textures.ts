import * as THREE from "three";
import type { WallEntry } from "../api";

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** The mosaic emblem: tree of life with white flowers, a flaming heart, "MEXICO" and the motto. */
function drawEmblem(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  // ribbon with motto
  ctx.fillStyle = "#3f5a4c";
  ctx.fillRect(x - 20, y - 70, w + 40, 60);
  ctx.fillStyle = "#e9efe9";
  ctx.font = "bold 30px Georgia, serif";
  ctx.textAlign = "center";
  ctx.fillText("AMOR·SCIENTIA·QVE·INSERVIANT·CORDI", x + w / 2, y - 30, w + 20);
  // mosaic background with speckles
  ctx.fillStyle = "#cf6a45";
  ctx.fillRect(x - 10, y - 10, w + 20, h + 20);
  ctx.fillStyle = "#8fb3a6";
  ctx.fillRect(x, y, w, h);
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = ["#9cc0b3", "#7fa597", "#b5d3c8", "#86ab9e"][i % 4];
    ctx.fillRect(x + Math.random() * w, y + Math.random() * h, 5, 5);
  }
  const cx = x + w / 2;
  // trunk & branches
  ctx.strokeStyle = "#2f2a26";
  ctx.lineWidth = 16;
  ctx.beginPath();
  ctx.moveTo(cx, y + h * 0.9);
  ctx.lineTo(cx, y + h * 0.28);
  ctx.stroke();
  ctx.lineWidth = 9;
  for (const [dx, dy] of [[-0.3, 0.35], [0.3, 0.35], [-0.32, 0.55], [0.32, 0.55]]) {
    ctx.beginPath();
    ctx.moveTo(cx, y + h * (dy + 0.12));
    ctx.quadraticCurveTo(cx + w * dx * 0.5, y + h * dy, cx + w * dx, y + h * (dy - 0.1));
    ctx.stroke();
  }
  // leaves
  ctx.fillStyle = "#2f6b3a";
  for (const [dx, dy] of [[-0.22, 0.42], [0.22, 0.42], [-0.18, 0.62], [0.18, 0.62], [-0.1, 0.5], [0.1, 0.5], [-0.12, 0.3], [0.12, 0.3]]) {
    ctx.beginPath();
    ctx.ellipse(cx + w * dx, y + h * dy, 24, 12, dx > 0 ? -0.5 : 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // white flowers
  for (const dx of [-0.32, 0.32]) {
    ctx.fillStyle = "#f6f6f2";
    ctx.beginPath();
    ctx.arc(cx + w * dx, y + h * 0.22, 30, 0, Math.PI * 2);
    ctx.fill();
  }
  // flaming heart
  ctx.fillStyle = "#c3262f";
  ctx.beginPath();
  ctx.moveTo(cx, y + h * 0.3);
  ctx.bezierCurveTo(cx - 60, y + h * 0.2, cx - 40, y + h * 0.08, cx, y + h * 0.14);
  ctx.bezierCurveTo(cx + 40, y + h * 0.08, cx + 60, y + h * 0.2, cx, y + h * 0.3);
  ctx.fill();
  ctx.fillStyle = "#f1b234";
  ctx.beginPath();
  ctx.moveTo(cx - 22, y + h * 0.12);
  ctx.quadraticCurveTo(cx, y + h * 0.0, cx + 22, y + h * 0.12);
  ctx.fill();
  // MEXICO
  ctx.fillStyle = "#c5432e";
  ctx.font = "bold 64px Georgia, serif";
  ctx.fillText("MEX", cx - 85, y + h * 0.85);
  ctx.fillText("ICO", cx + 85, y + h * 0.85);
}

export function stoneSignTexture() {
  return canvasTexture(2048, 1024, (ctx) => {
    ctx.fillStyle = "#a9afb2";
    ctx.fillRect(0, 0, 2048, 1024);
    // stone panels & cracks
    ctx.strokeStyle = "#8d9497";
    ctx.lineWidth = 4;
    for (let x = 0; x <= 2048; x += 410) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 1024); ctx.stroke(); }
    for (const yy of [340, 690]) { ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(2048, yy); ctx.stroke(); }
    ctx.strokeStyle = "rgba(90,96,100,0.45)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 18; i++) {
      ctx.beginPath();
      let px = Math.random() * 2048, py = Math.random() * 1024;
      ctx.moveTo(px, py);
      for (let k = 0; k < 6; k++) { px += (Math.random() - 0.5) * 80; py += Math.random() * 50; ctx.lineTo(px, py); }
      ctx.stroke();
    }
    drawEmblem(ctx, 260, 170, 360, 420);
    ctx.fillStyle = "#f3f3ef";
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 6;
    ctx.textAlign = "right";
    ctx.font = "84px 'Trajan Pro', Georgia, serif";
    ctx.fillText("INSTITUTO  NACIONAL  DE", 1990, 230);
    ctx.font = "210px 'Trajan Pro', Georgia, serif";
    ctx.fillText("CARDIOLOGIA", 1990, 520);
    ctx.font = "90px 'Trajan Pro', Georgia, serif";
    ctx.fillText("IGNACIO  CHAVEZ", 1990, 860);
  });
}

export function entranceSignTexture() {
  return canvasTexture(2048, 256, (ctx) => {
    ctx.fillStyle = "#d9d9d3";
    ctx.fillRect(0, 0, 2048, 256);
    ctx.fillStyle = "#4a4a48";
    ctx.textAlign = "center";
    ctx.font = "34px Georgia, serif";
    ctx.fillText("CIENCIA PARA LA SALUD", 1024, 52);
    ctx.font = "bold 104px Georgia, serif";
    ctx.fillText("INSTITUTO NACIONAL DE CARDIOLOGÍA", 1024, 160, 1960);
    ctx.font = "44px Georgia, serif";
    ctx.fillText("IGNACIO CHÁVEZ", 1024, 225);
  });
}

export function foundationBannerTexture() {
  return canvasTexture(2048, 160, (ctx) => {
    ctx.fillStyle = "#1f4f8f";
    ctx.fillRect(0, 0, 2048, 160);
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 96px Georgia, serif";
    ctx.fillText("💙  Fundación Mexicana del Corazón  💙", 1024, 84, 1960);
  });
}

export function plaqueTexture() {
  return canvasTexture(1024, 512, (ctx) => {
    ctx.fillStyle = "#1f4f8f";
    ctx.fillRect(0, 0, 1024, 512);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 10;
    ctx.strokeRect(20, 20, 984, 472);
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.font = "44px Georgia, serif";
    ctx.fillText("Se inaugura el", 512, 130);
    ctx.font = "bold 62px Georgia, serif";
    ctx.fillText("Instituto Nacional", 512, 220);
    ctx.fillText("de Cardiología", 512, 295);
    ctx.font = "50px Georgia, serif";
    ctx.fillText("18 DE ABRIL DE 1944", 512, 400);
  });
}

export function helipadTexture() {
  return canvasTexture(512, 512, (ctx) => {
    ctx.fillStyle = "#c8432f";
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 22;
    ctx.beginPath();
    ctx.arc(256, 256, 200, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 260px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("H", 256, 270);
  });
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

interface WallItem { text: string; weight: number; anonymous: boolean; logo: HTMLImageElement | null }

/** Gratitude wall. Every donation gets a place: items are laid out in centered
 *  rows (largest first) and the whole wall shrinks until everyone fits. */
export async function wallTexture(entries: WallEntry[], title: string, empty: string, anonLabel: string) {
  const W = 2048, H = 1024, TOP = 190, BOTTOM = 990, MAX_W = 1900;
  const logos = await Promise.all(entries.map((e) => (e.logo ? loadImage(e.logo) : Promise.resolve(null))));
  const max = Math.max(1, ...entries.map((e) => e.weight));
  const items: WallItem[] = entries.map((e, i) => ({
    text: e.anonymous ? anonLabel : e.name,
    weight: e.anonymous ? 0.42 : 0.55 + 0.45 * Math.sqrt(e.weight / max),
    anonymous: e.anonymous,
    logo: logos[i],
  }));

  return canvasTexture(W, H, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(1, "#e6effa");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "#1f4f8f";
    ctx.lineWidth = 14;
    ctx.strokeRect(14, 14, W - 28, H - 28);
    ctx.fillStyle = "#1f4f8f";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.font = "bold 92px Georgia, serif";
    ctx.fillText(`💙 ${title} 💙`, W / 2, 130);
    if (!items.length) {
      ctx.fillStyle = "#5a7bab";
      ctx.font = "italic 64px Georgia, serif";
      ctx.fillText(empty, W / 2, 560);
      return;
    }

    const font = (it: WallItem, px: number) =>
      `${it.anonymous ? "italic" : "bold"} ${px}px Georgia, serif`;
    // Measure one item at a given scale: optional logo + text.
    const measure = (it: WallItem, scale: number) => {
      const px = Math.max(8, it.weight * scale);
      ctx.font = font(it, px);
      // Companies with a logo show only the logo; words are for people.
      const textW = it.logo ? 0 : Math.min(ctx.measureText(it.text).width, MAX_W);
      const logoH = it.logo ? px * 1.9 : 0;
      const logoW = it.logo ? Math.min(logoH * (it.logo.width / it.logo.height), logoH * 3.2) : 0;
      const w = logoW + textW;
      return { px, w: Math.min(w, MAX_W), h: Math.max(px, logoH), logoW, logoH, textW };
    };
    const layout = (scale: number) => {
      const gap = scale * 0.5;
      const rows: { items: { it: WallItem; m: ReturnType<typeof measure> }[]; w: number; h: number }[] = [];
      let row: (typeof rows)[number] = { items: [], w: 0, h: 0 };
      for (const it of items) {
        const m = measure(it, scale);
        if (row.items.length && row.w + gap + m.w > MAX_W) {
          rows.push(row);
          row = { items: [], w: 0, h: 0 };
        }
        row.w += (row.items.length ? gap : 0) + m.w;
        row.h = Math.max(row.h, m.h);
        row.items.push({ it, m });
      }
      rows.push(row);
      const lineGap = scale * 0.28;
      const total = rows.reduce((a, r) => a + r.h, 0) + lineGap * (rows.length - 1);
      return { rows, total, gap, lineGap };
    };
    // Largest scale (font size for the biggest donor) at which everyone fits.
    let lo = 6, hi = 230;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (layout(mid).total <= BOTTOM - TOP) lo = mid; else hi = mid;
    }
    const { rows, total, gap, lineGap } = layout(lo);
    let y = TOP + (BOTTOM - TOP - total) / 2;
    for (const r of rows) {
      let x = W / 2 - r.w / 2;
      const mid = y + r.h / 2;
      for (const { it, m } of r.items) {
        if (it.logo) {
          ctx.drawImage(it.logo, x, mid - m.logoH / 2, m.logoW, m.logoH);
        } else {
          ctx.font = font(it, m.px);
          ctx.fillStyle = it.anonymous ? "#7d97c2" : "#163d73";
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillText(it.text, x, mid, m.textW);
        }
        x += m.w + gap;
      }
      y += r.h + lineGap;
    }
  });
}
