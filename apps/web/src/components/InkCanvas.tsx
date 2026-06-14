"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ScrollSmoother } from "gsap/ScrollSmoother";
import { initGL, createProgram } from "./ink/gl-utils";
import { createPingPong } from "./ink/ping-pong";
import { createMouseHandler } from "./ink/mouse-handler";
import { vertexShader, splatFragShader, displayInkFragShader } from "./ink/shaders";

type Mode = "gl" | "fallback" | "none";

const MOBILE_BREAKPOINT = 768;
// Internal resolution scale — render at half the CSS pixel density to spare the GPU.
const RESOLUTION_SCALE = 0.5;
// Hard cap on FBO dimensions — a full-page canvas can be very tall; clamp so the
// ping-pong buffers stay small (GPU stretches the soft ink edges imperceptibly).
const MAX_BUFFER_DIM = 2048;
// Scroll-driven ink fade: full strength at the top, easing toward this floor as
// the reader scrolls past roughly FADE_SCROLL_SPAN viewport heights.
const INK_FADE_FLOOR = 0.5;
const FADE_SCROLL_SPAN = 2;

const CANVAS_STYLE: CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  mixBlendMode: "multiply",
  pointerEvents: "none",
};

// Static rice-paper texture shown when WebGL is skipped (mobile / no context).
// Faint dark mottling, multiplied onto the warm paper background.
const PAPER_STYLE: CSSProperties = {
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
  mixBlendMode: "multiply",
  backgroundImage: [
    "radial-gradient(circle at 18% 28%, rgba(0,0,0,0.025), transparent 55%)",
    "radial-gradient(circle at 82% 72%, rgba(0,0,0,0.02), transparent 50%)",
    "linear-gradient(135deg, rgba(0,0,0,0.015), rgba(0,0,0,0) 60%)",
  ].join(","),
};

function decideMode(): Mode {
  if (typeof window === "undefined") return "fallback";
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return "none";
  if (window.innerWidth < MOBILE_BREAKPOINT) return "fallback";
  return "gl";
}

/**
 * Phase 2 ink layer: a WebGL2 overlay that turns pointer motion into ink
 * strokes. Pointer speed drives the brush — fast moves paint thin, light lines;
 * slow moves paint thick, dark ones. Ink accumulates in a ping-pong buffer and
 * persists (decay arrives in a later phase).
 *
 * Graceful degradation is unchanged from Phase 1: reduced-motion → nothing;
 * mobile or no WebGL → a static paper texture; otherwise a visibility-gated
 * render loop. Mounted client-only (InkCanvasDynamic), positioned by a
 * `position: relative` parent (HeroZone).
 */
