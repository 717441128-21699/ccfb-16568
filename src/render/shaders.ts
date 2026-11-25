/**
 * WebGL2 着色器源码。
 * 场景统一用透视相机 + 视图矩阵；水面用半透明波动片，
 * 陆地/码头/船舶用 Lambert 漫反射 + 固定方向光。
 */

export const SCENE_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
uniform mat4 uProj;
uniform mat4 uView;
uniform mat4 uModel;
out vec3 vNormal;
out vec3 vWorld;
void main() {
  vec4 world = uModel * vec4(aPos, 1.0);
  vWorld = world.xyz;
  vNormal = mat3(uModel) * aNormal;
  gl_Position = uProj * uView * world;
}`;

export const SCENE_FS = `#version 300 es
precision highp float;
in vec3 vNormal;
in vec3 vWorld;
uniform vec3 uColor;
uniform vec3 uLightDir;
uniform vec3 uCamPos;
uniform float uAlpha;
out vec4 frag;
void main() {
  vec3 n = normalize(vNormal);
  vec3 l = normalize(uLightDir);
  float diff = max(dot(n, l), 0.0);
  vec3 viewDir = normalize(uCamPos - vWorld);
  float fres = pow(1.0 - max(dot(n, viewDir), 0.0), 2.0) * 0.25;
  vec3 col = uColor * (0.35 + 0.65 * diff) + vec3(fres);
  frag = vec4(col, uAlpha);
}`;

export const WATER_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uProj;
uniform mat4 uView;
uniform float uTime;
uniform float uWaveScale;
out vec3 vWorld;
out float vWave;
void main() {
  vec3 p = aPos;
  float w =
    sin(p.x * 0.025 + uTime * 1.4) * 0.6 +
    cos(p.y * 0.031 + uTime * 1.1) * 0.5 +
    sin((p.x + p.y) * 0.018 + uTime * 0.8) * 0.4;
  p.z += w * uWaveScale;
  vWave = w;
  vec4 world = vec4(p, 1.0);
  vWorld = world.xyz;
  gl_Position = uProj * uView * world;
}`;

export const WATER_FS = `#version 300 es
precision highp float;
in vec3 vWorld;
in float vWave;
uniform vec3 uCamPos;
uniform vec3 uShallowColor;
uniform vec3 uDeepColor;
uniform float uAlpha;
out vec4 frag;
void main() {
  vec3 viewDir = normalize(uCamPos - vWorld);
  float fres = pow(1.0 - abs(dot(viewDir, vec3(0.0, 0.0, 1.0))), 2.0);
  vec3 base = mix(uShallowColor, uDeepColor, clamp(0.4 + vWave * 0.15, 0.0, 1.0));
  vec3 col = base + vec3(0.18, 0.28, 0.32) * fres;
  frag = vec4(col, uAlpha);
}`;

/** 航标/灯浮标用的自发光着色器（无光照） */
export const GLOW_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uProj;
uniform mat4 uView;
uniform mat4 uModel;
void main() {
  gl_Position = uProj * uView * uModel * vec4(aPos, 1.0);
}`;

export const GLOW_FS = `#version 300 es
precision highp float;
uniform vec3 uColor;
uniform float uAlpha;
out vec4 frag;
void main() { frag = vec4(uColor, uAlpha); }`;
