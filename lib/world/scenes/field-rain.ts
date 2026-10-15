import type { Collider, Hotspot, SceneRuntime, WorldScene, WorldSceneHandle } from '../types'

/**
 * 场景「校园 · 雨中的操场」——approach 路线的第一站（r01）。
 *
 * ## 与 `bleachers.ts` 是同一个操场
 *
 * 看台的位置、尺寸、朝向，看台前那道矮墙，旗杆，场地白线，都按同一组常量重建。
 * 这**不是复用代码偷懒**，是叙事要求：r01 那句「操场还是那个操场，
 * 看台还是那个看台，只是这一次她没有哭」，只有在玩家认得出这块场地时才成立。
 * 任何一个尺寸漂了，玩家会读成"换了个地方"，而这一节全部的力量都来自
 * "还是这里"。
 *
 * ## 同一个操场的两个时刻
 *
 * 差别不用旁白说，全部由布景自己交代：
 *
 * | | bleachers（m01，首次相遇） | field-rain（r01，雨里并肩） |
 * |---|---|---|
 * | 光 | 场地白线是可见的几条亮痕 | 被雨压掉，只余轮廓 |
 * | 看台 | 最高一级上坐着白裙子，全场唯一亮色 | 空的，一个观众也没有 |
 * | 水 | 9 处散落的水洼 | 积水连成片，且有环形的踩踏痕 |
 * | 雨 | 无（只有她头顶的雨是"记忆里的雨"） | 全场最密的雨 |
 *
 * 最关键的一条：**高亮色换了主人**。bleachers 里唯一的高亮色坐在看台上；
 * 这里它站在跑道上，而且会走。玩家从出生点看见的第一眼，
 * 视线落点就从"最高的地方"降到了"和你一样高、就在你旁边"。
 *
 * ## 为什么她一直在走
 *
 * 「走了一圈，又一圈」这句话没法用静态布景表达——静态的只能表达"有一圈"。
 * 所以她是沿椭圆跑道匀速移动的一个点，无限循环。玩家可以什么都不做地看着她
 * 一圈一圈走过去，那是这一节最接近原文的体验；也可以走上去，她会慢下来。
 * 追不上、也不需要追——她本来就一直在你旁边。
 */

/**
 * 看台参数。**必须与 `bleachers.ts` 逐字一致**。
 *
 * 不抽成共享模块：两个场景将来会各自演化（比如看台在雨里多挂一道水痕），
 * 共享常量会让那种演化变成一次影响两个场景的改动。这里用注释锁死一致性，
 * 用不着用代码耦合锁。
 */
const BLEACHER = {
  /** 看台前沿的 z 坐标 */
  frontZ: -34,
  /** 台阶数 */
  steps: 6,
  /** 单级高 */
  stepHeight: 1.2,
  /** 单级深 */
  stepDepth: 2.4,
  /** 总宽（沿 x 轴） */
  width: 44,
} as const

/**
 * 跑道。两人绕行的路径就是它。
 *
 * 椭圆而不是圆：真实的操场是两条直道加两个半圆，且长轴沿 x。
 * 用椭圆参数方程近似，走到直道段时曲率变化很缓，第一人称下读起来
 * 就是"在直道上"。中心取场地中线上的 (0, -17)，与看台场景的中线重合。
 */
const TRACK = {
  x: 0,
  z: -17,
  /** 长轴半径。28 米足以外切到看台前的矮墙（z = -22）而不穿过去 */
  radiusX: 28,
  radiusZ: 18,
  /** 她的步行速度（米/秒）。比玩家跑速慢得多，走近她不需要冲刺 */
  pace: 1.05,
  /** 玩家跟到身旁时的速度。并肩走的分寸感全在这个数上 */
  paceBeside: 0.62,
} as const

/** 场景调色板。沿用墨绿灰阶 + 琥珀强调色；与 bleachers 的差别只在用量，不在色相。 */
const PALETTE = {
  ground: 0x1b2422,
  /** 湿透的地面：比 dry 的操场暗一档、绿一档，水吸光 */
  wet: 0x141d1c,
  structure: 0x101619,
  /** 场地白线在雨里几乎不发光 */
  line: 0x8f9c96,
  /** 唯一的高亮色：雨里的她 */
  figure: 0xe8e4da,
  accent: 0xc8a878,
  rain: 0x9fb0b4,
} as const

