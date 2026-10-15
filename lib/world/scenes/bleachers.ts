import type { Collider, Hotspot, SceneRuntime, TriggerZone, WorldScene, WorldSceneHandle } from '../types'

/**
 * 场景「军训操场」——故事的第一幕，也是垂直切片的验收对象。
 *
 * ## 空间布局（坐标即叙事）
 *
 * ```
 *            z = -34  看台（最高一级台阶上坐着白裙子）
 *               ↑
 *               │      看台前的矮墙、旗杆
 *               │
 *            z = -12  中场线
 *               ↑
 *               │
 *            z =   0  玩家出生点（球门附近）
 * ```
 *
 * 玩家从球门一侧出发，看台在正前方 34 米外。
 * **这个距离是刻意的**：原文里那句「她坐在那么高的看台上，
 * 隔着一整个操场，算不算在水一方」——只有真的走完这段路，
 * 那句话才不是装饰。把出生点往前挪到看台脚下会让整个开场失效。
 *
 * ## 为什么一切都很空
 *
 * 诗意剪影风不允许细节，而操场本身也确实空。空旷是这段记忆的性质：
 * 一个站在所有人前面领操的人，和一个在所有人面前哭的人，
 * 中间隔着的是几百个正在做操的人——那些人在这里被省略了，
 * 因为玩家记住的从来不是他们。
 */

/** 看台位置与尺寸。多个地方要用，抽成常量避免两处各写一遍导致失配。 */
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

/** 场景调色板。与项目既有的墨绿灰阶 + 琥珀强调色保持一致。 */
const PALETTE = {
  sky: 0x151c1e,
  ground: 0x1b2422,
  line: 0x8f9c96,
  structure: 0x101619,
  /** 唯一的亮色：白裙子。全场只有这一处用高亮，视线自然被它抓住。 */
  figure: 0xe8e4da,
  accent: 0xc8a878,
} as const

