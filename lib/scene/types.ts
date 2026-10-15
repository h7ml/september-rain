import type * as Three from 'three'

/**
 * 场景配方契约。
 *
 * 设计取舍：**不是** 18 个各自独立的场景引擎，也不是「6 类场景换配色」。
 * 而是「一个通用渲染骨架 + 18 份声明式配方」——配方只描述
 * 这片雨/这场雪长什么样、相机怎么呼吸、环境光怎么落，
 * 具体的缓冲区分配、着色器编译、资源回收全部由骨架统一负责。
 *
 * 这样既满足逐章的画面差异，又不会把 18 套 WebGL 生命周期的 bug 写到 18 个地方。
 */

/** 场景可用的调色板：骨架会把它插值成真实的三维颜色。 */
export type ScenePalette = {
  /** 最远处的天色 */
  sky: number
  /** 中景的雾与地平线 */
  horizon: number
  /** 近景粒子的主色 */
  particle: number
  /** 光源 / 光晕的暖色 */
  glow: number
  /** 画面整体压暗值，0 为不压 */
  vignette: number
}

/** 粒子场：雨、雪、叶、尘埃、海沫共用同一套实例化点精灵。 */
export type ParticleField = {
  /** 粒子数量，直接决定性能开销 */
  count: number
  /**
   * 生成单个粒子的初始状态。
   * `x` / `y` 用**归一化画幅坐标**声明：0 为画面中心，±0.5 为画幅边缘；
   * `z` 为世界深度（负值更远）。骨架在 `resize` 时按真实世界尺寸换算，
   * 所以同一份配方在窄条画幅和大屏下构图一致。
   */
  spawn: (random: import('./random').Random) => {
    x: number
    y: number
    z: number
    /** 世界单位下的半径，1 约等于 1/1000 画幅高 */
    size: number
    /** 0-1 的亮度权重 */
    alpha: number
  }
  /** 每帧位移，归一化单位/秒；返回 false 表示该粒子需要回绕 */
  velocity: (random: import('./random').Random) => { x: number; y: number; z: number }
  /** 粒子越界后的重生策略 */
  wrap: 'top' | 'left' | 'none'
  /** 整体色彩 */
  color: number
  /** 整体亮度倍率 */
  opacity: number
  /** 点精灵边缘硬度，越小越像光斑，越大越像绒球 */
  softness: number
  /**
   * 纵向拉伸：1 为圆形（雪、海沫、灯火），
   * 越大越细长（雨丝约 0.35，飘落的叶约 0.6）。
   */
  stretch: number
}

/** 地平线：给窄条画面一个稳定的远景参照，避免场景「悬空」。 */
export type HorizonLayer = {
  color: number
  /** 0 为画面底部，1 为顶部 */
  at: number
  /** 上下渐变高度，0 为一条硬线 */
  softness: number
  opacity: number
}

/** 光晕：太阳、街灯、车窗、屏幕、远处灯火。 */
export type GlowLight = {
  color: number
  /** 归一化屏幕坐标，x ∈ [-1, 1]，y ∈ [-1, 1] */
  x: number
  y: number
  radius: number
  opacity: number
  /** 呼吸周期，秒；0 表示恒定不闪 */
  pulse: number
}

/** 相机行为：视差之外的环境运镜。 */
export type CameraMotion = {
  /** 自动漂移幅度 */
  driftX: number
  driftY: number
  /** 漂移周期，秒 */
  period: number
  /** 视差跟随鼠标的敏感度 */
  parallax: number
  /** 鼠标推近镜头的距离 */
  dolly: number
}

/** 交互反馈：悬停选项 / 点击选项时场景如何回应。 */
export type SceneReaction = {
  /** 悬停时粒子密度倍率（作用于不透明度而非真实增删粒子） */
  hoverDensity: number
  /** 悬停时相机推近比例 */
  hoverDolly: number
  /** 悬停时色调偏移，正为暖、负为冷 */
  hoverWarmth: number
  /** 点击时闪光强度 */
  flashStrength: number
}

/** 一份完整的场景配方。 */
export type SceneRecipe = {
  /** 章节索引，用于调试与快速定位 */
  id: string
  /** 中文场景名，显示在画面右下角 */
  caption: string
  /** 章节标题，回车换行前的原始标题 */
  chapter: string
  palette: ScenePalette
  particles: ParticleField[]
  horizons: HorizonLayer[]
  glows: GlowLight[]
  camera: CameraMotion
  reaction: SceneReaction
  /** 场景专属的装饰物：看台、教学楼、栈桥、邮筒…… */
  props?: SceneProp[]
}

/**
 * 装饰物：用极简几何体勾出场景轮廓。
 * 窄条画幅（112px 高）里写实建模没有意义，
 * 剪影式方块反而更像记忆里被简化过的形状。
 */
export type SceneProp = {
  kind: 'slab' | 'pillar' | 'arch' | 'triangle'
  x: number
  y: number
  width: number
  height: number
  color: number
  opacity: number
  /** 呼吸或摇晃周期，0 为静止 */
  sway: number
}

/** 骨架交给配方的运行时上下文。 */
export type SceneRuntime = {
  three: typeof Three
  scene: Three.Scene
  camera: Three.PerspectiveCamera
  random: import('./random').Random
  /**
   * 粒子密度系数，1 表示配方里声明的数量即为最终数量。
   *
   * 配方的 `count` 是按「窄条画幅」的手感调校的（雨 220 颗在一小块区域里正合适），
   * 但当场景铺满整个视口后面积会大十几倍，同样的数量就稀得看不见。
   * 由宿主按实际画布面积算出系数传入，配方不必为不同宿主各写一份。
   */
  density: number
}

/** 配方构建产物：骨架持有它，负责每帧更新与销毁。 */
export type SceneBundle = {
  /** 每帧调用，delta 为秒 */
  update: (elapsed: number, delta: number, shared: SceneSharedState) => void
  /**
   * 重新布局。参数是**画布的设备像素高度**。
   *
   * 之所以不传世界尺寸：世界尺寸与相机视锥、图层深度都有关，
   * 交给骨架按各图层深度自行计算才不会被调用方算错——早期版本
   * 由宿主传入世界宽高，导致所有元素按错误基准缩放，画面只剩中间一小块。
   */
  resize: (framePixelHeight: number) => void
  dispose: () => void
}

/** 由骨架维护、配方可读的共享状态。 */
export type SceneSharedState = {
  /** 鼠标归一化位置，[-1, 1] */
  pointerX: number
  pointerY: number
  /** 悬停强度，0-1，带阻尼 */
  hover: number
  /** 点击闪光剩余强度，0-1 */
  flash: number
  /**
   * 本次闪光的颜色，`#rrggbb`。
   * 由点击的那个选项决定（排位越靠后越暖），所以放在共享状态里，
   * 而不是由场景配方固定——同一场雨，两种选择应该闪出不同颜色的光。
   */
  flashColor: string
  /** 玩家历史选择累计的暖度偏移，负冷正暖 */
  warmth: number
  /** 降级模式下滑块提供的静态进度，0-1 */
  progress: number
}