export const fieldRainScene: WorldScene = {
  id: 'field-rain',
  caption: '校园 · 雨中的操场',
  /** 固定种子。同一片雨、同一圈水痕，每次进入都必须在同一处。 */
  seed: 0x5e9e03,

  build(runtime: SceneRuntime): WorldSceneHandle {
    const { three, root, random } = runtime

    /* ---------------- 材质 ---------------- */

    // 与 bleachers 同一组共用材质：剪影风里颜色本来就只有几种，
    // 每网格一份材质只会让回收时要释放的意外变多。
    const materials = {
      ground: new three.MeshLambertMaterial({ color: PALETTE.ground }),
      wet: new three.MeshLambertMaterial({ color: PALETTE.wet }),
      structure: new three.MeshLambertMaterial({ color: PALETTE.structure }),
      /** 白线压到 0.14：雨把线洗淡了，能读出场地边界就够 */
      line: new three.MeshBasicMaterial({ color: PALETTE.line, transparent: true, opacity: 0.14 }),
      figure: new three.MeshLambertMaterial({ color: PALETTE.figure }),
      /** 积水的反光。透明度由 update 按玩家距离驱动 */
      accent: new three.MeshBasicMaterial({ color: PALETTE.accent, transparent: true, opacity: 0.42 }),
      rain: new three.LineBasicMaterial({ color: PALETTE.rain, transparent: true, opacity: 0.3 }),
    }

    const colliders: Collider[] = []
    const occluders: import('three').Object3D[] = []

    /* ---------------- 地面 ---------------- */

    const ground = new three.Mesh(new three.CircleGeometry(120, 48), materials.ground)
    ground.rotation.x = -Math.PI / 2
    root.add(ground)

    /**
     * 跑道本身铺一块湿地面。
     *
     * 抬高 1 厘米、比周围暗一档：雨里的跑道与场地是两种湿度，
     * 而这条边界恰好也是两个人走的那条线。玩家不用看任何提示，
     * 视线会自然沿着这块暗色区域绕圈。
     *
     * 用 PlaneGeometry 而不是圆盘——跑道是椭圆盘，但椭圆在 1 厘米的
     * 高度差上分辨不出来，一块够大的矩形反而不会在水洼下露出接缝。
     */
    const track = new three.Mesh(new three.PlaneGeometry(TRACK.radiusX * 2 + 10, TRACK.radiusZ * 2 + 10), materials.wet)
    track.rotation.x = -Math.PI / 2
    track.position.set(TRACK.x, 0.008, TRACK.z)
    root.add(track)

    /* ---------------- 场地白线 ---------------- */

    // 与 bleachers 同一套线、同一个位置。雨里不再有中圈那种装饰性线条，
    // 只留四条能定出场地尺度的：中线、两条边线、球门区前沿。
    const lineGroup = new three.Group()
    const addLine = (x: number, z: number, width: number, depth: number) => {
      const line = new three.Mesh(new three.BoxGeometry(width, 0.02, depth), materials.line)
      line.position.set(x, 0.021, z)
      lineGroup.add(line)
    }
    addLine(0, -17, 60, 0.14)
    addLine(-30, -17, 0.14, 34)
    addLine(30, -17, 0.14, 34)
    addLine(0, -3, 14, 0.12)
    root.add(lineGroup)

    /* ---------------- 看台 ---------------- */

    /**
     * 看台逐级建 mesh，手法与 bleachers 完全一致。
     *
     * 它是空的那件事不需要额外表达——玩家在 bleachers 里见过上面坐着人，
     * 这里同一级台阶上什么都没有。**"空"只有对比才读得出来**，
     * 所以不能为了省事把看台换成一块斜面。
     */
    const bleachers = new three.Group()
    for (let step = 0; step < BLEACHER.steps; step += 1) {
      const tier = new three.Mesh(
        new three.BoxGeometry(BLEACHER.width, BLEACHER.stepHeight, BLEACHER.stepDepth),
        materials.structure,
      )
      tier.position.set(
        0,
        (BLEACHER.stepHeight * (step + 1)) / 2,
        BLEACHER.frontZ - step * BLEACHER.stepDepth,
      )
      bleachers.add(tier)
    }
    root.add(bleachers)

    colliders.push({
      kind: 'box',
      x: 0,
      z: BLEACHER.frontZ - ((BLEACHER.steps - 1) * BLEACHER.stepDepth) / 2,
      halfX: BLEACHER.width / 2,
      halfZ: (BLEACHER.steps * BLEACHER.stepDepth) / 2,
    })
    occluders.push(bleachers)

    /**
     * 看台台阶上的水痕。
     *
     * 这一处是"同一个看台"的物证：bleachers 里的台阶是干净的，
     * 因为那天的记忆里只有她；这里雨顺着六级台阶流下来，
     * 每一级前沿挂着一道亮痕。加的是水，不是别的东西——
     * 玩家认得出轮廓没变，只是下过雨了。
     */
    for (let step = 0; step < BLEACHER.steps; step += 1) {
      for (let i = 0; i < 5; i += 1) {
        const drip = new three.Mesh(new three.PlaneGeometry(random.range(0.04, 0.1), random.range(0.15, 0.5)), materials.line)
        drip.position.set(
          random.spread(0, BLEACHER.width / 2 - 2),
          BLEACHER.stepHeight * (step + 1) - random.range(0.06, 0.3),
          BLEACHER.frontZ - step * BLEACHER.stepDepth + 0.04,
        )
        bleachers.add(drip)
      }
    }

    /* ---------------- 旗杆与矮墙 ---------------- */

    // 与 bleachers 同位置。旗杆上没挂旗——雨太大，收起来了
    const pole = new three.Mesh(new three.CylinderGeometry(0.09, 0.11, 12, 8), materials.structure)
    pole.position.set(-24, 6, -26)
    root.add(pole)
    colliders.push({ kind: 'cylinder', x: -24, z: -26, radius: 0.4 })

    // 看台前方的矮墙，同位置同尺寸。它是这个场景的北界，
    // 也是玩家绕圈时唯一会被逼着转向的东西
    const wall = new three.Mesh(new three.BoxGeometry(64, 0.9, 0.5), materials.structure)
    wall.position.set(0, 0.45, -22)
    root.add(wall)
    colliders.push({ kind: 'box', x: 0, z: -22, halfX: 32, halfZ: 0.25 })
    occluders.push(wall)

    /* ---------------- 树 ---------------- */

    /**
     * 操场边上的树。位置仍走固定种子，但**数量比 bleachers 多**——
     * 雨里树是一圈更厚的暗边，把空旷的场地围起来。
     *
     * 树的随机调用顺序与 bleachers 不同，所以即便种子同源，落点也会不一样。
     * 这是刻意的：两个时刻的树不必逐棵对齐，玩家记不住 14 棵树的位置，
     * 但记得住"操场两边都是树"。
     */
    const trees = new three.Group()
    for (let i = 0; i < 22; i += 1) {
      const side = i % 2 === 0 ? -1 : 1
      // 起始半径 36 米是为了让全部树都落在跑道铺面（±33 米）之外。
      // 树可以长在跑道边上，但**不能长在跑道上**——玩家的绕行路线会被挡住
      const x = side * random.range(36, 56)
      const z = random.range(-52, 22)
      const height = random.range(5, 9)

      const trunk = new three.Mesh(new three.CylinderGeometry(0.18, 0.26, height, 6), materials.structure)
      trunk.position.set(x, height / 2, z)
      trees.add(trunk)

      const crown = new three.Mesh(new three.IcosahedronGeometry(random.range(1.8, 2.8), 0), materials.structure)
      crown.position.set(x, height + 0.6, z)
      trees.add(crown)

      colliders.push({ kind: 'cylinder', x, z, radius: 0.45 })
    }
    root.add(trees)

    /* ---------------- 积水 ---------------- */

    /**
     * 积水。段数与尺寸都超过 bleachers，而且是**贴着跑道铺的**。
     *
     * 为什么不随机撒：这一节的全部动作都发生在跑道上，
     * 水洼撒到场地中央只会让人以为自己走错了路。贴着椭圆环铺，
     * 玩家沿着水走就是沿着跑道走。
     */
    const puddles = new three.Group()
    for (let i = 0; i < 26; i += 1) {
      const angle = (i / 26) * Math.PI * 2 + random.swing(0.08)
      const wobble = random.swing(1.4)
      const puddle = new three.Mesh(new three.CircleGeometry(random.range(1.4, 3.6), 14), materials.accent)
      puddle.rotation.x = -Math.PI / 2
      puddle.position.set(
        TRACK.x + Math.cos(angle) * (TRACK.radiusX + wobble),
        0.014,
        TRACK.z + Math.sin(angle) * (TRACK.radiusZ + wobble),
      )
      puddles.add(puddle)
    }
    root.add(puddles)

    /**
     * 环形踩踏痕。
     *
     * 用 96 段极薄的弧形方块拼出一圈亮痕，比"随机水洼"更能说出
     * 「一圈又一圈」这件事——水洼是散点，环是轨迹。
     *
     * 不做成完整的闭合圆环：断断续续才像踩出来的，
     * 一条完美的光圈会像场地标线。
     */
    const treadGroup = new three.Group()
    const TREAD_SEGMENTS = 96
    for (let i = 0; i < TREAD_SEGMENTS; i += 1) {
      // 抽掉四分之一，让环有缺口
      if (!random.chance(0.75)) continue
      const angle = (i / TREAD_SEGMENTS) * Math.PI * 2
      const seg = new three.Mesh(new three.BoxGeometry(1.1, 0.012, random.range(0.1, 0.26)), materials.line)
      seg.position.set(
        TRACK.x + Math.cos(angle) * (TRACK.radiusX - 0.6),
        0.02,
        TRACK.z + Math.sin(angle) * (TRACK.radiusZ - 0.6),
      )
      seg.rotation.y = -angle
      treadGroup.add(seg)
    }
    root.add(treadGroup)

    /* ---------------- 雨 ---------------- */

    /**
     * 雨。手法与 coffee-shop 一致（线段而不是粒子点），但三个参数都更重：
     * 段数 620（bleachers 没有雨，coffee-shop 是 320），
     * 落地速度更快，雨丝更长，不透明度也更高。
     *
     * 这是两个场景之间唯一被刻意放大的差异。「更密的雨幕」是这一节
     * 除了她之外的全部情绪：那天雨大到没有人愿意待在操场上，
     * 所以操场上只有他们两个人。
     */
    const DROPS = 620
    const RAIN = { span: 18, x: 64, z: 64, wind: 0.13 } as const

    const rainBase = new Float32Array(DROPS * 3)
    const rainSpeed = new Float32Array(DROPS)
    const rainLength = new Float32Array(DROPS)
    for (let i = 0; i < DROPS; i += 1) {
      rainBase[i * 3] = random.spread(0, RAIN.x)
      // y 的初值铺满整个高度区间，否则雨会像一块下落的板
      rainBase[i * 3 + 1] = random.range(0, RAIN.span)
      rainBase[i * 3 + 2] = random.range(-RAIN.z, RAIN.z)
      rainSpeed[i] = random.range(12, 21)
      rainLength[i] = random.range(0.3, 0.7)
    }

    const rainPositions = new Float32Array(DROPS * 6)
    const rainAttribute = new three.BufferAttribute(rainPositions, 3)
    // 每帧都要重写，声明成动态用法让驱动不要把它放在只读的显存路径上
    rainAttribute.setUsage(three.DynamicDrawUsage)
    const rainGeometry = new three.BufferGeometry()
    rainGeometry.setAttribute('position', rainAttribute)
    const rain = new three.LineSegments(rainGeometry, materials.rain)
    // 雨横跨整个场景，包围球按实际范围给，否则会被视锥体提前剔掉
    rain.frustumCulled = false
    root.add(rain)

    /**
     * 每帧从 `elapsed` 直接算出雨丝位置，而不是逐帧累加位移。
     *
     * 累加会随掉帧产生漂移，且一旦宿主暂停再恢复，雨会"跳"一下；
     * 由时间直接求值则与帧率完全无关，暂停后接着放也不会错位。
     *
     * 雨的 x/z 以**跑道中心**为原点而不是世界原点：玩家绕圈走到场地
     * 任何一侧时，头顶都必须有雨。把雨固定在世界原点上，
     * 走到看台那一头就会走进一片没有雨的空气里。
     */
    const stepRain = (elapsed: number, player: Readonly<{ x: number; z: number }>) => {
      for (let i = 0; i < DROPS; i += 1) {
        const baseY = rainBase[i * 3 + 1] - elapsed * rainSpeed[i]
        // JS 的 % 对负数返回负值，这里要的是循环取模
        const y = ((baseY % RAIN.span) + RAIN.span) % RAIN.span
        const x = rainBase[i * 3] + y * RAIN.wind
        const z = rainBase[i * 3 + 2]

        rainPositions[i * 6] = x
        rainPositions[i * 6 + 1] = y
        rainPositions[i * 6 + 2] = z
        rainPositions[i * 6 + 3] = x - rainLength[i] * RAIN.wind
        rainPositions[i * 6 + 4] = y - rainLength[i]
        rainPositions[i * 6 + 5] = z
      }
      rainAttribute.needsUpdate = true

      // 整块雨幕跟着玩家平移。取整到 1 米，避免每帧连续挪动
      // 让雨丝在同一个像素上抖动（那种抖动看起来像画面在爬）。
      rain.position.set(Math.round(player.x / 1) * 1, 0, Math.round(player.z / 1) * 1)
    }

    /* ---------------- 雨里的她 ---------------- */

    /**
     * 她。造型与 bleachers 里的白裙子**同一套几何**（胶囊躯干 + 球形头），
     * 这是"同一个人"的唯一凭据——换一套造型，玩家会以为这是别人。
     *
     * 唯一的改动是高度：那次她坐着（躯干中心在 0.62），这次她站着。
     * 站起来意味着从看台上下来、走到你旁边，这个变化不需要一句台词。
     */
    const figure = new three.Group()
    const body = new three.Mesh(new three.CapsuleGeometry(0.24, 0.52, 4, 12), materials.figure)
    body.position.y = 1.06
    const head = new three.Mesh(new three.SphereGeometry(0.16, 12, 10), materials.figure)
    head.position.y = 1.62
    figure.add(body, head)

    /**
     * 头发梢上的水珠。原文那五个字在这里被具象成一个会闪的点。
     *
     * 不做成水滴形状：在这个尺度上（近身 2 米内）一颗直径 6 厘米的
     * 亮球已经足够读出"有东西在滴"，而它是**全场唯一会自己亮一下的东西**，
     * 玩家的视线会被它钉在她的头上。原文里他也是先看见这个的。
     */
    const droplet = new three.Mesh(new three.SphereGeometry(0.03, 8, 6), materials.accent)
    droplet.position.set(0.14, 1.76, 0.06)
    figure.add(droplet)
    root.add(figure)

    /**
     * 她当前在椭圆上的角位置，以及当前步速。
     *
     * 这里**必须**逐帧累加角度，不能像雨那样由 `elapsed` 直接求值。
     * 原因：她的速度会随玩家的距离变化，而 `speed × elapsed` 只有在
     * 速度恒定时才等于走过的角。速度一变，那个乘积会立刻把她挪到
     * "如果一直用新速度走，此刻该在的位置"——玩家走近的瞬间，
     * 她会凭空往前跳一段。累加的误差上限是每帧 `delta`（骨架已钳制在 0.1 秒），
     * 在步行尺度上肉眼不可见，换来的是速度可以随时连续改变。
     */
    let walkAngle = 0
    let walkPace = TRACK.pace

    /** 椭圆上的一点。玩家与她的位置都从这里取，两处必须共用，否则她会走偏出跑道。 */
    const trackPoint = (angle: number) => ({
      x: TRACK.x + Math.cos(angle) * TRACK.radiusX,
      z: TRACK.z + Math.sin(angle) * TRACK.radiusZ,
    })

    const placedFigure = trackPoint(0)
    figure.position.set(placedFigure.x, 0, placedFigure.z)

    /* ---------------- 可交互：雨里的她 ---------------- */

    /**
     * 热点同样挂在不可见的球形代理上，理由与 bleachers 相同——
     * 身体和头是两个小网格，射线穿过它们的窗口极窄。
     *
     * `reach` 给 3.2 米而 bleachers 给 38 米：这里的重点正好相反。
     * 那一节你只能远远看着；这一节你可以走到她身边，
     * 而且只有走到身边才点得到。**这个距离差就是两节的全部区别**。
     */
    const figureProxy = new three.Mesh(
      new three.SphereGeometry(0.9, 10, 8),
      new three.MeshBasicMaterial({ visible: false }),
    )
    figureProxy.position.set(placedFigure.x, 1.1, placedFigure.z)
    root.add(figureProxy)

    const hotspots: Hotspot[] = [
      {
        id: 'figure-in-rain',
        object: figureProxy,
        label: '雨里走着的她',
        reach: 3.2,
        onActivate: () => {
          // 这一节没有闸门，点到她只是"我看清了"。
          // 返回 true 让交互系统消费掉这次点击，不必弹任何面板。
          return true
        },
      },
    ]

    /* ---------------- 返回 ---------------- */

    return {
      colliders,
      occluders,
      hotspots,
      update(elapsed, delta, player) {
        stepRain(elapsed, player)

        /**
         * 两处动效，与 bleachers 的克制程度对齐：
         * 1. 她沿跑道匀速绕圈，玩家靠近时慢下来
         * 2. 积水的反光随玩家走近而变亮
         *
         * 雨幕流动不算"动效"——它是布景，一直在流。
         */

        /**
         * 她的角速度按椭圆周长折算，否则走到长轴那一段会明显加速。
         * 周长用 Ramanujan 的一阶近似，比正圆近似准得多，
         * 而这里的误差直接影响"她走路的节奏是否像人"。
         */
        const a = TRACK.radiusX
        const b = TRACK.radiusZ
        const h = ((a - b) * (a - b)) / ((a + b) * (a + b))
        const perimeter = Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)))

        /**
         * 玩家在身旁就慢下来。
         *
         * 用 6 米的软阈值而不是硬判定：硬判定会让她的速度在
         * "跟上了/跟丢了"之间瞬间跳变，看起来像坏了。软阈值下
         * 她有一个"察觉到你了、放慢脚步"的过程，这才是这一节要的。
         */
        const distanceToFigure = Math.hypot(player.x - figure.position.x, player.z - figure.position.z)
        const beside = Math.max(0, 1 - distanceToFigure / 6)
        const targetPace = TRACK.pace + (TRACK.paceBeside - TRACK.pace) * beside
        // 每秒趋近 35%：够快，不会出现"她还按老速度走了一会儿"的滞后感
        walkPace += (targetPace - walkPace) * Math.min(1, delta * 0.35)

        // 一米走多少弧度，乘上这一帧走过的距离就是这一帧转过的角
        walkAngle += (walkPace * delta * Math.PI * 2) / perimeter
        const angle = walkAngle
        const point = trackPoint(angle)
        figure.position.x = point.x
        figure.position.z = point.z

        /**
         * 走路时的上下起伏，再定朝向。
         *
         * 起伏用 `walkAngle` 而不是 `elapsed`：它是"走路的步子"，
         * 必须与脚步同步——她放慢时步子也该慢下来。
         * 椭圆周长约 145 米，摊到 2π 个弧度上，即每弧度约 23 米；
         * 一个蹬地的周期取 0.85 米，于是每弧度迈 27 步。
         */
        figure.position.y = Math.abs(Math.sin(angle * 27)) * 0.026
        /**
         * 朝向 = 速度方向。
         *
         * 参数方程对 `angle` 求导得切向 `(-sin·radiusX, cos·radiusZ)`，
         * 再用与相机同一套约定换算成 `rotation.y`：
         * three 里物体的正面是 +z，而 `yaw = 0` 时相机朝 -z 看，
         * 所以「朝某方向看」的 yaw 与其反向量的 atan2 差一个符号。
         * 这里取 `atan2(-dirX, -dirZ)`。
         *
         * 两处细节都不能省：切向的两个分量各带自己的半径，
         * 否则她走到直道上会歪着身子；符号错了她会倒着走一整圈。
         */
        const tangent = Math.atan2(Math.sin(angle) * TRACK.radiusX, -Math.cos(angle) * TRACK.radiusZ)
        figure.rotation.y = tangent

        // 代理球跟着她走，否则热点会留在原地，玩家点到的是一团空气
        figureProxy.position.set(point.x, 1.1 + figure.position.y, point.z)

        // 水珠每 4 秒左右滴一下：闪得比这快像荧光灯，比这慢就注意不到
        materials.accent.opacity = 0.42 + Math.max(0, 1 - distanceToFigure / 30) * 0.3
        droplet.visible = Math.sin(elapsed * 1.6) > 0.55
      },
      resize() {
        // 这个场景的布景全部按米摆放、与宽高比无关；雨也不随相机拉伸，无需响应
      },
    }
  },
}
