/* Zyra Lab: prototipo 3D (WebGL puro, sin librerías).
   1. "Zyra viva": una esfera de luz con cara que respira, parpadea, sigue tu dedo o el
      movimiento del celular, se ríe si la tocas, habla (voz del navegador), te escucha
      (micrófono) y late con el pulso.
   2. "Respira": una esfera de partículas que se infla al inhalar y se suelta al exhalar.
   3. "Toques": tarjetas con profundidad, una medalla 3D y transiciones entre pantallas.
   La calidad baja sola si el celular va lento, y respeta "reducir movimiento". */
(function () {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
  const REDUCED = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  const vib = (p) => { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} };
  const wrapAngle = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
  const hex = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];

  /* ══════════ GLSL compartido ══════════ */
  const FPREC = "#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n";
  // Ruido simplex 3D (Ashima Arts / Stefan Gustavson, licencia MIT)
  const NOISE = `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);
  const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));
  vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);
  vec3 l=1.0-g;
  vec3 i1=min(g.xyz,l.zxy);
  vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;
  vec3 x2=x0-i2+C.yyy;
  vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;
  vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);
  vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;
  vec4 y=y_*ns.x+ns.yyyy;
  vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);
  vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;
  vec4 s1=floor(b1)*2.0+1.0;
  vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
  vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);
  vec3 p1=vec3(a0.zw,h.y);
  vec3 p2=vec3(a1.xy,h.z);
  vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
  m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
`;

  // Fondo: aurora suave, halo de luz detrás de Zyra, sombra en el "piso" y polvo de estrellas
  const BG_VS = "attribute vec2 aP; void main(){ gl_Position = vec4(aP, 0.0, 1.0); }";
  const BG_FS = `
uniform vec2 uRes; uniform float uTime; uniform vec3 uColA; uniform vec3 uColB; uniform vec3 uColC;
uniform vec2 uOrb; uniform float uR; uniform float uGlow; uniform vec2 uPar; uniform float uShadow;
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y + uPar * 0.03;
  vec3 col = mix(vec3(0.018, 0.012, 0.06), vec3(0.055, 0.03, 0.12), uv.y);
  float n = snoise(vec3(p.x * 1.1, p.y * 1.8 - uTime * 0.04, uTime * 0.035));
  float n2 = snoise(vec3(p.x * 2.3 + 4.0, p.y * 1.2 + uTime * 0.03, uTime * 0.05 + 2.0));
  float band = smoothstep(0.15, 0.95, n * 0.5 + 0.5) * smoothstep(1.1, 0.0, abs(p.y - 0.28 - 0.14 * sin(p.x * 2.2 + uTime * 0.18)));
  float band2 = smoothstep(0.35, 1.0, n2 * 0.5 + 0.5) * smoothstep(1.0, 0.0, abs(p.y + 0.35 + 0.1 * sin(p.x * 1.7 - uTime * 0.12)));
  col += mix(uColA, uColC, uv.x) * band * 0.30 + mix(uColB, uColA, uv.x) * band2 * 0.16;
  vec2 o = (uOrb * uRes - 0.5 * uRes) / uRes.y;
  float d = length(p - o);
  col += uColC * exp(-d * d / (uR * uR * 2.2)) * (0.2 + 0.28 * uGlow);
  col += uColB * exp(-d * d / (uR * uR * 7.0)) * 0.06;
  vec2 s = p - (o + vec2(0.0, -uR * 1.32));
  float sh = exp(-(s.x * s.x / (uR * uR * 0.85) + s.y * s.y / (uR * uR * 0.035)));
  col *= 1.0 - sh * 0.5 * uShadow;
  vec2 g = floor(gl_FragCoord.xy / 3.0);
  float h = fract(sin(dot(g, vec2(12.9898, 78.233))) * 43758.5453);
  col += step(0.9978, h) * (0.35 + 0.35 * sin(uTime * 1.7 + h * 90.0)) * vec3(0.9, 0.9, 1.0);
  col *= 1.0 - 0.55 * dot(uv - 0.5, uv - 0.5);
  gl_FragColor = vec4(col, 1.0);
}`;

  // Zyra: esfera deformada con ruido; el ruido, los toques y la voz la hacen "respirar"
  const ORB_VS = `
attribute vec3 aPos;
uniform mat4 uProj; uniform mat4 uView; uniform mat3 uRot; uniform vec3 uOff;
uniform float uTime; uniform float uAmp; uniform float uFreq; uniform float uSpeed; uniform float uScale;
uniform float uTalk; uniform float uJitter; uniform vec3 uPokeDir; uniform float uPokeAge;
varying vec3 vN; varying vec3 vW; varying vec3 vL; varying float vD;
float disp(vec3 p){
  float t = uTime * uSpeed;
  float n = snoise(p * uFreq + vec3(t, t * 0.7, -t * 0.5));
  n += 0.3 * snoise(p * uFreq * 1.9 + vec3(-t * 1.3, t, t * 0.4));
  float d = n * uAmp;
  float ang = acos(clamp(dot(p, uPokeDir), -1.0, 1.0));
  d += sin(ang * 12.0 - uPokeAge * 16.0) * exp(-uPokeAge * 2.6) * exp(-ang * 1.8) * 0.10;
  d += uTalk * 0.045 * sin(p.y * 7.0 + uTime * 15.0) * smoothstep(-0.2, 0.7, p.z);
  d += uJitter * 0.018 * snoise(p * 6.0 + vec3(uTime * 5.0));
  return d;
}
void main(){
  vec3 p = normalize(aPos);
  vec3 up = abs(p.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 t = normalize(cross(p, up));
  vec3 b = cross(p, t);
  float e = 0.012;
  vec3 p1 = normalize(p + t * e);
  vec3 p2 = normalize(p + b * e);
  float d0 = disp(p);
  vec3 P0 = p * (uScale + d0);
  vec3 P1 = p1 * (uScale + disp(p1));
  vec3 P2 = p2 * (uScale + disp(p2));
  vec3 n = normalize(cross(P1 - P0, P2 - P0));
  if (dot(n, p) < 0.0) n = -n;
  vec3 w = uRot * P0 + uOff;
  vW = w; vN = uRot * n; vL = p; vD = d0;
  gl_Position = uProj * uView * vec4(w, 1.0);
}`;

  const ORB_FS = `
uniform vec3 uColA; uniform vec3 uColB; uniform vec3 uColC; uniform vec3 uCam; uniform float uTime;
uniform float uOpen; uniform float uHappy; uniform float uSad; uniform float uWide;
uniform float uSmile; uniform float uTalk; uniform float uBlush; uniform float uGlow;
varying vec3 vN; varying vec3 vW; varying vec3 vL; varying float vD;
vec2 plane(vec3 q, vec3 c){
  vec3 r = normalize(cross(vec3(0.0, 1.0, 0.0), c));
  vec3 u = cross(c, r);
  vec3 d = q - c * dot(q, c);
  return vec2(dot(d, r), dot(d, u));
}
float eyeMask(vec3 q, vec3 c, float side){
  if (dot(q, c) < 0.8) return 0.0;
  vec2 uv = plane(q, c);
  vec2 r = vec2(0.08, 0.115) * uWide;
  r.y *= max(uOpen, 0.07);
  float e = length(uv / r) - 1.0;
  float m = 1.0 - smoothstep(-0.12, 0.12, e);
  float cut = length((uv - vec2(0.0, -0.09 * uWide)) / (r * vec2(1.25, 1.05))) - 1.0;
  m *= mix(1.0, smoothstep(-0.1, 0.15, cut), uHappy);
  float lid = uv.y - (r.y * 0.15 - side * uv.x * 0.75);
  m *= mix(1.0, 1.0 - smoothstep(-0.006, 0.006, lid), uSad);
  return m;
}
// Brillo en los ojos: un punto grande y uno pequeño (es lo que hace que se vean vivos)
float eyeShine(vec3 q, vec3 c){
  if (dot(q, c) < 0.8) return 0.0;
  vec2 uv = plane(q, c);
  float s1 = 1.0 - smoothstep(0.014, 0.026, length(uv - vec2(-0.024, 0.04) * uWide));
  float s2 = 1.0 - smoothstep(0.006, 0.013, length(uv - vec2(0.022, -0.03) * uWide));
  return max(s1, s2 * 0.8) * (1.0 - uHappy) * smoothstep(0.35, 0.7, uOpen);
}
vec2 mouthMask(vec3 q){
  vec3 c = normalize(vec3(0.0, -0.19, 0.98));
  if (dot(q, c) < 0.8) return vec2(0.0);
  vec2 uv = plane(q, c);
  float open = clamp(uTalk, 0.0, 1.0);
  float isOpen = step(0.06, open);
  float o = length(uv / vec2(0.05 + 0.012 * open, 0.008 + 0.045 * open)) - 1.0;
  float mOpen = (1.0 - smoothstep(-0.15, 0.15, o)) * isOpen;
  float arc = abs(length(uv - vec2(0.0, 0.085)) - 0.105) - 0.011;
  float mSmile = (1.0 - smoothstep(0.0, 0.007, arc)) * step(uv.y, 0.0) * (1.0 - smoothstep(0.06, 0.078, abs(uv.x))) * uSmile * (1.0 - isOpen);
  float arc2 = abs(length(uv - vec2(0.0, -0.105)) - 0.085) - 0.008;
  float mFrown = (1.0 - smoothstep(0.0, 0.007, arc2)) * step(-0.03, uv.y) * (1.0 - smoothstep(0.04, 0.055, abs(uv.x))) * uSad * (1.0 - isOpen);
  return vec2(mOpen, max(mSmile, mFrown));
}
float blushMask(vec3 q){
  vec3 c1 = normalize(vec3(-0.28, -0.1, 0.95));
  vec3 c2 = normalize(vec3(0.28, -0.1, 0.95));
  float s = (1.0 - smoothstep(0.0, 0.08, length(plane(q, c1)))) * step(0.8, dot(q, c1));
  s += (1.0 - smoothstep(0.0, 0.08, length(plane(q, c2)))) * step(0.8, dot(q, c2));
  return s * uBlush;
}
void main(){
  vec3 N = normalize(vN);
  vec3 V = normalize(uCam - vW);
  vec3 q = normalize(vL);
  float ndv = max(dot(N, V), 0.0);
  float fres = pow(1.0 - ndv, 2.2);
  vec3 L = normalize(vec3(-0.45, 0.75, 0.65));
  float wrapL = dot(N, L) * 0.5 + 0.5;
  vec3 H = normalize(L + V);
  float spec = pow(max(dot(N, H), 0.0), 60.0);
  float g = clamp(q.y * 0.5 + 0.5 + vD * 2.2, 0.0, 1.0);
  vec3 base = mix(uColA, uColB, smoothstep(0.1, 0.9, g));
  vec3 irid = 0.5 + 0.5 * cos(6.28318 * (fres * 0.9 + vD * 3.0 + uTime * 0.04 + vec3(0.0, 0.33, 0.67)));
  vec3 col = base * (0.28 + 0.8 * wrapL);
  col += mix(uColC, irid, 0.4) * fres * (0.75 + 0.9 * uGlow);
  col += vec3(1.0) * spec * 0.5;
  col += uColC * 0.12 * (1.0 + uGlow);
  vec3 cL = normalize(vec3(-0.29, 0.12, 0.95));
  vec3 cR = normalize(vec3(0.29, 0.12, 0.95));
  float eyes = max(eyeMask(q, cL, -1.0), eyeMask(q, cR, 1.0));
  // Ojos oscuros y brillantes, con un reflejo de luz
  vec3 eyeCol = vec3(0.05, 0.035, 0.12) + uColA * 0.06 + vec3(1.0) * spec * 0.25;
  col = mix(col, eyeCol, eyes * 0.97);
  col = mix(col, vec3(1.0), clamp(eyeShine(q, cL) + eyeShine(q, cR), 0.0, 1.0) * eyes * 0.95);
  col += vec3(1.0, 0.42, 0.6) * blushMask(q) * 0.42;
  vec2 mo = mouthMask(q);
  col = mix(col, vec3(0.28, 0.06, 0.16), mo.x * 0.95);
  col = mix(col, eyeCol, mo.y * 0.92);
  gl_FragColor = vec4(col, 1.0);
}`;

  // Respiración: miles de partículas en una esfera
  const BP_VS = `
attribute vec3 aDir; attribute vec2 aSeed;
uniform mat4 uProj; uniform mat4 uView; uniform mat3 uRot; uniform vec3 uOff;
uniform float uTime; uniform float uLevel; uniform float uRelease; uniform float uSize;
varying float vA; varying float vMix;
void main(){
  vec3 d = aDir;
  float n = snoise(d * 1.7 + vec3(uTime * 0.15));
  float r = mix(0.45, 1.12, uLevel) * (0.82 + 0.36 * aSeed.x) + n * 0.09 * (0.6 + uLevel);
  r += uRelease * aSeed.y * aSeed.y * 0.7;
  vec3 p = uRot * (d * r) + uOff;
  vec4 v = uView * vec4(p, 1.0);
  gl_Position = uProj * v;
  gl_PointSize = uSize * (0.55 + aSeed.x) * (1.0 + n * 0.35) / max(-v.z, 0.5);
  vA = (0.35 + 0.65 * aSeed.y) * (1.0 - uRelease * aSeed.y * 0.75);
  vMix = d.y * 0.5 + 0.5 + n * 0.3;
}`;
  const BP_FS = `
uniform vec3 uColA; uniform vec3 uColB;
varying float vA; varying float vMix;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float a = 1.0 - smoothstep(0.0, 0.5, length(c));
  a *= a;
  vec3 col = mix(uColA, uColB, clamp(vMix, 0.0, 1.0));
  gl_FragColor = vec4(col * a * vA, 1.0);
}`;

  /* ══════════ Ayudas de WebGL ══════════ */
  function makeGL(canvas) {
    const opts = { antialias: true, alpha: false, premultipliedAlpha: false, powerPreference: "high-performance" };
    return canvas.getContext("webgl", opts) || canvas.getContext("experimental-webgl", opts);
  }
  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "shader");
    return s;
  }
  function program(gl, vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || "link");
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name.replace("[0]", "")] = gl.getUniformLocation(p, info.name); }
    return { p, u };
  }
  function perspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
  }
  function viewAt(dist) { return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -dist, 1]); }
  // Rotación: primero yaw (eje Y), luego pitch (eje X). Matriz por columnas para WebGL.
  function rotYX(yaw, pitch) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cx = Math.cos(pitch), sx = Math.sin(pitch);
    return new Float32Array([cy, sx * sy, -cx * sy, 0, cx, sx, sy, -sx * cy, cx * cy]);
  }
  function icosphere(level) {
    const t = (1 + Math.sqrt(5)) / 2;
    const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
    const v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map(norm);
    let f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
    for (let l = 0; l < level; l++) {
      const cache = new Map();
      const mid = (a, b) => {
        const k = a < b ? a + "_" + b : b + "_" + a;
        if (cache.has(k)) return cache.get(k);
        v.push(norm([(v[a][0] + v[b][0]) / 2, (v[a][1] + v[b][1]) / 2, (v[a][2] + v[b][2]) / 2]));
        cache.set(k, v.length - 1);
        return v.length - 1;
      };
      const nf = [];
      for (const [a, b, c] of f) { const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a); nf.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]); }
      f = nf;
    }
    return { pos: new Float32Array(v.flat()), idx: new Uint16Array(f.flat()) };
  }

  /* ══════════ Fluidez: mide y ajusta la calidad sola ══════════ */
  const quality = { mode: "auto", label: $("#quality") };
  function makePerf(onAdjust) {
    let frames = 0, acc = 0;
    return (dt) => {
      frames++; acc += dt;
      if (acc < 1) return;
      const fps = frames / acc;
      frames = 0; acc = 0;
      onAdjust(fps);
    };
  }
  quality.label.addEventListener("click", () => {
    quality.mode = quality.mode === "auto" ? "ahorro" : quality.mode === "ahorro" ? "alta" : "auto";
    if (current && current.applyQuality) current.applyQuality(true);
    quality.label.textContent = "Calidad: " + quality.mode;
  });

  /* ══════════ Estados de ánimo de Zyra ══════════ */
  const MOODS = {
    zyra:     { label: "Zyra", a: "#7b5cff", b: "#4a9eff", c: "#c4a8ff", amp: 0.045, freq: 1.2, speed: 0.3, jitter: 0, happy: 0.15, sad: 0, wide: 1, smile: 0.55, blush: 0.25, glow: 0.35, bob: 1, say: "Así me siento yo: tranquila y contigo 💜" },
    calma:    { label: "Calma", a: "#2f78ff", b: "#3fe0d0", c: "#9fd8ff", amp: 0.035, freq: 1.05, speed: 0.2, jitter: 0, happy: 0.3, sad: 0, wide: 0.95, smile: 0.4, blush: 0.15, glow: 0.25, bob: 0.7, say: "Respiro lento… todo va a estar bien 🌊" },
    feliz:    { label: "Feliz", a: "#ff8a3d", b: "#ff4f9a", c: "#ffd36b", amp: 0.055, freq: 1.35, speed: 0.5, jitter: 0, happy: 1, sad: 0, wide: 1.05, smile: 1, blush: 0.75, glow: 0.6, bob: 1.6, say: "¡Hoy me siento feliz! ✨" },
    ansiedad: { label: "Ansiedad", a: "#ff5a2a", b: "#c0247a", c: "#ffa36b", amp: 0.07, freq: 1.9, speed: 1.0, jitter: 0.6, happy: 0, sad: 0.15, wide: 1.25, smile: 0, blush: 0, glow: 0.5, bob: 2.2, say: "Siento el pecho apretado… ¿respiramos juntos?" },
    triste:   { label: "Tristeza", a: "#25358c", b: "#4a5bc4", c: "#8aa0ff", amp: 0.03, freq: 0.95, speed: 0.14, jitter: 0, happy: 0, sad: 1, wide: 0.95, smile: 0, blush: 0, glow: 0.12, bob: 0.45, say: "Hoy estoy un poquito triste. Gracias por estar aquí 💙" },
    energia:  { label: "Energía", a: "#8f3dff", b: "#18d6f0", c: "#e08bff", amp: 0.065, freq: 1.5, speed: 0.8, jitter: 0, happy: 0.55, sad: 0, wide: 1.12, smile: 0.7, blush: 0.4, glow: 0.7, bob: 1.8, say: "¡Tengo mucha energía hoy! ⚡" },
  };
  for (const k in MOODS) { const m = MOODS[k]; m.A = hex(m.a); m.B = hex(m.b); m.C = hex(m.c); }

  const PHRASES = [
    "Hola, soy Zyra. Aquí estoy contigo.",
    "¿Cómo vas hoy? Cuéntame lo que quieras.",
    "Me alegra mucho verte por aquí.",
    "Respira conmigo un momento. Así, despacio.",
    "Lo que sientes importa. Y tú también.",
  ];
  const POKES = ["¡Jeje, me haces cosquillas! 😆", "¡Hola! 👋", "¡Ay! 😳 jeje", "Me gusta que me toques 💜", "¡Otra vez! 😄"];
  const IDLE = ["¿Cómo te sientes hoy?", "Aquí estoy 💜", "Toca mis colores abajo 🎨", "¿Respiramos un ratico?", "Inclina el celular, te sigo 👀"];

  /* ══════════ 1. Zyra viva ══════════ */
  class Orb {
    constructor(canvas) {
      this.c = canvas;
      const gl = this.gl = makeGL(canvas);
      if (!gl) throw new Error("sin WebGL");
      this.bg = program(gl, BG_VS, FPREC + NOISE + BG_FS);
      this.orb = program(gl, "precision highp float;\n" + NOISE + ORB_VS, FPREC + ORB_FS);
      this.tri = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.tri);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      this.vbo = gl.createBuffer(); this.ibo = gl.createBuffer();
      this.setDetail(5);
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.scale = Math.min(this.dpr, 1.5);
      this.aP = gl.getAttribLocation(this.bg.p, "aP");
      this.aPos = gl.getAttribLocation(this.orb.p, "aPos");
      this.layout();
      this.perf = makePerf((fps) => this.adapt(fps));
    }
    setDetail(level) {
      const gl = this.gl;
      const s = icosphere(level);
      this.detail = level;
      this.count = s.idx.length;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
      gl.bufferData(gl.ARRAY_BUFFER, s.pos, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, s.idx, gl.STATIC_DRAW);
    }
    adapt(fps) {
      if (quality.mode === "auto") {
        if (fps < 42 && this.scale > 0.55) { this.scale = Math.max(0.55, this.scale - 0.2); this.layout(); }
        else if (fps < 34 && this.detail > 4) this.setDetail(4);
        else if (fps > 57 && this.scale < Math.min(this.dpr, 1.5)) { this.scale = Math.min(Math.min(this.dpr, 1.5), this.scale + 0.1); this.layout(); }
      }
      quality.label.textContent = (quality.mode === "auto" ? "" : quality.mode + " · ") + Math.round(fps) + " fps";
    }
    applyQuality() {
      this.scale = quality.mode === "ahorro" ? 0.6 : quality.mode === "alta" ? this.dpr : Math.min(this.dpr, 1.5);
      this.setDetail(quality.mode === "ahorro" ? 4 : 5);
      this.layout();
    }
    layout() {
      const W = this.c.clientWidth || 1, H = this.c.clientHeight || 1;
      this.c.width = Math.round(W * this.scale);
      this.c.height = Math.round(H * this.scale);
      this.W = W; this.H = H;
      const panel = this.c.parentElement.querySelector(".panel");
      const ph = panel ? panel.offsetHeight : 0;
      const aspect = W / H;
      this.fov = 35 * Math.PI / 180;
      this.tan = Math.tan(this.fov / 2);
      // Tamaño en pantalla (en "altos" de pantalla) y centro: en el espacio libre sobre el panel
      this.r = Math.min(0.3, 0.33 * aspect, 0.34 * (H - ph) / H);
      this.dist = 0.5 / (this.r * this.tan);
      this.yShift = ((ph + (H - ph) / 2) / H) - 0.5;
      this.proj = perspective(this.fov, aspect, 0.1, 100);
      this.view = viewAt(this.dist);
    }
    // Rayo desde la cámara por el punto tocado: ¿toca a Zyra? → dirección local del toque
    hit(x, y, S) {
      const ndcX = (x / this.W) * 2 - 1, ndcY = 1 - (y / this.H) * 2;
      let dx = ndcX * this.tan * (this.W / this.H), dy = ndcY * this.tan, dz = -1;
      const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
      const cy = this.worldY(S);
      const ox = 0, oy = -cy, oz = this.dist; // origen relativo al centro de Zyra
      const b = ox * dx + oy * dy + oz * dz;
      const R = S.scale * 1.05;
      const c = ox * ox + oy * oy + oz * oz - R * R;
      const disc = b * b - c;
      if (disc < 0) return null;
      const tt = -b - Math.sqrt(disc);
      const wx = ox + dx * tt, wy = oy + dy * tt, wz = oz + dz * tt;
      const m = rotYX(S.yaw, S.pitch);
      // local = Rᵀ · mundo (las columnas de R son las filas de Rᵀ)
      const lx = m[0] * wx + m[1] * wy + m[2] * wz;
      const ly = m[3] * wx + m[4] * wy + m[5] * wz;
      const lz = m[6] * wx + m[7] * wy + m[8] * wz;
      const ll = Math.hypot(lx, ly, lz) || 1;
      return [lx / ll, ly / ll, lz / ll];
    }
    worldY(S) { return (this.yShift + S.bob) * 2 * this.tan * this.dist; }
    screenCenter(S) { return { x: this.W / 2, y: this.H * (0.5 - this.yShift - S.bob), r: this.r * S.scale * this.H }; }
    render(S) {
      const gl = this.gl, m = S.m;
      gl.viewport(0, 0, this.c.width, this.c.height);
      gl.clearColor(0.02, 0.015, 0.06, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      // Fondo
      gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
      gl.useProgram(this.bg.p);
      const ub = this.bg.u;
      gl.uniform2f(ub.uRes, this.c.width, this.c.height);
      gl.uniform1f(ub.uTime, S.t);
      gl.uniform3fv(ub.uColA, m.A); gl.uniform3fv(ub.uColB, m.B); gl.uniform3fv(ub.uColC, m.C);
      gl.uniform2f(ub.uOrb, 0.5, 0.5 + this.yShift + S.bob);
      gl.uniform1f(ub.uR, this.r * S.scale);
      gl.uniform1f(ub.uGlow, S.glow);
      gl.uniform2f(ub.uPar, S.gazeX, -S.gazeY);
      gl.uniform1f(ub.uShadow, 1);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.tri);
      gl.enableVertexAttribArray(this.aP);
      gl.vertexAttribPointer(this.aP, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disableVertexAttribArray(this.aP);
      // Zyra
      gl.enable(gl.DEPTH_TEST); gl.depthMask(true);
      gl.useProgram(this.orb.p);
      const u = this.orb.u;
      gl.uniformMatrix4fv(u.uProj, false, this.proj);
      gl.uniformMatrix4fv(u.uView, false, this.view);
      gl.uniformMatrix3fv(u.uRot, false, rotYX(S.yaw, S.pitch));
      gl.uniform3f(u.uOff, 0, this.worldY(S), 0);
      gl.uniform3f(u.uCam, 0, 0, this.dist);
      gl.uniform1f(u.uTime, S.t);
      gl.uniform1f(u.uAmp, m.amp * (REDUCED ? 0.6 : 1) + S.listen * 0.04);
      gl.uniform1f(u.uFreq, m.freq);
      gl.uniform1f(u.uSpeed, m.speed * (REDUCED ? 0.5 : 1));
      gl.uniform1f(u.uScale, S.scale);
      gl.uniform1f(u.uTalk, Math.max(S.talk, S.listen * 0.6));
      gl.uniform1f(u.uJitter, m.jitter);
      gl.uniform3fv(u.uPokeDir, S.pokeDir);
      gl.uniform1f(u.uPokeAge, S.pokeAge);
      gl.uniform3fv(u.uColA, m.A); gl.uniform3fv(u.uColB, m.B); gl.uniform3fv(u.uColC, m.C);
      gl.uniform1f(u.uOpen, S.open);
      gl.uniform1f(u.uHappy, Math.max(m.happy, S.giggle));
      gl.uniform1f(u.uSad, m.sad * (1 - S.giggle));
      gl.uniform1f(u.uWide, m.wide + S.listen * 0.18);
      gl.uniform1f(u.uSmile, Math.max(m.smile, S.giggle));
      gl.uniform1f(u.uTalk, Math.max(S.talk, S.listen * 0.6));
      gl.uniform1f(u.uBlush, Math.max(m.blush, S.giggle * 0.8));
      gl.uniform1f(u.uGlow, S.glow);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
      gl.enableVertexAttribArray(this.aPos);
      gl.vertexAttribPointer(this.aPos, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
      gl.drawElements(gl.TRIANGLES, this.count, gl.UNSIGNED_SHORT, 0);
      gl.disableVertexAttribArray(this.aPos);
    }
  }

  // Estado de Zyra (lo que la hace sentir viva)
  const S = {
    t: 0, mood: "zyra", m: null, target: MOODS.zyra,
    yaw: 0, pitch: 0, vyaw: 0, vpitch: 0, dragging: false,
    gazeX: 0, gazeY: 0, tgx: 0, tgy: 0, pointerAt: -10, wanderAt: 0, gyro: null,
    open: 0, nextBlink: 1.6, blinkT: -1, awake: 0,
    pokeDir: [0, 0, 1], pokeAge: 99, giggle: 0,
    talk: 0, talking: false, talkKick: 0, listen: 0, mic: null,
    beatOn: false, bpm: 72, beat: 0, lastPh: 0,
    scale: 1, glow: 0.35, bob: 0, idleAt: 9,
  };
  S.m = { A: MOODS.zyra.A.slice(), B: MOODS.zyra.B.slice(), C: MOODS.zyra.C.slice() };
  for (const k of ["amp", "freq", "speed", "jitter", "happy", "sad", "wide", "smile", "blush", "glow", "bob"]) S.m[k] = MOODS.zyra[k];

  const bubble = $("#bubble");
  let bubbleTimer = 0;
  function say(text, ms) {
    bubble.textContent = text;
    bubble.classList.add("show");
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => bubble.classList.remove("show"), ms || 3200);
    S.idleAt = S.t + 14 + Math.random() * 8;
  }

  function updateOrb(dt, orb) {
    S.t += dt;
    const T = S.target, m = S.m;
    // Cambio de ánimo suave (colores y forma)
    for (let i = 0; i < 3; i++) { m.A[i] = damp(m.A[i], T.A[i], 2.5, dt); m.B[i] = damp(m.B[i], T.B[i], 2.5, dt); m.C[i] = damp(m.C[i], T.C[i], 2.5, dt); }
    for (const k of ["amp", "freq", "speed", "jitter", "happy", "sad", "wide", "smile", "blush", "glow", "bob"]) m[k] = damp(m[k], T[k], 3, dt);

    // Despertar: crece, abre los ojos y saluda
    S.awake = Math.min(1, S.awake + dt * 0.7);
    const wake = S.awake < 1 ? 1 - Math.pow(1 - S.awake, 3) * Math.cos(S.awake * 9) : 1;

    // Respirar y flotar
    const breath = Math.sin(S.t * 2 * Math.PI * 0.16);
    S.bob = Math.sin(S.t * (0.55 + 0.3 * m.bob)) * 0.012 * (0.6 + m.bob) * (REDUCED ? 0.4 : 1);

    // Latido (lub-dub)
    let beat = 0;
    if (S.beatOn) {
      const period = 60 / S.bpm;
      const ph = (S.t % period) / period;
      const pulse = (x) => Math.exp(-Math.pow(x / 0.055, 2));
      beat = pulse(ph) + pulse(ph - 1) + 0.6 * pulse(ph - 0.3);
      if (ph < S.lastPh && $("#vib").checked) vib(28);
      S.lastPh = ph;
    }
    S.beat = damp(S.beat, beat, 30, dt);

    // Hablar: la boca y la superficie se mueven con la "voz"
    let talkTarget = 0;
    if (S.talking) talkTarget = clamp(0.45 + 0.35 * Math.sin(S.t * 11.3) + 0.25 * Math.sin(S.t * 17.9 + 1.3) + S.talkKick, 0, 1);
    S.talkKick = damp(S.talkKick, 0, 6, dt);
    S.talk = damp(S.talk, talkTarget, 16, dt);

    // Escuchar el micrófono
    if (S.mic) {
      const a = S.mic.an, buf = S.mic.buf;
      a.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
      S.listen = damp(S.listen, clamp(Math.sqrt(sum / buf.length) * 7, 0, 1), 14, dt);
    } else S.listen = damp(S.listen, 0, 6, dt);

    S.scale = (0.6 + 0.4 * wake) * (1 + breath * 0.025 + S.beat * 0.05 + S.listen * 0.06);
    S.glow = m.glow + S.beat * 0.6 + S.listen * 0.7 + S.talk * 0.25 + S.giggle * 0.4;

    // Parpadeo (a veces doble)
    if (S.awake < 0.55) S.open = 0;
    else {
      if (S.blinkT < 0 && S.t > S.nextBlink) { S.blinkT = 0; S.double = Math.random() < 0.18; }
      let o = 1;
      if (S.blinkT >= 0) {
        S.blinkT += dt;
        const d = 0.16;
        const k = S.blinkT / d;
        if (k < 1) o = Math.abs(1 - 2 * k);
        else if (S.double && k < 2.2) o = k < 1.2 ? 1 : Math.abs(1 - 2 * (k - 1.2));
        else { S.blinkT = -1; S.nextBlink = S.t + 2.2 + Math.random() * 4; }
      }
      const squint = S.giggle * 0.45 + (m.sad > 0.5 ? 0.18 : 0);
      S.open = damp(S.open, o * (1 - squint), 30, dt);
    }

    // Mirada: el dedo, el giroscopio o curiosidad propia
    if (S.t - S.pointerAt > 2.5 && !S.gyro) {
      if (S.t > S.wanderAt) { S.tgx = (Math.random() * 2 - 1) * 0.7; S.tgy = (Math.random() * 2 - 1) * 0.45; S.wanderAt = S.t + 1.6 + Math.random() * 2.8; }
    }
    if (S.gyro) { S.tgx = S.gyro.x; S.tgy = S.gyro.y; }
    S.gazeX = damp(S.gazeX, S.tgx, 5, dt);
    S.gazeY = damp(S.gazeY, S.tgy, 5, dt);

    // Girar con el dedo (con inercia) y volver a mirarte
    if (!S.dragging) {
      S.vyaw *= Math.exp(-2.6 * dt); S.vpitch *= Math.exp(-3.2 * dt);
      S.yaw += S.vyaw * dt; S.pitch += S.vpitch * dt;
      const ty = S.gazeX * 0.42, tp = S.gazeY * 0.32;
      if (Math.abs(S.vyaw) < 2) S.yaw += wrapAngle(ty - S.yaw) * (1 - Math.exp(-3 * dt));
      S.pitch += (tp - S.pitch) * (1 - Math.exp(-3.5 * dt));
      S.yaw = wrapAngle(S.yaw);
    }

    S.pokeAge += dt;
    S.giggle = damp(S.giggle, 0, 1.6, dt);

    if (!REDUCED && S.t > S.idleAt && S.awake >= 1) say(IDLE[Math.floor(Math.random() * IDLE.length)], 2800);

    // La burbuja flota sobre la cabeza de Zyra
    const sc = orb.screenCenter(S);
    bubble.style.top = Math.max(60, sc.y - sc.r - 14) + "px";
  }

  /* ══════════ 2. Respira ══════════ */
  const TECHS = {
    calma: { label: "Calma 4-6", phases: [["Inhala", 4, 1], ["Exhala", 6, 0]] },
    t478:  { label: "4-7-8", phases: [["Inhala", 4, 1], ["Mantén", 7, 1], ["Exhala", 8, 0]] },
    caja:  { label: "Caja 4-4-4-4", phases: [["Inhala", 4, 1], ["Mantén", 4, 1], ["Exhala", 4, 0], ["Pausa", 4, 0]] },
  };
  const B = { tech: "calma", running: false, i: 0, tp: 0, cycles: 0, total: 4, level: 0.35, from: 0.35, release: 0, t: 0, yaw: 0, done: 0 };
  const BCOL = { inA: hex("#5b8cff"), inB: hex("#7cf3ff"), outA: hex("#8b5cf6"), outB: hex("#ff7ac8"), A: hex("#6b7bff"), Bc: hex("#7cdcff") };

  class Breath {
    constructor(canvas) {
      this.c = canvas;
      const gl = this.gl = makeGL(canvas);
      if (!gl) throw new Error("sin WebGL");
      this.bg = program(gl, BG_VS, FPREC + NOISE + BG_FS);
      this.pts = program(gl, "precision highp float;\n" + NOISE + BP_VS, FPREC + BP_FS);
      this.tri = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.tri);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      this.aP = gl.getAttribLocation(this.bg.p, "aP");
      this.aDir = gl.getAttribLocation(this.pts.p, "aDir");
      this.aSeed = gl.getAttribLocation(this.pts.p, "aSeed");
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.scale = Math.min(this.dpr, 1.5);
      this.setCount(navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4 ? 3500 : 6500);
      this.layout();
      this.perf = makePerf((fps) => {
        if (quality.mode === "auto" && fps < 42 && this.n > 2500) this.setCount(Math.round(this.n * 0.65));
        if (quality.mode === "auto" && fps < 42 && this.scale > 0.6) { this.scale -= 0.2; this.layout(); }
        quality.label.textContent = (quality.mode === "auto" ? "" : quality.mode + " · ") + Math.round(fps) + " fps";
      });
    }
    setCount(n) {
      const gl = this.gl;
      this.n = n;
      const dir = new Float32Array(n * 3), seed = new Float32Array(n * 2);
      const golden = Math.PI * (3 - Math.sqrt(5));
      for (let i = 0; i < n; i++) {
        const y = 1 - (i / (n - 1)) * 2, r = Math.sqrt(1 - y * y), th = golden * i;
        dir[i * 3] = Math.cos(th) * r; dir[i * 3 + 1] = y; dir[i * 3 + 2] = Math.sin(th) * r;
        seed[i * 2] = Math.random(); seed[i * 2 + 1] = Math.random();
      }
      this.bDir = this.bDir || gl.createBuffer(); this.bSeed = this.bSeed || gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bDir); gl.bufferData(gl.ARRAY_BUFFER, dir, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bSeed); gl.bufferData(gl.ARRAY_BUFFER, seed, gl.STATIC_DRAW);
    }
    applyQuality() {
      this.scale = quality.mode === "ahorro" ? 0.6 : quality.mode === "alta" ? this.dpr : Math.min(this.dpr, 1.5);
      this.setCount(quality.mode === "ahorro" ? 2500 : quality.mode === "alta" ? 9000 : 6500);
      this.layout();
    }
    layout() {
      const W = this.c.clientWidth || 1, H = this.c.clientHeight || 1;
      this.c.width = Math.round(W * this.scale); this.c.height = Math.round(H * this.scale);
      this.W = W; this.H = H;
      const panel = this.c.parentElement.querySelector(".panel");
      const ph = panel ? panel.offsetHeight : 0;
      const aspect = W / H;
      this.fov = 40 * Math.PI / 180; this.tan = Math.tan(this.fov / 2);
      this.r = Math.min(0.3, 0.34 * aspect, 0.33 * (H - ph) / H);
      this.dist = 0.56 / (this.r * this.tan);
      this.yShift = ((ph + (H - ph) / 2) / H) - 0.5;
      this.proj = perspective(this.fov, aspect, 0.1, 100);
      this.view = viewAt(this.dist);
      const txt = $("#breath-text");
      txt.style.top = (H * (0.5 - this.yShift)) + "px";
    }
    render() {
      const gl = this.gl;
      gl.viewport(0, 0, this.c.width, this.c.height);
      gl.clearColor(0.02, 0.015, 0.06, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.disable(gl.DEPTH_TEST);
      const inhaling = B.running && TECHS[B.tech].phases[B.i][2] === 1;
      const A = BCOL.A, Bc = BCOL.Bc;
      for (let i = 0; i < 3; i++) { A[i] = damp(A[i], inhaling ? BCOL.inA[i] : BCOL.outA[i], 1.5, 1 / 60); Bc[i] = damp(Bc[i], inhaling ? BCOL.inB[i] : BCOL.outB[i], 1.5, 1 / 60); }
      gl.useProgram(this.bg.p);
      const ub = this.bg.u;
      gl.uniform2f(ub.uRes, this.c.width, this.c.height);
      gl.uniform1f(ub.uTime, B.t);
      gl.uniform3fv(ub.uColA, A); gl.uniform3fv(ub.uColB, Bc); gl.uniform3fv(ub.uColC, Bc);
      gl.uniform2f(ub.uOrb, 0.5, 0.5 + this.yShift);
      gl.uniform1f(ub.uR, this.r * (0.42 + 0.42 * B.level));
      gl.uniform1f(ub.uGlow, 0.1 + B.level * 0.35);
      gl.uniform2f(ub.uPar, 0, 0);
      gl.uniform1f(ub.uShadow, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.tri);
      gl.enableVertexAttribArray(this.aP);
      gl.vertexAttribPointer(this.aP, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disableVertexAttribArray(this.aP);
      // Partículas con mezcla aditiva (brillan donde se juntan)
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(this.pts.p);
      const u = this.pts.u;
      gl.uniformMatrix4fv(u.uProj, false, this.proj);
      gl.uniformMatrix4fv(u.uView, false, this.view);
      gl.uniformMatrix3fv(u.uRot, false, rotYX(B.yaw, 0.35));
      gl.uniform3f(u.uOff, 0, this.yShift * 2 * this.tan * this.dist, 0);
      gl.uniform1f(u.uTime, B.t);
      gl.uniform1f(u.uLevel, B.level);
      gl.uniform1f(u.uRelease, B.release);
      gl.uniform1f(u.uSize, 46 * this.scale * (this.H / 800));
      gl.uniform3fv(u.uColA, A); gl.uniform3fv(u.uColB, Bc);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bDir);
      gl.enableVertexAttribArray(this.aDir);
      gl.vertexAttribPointer(this.aDir, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bSeed);
      gl.enableVertexAttribArray(this.aSeed);
      gl.vertexAttribPointer(this.aSeed, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.POINTS, 0, this.n);
      gl.disableVertexAttribArray(this.aDir); gl.disableVertexAttribArray(this.aSeed);
      gl.disable(gl.BLEND);
    }
  }

  const ease = (x) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(x, 0, 1));
  function updateBreath(dt) {
    B.t += dt;
    B.yaw += dt * (REDUCED ? 0.04 : 0.12);
    const ph = TECHS[B.tech].phases;
    if (B.running) {
      B.tp += dt;
      const cur = ph[B.i];
      if (B.tp >= cur[1]) {
        B.tp = 0; B.from = B.level; B.i = (B.i + 1) % ph.length;
        if (B.i === 0) B.cycles++;
        vib(18);
        if (B.cycles >= B.total) { finishBreath(); return; }
        $("#b-ph").animate([{ transform: "scale(.85)", opacity: 0.4 }, { transform: "scale(1)", opacity: 1 }], { duration: 420, easing: "cubic-bezier(.34,1.56,.64,1)" });
      }
      const c = ph[B.i];
      const p = B.tp / c[1];
      B.level = lerp(B.from, c[2] === 1 ? 1 : 0.08, ease(p));
      B.release = c[0] === "Exhala" ? ease(p) : damp(B.release, 0, 3, dt);
      $("#b-ph").textContent = c[0];
      $("#b-ct").textContent = Math.ceil(c[1] - B.tp) + " · ciclo " + (B.cycles + 1) + " de " + B.total;
      const total = ph.reduce((a, x) => a + x[1], 0) * B.total;
      const doneT = ph.reduce((a, x) => a + x[1], 0) * B.cycles + ph.slice(0, B.i).reduce((a, x) => a + x[1], 0) + B.tp;
      $("#b-bar").style.width = (100 * doneT / total).toFixed(1) + "%";
    } else {
      B.level = damp(B.level, 0.32 + 0.06 * Math.sin(B.t * 0.9), 2, dt);
      B.release = damp(B.release, 0, 2, dt);
    }
  }
  function startBreath() {
    if (B.running) { B.running = false; $("#b-start").textContent = "Seguir"; $("#b-ph").textContent = "En pausa"; return; }
    if (B.cycles >= B.total || B.done) { B.cycles = 0; B.i = 0; B.tp = 0; B.done = 0; }
    B.running = true; B.from = B.level;
    $("#b-start").textContent = "Pausar";
    vib(12);
  }
  function finishBreath() {
    B.running = false; B.done = 1;
    $("#b-ph").textContent = "¡Bien hecho! 💜";
    $("#b-ct").textContent = "Tu cuerpo lo notó";
    $("#b-start").textContent = "Otra vez";
    $("#b-bar").style.width = "100%";
    vib([20, 40, 20, 40, 60]);
  }

  /* ══════════ Pestañas y bucle de animación ══════════ */
  let orb = null, breath = null, current = null, raf = 0, last = 0;
  const views = {};
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    if (current === orb && orb) { updateOrb(dt, orb); orb.render(S); orb.perf(dt); }
    else if (current === breath && breath) { updateBreath(dt); breath.render(); breath.perf(dt); }
    else tiltGyroTick();
  }
  function run() { cancelAnimationFrame(raf); last = performance.now(); raf = requestAnimationFrame(frame); }
  function stop() { cancelAnimationFrame(raf); raf = 0; }

  function showTab(name) {
    document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === name));
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("on", t.id === "tab-" + name));
    current = name === "orb" ? orb : name === "breath" ? breath : views.touch;
    if (name === "breath" && breath) setTimeout(() => breath.layout(), 50);
    if (name === "orb" && orb) setTimeout(() => orb.layout(), 50);
    if (name !== "orb" && S.mic) stopListen();
    if (name !== "orb" && window.speechSynthesis) speechSynthesis.cancel();
    if (name === "touch") quality.label.textContent = "Toques";
    vib(8);
    run();
  }
  document.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
  document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); else run(); });
  window.addEventListener("resize", () => { if (orb) orb.layout(); if (breath) breath.layout(); });

  /* ══════════ Controles de Zyra ══════════ */
  const moodsEl = $("#moods");
  for (const k in MOODS) {
    const m = MOODS[k];
    const b = document.createElement("button");
    b.type = "button"; b.className = "chip" + (k === "zyra" ? " on" : "");
    b.innerHTML = '<span class="dot" style="background:linear-gradient(135deg,' + m.a + "," + m.b + ')"></span>' + m.label;
    b.addEventListener("click", () => {
      S.target = m; S.mood = k;
      moodsEl.querySelectorAll(".chip").forEach((c) => c.classList.toggle("on", c === b));
      say(m.say, 2600);
      S.pokeDir = [0, 0.3, 0.95]; S.pokeAge = 0;
      vib(10);
    });
    moodsEl.appendChild(b);
  }

  function pickVoice() {
    const vs = window.speechSynthesis ? speechSynthesis.getVoices() : [];
    return vs.find((v) => /^es(-|_)(CO|MX|US|419)/i.test(v.lang) && /female|mujer|paulina|sabina|helena|dalia|salome|google/i.test(v.name))
      || vs.find((v) => /^es(-|_)(CO|MX|US|419)/i.test(v.lang)) || vs.find((v) => /^es/i.test(v.lang)) || null;
  }
  if (window.speechSynthesis) speechSynthesis.onvoiceschanged = () => {};
  $("#btn-talk").addEventListener("click", () => {
    const text = PHRASES[Math.floor(Math.random() * PHRASES.length)];
    say(text, 4200);
    vib(10);
    const fallback = () => { S.talking = true; setTimeout(() => { S.talking = false; }, 2600); };
    if (!window.speechSynthesis) return fallback();
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "es-CO"; u.rate = 1.02; u.pitch = 1.12;
      const v = pickVoice(); if (v) u.voice = v;
      u.onstart = () => { S.talking = true; };
      u.onend = u.onerror = () => { S.talking = false; };
      u.onboundary = () => { S.talkKick = 0.35; };
      speechSynthesis.speak(u);
      setTimeout(() => { if (!speechSynthesis.speaking && !S.talking) fallback(); }, 700);
    } catch (e) { fallback(); }
  });

  async function startListen() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const AC = window.AudioContext || window.webkitAudioContext;
      const ac = new AC();
      const an = ac.createAnalyser(); an.fftSize = 512;
      ac.createMediaStreamSource(stream).connect(an);
      S.mic = { stream, ac, an, buf: new Uint8Array(an.fftSize), timer: setTimeout(stopListen, 20000) };
      $("#btn-listen").classList.add("on");
      say("Te escucho… háblame 🎙️", 2600);
    } catch (e) {
      say("No pude usar el micrófono 😕 Revisa el permiso.", 3200);
    }
  }
  function stopListen() {
    if (!S.mic) return;
    clearTimeout(S.mic.timer);
    try { S.mic.stream.getTracks().forEach((t) => t.stop()); S.mic.ac.close(); } catch (e) {}
    S.mic = null;
    $("#btn-listen").classList.remove("on");
  }
  $("#btn-listen").addEventListener("click", () => { vib(10); if (S.mic) stopListen(); else startListen(); });

  $("#btn-heart").addEventListener("click", () => {
    S.beatOn = !S.beatOn;
    $("#btn-heart").classList.toggle("on", S.beatOn);
    $("#heart-row").classList.toggle("show", S.beatOn);
    if (orb) setTimeout(() => orb.layout(), 30);
    say(S.beatOn ? "Ahora late conmigo 💓" : "Listo, descanso un poco", 2200);
    vib(10);
  });
  $("#bpm").addEventListener("input", (e) => { S.bpm = Number(e.target.value); $("#bpm-val").textContent = S.bpm + " lpm"; });

  // Tocar, arrastrar y mirar
  const oc = $("#orb-canvas");
  let downX = 0, downY = 0, downT = 0, lastX = 0, lastY = 0, lastMoveT = 0;
  function local(e) { const r = oc.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  function aim(x, y) {
    if (!orb) return;
    const sc = orb.screenCenter(S);
    S.tgx = clamp((x - sc.x) / (orb.W * 0.5), -1, 1);
    S.tgy = clamp((y - sc.y) / (orb.H * 0.45), -1, 1);
    S.pointerAt = S.t;
  }
  oc.addEventListener("pointerdown", (e) => {
    const [x, y] = local(e);
    downX = lastX = x; downY = lastY = y; downT = lastMoveT = performance.now();
    S.dragging = true; S.vyaw = 0; S.vpitch = 0;
    try { oc.setPointerCapture(e.pointerId); } catch (er) {}
    aim(x, y);
  });
  oc.addEventListener("pointermove", (e) => {
    const [x, y] = local(e);
    if (S.dragging) {
      const now = performance.now();
      const dtm = Math.max(1, now - lastMoveT) / 1000;
      const dx = x - lastX, dy = y - lastY;
      S.yaw = wrapAngle(S.yaw + dx * 0.012);
      S.pitch = clamp(S.pitch + dy * 0.008, -0.9, 0.9);
      S.vyaw = damp(S.vyaw, (dx * 0.012) / dtm, 20, dtm);
      S.vpitch = damp(S.vpitch, (dy * 0.008) / dtm, 20, dtm);
      lastX = x; lastY = y; lastMoveT = now;
    }
    aim(x, y);
  });
  const endDrag = (e) => {
    if (!S.dragging) return;
    S.dragging = false;
    const [x, y] = local(e);
    const moved = Math.hypot(x - downX, y - downY);
    if (moved < 10 && performance.now() - downT < 400 && orb) {
      const dir = orb.hit(x, y, S);
      if (dir) {
        S.pokeDir = dir; S.pokeAge = 0; S.giggle = 1;
        say(POKES[Math.floor(Math.random() * POKES.length)], 2000);
        vib([12, 30, 12]);
      }
    } else if (Math.abs(S.vyaw) > 3) vib(6);
    $("#orb-hint").style.opacity = "0";
  };
  oc.addEventListener("pointerup", endDrag);
  oc.addEventListener("pointercancel", endDrag);
  oc.addEventListener("pointerleave", () => { S.pointerAt = S.t - 1.5; });

  // Giroscopio: Zyra (y las tarjetas) siguen la inclinación del celular
  let g0 = null;
  const gyro = { x: 0, y: 0, on: false };
  function onTilt(e) {
    if (e.beta == null || e.gamma == null) return;
    if (!g0) g0 = { b: e.beta, g: e.gamma };
    gyro.x = clamp((e.gamma - g0.g) / 22, -1, 1);
    gyro.y = clamp((e.beta - g0.b) / 22, -1, 1);
    gyro.on = true;
    if (S.t - S.pointerAt > 2.5) S.gyro = { x: gyro.x, y: gyro.y }; else S.gyro = null;
  }
  if (window.DeviceOrientationEvent) {
    window.addEventListener("deviceorientation", onTilt);
    // iPhone pide permiso con un toque; si en 1,5 s no llegan datos, se muestra el botón
    if (typeof DeviceOrientationEvent.requestPermission === "function") {
      const gb = $("#gyro-btn");
      setTimeout(() => { if (!gyro.on && ("ontouchstart" in window)) gb.hidden = false; }, 1500);
      gb.addEventListener("click", async () => {
        try { if ((await DeviceOrientationEvent.requestPermission()) === "granted") gb.hidden = true; } catch (e) {}
      });
    }
  }

  /* ══════════ 3. Toques ══════════ */
  const tilts = Array.from(document.querySelectorAll(".tilt"));
  tilts.forEach((card) => {
    const move = (e) => {
      const r = card.getBoundingClientRect();
      const px = clamp((e.clientX - r.left) / r.width, 0, 1), py = clamp((e.clientY - r.top) / r.height, 0, 1);
      card.classList.add("moving");
      card.style.transform = "rotateX(" + ((0.5 - py) * 18).toFixed(2) + "deg) rotateY(" + ((px - 0.5) * 22).toFixed(2) + "deg) scale(1.03)";
      card.style.setProperty("--gx", (px * 100).toFixed(1) + "%");
      card.style.setProperty("--gy", (py * 100).toFixed(1) + "%");
      card._touchAt = performance.now();
    };
    card.addEventListener("pointermove", move);
    card.addEventListener("pointerdown", (e) => { move(e); vib(8); });
    const leave = () => { card.classList.remove("moving"); card.style.transform = ""; };
    card.addEventListener("pointerleave", leave);
    card.addEventListener("pointerup", () => setTimeout(leave, 250));
  });
  function tiltGyroTick() {
    if (!gyro.on) return;
    const now = performance.now();
    tilts.forEach((card) => {
      if (card._touchAt && now - card._touchAt < 1500) return;
      card.classList.add("gyro");
      card.style.transform = "rotateX(" + (-gyro.y * 12).toFixed(2) + "deg) rotateY(" + (gyro.x * 16).toFixed(2) + "deg)";
      card.style.setProperty("--gx", (50 + gyro.x * 50).toFixed(1) + "%");
      card.style.setProperty("--gy", (50 + gyro.y * 50).toFixed(1) + "%");
    });
  }
  views.touch = { applyQuality() {} };

  // Medalla 3D: el canto se arma con capas para que tenga grosor al girar
  const medal = $("#medal");
  medal.innerHTML = '<div class="face front">🔥<b>7</b></div><div class="face back">💜</div>';
  for (let i = -5; i <= 5; i++) {
    const ed = document.createElement("div");
    ed.className = "edge";
    ed.style.transform = "translateZ(" + i + "px)";
    ed.style.filter = "brightness(" + (0.85 + Math.abs(i) * 0.02) + ")";
    medal.insertBefore(ed, medal.firstChild);
  }
  const ach = $("#ach");
  $("#btn-ach").addEventListener("click", () => {
    ach.classList.remove("show"); void ach.offsetWidth; ach.classList.add("show");
    vib([20, 40, 20, 40, 80]);
    if (REDUCED) return;
    for (let i = 0; i < 28; i++) {
      const c = document.createElement("span");
      c.className = "coin";
      c.style.left = (Math.random() * 100) + "vw";
      c.style.setProperty("--d", (1.6 + Math.random() * 1.4).toFixed(2) + "s");
      c.style.setProperty("--w", (0.3 + Math.random() * 0.9).toFixed(2) + "s");
      c.style.setProperty("--dx", ((Math.random() - 0.5) * 120).toFixed(0) + "px");
      const s = 18 + Math.random() * 16;
      c.style.width = c.style.height = s + "px";
      document.body.appendChild(c);
      setTimeout(() => c.remove(), 3600);
    }
  });
  ach.addEventListener("click", () => ach.classList.remove("show"));

  // Transiciones entre pantallas
  let onFirst = true, animating = false;
  document.querySelectorAll("[data-fx]").forEach((b) => b.addEventListener("click", () => {
    if (animating) return;
    animating = true; vib(8);
    const from = onFirst ? $("#scr1") : $("#scr2"), to = onFirst ? $("#scr2") : $("#scr1");
    const dirS = onFirst ? 1 : -1;
    const fx = b.dataset.fx;
    const D = REDUCED ? 200 : 620, E = "cubic-bezier(.2,.8,.2,1)";
    let outK, inK;
    if (fx === "depth") {
      outK = [{ transform: "translateX(0) scale(1)", opacity: 1, filter: "brightness(1)" }, { transform: "translateX(" + (-30 * dirS) + "%) scale(.9)", opacity: 0.35, filter: "brightness(.6)" }];
      inK = [{ transform: "translateX(" + (100 * dirS) + "%) scale(1)", boxShadow: "0 0 0 rgba(0,0,0,0)" }, { transform: "translateX(0) scale(1)", boxShadow: "-20px 0 40px rgba(0,0,0,.5)" }];
    } else if (fx === "flip") {
      outK = [{ transform: "rotateY(0deg)", opacity: 1 }, { transform: "rotateY(" + (-90 * dirS) + "deg)", opacity: 0.6 }];
      inK = [{ transform: "rotateY(" + (90 * dirS) + "deg)", opacity: 0.6, offset: 0 }, { transform: "rotateY(" + (90 * dirS) + "deg)", opacity: 0.6, offset: 0.5 }, { transform: "rotateY(0deg)", opacity: 1 }];
    } else {
      outK = [{ transform: "scale(1)", opacity: 1 }, { transform: "scale(1.12)", opacity: 0 }];
      inK = [{ transform: "scale(.86)", opacity: 0 }, { transform: "scale(1)", opacity: 1 }];
    }
    to.classList.add("on"); to.style.zIndex = 2; from.style.zIndex = 1;
    from.animate(outK, { duration: D, easing: E, fill: "forwards" });
    const a = to.animate(inK, { duration: D, easing: E, fill: "forwards" });
    a.onfinish = () => {
      from.classList.remove("on");
      from.getAnimations().forEach((x) => x.cancel());
      to.getAnimations().forEach((x) => x.cancel());
      onFirst = !onFirst; animating = false;
    };
  }));

  /* ══════════ Arranque ══════════ */
  try { orb = new Orb(oc); } catch (e) { console.warn("[lab] orb:", e.message); $("#orb-nogl").style.display = "flex"; }
  try { breath = new Breath($("#breath-canvas")); } catch (e) { console.warn("[lab] respiración:", e.message); $("#breath-nogl").style.display = "flex"; }
  const techsEl = $("#techs");
  for (const k in TECHS) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "chip" + (k === "calma" ? " on" : ""); b.textContent = TECHS[k].label;
    b.addEventListener("click", () => {
      B.tech = k; B.running = false; B.i = 0; B.tp = 0; B.cycles = 0; B.done = 0;
      techsEl.querySelectorAll(".chip").forEach((c) => c.classList.toggle("on", c === b));
      $("#b-start").textContent = "Empezar"; $("#b-ph").textContent = "Respira conmigo"; $("#b-ct").textContent = "Toca «Empezar»"; $("#b-bar").style.width = "0%";
      vib(8);
    });
    techsEl.appendChild(b);
  }
  $("#b-start").addEventListener("click", startBreath);
  current = orb;
  if (orb) setTimeout(() => say("¡Hola! Soy Zyra 👋 Tócame", 3200), 1300);
  setTimeout(() => { const h = $("#orb-hint"); if (h) h.style.opacity = "0"; }, 9000);
  run();

  // Para las pruebas automáticas
  window.__zyraLab = { S, B, get orb() { return orb; }, get breath() { return breath; }, showTab, say };
})();
