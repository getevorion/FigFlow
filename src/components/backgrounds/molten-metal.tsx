"use client";

/**
 * Molten Metal background, adapted from React Bits (https://reactbits.dev,
 * backgrounds/molten-metal; source taken from the MoltenMetal-TS-TW entry of
 * its shadcn registry). Copyright (c) 2026 David Haz, MIT + Commons Clause:
 * the full notice is in THIRD_PARTY_NOTICES.md. The shaders and the animation loop are unchanged.
 * Changes: the pointer is tracked on the window, so the pattern still drifts
 * with the cursor when page content covers the canvas; the canvas fades in
 * after its first frame; a browser without WebGL 2 keeps the plain page
 * background; uniforms are reached through a ref instead of a module-level
 * WeakMap; and `lightMode` is applied (the original never set its uniform).
 */
import { Mesh, Program, Renderer, Triangle } from "ogl";
import { useEffect, useRef } from "react";

export type MoltenMetalColorMode = "molten" | "ember" | "frost";

export type MoltenMetalProps = {
  color1?: string;
  color2?: string;
  color3?: string;
  speed?: number;
  scale?: number;
  detail?: number;
  glow?: number;
  coreSize?: number;
  swirl?: number;
  fold?: number;
  blackPoint?: number;
  brightness?: number;
  colorMode?: MoltenMetalColorMode;
  grain?: boolean;
  grainIntensity?: number;
  mouseInteraction?: boolean;
  mouseStrength?: number;
  opacity?: number;
  backgroundColor?: string;
  lightMode?: boolean;
  className?: string;
};

type Settings = Required<Omit<MoltenMetalProps, "className">>;

const hexToRgb = (hex: string): [number, number, number] => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return [1, 1, 1];
  return [parseInt(result[1], 16) / 255, parseInt(result[2], 16) / 255, parseInt(result[3], 16) / 255];
};

const colorModeToFloat = (mode: MoltenMetalColorMode): number => (mode === "ember" ? 1 : mode === "frost" ? 2 : 0);

const vertex = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const fragment = `#version 300 es
precision highp float;
uniform vec2 iResolution;
uniform float iTime;
uniform float uSpeed;
uniform float uScale;
uniform float uDetail;
uniform float uGlow;
uniform float uCoreSize;
uniform float uSwirl;
uniform float uFold;
uniform float uBlackPoint;
uniform float uBrightness;
uniform float uColorMode;
uniform float uGrain;
uniform float uGrainIntensity;
uniform float uOpacity;
uniform vec2 uMouse;
uniform float uMouseStrength;
uniform bool uEnableMouse;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
uniform vec3 uBackgroundColor;
uniform bool uLightMode;
out vec4 fragColor;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  float time = iTime * uSpeed;
  vec2 p = uScale * ((gl_FragCoord.xy - 0.5 * iResolution.xy) / iResolution.y) - 0.5;

  vec2 drift = vec2(0.0);
  if (uEnableMouse) {
    drift = (uMouse - 0.5) * uMouseStrength * 2.0;
  }
  p += drift;

  vec2 i = p;
  float c = 0.0;
  float r = length(p + vec2(sin(time), sin(time * 0.3 + 5.0)) * 0.5);
  float d = length(p);
  float rot = d + time + p.x * uSwirl;

  float cosRot = cos(rot);
  mat2 warp = mat2(cos(rot - sin(time / 5.0)), sin(rot), -sin(cosRot - time), cosRot) * uFold;
  float glowCore = uGlow * uCoreSize;

  for (float n = 0.0; n < 8.0; n++) {
    if (n >= uDetail) break;
    p *= warp;
    float t = r - time / (n + 3.0);
    i -= p + vec2(cos(t - i.x - r) + sin(t + i.y), sin(t - i.y) + cos(t + i.x) + r);
    c += glowCore / length(vec2(sin(i.x + t), cos(i.y + t)));
  }

  c /= 6.0;

  float intensity = max(c - uBlackPoint, 0.0) * uBrightness;

  float g = clamp(intensity, 0.0, 1.0);

  float mid = 0.5;
  if (uColorMode > 1.5) {
    mid = 0.65;
  } else if (uColorMode > 0.5) {
    mid = 0.35;
  }

  vec3 col = mix(uColor1, uColor2, smoothstep(0.0, mid, g));
  col = mix(col, uColor3, smoothstep(mid, 1.0, g));

  float a = g;
  if (uGrain > 0.5) {
    float gr = hash(gl_FragCoord.xy + iTime);
    a += (gr - 0.5) * uGrainIntensity;
  }
  a = clamp(a, 0.0, 1.0) * uOpacity;
  if (uLightMode) {
    float signal = 1.0 - exp(-max(c, 0.0) * 6.5);
    float body = smoothstep(0.075, 0.68, signal);
    float ridge = smoothstep(0.42, 0.92, signal);

    vec3 lightCol = mix(uColor1, uColor2, smoothstep(0.08, 0.52, signal));
    lightCol = mix(lightCol, uColor3, smoothstep(0.52, 0.96, signal));
    lightCol = mix(lightCol, lightCol * 0.72, ridge * 0.24);

    float coverage = body * mix(0.2, 0.86, signal) * uOpacity;
    if (uGrain > 0.5) {
      float gr = hash(gl_FragCoord.xy + iTime);
      coverage += (gr - 0.5) * uGrainIntensity * body * 0.16;
    }
    fragColor = vec4(mix(uBackgroundColor, lightCol, clamp(coverage, 0.0, 0.92)), 1.0);
  } else {
    fragColor = vec4(col * a, a);
  }
}
`;

