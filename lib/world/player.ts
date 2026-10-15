import { damping, lerp } from '../scene/random'
import type { Collider, PlayerConfig, PlayerState } from './types'

/**
 * 第一人称玩家控制器：把「输入 + 上一帧状态」推成「这一帧状态」。
 *
 * ## 为什么是纯函数
 *
 * `stepPlayer` 不修改传入的 `state`，而是返回新对象。渲染骨架在同一帧里要
 * 读旧状态（给场景模块传只读快照、算落点插值），又要算新状态；一旦就地修改，
 * 场景模块拿到的「玩家在哪」会和骨架手里的不是同一个值，表现为
 * 「触发器晚一帧、准星提示慢半拍」这类没法靠断点看出来的错位。
 *
 * 唯一的内存是模块级的 `velocityCache`，见它的注释——`PlayerState` 是冻结契约，
 * 装不下速度，而 `acceleration` 这个手感参数必须有地方存速度才能生效。
 *
 * ## 单位
 *
 * 长度米、角度弧度、速度米/秒，与 `types.ts` 的约定一致。
 * `PlayerState` 里的位置是**脚底**：碰撞与移动都在脚底平面上做二维解算，
 * 相机高度由 `getEyeHeight` 单独算。把位置定义成眼睛是另一种常见做法，
 * 但那样每种身高都要改碰撞半径，而且钻门框时会莫名撞头。
 *
 * ## 帧循环里的调用顺序
 *
 * 1. `applyLook` —— 消费指针位移，改 yaw / pitch
 * 2. `stepPlayer` —— 移动与碰撞解算
 */

/**
 * 默认玩家参数。
 *
 * 这几个数字决定「走路的重量感」，比任何美术资源都更影响第一人称的舒适度：
 * - `walkSpeed` 3.2m/s 明显快于真人（约 1.4m/s）。第一人称下用真人速度会让人觉得
 *   「像在泥里走」——没有实景参照物时，速度感必须靠数值补偿。
 * - `acceleration` 0.22 是 60fps 下的每帧趋近比例，约 4 帧到六成（见 `damping`）。
 *   1.0 是瞬时起步，手感会「僵硬」；0.05 像踩在油上刹不住。
 * - `lookSensitivity` 0.0022 弧度/像素：横扫 1920px 约转 242°，与主流射击游戏
 *   默认档位接近。这类数值最后一定要真人试玩定档，纸面推算只能保证数量级对。
 */
export const DEFAULT_PLAYER_CONFIG: PlayerConfig = {
  eyeHeight: 1.68,
  radius: 0.35,
  walkSpeed: 3.2,
  runSpeed: 5.4,
  acceleration: 0.22,
  lookSensitivity: 0.0022,
}

/**
 * 单帧位移上限（米）。0.4m 大于跑满 1/60 秒的距离（0.09m），
 * 所以正常情况下永不触发；它挡的是「被钳制后依然异常的 delta」造成的穿墙，
 * 而穿透之后每帧都在「推出、再陷入」之间弹，比穿墙本身更难排查。
 */
const MAX_STEP_DISTANCE = 0.4

/**
 * 时间步上限（秒）。切标签页、断点续帧、调试器暂停都会送来几百毫秒的 `delta`，
 * 不钳制的话一帧就穿过整面墙。骨架也钳了一次，这里是防御性重复——
 * 这个函数的正确性不该依赖调用方的自律。
 */
const MAX_FRAME_DELTA = 0.1

/**
 * 单次移动的碰撞解算迭代次数。
 *
 * 墙角是两个盒体同时接触：一次解算把玩家从 A 推出去，往往正好推进 B，
 * 下一帧再被推回来，就是肉眼可见的抖动。3 次足够收敛（每轮都在缩小的相交量上
 * 修正），再多只是浪费——真正的大穿透由 `MAX_STEP_DISTANCE` 挡。
 */
const SOLVER_ITERATIONS = 3

/**
 * 俯仰上限（弧度）。
 *
 * 必须钳制，且不能放宽到 ±90°：在 ±90° 处视线与世界上轴共线，
 * 相机的 up 向量与视线叉乘为零，画面会突然翻转（roll 跳到 180°）；
 * 再往外就是万向节死锁，转头会变成「画面绕自己旋转」。
 * 85° 留的余量让「抬头看天顶」这个动作仍然保持方向感。
 */
const MAX_PITCH = (85 * Math.PI) / 180

/**
 * 单帧转向位移的软上限（像素）。
 *
 * 指针锁定刚生效、系统弹窗或输入法候选框抢走焦点的那一帧，浏览器可能一次性
 * 补上几百像素的 `movementX`，表现为「刚进场景视角就甩到天边」。
 * 这里做软钳制（超出后开平方衰减）而不是硬截断：正常的高灵敏度甩头只被削掉
 * 一点点，异常尖峰会被压到可控范围；硬截断会在限幅处留下「同一个动作有时灵
 * 有时不灵」的手感断层。
 */
