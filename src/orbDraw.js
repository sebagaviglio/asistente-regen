// src/orbDraw.js
//
// Dibujo de la esfera de voz (sin React, para poder probarlo): halo salvia, tres
// anillos deformados con ondas sinusoidales y un círculo lino con la «R» al centro.

// Espacio de dibujo fijo (como en la demo); el canvas se escala al ancho real.
export const ORB_W = 720;
export const ORB_H = 540;
export const RINGS = [
  [150, 'rgba(94,114,88,.9)', 2.6],
  [128, 'rgba(120,143,118,.7)', 2],
  [106, 'rgba(185,200,174,.9)', 1.6],
];

// Dibuja un cuadro. t = tiempo en segundos, A = amplitud 0..1.
export function drawOrb(ctx, t, A) {
  const cx = ORB_W / 2;
  const cy = ORB_H / 2;
  ctx.clearRect(0, 0, ORB_W, ORB_H);

  const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, 230);
  g.addColorStop(0, 'rgba(185,200,174,.55)');
  g.addColorStop(0.5, 'rgba(120,143,118,.18)');
  g.addColorStop(1, 'rgba(120,143,118,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, 230, 0, Math.PI * 2);
  ctx.fill();

  RINGS.forEach(([r, color, w], k) => {
    ctx.beginPath();
    for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.04) {
      const n =
        Math.sin(a * 3 + t * (1.4 + k * 0.4)) * 0.5 +
        Math.sin(a * 5 - t * (2 + k * 0.3)) * 0.35 +
        Math.sin(a * 2 + t * 0.7 + k);
      const rr = r + n * (6 + A * 34) + A * 12;
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr;
      if (a) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = color;
    ctx.lineWidth = w * 2;
    ctx.stroke();
  });

  ctx.fillStyle = 'rgba(244,239,229,.9)';
  ctx.beginPath();
  ctx.arc(cx, cy, 64 + A * 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#5E7258';
  ctx.font = '400 34px "Bodoni Moda", Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('R', cx, cy + 2);
}
