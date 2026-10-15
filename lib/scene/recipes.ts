import type { SceneRecipe } from './types'

/**
 * 18 章逐章配方。
 *
 * 章节与 `app/page.tsx` 的 `defaultChapters` 一一对应（索引 0-17，含终章）。
 * 每份配方只声明「这一章的画面由什么构成」，不碰任何 WebGL 生命周期。
 *
 * 世界坐标约定：相机位于原点朝 -Z，可见世界高度 `viewHeight`、
 * 宽度 `viewWidth`（由骨架按 112px 高的画幅与视锥换算），
 * 所以配方里的坐标统一用 `viewWidth/viewHeight` 的比例表达，
 * 再由骨架在 `resize` 时重新换算——分辨率变化不会破坏构图。
 */

/** 配方里统一用「占画幅的比例」声明位置，骨架负责换算成世界坐标。 */
const W = 1
const H = 1

export const sceneRecipes: SceneRecipe[] = [
  /* 01 九月 · 看台上的白裙子 —— 军训操场的雨 */
  {
    id: 'chapter-01',
    chapter: '看台上的白裙子',
    caption: '军训操场 · 雨',
    palette: { sky: 0x6d847f, horizon: 0x304042, particle: 0xc2d4d2, glow: 0xc8a878, vignette: 0.303 },
    particles: [
      {
        count: 220,
        spawn: (random) => ({ x: random.swing(0.65), y: random.range(-0.5, 1.15), z: random.range(-1.5, 0), size: 0.012, alpha: random.range(0.3, 0.85) }),
        velocity: () => ({ x: -0.055, y: -0.62, z: 0 }),
        wrap: 'top',
        color: 0xd8e6e4,
        opacity: 0.5,
        softness: 0.42,
        stretch: 0.34,
      },
      {
        count: 90,
        spawn: (random) => ({ x: random.swing(0.7), y: random.range(-0.4, 0.6), z: random.range(-1, 0), size: 0.0072, alpha: random.range(0.12, 0.32) }),
        velocity: () => ({ x: -0.02, y: -0.16, z: 0 }),
        wrap: 'top',
        color: 0x9fb3ae,
        opacity: 0.2,
        softness: 1,
        stretch: 1.0,
      },
    ],
    horizons: [{ color: 0x7d8f88, at: 0.42, softness: 0.05, opacity: 0.5 }],
    glows: [{ color: 0xc8a878, x: 0.55, y: 0.45, radius: 0.5, opacity: 0.16, pulse: 9 }],
    camera: { driftX: 0.05, driftY: 0.02, period: 26, parallax: 0.05, dolly: 0.035 },
    reaction: { hoverDensity: 1.65, hoverDolly: 0.03, hoverWarmth: 0.4, flashStrength: 0.6 },
    props: [
      { kind: 'slab', x: 0.42, y: 0.34, width: 0.62, height: 0.05, color: 0x0d1314, opacity: 0.85, sway: 0 },
      { kind: 'slab', x: 0.42, y: 0.42, width: 0.5, height: 0.05, color: 0x101718, opacity: 0.85, sway: 0 },
      { kind: 'pillar', x: -0.62, y: -0.18, width: 0.012, height: 0.9, color: 0x0b1112, opacity: 0.7, sway: 0 },
      { kind: 'pillar', x: -0.3, y: -0.18, width: 0.012, height: 0.9, color: 0x0b1112, opacity: 0.7, sway: 0 },
    ],
  },

  /* 02 雨天 · 她只回了一个字 —— 咖啡店的玻璃雨痕 */
  {
    id: 'chapter-02',
    chapter: '她只回了一个字',
    caption: '玻璃上的雨',
    palette: { sky: 0x4c5e62, horizon: 0x263035, particle: 0xbcd3d6, glow: 0xd8b988, vignette: 0.341 },
    particles: [
      {
        count: 160,
        spawn: (random) => ({ x: random.swing(0.8), y: random.range(-0.3, 1.2), z: random.range(-2, -0.2), size: random.range(0.0096, 0.0272), alpha: random.range(0.25, 0.7) }),
        velocity: () => ({ x: -0.07, y: -0.34, z: 0 }),
        wrap: 'top',
        color: 0xcfe2e4,
        opacity: 0.42,
        softness: 0.5,
        stretch: 0.42,
      },
      {
        count: 120,
        spawn: (random) => ({ x: random.swing(0.85), y: random.range(-0.5, 1.1), z: random.range(-1, 0), size: random.range(0.0048, 0.0112), alpha: random.range(0.1, 0.4) }),
        velocity: () => ({ x: -0.018, y: -0.06, z: 0 }),
        wrap: 'top',
        color: 0xa8c3c6,
        opacity: 0.26,
        softness: 0.8,
        stretch: 0.85,
      },
    ],
    horizons: [{ color: 0x5d7176, at: 0.5, softness: 0.16, opacity: 0.34 }],
    glows: [
      { color: 0xd8b988, x: -0.42, y: 0.1, radius: 0.34, opacity: 0.22, pulse: 7 },
      { color: 0x9fc7cf, x: 0.5, y: 0.3, radius: 0.3, opacity: 0.14, pulse: 0 },
    ],
    camera: { driftX: 0.03, driftY: 0.02, period: 22, parallax: 0.06, dolly: 0.05 },
    reaction: { hoverDensity: 1.5, hoverDolly: 0.035, hoverWarmth: 0.5, flashStrength: 0.7 },
    props: [
      { kind: 'slab', x: 0, y: -0.3, width: 1.2, height: 0.12, color: 0x0a0e0f, opacity: 0.75, sway: 0 },
      { kind: 'pillar', x: 0.24, y: 0.2, width: 0.006, height: 1, color: 0x131a1b, opacity: 0.5, sway: 0 },
    ],
  },

  /* 03 初冬 · 一把伞的距离 —— 银杏路的落叶与雨 */
  {
    id: 'chapter-03',
    chapter: '一把伞的距离',
    caption: '银杏路 · 初冬',
    palette: { sky: 0x717d92, horizon: 0x333942, particle: 0xd9b46a, glow: 0xd8b06a, vignette: 0.275 },
    particles: [
      {
        count: 70,
        spawn: (random) => ({ x: random.swing(0.8), y: random.range(0, 1.2), z: random.range(-2, -0.3), size: random.range(0.0208, 0.0416), alpha: random.range(0.45, 0.92) }),
        velocity: (random) => ({ x: random.range(-0.14, -0.04), y: random.range(-0.24, -0.1), z: 0 }),
        wrap: 'top',
        color: 0xe0b662,
        opacity: 0.85,
        softness: 0.95,
        stretch: 0.62,
      },
      {
        count: 150,
        spawn: (random) => ({ x: random.swing(0.7), y: random.range(-0.4, 1.2), z: random.range(-1.5, 0), size: 0.0096, alpha: random.range(0.2, 0.6) }),
        velocity: () => ({ x: -0.05, y: -0.5, z: 0 }),
        wrap: 'top',
        color: 0xcbd8d6,
        opacity: 0.36,
        softness: 0.45,
        stretch: 0.4,
      },
    ],
    horizons: [{ color: 0x8a7648, at: 0.38, softness: 0.07, opacity: 0.45 }],
    glows: [{ color: 0xd8b06a, x: 0.3, y: 0.5, radius: 0.42, opacity: 0.2, pulse: 11 }],
    camera: { driftX: 0.06, driftY: 0.025, period: 24, parallax: 0.07, dolly: 0.04 },
    reaction: { hoverDensity: 1.4, hoverDolly: 0.03, hoverWarmth: 0.7, flashStrength: 0.75 },
    props: [
      { kind: 'pillar', x: -0.55, y: -0.1, width: 0.014, height: 1, color: 0x14161a, opacity: 0.72, sway: 0 },
      { kind: 'pillar', x: -0.2, y: -0.12, width: 0.014, height: 1, color: 0x14161a, opacity: 0.68, sway: 0 },
      { kind: 'arch', x: 0.52, y: 0.05, width: 0.3, height: 0.9, color: 0x121418, opacity: 0.6, sway: 0 },
    ],
  },

  /* 04 放学后 · 空教室里的纸飞机 —— 斜射夕光与纸飞机 */
  {
    id: 'chapter-04',
    chapter: '空教室里的纸飞机',
    caption: '六号教学楼 · 黄昏',
    palette: { sky: 0x96816a, horizon: 0x3c3730, particle: 0xf0d9a8, glow: 0xe8b878, vignette: 0.319 },
    particles: [
      {
        count: 8,
        spawn: (random) => ({ x: random.swing(0.6), y: random.range(-0.3, 0.7), z: random.range(-2.5, -0.5), size: random.range(0.032, 0.056), alpha: random.range(0.5, 0.95) }),
        velocity: (random) => ({ x: random.range(0.05, 0.16), y: random.range(-0.05, 0.05), z: 0 }),
        wrap: 'left',
        color: 0xf4e6cc,
        opacity: 0.9,
        softness: 0.9,
        stretch: 0.55,
      },
      {
        count: 130,
        spawn: (random) => ({ x: random.swing(0.75), y: random.range(-0.5, 0.9), z: random.range(-1.5, 0), size: random.range(0.0048, 0.012), alpha: random.range(0.15, 0.5) }),
        velocity: (random) => ({ x: random.range(-0.03, 0.03), y: random.range(-0.05, 0.02), z: 0 }),
        wrap: 'none',
        color: 0xf0d9a8,
        opacity: 0.3,
        softness: 1,
        stretch: 1.0,
      },
    ],
    horizons: [{ color: 0xa88a5e, at: 0.3, softness: 0.18, opacity: 0.3 }],
    glows: [
      { color: 0xe8b878, x: 0.62, y: 0.55, radius: 0.46, opacity: 0.26, pulse: 14 },
      { color: 0xd6a05e, x: 0.2, y: -0.1, radius: 0.3, opacity: 0.12, pulse: 0 },
    ],
    camera: { driftX: 0.04, driftY: 0.03, period: 20, parallax: 0.05, dolly: 0.045 },
    reaction: { hoverDensity: 1.55, hoverDolly: 0.04, hoverWarmth: 0.8, flashStrength: 0.85 },
    props: [
      { kind: 'slab', x: -0.1, y: 0.3, width: 0.72, height: 0.42, color: 0x141414, opacity: 0.45, sway: 0 },
      { kind: 'slab', x: 0.1, y: -0.34, width: 0.9, height: 0.06, color: 0x100f0e, opacity: 0.8, sway: 0 },
      { kind: 'pillar', x: -0.72, y: -0.05, width: 0.02, height: 1, color: 0x0d0c0b, opacity: 0.7, sway: 0 },
    ],
  },

  /* 05 雪夜 · 末班公交的暖光 —— 雪落与站台灯 */
  {
    id: 'chapter-05',
    chapter: '末班公交的暖光',
    caption: '南门站 · 雪夜',
    palette: { sky: 0x43557d, horizon: 0x263040, particle: 0xe6eef4, glow: 0xe8b46a, vignette: 0.33 },
    particles: [
      {
        count: 190,
        spawn: (random) => ({ x: random.swing(0.85), y: random.range(-0.2, 1.2), z: random.range(-2.5, 0), size: random.range(0.0096, 0.024), alpha: random.range(0.35, 0.95) }),
        velocity: (random) => ({ x: random.range(-0.045, 0.045), y: random.range(-0.16, -0.06), z: 0 }),
        wrap: 'top',
        color: 0xeef4f8,
        opacity: 0.8,
        softness: 0.85,
        stretch: 1.0,
      },
      {
        count: 60,
        spawn: (random) => ({ x: random.swing(0.8), y: random.range(-0.4, 0.9), z: random.range(-1, 0), size: random.range(0.0064, 0.0128), alpha: random.range(0.15, 0.4) }),
        velocity: () => ({ x: -0.01, y: -0.05, z: 0 }),
        wrap: 'top',
        color: 0xc8d6e2,
        opacity: 0.22,
        softness: 0.8,
        stretch: 1.0,
      },
    ],
    horizons: [{ color: 0x8898aa, at: 0.34, softness: 0.1, opacity: 0.34 }],
    glows: [
      { color: 0xe8b46a, x: 0.55, y: 0.16, radius: 0.4, opacity: 0.32, pulse: 5 },
      { color: 0xbcd0e0, x: -0.4, y: 0.5, radius: 0.3, opacity: 0.12, pulse: 0 },
    ],
    camera: { driftX: 0.035, driftY: 0.03, period: 28, parallax: 0.06, dolly: 0.03 },
    reaction: { hoverDensity: 1.35, hoverDolly: 0.03, hoverWarmth: 0.6, flashStrength: 0.7 },
    props: [
      { kind: 'slab', x: 0.55, y: 0.5, width: 0.5, height: 0.04, color: 0x1d2028, opacity: 0.75, sway: 0 },
      { kind: 'pillar', x: 0.62, y: -0.05, width: 0.014, height: 0.96, color: 0x191c22, opacity: 0.8, sway: 0 },
      { kind: 'slab', x: -0.55, y: -0.24, width: 1, height: 0.16, color: 0x0d1116, opacity: 0.85, sway: 0 },
      { kind: 'arch', x: 0.1, y: -0.2, width: 0.34, height: 0.6, color: 0x0f141a, opacity: 0.55, sway: 0 },
    ],
  },

  /* 06 夏天 · 海边寄来的明信片 —— 栈桥尽头的潮汐 */
  {
    id: 'chapter-06',
    chapter: '海边寄来的明信片',
    caption: '栈桥尽头 · 潮汐',
    palette: { sky: 0x65a5c0, horizon: 0x284e5c, particle: 0xcfe6ea, glow: 0xe8c890, vignette: 0.264 },
    particles: [
      {
        count: 170,
        spawn: (random) => ({ x: random.swing(0.9), y: random.range(-0.85, -0.1), z: random.range(-2, 0), size: random.range(0.0128, 0.0288), alpha: random.range(0.25, 0.8) }),
        velocity: (random) => ({ x: random.range(0.05, 0.2), y: random.range(-0.1, 0.06), z: 0 }),
        wrap: 'left',
        color: 0xdCF0F2,
        opacity: 0.62,
        softness: 0.6,
        stretch: 1.0,
      },
      {
        count: 90,
        spawn: (random) => ({ x: random.swing(0.9), y: random.range(0.1, 0.9), z: random.range(-3, -1), size: random.range(0.0064, 0.016), alpha: random.range(0.1, 0.32) }),
        velocity: () => ({ x: 0.03, y: -0.02, z: 0 }),
        wrap: 'left',
        color: 0xb8d4da,
        opacity: 0.22,
        softness: 1,
        stretch: 1.0,
      },
    ],
    horizons: [
      { color: 0x8fb6be, at: 0.5, softness: 0.03, opacity: 0.55 },
      { color: 0x4e7d88, at: 0.36, softness: 0.12, opacity: 0.34 },
    ],
    glows: [
      { color: 0xe8c890, x: 0.42, y: 0.5, radius: 0.5, opacity: 0.24, pulse: 12 },
      { color: 0xcfe6ea, x: -0.5, y: 0.1, radius: 0.36, opacity: 0.14, pulse: 6 },
    ],
    camera: { driftX: 0.07, driftY: 0.035, period: 19, parallax: 0.08, dolly: 0.05 },
    reaction: { hoverDensity: 1.5, hoverDolly: 0.045, hoverWarmth: 0.45, flashStrength: 0.7 },
    props: [
      { kind: 'slab', x: 0, y: -0.78, width: 1.3, height: 0.1, color: 0x0c1a1e, opacity: 0.8, sway: 0 },
      { kind: 'pillar', x: -0.35, y: -0.55, width: 0.012, height: 0.5, color: 0x0a161a, opacity: 0.75, sway: 0 },
      { kind: 'pillar', x: 0.3, y: -0.55, width: 0.012, height: 0.5, color: 0x0a161a, opacity: 0.75, sway: 0 },
    ],
  },

  /* 07 远方 · 旧书店的最后一盏灯 —— 海风里的暖灯 */
  {
    id: 'chapter-07',
    chapter: '旧书店的最后一盏灯',
    caption: '海风里的书店',
    palette: { sky: 0x776d5e, horizon: 0x332f28, particle: 0xe8cfa0, glow: 0xe8b070, vignette: 0.33 },
    particles: [
      {
        count: 110,
        spawn: (random) => ({ x: random.swing(0.8), y: random.range(-0.6, 0.9), z: random.range(-2, 0), size: random.range(0.0056, 0.016), alpha: random.range(0.15, 0.55) }),
        velocity: (random) => ({ x: random.range(0.02, 0.09), y: random.range(-0.06, 0.03), z: 0 }),
        wrap: 'left',
        color: 0xe8cfa0,
        opacity: 0.34,
        softness: 1,
        stretch: 1.0,
      },
      {
        count: 60,
        spawn: (random) => ({ x: random.swing(0.7), y: random.range(-0.5, 0.4), z: random.range(-1, 0), size: 0.0088, alpha: random.range(0.1, 0.3) }),
        velocity: () => ({ x: 0.02, y: -0.03, z: 0 }),
        wrap: 'left',
        color: 0xc0a882,
        opacity: 0.18,
        softness: 1,
        stretch: 1.0,
      },
    ],
    horizons: [{ color: 0x6e5f48, at: 0.44, softness: 0.09, opacity: 0.42 }],
    glows: [
      { color: 0xe8b070, x: -0.34, y: 0.24, radius: 0.44, opacity: 0.34, pulse: 8 },
      { color: 0xd4a060, x: 0.5, y: 0.36, radius: 0.26, opacity: 0.18, pulse: 13 },
    ],
    camera: { driftX: 0.05, driftY: 0.025, period: 23, parallax: 0.07, dolly: 0.04 },
    reaction: { hoverDensity: 1.45, hoverDolly: 0.035, hoverWarmth: 0.85, flashStrength: 0.8 },
    props: [
      { kind: 'slab', x: -0.3, y: -0.2, width: 0.7, height: 0.8, color: 0x12100d, opacity: 0.7, sway: 0 },
      { kind: 'pillar', x: -0.62, y: 0.1, width: 0.02, height: 0.9, color: 0x0e0c0a, opacity: 0.72, sway: 0 },
      { kind: 'pillar', x: 0.05, y: 0.1, width: 0.02, height: 0.9, color: 0x0e0c0a, opacity: 0.72, sway: 0 },
      { kind: 'slab', x: 0, y: -0.6, width: 1.4, height: 0.08, color: 0x0b0a08, opacity: 0.85, sway: 0 },
    ],
  },

  /* 08 异乡 · 八个小时的时差 —— 凌晨窗边的屏幕冷光 */
  {
    id: 'chapter-08',
    chapter: '八个小时的时差',
    caption: '凌晨的窗边 · 时差',
    palette: { sky: 0x34436d, horizon: 0x1d2637, particle: 0xa8bce0, glow: 0x8fb0e8, vignette: 0.374 },
    particles: [
      {
        count: 130,
        spawn: (random) => ({ x: random.swing(0.8), y: random.range(-0.4, 1), z: random.range(-3, -0.5), size: random.range(0.0048, 0.0176), alpha: random.range(0.1, 0.55) }),
        velocity: (random) => ({ x: random.range(-0.012, 0.012), y: random.range(-0.025, 0.01), z: 0 }),
        wrap: 'none',
        color: 0xb8c8e8,
        opacity: 0.34,
        softness: 1,
        stretch: 1.0,
      },
      {
        count: 90,
        spawn: (random) => ({ x: random.swing(0.75), y: random.range(-0.3, 0.8), z: random.range(-1, 0), size: 0.0072, alpha: random.range(0.06, 0.24) }),
        velocity: () => ({ x: 0.008, y: -0.012, z: 0 }),
        wrap: 'none',
        color: 0x8898c0,
        opacity: 0.16,
        softness: 1,
        stretch: 1.0,
      },
    ],
    horizons: [{ color: 0x4a5a80, at: 0.3, softness: 0.2, opacity: 0.26 }],
    glows: [
      { color: 0x8fb0e8, x: 0.36, y: -0.05, radius: 0.44, opacity: 0.3, pulse: 4 },
      { color: 0xd8e4ff, x: -0.5, y: 0.6, radius: 0.22, opacity: 0.16, pulse: 0 },
    ],
    camera: { driftX: 0.03, driftY: 0.02, period: 30, parallax: 0.05, dolly: 0.03 },
    reaction: { hoverDensity: 1.3, hoverDolly: 0.03, hoverWarmth: -0.5, flashStrength: 0.65 },
    props: [
      { kind: 'slab', x: 0.4, y: -0.15, width: 0.4, height: 0.34, color: 0x0b0f17, opacity: 0.8, sway: 0 },
      { kind: 'slab', x: -0.55, y: -0.3, width: 0.55, height: 0.55, color: 0x0a0d13, opacity: 0.72, sway: 0 },
      { kind: 'pillar', x: 0.02, y: 0.1, width: 0.01, height: 1, color: 0x090c11, opacity: 0.66, sway: 0 },
    ],
  },

  /* 09 清晨 · 没有寄出的信 —— 城墙根下的邮筒 */
  {
    id: 'chapter-09',
    chapter: '没有寄出的信',
    caption: '城墙根 · 清晨',
    palette: { sky: 0x708192, horizon: 0x303c45, particle: 0xd8d0c0, glow: 0xd0b888, vignette: 0.286 },
    particles: [
      {
        count: 100,
        spawn: (random) => ({ x: random.swing(0.8), y: random.range(-0.6, 0.9), z: random.range(-2, 0), size: random.range(0.0056, 0.0152), alpha: random.range(0.12, 0.45) }),
        velocity: (random) => ({ x: random.range(-0.03, 0.03), y: random.range(-0.05, 0.015), z: 0 }),
        wrap: 'none',
        color: 0xe0d8c8,
        opacity: 0.28,
        softness: 1,
        stretch: 1.0,
      },
      {
        count: 70,
        spawn: (random) => ({ x: random.swing(0.75), y: random.range(-0.5, 1.1), z: random.range(-1.5, 0), size: 0.0096, alpha: random.range(0.15, 0.5) }),
        velocity: () => ({ x: -0.03, y: -0.28, z: 0 }),
        wrap: 'top',
        color: 0xb8c4c2,
        opacity: 0.3,
        softness: 0.5,
        stretch: 0.45,
      },
    ],
    horizons: [{ color: 0x7a7268, at: 0.4, softness: 0.06, opacity: 0.5 }],
    glows: [{ color: 0xd0b888, x: -0.48, y: 0.46, radius: 0.44, opacity: 0.22, pulse: 16 }],
    camera: { driftX: 0.045, driftY: 0.02, period: 25, parallax: 0.06, dolly: 0.035 },
    reaction: { hoverDensity: 1.4, hoverDolly: 0.03, hoverWarmth: 0.7, flashStrength: 0.7 },
    props: [
      { kind: 'slab', x: 0, y: 0.42, width: 1.4, height: 0.34, color: 0x13100d, opacity: 0.78, sway: 0 },
      { kind: 'pillar', x: 0.36, y: -0.24, width: 0.07, height: 0.4, color: 0x101311, opacity: 0.82, sway: 0 },
      { kind: 'slab', x: 0.36, y: -0.02, width: 0.09, height: 0.04, color: 0x1a1f1c, opacity: 0.8, sway: 0 },
      { kind: 'slab', x: -0.5, y: -0.42, width: 1, height: 0.1, color: 0x0e100e, opacity: 0.8, sway: 0 },
    ],
  },

  /* 10 秋天 · 朋友婚礼上的空位 —— 礼堂的侧光与空椅 */
  {
    id: 'chapter-10',
    chapter: '朋友婚礼上的空位',
    caption: '南郊礼堂 · 侧光',
    palette: { sky: 0x847162, horizon: 0x352f28, particle: 0xe0c898, glow: 0xe0b878, vignette: 0.341 },
    particles: [
      {
        count: 120,
        spawn: (random) => ({ x: random.swing(0.75), y: random.range(-0.4, 1), z: random.range(-2.5, -0.5), size: random.range(0.0048, 0.0144), alpha: random.range(0.12, 0.5) }),
        velocity: (random) => ({ x: random.range(-0.015, 0.015), y: random.range(-0.05, 0.01), z: 0 }),
        wrap: 'none',
        color: 0xe8d0a0,
        opacity: 0.3,
        softness: 1,
        stretch: 1.0,
      },
    ],
    horizons: [{ color: 0x8a7454, at: 0.36, softness: 0.16, opacity: 0.34 }],
    glows: [
      { color: 0xe0b878, x: -0.44, y: 0.42, radius: 0.5, opacity: 0.24, pulse: 18 },
      { color: 0xd4a860, x: 0.5, y: 0.2, radius: 0.28, opacity: 0.14, pulse: 9 },
    ],
    camera: { driftX: 0.04, driftY: 0.03, period: 27, parallax: 0.055, dolly: 0.035 },
    reaction: { hoverDensity: 1.4, hoverDolly: 0.03, hoverWarmth: 0.65, flashStrength: 0.72 },
    props: [
      { kind: 'slab', x: 0, y: -0.46, width: 1.4, height: 0.09, color: 0x120f0c, opacity: 0.8, sway: 0 },
      { kind: 'pillar', x: -0.1, y: -0.16, width: 0.05, height: 0.28, color: 0x100d0a, opacity: 0.78, sway: 0 },
      { kind: 'pillar', x: 0.28, y: -0.16, width: 0.05, height: 0.28, color: 0x100d0a, opacity: 0.78, sway: 0 },
      { kind: 'arch', x: -0.62, y: 0.1, width: 0.28, height: 0.86, color: 0x0f0c09, opacity: 0.6, sway: 0 },
    ],
  },

  /* 11 深夜 · 陌生号码的来电 —— 凌晨一点的车灯划过 */
  {
    id: 'chapter-11',
    chapter: '陌生号码的来电',
    caption: '出租屋 · 凌晨一点',
    palette: { sky: 0x2a3c58, horizon: 0x161f2c, particle: 0x9fb4d0, glow: 0xd8e0f0, vignette: 0.396 },
    particles: [
      {
        count: 110,
        spawn: (random) => ({ x: random.swing(0.85), y: random.range(-0.4, 1), z: random.range(-3, -0.5), size: random.range(0.0048, 0.0192), alpha: random.range(0.08, 0.5) }),
        velocity: (random) => ({ x: random.range(-0.01, 0.01), y: random.range(-0.02, 0.012), z: 0 }),
        wrap: 'none',
        color: 0xa8bcd8,
        opacity: 0.3,
        softness: 1,
        stretch: 1.0,
      },
      {
        count: 5,
        spawn: (random) => ({ x: random.range(-1.1, -0.7), y: random.range(-0.3, 0.4), z: random.range(-2, -1), size: random.range(0.024, 0.044), alpha: random.range(0.4, 0.8) }),
        velocity: () => ({ x: 0.55, y: 0, z: 0 }),
        wrap: 'left',
        color: 0xe8e0c8,
        opacity: 0.7,
        softness: 0.7,
        stretch: 0.65,
      },
    ],
    horizons: [{ color: 0x36445e, at: 0.28, softness: 0.24, opacity: 0.22 }],
    glows: [
      { color: 0xd8e0f0, x: 0.55, y: 0.38, radius: 0.3, opacity: 0.2, pulse: 3 },
      { color: 0x8fa8d0, x: -0.35, y: 0.6, radius: 0.24, opacity: 0.1, pulse: 0 },
    ],
    camera: { driftX: 0.025, driftY: 0.02, period: 32, parallax: 0.04, dolly: 0.028 },
    reaction: { hoverDensity: 1.3, hoverDolly: 0.028, hoverWarmth: -0.35, flashStrength: 0.75 },
    props: [
      { kind: 'slab', x: 0, y: -0.62, width: 1.4, height: 0.14, color: 0x070a0e, opacity: 0.85, sway: 0 },
      { kind: 'slab', x: 0.5, y: 0.2, width: 0.5, height: 0.5, color: 0x080b10, opacity: 0.7, sway: 0 },
      { kind: 'slab', x: -0.62, y: 0.3, width: 0.16, height: 0.24, color: 0x0c1016, opacity: 0.6, sway: 0 },
    ],
  },

  /* 12 春天 · 那场迟到的电影 —— 放映机的光束与尘埃 */
  {
    id: 'chapter-12',
    chapter: '那场迟到的电影',
    caption: '旧电影院 · 放映光束',
    palette: { sky: 0x494c62, horizon: 0x1f222c, particle: 0xd8d0e0, glow: 0xc8c0e0, vignette: 0.385 },
    particles: [
      {
        count: 180,
        spawn: (random) => ({ x: random.swing(0.6), y: random.range(-0.5, 1), z: random.range(-3, -0.5), size: random.range(0.004, 0.0176), alpha: random.range(0.1, 0.6) }),
        velocity: (random) => ({ x: random.range(-0.012, 0.012), y: random.range(-0.03, 0.012), z: 0 }),
        wrap: 'none',
        color: 0xe0d8f0,
        opacity: 0.32,
        softness: 1,
        stretch: 1.0,
      },
    ],
    horizons: [{ color: 0x9a94b8, at: 0.62, softness: 0.3, opacity: 0.28 }],
    glows: [
      { color: 0xc8c0e0, x: 0.1, y: 0.2, radius: 0.6, opacity: 0.28, pulse: 20 },
      { color: 0xe0d8b0, x: -0.6, y: 0.7, radius: 0.2, opacity: 0.16, pulse: 0 },
    ],
    camera: { driftX: 0.03, driftY: 0.02, period: 29, parallax: 0.045, dolly: 0.03 },
    reaction: { hoverDensity: 1.35, hoverDolly: 0.03, hoverWarmth: 0.3, flashStrength: 0.68 },
    props: [
      { kind: 'slab', x: 0.35, y: 0.6, width: 1.2, height: 0.5, color: 0x0c0d12, opacity: 0.55, sway: 0 },
      { kind: 'slab', x: 0, y: -0.6, width: 1.4, height: 0.1, color: 0x08090c, opacity: 0.88, sway: 0 },
      { kind: 'triangle', x: -0.5, y: -0.42, width: 0.16, height: 0.12, color: 0x0a0b0f, opacity: 0.7, sway: 0 },
    ],
  },

  /* 13 午后 · 雨停之后的长椅 —— 湖面反光与湿长椅 */
  {
    id: 'chapter-13',
    chapter: '雨停之后的长椅',
    caption: '湖边长椅 · 雨停',
    palette: { sky: 0x84998c, horizon: 0x394940, particle: 0xd8e4d0, glow: 0xe0d0a0, vignette: 0.275 },
    particles: [
      {
        count: 120,
        spawn: (random) => ({ x: random.swing(0.9), y: random.range(-0.85, -0.25), z: random.range(-2, 0), size: random.range(0.0112, 0.0256), alpha: random.range(0.15, 0.6) }),
        velocity: (random) => ({ x: random.range(-0.02, 0.02), y: random.range(-0.012, 0.012), z: 0 }),
        wrap: 'none',
        color: 0xdcecdc,
        opacity: 0.42,
        softness: 0.55,
        stretch: 1.0,
      },
      {
        count: 90,
        spawn: (random) => ({ x: random.swing(0.8), y: random.range(-0.2, 1), z: random.range(-2.5, -0.5), size: random.range(0.0048, 0.0128), alpha: random.range(0.1, 0.4) }),
        velocity: (random) => ({ x: random.range(-0.02, 0.02), y: random.range(-0.04, 0.01), z: 0 }),
        wrap: 'none',
        color: 0xc8dcc8,
        opacity: 0.26,
        softness: 1,
        stretch: 1.0,
      },
    ],
    horizons: [
      { color: 0x8fa890, at: 0.42, softness: 0.05, opacity: 0.5 },
      { color: 0x5e7a64, at: 0.26, softness: 0.16, opacity: 0.28 },
    ],
    glows: [
      { color: 0xe0d0a0, x: 0.3, y: 0.6, radius: 0.5, opacity: 0.26, pulse: 15 },
      { color: 0xc8e0d0, x: -0.45, y: -0.6, radius: 0.4, opacity: 0.16, pulse: 0 },
    ],
    camera: { driftX: 0.06, driftY: 0.03, period: 21, parallax: 0.075, dolly: 0.045 },
    reaction: { hoverDensity: 1.45, hoverDolly: 0.04, hoverWarmth: 0.75, flashStrength: 0.7 },
    props: [
      { kind: 'slab', x: 0, y: -0.42, width: 1.4, height: 0.02, color: 0xb8c8b4, opacity: 0.4, sway: 0 },
      { kind: 'slab', x: -0.32, y: -0.06, width: 0.34, height: 0.035, color: 0x101512, opacity: 0.78, sway: 0 },
      { kind: 'pillar', x: -0.46, y: -0.22, width: 0.012, height: 0.3, color: 0x0d120f, opacity: 0.75, sway: 0 },
      { kind: 'pillar', x: -0.18, y: -0.22, width: 0.012, height: 0.3, color: 0x0d120f, opacity: 0.75, sway: 0 },
    ],
  },

  /* 14 新年 · 给未来的明信片 —— 候车厅的暖光与列车掠影 */
  {
    id: 'chapter-14',
    chapter: '给未来的明信片',
    caption: '火车站候车厅',
    palette: { sky: 0x867d6d, horizon: 0x37332a, particle: 0xe8d8b8, glow: 0xe8c080, vignette: 0.308 },
    particles: [
      {
        count: 130,
        spawn: (random) => ({ x: random.swing(0.8), y: random.range(-0.5, 1), z: random.range(-2.5, -0.5), size: random.range(0.0048, 0.016), alpha: random.range(0.12, 0.5) }),
        velocity: (random) => ({ x: random.range(-0.02, 0.02), y: random.range(-0.045, 0.012), z: 0 }),
        wrap: 'none',
        color: 0xf0e0c0,
        opacity: 0.32,
        softness: 1,
        stretch: 1.0,
      },
      {
        count: 8,
        spawn: (random) => ({ x: random.range(0.7, 1.15), y: random.range(-0.5, 0.4), z: random.range(-2, -1), size: random.range(0.028, 0.048), alpha: random.range(0.3, 0.7) }),
        velocity: () => ({ x: -0.5, y: 0, z: 0 }),
        wrap: 'left',
        color: 0xe8d0a0,
        opacity: 0.55,
        softness: 0.65,
        stretch: 0.7,
      },
    ],
    horizons: [{ color: 0x9a8262, at: 0.34, softness: 0.12, opacity: 0.36 }],
    glows: [
      { color: 0xe8c080, x: -0.2, y: 0.4, radius: 0.5, opacity: 0.3, pulse: 10 },
      { color: 0xd8b070, x: 0.55, y: 0.44, radius: 0.3, opacity: 0.18, pulse: 7 },
    ],
    camera: { driftX: 0.05, driftY: 0.025, period: 22, parallax: 0.065, dolly: 0.04 },
    reaction: { hoverDensity: 1.45, hoverDolly: 0.035, hoverWarmth: 0.8, flashStrength: 0.78 },
    props: [
      { kind: 'slab', x: 0, y: 0.5, width: 1.4, height: 0.16, color: 0x14120f, opacity: 0.7, sway: 0 },
      { kind: 'slab', x: 0, y: -0.55, width: 1.4, height: 0.1, color: 0x0d0c0a, opacity: 0.85, sway: 0 },
      { kind: 'pillar', x: -0.62, y: -0.1, width: 0.04, height: 0.9, color: 0x0f0e0c, opacity: 0.72, sway: 0 },
      { kind: 'pillar', x: 0.3, y: -0.1, width: 0.04, height: 0.9, color: 0x0f0e0c, opacity: 0.72, sway: 0 },
    ],
  },

  /* 15 晚风 · 有人替你撑伞 —— 雨后街口的红色信号灯 */
  {
    id: 'chapter-15',
    chapter: '有人替你撑伞',
    caption: '雨后街口 · 红灯',
    palette: { sky: 0x586877, horizon: 0x283037, particle: 0xd8e0e4, glow: 0xd8a0a0, vignette: 0.33 },
    particles: [
      {
        count: 150,
        spawn: (random) => ({ x: random.swing(0.85), y: random.range(-0.2, 1.2), z: random.range(-2, 0), size: random.range(0.008, 0.0208), alpha: random.range(0.2, 0.7) }),
        velocity: () => ({ x: -0.05, y: -0.42, z: 0 }),
        wrap: 'top',
        color: 0xd8e8ec,
        opacity: 0.44,
        softness: 0.5,
        stretch: 0.42,
      },
      {
        count: 90,
        spawn: (random) => ({ x: random.swing(0.9), y: random.range(-0.9, -0.5), z: random.range(-2, 0), size: random.range(0.0064, 0.016), alpha: random.range(0.1, 0.4) }),
        velocity: () => ({ x: 0.014, y: -0.02, z: 0 }),
        wrap: 'none',
        color: 0xc0d0d6,
        opacity: 0.24,
        softness: 1,
        stretch: 1.0,
      },
    ],
    horizons: [
      { color: 0x74848c, at: 0.4, softness: 0.06, opacity: 0.45 },
      { color: 0x4c5c64, at: 0.72, softness: 0.04, opacity: 0.3 },
    ],
    glows: [
      { color: 0xd8a0a0, x: 0.48, y: 0.34, radius: 0.28, opacity: 0.32, pulse: 2.4 },
      { color: 0xa8c0d8, x: -0.52, y: 0.42, radius: 0.26, opacity: 0.14, pulse: 0 },
    ],
    camera: { driftX: 0.045, driftY: 0.025, period: 24, parallax: 0.07, dolly: 0.04 },
    reaction: { hoverDensity: 1.5, hoverDolly: 0.038, hoverWarmth: 0.55, flashStrength: 0.72 },
    props: [
      { kind: 'pillar', x: 0.46, y: 0.16, width: 0.014, height: 1.1, color: 0x0c1013, opacity: 0.78, sway: 0 },
      { kind: 'slab', x: 0.46, y: 0.44, width: 0.06, height: 0.12, color: 0x0a0d10, opacity: 0.8, sway: 0 },
      { kind: 'slab', x: 0, y: -0.82, width: 1.5, height: 0.08, color: 0x0a0d0f, opacity: 0.85, sway: 0 },
      { kind: 'arch', x: -0.6, y: 0.1, width: 0.34, height: 0.96, color: 0x0b0f12, opacity: 0.6, sway: 0 },
    ],
  },

  /* 16 晴日 · 把遗憾种进花盆 —— 阳台的栀子与斜阳 */
  {
    id: 'chapter-16',
    chapter: '把遗憾种进花盆',
    caption: '家中阳台 · 晴日',
    palette: { sky: 0x969b86, horizon: 0x404639, particle: 0xe8e8d0, glow: 0xf0d8a0, vignette: 0.275 },
    particles: [
      {
        count: 140,
        spawn: (random) => ({ x: random.swing(0.85), y: random.range(-0.6, 1), z: random.range(-2.5, -0.5), size: random.range(0.004, 0.0144), alpha: random.range(0.12, 0.5) }),
        velocity: (random) => ({ x: random.range(-0.02, 0.02), y: random.range(-0.04, 0.012), z: 0 }),
        wrap: 'none',
        color: 0xf0f0dc,
        opacity: 0.3,
        softness: 1,
        stretch: 1.0,
      },
      {
        count: 22,
        spawn: (random) => ({ x: random.swing(0.6), y: random.range(-0.2, 0.9), z: random.range(-1.5, 0), size: random.range(0.016, 0.032), alpha: random.range(0.4, 0.85) }),
        velocity: (random) => ({ x: random.range(0.02, 0.09), y: random.range(-0.05, 0.02), z: 0 }),
        wrap: 'left',
        color: 0xf4f4e4,
        opacity: 0.7,
        softness: 0.9,
        stretch: 0.8,
      },
    ],
    horizons: [{ color: 0x9a9c80, at: 0.36, softness: 0.14, opacity: 0.4 }],
    glows: [{ color: 0xf0d8a0, x: 0.46, y: 0.55, radius: 0.52, opacity: 0.3, pulse: 17 }],
    camera: { driftX: 0.055, driftY: 0.03, period: 20, parallax: 0.07, dolly: 0.045 },
    reaction: { hoverDensity: 1.4, hoverDolly: 0.035, hoverWarmth: 0.9, flashStrength: 0.75 },
    props: [
      { kind: 'slab', x: 0, y: -0.7, width: 1.4, height: 0.12, color: 0x14160f, opacity: 0.78, sway: 0 },
      { kind: 'slab', x: -0.34, y: -0.46, width: 0.22, height: 0.14, color: 0x1a1c14, opacity: 0.82, sway: 0 },
      { kind: 'triangle', x: -0.34, y: -0.28, width: 0.2, height: 0.16, color: 0x2a3324, opacity: 0.6, sway: 3.2 },
      { kind: 'triangle', x: -0.24, y: -0.24, width: 0.14, height: 0.12, color: 0x333c28, opacity: 0.55, sway: 4.1 },
      { kind: 'pillar', x: 0.62, y: 0.1, width: 0.02, height: 1, color: 0x0f110c, opacity: 0.6, sway: 0 },
    ],
  },

  /* 17 冬日 · 终于学会说再见 —— 城墙上的风 */
  {
    id: 'chapter-17',
    chapter: '终于学会说再见',
    caption: '城墙上的风',
    palette: { sky: 0x7a8992, horizon: 0x353e42, particle: 0xd0d8d8, glow: 0xd8c090, vignette: 0.319 },
    particles: [
      {
        count: 170,
        spawn: (random) => ({ x: random.swing(0.9), y: random.range(-0.5, 1.1), z: random.range(-3, -0.5), size: random.range(0.0056, 0.0192), alpha: random.range(0.12, 0.55) }),
        velocity: (random) => ({ x: random.range(0.05, 0.22), y: random.range(-0.05, 0.03), z: 0 }),
        wrap: 'left',
        color: 0xdce4e4,
        opacity: 0.36,
        softness: 1,
        stretch: 1.0,
      },
      {
        count: 40,
        spawn: (random) => ({ x: random.swing(0.85), y: random.range(-0.3, 0.9), z: random.range(-1.5, 0), size: random.range(0.0112, 0.024), alpha: random.range(0.2, 0.6) }),
        velocity: () => ({ x: 0.24, y: -0.04, z: 0 }),
        wrap: 'left',
        color: 0xe8d0a0,
        opacity: 0.5,
        softness: 0.85,
        stretch: 0.7,
      },
    ],
    horizons: [
      { color: 0x8a9098, at: 0.44, softness: 0.05, opacity: 0.48 },
      { color: 0x505a60, at: 0.66, softness: 0.08, opacity: 0.3 },
    ],
    glows: [{ color: 0xd8c090, x: -0.3, y: 0.46, radius: 0.46, opacity: 0.22, pulse: 14 }],
    camera: { driftX: 0.075, driftY: 0.03, period: 18, parallax: 0.09, dolly: 0.05 },
    reaction: { hoverDensity: 1.55, hoverDolly: 0.04, hoverWarmth: 0.6, flashStrength: 0.7 },
    props: [
      { kind: 'slab', x: 0, y: -0.58, width: 1.5, height: 0.26, color: 0x111514, opacity: 0.82, sway: 0 },
      { kind: 'pillar', x: -0.44, y: -0.28, width: 0.05, height: 0.36, color: 0x0e1211, opacity: 0.8, sway: 0 },
      { kind: 'pillar', x: 0.4, y: -0.28, width: 0.05, height: 0.36, color: 0x0e1211, opacity: 0.8, sway: 0 },
      { kind: 'slab', x: -0.7, y: 0.1, width: 0.3, height: 0.5, color: 0x0c1010, opacity: 0.6, sway: 0 },
    ],
  },

  /* 18 新章 · 下一场雨 —— 清晨街道上重新落下的雨 */
  {
    id: 'chapter-18',
    chapter: '下一场雨',
    caption: '清晨街道 · 新的雨',
    palette: { sky: 0x718996, horizon: 0x334046, particle: 0xd0e0e2, glow: 0xe0c490, vignette: 0.275 },
    particles: [
      {
        count: 200,
        spawn: (random) => ({ x: random.swing(0.85), y: random.range(-0.3, 1.2), z: random.range(-2, 0), size: 0.012, alpha: random.range(0.25, 0.8) }),
        velocity: () => ({ x: -0.05, y: -0.6, z: 0 }),
        wrap: 'top',
        color: 0xd8e8ea,
        opacity: 0.48,
        softness: 0.42,
        stretch: 0.34,
      },
      {
        count: 110,
        spawn: (random) => ({ x: random.swing(0.85), y: random.range(-0.4, 1.1), z: random.range(-2, 0), size: random.range(0.0056, 0.0128), alpha: random.range(0.1, 0.4) }),
        velocity: () => ({ x: -0.014, y: -0.05, z: 0 }),
        wrap: 'top',
        color: 0xb8cccc,
        opacity: 0.24,
        softness: 0.8,
        stretch: 0.8,
      },
    ],
    horizons: [
      { color: 0x7e8e94, at: 0.42, softness: 0.05, opacity: 0.46 },
      { color: 0x4a585e, at: 0.68, softness: 0.06, opacity: 0.28 },
    ],
    glows: [
      { color: 0xe0c490, x: 0.5, y: 0.4, radius: 0.46, opacity: 0.26, pulse: 16 },
      { color: 0xcfe0e4, x: -0.45, y: 0.56, radius: 0.24, opacity: 0.12, pulse: 0 },
    ],
    camera: { driftX: 0.06, driftY: 0.03, period: 20, parallax: 0.075, dolly: 0.045 },
    reaction: { hoverDensity: 1.5, hoverDolly: 0.04, hoverWarmth: 0.6, flashStrength: 0.72 },
    props: [
      { kind: 'slab', x: 0, y: -0.78, width: 1.5, height: 0.1, color: 0x0b0f11, opacity: 0.85, sway: 0 },
      { kind: 'pillar', x: -0.5, y: -0.1, width: 0.016, height: 0.9, color: 0x0d1113, opacity: 0.72, sway: 0 },
      { kind: 'pillar', x: 0.44, y: -0.1, width: 0.016, height: 0.9, color: 0x0d1113, opacity: 0.72, sway: 0 },
      { kind: 'arch', x: -0.05, y: 0.16, width: 0.3, height: 0.66, color: 0x0a0e10, opacity: 0.55, sway: 0 },
    ],
  },
]

/**
 * 章节数与 `defaultChapters` 不一致时（例如 AI 生成了新故事），
 * 用取模方式复用已有配方，保证任何章节都有画面。
 * 未使用的 `W` / `H` 保留为后续配方声明比例时的显式常量。
 */
export function getSceneRecipe(index: number): SceneRecipe {
  if (index >= 0 && index < sceneRecipes.length) return sceneRecipes[index]
  return sceneRecipes[Math.abs(index) % sceneRecipes.length]
}

export { W, H }