export function InkCanvas({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const [mode, setMode] = useState<Mode>(decideMode);

  useEffect(() => {
    if (mode !== "gl") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = initGL(canvas);
    if (!gl) {
      setMode("fallback");
      return;
    }
    glRef.current = gl;

    try {
      // --- programs ---
      const splatProgram = createProgram(gl, vertexShader, splatFragShader);
      const displayProgram = createProgram(gl, vertexShader, displayInkFragShader);

      const uInput = gl.getUniformLocation(splatProgram, "uInput");
      const uPoint = gl.getUniformLocation(splatProgram, "uPoint");
      const uDirection = gl.getUniformLocation(splatProgram, "uDirection");
      const uRadius = gl.getUniformLocation(splatProgram, "uRadius");
      const uIntensity = gl.getUniformLocation(splatProgram, "uIntensity");
      const uAspect = gl.getUniformLocation(splatProgram, "uAspect");
      const uInk = gl.getUniformLocation(displayProgram, "uInk");

      // --- full-screen quad, one VAO per program (sharing the buffer) ---
      const positionBuffer = gl.createBuffer();
      if (!positionBuffer) throw new Error("Failed to create position buffer");
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
        gl.STATIC_DRAW,
      );

      const makeVao = (program: WebGLProgram): WebGLVertexArrayObject => {
        const loc = gl.getAttribLocation(program, "aPosition");
        const vao = gl.createVertexArray();
        if (!vao) throw new Error("Failed to create VAO");
        gl.bindVertexArray(vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        gl.bindVertexArray(null);
        return vao;
      };
      const splatVao = makeVao(splatProgram);
      const displayVao = makeVao(displayProgram);

      // --- ink concentration ping-pong target ---
      const dpr = window.devicePixelRatio || 1;
      const initW = Math.min(MAX_BUFFER_DIM, Math.max(1, Math.floor(canvas.clientWidth * dpr * RESOLUTION_SCALE)));
      const initH = Math.min(MAX_BUFFER_DIM, Math.max(1, Math.floor(canvas.clientHeight * dpr * RESOLUTION_SCALE)));
      canvas.width = initW;
      canvas.height = initH;
      const pingPong = createPingPong(gl, initW, initH);

      const clearTargets = (): void => {
        for (const fbo of [pingPong.read, pingPong.write]) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.framebuffer);
          gl.clearColor(0, 0, 0, 1);
          gl.clear(gl.COLOR_BUFFER_BIT);
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      };
      clearTargets();

      const resize = (): void => {
        const ratio = window.devicePixelRatio || 1;
        const width = Math.min(MAX_BUFFER_DIM, Math.max(1, Math.floor(canvas.clientWidth * ratio * RESOLUTION_SCALE)));
        const height = Math.min(MAX_BUFFER_DIM, Math.max(1, Math.floor(canvas.clientHeight * ratio * RESOLUTION_SCALE)));
        if (canvas.width === width && canvas.height === height) return;
        canvas.width = width;
        canvas.height = height;
        pingPong.resize(width, height);
        clearTargets();
      };

      // --- pointer-driven brush ---
      const mouse = createMouseHandler(canvas);

      const draw = (): void => {
        const aspect = canvas.width / canvas.height;

        // Scroll-driven opacity — read the smoothed scroll position from the
        // ScrollSmoother singleton, not window.scrollY (meaningless once the
        // content is transform-scrolled). No smoother → treat as top.
        const scrollTop = ScrollSmoother.get()?.scrollTop() ?? 0;
        const progress = Math.min(1, scrollTop / (window.innerHeight * FADE_SCROLL_SPAN));
        canvas.style.opacity = String(1 - (1 - INK_FADE_FLOOR) * progress);

        // 1. Drain queued splats along the pointer path into the ink buffer.
        if (mouse.queue.length > 0) {
          gl.disable(gl.BLEND);
          gl.useProgram(splatProgram);
          gl.bindVertexArray(splatVao);
          for (const s of mouse.queue) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, pingPong.write.framebuffer);
            gl.viewport(0, 0, canvas.width, canvas.height);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, pingPong.read.texture);
            gl.uniform1i(uInput, 0);
            gl.uniform2f(uPoint, s.position[0], s.position[1]);
            gl.uniform2f(uDirection, s.direction[0], s.direction[1]);
            gl.uniform1f(uRadius, s.radius);
            gl.uniform1f(uIntensity, s.intensity);
            gl.uniform1f(uAspect, aspect);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            pingPong.swap();
          }
          gl.bindVertexArray(null);
          mouse.queue.length = 0;
        }

        // 2. Composite accumulated ink to the screen.
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.useProgram(displayProgram);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, pingPong.read.texture);
        gl.uniform1i(uInk, 0);
        gl.bindVertexArray(displayVao);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.bindVertexArray(null);
      };

      // --- visibility-gated render loop ---
      let onScreen = true;
      let pageVisible = document.visibilityState === "visible";

      const loop = (): void => {
        draw();
        rafRef.current = requestAnimationFrame(loop);
      };
      const start = (): void => {
        if (rafRef.current === null && onScreen && pageVisible) {
          rafRef.current = requestAnimationFrame(loop);
        }
      };
      const stop = (): void => {
        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
      };
      const sync = (): void => {
        if (onScreen && pageVisible) start();
        else stop();
      };

      const io = new IntersectionObserver((entries) => {
        onScreen = entries[0]?.isIntersecting ?? false;
        sync();
      });
      io.observe(canvas);

      const ro = new ResizeObserver(() => resize());
      ro.observe(canvas);

      const onVisibility = (): void => {
        pageVisible = document.visibilityState === "visible";
        sync();
      };
      document.addEventListener("visibilitychange", onVisibility);

      start();

      return () => {
        stop();
        io.disconnect();
        ro.disconnect();
        document.removeEventListener("visibilitychange", onVisibility);
        mouse.dispose();
        pingPong.dispose();
        gl.deleteBuffer(positionBuffer);
        gl.deleteVertexArray(splatVao);
        gl.deleteVertexArray(displayVao);
        gl.deleteProgram(splatProgram);
        gl.deleteProgram(displayProgram);
        glRef.current = null;
      };
    } catch {
      // Any setup failure (compile/link/FBO) → fall back to the static texture.
      glRef.current = null;
      setMode("fallback");
      return;
    }
  }, [mode]);

  if (mode === "none") return null;
  if (mode === "fallback") {
    return <div aria-hidden className={className} style={PAPER_STYLE} />;
  }
  return <canvas ref={canvasRef} aria-hidden className={className} style={CANVAS_STYLE} />;
}
