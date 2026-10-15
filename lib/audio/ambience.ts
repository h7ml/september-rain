import { createRandom } from '@/lib/scene/random'

/**
 * 程序化环境音。
 *
 * ## 为什么不用音频文件
 *
 * 三个理由，都不是省事：
 * 1. **零资源体积**。这个项目的美术是程序化几何体，音频走同一路线才自洽。
 * 2. **无缝**。一段 30 秒的雨声循环播放，接缝处一定会被听出来（雨是宽带噪声，
 *    循环点在频谱上是个突变）；程序化合成的雨**永不重复**。
 * 3. **可参数化**。同一个引擎按场景给不同参数就能出「雨夜城市」「室内雨声」
 *    「多瑙河畔的风」，而不需要为每个场景准备一个文件。
 *
 * ## 浏览器自动播放策略
 *
 * 这是本模块最容易踩的坑：Web Audio 上下文在用户交互之前是 `suspended` 的，
 * 直接 `resume()` 会被静默拒绝（不报错、也不出声）。所以：
 * - 上下文**懒创建**：第一次真正需要发声时才建，且必须在用户手势的调用栈里。
 * - 我们的第一次交互天然是「点击画面进入场景」，那次点击就是手势。
 *
 * ## 音量设计的克制
 *
 * 底噪目标在 -30dB 上下。这不是背景音乐，是「这个地方在响」——
 * 玩家应该在看完全部正文之后才意识到自己一直在听雨，
 * 而不是一进场景就被声音提示「现在该有情绪了」。
 */

/** 一个场景的声景参数。 */
type AmbienceSpec = {
  /**
   * 雨量 0-1。
   *
   * 0 表示没有雨（室内、异国街景），1 是暴雨。
   * 雨由**两层**构成：高频的「沙沙」是雨丝落地，低频的「轰鸣」是被雨压住的空气，
   * 后者在雨大时才会明显——只有高频的雨听起来像白噪声发生器，不像天气。
   */
  rain: number
  /** 风的强度 0-1。缓慢的低频起伏，用于室外场景。 */
  wind: number
  /**
   * 房间感 0-1。
   *
   * 这是一个低频的嗡鸣 + 削掉高频，模拟「在一个封闭空间里」。
   * 它让室内与室外的区别不只是"有没有雨"，而是**空间本身**在响。
   */
  room: number
  /** 整体音量倍率。缺省 1。 */
  gain?: number
}

/**
 * 各场景的声景。
 *
 * 键是 `WorldScene.id`。没登记的场景回落到 `default`——
 * 与 `getScene` 的回落策略一致：宁可声音不贴切，也不能没声音或抛错。
 */
const SPECS: Record<string, AmbienceSpec> = {
  bleachers: { rain: 0.72, wind: 0.3, room: 0 },
  'field-rain': { rain: 0.9, wind: 0.36, room: 0 },
  'coffee-shop': { rain: 0.42, wind: 0.06, room: 0.55 },
  library: { rain: 0.3, wind: 0, room: 0.8 },
  classroom: { rain: 0.28, wind: 0.08, room: 0.85 },
  loft: { rain: 0.34, wind: 0, room: 0.7 },
  'loft-night': { rain: 0.26, wind: 0, room: 0.75 },
  'uk-window': { rain: 0.5, wind: 0.22, room: 0.5 },
  danube: { rain: 0, wind: 0.55, room: 0 },
  hotpot: { rain: 0.16, wind: 0, room: 0.88 },
  airport: { rain: 0, wind: 0.05, room: 0.9 },
  stairwell: { rain: 0.44, wind: 0.1, room: 0.95 },
  'city-wall': { rain: 0.18, wind: 0.75, room: 0 },
}

const DEFAULT_SPEC: AmbienceSpec = { rain: 0.5, wind: 0.2, room: 0.3 }

/**
 * 噪声缓冲的长度（秒）。
 *
 * 3 秒足够长到循环点无法被察觉，又短到生成成本可以忽略
 * （48000 × 3 = 14.4 万个采样点，几毫秒）。
 */
const NOISE_SECONDS = 3

