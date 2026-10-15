import type { Collider, Hotspot, SceneRuntime, WorldScene, WorldSceneHandle } from '../types'

/**
 * 场景「西安 · 火锅店」——第三幕。全故事最冷的一场戏。
 *
 * ## 空间布局（坐标即叙事）
 *
 * ```
 *        z = -13  街对面（几扇还亮着的窗，夏天的夜）
 *        z =  -8  临街玻璃幕墙 ← 整面都是窗，外面是热的
 *        z =  -5  空桌（店里几乎没有别的客人）
 *        z =  -2  火锅桌，她坐对面，他坐近侧
 *        z =   2  空调柜机（开场那句"空调只能给客厅降温"的回声）
 *        z =   6  玩家出生点
 *        z =   9  后墙与店门
 * ```
 *
 * 出生朝 `yaw = 0`，即朝 `-z`。这条视线上依次是：火锅桌 → 蒸汽 →
 * 玻璃幕墙 → 夏夜的街。**这是刻意的**：锅里那点热气正好挡在
 * 一整个炎热的夏天前面，而两个人在最热闹的食物面前说最无法挽回的话。
 *
 * ## 蒸汽为什么是主角
 *
 * 原文这一段里没有任何动作，只有一句句往下掉的话。若画面里也什么都不动，
 * 玩家会以为自己卡住了。所以全场唯一的持续动效给了蒸汽——
 * 它是这一桌上唯一还"活着"的东西，也是这场戏里唯一还在往上走的东西
 * （两个人的关系已经停在原地了）。
 *
 * 对比之下人是死的：她坐着几乎不动。刻意不给对话气泡、不给嘴部动画，
 * 那会把这句台词降格成一个 UI 事件。
 *
 * ## 夏夜的"热"怎么表达
 *
 * 室内没有下雨（与咖啡店那场戏正好相反，那场戏全场都是雨）。
 * 外面只有几扇亮着的窗和一条空街——热是靠"空气不流动"表达的：
 * 没有雨、没有风、没有任何一件被吹动的东西。
 */

/** 房间尺寸。多个部件按它对齐，抽成常量避免两处各写一遍导致穿帮。 */
const ROOM = {
  /** 玻璃幕墙所在的 z */
  frontZ: -8,
  /** 后墙（店门）所在的 z */
  backZ: 9,
  /** 侧墙的 x 绝对值 */
  halfWidth: 6.4,
  /** 层高。比咖啡店矮一档——火锅店是那种天花板压得很低的店 */
  height: 3.2,
} as const

/** 火锅桌的落点。桌面、锅、碗、蒸汽、碰撞体五处都要用它，必须同源。 */
const TABLE = { x: 0, z: -2, top: 0.75, halfX: 0.6, halfZ: 0.55 } as const

/** 她的座位。人、椅子、代理球三处共用，写错任何一处都会穿帮。 */
const HER_SEAT = { x: 0, z: TABLE.z - 1.35, facing: Math.PI } as const

/** 场景调色板。与项目既有的墨绿灰阶 + 琥珀强调色保持一致。 */
const PALETTE = {
  ground: 0x1b2422,
  /** 室外街道比室内更暗一档，玻璃两侧才有一道分界 */
  street: 0x0d1213,
  structure: 0x101619,
  /** 家具比结构稍亮，否则在暗墙前读不出体积 */
  furniture: 0x1e2929,
  glass: 0x9fb4b8,
  /** 蒸汽。压得极淡：一锅汤的热气不该比人还亮 */
  steam: 0xd7d3c8,
  accent: 0xc8a878,
  /** 唯一的高亮：对面那个人。全场只有她穿浅色 */
  figure: 0xe8e4da,
} as const

