// Translates pointer motion over the ink canvas into a queue of splats. The
// canvas is `pointer-events: none`, so we listen on its parent (the HeroZone
// wrapper) and bubbled events reach us from the content on top.
//
// Each move is interpolated into evenly spaced splats along the path so fast
// strokes stay gap-free; the consumer (InkCanvas) drains the queue every frame.

export interface SplatPoint {
  /** Position in canvas UV space — x: 0→1 left→right, y: 0→1 bottom→top. */
  position: [number, number];
  /** Unit stroke direction in UV space; [0, 1] when stationary. */
  direction: [number, number];
  /** Splat radius — thinner when moving fast, fuller when slow. */
  radius: number;
  /** Ink concentration — lighter when fast, denser when slow. */
  intensity: number;
}

export interface MouseState {
  /** Splats emitted since the last frame; the consumer drains and clears this. */
  queue: SplatPoint[];
  dispose(): void;
}

// Speed (px/s) at which the stroke reaches its thinnest / lightest extreme.
const SPEED_CEILING = 2000;
const RADIUS_SLOW = 0.0015;
const RADIUS_FAST = 0.0004;
const INTENSITY_SLOW = 0.15;
const INTENSITY_FAST = 0.04;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

export function createMouseHandler(canvas: HTMLCanvasElement): MouseState {
  const target = canvas.parentElement;
  const queue: SplatPoint[] = [];

  let prevX = 0; // previous client px (for speed)
  let prevY = 0;
  let prevU = 0; // previous UV (for interpolation)
  let prevV = 0;
  let prevT = 0;
  let hasPrev = false;

  const state: MouseState = { queue, dispose: () => {} };

  const onMove = (e: PointerEvent): void => {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const u = (e.clientX - rect.left) / rect.width;
    const v = 1 - (e.clientY - rect.top) / rect.height; // flip Y → UV origin bottom-left
    if (u < 0 || u > 1 || v < 0 || v > 1) {
      // Outside the canvas: drop continuity so re-entry starts a fresh stroke.
      hasPrev = false;
      return;
    }

    const now = performance.now();
    const speed = hasPrev
      ? Math.hypot(e.clientX - prevX, e.clientY - prevY) / (Math.max(1, now - prevT) / 1000)
      : 0;
    const t = clamp01(speed / SPEED_CEILING);
    const radius = lerp(RADIUS_SLOW, RADIUS_FAST, t);
    const intensity = lerp(INTENSITY_SLOW, INTENSITY_FAST, t);

    const dist = Math.hypot(u - prevU, v - prevV);
    if (hasPrev && dist > 1e-6) {
      const direction: [number, number] = [(u - prevU) / dist, (v - prevV) / dist];
      const step = Math.max(radius * 2.0, 0.004);
      const count = Math.min(Math.floor(dist / step), 24);
      for (let i = 0; i <= count; i++) {
        const f = (i * step) / dist;
        queue.push({
          position: [lerp(prevU, u, f), lerp(prevV, v, f)],
          direction,
          radius,
          intensity,
        });
      }
    } else {
      // First sample or no motion: a single round splat pointing upward.
      queue.push({ position: [u, v], direction: [0, 1], radius, intensity });
    }

    prevX = e.clientX;
    prevY = e.clientY;
    prevU = u;
    prevV = v;
    prevT = now;
    hasPrev = true;
  };

  const onLeave = (): void => {
    hasPrev = false;
  };

  target?.addEventListener("pointermove", onMove);
  target?.addEventListener("pointerleave", onLeave);
  state.dispose = () => {
    target?.removeEventListener("pointermove", onMove);
    target?.removeEventListener("pointerleave", onLeave);
  };

  return state;
}