/** 淡入淡出时长（秒）。切换场景时不能有咔哒声。 */
const FADE_SECONDS = 2.4

export type AmbienceHandle = {
  /** 切到某个场景的声景。同一场景重复调用是幂等的。 */
  play: (sceneId: string) => void
  /** 静音开关。关掉时淡出而不是硬切——硬切会在扬声器上留一个爆音。 */
  setMuted: (muted: boolean) => void
  /** 选项悬停/点击的一声轻响。 */
  cue: (kind: 'hover' | 'confirm') => void
  /** 释放全部资源。 */
  dispose: () => void
}

export function createAmbience(): AmbienceHandle {
  /**
   * 上下文懒创建。
   *
   * 在构造函数里 `new AudioContext()` 会在页面上留下一个 suspended 的上下文，
   * 而 Safari 对同时存在的上下文数量有限制——单页反复挂载（React 严格模式）
   * 会很快耗尽。所以推迟到第一次真正播放。
   */
  let ctx: AudioContext | null = null
  let master: GainNode | null = null
  let current: { sceneId: string; gain: GainNode; nodes: AudioScheduledSourceNode[] } | null = null
  let muted = false
  let disposed = false

  /** 循环播放的噪声源。每次都用同一个缓冲，只是播放位置随机。 */
  let noiseBuffer: AudioBuffer | null = null

  const ensureContext = (): AudioContext | null => {
    if (disposed) return null
    if (ctx) {
      // 上下文可能因为切标签页被浏览器挂起，恢复它需要一个手势，
      // 而调用方（点击画面）正好提供了手势。失败不抛错：下次点击还会再试。
      if (ctx.state === 'suspended') void ctx.resume()
      return ctx
    }

    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null

    ctx = new Ctor()
    master = ctx.createGain()
    // 静音时不是把 master 设 0，而是在 setMuted 里淡出——
    // 直接设 0 会在开关的瞬间产生一个直流跳变，听得见「咔」。
    master.gain.value = muted ? 0 : 1
    master.connect(ctx.destination)

    const frames = Math.floor(ctx.sampleRate * NOISE_SECONDS)
    noiseBuffer = ctx.createBuffer(1, frames, ctx.sampleRate)
    const channel = noiseBuffer.getChannelData(0)
    /**
     * 白噪声听感偏"嘶"，不像雨。
     *
     * 做一次一阶低通（相邻采样加权平均）把它往粉噪声推——高频能量降下来之后
     * 才像"空气在动"而不是"电视机没信号"。系数 0.35 是试出来的：
     * 再高会闷成水声，再低就还是白噪。
     */
    const random = createRandom(0x5e9e20)
    let previous = 0
    for (let i = 0; i < frames; i += 1) {
      const white = random.unit() * 2 - 1
      previous = previous * (1 - 0.35) + white * 0.35
      // 归一化：低通会吃掉振幅，不补回来后面所有增益都要重算
      channel[i] = previous * 2.2
    }

    return ctx
  }

  /** 建一个循环噪声源并接到指定节点。`rate` 改变播放速度，从而改变听感频率。 */
  const makeNoise = (context: AudioContext, destination: AudioNode, rate: number): AudioBufferSourceNode => {
    const source = context.createBufferSource()
    source.buffer = noiseBuffer
    source.loop = true
    source.playbackRate.value = rate
    source.connect(destination)
    source.start()
    return source
  }

  /**
   * 构建一个场景的全部声部。
   *
   * 返回一个已经接到 master 的 gain 节点（初始为 0，由调用方淡入），
   * 以及需要 stop 的源节点列表。每次切场景都重建整条链——
   * 复用节点会让「从有雨的场景切到无雨的场景」变成关掉某个滤波器，
   * 而滤波器的状态是连续的，关不干净。
   */
  const build = (context: AudioContext, spec: AmbienceSpec): { gain: GainNode; nodes: AudioScheduledSourceNode[] } => {
    const nodes: AudioScheduledSourceNode[] = []
    const gain = context.createGain()
    // 初始 0：所有新声部都从静音淡入，避免切场景时的电平跳变
    gain.gain.value = 0
    gain.connect(master!)

    /* ---------- 雨 ---------- */

    if (spec.rain > 0.01) {
      // 高频层：雨丝落地的沙沙声。带通放在 4-9kHz，这是雨打在物体上的主频段。
      const hiss = context.createBiquadFilter()
      hiss.type = 'bandpass'
      hiss.frequency.value = 6200
      hiss.Q.value = 0.55
      const hissGain = context.createGain()
      hissGain.gain.value = spec.rain * 0.5
      hiss.connect(hissGain).connect(gain)
      nodes.push(makeNoise(context, hiss, 1))

      /**
       * 低频层：被雨压住的空气声。
       *
       * 这一层是"雨听起来像天气"的关键——只有高频的雨是白噪声，
       * 加上这个低频轰鸣之后才有"整个空间都被雨包住了"的体感。
       * 它随雨量非线性增长（平方），小雨时几乎听不到，大雨时才起来。
       */
      const rumble = context.createBiquadFilter()
      rumble.type = 'lowpass'
      rumble.frequency.value = 320
      const rumbleGain = context.createGain()
      rumbleGain.gain.value = spec.rain * spec.rain * 0.62
      rumble.connect(rumbleGain).connect(gain)
      nodes.push(makeNoise(context, rumble, 0.72))

      /**
       * 极慢的强度起伏。
       *
       * 用 LFO 调制 hissGain 而不是直接调 gain：雨不是恒定音量的，
       * 它一阵大一阵小。周期 23 秒（刻意取一个不可预测的质数感数值），
       * 玩家不会意识到有周期性，只会觉得"雨一直在变"。
       */
      const lfo = context.createOscillator()
      lfo.frequency.value = 1 / 23
      const lfoGain = context.createGain()
      lfoGain.gain.value = spec.rain * 0.14
      lfo.connect(lfoGain).connect(hissGain.gain)
      lfo.start()
      nodes.push(lfo)
    }

    /* ---------- 风 ---------- */

    if (spec.wind > 0.01) {
      /**
       * 风用低通噪声 + 慢速起伏，而不是带通。
       *
       * 带通出来的更像"水管漏气"，低通才有"空气整体在流动"的厚重感。
       * 起伏速度比分雨更慢（周期 37 秒），因为风的阵性比雨缓。
       */
      const draft = context.createBiquadFilter()
      draft.type = 'lowpass'
      draft.frequency.value = 520
      const draftGain = context.createGain()
      draftGain.gain.value = spec.wind * 0.34
      draft.connect(draftGain).connect(gain)
      nodes.push(makeNoise(context, draft, 0.6))

      const gust = context.createOscillator()
      gust.frequency.value = 1 / 37
      const gustGain = context.createGain()
      gustGain.gain.value = spec.wind * 0.17
      gust.connect(gustGain).connect(draftGain.gain)
      gust.start()
      nodes.push(gust)
    }

    /* ---------- 房间 ---------- */

    if (spec.room > 0.01) {
      /**
       * 房间感 = 低频嗡鸣 + 削掉高频的底噪。
       *
       * 嗡鸣（58Hz 加上一点五度泛音）是"建筑在响"——空调、电梯井、
       * 水管、远处的交通，所有这些在这个音量下混成一个持续的基音。
       * 它不是音乐上的音，是为了让室内场景的静默**有底**。
       */
      const hum = context.createOscillator()
      hum.type = 'sine'
      hum.frequency.value = 58
      const humGain = context.createGain()
      humGain.gain.value = spec.room * 0.045
      hum.connect(humGain).connect(gain)
      hum.start()
      nodes.push(hum)

      // 五度泛音：单独的 58Hz 听起来像电流声，加一个不完全八度才像空间
      const overtone = context.createOscillator()
      overtone.type = 'sine'
      overtone.frequency.value = 87
      const overtoneGain = context.createGain()
      overtoneGain.gain.value = spec.room * 0.018
      overtone.connect(overtoneGain).connect(gain)
      overtone.start()
      nodes.push(overtone)

      // 削掉高频的底噪 = 空气感
      const damp = context.createBiquadFilter()
      damp.type = 'lowpass'
      damp.frequency.value = 1400
      const dampGain = context.createGain()
      dampGain.gain.value = spec.room * 0.1
      damp.connect(dampGain).connect(gain)
      nodes.push(makeNoise(context, damp, 0.85))
    }

    // 场景自身的整体音量
    if (spec.gain && spec.gain !== 1) gain.gain.value = 0
    return { gain, nodes }
  }

  /** 淡入一个节点。用线性斜坡而不是 `setTargetAtTime`：后者永不真正到达目标值。 */
  const fadeTo = (context: AudioContext, param: AudioParam, value: number) => {
    const now = context.currentTime
    param.cancelScheduledValues(now)
    param.setValueAtTime(param.value, now)
    param.linearRampToValueAtTime(value, now + FADE_SECONDS)
  }

  return {
    play(sceneId: string) {
      const spec = SPECS[sceneId] ?? DEFAULT_SPEC
      // 同一场景重复调用直接返回：切节点时常常回到同一个场景（分支合流），
      // 重建整条链会让声音无谓地断一下。
      if (current && current.sceneId === sceneId) return

      const context = ensureContext()
      if (!context || !master) return

      // 旧声景淡出后再停。立刻 stop 会有咔哒声，因为波形在非零处被截断。
      if (current) {
        const old = current
        fadeTo(context, old.gain.gain, 0)
        window.setTimeout(() => {
          for (const node of old.nodes) {
            try { node.stop() } catch { /* 已经停过 */ }
            node.disconnect()
          }
          old.gain.disconnect()
        }, FADE_SECONDS * 1000 + 120)
      }

      const next = build(context, spec)
      current = { sceneId, gain: next.gain, nodes: next.nodes }
      fadeTo(context, next.gain.gain, spec.gain ?? 1)
    },

    setMuted(next: boolean) {
      muted = next
      const context = ctx
      if (!context || !master) return
      /**
       * 静音用 0.6 秒的短斜坡。
       *
       * 比场景切换的淡入淡出快得多——玩家按开关是即时的意图，
       * 2.4 秒的延迟会被理解成"按钮没反应"；但完全即时会有爆音。
       */
      const now = context.currentTime
      master.gain.cancelScheduledValues(now)
      master.gain.setValueAtTime(master.gain.value, now)
      master.gain.linearRampToValueAtTime(next ? 0 : 1, now + 0.6)
    },

    cue(kind: 'hover' | 'confirm') {
      const context = ensureContext()
      if (!context || !master || muted) return

      /**
       * 一声短促的正弦音。
       *
       * 音高取自五声音阶（A 小调）：悬停是 A5，确认是 E5——
       * 确认音比悬停音**低**，这是刻意的：向上跳的音在游戏里通常表示
       * "获得了什么"，而这里的每一次选择都是失去。向下落一小步更贴。
       */
      const osc = context.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = kind === 'hover' ? 880 : 659.25

      const envelope = context.createGain()
      const peak = kind === 'hover' ? 0.028 : 0.055
      const now = context.currentTime
      // 极短：attack 8ms、decay 260ms。再长就会变成"提示音"，抢戏。
      envelope.gain.setValueAtTime(0, now)
      envelope.gain.linearRampToValueAtTime(peak, now + 0.008)
      envelope.gain.exponentialRampToValueAtTime(0.0001, now + 0.26)

      osc.connect(envelope).connect(master)
      osc.start(now)
      osc.stop(now + 0.28)
      osc.onended = () => envelope.disconnect()
    },

    dispose() {
      disposed = true
      if (current) {
        for (const node of current.nodes) {
          try { node.stop() } catch { /* 已经停过 */ }
          node.disconnect()
        }
        current.gain.disconnect()
        current = null
      }
      // 必须显式关闭：不关的话页面会一直占着一个音频输出流，
      // 在移动端表现是"退出游戏后系统还认为在播放音频"。
      if (ctx) void ctx.close()
      ctx = null
      master = null
      noiseBuffer = null
    },
  }
}
