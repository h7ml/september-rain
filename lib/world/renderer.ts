import * as THREE from 'three'
import { createRandom } from '../scene/random'
import { createInteractionSystem } from './interaction'
import type { InteractionSystem } from './interaction'
import { createInput } from './input'
import { createPlayerState, applyLook, stepPlayer } from './player'
import type {
  Collider,
  Hotspot,
  PlayerConfig,
  PlayerState,
  SceneRuntime,
  WorldConfig,
  WorldHandle,
  WorldSceneHandle,
} from './types'

/**
 * 第一人称世界骨架。
 *
 * 这是 `lib/scene/` 那套「一屏里看一片雨」的继任者：一个**有真实尺度**的三维
 * 空间，玩家用眼睛站在里面。骨架负责相机、渲染器、雾、雨、生命周期与
 * 玩家/交互的接线；场景模块只声明「这片空间长什么样」。
 *
 * ## 与 `scene-canvas.tsx` 的四处分叉（都是刻意的）
 *
 * 1. **同步建渲染器，不动态 import three。** 旧画布在首屏关键路径上，所以延迟
 *    加载、加载期间让 CSS 场景兜底。世界层相反：它是玩家「点击进入场景」之后才
 *    存在的东西，那时 three 已经加载过一次（浏览器缓存），而 `scene.build` 需要
 *    同步拿到 `SceneRuntime`。改成异步会把 `build` 的契约也拖成异步，
 *    为一次没有收益的延迟付出整个模块的复杂度。旧画布里「`ready` 状态由异步回调
 *    置位、漏进依赖数组就永远建不出首个场景」那类坑，这里直接不存在。
 *
 * 2. **不做 40fps 节流。** 旧画布偶尔被瞥一眼，节流几乎无损。第一人称下降帧
 *    直接表现为转头延迟，是晕眩的主要来源之一。省 GPU 改用降低像素比。
 *
 * 3. **构造失败不静默回退。** 世界层没有「下层还有一版 CSS 场景」可退，
 *    所以拿不到上下文时返回 `null`，让调用方自己决定显示什么。交出一个
 *    各方法静默空转的假句柄，比拿不到句柄难排查得多。
 *
 * 4. **相机每帧显式重算并更新世界矩阵。** 不能依赖 `renderer.render` 顺带更新：
 *    交互系统排在 render 之前，顺序错了第一帧读到的相机矩阵还是单位矩阵，
 *    表现是「刚进场景点什么都没反应」，且第二帧自愈，极难复现。
 *
 * ## 帧序
 *
 * 输入 → stepPlayer → 相机与雨的跟随 → interaction → scene.update → render。
 * `elapsed` 由骨架累加（每帧加的是**已钳制**的 delta），场景模块拿它与 delta
 * 自己算动画时序，不必再各自维护一个时钟。
 */

/* ------------------------------------------------------------------ *
 * 调参
 * ------------------------------------------------------------------ */

const CAMERA_FOV = 72
const CAMERA_NEAR = 0.08
/** 远平面给剪影留足余量：雾在 90m 外就已经吃掉一切，超过它只是防穿帮。 */
const CAMERA_FAR = 700

/** 与 React 层一致：超过 2 倍的像素比收益极低，移动端反而拖慢帧率。 */
const MAX_PIXEL_RATIO = 2

/**
 * 单帧时间上限（秒）。切回标签页时 rAF 给出的第一个 delta 可能是几秒，
 * 不钳制会让角色一帧穿过围墙、雨一帧掉过整个盒子。
 */
const MAX_DELTA = 0.1

/** `placePlayer` 的过渡时长（秒）。 */
const PLACE_DURATION = 0.45

/** 雾色 == 背景色 == 天光色。三者不一致时地平线会露出一条色带。 */
const FOG_COLOR = 0x141b1c
/**
 * 指数雾的密度。
 *
 * 用 `FogExp2` 而非线性 `Fog`：剪影风要的是「远处不明不白地溶掉」，
 * 线性雾在 far 处会划出一刀可见的边界，天边出现一条硬直的深色带。
 * 0.019 大约让 60m 外的对比度衰减到 1/5，与本项目的可见尺度相配。
 */
const FOG_DENSITY = 0.019

/**
 * 光照配比。剪影风要的是「边缘比中间亮」，所以：
 * 环境光给得极低（给高整个场景会灰成一片，方向光的对比全被吃掉），
 * 半球光只当补色（强度必须低于方向光，否则它会把边缘的高光抹平），
 * 两盏方向光负责轮廓——一盏冷色从侧后方，一盏琥珀色作主光。
 */
const AMBIENT_COLOR = 0x1a2223
const AMBIENT_INTENSITY = 0.9
const SKY_TINT = 0x2a3b3e
const GROUND_TINT = 0x0d1213
const HEMISPHERE_INTENSITY = 0.35
const RIM_COLOR = 0x8fa8a4
const RIM_INTENSITY = 1.25
const SUN_COLOR = 0xc8a878
const SUN_INTENSITY = 1.15

/**
 * 雨的密度（滴/平方米/秒 的视觉等价量，直接当「每平方米可见雨滴数」用）。
 *
 * 校准依据：1mm/h 的细雨每平方米每 6 秒落 1 滴，可见总量约 3-5 滴；
 * 15mm/h 的大雨约 25000 滴瞬态同时可见。本项目要的是二者之间的中部偏上，
 * 再乘以 0.6 的档位系数，总计 6000 个点精灵。
 * 别照气象学的滴数直接写代码——真实雨滴直径 0.5-2mm，按真实尺寸渲染
 * 在屏幕上是一个亚像素点，什么也看不见；这里给的是观感尺寸。
 */
const RAIN_BASE_DENSITY = 3000
const RAIN_WALL_DENSITY = 25000
const RAIN_MOOD = 0.6

