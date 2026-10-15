/**
 * 场景点精灵共用的着色器。
 *
 * 之所以不用 `THREE.PointsMaterial`：它只能给整批粒子一个统一尺寸与透明度，
 * 而每个场景都需要「同一批点里雨丝更长、雪片更大、尘埃更暗」这类差异，
 * 所以尺寸、透明度、相位、拉伸全部通过属性或 uniform 传入。
 *
 * ## 尺寸换算
 *
 * `aSize` 的语义是**画布高度的百分比**（0.06 = 画布高的 6%），
 * 因此换算基准是 `uFramePixelHeight`（画布的**设备像素**高度），
 * 与相机视锥、场景深度都无关。
 *
 * 早期版本用「设备像素高 / 可见世界高」作为基准，等于把画布比例当成了世界尺寸，
 * 结果粒子被放大二十余倍（雨丝渲染成近 30px，而画布只有 112px 高）。
 *
 * `uDepth / |视空间 z|` 只做**轻微的近大远小**：它不该承担主要缩放职责，
 * 否则远处的雨会比近处小一半以上，观感像两套系统。
 */

export const POINT_VERTEX_SHADER = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute float aPhase;

uniform float uTime;
uniform float uFramePixelHeight;
uniform float uDepth;

varying float vAlpha;
varying float vPhase;

void main() {
  vPhase = aPhase;

  vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
  // 轻微横向摆动，让雨雪不是整齐划一的直线
  viewPosition.x += sin(uTime * 0.8 + aPhase * 6.2831) * 0.05;

  gl_Position = projectionMatrix * viewPosition;

  // 深度衰减限制在 [0.8, 1.15]：只作为一点透视暗示，不参与主要缩放
  float attenuation = clamp(uDepth / max(-viewPosition.z, 0.001), 0.8, 1.15);
  gl_PointSize = clamp(aSize * uFramePixelHeight * attenuation, 1.0, 96.0);

  vAlpha = aAlpha * smoothstep(0.0, 0.9, gl_Position.w);
}
`

export const POINT_FRAGMENT_SHADER = /* glsl */ `
uniform float uOpacity;
uniform float uSoftness;
uniform float uStretch;
uniform vec3 uColor;

varying float vAlpha;
varying float vPhase;

void main() {
  // 把方形点精灵压成竖长，模拟雨丝与飘落的痕迹；
  // uStretch 越小越细长，取 1.0 时保持圆形（雪、海沫、灯火）
  vec2 uv = (gl_PointCoord - 0.5) * vec2(1.0, max(uStretch, 0.001));
  float radius = length(uv) * 2.0;

  if (radius > 1.0) discard;

  float falloff = 1.0 - smoothstep(0.0, max(0.35, uSoftness), radius);
  float core = 1.0 - smoothstep(0.0, 0.3, radius);
  float shimmer = 0.86 + 0.14 * sin(vPhase * 11.0);

  gl_FragColor = vec4(uColor, (falloff * 0.7 + core * 0.6) * vAlpha * uOpacity * shimmer);
}
`