export const bleachersScene: WorldScene = {
  id: 'bleachers',
  caption: '西安 · 军训操场',
  /** 固定种子。同一片雨、同一批水洼，每次进入都必须在同一个位置。 */
  seed: 0x5e9e01,

  build(runtime: SceneRuntime): WorldSceneHandle {
    const { three, root, random } = runtime

    /* ---------------- 材质 ---------------- */

    /**
     * 全场共用一组材质。
     *
     * 每个网格各建一份材质在剪影风里没有收益（颜色本来就只有几种），
     * 却会让 `dispose` 要释放几十个对象。共用之下，
     * 骨架遍历 root 时对同一份材质会重复 dispose——这是安全的，
     * three 的 `dispose()` 幂等。
     *
     * 用 `MeshLambertMaterial` 而不是 `MeshBasicMaterial`：
     * 剪影需要"边缘比中间亮"的轮廓感，那来自光照，Basic 材质不吃光。
     */
    const materials = {
      ground: new three.MeshLambertMaterial({ color: PALETTE.ground }),
      structure: new three.MeshLambertMaterial({ color: PALETTE.structure }),
      line: new three.MeshBasicMaterial({ color: PALETTE.line, transparent: true, opacity: 0.35 }),
      figure: new three.MeshLambertMaterial({ color: PALETTE.figure }),
      accent: new three.MeshBasicMaterial({ color: PALETTE.accent, transparent: true, opacity: 0.5 }),
    }

    const colliders: Collider[] = []
    const occluders: import('three').Object3D[] = []

    /* ---------------- 地面 ---------------- */

    // 用圆盘而不是平面：远处的地平线会被雾吃掉，圆形边缘比方形更自然地
    // 溶进背景，不会在四个角露出生硬的直角。
    const ground = new three.Mesh(new three.CircleGeometry(120, 48), materials.ground)
    ground.rotation.x = -Math.PI / 2
    root.add(ground)

    /* ---------------- 场地白线 ---------------- */

    /**
     * 用极薄的盒子画线，而不是贴图。
     *
     * 贴图要生成 canvas 纹理、要处理各向异性过滤与 mipmap，
     * 而这套画面里线只是几条淡淡的亮痕。薄盒子便宜、不用纹理、
     * 且天然吃雾（远处自动变淡），比贴图更统一。
     */
    const lineGroup = new three.Group()
    const addLine = (x: number, z: number, width: number, depth: number) => {
      const line = new three.Mesh(new three.BoxGeometry(width, 0.02, depth), materials.line)
      line.position.set(x, 0.011, z)
      lineGroup.add(line)
    }
    // 中线、中圈（用四段近似）、两条边线、球门区
    addLine(0, -17, 60, 0.14)
    addLine(-30, -17, 0.14, 34)
    addLine(30, -17, 0.14, 34)
    addLine(0, -3, 14, 0.12)   // 球门区前沿
    addLine(-7, -3.5, 0.12, 1)
    addLine(7, -3.5, 0.12, 1)
    for (let i = 0; i < 4; i += 1) {
      const angle = (i / 4) * Math.PI * 2
      addLine(Math.cos(angle) * 6, -17 + Math.sin(angle) * 6, i % 2 ? 0.12 : 8.5, i % 2 ? 8.5 : 0.12)
    }
    root.add(lineGroup)

    /* ---------------- 看台 ---------------- */

    /**
     * 看台做成阶梯状的盒子。
     *
     * 每一级单独建 mesh（而不是一整块斜面）：阶梯的棱角在低角度光下
     * 会形成一连串横向亮边，这正是"看台"这个形状在记忆里的样子；
     * 换成斜面就变成了公路护坡。
     */
    const bleachers = new three.Group()
    for (let step = 0; step < BLEACHER.steps; step += 1) {
      const tier = new three.Mesh(
        new three.BoxGeometry(BLEACHER.width, BLEACHER.stepHeight, BLEACHER.stepDepth),
        materials.structure,
      )
      // 第 0 级最靠前、最低；往后逐级升高
      tier.position.set(
        0,
        (BLEACHER.stepHeight * (step + 1)) / 2,
        BLEACHER.frontZ - step * BLEACHER.stepDepth,
      )
      bleachers.add(tier)
    }
    root.add(bleachers)

    // 看台整体作为一块碰撞体。逐级建碰撞体是浪费——玩家不可能爬上台阶。
    colliders.push({
      kind: 'box',
      x: 0,
      z: BLEACHER.frontZ - ((BLEACHER.steps - 1) * BLEACHER.stepDepth) / 2,
      halfX: BLEACHER.width / 2,
      halfZ: (BLEACHER.steps * BLEACHER.stepDepth) / 2,
    })
    occluders.push(bleachers)

    /* ---------------- 白裙子 ---------------- */

    /**
     * 坐在最高一级台阶上的人影。
     *
     * 造型极简：一个胶囊状的躯干 + 一个球形的头。在这个距离上
     * （34 米外）任何细节都会被雾吃掉，能读出"一个人坐着"就足够了。
     *
     * 用全场唯一的高亮色，而且**从出生点就可见**——
     * 玩家不需要找她，第一眼就该看见她。
     */
    const figure = new three.Group()
    const body = new three.Mesh(new three.CapsuleGeometry(0.24, 0.52, 4, 12), materials.figure)
    body.position.y = 0.62
    const head = new three.Mesh(new three.SphereGeometry(0.16, 12, 10), materials.figure)
    head.position.y = 1.06
    figure.add(body, head)
    // 坐在最高一级台阶上
    const topStepY = BLEACHER.stepHeight * BLEACHER.steps
    figure.position.set(
      -2.6,
      topStepY,
      BLEACHER.frontZ - (BLEACHER.steps - 1) * BLEACHER.stepDepth,
    )
    root.add(figure)

    /* ---------------- 旗杆与矮墙 ---------------- */

    const pole = new three.Mesh(new three.CylinderGeometry(0.09, 0.11, 12, 8), materials.structure)
    pole.position.set(-24, 6, -26)
    root.add(pole)
    colliders.push({ kind: 'cylinder', x: -24, z: -26, radius: 0.4 })

    // 看台前方的矮墙：给空旷的场地一个层次，也提供一个"靠过"的地方
    const wall = new three.Mesh(new three.BoxGeometry(64, 0.9, 0.5), materials.structure)
    wall.position.set(0, 0.45, -22)
    root.add(wall)
    colliders.push({ kind: 'box', x: 0, z: -22, halfX: 32, halfZ: 0.25 })
    occluders.push(wall)

    /* ---------------- 树 ---------------- */

    /**
     * 操场边上的几棵树。位置用固定种子抖动，
     * 保证每次进入都在同一处——这正是 `createRandom` 存在的理由。
     */
    const trees = new three.Group()
    for (let i = 0; i < 14; i += 1) {
      const side = i % 2 === 0 ? -1 : 1
      const x = side * random.range(34, 52)
      const z = random.range(-46, 18)
      const height = random.range(5, 8.5)

      const trunk = new three.Mesh(new three.CylinderGeometry(0.18, 0.26, height, 6), materials.structure)
      trunk.position.set(x, height / 2, z)
      trees.add(trunk)

      // 树冠只是几个叠起来的低面数球体，剪影就够了
      const crown = new three.Mesh(new three.IcosahedronGeometry(random.range(1.8, 2.6), 0), materials.structure)
      crown.position.set(x, height + 0.6, z)
      trees.add(crown)

      colliders.push({ kind: 'cylinder', x, z, radius: 0.45 })
    }
    root.add(trees)

    /* ---------------- 水洼 ---------------- */

    /**
     * 雨天的操场要有积水。用水平放置的薄圆盘 + 微弱的琥珀反光，
     * 而不是做真实反射——反射要额外一遍渲染，而在这里
     * 玩家只要看到"地上有几点亮"就够了。
     */
    const puddles = new three.Group()
    for (let i = 0; i < 9; i += 1) {
      const puddle = new three.Mesh(new three.CircleGeometry(random.range(1.2, 3.4), 16), materials.accent)
      puddle.rotation.x = -Math.PI / 2
      puddle.position.set(random.spread(0, 22), 0.012, random.range(-30, 12))
      puddles.add(puddle)
    }
    root.add(puddles)

    /* ---------------- 可交互：看台上的她 ---------------- */

    /**
     * 热点挂在一个独立的球形代理上，而不是 `figure` 本身的某个 mesh。
     *
     * 原因：身体和头是两个小网格，34 米外射线穿过它们的窗口极窄，
     * 玩家会觉得"明明对着她还是点不中"。用一个不可见的球体把所有部件
     * 包起来，拾取窗口就变成了整个人影的轮廓。
     *
     * 球体用 `material.visible = false` 而不是 `visible = false`：
     * 后者会让射线跳过它（three 的射线不跳过不可见对象……但会跳过
     * `visible === false` 的对象），而我们要的是"看不见但能点"。
     */
    const figureProxy = new three.Mesh(
      new three.SphereGeometry(0.9, 10, 8),
      new three.MeshBasicMaterial({ visible: false }),
    )
    figureProxy.position.copy(figure.position)
    figureProxy.position.y += 0.6
    root.add(figureProxy)

    const hotspots: Hotspot[] = []
    /**
     * 闸门是否已满足。
     *
     * 场景只负责置位，进度由宿主记录（宿主那边有 `openedGates`，
     * 因为它要进存档）。场景持有这个局部标记只为了两件事：
     * 注册回调时补发一次，以及避免重复回调。
     */
    let gateSatisfied = false

    /** 由宿主在拿到 build 返回值后赋值。契约里的 `onGateSatisfied`。 */
    let notifyGate: (() => void) | null = null

    /** 满足闸门。置位 + 通知，两处调用点共用，避免漏掉其中一步。 */
    const satisfyGate = () => {
      if (gateSatisfied) return
      gateSatisfied = true
      notifyGate?.()
    }

    hotspots.push({
      id: 'figure-on-bleachers',
      object: figureProxy,
      label: '看台上的白裙子',
      /**
       * 34 米。这是全场最远的一个 `reach`，刻意的——
       * 你只能站在操场这一头看着她。走近看台并不能让你更接近她。
       */
      reach: 38,
      onActivate: () => {
        // 点到她，等于确认了"我看见了"，这就是开场闸门。
        satisfyGate()
        return true
      },
    })

    /* ---------------- 触发区域：走到场地中央 ---------------- */

    /**
     * 开场的推进条件：走到操场中央。
     *
     * 为什么不设成"走近看台"：走近看台意味着玩家会一直往前走，
     * 而这段开场的意义恰恰是**停下来看**。走到中央时，
     * 看台的距离刚好是"能看清是一个人，但看不清脸"。
     */
    const triggers: TriggerZone[] = [
      {
        id: 'field-center',
        x: 0,
        z: -12,
        radius: 7,
        onEnter: () => {
          satisfyGate()
          return true
        },
      },
    ]

    return {
      colliders,
      occluders,
      hotspots,
      triggers,
      /**
       * 宿主注册闸门监听。
       *
       * 契约要求宿主在赋值时若闸门**已经**满足过会拿不到通知，
       * 所以这里主动补发一次——玩家可能先走到场地中央（触发闸门），
       * 之后宿主才完成挂载，那种顺序下缺了补发就会一直停在"等待探索"。
       */
      set onGateSatisfied(callback: () => void) {
        notifyGate = callback
        if (gateSatisfied) callback()
      },
      update(elapsed, _delta, player) {
        /**
         * 两处只有这个场景才有的动效：
         * 1. 白裙子随雨微微起伏（她一直在哭，肩膀在抖）
         * 2. 水洼的反光随玩家走近而变亮（"光一直在，只是你总低着头"的前身）
         *
         * 都放在这里而不是骨架里——骨架不该知道任何具体场景的表演。
         */
        figure.position.y = topStepY + Math.sin(elapsed * 1.6) * 0.018
        figureProxy.position.y = figure.position.y + 0.6

        const distanceToFigure = Math.hypot(player.x - figure.position.x, player.z - figure.position.z)
        const intimacy = Math.max(0, 1 - distanceToFigure / 40)
        materials.accent.opacity = 0.35 + intimacy * 0.35
      },
      resize() {
        // 这个场景的布景与宽高比无关（全部按米摆放），无需响应
      },
    }
  },
}