const RAIN_COLOR = 0xa8bfbc
const RAIN_NEAR_SIZE = { min: 0.008, max: 0.016 }
const RAIN_FAR_SIZE = { min: 0.004, max: 0.008 }
const RAIN_NEAR_FALL = { min: 9, max: 15 }
const RAIN_FAR_FALL = { min: 6, max: 11 }
const RAIN_NEAR_STRETCH = 5.0
const RAIN_FAR_STRETCH = 8.0
const RAIN_OPACITY = { near: 0.55, far: 0.32 }
/**
 * 风：横向漂移（米/秒）与顶点着色器里的摆动幅度（米）。
 *
 * 两者都是必需品，不是装饰。回绕式雨盒若没有横向漂移，玩家原地不动时
 * 雨滴的 x/z 恒定，整层雨在视野里就是一根根竖线在小幅度抖——「下落」
 * 只体现在 y 上，一旦转头就会看出它像一层竖条纹的帘子。
 * 漂移给了横向的相对运动，摆动负责抹掉「每滴都是完美竖线」的机械感。
 */
const RAIN_DRIFT = { near: 0.55, far: 0.35 }
const RAIN_SWAY = { near: 0.16, far: 0.09 }

/**
 * 地表涟漪：数量与体积无关，直接给总数。
 * 它比雨滴低一个量级——那是「地面被打湿」的暗示，不是主体。
 */
const SPLASH_COUNT = 480
const SPLASH_RADIUS = 16
const SPLASH_CYCLE = 0.9
/** 一圈涟漪只有在周期的前 35% 可见，之后是「等待下一滴」的间隔。 */
const SPLASH_LIFETIME = 0.18
const SPLASH_OPACITY = 0.22
const SPLASH_SIZE = { min: 0.10, max: 0.28 }

/* ------------------------------------------------------------------ *
 * 工具
 * ------------------------------------------------------------------ */

/** 把 `value` 再折回长度 `span` 的周期内。用于雨滴回绕。 */
function wrap(value: number, span: number): number {
  return value - Math.floor(value / span) * span
}

/** 从 `from` 转到 `to` 的最短角差，落在 (-π, π]。落点过渡走最短路径，不倒着转一圈。 */
function angleDelta(from: number, to: number): number {
  const tau = Math.PI * 2
  return wrap(to - from + Math.PI, tau) - Math.PI
}

/* ------------------------------------------------------------------ *
 * 着色器
 * ------------------------------------------------------------------ */

/**
 * 雨用自定义着色器而非 `THREE.PointsMaterial`，理由与 `lib/scene/glsl.ts` 相同：
 * 同一批点里要同时有长短、亮暗、快慢的差异，内建材质只能给整批一个尺寸。
 *
 * ## 与 `lib/scene/glsl.ts` 的语义分叉（刻意的，不是抄漏）
 *
 * 那套的 `aSize` 是**画幅高度的百分比**，基准取自 `uFramePixelHeight`
 * （画布的设备像素高），与相机视锥、场景深度无关——因为 2D 剪影画面里
 * 根本没有「世界」这回事。
 *
 * 三维空间里这套语义不成立：雨滴必须**参与透视**，否则远处的雨和近处的雨
 * 一样大，观感像贴在镜头前的一层贴纸。所以这里让顶点着色器自己换算：
 *
 *     gl_PointSize = 世界尺寸 / (2·tan(fov/2)·|视空间 z|) · 视口像素高
 *
 * 其中 `projectionMatrix[1][1]` 就是 `1/tan(fov/2)`，所以不必额外传 fov——
 * 相机改了视场角，尺寸仍然对。`viewPosition` 来自 `modelViewMatrix`，
 * 因此「雨盒整体跟随相机」这件事对换算透明：只有粒子在盒内的相对位置参与。
 *
 * `uViewport` 用 `renderer.getDrawingBufferSize()` 而不是 CSS 尺寸：像素比会
 * 缩放 `gl_PointSize`，漏掉它会让 retina 上的雨丝细掉一半。
 */
const RAIN_VERTEX_SHADER = /* glsl */ `
attribute float aSizeWorld;
attribute float aAlpha;
attribute float aPhase;
attribute float aStretch;

uniform float uTime;
uniform vec2 uViewport;
uniform float uSway;
uniform vec3 uBoxCenter;
uniform float uBoxRadius;

varying float vAlpha;
varying float vPhase;
varying float vStretch;

void main() {
  vPhase = aPhase;
  vStretch = aStretch;

  vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);

  // 横向摆动：相位取粒子相位加视空间高度，同一条雨丝在不同高度摆幅不同，
  // 看起来才是被风吹，而不是整批一起晃。
  viewPosition.x += sin(uTime * 1.6 + aPhase * 12.566 + viewPosition.y * 0.35) * uSway;

  gl_Position = projectionMatrix * viewPosition;

  float distance = max(-viewPosition.z, 0.05);
  float projected = aSizeWorld / (2.0 * projectionMatrix[1][1] * distance) * uViewport.y;
  // 上限 72px：某些 GPU 的点精灵硬上限是 64px，超过会被静默截断；
  // 抬脸贴到一滴雨时它会被 clamp 成一个大圆点，而它此刻只有 0.55 的透明度，
  // 看不出边界。近处淡出（见下）才是主要的消解手段。
  gl_PointSize = clamp(projected, 1.0, 72.0);

  // 60cm 以内淡出：穿脸而过的那几滴最容易暴露「这只是一层粒子」。
  float nearFade = smoothstep(0.4, 1.1, distance);

  // 盒体边缘淡出。回绕是瞬移，若在可见处发生，玩家会看到雨滴凭空跳到对面——
  // 这比「雨粘在相机上」更刺眼。原始写入位置与回绕后的位置之间必然跨过整个盒子，
  // 所以两者取最大的水平距离：回绕当场发生的那一帧，这个值等于 2R，淡出立即生效，
  // 而下一帧它就变得极小，粒子从此在暗处一路飘进视野。
  vec2 eyeSpace = position.xz - uBoxCenter.xz;
  float edge = max(length(eyeSpace), length(eyeSpace - (2.0 * uBoxRadius) * sign(eyeSpace)));
  float edgeFade = 1.0 - smoothstep(uBoxRadius * 0.55, uBoxRadius * 0.95, edge);

  // 远端刻意不再淡出——那是雾的职责。重复处理会让雨在 40m 处先消失、
  // 剪影后消失，露出两层深度，反而穿帮。
  vAlpha = aAlpha * nearFade * edgeFade;
}
`

