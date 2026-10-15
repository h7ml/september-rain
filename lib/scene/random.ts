/**
 * 确定性伪随机。
 *
 * 场景配方需要在每次重建时给出**同一片**雨、同一群雪片，
 * 否则章节来回切换时画面会整体跳变，破坏「记忆是同一个地方」的观感。
 * 所以所有随机值都从这个带种子的发生器取，而不是 `Math.random()`。
 */
export function createRandom(seed: number) {
  let state = seed >>> 0 || 0x9e3779b9

  const next = () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    state >>>= 0
    return state / 0xffffffff
  }

  return {
    /** [0, 1) */
    unit: next,
    /** [min, max) */
    range: (min: number, max: number) => min + next() * (max - min),
    /** 以 center 为中心的对称抖动 */
    spread: (center: number, amount: number) => center + (next() * 2 - 1) * amount,
    /** 以 0 为中心的对称抖动 */
    swing: (amount: number) => (next() * 2 - 1) * amount,
    /** 按概率取真 */
    chance: (probability: number) => next() < probability,
    /** 从数组里挑一个 */
    pick: <T,>(items: readonly T[]): T => items[Math.min(items.length - 1, Math.floor(next() * items.length))],
  }
}

export type Random = ReturnType<typeof createRandom>

/** 把 0xRRGGBB 拆成归一化的 [r, g, b]。 */
export function toRgb(hex: number): [number, number, number] {
  return [((hex >> 16) & 0xff) / 255, ((hex >> 8) & 0xff) / 255, (hex & 0xff) / 255]
}

/** 线性插值，场景过渡与视差阻尼都靠它。 */
export function lerp(from: number, to: number, amount: number) {
  return from + (to - from) * amount
}

/** 与帧率无关的指数阻尼系数：amount 表示「每秒趋近比例」。 */
export function damping(amount: number, delta: number) {
  return 1 - Math.pow(1 - amount, delta * 60)
}
