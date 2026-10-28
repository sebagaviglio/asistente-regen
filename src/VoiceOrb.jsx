// src/VoiceOrb.jsx
//
// Esfera de voz dibujada en un canvas (reemplazó al VoiceBeam de voice-glow):
// halo salvia, tres anillos que se deforman con ondas y crecen con el volumen,
// y un círculo lino con la «R» de REGEN al centro.
//
// El volumen sale del audio real (ver audioLevel.js): `readLevel()` se llama una
// vez por cuadro y devuelve 0..1. Un solo requestAnimationFrame, que se detiene
// cuando la pestaña está oculta o la esfera sale de pantalla. Con
// prefers-reduced-motion la esfera queda casi quieta.
import { useEffect, useRef } from 'react';
import { ORB_W, ORB_H, drawOrb } from './orbDraw';

export default function VoiceOrb({ readLevel, active }) {
  const canvasRef = useRef(null);
  // La función de lectura y el estado "en vivo" cambian entre renders: los leemos
  // desde refs para no reiniciar el ciclo de animación.
  const readRef = useRef(readLevel);
  const activeRef = useRef(active);
  useEffect(() => {
    readRef.current = readLevel;
    activeRef.current = active;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext?.('2d');
    if (!canvas || !ctx) return undefined; // sin canvas (p. ej. en las pruebas) no hay nada que animar

    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let reduced = !!mq?.matches;
    const onMotionChange = (e) => {
      reduced = e.matches;
    };
    mq?.addEventListener?.('change', onMotionChange);

    let raf = 0;
    let last = 0;
    let t = 0;
    let A = 0;
    let onScreen = true;
    let scale = 1;

    // Canvas nítido en pantallas retina: el buffer usa devicePixelRatio.
    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssW = canvas.clientWidth || 360;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round((cssW * dpr * ORB_H) / ORB_W);
      scale = canvas.width / ORB_W;
    }

    const canRun = () => !document.hidden && onScreen;

    function frame(now) {
      raf = 0;
      if (!canRun()) return;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;

      let target = 0;
      if (activeRef.current) {
        try {
          target = Math.max(0, Math.min(1, readRef.current?.() || 0));
        } catch {
          target = 0;
        }
      }
      // Subida rápida, bajada lenta: acompaña la voz sin temblar.
      const rate = target > A ? 14 : 4;
      A += (target - A) * (1 - Math.exp(-rate * dt));

      t += dt * (reduced ? 0.05 : 1);
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      drawOrb(ctx, t, reduced ? A * 0.1 : A);
      raf = requestAnimationFrame(frame);
    }

    function start() {
      if (raf || !canRun()) return;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
    function stop() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }

    resize();
    // La «R» usa Bodoni Moda: pedimos la fuente y redibujamos cuando esté lista.
    document.fonts?.load?.('400 34px "Bodoni Moda"').then(() => {
      if (!raf && canvas.isConnected) {
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        drawOrb(ctx, t, A);
      }
    }).catch?.(() => {});

    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener('visibilitychange', onVisibility);

    let io;
    if (typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver(([entry]) => {
        onScreen = entry.isIntersecting;
        if (onScreen) start();
        else stop();
      });
      io.observe(canvas);
    }
    let ro;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => {
        resize();
        if (!raf) {
          ctx.setTransform(scale, 0, 0, scale, 0, 0);
          drawOrb(ctx, t, A);
        }
      });
      ro.observe(canvas);
    }

    start();
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
      mq?.removeEventListener?.('change', onMotionChange);
      io?.disconnect();
      ro?.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className="ra-orb" aria-hidden="true" />;
}