const RAIN_FRAGMENT_SHADER = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;

varying float vAlpha;
varying float vPhase;
varying float vStretch;

void main() {
  // 把方形点精灵压成细长条：uStretch 是拉伸量，越大越细长。
  // 圆周判定用压缩后的坐标做，所以拉伸只把圆变长，不改变柔边的形状。
  vec2 offset = (gl_PointCoord - 0.5) * vec2(1.0, max(uStretch, 0.001));
  float radius = length(offset) * 2.0;
  if (radius > 1.0) discard;

  float falloff = 1.0 - smoothstep(0.0, 1.0, radius);
  float core = 1.0 - smoothstep(0.0, 0.4, radius);
  // 每滴亮度略有差异，否则整片雨看起来是一张规则的网
  float shimmer = 0.86 + 0.14 * sin(vPhase * 11.0);

  gl_FragColor = vec4(uColor, (falloff * 0.7 + core * 0.55) * vAlpha * uOpacity * shimmer);
}
`

/**
 * 地表涟漪。复用同一套点精灵管线，但 `aSizeWorld` 在这里读作**直径（米）**：
 * 它是一圈贴地的水花，尺寸由周期进度驱动外扩，不再需要逐粒子差异。
 */
const SPLASH_VERTEX_SHADER = /* glsl */ `
attribute float aSizeWorld;
attribute float aAlpha;
attribute float aPhase;
attribute float aStretch;

uniform float uTime;
uniform vec2 uViewport;
uniform float uCycle;
uniform float uLifetime;

varying float vAlpha;
varying float vPhase;
varying float vStretch;

void main() {
  // 每个粒子有自己的周期偏移，否则整片地面会同步跳动，像一层规则闪烁的贴图
  float localTime = mod(uTime + aPhase * uCycle, uCycle);
  float cycle = localTime / uCycle;
  float visible = 1.0 - smoothstep(0.0, uLifetime, cycle);

  vPhase = cycle;
  vStretch = aStretch;
  vAlpha = aAlpha * visible;

  vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * viewPosition;

  // 尺寸随周期外扩：从针尖大小涨到声明直径
  float grown = aSizeWorld * (0.25 + 0.75 * cycle);
  float distance = max(-viewPosition.z, 0.05);
  float projected = grown / (2.0 * projectionMatrix[1][1] * distance) * uViewport.y;
  gl_PointSize = clamp(projected, 1.0, 48.0);
}
`

const SPLASH_FRAGMENT_SHADER = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;

varying float vAlpha;
varying float vPhase;
varying float vStretch;

void main() {
  vec2 offset = (gl_PointCoord - 0.5) * 2.0;
  float radius = length(offset);

  // 只留一圈环：中心的实心圆看起来像水洼，环才像「刚被砸出来的水花」
  float ring = smoothstep(0.35, 0.85, radius) * (1.0 - smoothstep(0.85, 1.0, radius));
  float fade = 1.0 - vPhase;

  gl_FragColor = vec4(uColor, ring * vAlpha * fade * uOpacity);
}
`

/* ------------------------------------------------------------------ *
 * 雨层
 * ------------------------------------------------------------------ */

type RainLayer = {
  points: THREE.Points
  material: THREE.ShaderMaterial
  /** 逐帧推进的粒子**世界**坐标。与几何体的 position 属性共用同一个数组。 */
  positions: Float32Array
  /** 下落速度（米/秒） */
  velocity: Float32Array
  /** 水平漂移速度（米/秒），带正负号 */
  drift: Float32Array
  /** 盒体的水平半宽（米） */
  radius: number
  /** 盒体的高度（米），底面恒在 y=0 */
  height: number
}

type RainLayerSpec = {
  radius: number
  height: number
  count: number
  size: { min: number; max: number }
  fall: { min: number; max: number }
  drift: number
  stretch: number
  opacity: number
  sway: number
  order: number
}

/**
 * 在相机周围一个**盒状体积**里循环下落。粒子在世界空间自由运动，
 * 只有**越出盒体边界才回绕**——不是整个粒子系统跟着相机平移。
 *
 * ## 为什么必须这么做（第一版踩过的坑）
 *
 * 第一版把粒子位置当**局部**坐标、每帧把整个 `Points` 对象设到相机的 xz 上，
 * 横向干脆不推进（理由是「省每帧几次取模」）。结果是横向平移时雨滴在视野里
 * 完全静止，只有微弱的摆动——玩家会明确感到自己**拖着一个雨盒子在走**，
 * 下雨的错觉当场没了。纵向回绕省下的那点运算，代价是整层雨失去存在感。
 *
 * 正确做法：`positions` 存世界坐标，每帧只推进 y（下落）与 xz（风漂移），
 * 任一轴越出 `[center - R, center + R)` 就回绕到另一端。回绕是**相对相机**做的，
 * 所以中心永远是相机，而粒子在世界里是连续运动的。
 *
 * ## 为什么是盒不是球/圆柱
 *
 * 第一人称下玩家平视、抬头、低头都要有雨。圆柱体的顶面会造出「头顶有块
 * 无雨的天花板」，球体同理（球壳在头顶最高、在脚下最薄，而玩家最常看的是
 * 正前方与脚下）。盒体只要够高就没有边界形状可言，也就没有破绽。
 * 回绕的接缝由顶点着色器的 `uBoxRadius` 边缘淡出抹掉，见 `RAIN_VERTEX_SHADER`。
 */
