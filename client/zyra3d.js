/* Zyra 3D: animaciones vivas en la app (WebGL puro, sin librerías).
   Zyra sigue siendo su avatar; esto le pone vida alrededor:
   - aura(host, opts): una esfera de luz líquida detrás de su foto. Respira, se mueve con
     su voz, crece con tu voz cuando te escucha, gira cuando piensa, toma el color de cómo
     te sientes y sigue la inclinación del celular (o el mouse en el computador).
   - breath(host, opts): la esfera de partículas del ejercicio de respiración.
   - medal(el, emoji) y coinRain(n): medalla 3D y lluvia de monedas para celebrar.
   - tilt(selector): tarjetas que se inclinan en 3D cuando las tocas.
   Fluidez: solo arranca con WebGL por hardware y sin "reducir movimiento" ni ahorro de
   datos; dibuja solo lo que está en pantalla; ajusta la calidad sola y, si aun así el
   celular va lento, se apaga y queda la versión de siempre. En Perfil se puede apagar. */
(function () {
  "use strict";
  if (window.Zyra3D) return;

  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
  const ease = (x) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(x, 0, 1));
  const hex = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
  // Solo después de que la persona ya tocó la página (si no, el navegador lo bloquea y avisa)
  const vib = (p) => { try { const ua = navigator.userActivation; if (navigator.vibrate && (!ua || ua.hasBeenActive)) navigator.vibrate(p); } catch (e) {} };
  const mq = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  const reduced = () => !!(mq && mq.matches);
  const isDark = () => document.documentElement.getAttribute("data-theme") === "dark";

  /* ══════════ ¿Se puede usar 3D en este equipo? ══════════ */
  function pref() { try { return localStorage.getItem("zyra_3d") || "auto"; } catch (e) { return "auto"; } }
  function setPref(v) {
    try { if (v === "auto") localStorage.removeItem("zyra_3d"); else localStorage.setItem("zyra_3d", v); } catch (e) {}
    try { sessionStorage.removeItem("zyra_3d_slow"); } catch (e) {}
    if (v === "off") destroyAll();
  }
  // "hw": con tarjeta gráfica. "soft": el navegador dibuja sin ella (p. ej. Chrome con la
  // "aceleración por hardware" apagada): se usa en modo ligero, a 30 cuadros por segundo.
  // "": no hay WebGL.
  let glMode = null;
  function detectGL() {
    if (glMode !== null) return glMode;
    const tryCtx = (caveat) => {
      try {
        const c = document.createElement("canvas");
        const gl = c.getContext("webgl", { failIfMajorPerformanceCaveat: caveat });
        const x = gl && gl.getExtension("WEBGL_lose_context");
        if (x) x.loseContext();
        return !!gl;
      } catch (e) { return false; }
    };
    glMode = tryCtx(true) ? "hw" : tryCtx(false) ? "soft" : "";
    return glMode;
  }
  // Por qué no hay 3D (para explicarlo en Perfil)
  function status() {
    const p = pref();
    if (p === "off") return { on: false, reason: "off" };
    if (p !== "force") {
      if (reduced()) return { on: false, reason: "reduced" };
      try { if (sessionStorage.getItem("zyra_3d_slow")) return { on: false, reason: "slow" }; } catch (e) {}
    }
    const g = detectGL();
    if (!g) return { on: false, reason: "nogl" };
    return { on: true, reason: g === "soft" ? "soft" : "" };
  }
  const enabled = () => status().on;
  // Medalla, monedas y tarjetas son CSS: no necesitan WebGL, solo que haya movimiento
  const motionOK = () => pref() !== "off" && !reduced();

  /* ══════════ GLSL ══════════ */
  const FPREC = "#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n";
  const VPREC = "precision highp float;\n";
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

  // Aura: esfera líquida. El ruido la hace respirar; la voz le saca ondas; pensar la hace girar.
  const AURA_VS = `
attribute vec3 aPos;
uniform mat4 uProj; uniform mat4 uView; uniform mat3 uRot;
uniform float uTime; uniform float uAmp; uniform float uFreq; uniform float uSpeed; uniform float uScale;
uniform float uTalk; uniform float uSwirl; uniform vec3 uPokeDir; uniform float uPokeAge;
varying vec3 vN; varying vec3 vW; varying vec3 vL; varying float vD;
float disp(vec3 p){
  float t = uTime * uSpeed;
  float a = uSwirl * (uTime * 1.4 + p.y * 1.2);
  float ca = cos(a), sa = sin(a);
  vec3 q = vec3(ca * p.x - sa * p.z, p.y, sa * p.x + ca * p.z);
  float n = snoise(q * uFreq + vec3(t, t * 0.7, -t * 0.5));
  n += 0.3 * snoise(q * uFreq * 1.9 + vec3(-t * 1.3, t, t * 0.4));
  float d = n * uAmp;
  float ang = acos(clamp(dot(p, uPokeDir), -1.0, 1.0));
  d += sin(ang * 10.0 - uPokeAge * 14.0) * exp(-uPokeAge * 2.4) * exp(-ang * 1.2) * 0.09;
  float lobes = sin(atan(p.y, p.x + 0.00001) * 5.0 - uTime * 6.0 + sin(uTime * 1.3) * 2.0);
  d += uTalk * (0.03 + 0.045 * lobes + 0.04 * snoise(p * 2.4 + vec3(0.0, 0.0, uTime * 3.2)));
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
  vec3 w = uRot * P0;
  vW = w; vN = uRot * n; vL = p; vD = d0;
  gl_Position = uProj * uView * vec4(w, 1.0);
}`;
  const AURA_FS = `
uniform vec3 uColA; uniform vec3 uColB; uniform vec3 uColC; uniform vec3 uCam;
uniform float uTime; uniform float uGlow; uniform float uAlpha;
varying vec3 vN; varying vec3 vW; varying vec3 vL; varying float vD;
void main(){
  vec3 N = normalize(vN);
  vec3 V = normalize(uCam - vW);
  float ndv = max(dot(N, V), 0.0);
  float fres = pow(1.0 - ndv, 2.6);
  vec3 L = normalize(vec3(-0.45, 0.75, 0.65));
  float wrapL = dot(N, L) * 0.5 + 0.5;
  vec3 H = normalize(L + V);
  float spec = pow(max(dot(N, H), 0.0), 50.0);
  vec3 q = normalize(vL);
  float g = clamp(q.y * 0.5 + 0.5 + vD * 2.2, 0.0, 1.0);
  vec3 base = mix(uColA, uColB, smoothstep(0.1, 0.9, g));
  vec3 irid = 0.5 + 0.5 * cos(6.28318 * (fres * 0.9 + vD * 3.0 + uTime * 0.05 + vec3(0.0, 0.33, 0.67)));
  vec3 col = base * (0.35 + 0.75 * wrapL);
  col += mix(uColB, irid, 0.5) * fres * (0.55 + 0.7 * uGlow);
  col += vec3(spec * 0.45);
  col += uColC * 0.1 * (1.0 + uGlow);
  col = clamp(col, 0.0, 1.0);
  float a = smoothstep(0.0, 0.07, ndv) * uAlpha;
  gl_FragColor = vec4(col * a, a);
}`;
  // Halo de luz suave alrededor de la esfera (se apaga antes del borde del lienzo)
  const QUAD_VS = "attribute vec2 aP; void main(){ gl_Position = vec4(aP, 0.0, 1.0); }";
  const HALO_FS = `
uniform vec2 uRes; uniform float uR; uniform vec3 uColA; uniform vec3 uColC; uniform float uGlow; uniform float uTime;
void main(){
  vec2 p = gl_FragCoord.xy - 0.5 * uRes;
  float hs = 0.5 * min(uRes.x, uRes.y);
  float d = length(p) / uR;
  float ang = atan(p.y, p.x + 0.0001);
  float wob = 0.05 * sin(ang * 3.0 + uTime * 0.7) + 0.04 * sin(ang * 5.0 - uTime * 1.1);
  float h = exp(-pow(max(d - 0.9 - wob, 0.0), 2.0) * 4.0);
  h *= 1.0 - smoothstep(0.78, 1.0, length(p) / hs);
  float a = h * (0.16 + 0.3 * uGlow);
  vec3 col = mix(uColA, uColC, 0.55 + 0.25 * sin(ang * 2.0 + uTime * 0.4));
  gl_FragColor = vec4(col * a, a);
}`;
  // Chispas que orbitan a su alrededor (las de atrás las tapa la esfera)
  const SPARK_VS = `
attribute vec4 aS;
uniform mat4 uProj; uniform mat4 uView; uniform mat3 uRot;
uniform float uTime; uniform float uPhase; uniform float uScale; uniform float uSize; uniform float uPull; uniform float uPulse;
varying float vA;
void main(){
  float ang = aS.x * 6.28318 + uPhase * (0.25 + aS.z * 0.5);
  float rad = uScale * (mix(1.16, 1.5, aS.y) - uPull * 0.1 + uPulse * 0.1 * aS.y);
  float inc = (aS.w - 0.5) * 1.8;
  vec3 p = vec3(cos(ang) * rad, sin(ang) * rad * cos(inc), sin(ang) * rad * sin(inc));
  vec4 v = uView * vec4(uRot * p, 1.0);
  gl_Position = uProj * v;
  float tw = 0.5 + 0.5 * sin(uTime * (1.5 + aS.z * 3.0) + aS.x * 40.0);
  gl_PointSize = uSize * (0.55 + aS.y * 0.7) * (0.6 + 0.6 * tw) / max(-v.z, 0.5);
  vA = 0.25 + 0.75 * tw;
}`;
  const SPARK_FS = `
uniform vec3 uCol; uniform float uAlpha;
varying float vA;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  float a = 1.0 - smoothstep(0.0, 0.5, d);
  a *= a;
  float core = 1.0 - smoothstep(0.0, 0.14, d);
  vec3 col = mix(uCol, vec3(1.0), core);
  a *= vA * uAlpha;
  gl_FragColor = vec4(col * a, a);
}`;
  // Respiración: miles de partículas en una esfera que se infla y se suelta
  const BP_VS = `
attribute vec3 aDir; attribute vec2 aSeed;
uniform mat4 uProj; uniform mat4 uView; uniform mat3 uRot;
uniform float uTime; uniform float uLevel; uniform float uRelease; uniform float uSize; uniform float uHold;
varying float vA; varying float vMix;
void main(){
  vec3 d = aDir;
  float n = snoise(d * 1.7 + vec3(uTime * 0.15));
  float r = mix(0.45, 1.12, uLevel) * (0.82 + 0.36 * aSeed.x) + n * 0.09 * (0.6 + uLevel);
  r += uHold * 0.025 * sin(uTime * 5.0 + aSeed.x * 20.0);
  r += uRelease * aSeed.y * aSeed.y * 0.7;
  vec4 v = uView * vec4(uRot * (d * r), 1.0);
  gl_Position = uProj * v;
  gl_PointSize = uSize * (0.55 + aSeed.x) * (1.0 + n * 0.35) / max(-v.z, 0.5);
  vA = (0.35 + 0.65 * aSeed.y) * (1.0 - uRelease * aSeed.y * 0.75);
  vMix = d.y * 0.5 + 0.5 + n * 0.3;
}`;
  const BP_FS = `
uniform vec3 uColA; uniform vec3 uColB; uniform float uAlpha;
varying float vA; varying float vMix;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float a = 1.0 - smoothstep(0.0, 0.5, length(c));
  a *= a;
  vec3 col = mix(uColA, uColB, clamp(vMix, 0.0, 1.0));
  a *= vA * uAlpha;
  gl_FragColor = vec4(col * a, a);
}`;

  /* ══════════ Ayudas de WebGL ══════════ */
  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) throw new Error(gl.getShaderInfoLog(s) || "shader");
    return s;
  }
  function program(gl, vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error(gl.getProgramInfoLog(p) || "link");
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) || 0;
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name.replace("[0]", "")] = gl.getUniformLocation(p, info.name); }
    return { p, u };
  }
  function buffer(gl, data, target) {
    const b = gl.createBuffer();
    gl.bindBuffer(target || gl.ARRAY_BUFFER, b);
    gl.bufferData(target || gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return b;
  }
  function attrib(gl, buf, loc, size) {
    if (loc < 0) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
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
  const ICO = {};
  function icosphere(level) {
    if (ICO[level]) return ICO[level];
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
    return (ICO[level] = { pos: new Float32Array(v.flat()), idx: new Uint16Array(f.flat()) });
  }

  /* ══════════ Entradas compartidas: inclinación del celular y mouse ══════════ */
  const tilt = { x: 0, y: 0, on: false, at: 0, b0: null, g0: null };
  const mouse = { x: 0, y: 0, at: -1e9 };
  function onOri(e) {
    if (e.beta == null || e.gamma == null) return;
    if (tilt.b0 === null) { tilt.b0 = e.beta; tilt.g0 = e.gamma; }
    // El punto neutro sigue despacio la forma en que sostienes el celular
    tilt.b0 += (e.beta - tilt.b0) * 0.006;
    tilt.g0 += (e.gamma - tilt.g0) * 0.006;
    tilt.x = clamp((e.gamma - tilt.g0) / 20, -1, 1);
    tilt.y = clamp((e.beta - tilt.b0) / 20, -1, 1);
    tilt.on = true; tilt.at = performance.now();
  }
  let inputsOn = false;
  function listenInputs() {
    if (inputsOn) return;
    inputsOn = true;
    if (window.DeviceOrientationEvent) window.addEventListener("deviceorientation", onOri, { passive: true });
    window.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse") return;
      mouse.x = e.clientX; mouse.y = e.clientY; mouse.at = performance.now();
    }, { passive: true });
    window.addEventListener("scroll", () => { for (const v of live) v.rect = null; }, { passive: true, capture: true });
  }

  /* ══════════ Un solo bucle de animación para todo ══════════ */
  const live = new Set();
  let raf = 0, last = 0;
  function frame(now) {
    raf = 0;
    const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000 || 0.016));
    last = now;
    let any = false;
    for (const v of Array.from(live)) {
      if (!v.host.isConnected) { v.destroy(); continue; }
      if (!v.visible) continue;
      any = true;
      // Modo ligero: dibuja un cuadro sí y uno no (~30 por segundo) y guarda el tiempo
      if (v.minGap && now - v.lastT < v.minGap) { v.pend += dt; continue; }
      const d = Math.min(0.1, dt + v.pend);
      v.pend = 0; v.lastT = now;
      try { v.tick(d, now); } catch (e) { try { console.warn("Zyra3D:", e && e.message); } catch (_) {} v.destroy(); }
    }
    if (any && !document.hidden) raf = requestAnimationFrame(frame);
  }
  function kick() {
    if (!raf && !document.hidden && live.size) { last = performance.now(); raf = requestAnimationFrame(frame); }
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { if (raf) cancelAnimationFrame(raf); raf = 0; } else kick();
  });
  window.addEventListener("resize", () => { for (const v of live) { v.dirty = true; v.rect = null; } });
  function sweep() { for (const v of Array.from(live)) if (!v.host.isConnected) v.destroy(); }
  function destroyAll() { for (const v of Array.from(live)) v.destroy(); }
  function slowDevice() {
    try { sessionStorage.setItem("zyra_3d_slow", "1"); } catch (e) {}
    destroyAll();
  }
  // Solo se dibuja lo que está en pantalla (una página oculta no gasta batería)
  const io = "IntersectionObserver" in window ? new IntersectionObserver((ents) => {
    for (const e of ents) {
      const v = e.target._z3d;
      if (!v || v.dead) continue;
      const was = v.visible;
      v.visible = e.isIntersecting;
      if (v.visible && !was) { v.dirty = true; v.rect = null; v.perf.warmUntil = performance.now() + 800; if (v.onShow) v.onShow(); kick(); }
    }
  }, { rootMargin: "80px" }) : null;

  class GLView {
    constructor(host, opts) {
      if (host._z3d) host._z3d.destroy();
      this.host = host;
      this.opts = opts || {};
      this.visible = !io;
      this.dirty = true;
      this.dead = false;
      this.rect = null;
      this.soft = detectGL() === "soft";
      const c = this.c = document.createElement("canvas");
      c.className = "z3d-canvas";
      c.setAttribute("aria-hidden", "true");
      // Sin tarjeta gráfica el suavizado de bordes cuesta mucho: en modo ligero se omite
      const gl = this.gl = c.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: !this.soft, depth: true, stencil: false, powerPreference: "default", failIfMajorPerformanceCaveat: !this.soft });
      if (!gl) throw new Error("sin WebGL");
      host.insertBefore(c, host.firstChild);
      c.addEventListener("webglcontextlost", (e) => { e.preventDefault(); this.destroy(); });
      this.dpr = Math.min(window.devicePixelRatio || 1, 3);
      this.maxScale = Math.min(this.dpr, this.soft ? 1.25 : (this.opts.maxScale || 2));
      this.minScale = Math.min(this.maxScale, this.soft ? 0.6 : Math.max(0.75, this.dpr * 0.4));
      this.scale = this.maxScale;
      this.target = this.soft ? 30 : 60; // cuadros por segundo esperados
      this.minGap = this.soft ? 29 : 0;
      this.lastT = 0; this.pend = 0;
      this.perf = { t0: null, n: 0, lastNow: 0, warmUntil: performance.now() + 1500, slow: 0, good: 0 };
      this.fps = 0;
      host._z3d = this;
      host.classList.add("z3d-on");
      live.add(this);
      listenInputs();
      if (io) io.observe(host);
    }
    sizeCanvas(cssW, cssH) {
      const c = this.c;
      if (this.cssW !== cssW || this.cssH !== cssH) {
        c.style.width = cssW + "px"; c.style.height = cssH + "px";
        this.cssW = cssW; this.cssH = cssH;
      }
      const w = Math.max(1, Math.round(cssW * this.scale)), h = Math.max(1, Math.round(cssH * this.scale));
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    }
    // Mide la fluidez real; si cae, baja la resolución; si igual no alcanza, apaga el 3D
    perfTick(now) {
      const p = this.perf;
      if (p.t0 === null || now - p.lastNow > 1000) { p.t0 = now; p.n = 0; }
      p.lastNow = now;
      if (now < p.warmUntil) { p.t0 = now; p.n = 0; return; }
      p.n++;
      const el = now - p.t0;
      if (el < 1000) return;
      const fps = p.n * 1000 / el;
      p.t0 = now; p.n = 0;
      this.fps = fps;
      const T = this.target;
      if (fps < T * 0.77) {
        p.good = 0;
        if (this.scale > this.minScale + 0.01) { this.scale = Math.max(this.minScale, this.scale - 0.25); this.dirty = true; }
        else if (!(this.lighter && this.lighter()) && fps < T * 0.4 && ++p.slow >= 3) slowDevice();
      } else {
        p.slow = Math.max(0, p.slow - 1);
        if (fps > T * 0.95 && ++p.good >= 4 && this.scale < this.maxScale) { p.good = 0; this.scale = Math.min(this.maxScale, this.scale + 0.15); this.dirty = true; }
      }
    }
    destroy() {
      if (this.dead) return;
      this.dead = true;
      live.delete(this);
      if (io) io.unobserve(this.host);
      try { const x = this.gl && !this.gl.isContextLost() && this.gl.getExtension("WEBGL_lose_context"); if (x) x.loseContext(); } catch (e) {}
      if (this.c) this.c.remove();
      this.host.classList.remove("z3d-on");
      if (this.host._z3d === this) delete this.host._z3d;
    }
  }

  /* ══════════ Aura de Zyra ══════════ */
  // Colores y "carácter" del aura. Si la persona está ansiosa o enojada, Zyra no se pone
  // igual: se queda en calma (lenta y fresca) para acompañarla a bajar.
  const MOODS = {
    zyra:    { a: "#7b5cff", b: "#4a9eff", c: "#c4a8ff", amp: 0.05,  freq: 1.2,  speed: 0.3 },
    calma:   { a: "#2f78ff", b: "#3fe0d0", c: "#9fd8ff", amp: 0.038, freq: 1.05, speed: 0.2 },
    feliz:   { a: "#ff8a3d", b: "#ff4f9a", c: "#ffd36b", amp: 0.058, freq: 1.35, speed: 0.48 },
    suave:   { a: "#4b56c8", b: "#9a7bff", c: "#b9c6ff", amp: 0.035, freq: 0.95, speed: 0.16 },
    energia: { a: "#8f3dff", b: "#18d6f0", c: "#e08bff", amp: 0.062, freq: 1.5,  speed: 0.7 },
  };
  for (const k in MOODS) { const m = MOODS[k]; m.A = hex(m.a); m.B = hex(m.b); m.C = hex(m.c); }
  const EMO_MOOD = { feliz: "feliz", tranquilo: "calma", ansioso: "calma", enojado: "calma", estresado: "calma", triste: "suave", agotado: "suave", nostalgico: "suave", motivado: "energia", esperanzado: "energia", confundido: "zyra" };
  const moodFor = (emotion) => EMO_MOOD[emotion] || "zyra";

  class Aura extends GLView {
    constructor(host, opts) {
      super(host, opts);
      const gl = this.gl, o = this.opts;
      this.sph = program(gl, VPREC + NOISE + AURA_VS, FPREC + AURA_FS);
      this.halo = program(gl, QUAD_VS, FPREC + HALO_FS);
      this.spk = program(gl, VPREC + SPARK_VS, FPREC + SPARK_FS);
      this.aPos = gl.getAttribLocation(this.sph.p, "aPos");
      this.aP = gl.getAttribLocation(this.halo.p, "aP");
      this.aS = gl.getAttribLocation(this.spk.p, "aS");
      this.tri = buffer(gl, new Float32Array([-1, -1, 3, -1, -1, 3]));
      this.vbo = gl.createBuffer();
      this.ibo = gl.createBuffer();
      this.setDetail(o.small || this.soft ? 3 : 4);
      this.setSparks(this.soft ? (o.small ? 6 : 14) : (o.small ? 10 : 26));
      this.portrait = o.portrait || null;
      const m = MOODS.zyra;
      this.S = {
        t: Math.random() * 50, awake: 0, target: m, moodT: 0,
        A: m.A.slice(), B: m.B.slice(), C: m.C.slice(), amp: m.amp, freq: m.freq, speed: m.speed,
        st: "idle", lvl: undefined, sigT: 0, think: 0, speak: 0, listen: 0, talk: 0, mic: 0, kick: 0,
        gx: 0, gy: 0, wx: 0, wy: 0, wanderAt: 0, pokeDir: [0, 0, 1], pokeAge: 99, phase: 0,
      };
      this.rot = rotYX(0, 0);
      this.onDown = (e) => this.poke(e);
      (o.pokeEl || host).addEventListener("pointerdown", this.onDown, { passive: true });
      if (this.portrait) this.portrait.style.willChange = "transform";
    }
    setDetail(level) {
      const gl = this.gl, s = icosphere(level);
      this.detail = level;
      this.count = s.idx.length;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
      gl.bufferData(gl.ARRAY_BUFFER, s.pos, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, s.idx, gl.STATIC_DRAW);
    }
    setSparks(n) {
      const gl = this.gl, s = new Float32Array(n * 4);
      for (let i = 0; i < s.length; i++) s[i] = Math.random();
      if (this.sbo) gl.deleteBuffer(this.sbo);
      this.sbo = buffer(gl, s);
      this.nSpk = n;
    }
    lighter() {
      if (this.detail > 3) { this.setDetail(3); return true; }
      if (this.nSpk > 8) { this.setSparks(8); return true; }
      return false;
    }
    setMood(key) { this.S.target = MOODS[key] || MOODS[moodFor(key)] || MOODS.zyra; }
    kick(v) { this.S.kick = Math.min(1, this.S.kick + (v || 0.3)); kick(); }
    onShow() { this.S.awake = Math.min(this.S.awake, 0.45); }
    // Tocarla: una onda sale desde donde tocaste y su foto rebota
    poke(e) {
      const r = this.host.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2 || 1);
      const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2 || 1);
      const l = Math.hypot(dx, dy, 0.7) || 1;
      const wx = dx / l, wy = -dy / l, wz = 0.7 / l, m = this.rot;
      // A coordenadas de la esfera (la inversa de una rotación es su transpuesta)
      const lx = m[0] * wx + m[1] * wy + m[2] * wz, ly = m[3] * wx + m[4] * wy + m[5] * wz, lz = m[6] * wx + m[7] * wy + m[8] * wz;
      const ll = Math.hypot(lx, ly, lz) || 1;
      this.S.pokeDir = [lx / ll, ly / ll, lz / ll];
      this.S.pokeAge = 0;
      vib(10);
      kick();
    }
    layout() {
      this.dirty = false;
      const hw = this.host.offsetWidth, hh = this.host.offsetHeight;
      if (!hw || !hh) { this.dirty = true; return false; }
      const css = Math.round(Math.max(hw, hh) * (this.opts.size || 1.6));
      this.sizeCanvas(css, css);
      const pr = this.portrait ? Math.min(this.portrait.offsetWidth, this.portrait.offsetHeight) / 2 : hw * 0.42;
      this.pk = clamp(pr / 120, 0.1, 2);
      this.f = clamp((pr / (css / 2)) * (this.opts.rim || 1.06), 0.2, 0.9);
      const fov = 30 * Math.PI / 180, tan = Math.tan(fov / 2);
      this.dist = 1 / (this.f * tan);
      this.proj = perspective(fov, 1, 0.1, 100);
      this.view = viewAt(this.dist);
      this.rect = null;
      return true;
    }
    tick(dt, now) {
      if (this.dirty && !this.layout()) return;
      const S = this.S, o = this.opts;
      S.t += dt;
      if (o.signal) {
        S.sigT -= dt;
        if (S.sigT <= 0) {
          S.sigT = o.signalHz ? 1 / o.signalHz : 0;
          let s = null;
          try { s = o.signal(); } catch (e) {}
          s = s || {};
          S.st = s.state || "idle";
          S.lvl = s.level;
        }
      }
      if (o.mood && (S.moodT -= dt) <= 0) { S.moodT = 2; try { this.setMood(o.mood()); } catch (e) {} }
      const st = S.st, T = S.target;
      for (let i = 0; i < 3; i++) { S.A[i] = damp(S.A[i], T.A[i], 2, dt); S.B[i] = damp(S.B[i], T.B[i], 2, dt); S.C[i] = damp(S.C[i], T.C[i], 2, dt); }
      S.amp = damp(S.amp, T.amp, 2, dt); S.freq = damp(S.freq, T.freq, 2, dt); S.speed = damp(S.speed, T.speed, 2, dt);
      S.think = damp(S.think, st === "thinking" ? 1 : 0, 3, dt);
      S.speak = damp(S.speak, st === "speaking" ? 1 : 0, 5, dt);
      S.listen = damp(S.listen, st === "listening" ? 1 : 0, 4, dt);
      // Voz: si hay nivel real se usa; si no, un ritmo de sílabas con pausas naturales
      let talkT = 0;
      if (st === "speaking") {
        if (typeof S.lvl === "number") talkT = clamp(S.lvl, 0, 1);
        else {
          const t = S.t;
          const syl = 0.5 + 0.5 * Math.sin(t * 22.6 + Math.sin(t * 1.7) * 2.2);
          const gate = clamp(0.55 + 0.6 * Math.sin(t * 0.9 + Math.sin(t * 0.37) * 3), 0, 1);
          talkT = clamp(syl * gate * 1.15, 0, 1);
        }
      }
      S.talk = damp(S.talk, clamp(talkT + S.kick * 0.6, 0, 1), 14, dt);
      S.mic = damp(S.mic, st === "listening" && typeof S.lvl === "number" ? clamp(S.lvl, 0, 1) : 0, 12, dt);
      S.kick = damp(S.kick, 0, 4, dt);
      S.pokeAge += dt;
      S.awake = Math.min(1, S.awake + dt * 0.8);
      const aw = S.awake, wake = aw < 1 ? 1 - Math.pow(1 - aw, 3) * Math.cos(aw * 8) : 1;
      // Mirada: inclinación del celular, el mouse o su propia curiosidad
      let tx, ty;
      if (tilt.on && now - tilt.at < 2500) { tx = tilt.x; ty = tilt.y; }
      else if (now - mouse.at < 3000) {
        if (!this.rect || now - (this.rectAt || 0) > 1000) { this.rect = this.host.getBoundingClientRect(); this.rectAt = now; }
        const r = this.rect;
        tx = clamp((mouse.x - (r.left + r.width / 2)) / 420, -1, 1);
        ty = clamp((mouse.y - (r.top + r.height / 2)) / 420, -1, 1);
      } else {
        if (S.t > S.wanderAt) { S.wx = (Math.random() * 2 - 1) * 0.45; S.wy = (Math.random() * 2 - 1) * 0.3; S.wanderAt = S.t + 2.5 + Math.random() * 3.5; }
        tx = S.wx; ty = S.wy;
      }
      S.gx = damp(S.gx, tx, 3.5, dt);
      S.gy = damp(S.gy, ty, 3.5, dt);
      this.rot = rotYX(S.gx * 0.5, S.gy * 0.4);
      const br = Math.sin(S.t * 2 * Math.PI * 0.17);
      S.phase += dt * (0.6 + S.think * 2.2 + S.speak * 0.6);
      const scale = (1 + br * 0.018 + S.mic * 0.08 + S.talk * 0.035 + S.listen * 0.02 - S.think * 0.01) * (0.55 + 0.45 * wake);
      const pokeGlow = S.pokeAge < 2 ? Math.exp(-S.pokeAge * 3) * 0.6 : 0;
      const glow = 0.35 + S.mic * 0.6 + S.talk * 0.45 + S.think * (0.3 + 0.25 * Math.sin(S.t * 5)) + S.listen * 0.15 + pokeGlow;
      const amp = S.amp + S.mic * 0.07 + S.think * 0.012;
      const speed = S.speed * (1 + S.think * 1.6 + S.speak * 0.5);
      this.render(scale, glow, amp, speed, wake);
      this.perfTick(now);
      // Su foto también vive: respira, asiente al hablar, se acerca al escucharte y se inclina contigo
      if (this.portrait) {
        const pa = S.pokeAge, bounce = pa < 1.6 ? Math.exp(-pa * 5) * Math.sin(pa * 22) * 0.06 : 0;
        const sc = 1 + br * 0.01 + S.listen * 0.02 + S.mic * 0.03 + S.talk * 0.012 + bounce;
        const rx = -S.gy * 10 + S.talk * 3.2 * Math.sin(S.t * 7.3);
        const ry = S.gx * 13;
        const rz = S.think * 3 * Math.sin(S.t * 1.6);
        const y = (Math.sin(S.t * 0.9) * 1.6 - S.talk * 1.4) * this.pk;
        this.portrait.style.transform = "perspective(" + Math.round(700 * this.pk + 200) + "px) translate3d(0," + y.toFixed(2) + "px,0) rotateX(" + rx.toFixed(2) + "deg) rotateY(" + ry.toFixed(2) + "deg) rotateZ(" + rz.toFixed(2) + "deg) scale(" + sc.toFixed(4) + ")";
      }
    }
    render(scale, glow, amp, speed, wake) {
      const gl = this.gl, S = this.S;
      gl.viewport(0, 0, this.c.width, this.c.height);
      gl.clearColor(0, 0, 0, 0);
      gl.depthMask(true);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      // Halo
      gl.disable(gl.DEPTH_TEST);
      gl.useProgram(this.halo.p);
      let u = this.halo.u;
      gl.uniform2f(u.uRes, this.c.width, this.c.height);
      gl.uniform1f(u.uR, this.f * scale * this.c.height / 2);
      gl.uniform3fv(u.uColA, S.A); gl.uniform3fv(u.uColC, S.C);
      gl.uniform1f(u.uGlow, glow * wake);
      gl.uniform1f(u.uTime, S.t);
      attrib(gl, this.tri, this.aP, 2);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (this.aP >= 0) gl.disableVertexAttribArray(this.aP);
      // Esfera
      gl.enable(gl.DEPTH_TEST);
      gl.useProgram(this.sph.p);
      u = this.sph.u;
      gl.uniformMatrix4fv(u.uProj, false, this.proj);
      gl.uniformMatrix4fv(u.uView, false, this.view);
      gl.uniformMatrix3fv(u.uRot, false, this.rot);
      gl.uniform3f(u.uCam, 0, 0, this.dist);
      gl.uniform1f(u.uTime, S.t);
      gl.uniform1f(u.uAmp, amp);
      gl.uniform1f(u.uFreq, S.freq);
      gl.uniform1f(u.uSpeed, speed);
      gl.uniform1f(u.uScale, scale);
      gl.uniform1f(u.uTalk, S.talk);
      gl.uniform1f(u.uSwirl, S.think);
      gl.uniform3fv(u.uPokeDir, S.pokeDir);
      gl.uniform1f(u.uPokeAge, S.pokeAge);
      gl.uniform3fv(u.uColA, S.A); gl.uniform3fv(u.uColB, S.B); gl.uniform3fv(u.uColC, S.C);
      gl.uniform1f(u.uGlow, glow);
      gl.uniform1f(u.uAlpha, clamp(wake * 1.4, 0, 1));
      attrib(gl, this.vbo, this.aPos, 3);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
      gl.drawElements(gl.TRIANGLES, this.count, gl.UNSIGNED_SHORT, 0);
      if (this.aPos >= 0) gl.disableVertexAttribArray(this.aPos);
      // Chispas
      gl.depthMask(false);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(this.spk.p);
      u = this.spk.u;
      gl.uniformMatrix4fv(u.uProj, false, this.proj);
      gl.uniformMatrix4fv(u.uView, false, this.view);
      gl.uniformMatrix3fv(u.uRot, false, this.rot);
      gl.uniform1f(u.uTime, S.t);
      gl.uniform1f(u.uPhase, S.phase);
      gl.uniform1f(u.uScale, scale);
      gl.uniform1f(u.uSize, (this.opts.small ? 2.6 : 5.5) * this.scale * this.dist);
      gl.uniform1f(u.uPull, S.mic);
      gl.uniform1f(u.uPulse, S.talk);
      gl.uniform3fv(u.uCol, S.C);
      gl.uniform1f(u.uAlpha, wake);
      attrib(gl, this.sbo, this.aS, 4);
      gl.drawArrays(gl.POINTS, 0, this.nSpk);
      if (this.aS >= 0) gl.disableVertexAttribArray(this.aS);
      gl.depthMask(true);
    }
    destroy() {
      if (this.dead) return;
      super.destroy();
      if (this.onDown) (this.opts.pokeEl || this.host).removeEventListener("pointerdown", this.onDown);
      if (this.portrait) { this.portrait.style.transform = ""; this.portrait.style.willChange = ""; }
    }
  }

  /* ══════════ Respiración en 3D ══════════ */
  const PALS = {
    dark:  { inA: hex("#5b8cff"), inB: hex("#7cf3ff"), outA: hex("#8b5cf6"), outB: hex("#ff7ac8"), gold: hex("#ffd36b") },
    light: { inA: hex("#3b5bdb"), inB: hex("#0891b2"), outA: hex("#7c3aed"), outB: hex("#db2777"), gold: hex("#f59e0b") },
  };
  class BreathView extends GLView {
    constructor(host, opts) {
      super(host, opts);
      const gl = this.gl;
      this.pts = program(gl, VPREC + NOISE + BP_VS, FPREC + BP_FS);
      this.aDir = gl.getAttribLocation(this.pts.p, "aDir");
      this.aSeed = gl.getAttribLocation(this.pts.p, "aSeed");
      const hc = navigator.hardwareConcurrency || 4;
      this.setCount(this.soft ? 1500 : hc <= 4 ? 2600 : 4200);
      const P = isDark() ? PALS.dark : PALS.light;
      this.B = { t: Math.random() * 20, level: 0.3, from: 0.3, to: 0.3, dur: 1, tp: 0, kind: "idle", running: false, release: 0, flash: 0, hold: 0, yaw: 0, gx: 0, gy: 0, A: P.outA.slice(), C: P.outB.slice() };
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
      if (this.bDir) { gl.deleteBuffer(this.bDir); gl.deleteBuffer(this.bSeed); }
      this.bDir = buffer(gl, dir);
      this.bSeed = buffer(gl, seed);
    }
    lighter() { if (this.n > 1400) { this.setCount(Math.round(this.n * 0.6)); return true; } return false; }
    // kind: "inhale" | "exhale" | lo demás es sostener (Mantén / Pausa)
    phase(kind, secs) {
      const B = this.B;
      B.kind = kind === "inhale" || kind === "exhale" ? kind : "hold";
      B.from = B.level; B.tp = 0; B.dur = Math.max(0.5, secs || 4);
      B.to = B.kind === "inhale" ? 1 : B.kind === "exhale" ? 0.1 : B.level;
      B.running = true;
      kick();
    }
    idle() { this.B.running = false; this.B.kind = "idle"; }
    finish() { const B = this.B; B.running = false; B.kind = "idle"; B.flash = 1; B.release = 1; kick(); }
    layout() {
      this.dirty = false;
      const hw = this.host.offsetWidth, hh = this.host.offsetHeight;
      if (!hw || !hh) { this.dirty = true; return false; }
      const css = Math.round(Math.min(this.opts.px || 300, hw));
      this.sizeCanvas(css, css);
      const fov = 40 * Math.PI / 180, tan = Math.tan(fov / 2);
      this.dist = 1.12 / (0.72 * tan);
      this.proj = perspective(fov, 1, 0.1, 100);
      this.view = viewAt(this.dist);
      return true;
    }
    tick(dt, now) {
      if (this.dirty && !this.layout()) return;
      const B = this.B;
      B.t += dt;
      B.yaw += dt * 0.12;
      if (B.running) {
        B.tp += dt;
        const p = clamp(B.tp / B.dur, 0, 1);
        B.level = lerp(B.from, B.to, ease(p));
        B.release = B.kind === "exhale" ? ease(p) * 0.8 : damp(B.release, 0, 3, dt);
      } else {
        B.level = damp(B.level, 0.32 + 0.05 * Math.sin(B.t * 0.9), 1.6, dt);
        B.release = damp(B.release, 0, 1.4, dt);
      }
      B.hold = damp(B.hold, B.running && B.kind === "hold" ? 1 : 0, 3, dt);
      B.flash = damp(B.flash, 0, 1.1, dt);
      const P = isDark() ? PALS.dark : PALS.light;
      const inh = B.kind === "inhale" || (B.kind === "hold" && B.level > 0.5);
      for (let i = 0; i < 3; i++) {
        const ta = lerp(inh ? P.inA[i] : P.outA[i], P.gold[i], B.flash), tc = lerp(inh ? P.inB[i] : P.outB[i], P.gold[i], B.flash * 0.7);
        B.A[i] = damp(B.A[i], ta, 1.5, dt);
        B.C[i] = damp(B.C[i], tc, 1.5, dt);
      }
      if (tilt.on && now - tilt.at < 2500) { B.gx = damp(B.gx, tilt.x, 3, dt); B.gy = damp(B.gy, tilt.y, 3, dt); }
      else { B.gx = damp(B.gx, 0, 1.5, dt); B.gy = damp(B.gy, 0, 1.5, dt); }
      this.render(P === PALS.dark);
      this.perfTick(now);
    }
    render(dark) {
      const gl = this.gl, B = this.B;
      gl.viewport(0, 0, this.c.width, this.c.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      // De noche las partículas brillan donde se juntan; de día se ven como tinta de color
      if (dark) gl.blendFunc(gl.ONE, gl.ONE); else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(this.pts.p);
      const u = this.pts.u;
      gl.uniformMatrix4fv(u.uProj, false, this.proj);
      gl.uniformMatrix4fv(u.uView, false, this.view);
      gl.uniformMatrix3fv(u.uRot, false, rotYX(B.yaw + B.gx * 0.4, 0.35 + B.gy * 0.3));
      gl.uniform1f(u.uTime, B.t);
      gl.uniform1f(u.uLevel, B.level);
      gl.uniform1f(u.uRelease, B.release);
      gl.uniform1f(u.uHold, B.hold);
      gl.uniform1f(u.uSize, 7.5 * this.scale * this.dist);
      gl.uniform3fv(u.uColA, B.A); gl.uniform3fv(u.uColB, B.C);
      gl.uniform1f(u.uAlpha, dark ? 1 : 0.8);
      attrib(gl, this.bDir, this.aDir, 3);
      attrib(gl, this.bSeed, this.aSeed, 2);
      gl.drawArrays(gl.POINTS, 0, this.n);
      if (this.aDir >= 0) gl.disableVertexAttribArray(this.aDir);
      if (this.aSeed >= 0) gl.disableVertexAttribArray(this.aSeed);
    }
  }

  function make(Cls, host, opts) {
    if (!host || !enabled()) return null;
    injectCSS();
    if (host._z3d && !host._z3d.dead && host._z3d instanceof Cls) return host._z3d;
    let v = null;
    try { v = new Cls(host, opts); } catch (e) {
      if (host._z3d && !host._z3d.dead) host._z3d.destroy();
      return null;
    }
    kick();
    return v;
  }

  /* ══════════ Celebrar: medalla 3D y lluvia de monedas (CSS) ══════════ */
  function medal(el, emoji) {
    if (!el || !motionOK()) return false;
    injectCSS();
    el.classList.add("z3d-medal-wrap");
    const m = document.createElement("div");
    m.className = "z3d-medal";
    let edges = "";
    // El canto se arma con capas para que tenga grosor al girar
    for (let i = -5; i <= 5; i++) edges += '<div class="e" style="transform:translateZ(' + i + "px);filter:brightness(" + (0.85 + Math.abs(i) * 0.02).toFixed(2) + ')"></div>';
    m.innerHTML = edges + '<div class="f fr"></div><div class="f bk">💜</div>';
    m.querySelector(".fr").textContent = emoji || "🏅";
    el.textContent = "";
    el.appendChild(m);
    m.addEventListener("click", () => { m.classList.remove("spin"); void m.offsetWidth; m.classList.add("spin"); vib(12); });
    return true;
  }
  function coinRain(n, delayMs) {
    if (!motionOK()) return;
    injectCSS();
    const wait = (delayMs || 0) / 1000;
    n = Math.min(n || 24, 40);
    for (let i = 0; i < n; i++) {
      const c = document.createElement("span");
      c.className = "z3d-coin-fall";
      c.setAttribute("aria-hidden", "true");
      c.style.left = (Math.random() * 96).toFixed(1) + "vw";
      c.style.setProperty("--d", (1.6 + Math.random() * 1.4).toFixed(2) + "s");
      c.style.setProperty("--w", (wait + Math.random() * 0.9).toFixed(2) + "s");
      c.style.setProperty("--dx", ((Math.random() - 0.5) * 120).toFixed(0) + "px");
      const s = 16 + Math.random() * 14;
      c.style.width = c.style.height = s.toFixed(0) + "px";
      document.body.appendChild(c);
      setTimeout(() => c.remove(), 4400 + (delayMs || 0));
    }
  }

  /* ══════════ Tarjetas que se inclinan al tocarlas ══════════ */
  let tiltSel = "";
  function tiltCards(sel) {
    if (!sel) return;
    tiltSel = tiltSel ? tiltSel + "," + sel : sel;
    if (tiltCards.on) return;
    tiltCards.on = true;
    injectCSS();
    let cur = null, pid = null, hover = null;
    const find = (e) => (e.target && e.target.closest ? e.target.closest(tiltSel) : null);
    const set = (el, e, pressed) => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const px = clamp((e.clientX - r.left) / r.width, 0, 1), py = clamp((e.clientY - r.top) / r.height, 0, 1);
      const k = r.width > 420 ? 0.45 : 1; // las tarjetas anchas se inclinan menos
      el.classList.add("z3d-tilting");
      el.classList.remove("z3d-tilt-back");
      el.style.setProperty("transform", "perspective(800px) rotateX(" + ((0.5 - py) * 12 * k).toFixed(2) + "deg) rotateY(" + ((px - 0.5) * 14 * k).toFixed(2) + "deg) " + (pressed ? "scale(.97)" : "translateY(-4px)"), "important");
    };
    const reset = (el) => {
      if (!el) return;
      el.classList.remove("z3d-tilting");
      el.classList.add("z3d-tilt-back");
      el.style.removeProperty("transform");
      setTimeout(() => el.classList.remove("z3d-tilt-back"), 520);
    };
    document.addEventListener("pointerdown", (e) => {
      if (!motionOK()) return;
      const el = find(e);
      if (!el) return;
      cur = el; pid = e.pointerId;
      set(el, e, true);
    }, { passive: true });
    document.addEventListener("pointermove", (e) => {
      if (!motionOK()) return;
      if (cur && e.pointerId === pid) { set(cur, e, true); return; }
      if (e.pointerType !== "mouse") return;
      const el = find(e);
      if (el !== hover) { reset(hover); hover = el; }
      if (el) set(el, e, false);
    }, { passive: true });
    const up = (e) => {
      if (!cur || e.pointerId !== pid) return;
      const el = cur;
      cur = null;
      setTimeout(() => { if (el !== hover) reset(el); }, 120);
    };
    document.addEventListener("pointerup", up, { passive: true });
    document.addEventListener("pointercancel", up, { passive: true });
  }

  /* ══════════ Estilos ══════════ */
  const CSS = `
.z3d-canvas{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);pointer-events:none;z-index:0;display:block}
.vc-avatar-section.z3d-on::after,.vc-avatar-section.z3d-on .vc-rings,.vc-avatar-section.z3d-on .vc-avatar-glow{display:none}
.vc-avatar-section.z3d-on .vc-avatar{background:rgba(12,8,40,.42)}
.vc-avatar-section.z3d-on .vc-avatar::after{background:radial-gradient(circle at 50% 50%,transparent 70%,rgba(9,6,32,.35) 100%)}
.vc-avatar-section.z3d-on .vc-avatar::before{content:"";position:absolute;inset:0;border-radius:50%;box-shadow:inset 0 0 0 2px rgba(255,255,255,.3),inset 0 0 24px rgba(196,168,255,.35);z-index:6;pointer-events:none}
.vc-avatar-section.z3d-on #vc-avatar-img{animation:none!important}
.chat-zyra-avatar.z3d-on{background:transparent!important;border-color:transparent!important;box-shadow:none!important;overflow:visible!important}
.chat-zyra-avatar.z3d-on>img{position:relative;z-index:1;width:34px!important;height:34px!important;padding:0!important;border-radius:50%;object-fit:cover!important;object-position:50% 6%;background:rgba(12,8,40,.25);box-shadow:0 0 0 1.5px rgba(255,255,255,.6)}
.chat-zyra-avatar.z3d-on>div{z-index:2}
.zyra-rec-avatar.z3d-on .zyra-rec-pulse{display:none}
.zyra-rec-avatar.z3d-on .zyra-avatar-svg{position:relative;z-index:1;animation:none!important;filter:none!important}
.zyra-rec-avatar.z3d-on .zyra-avatar-svg img{background:rgba(12,8,40,.38);box-shadow:inset 0 0 0 2px rgba(255,255,255,.3)}
.breath-wrap.z3d-on{position:relative;padding:70px 0}
.breath-wrap.z3d-on .breath-circle{background:transparent!important;box-shadow:none!important;transform:none!important;transition:none!important;z-index:1}
.breath-wrap.z3d-on .breath-circle::before{content:"";position:absolute;inset:30px;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,.82) 38%,rgba(255,255,255,0) 72%);z-index:-1;pointer-events:none}
[data-theme="dark"] .breath-wrap.z3d-on .breath-circle::before{background:radial-gradient(circle,rgba(10,8,30,.55) 38%,rgba(10,8,30,0) 72%)}
.breath-wrap.z3d-on #breath-label,.breath-wrap.z3d-on .breath-seconds{color:var(--text)!important;text-shadow:none}
[data-theme="dark"] .breath-wrap.z3d-on #breath-label,[data-theme="dark"] .breath-wrap.z3d-on .breath-seconds{color:#fff!important;text-shadow:0 2px 12px rgba(0,0,0,.6)}
.z3d-medal-wrap{perspective:900px;line-height:1}
.z3d-medal{position:relative;width:118px;height:118px;margin:0 auto;transform-style:preserve-3d;cursor:pointer;animation:z3dMedalIn 1.1s cubic-bezier(.34,1.56,.64,1) both,z3dMedalSpin 7s linear 1.1s infinite}
.z3d-medal.spin{animation:z3dMedalTap .9s cubic-bezier(.2,.9,.3,1) both,z3dMedalSpin 7s linear .9s infinite}
.z3d-medal .f,.z3d-medal .e{position:absolute;inset:0;border-radius:50%}
.z3d-medal .f{display:flex;align-items:center;justify-content:center;-webkit-backface-visibility:hidden;backface-visibility:hidden;background:radial-gradient(circle at 34% 28%,#fff7cf,#ffd36b 30%,#f2a92d 58%,#b9700a 82%);box-shadow:inset 0 0 0 7px rgba(255,255,255,.25),inset 0 -10px 22px rgba(120,60,0,.45);font-size:54px}
.z3d-medal .fr{transform:translateZ(6px)}
.z3d-medal .bk{transform:rotateY(180deg) translateZ(6px)}
.z3d-medal .e{background:#c47f12}
@keyframes z3dMedalIn{0%{transform:translateY(-40vh) rotateY(-540deg) scale(.4)}70%{transform:translateY(10px) rotateY(20deg) scale(1.08)}100%{transform:none}}
@keyframes z3dMedalSpin{to{transform:rotateY(360deg)}}
@keyframes z3dMedalTap{0%{transform:rotateY(0) scale(1)}40%{transform:rotateY(400deg) scale(1.12)}100%{transform:rotateY(720deg) scale(1)}}
.z3d-coin-fall{position:fixed;top:-40px;z-index:10050;border-radius:50%;pointer-events:none;background:radial-gradient(circle at 35% 30%,#fff6c8,#f5b83d 45%,#b9700a 85%);box-shadow:inset 0 0 0 3px rgba(255,255,255,.25);animation:z3dCoinFall var(--d,2s) cubic-bezier(.3,.1,.6,1) var(--w,0s) both}
@keyframes z3dCoinFall{0%{transform:translate3d(0,0,0) rotateY(0) rotateX(20deg);opacity:1}100%{transform:translate3d(var(--dx,0px),110vh,0) rotateY(900deg) rotateX(60deg);opacity:.9}}
.z3d-flip{display:inline-block;animation:z3dFlip 1s cubic-bezier(.2,1.3,.4,1) .15s both}
@keyframes z3dFlip{0%{transform:perspective(300px) rotateY(-540deg) scale(.3)}100%{transform:perspective(300px) rotateY(0) scale(1)}}
.z3d-tilting{transition:transform .1s linear!important;will-change:transform}
.z3d-tilt-back{transition:transform .5s cubic-bezier(.2,.8,.2,1)!important}
@media (prefers-reduced-motion:reduce){.z3d-medal,.z3d-medal.spin,.z3d-flip{animation:none}}
`;
  function injectCSS() {
    if (document.getElementById("z3d-css")) return;
    const s = document.createElement("style");
    s.id = "z3d-css";
    s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }

  window.Zyra3D = {
    version: 1,
    enabled, status, pref, setPref, motionOK, moodFor,
    aura: (host, opts) => make(Aura, host, opts),
    breath: (host, opts) => make(BreathView, host, opts),
    medal, coinRain, tilt: tiltCards,
    sweep, destroyAll,
    debug: () => Array.from(live).map((v) => ({ type: v instanceof Aura ? "aura" : "breath", host: v.host.className, visible: v.visible, fps: Math.round(v.fps), scale: v.scale, size: v.cssW, soft: v.soft })),
  };
  try { window.dispatchEvent(new Event("zyra3d-ready")); } catch (e) {}
})();
