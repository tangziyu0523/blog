// GLSL ES 3.00 shader sources for the ink layer (WebGL2).
//
// Phase 1 keeps the fragment stage deliberately trivial — a flat translucent
// black fill — so we can validate the full pipeline (program, geometry, FBO,
// resize, visibility gating) before the fluid simulation lands in Phase 2.

// Full-screen quad. Positions arrive in clip space (-1..1); we forward a 0..1
// UV for the fragment stage to use later.
export const vertexShader = `#version 300 es
in vec2 aPosition;
out vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

// Gaussian splat: injects ink concentration at uPoint into the previous frame's
// texture. uAspect keeps the splat circular on non-square canvases.
export const splatFragShader = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uInput;
uniform vec2 uPoint;
uniform vec2 uDirection;
uniform float uRadius;
uniform float uIntensity;
uniform float uAspect;
out vec4 outColor;
void main() {
  vec2 d = vUv - uPoint;
  d.x *= uAspect;
  // Stretch the falloff along the stroke direction → an elongated ellipse.
  float along = dot(d, uDirection);
  float perp = length(d - along * uDirection);
  float ellipse = along * along * 0.4 + perp * perp;
  float splat = exp(-ellipse / uRadius);
  float prev = texture(uInput, vUv).r;
  // Cap concentration at 0.6 so text underneath stays readable.
  float result = min(prev + splat * uIntensity, 0.6);
  outColor = vec4(vec3(result), 1.0);
}
`;

// Reads accumulated ink concentration and paints it as translucent black.
// Composited over the page with CSS `mix-blend-mode: multiply`.
export const displayInkFragShader = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uInk;
out vec4 outColor;
void main() {
  float ink = texture(uInk, vUv).r;
  // Warm sepia-black ink rather than pure black.
  outColor = vec4(0.098, 0.071, 0.039, ink);
}
`;