function createRainLayer(spec: RainLayerSpec, random: SceneRuntime['random'], origin: { x: number; z: number }): RainLayer {
  const positions = new Float32Array(spec.count * 3)
  const velocity = new Float32Array(spec.count)
  const drift = new Float32Array(spec.count)
  const phase = new Float32Array(spec.count)
  const size = new Float32Array(spec.count)
  const alpha = new Float32Array(spec.count)
  const stretch = new Float32Array(spec.count)

  const alphaMin = spec.opacity * 0.5
  const alphaMax = spec.opacity * 1.5
  const span = spec.radius * 2

  for (let i = 0; i < spec.count; i += 1) {
    const offset = i * 3
    // 出生点围绕玩家，而不是围绕世界原点：世界原点可能离落点几百米，
    // 那样第一帧的雨全都在盒子外，要等回绕把它们一个个搬过来。
    positions[offset] = origin.x + random.range(-spec.radius, spec.radius)
    positions[offset + 1] = random.range(0, spec.height)
    positions[offset + 2] = origin.z + random.range(-spec.radius, spec.radius)
    velocity[i] = random.range(spec.fall.min, spec.fall.max)
    // 每滴的漂移方向与速度都不同：完全一致的漂移等于整层雨在平移，
    // 相对运动反而消失，又回到「帘子」的观感。
    drift[i] = random.range(-spec.drift, spec.drift)
    phase[i] = random.unit()
    size[i] = random.range(spec.size.min, spec.size.max)
    alpha[i] = random.range(alphaMin, alphaMax)
    // 拉伸也逐粒子抖动：一批完全同宽同长的竖条看起来像栅栏
    stretch[i] = spec.stretch * random.range(0.65, 1.35)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('aSizeWorld', new THREE.BufferAttribute(size, 1))
  geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1))
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1))
  geometry.setAttribute('aStretch', new THREE.BufferAttribute(stretch, 1))
  // 粒子在世界空间里动，包围球必须够大且随相机走，否则会被视锥剔除掉。
  // 这里给一个「总是包含整个盒体」的球，并靠 `frustumCulled = false` 兜底。
  geometry.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(0, spec.height * 0.5, 0),
    Math.hypot(span, spec.height) * 1.5,
  )

  const material = new THREE.ShaderMaterial({
    vertexShader: RAIN_VERTEX_SHADER,
    fragmentShader: RAIN_FRAGMENT_SHADER,
    uniforms: {
      uTime: { value: 0 },
      uViewport: { value: new THREE.Vector2(1, 1) },
      uSway: { value: spec.sway },
      uBoxCenter: { value: new THREE.Vector3() },
      uBoxRadius: { value: spec.radius },
      uColor: { value: new THREE.Color(RAIN_COLOR) },
      uOpacity: { value: 1 },
    },
    transparent: true,
    // 不写深度：几千个半透明点互相写深度会切出硬边，而雨是叠加物，
    // 互相遮挡本身没有意义。仍开 depthTest，让雨被建筑正确遮挡。
    depthWrite: false,
    depthTest: true,
    fog: false,
    blending: THREE.AdditiveBlending,
  })

  const points = new THREE.Points(geometry, material)
  points.renderOrder = spec.order
  // 粒子世界坐标散布在整个盒体里，包围球每帧都会因为位置变化而失效；
  // 关掉剔除比每帧重算包围球更便宜。
  points.frustumCulled = false

  return {
    points,
    material,
    positions,
    velocity,
    drift,
    radius: spec.radius,
    height: spec.height,
  }
}

/**
 * 逐帧推进一层雨。
 *
 * 回绕**相对相机**做：把粒子坐标与盒体中心都平移到相机原点，回绕后再平移回去。
 * 这样玩家走多远，盒子都跟着走，而粒子本身在世界空间里连续下落——
 * 两者不会互相干扰。等价于「相机是个窗口，世界里的雨从窗口左边缘进来、右边缘出去」。
 */
function updateRainLayer(
  layer: RainLayer,
  delta: number,
  elapsed: number,
  centerX: number,
  centerZ: number,
  floorY: number,
) {
  const { positions, velocity, drift, radius, height } = layer
  const span = radius * 2

  for (let i = 0; i < velocity.length; i += 1) {
    const offset = i * 3

    let x = positions[offset] + drift[i] * delta
    let z = positions[offset + 2] + drift[i] * 0.4 * delta
    let y = positions[offset + 1] - velocity[i] * delta

    // 相对相机回绕到 [-radius, radius)。`wrap` 支持跨多个周期，
    // 所以即使一帧挪了几十米（切场景后的大 delta）也能正确落位。
    x = centerX + wrap(x - centerX + radius, span) - radius
    z = centerZ + wrap(z - centerZ + radius, span) - radius

    // 纵向不相对相机回绕，而是相对**地面**：盒子底面恒在 floorY。
    // 玩家眼高不会变，用相机 y 会让雨盒随镜头俯仰之外的任何垂直位移整体升降，
    // 而这个世界里玩家永远站在同一水平面上。
    if (y < floorY) y = floorY + height

    positions[offset] = x
    positions[offset + 1] = y
    positions[offset + 2] = z
  }

  // 属性缓冲与 positions 共用同一个数组，只需要声明哪一段变了
  const attribute = layer.points.geometry.getAttribute('position') as THREE.BufferAttribute
  attribute.needsUpdate = true

  layer.material.uniforms.uTime.value = elapsed
  layer.material.uniforms.uBoxCenter.value.set(centerX, floorY + height * 0.5, centerZ)
}


/* ------------------------------------------------------------------ *
 * 资源回收
 * ------------------------------------------------------------------ */

/**
 * 材质上可能挂纹理的字段名。不依赖具体类型：`MeshLambertMaterial` /
 * `ShaderMaterial` / 场景模块自定义材质的字段并集无法用一个类型表达，
 * 而漏掉的纹理会安静地留在 GPU 上，不报错、只是泄漏。
 */
const TEXTURE_SLOTS = [
  'map',
  'alphaMap',
  'aoMap',
  'bumpMap',
  'displacementMap',
  'emissiveMap',
  'envMap',
  'lightMap',
  'metalnessMap',
  'normalMap',
  'roughnessMap',
  'specularMap',
  'gradientMap',
] as const

type PossiblyTextured = Record<string, unknown>
type Disposable = { dispose: () => void }

