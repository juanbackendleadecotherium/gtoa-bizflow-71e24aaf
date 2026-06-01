import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

type Props = {
  /** Velocidad de la animación (mayor = más rápido) */
  animationSpeed?: number;
  /** Lista de opacidades posibles por celda (se elige una aleatoria por dot) */
  opacities?: number[];
  /** Colores RGB de los dots */
  colors?: number[][];
  /** Clase para el contenedor */
  containerClassName?: string;
  /** Tamaño total de cada celda (px) */
  totalSize?: number;
  /** Tamaño del dot (px) */
  dotSize?: number;
  /** Si true, la onda se mueve de derecha a izquierda en lugar de izquierda a derecha */
  reverse?: boolean;
  /** Mostrar el gradiente radial superpuesto */
  showGradient?: boolean;
};

/**
 * Efecto de revelado tipo "dot matrix" inspirado en Aceternity.
 * Implementado en Canvas 2D para evitar dependencias de three.js / @react-three/fiber
 * (mucho más ligero y compatible con SSR sobre Cloudflare Workers).
 */
export const CanvasRevealEffect = ({
  animationSpeed = 4,
  opacities = [0.3, 0.3, 0.3, 0.5, 0.5, 0.5, 0.8, 0.8, 0.8, 1],
  colors = [[0, 255, 255]],
  containerClassName,
  totalSize = 4,
  dotSize = 2,
  reverse = false,
  showGradient = true,
}: Props) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current as HTMLCanvasElement | null;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let width = 0;
    let height = 0;
    let cols = 0;
    let rows = 0;
    // Cada celda guarda una opacidad base y un color
    let cells: { o: number; c: number[] }[] = [];
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const rand = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

    const cv = canvas;
    function build() {
      const rect = cv.getBoundingClientRect();
      width = Math.max(1, Math.floor(rect.width));
      height = Math.max(1, Math.floor(rect.height));
      cv.width = width * dpr;
      cv.height = height * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(width / totalSize);
      rows = Math.ceil(height / totalSize);
      cells = new Array(cols * rows).fill(0).map(() => ({
        o: rand(opacities),
        c: rand(colors),
      }));
    }

    build();
    const ro = new ResizeObserver(build);
    ro.observe(cv);

    const start = performance.now();

    function frame(now: number) {
      const elapsed = (now - start) / 1000; // segundos
      ctx!.clearRect(0, 0, width, height);

      // La onda barre el ancho. Posición normalizada [0..1] con wrap.
      // Cada columna se "enciende" cuando el frente la alcanza, y se atenúa después.
      const sweep = (elapsed * animationSpeed * 0.15) % 1.4; // 0..1.4 para dejar trailing
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const i = y * cols + x;
          const cell = cells[i];
          const nx = reverse ? 1 - x / cols : x / cols;
          // Distancia del frente
          const d = sweep - nx;
          let revealed: number;
          if (d < 0) {
            revealed = 0; // aún no llega la onda
          } else if (d < 0.05) {
            revealed = d / 0.05; // borde de entrada
          } else {
            revealed = Math.max(0, 1 - (d - 0.05) * 0.6); // cola decae lento
          }
          const alpha = cell.o * revealed;
          if (alpha < 0.01) continue;
          const [r, g, b] = cell.c;
          ctx!.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
          const px = x * totalSize + (totalSize - dotSize) / 2;
          const py = y * totalSize + (totalSize - dotSize) / 2;
          ctx!.fillRect(px, py, dotSize, dotSize);
        }
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [animationSpeed, opacities, colors, totalSize, dotSize, reverse]);

  return (
    <div className={cn("h-full relative w-full", containerClassName)}>
      <canvas ref={canvasRef} className="h-full w-full block" />
      {showGradient && (
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent pointer-events-none" />
      )}
    </div>
  );
};

export default CanvasRevealEffect;