const MAX_LOOK_STEP = 140

/**
 * 上一帧的速度，按 `PlayerState` 对象缓存。
 *
 * 为什么需要它：`acceleration` 想要的是「速度趋近目标速度」，就必须记住上一帧
 * 速度；而 `PlayerState` 是冻结契约（只有 x/z/yaw/pitch），不能加字段，
 * 也不想为了这个把状态改成「就地可变」。
 *
 * 为什么是 `WeakMap` 而不是一个模块级变量：骨架偶尔会在同一帧里对同一个状态
 * 算两次（落点过渡、测试），单一变量会被后一次覆盖。按状态对象索引意味着
 * 「同样的输入得到同样的输出」，弱引用也保证这些短暂对象能被回收。
 */
const velocityCache = new WeakMap<PlayerState, { vx: number; vz: number }>()

const ZERO_VELOCITY = { vx: 0, vz: 0 }

/** 随机对数保护：NaN 一旦写进状态会永久传播（相机直接消失），必须在这里挡掉。 */
function finite(value: number | undefined, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function clamp(value: number, min: number, max: number) {
  return value < min ? min : value > max ? max : value
}

function clampPitch(pitch: number) {
  return clamp(finite(pitch), -MAX_PITCH, MAX_PITCH)
}

/** 软钳制：限幅内原样返回，超出部分开平方，保证函数连续且单调。 */
function softClamp(value: number, limit: number) {
  const magnitude = Math.abs(value)
  if (magnitude <= limit) return value
  return Math.sign(value) * (limit + Math.sqrt(magnitude - limit))
}

/**
 * 构造玩家状态。`spawn` 允许只给一部分字段，其余取默认（原点、朝向 -Z）。
 *
 * `config` 目前不参与推导，签名仍然保留：骨架已按 `(config, spawn)` 调用，
 * 而「用 `radius` 把出生点从墙里推出来」这类校正迟早要加，到时不必改调用点。
 */
export function createPlayerState(config: PlayerConfig, spawn: Partial<PlayerState> = {}): PlayerState {
  void config
  return {
    x: finite(spawn.x),
    z: finite(spawn.z),
    yaw: finite(spawn.yaw),
    pitch: clampPitch(finite(spawn.pitch)),
  }
}

/**
 * 消费一次视角位移（鼠标像素 / 触屏拖动像素），返回新的朝向。
 *
 * 单独成函数而不是塞进 `stepPlayer`：视角的输入源（指针锁定的 movementX/Y、
 * 触屏拖动）和移动的输入源完全无关，混在一起会让「暂停时还能转头」这类需求
 * 没法表达。
 *
 * 符号约定：向右移动鼠标应当向右转，而 three.js 的 Y 轴右手系里绕 +Y 旋转是
 * 逆时针，所以 `yaw` 减小才是向右——故为减号。`pitch` 同理，鼠标下移是低头，
 * 也是减号。这两处符号写反了的表现是「视角跟着鼠标反着跑」，一眼可见。
 */
export function applyLook(
  state: PlayerState,
  movementX: number,
  movementY: number,
  config: PlayerConfig,
): PlayerState {
  const dx = softClamp(finite(movementX), MAX_LOOK_STEP)
  const dy = softClamp(finite(movementY), MAX_LOOK_STEP)
  const sensitivity = finite(config.lookSensitivity, DEFAULT_PLAYER_CONFIG.lookSensitivity)

  return {
    ...state,
    // yaw 不钳制，可以无限累加：绕圈走回原角度是这类游戏里最基本的行为。
    yaw: finite(state.yaw) - dx * sensitivity,
    pitch: clampPitch(finite(state.pitch) - dy * sensitivity),
  }
}

/** 移动输入。键盘与虚拟摇杆都填成这个形状，两个分量都在 [-1, 1]。 */
export type PlayerMoveInput = {
  /** 前后：+1 前进，-1 后退 */
  forward: number
  /** 左右：+1 右移，-1 左移 */
  strafe: number
  /** 是否按住跑步键 */
  run: boolean
}

/**
 * 推进一步：加速度阻尼、方向合成、碰撞解算。纯函数，返回新状态。
 *
 * 不修改 `yaw` / `pitch`——视角只由 `applyLook` 改，这样暂停、过场、自动运镜
 * 这些「只锁视角不锁移动」的需求才有地方挂。
 */
export function stepPlayer(
  state: PlayerState,
  input: PlayerMoveInput,
  config: PlayerConfig,
  colliders: Collider[],
  delta: number,
): PlayerState {
  const step = clamp(finite(delta), 0, MAX_FRAME_DELTA)
  if (step === 0) return { ...state, pitch: clampPitch(state.pitch) }

  /* ---------- 方向合成 ---------- */

  // 斜向输入的模长是 √2，直接乘速度会让斜着走比直着快 41%——第一人称下
  // 表现为「贴墙斜走能追上别人」，是所有移动系统最经典的一处漏算。
  // 归一化放在这里而不是输入层：输入层可能同时叠着键盘和摇杆，
  // 速度规则只应该由一个地方决定。
  const magnitude = Math.hypot(finite(input.forward), finite(input.strafe))
  const scale = magnitude > 1 ? 1 / magnitude : 1
  const forward = finite(input.forward) * scale
  const strafe = finite(input.strafe) * scale

  const sin = Math.sin(finite(state.yaw))
  const cos = Math.cos(finite(state.yaw))

  // three.js 相机在 yaw=0 时朝 -Z 看，所以「前方」是 (-sin, -cos)；
  // 「右方」是相机局部 +X 轴，即 (cos, -sin)。矩阵推导见 types.ts 的 YXZ 说明。
  const dirX = -sin * forward + cos * strafe
  const dirZ = -cos * forward - sin * strafe

  /* ---------- 加速阻尼 ---------- */

  const speed = input.run ? finite(config.runSpeed, DEFAULT_PLAYER_CONFIG.runSpeed) : finite(config.walkSpeed, DEFAULT_PLAYER_CONFIG.walkSpeed)
  const previous = velocityCache.get(state) ?? ZERO_VELOCITY
  const blend = damping(clamp(finite(config.acceleration, DEFAULT_PLAYER_CONFIG.acceleration), 0, 1), step)
  const vx = lerp(previous.vx, dirX * speed, blend)
  const vz = lerp(previous.vz, dirZ * speed, blend)

  const stepX = clamp(vx * step, -MAX_STEP_DISTANCE, MAX_STEP_DISTANCE)
  const stepZ = clamp(vz * step, -MAX_STEP_DISTANCE, MAX_STEP_DISTANCE)

  /* ---------- 分轴滑动解算 ---------- */

  // 先推 x、解算，再推 z、解算。选它而不是「算完整体位移再沿法线投影」：
  // 整体投影在一次求交里会把两个分量一起吃掉，斜着撞墙时表现为「贴着墙走却
  // 走不动」；分轴处理时被挡住的轴停下来，另一轴照常走完——滑行是天然结果，
  // 而不是需要分辨「这次撞的是哪面墙」的特例。
  // 代价是撞内凹墙角时可能先拐一下再拐回来，在这个只有盒子和圆柱、
  // 且没有高速移动的场景里可以接受。
  const afterX = moveAlongAxis(finite(state.x), finite(state.z), stepX, 0, config.radius, colliders)
  const afterZ = moveAlongAxis(afterX.x, afterX.z, 0, stepZ, config.radius, colliders)

  // 坐标出口也过滤一次：NaN 一旦写进状态就会永久传播——相机位置变成 NaN，
  // 画面直接消失，而且之后的每一帧都还在传染（`Math.min(NaN, x)` 仍是 NaN，
  // 现有的 clamp 拦不住）。在唯一改写坐标的地方挡住，比在每个读取点做防御便宜。
  const next: PlayerState = { ...state, x: finite(afterZ.x), z: finite(afterZ.z) }

  // 速度由**实际**位移反推，而不是沿用期望速度。这一步是撞墙手感的关键：
  // 撞上后速度立刻归零，不会在墙里攒下「弹性」，松手瞬间被弹出去；
  // 沿墙滑行时也只有切向分量被保留下来。
  velocityCache.set(next, {
    vx: (afterZ.x - state.x) / step,
    vz: (afterZ.z - state.z) / step,
  })

  return next
}

/** 沿单一轴推进并解算碰撞。另一个轴的分量恒为 0，见 `stepPlayer` 的说明。 */
function moveAlongAxis(
  x: number,
  z: number,
  dx: number,
  dz: number,
  radius: number,
  colliders: Collider[],
): { x: number; z: number } {
  let nextX = x + dx
  let nextZ = z + dz

  for (let iteration = 0; iteration < SOLVER_ITERATIONS; iteration++) {
    let corrected = false
    for (const collider of colliders) {
      const fixed = resolveCircleAgainst(nextX, nextZ, radius, collider)
      if (!fixed) continue
      nextX = fixed.x
      nextZ = fixed.z
      corrected = true
    }
    // 一轮下来没有任何修正，说明已经分离，后面的迭代是纯浪费。
    if (!corrected) break
  }

  return { x: nextX, z: nextZ }
}

/**
 * 把玩家（xz 平面上的圆）从单个碰撞体里推出来，返回修正后的位置；
 * 返回 `null` 表示没有侵入。
 *
 * 这就是「不能穿墙、不能穿树」的全部实现：圆-盒用最近点法，圆-圆用圆心连线。
 * 两者都有解析解，不需要物理引擎。
 */
function resolveCircleAgainst(
  x: number,
  z: number,
  radius: number,
  collider: Collider,
): { x: number; z: number } | null {
  if (collider.kind === 'cylinder') {
    // 圆 vs 圆柱：沿两圆心连线推到「半径和」处。连线方向就是接触法线，
    // 所以推出方向恒为径向，绕树走会很顺，不会出现「绕着绕着被甩开」。
    const dx = x - collider.x
    const dz = z - collider.z
    const minDistance = radius + collider.radius
    const distance = Math.hypot(dx, dz)
    if (distance >= minDistance) return null
    if (distance < 1e-6) {
      // 圆心与轴心重合，法线无从定义。任选一个方向推出去，避免除以零。
      return { x: collider.x + minDistance, z: collider.z }
    }
    const push = (minDistance - distance) / distance
    return { x: x + dx * push, z: z + dz * push }
  }

  // 圆 vs 轴对齐盒：把圆心按轴钳制到盒体范围得到最近点，再从最近点指向圆心
  // 推出。盒体四角会自然得到圆角——这正是要的：贴墙走过拐角时不会被角卡住。
  const dx = x - collider.x
  const dz = z - collider.z
  const gapX = collider.halfX + radius - Math.abs(dx)
  const gapZ = collider.halfZ + radius - Math.abs(dz)
  // 分离轴快速剔除：任一轴上的间距超过半径和就绝不相交。
  if (gapX <= 0 || gapZ <= 0) return null

  const insideX = Math.abs(dx) <= collider.halfX
  const insideZ = Math.abs(dz) <= collider.halfZ
  if (insideX && insideZ) {
    // 圆心已在盒体内部：最近点就是圆心自身，法线消失。这不是理论情形——
    // `placePlayer` 把玩家丢进建筑、或一帧位移过大陷进去半米，都会走到这里。
    // 按最小穿透轴推出，方向与代价都最小。
    if (gapX < gapZ) {
      return { x: collider.x + (dx >= 0 ? 1 : -1) * (collider.halfX + radius), z }
    }
    return { x, z: collider.z + (dz >= 0 ? 1 : -1) * (collider.halfZ + radius) }
  }

  const nearX = clamp(dx, -collider.halfX, collider.halfX)
  const nearZ = clamp(dz, -collider.halfZ, collider.halfZ)
  const offsetX = dx - nearX
  const offsetZ = dz - nearZ
  const distance = Math.hypot(offsetX, offsetZ)
  if (distance >= radius) return null

  // 此处 distance 一定 > 0：圆心在体外时最近点至少在一个轴上与它分离，
  // 绝不会等于圆心自身（那属于上面的 inside 分支）。
  const push = (radius - distance) / distance
  return { x: x + offsetX * push, z: z + offsetZ * push }
}

/* ------------------------------------------------------------------ *
 * 地面
 * ------------------------------------------------------------------ */

/**
 * 采样 (x, z) 处的地面高度（米）。
 *
 * 第一版恒为 0：剪影风不需要起伏地形，而且高度场会把碰撞从「二维圆-圆/圆-盒」
 * 升级成「三维投影与台阶攀爬」，代价远大于收益。
 *
 * 之所以仍然包成函数、并留出 `terrain` 参数：地形是这类空间最容易追加的东西
 * （一条坡道、一段看台台阶），到那天只需要实现一个采样函数，所有调用点
 * 已经在读同一个入口，不必再满项目找「哪里假设了 y=0」。
 * 注意高度场一旦引入，`stepPlayer` 里还要加「坡度超过阈值就滑落」，
 * 否则玩家能沿着任意陡的坡走上去。
 */
export function getGroundHeight(x: number, z: number, terrain?: (x: number, z: number) => number): number {
  void x
  void z
  return terrain ? terrain(x, z) : 0
}

/**
 * 由脚底位置算相机高度（世界坐标 y）。
 *
 * 是「脚底 + 眼高」而不是直接用 `eyeHeight`：位置换成坡道高度之后，
 * 把相机钉死在 1.68 米就是最典型的下陷 bug——人走上坡，相机还在原地。
 */
export function getEyeHeight(config: PlayerConfig, groundHeight = 0): number {
  return finite(groundHeight) + finite(config.eyeHeight, DEFAULT_PLAYER_CONFIG.eyeHeight)
}