function disposeMaterial(material: THREE.Material | THREE.Material[]) {
  const list = Array.isArray(material) ? material : [material]
  for (const item of list) {
    const slots = item as unknown as PossiblyTextured
    for (const slot of TEXTURE_SLOTS) {
      const texture = slots[slot] as Disposable | null | undefined
      if (texture && typeof texture.dispose === 'function') texture.dispose()
    }
    item.dispose()
  }
}

/**
 * 递归释放子树上的几何体与材质（含纹理）。
 *
 * 契约要求「骨架统一负责生命周期」，所以场景模块不必自己写 dispose——
 * 把东西加进 `root` 就够了。代价是这里必须覆盖所有形态：`Line`、`Sprite`、
 * `InstancedMesh` 的几何体、多材质 mesh 的材质数组、以及将来可能加进来的
 * 自定义材质。用鸭子类型而不是 `instanceof`：几何体只要是带 `dispose` 的
 * 对象就值得释放，而 three 的类继承关系在版本间改过。
 */
function disposeSubtree(root: THREE.Object3D) {
  root.traverse((object) => {
    const candidate = object as unknown as { geometry?: Disposable; material?: THREE.Material | THREE.Material[] }
    if (candidate.geometry && typeof candidate.geometry.dispose === 'function') candidate.geometry.dispose()
    if (candidate.material) disposeMaterial(candidate.material)
  })
}

/* ------------------------------------------------------------------ *
 * 主入口
 * ------------------------------------------------------------------ */