export const hotpotScene: WorldScene = {
  id: 'hotpot',
  caption: '西安 · 火锅店',
  /** 固定种子。同一批空桌、同一批亮着的窗，每次进入都必须在同一处。 */
  seed: 0x5e9e0a,

  build(runtime: SceneRuntime): WorldSceneHandle {
    const { three, root, random } = runtime

    /* ---------------- 材质 ---------------- */

    /**
     * 全场共用一组材质，理由与前两个场景相同：剪影风里颜色本来就只有几种，
     * 每网格一份材质只会让回收时要释放的意外变多。
     */
    const materials = {
      ground: new three.MeshLambertMaterial({ color: PALETTE.ground }),
      street: new three.MeshLambertMaterial({ color: PALETTE.street }),
      structure: new three.MeshLambertMaterial({ color: PALETTE.structure }),
      furniture: new three.MeshLambertMaterial({ color: PALETTE.furniture }),
      /**
       * 玻璃只是"有一点存在感"的存在。
       *
       * 透明度给得比咖啡店那面还低（0.05）：这一场是夏夜，玻璃上不该有雨痕，
       * 也不该有任何东西挡在玩家和外面的街之间。它几乎不存在，
       * 只负责让玩家知道"这里有一层窗"。
       */
      glass: new three.MeshBasicMaterial({
        color: PALETTE.glass,
        transparent: true,
        opacity: 0.05,
        side: three.DoubleSide,
        depthWrite: false,
      }),
      accent: new three.MeshBasicMaterial({ color: PALETTE.accent, transparent: true, opacity: 0.6 }),
      lamp: new three.MeshBasicMaterial({ color: PALETTE.accent }),
      /**
       * 蒸汽。`depthWrite: false` 是必须的——
       * 二十几个半透明的团互相重叠，若每个都写深度，先画的会把后画的整块切掉，
       * 于是本该是"一团雾"的东西会变成一堆硬边的球。
       */
      steam: new three.MeshBasicMaterial({
        color: PALETTE.steam,
        transparent: true,
        opacity: 0.1,
        depthWrite: false,
      }),
      figure: new three.MeshLambertMaterial({ color: PALETTE.figure }),
    }

    const colliders: Collider[] = []
    const occluders: import('three').Object3D[] = []

    /* ---------------- 地面 ---------------- */

    // 地板。往里比房间小一圈没意义，直接铺满，靠墙收边
    const floor = new three.Mesh(
      new three.BoxGeometry(ROOM.halfWidth * 2, 0.2, ROOM.backZ - ROOM.frontZ),
      materials.ground,
    )
    floor.position.set(0, -0.1, (ROOM.backZ + ROOM.frontZ) / 2)
    root.add(floor)

    // 街道。往外多铺 20 米，让雾而不是建模去收边
    const street = new three.Mesh(new three.BoxGeometry(56, 0.2, 24), materials.street)
    street.position.set(0, -0.16, -20)
    root.add(street)

    /* ---------------- 围合（墙与玻璃） ---------------- */

    /**
     * 玻璃幕墙由矮墙、竖棂、横梁、玻璃面四部分组成，与咖啡店同一套手法。
     *
     * 为什么不做成一整块透明平面：完全透明的窗在第一人称里会让人分不清
     * "外面是夜"还是"我已经走出去了"。竖棂给面内参照，矮墙给高度参照——
     * 玩家低头看见墙，才知道自己还在屋里。
     *
     * 这一场的竖棂做得比咖啡店**更密**（1.2m 一档）：火锅店的临街面
     * 通常是一格格的小窗，而密一点的分格也让外面的街被切得更碎，
     * 更像是"隔着很多东西在看一个跟自己无关的夏夜"。
     */
    const wallGroup = new three.Group()

    const sill = new three.Mesh(new three.BoxGeometry(ROOM.halfWidth * 2, 0.5, 0.3), materials.structure)
    sill.position.set(0, 0.25, ROOM.frontZ)
    wallGroup.add(sill)

    const lintel = new three.Mesh(
      new three.BoxGeometry(ROOM.halfWidth * 2, ROOM.height - 3.0, 0.3),
      materials.structure,
    )
    lintel.position.set(0, (3.0 + ROOM.height) / 2, ROOM.frontZ)
    wallGroup.add(lintel)

    const paneHeight = 3.0 - 0.5
    const MULLIONS = 10
    for (let i = 0; i <= MULLIONS; i += 1) {
      const x = -ROOM.halfWidth + (i * ROOM.halfWidth * 2) / MULLIONS
      const mullion = new three.Mesh(new three.BoxGeometry(0.07, paneHeight, 0.14), materials.structure)
      mullion.position.set(x, 0.5 + paneHeight / 2, ROOM.frontZ)
      wallGroup.add(mullion)
    }
    // 一道横梁把窗分成上下两段：上段给夜色，下段给街
    const transom = new three.Mesh(new three.BoxGeometry(ROOM.halfWidth * 2, 0.06, 0.12), materials.structure)
    transom.position.set(0, 2.05, ROOM.frontZ)
    wallGroup.add(transom)

    const glass = new three.Mesh(new three.PlaneGeometry(ROOM.halfWidth * 2, paneHeight), materials.glass)
    glass.position.set(0, 0.5 + paneHeight / 2, ROOM.frontZ)
    wallGroup.add(glass)

    root.add(wallGroup)

    /** 侧墙与后墙。同时是碰撞体与遮挡体，只能建一次、两处共用。 */
    const walls: { x: number; z: number; halfX: number; halfZ: number }[] = [
      { x: 0, z: ROOM.frontZ, halfX: ROOM.halfWidth, halfZ: 0.15 },
      { x: 0, z: ROOM.backZ, halfX: ROOM.halfWidth, halfZ: 0.15 },
      { x: -ROOM.halfWidth, z: (ROOM.backZ + ROOM.frontZ) / 2, halfX: 0.15, halfZ: (ROOM.backZ - ROOM.frontZ) / 2 },
      { x: ROOM.halfWidth, z: (ROOM.backZ + ROOM.frontZ) / 2, halfX: 0.15, halfZ: (ROOM.backZ - ROOM.frontZ) / 2 },
    ]
    for (const w of walls) {
      const mesh = new three.Mesh(new three.BoxGeometry(w.halfX * 2, ROOM.height, w.halfZ * 2), materials.structure)
      mesh.position.set(w.x, ROOM.height / 2, w.z)
      root.add(mesh)
      colliders.push({ kind: 'box', x: w.x, z: w.z, halfX: w.halfX, halfZ: w.halfZ })
      // 玻璃墙那面**不进** occluders：它是透明的，玩家要透过它看见夏夜。
      if (w.z !== ROOM.frontZ) occluders.push(mesh)
    }

    /* ---------------- 天花板与吊灯 ---------------- */

    /**
     * 天花板压得低，且顶面只挂两盏灯。
     *
     * 火锅店通常很亮很吵，这一家却是空的、暗的——亮的是锅，不是天花板。
     * 只给火锅桌上方那一盏真实点光，另一盏亮着但不投光，
     * 于是画面里立刻有了主次：光在桌上，其余地方是暗的。
     */
    const ceiling = new three.Mesh(
      new three.BoxGeometry(ROOM.halfWidth * 2, 0.2, ROOM.backZ - ROOM.frontZ),
      materials.structure,
    )
    ceiling.position.set(0, ROOM.height, (ROOM.backZ + ROOM.frontZ) / 2)
    root.add(ceiling)
    occluders.push(ceiling)

    const lampPositions: [number, number, number][] = [
      [TABLE.x, 2.6, TABLE.z],
      [-4.7, 2.5, 4.4],
    ]
    lampPositions.forEach(([x, y, z], index) => {
      const bulb = new three.Mesh(new three.SphereGeometry(0.08, 10, 8), materials.lamp)
      bulb.position.set(x, y, z)
      root.add(bulb)

      const cord = new three.Mesh(new three.CylinderGeometry(0.012, 0.012, ROOM.height - y, 4), materials.structure)
      cord.position.set(x, (ROOM.height + y) / 2, z)
      root.add(cord)

      if (index === 0) {
        const light = new three.PointLight(PALETTE.accent, 9, 10, 2)
        light.position.set(x, y - 0.25, z)
        root.add(light)
      }
    })

    /* ---------------- 火锅桌 ---------------- */

    /**
     * 桌子做成方桌而不是圆桌。
     *
     * 方桌有明确的"这一边"和"那一边"——两个人对坐时，桌子把
     * 「你在这头，我在那头」画成了一条直线。圆桌会让这个距离变得暧昧，
     * 而这场戏要的是一个已经无法挽回的、正对着的距离。
     */
    const tableGroup = new three.Group()
    const tableTop = new three.Mesh(
      new three.BoxGeometry(TABLE.halfX * 2, 0.07, TABLE.halfZ * 2),
      materials.furniture,
    )
    tableTop.position.set(TABLE.x, TABLE.top, TABLE.z)
    tableGroup.add(tableTop)

    for (let i = 0; i < 4; i += 1) {
      const leg = new three.Mesh(new three.BoxGeometry(0.07, TABLE.top, 0.07), materials.structure)
      leg.position.set(
        TABLE.x + (i % 2 ? 1 : -1) * (TABLE.halfX - 0.08),
        TABLE.top / 2,
        TABLE.z + (i < 2 ? 1 : -1) * (TABLE.halfZ - 0.08),
      )
      tableGroup.add(leg)
    }
    root.add(tableGroup)

    /**
     * 桌子一个碰撞体就够，不要逐条腿建。
     *
     * 而且这里的盒体比桌面**大一圈**：桌边还有碗筷和人的膝盖，
     * 让玩家停在离桌沿约三十厘米的地方，正好是坐下时手肘的位置。
     */
    colliders.push({ kind: 'box', x: TABLE.x, z: TABLE.z, halfX: TABLE.halfX + 0.15, halfZ: TABLE.halfZ + 0.15 })
    occluders.push(tableTop)

    /* ---------------- 锅（蒸汽的源头） ---------------- */

    /**
     * 一口铜锅：外圈锅身 + 中心烟囱。
     *
     * 为什么是烟囱锅（老北京/铜锅那种）而不是平底鸳鸯锅：
     * 烟囱给了蒸汽一个**明确的出口**。平底锅的蒸汽是摊开的，
     * 而这里是**一股**往上走的——在低多边形剪影里，
     * 一个集中的、笔直的、向上的东西才可能成为画面的视觉中心。
     *
     * 烟囱顶端也是全场的最高点（锅口 + 0.42m），玩家一进门
     * 视线就会被它带着往上走，然后才落到对面那个人身上。
     */
    const pot = new three.Group()
    const potBody = new three.Mesh(new three.CylinderGeometry(0.34, 0.28, 0.2, 20), materials.structure)
    potBody.position.y = 0.1
    const potRim = new three.Mesh(new three.CylinderGeometry(0.36, 0.36, 0.03, 20), materials.accent)
    potRim.position.y = 0.21
    // 汤面。压得很暗——锅底快干了，它不该是亮的
    const broth = new three.Mesh(
      new three.CircleGeometry(0.31, 20),
      new three.MeshBasicMaterial({ color: 0x3a2a1c, transparent: true, opacity: 0.9 }),
    )
    broth.rotation.x = -Math.PI / 2
    broth.position.y = 0.215
    const chimney = new three.Mesh(new three.CylinderGeometry(0.075, 0.1, 0.44, 12), materials.structure)
    chimney.position.y = 0.42
    pot.add(potBody, potRim, broth, chimney)
    pot.position.set(TABLE.x, TABLE.top + 0.035, TABLE.z)
    root.add(pot)

    /**
     * 锅底下的光。整个场景唯一的动态光源，也是最要紧的一个——
     * 它要"呼吸"，因为灶还没关，汤还在滚，而人已经不说话了。
     */
    const stoveGlow = new three.PointLight(PALETTE.accent, 3.2, 3.2, 2)
    stoveGlow.position.set(TABLE.x, TABLE.top + 0.16, TABLE.z)
    root.add(stoveGlow)

    /* ---------------- 蒸汽 ---------------- */

    /**
     * 蒸汽用一批低面数二十面体冒充，而不是粒子系统。
     *
     * 理由：`Points` 做不出体积感，而这一场要的是"一柱慢慢往上堆的雾"。
     * 十几个不透明度极低的二十面体逐帧调整 y 与 scale，
     * 视觉上就是一柱蒸汽，代价只有十几个 draw call，且完全吃雾。
     *
     * 所有个体的相位、速度、横漂、大小全走 `random`，于是同一颗种子
     * 每次重建出的都是同一柱蒸汽——它必须看起来是**同一锅汤**。
     */
    const steamGroup = new three.Group()
    const puffGeometry = new three.IcosahedronGeometry(0.5, 0)
    const PUFF_COUNT = 22
    type Puff = { mesh: import('three').Mesh; phase: number; speed: number; driftX: number; driftZ: number; scale: number }
    const puffs: Puff[] = []

    for (let i = 0; i < PUFF_COUNT; i += 1) {
      const mesh = new three.Mesh(puffGeometry, materials.steam)
      const scale = random.range(0.34, 0.62)
      mesh.scale.setScalar(scale)
      steamGroup.add(mesh)
      puffs.push({
        mesh,
        // 相位铺满整段行程，否则所有的团会同时升同时灭，像一块上下的板
        phase: i / PUFF_COUNT + random.swing(0.02),
        speed: random.range(0.9, 1.35),
        driftX: random.swing(0.16),
        driftZ: random.swing(0.16),
        scale,
      })
    }
    // 挂在锅上，于是蒸汽自己就跟着桌子的坐标走，不会与锅错位。
    // 起点抬到烟囱口（桌面 + 锅身 + 烟囱）——蒸汽从锅沿冒出来会读成"锅漏了"。
    steamGroup.position.set(TABLE.x, TABLE.top + 0.67, TABLE.z)
    root.add(steamGroup)

    /**
     * 蒸汽的行程。写在这里而不是散在 update 里，方便两处共用。
     *
     * `rise` 只有 1.5 米而不是更高：锅口在 1.42 米，层高 3.2 米，
     * 加上团本身最大约 0.7 米的半径，1.5 米正好让最大的一团停在 2.7 米处——
     * 再高就会有半个球戳穿天花板，而穿帮的雾比没有雾更难解释。
     */
    const STEAM = { rise: 1.5, wind: 0.4 } as const

    /* ---------------- 碗筷：这场戏里最细的那个信息 ---------------- */

    /**
     * 两副碗筷，而它们的状态不同。
     *
     * 她的筷子还架在碗沿上（她还在吃，是她在说话）；
     * 他的筷子是**搁在桌上的**（"我停住筷子"）。
     * 一副停止的筷子和一副没停的筷子，是这一场里唯一能把那句话
     * 钉在时间轴上的证据，比任何对话文字都便宜且准确。
     */
    const addBowl = (x: number, z: number, herSide: boolean) => {
      const bowl = new three.Mesh(new three.CylinderGeometry(0.1, 0.07, 0.07, 12, 1, true), materials.furniture)
      bowl.position.set(x, TABLE.top + 0.07, z)
      root.add(bowl)

      const chopsticks = new three.Group()
      for (let i = 0; i < 2; i += 1) {
        const stick = new three.Mesh(new three.BoxGeometry(0.008, 0.008, 0.26), materials.furniture)
        stick.position.x = (i - 0.5) * 0.026
        chopsticks.add(stick)
      }
      if (herSide) {
        // 架在碗沿上：斜插着，还接着吃
        chopsticks.position.set(x + 0.06, TABLE.top + 0.055, z)
        chopsticks.rotation.set(0, 0.5, 0.22)
      } else {
        // 平放在桌上：他停住了。这个姿态的差别就是那句话本身
        chopsticks.position.set(x + 0.24, TABLE.top + 0.045, z + 0.06)
        chopsticks.rotation.set(0, 0.82, 0)
      }
      root.add(chopsticks)
    }
    addBowl(TABLE.x + 0.3, TABLE.z - 0.1, true)
    addBowl(TABLE.x - 0.28, TABLE.z + 0.16, false)

    // 几只吃过的盘子，浅浅地堆在桌角——吃了很久了，该说的还没说
    for (let i = 0; i < 3; i += 1) {
      const plate = new three.Mesh(new three.CylinderGeometry(0.12, 0.1, 0.025, 12), materials.furniture)
      plate.position.set(
        TABLE.x - 0.34,
        TABLE.top + 0.055 + i * 0.026,
        TABLE.z - 0.3 + random.swing(0.04),
      )
      root.add(plate)
    }

    /* ---------------- 椅子 ---------------- */

    /**
     * 两把椅子做成同一个函数，理由与咖啡店那把倒扣的椅子相同：
     * 只有形状完全一致，「对面那把」和「我这把」才读得出是同一对。
     *
     * `parent` 可传：屋里那四张空桌的椅子各自挂到自己的空桌组上，
     * 而不是散在 root 下面——它们在语义上是"空桌的一部分"，
     * 拆开放会让以后想整体藏起那批空桌时找不到它们。
     */
    const addChair = (x: number, z: number, facing: number, parent: import('three').Object3D = root) => {
      const chair = new three.Group()
      const seat = new three.Mesh(new three.BoxGeometry(0.44, 0.06, 0.44), materials.furniture)
      seat.position.y = 0.45
      const back = new three.Mesh(new three.BoxGeometry(0.44, 0.5, 0.05), materials.furniture)
      back.position.set(0, 0.72, -0.2)
      chair.add(seat, back)
      for (let i = 0; i < 4; i += 1) {
        const leg = new three.Mesh(new three.BoxGeometry(0.04, 0.45, 0.04), materials.furniture)
        leg.position.set(i % 2 ? 0.18 : -0.18, 0.225, i < 2 ? 0.18 : -0.18)
        chair.add(leg)
      }
      chair.position.set(x, 0, z)
      chair.rotation.y = facing
      parent.add(chair)
      return chair
    }

    /**
     * 他的椅子：空着。
     *
     * 这是这一场里最狠的一处留白——玩家是"他"，所以"他"的位置必须空着，
     * 让玩家自己站进去。若在这里也放一个人影，玩家会立刻变成旁观者，
     * 而这一幕需要的是第一人称的在场。
     */
    addChair(TABLE.x, TABLE.z + 1.35, 0)
    // 她那把
    addChair(HER_SEAT.x, HER_SEAT.z, HER_SEAT.facing)

    /**
     * 每把椅子各自一个碰撞体，**不要**把两把合成一块。
     *
     * 合成一整块（halfZ 1.35）看起来更省，实际是把桌子左右两侧的走道
     * 一并封死了——玩家会被一堵看不见的墙挡在桌子外面，
     * 而这一场他本来就该能绕着桌子走，只是永远走不到对面去。
     */
    colliders.push({ kind: 'box', x: TABLE.x, z: TABLE.z + 1.35, halfX: 0.28, halfZ: 0.28 })
    colliders.push({ kind: 'box', x: HER_SEAT.x, z: HER_SEAT.z, halfX: 0.28, halfZ: 0.28 })

    /* ---------------- 对面那个人 ---------------- */

    /**
     * 她坐着的剪影：躯干 + 头，与看台上那个同一套造型。
     *
     * 全场唯一的高亮色，但**比看台那个更小、更暗一档**——
     * 这一场她只有两米远，玩家能看清她的轮廓，而她依然是坐着的、
     * 不动的、只说话不动的。近反而更冷，这是这一场与第一幕的差别。
     */
    const figure = new three.Group()
    const torso = new three.Mesh(new three.CapsuleGeometry(0.22, 0.46, 4, 12), materials.figure)
    torso.position.y = 0.62
    const head = new three.Mesh(new three.SphereGeometry(0.15, 12, 10), materials.figure)
    head.position.y = 1.02
    figure.add(torso, head)
    figure.position.set(HER_SEAT.x, 0.45, HER_SEAT.z)
    figure.rotation.y = HER_SEAT.facing
    root.add(figure)

    /* ---------------- 店里的空 ---------------- */

    /**
     * 「店里几乎没有别的客人」这句要靠**有桌椅但没人**来表达。
     *
     * 若是干脆不放别的桌子，那读起来是"这家店很小"；
     * 放几张擦干净的空桌，才读得出"这家店能坐很多人，但今天没有"。
     * 位置走固定种子，保证每次进入都是同一批空桌。
     */
    const emptyTables = new three.Group()
    for (let i = 0; i < 4; i += 1) {
      const side = i % 2 === 0 ? -1 : 1
      const x = side * random.range(3.2, 4.8)
      const z = random.range(1.5, 6.5)

      const top = new three.Mesh(new three.CylinderGeometry(0.52, 0.52, 0.06, 16), materials.furniture)
      top.position.set(x, TABLE.top, z)
      const column = new three.Mesh(new three.CylinderGeometry(0.06, 0.06, 0.72, 8), materials.structure)
      column.position.set(x, 0.36, z)
      emptyTables.add(top, column)

      // 每张桌子配一把拉出来的椅子——空着的店，椅子不会都推得整整齐齐。
      // 椅子挂进 `emptyTables`；那个组不设偏移（坐标即世界坐标），
      // 否则这批桌子的坐标就得写成两套。
      const facing = random.range(-Math.PI, Math.PI)
      addChair(
        x + Math.sin(facing) * 1.0,
        z + Math.cos(facing) * 1.0,
        facing + Math.PI,
        emptyTables,
      )

      colliders.push({ kind: 'cylinder', x, z, radius: 0.85 })
    }
    root.add(emptyTables)

    /* ---------------- 空调柜机 ---------------- */

    /**
     * 后墙边上那台空调柜机，是对 f03 开场那句"空调只能给客厅降温"的回声，
     * 也是本场景唯一一件"跟故事无关但跟记忆有关"的东西。
     *
     * 玩家一进门它就在背后（出生朝 -z），只有回头才看得见——
     * 与咖啡店的伞架同一个手法：回头这个动作本身就是内容。
     */
    const acUnit = new three.Mesh(new three.BoxGeometry(0.52, 1.75, 0.34), materials.furniture)
    acUnit.position.set(ROOM.halfWidth - 1.0, 0.875, ROOM.backZ - 0.5)
    root.add(acUnit)
    colliders.push({ kind: 'box', x: ROOM.halfWidth - 1.0, z: ROOM.backZ - 0.5, halfX: 0.32, halfZ: 0.22 })
    occluders.push(acUnit)

    /* ---------------- 店门 ---------------- */

    // 门比周围更暗，因为外面是夜——门就是一块黑
    const door = new three.Mesh(
      new three.BoxGeometry(1.6, 2.6, 0.12),
      new three.MeshLambertMaterial({ color: 0x0b0f10 }),
    )
    door.position.set(-2.4, 1.3, ROOM.backZ - 0.12)
    root.add(door)

    /* ---------------- 窗外的夏夜 ---------------- */

    /**
     * 街对面只做三件事：几扇还亮着的窗、一盏路灯、一排一动不动的树。
     *
     * 刻意**不加任何动态**：没有雨、没有风、没有飘动的塑料袋。
     * 这一场的空气是不流动的，"热"就是靠这个表达——
     * 外面的一切都静止，只有锅里的蒸汽在动。
     */
    const opposite = new three.Mesh(new three.BoxGeometry(28, 10, 8), materials.structure)
    opposite.position.set(2, 5, -24)
    root.add(opposite)

    for (let i = 0; i < 9; i += 1) {
      // 还亮着的窗比不亮的少：深夜的夏天，只该剩几盏
      if (!random.chance(0.5)) continue
      const pane = new three.Mesh(
        new three.PlaneGeometry(random.range(1.0, 1.5), random.range(1.2, 1.7)),
        materials.accent,
      )
      pane.position.set(-9 + i * 3.0, random.range(3.0, 6.4), -19.9)
      root.add(pane)
    }

    const lampPost = new three.Mesh(new three.CylinderGeometry(0.09, 0.12, 7, 6), materials.structure)
    lampPost.position.set(-6.5, 3.5, -13)
    root.add(lampPost)
    const lampHead = new three.Mesh(new three.SphereGeometry(0.22, 8, 6), materials.lamp)
    lampHead.position.set(-6.5, 7.1, -13)
    root.add(lampHead)

    // 街边一排树：一动不动，只提供一层剪影，让玻璃外面不是一条空的线
    const trees = new three.Group()
    for (let i = 0; i < 7; i += 1) {
      const x = -12 + i * 4 + random.swing(1.2)
      const height = random.range(5, 7.5)
      const trunk = new three.Mesh(new three.CylinderGeometry(0.16, 0.24, height, 6), materials.structure)
      trunk.position.set(x, height / 2, -11.5)
      const crown = new three.Mesh(new three.IcosahedronGeometry(random.range(1.7, 2.4), 0), materials.structure)
      crown.position.set(x, height + 0.5, -11.5)
      trees.add(trunk, crown)
    }
    root.add(trees)

    /* ---------------- 可交互 ---------------- */

    const hotspots: Hotspot[] = []

    /**
     * 代理球用 `material.visible = false` 而不是 `mesh.visible = false`：
     * 后者会让拾取系统（它自己会遍历祖先链查 visible）跳过这个对象，
     * 而我们要的恰恰是"看不见但点得到"。
     */
    const potProxy = new three.Mesh(
      new three.SphereGeometry(0.75, 10, 8),
      new three.MeshBasicMaterial({ visible: false }),
    )
    potProxy.position.set(TABLE.x, TABLE.top + 0.5, TABLE.z)
    root.add(potProxy)

    /**
     * 她那副筷子单独做一个热点。
     *
     * 为什么不和锅共用一个：这一场的信息量全在**状态**上——
     * 锅是"还在滚"，筷子是"停住了"。玩家能分别点它们，
     * 才可能分别读到这两件事。
     */
    const chopsticksProxy = new three.Mesh(
      new three.SphereGeometry(0.3, 8, 6),
      new three.MeshBasicMaterial({ visible: false }),
    )
    chopsticksProxy.position.set(TABLE.x + 0.24, TABLE.top + 0.12, TABLE.z + 0.06)
    root.add(chopsticksProxy)

    const figureProxy = new three.Mesh(
      new three.SphereGeometry(0.85, 10, 8),
      new three.MeshBasicMaterial({ visible: false }),
    )
    figureProxy.position.set(HER_SEAT.x, 1.05, HER_SEAT.z)
    root.add(figureProxy)

    /**
     * 三个热点，全部只返回 `true`（"这次点击被消费了"），
     * **没有一个是闸门**：这一场不需要玩家做任何事才允许故事继续，
     * 因为这一段本来就没有给过他任何可以做的事。
     */
    hotspots.push(
      {
        id: 'hotpot-pot',
        object: potProxy,
        label: '锅底快干了',
        /**
         * 2.6 米，从眼睛量起。锅面在 1.0 米高，眼高 1.68 米——
         * 那 0.68 米的高度差要先吃掉一部分额度；而他那把椅子的碰撞体
         * 把玩家挡在桌沿外半米左右，站定时眼到锅沿约 1.6 米。
         */
        reach: 2.6,
        onActivate: () => true,
      },
      {
        id: 'hotpot-chopsticks',
        object: chopsticksProxy,
        label: '我停住了筷子',
        // 比锅更小更矮，代理球也小，所以 reach 收紧一档，逼玩家看得更准
        reach: 2.2,
        onActivate: () => true,
      },
      {
        id: 'hotpot-her',
        object: figureProxy,
        label: '对面那个人',
        /**
         * 3.2 米。她是全场唯一"想走近也走不近"的东西——
         * 桌子、两把椅子、还有坐在那儿的她，共同把人挡在对面。
         * 这个 reach 刚好够玩家站在近侧看清她的轮廓，但永远隔着那张锅。
         */
        reach: 3.2,
        onActivate: () => true,
      },
    )

    /* ---------------- 返回 ---------------- */

    return {
      colliders,
      occluders,
      hotspots,
      update(elapsed, _delta, _player) {
        /**
         * 全场只有两处动效，与看台场景的克制程度一致。
         *
         * 1. 蒸汽：唯一持续运动的东西。
         * 2. 锅底的光：随汤的翻滚轻微呼吸。
         *
         * 蒸汽的位置每帧都从 `elapsed` 直接算出，而不是逐帧累加位移——
         * 累加会随掉帧漂移，宿主暂停再恢复时会整体跳一下。
         */
        for (const puff of puffs) {
          // 归一化行程（0 = 刚出烟囱口，1 = 散尽）
          const progress = (puff.phase + (elapsed * puff.speed) / STEAM.rise) % 1
          puff.mesh.position.y = progress * STEAM.rise
          // 横向随风偏一点，越往上偏得越远，所以是一柱斜着的雾
          puff.mesh.position.x = puff.driftX * progress * STEAM.wind
          puff.mesh.position.z = puff.driftZ * progress * STEAM.wind

          /**
           * 大小走一条"先胀后散"的包络，而不是一路变大。
           *
           * 一路变大只解释了上升，没解释消散——团到顶还是最大的一团，
           * 会像一串越飘越大的气球。`sin` 的包络让它在中段最饱满、
           * 到顶端缩回去：低多边形做不出的那点"散",就用收缩去冒充，
           * 这是本场景唯一一处需要交代清楚的形变。
           */
          const envelope = Math.sin(Math.PI * progress)
          puff.mesh.scale.setScalar(puff.scale * (0.28 + envelope * 1.75))
          puff.mesh.rotation.y = progress * 2.4 + puff.phase * 6
        }

        /**
         * 统一调蒸汽的整体不透明度。
         *
         * 共用一个材质意味着所有团一起淡——这在本场景反而是对的：
         * 玩家走近时蒸汽整体变清晰，是"你越靠近，这锅汤越具体"。
         * 逐团单独不透明度需要 22 份材质，代价换不来更多信息。
         */
        const distanceToTable = Math.hypot(_player.x - TABLE.x, _player.z - TABLE.z)
        materials.steam.opacity = 0.07 + Math.max(0, 1 - distanceToTable / 10) * 0.09

        // 灶还在烧：一亮一暗，周期压到 2.6 秒左右，比呼吸快一点，读得出"汤在滚"
        const simmer = 0.5 + 0.5 * Math.sin(elapsed * 2.4)
        stoveGlow.intensity = 2.6 + simmer * 1.6

        // 她几乎不动。0.006m 的起伏——低到玩家说不清看见了什么，
        // 但画面不会变成一张静止的截图。这是全程唯一的"她还在呼吸"的证据。
        figure.position.y = 0.45 + Math.sin(elapsed * 1.1) * 0.006
        figureProxy.position.y = 1.05 + Math.sin(elapsed * 1.1) * 0.006

        /**
         * 玩家越靠近桌子，锅沿那圈琥珀色越亮。
         *
         * 与看台场景里水洼随距离变亮、咖啡店里雨丝随距离变亮同源：
         * 让静止的布景对玩家的位置有反应，玩家才会觉得这个空间是活的，
         * 而不是一张贴在眼前的画。
         */
        const intimacy = Math.max(0, 1 - distanceToTable / 9)
        materials.accent.opacity = 0.45 + intimacy * 0.25
      },
      resize() {
        // 全部按米摆放，与宽高比无关，无需响应
      },
    }
  },
}