export default function MoltenMetal({
  color1 = "#5227FF",
  color2 = "#FF9FFC",
  color3 = "#FFFFFF",
  speed = 0.35,
  scale = 4,
  detail = 3,
  glow = 1.6,
  coreSize = 0.1,
  swirl = 1,
  fold = -0.2,
  blackPoint = 0.05,
  brightness = 1.3,
  colorMode = "molten",
  grain = true,
  grainIntensity = 0.05,
  mouseInteraction = true,
  mouseStrength = 0.3,
  opacity = 1.0,
  backgroundColor = "#FFFFFF",
  lightMode = false,
  className,
}: MoltenMetalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const applyRef = useRef<((s: Settings) => void) | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let renderer: Renderer;
    try {
      renderer = new Renderer({
        webgl: 2,
        alpha: true,
        premultipliedAlpha: true,
        antialias: false,
        dpr: Math.min(window.devicePixelRatio || 1, 2),
      });
    } catch {
      return; // no WebGL at all: the page background shows instead
    }
    const gl = renderer.gl;
    if (!renderer.isWebgl2) {
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      return; // the shaders are GLSL ES 3.00
    }
    gl.clearColor(0, 0, 0, 0);
    const canvas = gl.canvas as HTMLCanvasElement;
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";
    canvas.style.opacity = "0";
    canvas.style.transition = "opacity 1.2s ease";
    container.appendChild(canvas);

    const geometry = new Triangle(gl);
    const program = new Program(gl, {
      vertex,
      fragment,
      uniforms: {
        iTime: { value: 0 },
        iResolution: { value: new Float32Array([1, 1]) },
        uSpeed: { value: 0.35 },
        uScale: { value: 4 },
        uDetail: { value: 3 },
        uGlow: { value: 1.6 },
        uCoreSize: { value: 0.1 },
        uSwirl: { value: 1 },
        uFold: { value: -0.2 },
        uBlackPoint: { value: 0.05 },
        uBrightness: { value: 1.3 },
        uColorMode: { value: 0 },
        uGrain: { value: 1 },
        uGrainIntensity: { value: 0.05 },
        uOpacity: { value: 1.0 },
        uMouse: { value: new Float32Array([0.5, 0.5]) },
        uMouseStrength: { value: 0.3 },
        uEnableMouse: { value: true },
        uColor1: { value: new Float32Array([1, 1, 1]) },
        uColor2: { value: new Float32Array([1, 1, 1]) },
        uColor3: { value: new Float32Array([1, 1, 1]) },
        uBackgroundColor: { value: new Float32Array([1, 1, 1]) },
        uLightMode: { value: false },
      },
    });
    const mesh = new Mesh(gl, { geometry, program });
    const u = program.uniforms;

    let raf = 0;
    let isVisible = true;
    let isPageVisible = !document.hidden;
    let applied = false; // uniforms hold the props; nothing is drawn before that
    let shown = false;
    const render = () => {
      renderer.render({ scene: mesh });
      if (!shown) {
        shown = true;
        canvas.style.opacity = "1";
      }
    };

    const setSize = () => {
      const rect = container.getBoundingClientRect();
      renderer.setSize(Math.max(1, Math.floor(rect.width)), Math.max(1, Math.floor(rect.height)));
      const res = u.iResolution.value as Float32Array;
      res[0] = gl.drawingBufferWidth;
      res[1] = gl.drawingBufferHeight;
      if (applied) render();
    };

    const targetMouse: [number, number] = [0.5, 0.5];
    const currentMouse: [number, number] = [0.5, 0.5];

    // The canvas usually sits under the page's content, so listen on the window.
    const onPointer = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      const inside = x >= 0 && x <= 1 && y >= 0 && y <= 1;
      targetMouse[0] = inside ? x : 0.5;
      targetMouse[1] = inside ? 1.0 - y : 0.5;
    };
    const onLeave = () => {
      targetMouse[0] = 0.5;
      targetMouse[1] = 0.5;
    };
    window.addEventListener("pointermove", onPointer, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);

    const t0 = performance.now();
    const loop = (t: number) => {
      u.iTime.value = (t - t0) * 0.001;
      currentMouse[0] += 0.05 * (targetMouse[0] - currentMouse[0]);
      currentMouse[1] += 0.05 * (targetMouse[1] - currentMouse[1]);
      const m = u.uMouse.value as Float32Array;
      m[0] = currentMouse[0];
      m[1] = currentMouse[1];
      render();
      raf = requestAnimationFrame(loop);
    };
    const tryStart = () => {
      if (applied && isVisible && isPageVisible && raf === 0) raf = requestAnimationFrame(loop);
    };
    const tryStop = () => {
      if (raf !== 0) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };

    const setColor = (target: Float32Array, hex: string) => {
      const [r, g, b] = hexToRgb(hex);
      target[0] = r;
      target[1] = g;
      target[2] = b;
    };
    applyRef.current = (s) => {
      u.uSpeed.value = s.speed;
      u.uScale.value = s.scale;
      u.uDetail.value = s.detail;
      u.uGlow.value = s.glow;
      u.uCoreSize.value = Math.max(s.coreSize, 0.001);
      u.uSwirl.value = s.swirl;
      u.uFold.value = s.fold;
      u.uBlackPoint.value = s.blackPoint;
      u.uBrightness.value = s.brightness;
      u.uColorMode.value = colorModeToFloat(s.colorMode);
      u.uGrain.value = s.grain ? 1 : 0;
      u.uGrainIntensity.value = s.grainIntensity;
      u.uOpacity.value = s.opacity;
      u.uMouseStrength.value = s.mouseStrength;
      u.uEnableMouse.value = s.mouseInteraction;
      u.uLightMode.value = s.lightMode;
      setColor(u.uColor1.value as Float32Array, s.color1);
      setColor(u.uColor2.value as Float32Array, s.color2);
      setColor(u.uColor3.value as Float32Array, s.color3);
      setColor(u.uBackgroundColor.value as Float32Array, s.backgroundColor);
      applied = true;
      if (raf === 0) {
        render();
        tryStart();
      }
    };

    const ro = new ResizeObserver(setSize);
    ro.observe(container);
    setSize();

    const io = new IntersectionObserver(
      ([entry]) => {
        isVisible = entry.isIntersecting;
        if (isVisible) tryStart();
        else tryStop();
      },
      { threshold: 0 },
    );
    io.observe(container);

    const onVisibility = () => {
      isPageVisible = !document.hidden;
      if (isPageVisible) tryStart();
      else tryStop();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      tryStop();
      applyRef.current = null;
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointermove", onPointer);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      if (canvas.parentNode === container) container.removeChild(canvas);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, []);

  useEffect(() => {
    applyRef.current?.({
      color1,
      color2,
      color3,
      speed,
      scale,
      detail,
      glow,
      coreSize,
      swirl,
      fold,
      blackPoint,
      brightness,
      colorMode,
      grain,
      grainIntensity,
      mouseInteraction,
      mouseStrength,
      opacity,
      backgroundColor,
      lightMode,
    });
  }, [
    color1,
    color2,
    color3,
    speed,
    scale,
    detail,
    glow,
    coreSize,
    swirl,
    fold,
    blackPoint,
    brightness,
    colorMode,
    grain,
    grainIntensity,
    mouseInteraction,
    mouseStrength,
    opacity,
    backgroundColor,
    lightMode,
  ]);

  return <div ref={containerRef} className={className ?? "relative h-full w-full overflow-hidden"} aria-hidden />;
}