export function createWorld(config: WorldConfig): WorldHandle | null {
  const host = config.host

  /* ----- 渲染器 ----- */

  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      // 不透明画布：雾色就是天空色，远处要溶进天空，而不是溶进下层 DOM。
      alpha: false,
      stencil: false,
    })
  } catch {
    // 拿不到 WebGL 上下文。世界层没有兜底场景可退，返回 null 让调用方决定怎么讲。
    return null
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO))
  renderer.domElement.style.width = '100%'
  renderer.domElement.style.height = '100%'
  renderer.domElement.style.display = 'block'
  // 触屏端由 input 模块处理手势，不能让浏览器把拖动解释成滚动/橡皮筋
  renderer.domElement.style.touchAction = 'none'
  host.appendChild(renderer.domElement)

  // 宿主容器若是 static，canvas 的百分比高度会算错。只在能判断的情况下改，
  // 避免覆盖调用方写好的布局；除非我们改过，否则销毁时不碰它的行内样式。
  const touchedHostPosition = window.getComputedStyle(host).position === 'static'
  if (touchedHostPosition) host.style.position = 'relative'

  /** 建场景失败时把已经拿到的上下文还回去。 */
  const releaseRenderer = () => {
    renderer.dispose()
    renderer.forceContextLoss()
    renderer.domElement.remove()
    if (touchedHostPosition) host.style.position = ''
  }

  /* ----- 世界 ----- */

  const root = new THREE.Group()
  root.name = 'world-root'

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(FOG_COLOR)
  scene.fog = new THREE.FogExp2(FOG_COLOR, FOG_DENSITY)
  scene.add(root)

  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, CAMERA_NEAR, CAMERA_FAR)
  // YXZ：先绕 Y 转头，再绕 X 俯仰。默认的 XYZ 在 pitch 接近 ±85° 时会与 yaw
  // 耦合，表现为「抬头到顶时画面自己侧翻」，也就是万向节问题。
  camera.rotation.order = 'YXZ'
  scene.add(camera)

  /* ----- 光照 ----- */

  const ambient = new THREE.AmbientLight(AMBIENT_COLOR, AMBIENT_INTENSITY)
  const hemisphere = new THREE.HemisphereLight(SKY_TINT, GROUND_TINT, HEMISPHERE_INTENSITY)
  const rimLight = new THREE.DirectionalLight(RIM_COLOR, RIM_INTENSITY)
  rimLight.position.set(-0.62, 0.55, 0.55)
  const sunLight = new THREE.DirectionalLight(SUN_COLOR, SUN_INTENSITY)
  sunLight.position.set(-0.5, 0.82, -0.45)
  scene.add(ambient, hemisphere, rimLight, sunLight)

  /* ----- 玩家配置与初始状态 ----- */

  const playerConfig: PlayerConfig = {
    eyeHeight: config.player.eyeHeight ?? 1.68,
    radius: config.player.radius ?? 0.35,
    walkSpeed: config.player.walkSpeed ?? 3.2,
    runSpeed: config.player.runSpeed ?? 5.4,
    acceleration: config.player.acceleration ?? 0.22,
    lookSensitivity: config.player.lookSensitivity ?? 0.0022,
  }

  let player: PlayerState
  try {
    player = createPlayerState(playerConfig)
  } catch {
    // 并行模块的 `createPlayerState` 若不接受缺参数的配置，用契约给的默认值兜底，
    // 免得一个可省的参数把整个世界挡在门外。
    player = { x: 0, z: 0, yaw: 0, pitch: 0 }
  }

  /**
   * 落点过渡。`placePlayer` 不瞬移而是插值过去：契约说它用于「场景切换后的落点」，
   * 而第一人称下瞬移会让人失去方位感（不知道自己怎么到那儿的），
   * 半秒的滑行足以把这个信息补回来。
   */
  let placeFrom: PlayerState = { ...player }
  let placeTo: PlayerState = { ...player }
  /** 过渡进度，1 表示不在过渡中。 */
  let placeBlend = 1

  /* ----- 场景模块 ----- */

  const colliders: Collider[] = []
  const hotspots: Hotspot[] = []
  let sceneHandle: WorldSceneHandle
  const runtime: SceneRuntime = {
    three: THREE,
    root,
    // 固定种子：同一场景每次进入必须是同一片雨、同一批布景
    random: createRandom(config.scene.seed),
    aspect: 1,
  }

  try {
    sceneHandle = config.scene.build(runtime)
  } catch (error) {
    releaseRenderer()
    throw error
  }

  // 就地赋默认值而不是 `{...handle, ...}`：场景模块可能只返回 `{}`，
  // 而这里需要的是「数组一定存在」，松散的可选链会让下面每处调用都要防一次。
  if (!Array.isArray(sceneHandle.colliders)) sceneHandle.colliders = []
  if (!Array.isArray(sceneHandle.hotspots)) sceneHandle.hotspots = []
  if (!Array.isArray(sceneHandle.triggers)) sceneHandle.triggers = []
  colliders.push(...sceneHandle.colliders)
  hotspots.push(...sceneHandle.hotspots)

  /**
   * 转接闸门回调给宿主。
   *
   * 场景模块的 `onGateSatisfied` 是一个可写字段而不是构造参数——
   * 场景在 `build` 里拿不到宿主，而宿主又必须等 `build` 返回才有句柄。
   * 赋值放在这里（`build` 之后、帧循环之前），刚好补上这个时序缝隙：
   * 玩家不可能在场景装好之前就满足闸门。
   */
  if (config.onGate) sceneHandle.onGateSatisfied = config.onGate

  const interaction: InteractionSystem | null =
    hotspots.length > 0 || sceneHandle.triggers.length > 0
      ? createInteractionSystem({
          three: THREE,
          camera,
          hotspots,
          triggers: sceneHandle.triggers,
          // 刻意不把 `colliders` 转成遮挡体：`Collider` 只有 x/z 与半宽，没有高度，
          // 按同一个假设高度生成代理盒必然有一方是错的（矮看台挡住视线、高围墙挡不住）。
          // 「哪些东西挡视线」该由场景模块用真正的 mesh 声明，那是后续迭代的事。
        })
      : null

  /* ----- 雨 ----- */

  const rainRandom = runtime.random
  /**
   * 单次运算出来的雨量档位，两层共用同一个基准。
   * `RAIN_MOOD ** 2.2` 让档位在两端更陡：0.6 落在中段，
   * 想改成暴雨只需把它推到 0.9 附近，而不必重调两层各自的系数。
   */
  const rainLoad = RAIN_BASE_DENSITY + (RAIN_WALL_DENSITY - RAIN_BASE_DENSITY) * Math.pow(RAIN_MOOD, 2.2)
  /** 出生点中心。用玩家的初始位置而不是世界原点。 */
  const rainOrigin = { x: player.x, z: player.z }

  const rainLayers: RainLayer[] = [
    createRainLayer(
      {
        radius: 17,
        height: 13,
        // 近层占 12%：它的体积只有远层的 1/4（17² : 34²），
        // 按体积分会让近处的雨稀到看不见。
        count: Math.round(rainLoad * 0.12),
        size: RAIN_NEAR_SIZE,
        fall: RAIN_NEAR_FALL,
        drift: RAIN_DRIFT.near,
        stretch: RAIN_NEAR_STRETCH,
        opacity: RAIN_OPACITY.near,
        sway: RAIN_SWAY.near,
        order: 0,
      },
      rainRandom,
      rainOrigin,
    ),
    createRainLayer(
      {
        radius: 34,
        height: 15,
        count: Math.round((rainLoad * 0.88) / 4),
        size: RAIN_FAR_SIZE,
        fall: RAIN_FAR_FALL,
        drift: RAIN_DRIFT.far,
        stretch: RAIN_FAR_STRETCH,
        opacity: RAIN_OPACITY.far,
        sway: RAIN_SWAY.far,
        order: 1,
      },
      rainRandom,
      rainOrigin,
    ),
  ]

  const splash = createSplashLayer(rainRandom)

  scene.add(rainLayers[0].points, rainLayers[1].points, splash.points)

  /* ------------------------------------------------------------------ *
   * 内部实现（放在主流程之后，闭包引用上面所有变量）
   * ------------------------------------------------------------------ */

  function createSplashLayer(random: SceneRuntime['random']): RainLayer {
    const positions = new Float32Array(SPLASH_COUNT * 3)
    const size = new Float32Array(SPLASH_COUNT)
    const alpha = new Float32Array(SPLASH_COUNT)
    const phase = new Float32Array(SPLASH_COUNT)
    const stretch = new Float32Array(SPLASH_COUNT)

    for (let i = 0; i < SPLASH_COUNT; i += 1) {
      const offset = i * 3
      positions[offset] = random.range(-SPLASH_RADIUS, SPLASH_RADIUS)
      // 离地 1cm：低到从 1.68m 的视高看过去是一个压扁的椭圆（正是水花的角度），
      // 又足以躲开与地面共面的 z-fighting。
      positions[offset + 1] = 0.012
      positions[offset + 2] = random.range(-SPLASH_RADIUS, SPLASH_RADIUS)
      size[i] = random.range(SPLASH_SIZE.min, SPLASH_SIZE.max)
      alpha[i] = random.range(0.5, 1)
      phase[i] = random.unit()
      // 略压扁，让环看起来像水花而不是汽水盖
      stretch[i] = 0.75
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('aSizeWorld', new THREE.BufferAttribute(size, 1))
    geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1))
    geometry.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1))
    geometry.setAttribute('aStretch', new THREE.BufferAttribute(stretch, 1))
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), SPLASH_RADIUS * 1.6)

    const material = new THREE.ShaderMaterial({
      vertexShader: SPLASH_VERTEX_SHADER,
      fragmentShader: SPLASH_FRAGMENT_SHADER,
      uniforms: {
        uTime: { value: 0 },
        uViewport: { value: new THREE.Vector2(1, 1) },
        uCycle: { value: SPLASH_CYCLE },
        uLifetime: { value: SPLASH_LIFETIME },
        uColor: { value: new THREE.Color(RAIN_COLOR) },
        uOpacity: { value: SPLASH_OPACITY },
      },
      transparent: true,
      depthWrite: false,
      fog: false,
      blending: THREE.AdditiveBlending,
    })

    const points = new THREE.Points(geometry, material)
    points.renderOrder = 2
    points.frustumCulled = false

    return {
      points,
      material,
      positions,
      velocity: new Float32Array(0),
      drift: new Float32Array(0),
      radius: SPLASH_RADIUS,
      height: 0,
    }
  }

  /**
   * 骨架的全部对外能力都从这里产出：`ResizeObserver`、输入、帧循环与句柄方法。
   * 它必须在 `createWorld` 的闭包内，才能直接引用 `renderer` / `camera` /
   * `rainLayers` 这些局部变量；提到模块作用域会让它一个都看不到。
   */
  function buildHandle(): WorldHandle {
    /* ----- 尺寸 ----- */

    const bufferSize = new THREE.Vector2()

    const applySize = () => {
      const rect = host.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return

      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO))
      renderer.setSize(rect.width, rect.height, false)
      camera.aspect = rect.width / rect.height
      camera.updateProjectionMatrix()
      runtime.aspect = camera.aspect
      sceneHandle.resize?.(camera.aspect)

      // 点精灵尺寸的基准必须是**绘制缓冲**高度（设备像素），不是 CSS 像素：
      // 像素比会缩放 gl_PointSize。
      renderer.getDrawingBufferSize(bufferSize)
      for (const layer of rainLayers) layer.material.uniforms.uViewport.value.set(bufferSize.x, bufferSize.y)
      splash.material.uniforms.uViewport.value.set(bufferSize.x, bufferSize.y)
    }

      const resizeObserver = new ResizeObserver(applySize)
      resizeObserver.observe(host)
      applySize()

      /* ----- 输入 ----- */

      let pointerLocked = false
      let pendingActivate = false

      const input = createInput(renderer.domElement, {
        onLockChange: (locked) => {
          pointerLocked = locked
        },
        // 鼠标左键与触屏点击走同一条路径。第一人称下光标的唯一位置就是画面中心，
        // 所以「点在哪」不需要传下去。
        onAction: () => {
          pendingActivate = true
        },
      })

      /**
       * 用 input 的初始状态覆盖硬编码的 `false`。
       *
       * **触屏设备上这一段是必需的**：那里没有 `requestPointerLock`
       * （`canLock` 为假），input 把 `locked` 初始化为 `true`，
       * 但 `applyLock` 只在**状态变化**时通知，初始值从不产生变化。
       * 不同步的话骨架认为未锁定 → 引导层显示 → 玩家点它 →
       * `requestPointerLock()` 因 `!canLock` 直接返回 → 遮罩永不消失，
       * 而虚拟摇杆（z-index 4）还被遮罩（z-index 5）挡着，游戏完全卡死。
       */
      pointerLocked = input.isLocked()

      /* ----- 逐帧状态回报 ----- */

      let lastFocused: string | null = null
      let lastFocusedLabel: string | null = null
      let lastLocked: boolean | null = null

      /**
       * 去重是性能要求，不是可选项：宿主是 React，每帧派发一次「状态可能变了」
       * 等于把 setState 放进渲染循环，而准星文案一分钟也变不了几次。
       * 未锁定时没有准星，焦点恒为 null，也就没有「焦点变化」可言。
       *
       * 文案也参与去重比较：同一个热点换 `label` 只是重命名场景数据，
       * 不比较就会漏掉这次变化，准星上留着旧文案。
       */
      const report = (focused: string | null, focusedLabel: string | null, locked: boolean) => {
        if (focused === lastFocused && focusedLabel === lastFocusedLabel && locked === lastLocked) return
        lastFocused = focused
        lastFocusedLabel = focusedLabel
        lastLocked = locked
        // 显式判空再调用，不用 `config.onFrame?.()`：可选调用表达式被 TS 视作
        // `void`/`never`，紧随其后的语句会被判为不可达，函数因此「缺少 return」。
        if (config.onFrame) config.onFrame({ focusedHotspotId: focused, focusedHotspotLabel: focusedLabel, locked })
      }

      /* ----- 帧循环 ----- */

      let frame = 0
      let disposed = false
      let elapsed = 0
      let lastTime = performance.now()
      let visible = true
      let hidden = document.hidden
      let paused = false
      /** 停帧期间是否发生过需要补画的变化（尺寸变化、落点、暂停状态）。 */
      let needsRepaint = true

      const intersectionObserver = new IntersectionObserver(
        (entries) => {
          const next = entries.some((entry) => entry.isIntersecting)
          if (next === visible) return
          visible = next
          needsRepaint = true
        },
        { threshold: 0.05 },
      )
      intersectionObserver.observe(host)

      const handleVisibility = () => {
        hidden = document.hidden
        needsRepaint = true
      }
      document.addEventListener('visibilitychange', handleVisibility)

      const loop = (now: number) => {
        frame = window.requestAnimationFrame(loop)

        const rawDelta = (now - lastTime) / 1000
        // 钳制：切回标签页时 rAF 给出的第一个 delta 可能是几秒。
        // 下界也钳到 0：性能计时偶发回退时不该出现负的 delta。
        const delta = Math.min(Math.max(rawDelta, 0), MAX_DELTA)
        lastTime = now

        if (paused || !visible || hidden) {
          // 停帧，但允许一次「补画」：窗口变形后若一帧都不画，画布会停在旧尺寸上，
          // 看起来像卡死。代价是一次 render，远低于继续跑完整逻辑。
          if (needsRepaint) {
            needsRepaint = false
            renderer.render(scene, camera)
          }
          return
        }
        if (delta === 0) return

        elapsed += delta

        /* --- 输入 → 玩家 --- */

        const snapshot = input.poll(player.yaw, player.pitch)
        if (!paused) {
          player = stepPlayer(player, snapshot.move, playerConfig, colliders, delta)
          /**
           * 视角必须**单独**消费，不能并进 `stepPlayer`。
           *
           * `snapshot.look` 是这一帧累积的鼠标/触屏位移，`poll` 取走即清零；
           * 漏掉这一步的表现是「鼠标在转，但玩家永远朝 -Z 看」——
           * 位移被积累、又被每帧丢弃，整条链路静默失效而没有报错。
           *
           * 只在真有位移时调用：`applyLook` 会重算一次 pitch 钳制，
           * 每帧无条件调用等于每帧都在写同一个值，白白触发 React 之外的
           * 状态变更（`player` 是局部变量，但下面的相机同步会跟着跑）。
           */
          if (snapshot.look.x !== 0 || snapshot.look.y !== 0) {
            player = applyLook(player, snapshot.look.x, snapshot.look.y, playerConfig)
          }
        }

        if (pendingActivate) {
          pendingActivate = false
          interaction?.activate()
        }

        /* --- 落点过渡 --- */

        if (placeBlend < 1) {
          placeBlend = Math.min(1, placeBlend + delta / PLACE_DURATION)
          // smoothstep：起止都是零速度，落点不会像被弹进去
          const ease = placeBlend * placeBlend * (3 - 2 * placeBlend)
          player = {
            x: placeFrom.x + (placeTo.x - placeFrom.x) * ease,
            z: placeFrom.z + (placeTo.z - placeFrom.z) * ease,
            yaw: placeFrom.yaw + angleDelta(placeFrom.yaw, placeTo.yaw) * ease,
            pitch: placeFrom.pitch + (placeTo.pitch - placeFrom.pitch) * ease,
          }
        }

        /* --- 相机 --- */

        // 玩家位置是**脚底**，视点要加眼高。契约把位置定在脚底平面上，
        // 因为移动与碰撞都在那个平面上算；相机是它唯一的消费者。
        // 眼高取自 `playerConfig` 而非 `player`——`PlayerState` 只有 x/z/yaw/pitch，
        // 眼高是配置量，不属于会逐帧变化的状态。
        camera.position.set(player.x, playerConfig.eyeHeight, player.z)
        camera.rotation.y = player.yaw
        camera.rotation.x = player.pitch
        // 显式更新世界矩阵：交互的射线要用它，而 interaction.update 排在 render 之前。
        camera.updateMatrixWorld(true)

        /* --- 雨与涟漪 --- */

        for (const layer of rainLayers) updateRainLayer(layer, delta, elapsed, player.x, player.z, 0)

        // 涟漪与雨相反：它**贴地**，锚在玩家脚下即可，不做世界空间回绕。
        // 理由是两个缺陷都不可见——涟漪平均寿命只有 0.9×0.18 秒，
        // 而且水花的观感与位置无关（玩家不能通过地面水花判断自己走了多远，
        // 地面本身就在滑动，参照物比水花强得多）。为此换成世界空间回绕
        // 要多一份逐粒子取模，收益为零。
        splash.points.position.set(player.x, 0, player.z)
        splash.material.uniforms.uTime.value = elapsed

        /* --- 场景模块 --- */

        sceneHandle.update?.(elapsed, delta, player)

        /* --- 交互与回报 --- */

        let focused: string | null = null
        let focusedLabel: string | null = null
        if (interaction) {
          interaction.update(player, delta)
          // 未锁定时不报焦点：指针没被捕获时准星不该出现在屏幕上，
          // 此时报出的焦点只会让宿主显示一条点不动的提示。
          if (pointerLocked) {
            const hotspot = interaction.getFocusedHotspot()
            focused = hotspot ? hotspot.id : null
            focusedLabel = hotspot ? hotspot.label : null
          }
        }
        report(focused, focusedLabel, pointerLocked)

        /* --- 画 --- */

        renderer.render(scene, camera)
      }

      frame = window.requestAnimationFrame(loop)

      // 初始状态要立刻报一次，否则宿主会一直停在「等待首次状态」上
      report(null, null, pointerLocked)

      return {
        placePlayer(state) {
          placeFrom = { ...player }
          placeTo = {
            x: state.x ?? player.x,
            z: state.z ?? player.z,
            yaw: state.yaw ?? player.yaw,
            pitch: state.pitch ?? player.pitch,
          }
          placeBlend = 0
          // 过渡期间不该响应输入，否则走路会跟过渡抢同一个 player 对象
          input.reset()
          needsRepaint = true
        },

        getPlayer() {
          // 返回副本：调用方拿到的东西改不动下一帧的位置
          return { ...player }
        },

        setPaused(next) {
          if (paused === next) return
          paused = next
          // 恢复时必须把 lastTime 拉回当前时刻，否则暂停期间累积的 delta
          // 会在恢复的第一帧被钳成 MAX_DELTA，表现为一个突兀的小跳。
          lastTime = performance.now()
          if (!paused) input.reset()
          needsRepaint = true
        },

        /**
         * 请求指针锁定。
         *
         * 转给 `input` 去做：它持有 canvas，也维护着 `locked` 状态与
         * `pointerlockchange` / `pointerlockerror` 的监听。骨架自己调
         * `requestPointerLock()` 的话，`locked` 状态就有两个写入点，
         * 而浏览器拒绝请求时（非手势、冷却期内）只有 input 那侧知道要回退。
         *
         * 宿主必须在点击处理器里**同步**调用这个函数；详见契约里的说明。
         */
        requestPointerLock() {
          input.requestLock()
        },

        activateAtCenter() {
          // 骨架不做拾取，交互层才是唯一的判定方。
          // 这里刻意再判一次锁定：解锁状态下点画面是「请求进入场景」，
          // 不该顺便触发准星上那个热点的叙事层。
          if (!pointerLocked) return false
          return interaction?.activate() ?? false
        },

        dispose() {
          if (disposed) return
          disposed = true

          window.cancelAnimationFrame(frame)
          resizeObserver.disconnect()
          intersectionObserver.disconnect()
          document.removeEventListener('visibilitychange', handleVisibility)
          input.dispose()

          // 先断交互：它会补发一次 null 焦点，那是宿主 UI 的收尾
          interaction?.dispose()

          // 递归回收场景模块加进 root 的一切
          disposeSubtree(root)

          for (const layer of rainLayers) {
            layer.points.geometry.dispose()
            layer.material.dispose()
          }
          rainLayers.length = 0
          splash.points.geometry.dispose()
          splash.material.dispose()

          root.clear()
          scene.clear()

          // 显式释放上下文：React 严格模式会重复挂载，
          // 不回收会很快耗尽浏览器的 WebGL 上下文配额。
          releaseRenderer()
        },
      }
    }

  return buildHandle()
}
