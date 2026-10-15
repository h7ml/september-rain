import type { Collider, Hotspot, SceneRuntime, WorldScene, WorldSceneHandle } from '../types'

/**
 * 场景「图书馆窗边」——s01「我讲的其实都是我们」。
 *
 * ## 空间布局（坐标即叙事）
 *
 * ```
 *              x = -6.5                 x = +6.5
 *                │                        │
 *     z = +14  ──┴──── 高窗（冬天的白天从这一侧进来）────┴──
 *     z = +13.1       窗边长台 + 暖气片（她背对着窗坐）
 *     z = +11.9       ● 她的座位（空的：她只是听）        ← 距他 5.3m
 *     z = + 9.6       长桌 + 两盏台灯
 *     z = + 7.3       ▲ 他坐在这里（面前摊着一本开着的书）
 *     z = + 5.5       玩家出生点，朝 +z（yaw = π）
 *     z = + 2.5       两侧书墙（x = ±6.5，从 z = -4.7 排到 +9.7）
 *     z = - 9.7       后墙（暖气片 + 一扇什么都看不见的窗）
 * ```
 *
 * 出生点正对长桌，桌后是发亮的窗——这一眼就把人按在"坐在他对面听"的位置上。
 *
 * ## 坐标即叙事：为什么是 5.3 米
 *
 * 他的座位到她座位的水平距离约 5.3 米，中间隔着一张长桌和两盏台灯。
 * **这个距离是这段关系的全部**：他在讲，她在听，中间隔着的东西
 * 是书、是光、是他知道而她不知道的那些名字。近到能听见，
 * 远到不用回答。所以两个座位刻意不摆在一起——肩并肩会把
 * 「讲与听」变成「聊」，那就不是这一节了。
 *
 * ## 为什么书脊只做横向色带
 *
 * 书架上有一千本书，但没有一本读得出书名。这不是偷懒：
 * 只要有一本书能被认出来，玩家就会去读它，而这段记忆里
 * 书从来不是内容，只是**他在说话时的背景音**（马尔克斯、聂鲁达、
 * 博尔赫斯、加缪——那些名字一个都不该出现在墙上，只该出现在他的声音里）。
 * 色带做成压得很暗的墨绿灰阶，远看是一片有纹理的暗，近看是很多道横线，
 * 视线被推着往前走，最后落在窗上那个人身上。
 *
 * ## 冬天的暖气片
 *
 * 十二月，图书馆有暖气。暖气片在窗边那面墙上（窗下是它该在的位置），
 * 热空气一直往上走，而坐在窗边的人背对着它。这个细节不承担剧情，
 * 它承担的是"这里很暖，所以他可以一直讲下去"——正是这份舒服，
 * 让后来教室里那份落差变得难堪。
 */

/** 房间尺寸。窗、书墙、暖气片、天花板都要按它对齐，抽成常量避免两处各写一遍导致穿帮。 */
const ROOM = {
  /** 高窗所在的 z（房间最里侧） */
  windowZ: 14,
  /** 后墙所在的 z */
  backZ: -10,
  /** 侧墙的 x 绝对值 */
  halfWidth: 7,
  /** 层高 */
  height: 4,
} as const

/** 长桌的落点。桌面、桌腿、两把椅子、两盏台灯、两个热点代理共用它，必须同源。 */
const TABLE = { z: 9.6, halfX: 1.1, halfZ: 1.8, top: 0.75 } as const

/** 两个座位。它的间距就是这一节的叙事量，单独列出以免被后面的改动悄悄推近。 */
const SEATS = {
  /** 他：靠外一侧，背对房间 */
  his: { x: 0.7, z: 7.3 },
  /** 她：靠窗一侧，背对窗 */
  hers: { x: -0.7, z: 11.9 },
} as const

/** 书墙的中线。两侧对称，色带的随机范围要以它为准。 */
const SHELF = { x: 6.5, halfX: 0.55, halfZ: 7.2, centerZ: 2.5, height: 2.45 } as const

/** 场景调色板。与项目既有的墨绿灰阶 + 琥珀强调色保持一致。 */
const PALETTE = {
  ground: 0x1b2422,
  structure: 0x101619,
  /** 书架与桌椅比结构稍亮，否则在暗墙前看不出体积 */
  furniture: 0x1e2929,
  /** 书脊色带在一个很窄的灰阶区间里抖，不许跳出墨绿 */
  spineA: 0x1a2423,
  spineB: 0x15201f,
  spineC: 0x111a1a,
  /** 窗外。做成低透明度的亮面而不是真天空：这一节要的是"亮"，不是天气 */
  window: 0x9fb4b8,
  accent: 0xc8a878,
  /** 高亮人物色。全场只有两处用它：窗边那把椅子，和他面前的书 */
  figure: 0xe8e4da,
} as const

export const libraryScene: WorldScene = {
  id: 'library',
  caption: '校园 · 图书馆窗边',
  /** 固定种子。同一片浮尘、同一批书脊色带，每次进入都必须在同一处。 */
  seed: 0x5e9e04,

  build(runtime: SceneRuntime): WorldSceneHandle {
    const { three, root, random } = runtime

    /* ---------------- 材质 ---------------- */

    /**
     * 全场共用一组材质，理由与看台场景相同：剪影风里颜色本来就只有几种，
     * 每网格一份材质只会让回收时要释放的对象变多。
     *
     * 用 `MeshLambertMaterial` 而不是 `MeshBasicMaterial`：
     * 剪影需要"边缘比中间亮"的轮廓感，那来自光照，Basic 材质不吃光。
     */
    const materials = {
      ground: new three.MeshLambertMaterial({ color: PALETTE.ground }),
      structure: new three.MeshLambertMaterial({ color: PALETTE.structure }),
      furniture: new three.MeshLambertMaterial({ color: PALETTE.furniture }),
      /** 三档书脊色共用一份即可，但分开写便于单独调暗某一档 */
      spineA: new three.MeshLambertMaterial({ color: PALETTE.spineA }),
      spineB: new three.MeshLambertMaterial({ color: PALETTE.spineB }),
      spineC: new three.MeshLambertMaterial({ color: PALETTE.spineC }),
      /** 窗外的亮。不写深度，否则它会挡住窗框与暖气片 */
      window: new three.MeshBasicMaterial({
        color: PALETTE.window,
        transparent: true,
        opacity: 0.09,
        side: three.DoubleSide,
        depthWrite: false,
      }),
      accent: new three.MeshBasicMaterial({ color: PALETTE.accent, transparent: true, opacity: 0.45 }),
      /** 台灯的灯罩与灯下那点亮。台灯要能呼吸，所以这份材质由 update 单独持有 */
      lamp: new three.MeshBasicMaterial({ color: PALETTE.accent }),
      /** 灯下的一小片光斑。用低透明度圆盘冒充"光落在桌面上"，比做体积光便宜得多 */
      pool: new three.MeshBasicMaterial({
        color: PALETTE.accent,
        transparent: true,
        opacity: 0.07,
        depthWrite: false,
      }),
      figure: new three.MeshLambertMaterial({ color: PALETTE.figure }),
      /** 暖气片的热气。与咖啡店的雨丝同一种手法：线段便宜，且天然吃雾 */
      heat: new three.LineBasicMaterial({ color: PALETTE.accent, transparent: true, opacity: 0.14 }),
      mote: new three.PointsMaterial({ color: PALETTE.figure, size: 0.035, transparent: true, opacity: 0.3 }),
    }

    const colliders: Collider[] = []
    const occluders: import('three').Object3D[] = []

    /* ---------------- 地面、天花板与围合 ---------------- */

    // 地板用盒体而不是平面：它与后墙、天花板一起把房间封成一个盒子，
    // 室内的暗才有来源。这一节的白天全从窗那一侧进来，别处不能漏光。
    const floor = new three.Mesh(
      new three.BoxGeometry(ROOM.halfWidth * 2, 0.2, ROOM.windowZ - ROOM.backZ),
      materials.ground,
    )
    floor.position.set(0, -0.1, (ROOM.windowZ + ROOM.backZ) / 2)
    root.add(floor)

    const ceiling = new three.Mesh(
      new three.BoxGeometry(ROOM.halfWidth * 2, 0.2, ROOM.windowZ - ROOM.backZ),
      materials.structure,
    )
    ceiling.position.set(0, ROOM.height, (ROOM.windowZ + ROOM.backZ) / 2)
    root.add(ceiling)
    occluders.push(ceiling)

    /**
     * 四面墙。它们同时是碰撞体与遮挡体，所以只能建一次、两处共用。
     *
     * 窗那面墙**不进** occluders：它是透明的，玩家要透过它看见
     * 窗台上的光、暖气片和她的椅子。交给遮挡判定会直接掐掉本场景
     * 最重要的那个视线——"她坐在亮的地方，他坐在暗的地方"。
     */
    const walls: { x: number; z: number; halfX: number; halfZ: number }[] = [
      { x: 0, z: ROOM.windowZ, halfX: ROOM.halfWidth, halfZ: 0.15 },
      { x: 0, z: ROOM.backZ, halfX: ROOM.halfWidth, halfZ: 0.15 },
      { x: -ROOM.halfWidth, z: (ROOM.windowZ + ROOM.backZ) / 2, halfX: 0.15, halfZ: (ROOM.windowZ - ROOM.backZ) / 2 },
      { x: ROOM.halfWidth, z: (ROOM.windowZ + ROOM.backZ) / 2, halfX: 0.15, halfZ: (ROOM.windowZ - ROOM.backZ) / 2 },
    ]
    for (const w of walls) {
      const mesh = new three.Mesh(new three.BoxGeometry(w.halfX * 2, ROOM.height, w.halfZ * 2), materials.structure)
      mesh.position.set(w.x, ROOM.height / 2, w.z)
      root.add(mesh)
      colliders.push({ kind: 'box', x: w.x, z: w.z, halfX: w.halfX, halfZ: w.halfZ })
      if (w.z !== ROOM.windowZ) occluders.push(mesh)
    }

    /* ---------------- 高窗 ---------------- */

    /**
     * 高窗：上下各封一段，中间留 2.35 米高的玻璃，竖棂按 1.4 米的模数分开。
     *
     * 为什么窗要做得这么高（窗台 1.15 米、窗顶 3.5 米）：坐在窗边的人
     * 是**被框在光里**的。窗台太矮，光会漫到整张桌子上，两个人一起变亮，
     * 那样"落差"就没了；窗台抬高之后，只有她那个位置是亮的。
     */
    const WINDOW = { sill: 1.15, top: 3.5, mullions: 9 } as const
    const sill = new three.Mesh(
      new three.BoxGeometry(ROOM.halfWidth * 2, WINDOW.sill, 0.3),
      materials.structure,
    )
    sill.position.set(0, WINDOW.sill / 2, ROOM.windowZ)
    root.add(sill)

    const lintel = new three.Mesh(
      new three.BoxGeometry(ROOM.halfWidth * 2, ROOM.height - WINDOW.top, 0.3),
      materials.structure,
    )
    lintel.position.set(0, (WINDOW.top + ROOM.height) / 2, ROOM.windowZ)
    root.add(lintel)

    for (let i = 0; i <= WINDOW.mullions; i += 1) {
      const x = -ROOM.halfWidth + (i * ROOM.halfWidth * 2) / WINDOW.mullions
      const mullion = new three.Mesh(
        new three.BoxGeometry(0.1, WINDOW.top - WINDOW.sill, 0.16),
        materials.structure,
      )
      mullion.position.set(x, (WINDOW.sill + WINDOW.top) / 2, ROOM.windowZ)
      root.add(mullion)
    }

    const glass = new three.Mesh(
      new three.PlaneGeometry(ROOM.halfWidth * 2, WINDOW.top - WINDOW.sill),
      materials.window,
    )
    glass.position.set(0, (WINDOW.sill + WINDOW.top) / 2, ROOM.windowZ - 0.02)
    root.add(glass)

    /**
     * 冬天的白天。不架 DirectionalLight 从窗外打进来，而是在窗内侧
     * 放两盏大范围点光——一盏贴窗、一盏往屋里退一点。
     *
     * 理由：方向光要真的穿窗，得靠窗框的阴影贴图去切出光形状，
     * 而这个项目不开阴影贴图（剪影风不需要）。用两盏衰减很快的
     * 暖色点光，近处亮、两步之外就暗下去，读起来就是"白天从西边窗户进来的"。
     */
    const daylight = new three.PointLight(PALETTE.accent, 16, 26, 2)
    daylight.position.set(0, 2.4, ROOM.windowZ - 0.9)
    root.add(daylight)

    const daylightInner = new three.PointLight(PALETTE.accent, 5, 12, 2)
    daylightInner.position.set(0, 1.9, ROOM.windowZ - 4.2)
    root.add(daylightInner)

    /* ---------------- 浮尘 ---------------- */

    /**
     * 窗边飘着的浮尘。用 `Points` 而不是线段（咖啡店里雨用线段是对的，
     * 因为雨是**一条划痕**；浮尘是**一个个点**）。
     *
     * 只铺在窗内侧一块 4×2.4×4 的盒子里，别处不撒：浮尘是光存在的证据，
     * 只有光柱里看得见。撒满全屋会变成"这个房间很脏"。
     *
     * 位置固定不动，靠材质透明度极缓地呼吸——真正让画面活的是玩家走动时
     * 视差的变化，逐粒漂移反而会让人盯着盯。
     */
    const MOTES = 90
    const moteSpan = { x: 4, y: 2.4, z: 4 } as const
    const motePositions = new Float32Array(MOTES * 3)
    for (let i = 0; i < MOTES; i += 1) {
      motePositions[i * 3] = random.spread(0, moteSpan.x / 2)
      motePositions[i * 3 + 1] = random.range(0.4, moteSpan.y)
      motePositions[i * 3 + 2] = ROOM.windowZ - 1.2 - random.range(0, moteSpan.z)
    }
    const moteGeometry = new three.BufferGeometry()
    moteGeometry.setAttribute('position', new three.BufferAttribute(motePositions, 3))
    const motes = new three.Points(moteGeometry, materials.mote)
    root.add(motes)

    /* ---------------- 两侧书墙 ---------------- */

    /**
     * 书墙用"侧板 + 隔板 + 横向色带"拼，不用贴图。
     *
     * 贴图要生成 canvas 纹理、要处理各向异性过滤与 mipmap，而这套画面里
     * 书脊只是很多道压得很暗的横线。薄盒子便宜、不吃纹理、天然吃雾。
     * 每格六道色带、五格一层五层——数量刚好让近处读得出"这是书"，
     * 远处塌成一片有纹理的暗。
     */
    const buildShelf = (centerX: number) => {
      const shelf = new three.Group()
      const innerHalf = SHELF.halfX - 0.06

      for (const dx of [-innerHalf, innerHalf]) {
        const board = new three.Mesh(new three.BoxGeometry(0.06, SHELF.height, SHELF.halfZ * 2), materials.structure)
        board.position.set(centerX + dx, SHELF.height / 2, SHELF.centerZ)
        shelf.add(board)
      }

      const LEVELS = 5
      const BANDS_PER_LEVEL = 6
      for (let level = 0; level < LEVELS; level += 1) {
        const levelY = (SHELF.height / LEVELS) * (level + 1) - 0.06
        const shelfBoard = new three.Mesh(
          new three.BoxGeometry(innerHalf * 2, 0.06, SHELF.halfZ * 2),
          materials.structure,
        )
        shelfBoard.position.set(centerX, levelY, SHELF.centerZ)
        shelf.add(shelfBoard)

        for (let band = 0; band < BANDS_PER_LEVEL; band += 1) {
          const spineMaterial = random.pick([materials.spineA, materials.spineB, materials.spineC])
          const spine = new three.Mesh(
            new three.BoxGeometry(
              random.range(0.09, 0.16),
              random.range(0.5, 0.72),
              random.range(0.6, 1.0),
            ),
            spineMaterial,
          )
          // 立起来：绕 x 轴转 90° 之后，64 厘米的书脊才是竖直的
          spine.rotation.x = Math.PI / 2
          spine.position.set(
            centerX + random.spread(0, innerHalf * 0.6),
            levelY + 0.34,
            SHELF.centerZ + random.spread(0, SHELF.halfZ - 0.55),
          )
          shelf.add(spine)
        }
      }
      root.add(shelf)
      return shelf
    }

    const leftShelf = buildShelf(-SHELF.x)
    const rightShelf = buildShelf(SHELF.x)
    colliders.push({ kind: 'box', x: -SHELF.x, z: SHELF.centerZ, halfX: SHELF.halfX, halfZ: SHELF.halfZ })
    colliders.push({ kind: 'box', x: SHELF.x, z: SHELF.centerZ, halfX: SHELF.halfX, halfZ: SHELF.halfZ })
    occluders.push(leftShelf, rightShelf)

    /* ---------------- 长桌、两把椅子、两盏台灯 ---------------- */

    // 桌腿做成四角的方柱。这一节的家具都在 2 米以内被看清，腿的形状比桌面重要
    const legPositions: [number, number][] = [
      [-TABLE.halfX + 0.18, -TABLE.halfZ + 0.18],
      [TABLE.halfX - 0.18, -TABLE.halfZ + 0.18],
      [-TABLE.halfX + 0.18, TABLE.halfZ - 0.18],
      [TABLE.halfX - 0.18, TABLE.halfZ - 0.18],
    ]
    for (const [dx, dz] of legPositions) {
      const leg = new three.Mesh(new three.BoxGeometry(0.09, TABLE.top, 0.09), materials.furniture)
      leg.position.set(dx, TABLE.top / 2, TABLE.z + dz)
      root.add(leg)
    }
    const tableTop = new three.Mesh(
      new three.BoxGeometry(TABLE.halfX * 2, 0.08, TABLE.halfZ * 2),
      materials.furniture,
    )
    tableTop.position.set(0, TABLE.top, TABLE.z)
    root.add(tableTop)

    // 整张桌子一块碰撞体。玩家推不动它，逐条腿建碰撞体是浪费
    colliders.push({ kind: 'box', x: 0, z: TABLE.z, halfX: TABLE.halfX + 0.05, halfZ: TABLE.halfZ + 0.05 })
    occluders.push(tableTop)

    /**
     * 椅子。做成局部函数是因为要摆两处，而**两把必须一模一样**——
     * 只有形状完全一致，"两个座位之间的距离"才读得出是距离，
     * 而不是"两件不同的家具"。
     */
    const addChair = (x: number, z: number, facing: number) => {
      const chair = new three.Group()
      const seat = new three.Mesh(new three.BoxGeometry(0.46, 0.06, 0.46), materials.furniture)
      seat.position.y = 0.45
      const back = new three.Mesh(new three.BoxGeometry(0.46, 0.52, 0.05), materials.furniture)
      back.position.set(0, 0.73, -0.2)
      chair.add(seat, back)
      for (let i = 0; i < 4; i += 1) {
        const leg = new three.Mesh(new three.BoxGeometry(0.045, 0.45, 0.045), materials.furniture)
        leg.position.set(i % 2 ? 0.19 : -0.19, 0.225, i < 2 ? 0.19 : -0.19)
        chair.add(leg)
      }
      chair.position.set(x, 0, z)
      chair.rotation.y = facing
      root.add(chair)
      colliders.push({ kind: 'cylinder', x, z, radius: 0.42 })
      return chair
    }

    // 两把椅子都朝桌子（也就是朝对方）。他朝 +z，她朝 -z
    addChair(SEATS.his.x, SEATS.his.z, 0)
    const herChair = addChair(SEATS.hers.x, SEATS.hers.z, Math.PI)

    /**
     * 她椅子上的亮色靠垫。
     *
     * 全场唯一一个"属于她"的高亮物件，摆在她空着的座位上——
     * 玩家第一眼看见的是一块亮，走近才知道那是一把**没有人的**椅子。
     * 这与看台场景里那条白裙子是同一个手法：先给一个亮，再让人发现它是什么。
     */
    const cushion = new three.Mesh(new three.BoxGeometry(0.44, 0.07, 0.44), materials.figure)
    cushion.position.set(SEATS.hers.x, 0.51, SEATS.hers.z)
    cushion.rotation.y = Math.PI
    root.add(cushion)

    /**
     * 他面前摊着的那本书：两块几乎水平的白色薄板 + 中间的暗缝。
     *
     * 不做翻页动画。这一节里书是**一直摊着的**——他讲的时候不看书，
     * 书只是摊在那儿证明他确实读过了。
     */
    const openBook = new three.Group()
    for (const side of [-1, 1]) {
      const leaf = new three.Mesh(new three.BoxGeometry(0.16, 0.012, 0.24), materials.figure)
      leaf.position.set(side * 0.085, 0, 0)
      leaf.rotation.z = side * 0.06
      openBook.add(leaf)
    }
    const spine = new three.Mesh(new three.BoxGeometry(0.03, 0.02, 0.22), materials.structure)
    spine.position.set(0, -0.008, 0)
    openBook.add(spine)
    openBook.position.set(SEATS.his.x, TABLE.top + 0.01, SEATS.his.z + 0.34)
    openBook.rotation.y = 0.22
    root.add(openBook)

    /**
     * 两盏台灯。灯罩用纯色（不吃光），灯下垫一个低透明度圆盘冒充光斑。
     *
     * 只有**她那一侧**的那盏挂真实点光：这一节的光应该集中在
     * 「窗边那个座位」和「摊开的书」两处。两盏都投光会让整张桌子一样亮，
     * 而这段记忆里从来只有一个人在亮处。
     *
     * 灯罩材质单独持有一份（`materials.lamp` 是共用的，但那盏会呼吸的灯
     * 需要自己的实例），否则呼吸会同时改变另一盏的亮度。
     */
    const lampShadeMaterials: import('three').MeshBasicMaterial[] = []
    const addLamp = (x: number, z: number, lit: boolean) => {
      const shadeMaterial = new three.MeshBasicMaterial({ color: PALETTE.accent })
      lampShadeMaterials.push(shadeMaterial)

      const base = new three.Mesh(new three.CylinderGeometry(0.09, 0.11, 0.03, 10), materials.structure)
      base.position.set(x, TABLE.top + 0.055, z)
      const stem = new three.Mesh(new three.CylinderGeometry(0.018, 0.018, 0.42, 6), materials.structure)
      stem.position.set(x, TABLE.top + 0.25, z)
      const shade = new three.Mesh(new three.ConeGeometry(0.17, 0.16, 12, 1, true), shadeMaterial)
      shade.rotation.x = Math.PI
      shade.position.set(x, TABLE.top + 0.5, z)
      const pool = new three.Mesh(new three.CircleGeometry(0.68, 18), materials.pool)
      pool.rotation.x = -Math.PI / 2
      pool.position.set(x, TABLE.top + 0.055, z)
      root.add(base, stem, shade, pool)

      if (lit) {
        const light = new three.PointLight(PALETTE.accent, 4, 6.5, 2)
        light.position.set(x, TABLE.top + 0.46, z)
        root.add(light)
        return light
      }
      return null
    }

    // 她那一侧的灯在他与她之间，正好把两个人的轮廓拉开
    const litLamp = addLamp(-0.75, 10.6, true)
    addLamp(0.85, 8.2, false)
    /** 会呼吸的那一盏。呼吸即"他还在这儿说着"，灯不是布景状态，是一段正在进行的时间。 */
    const breathingShade = lampShadeMaterials[0]

    /* ---------------- 窗边长台与暖气片 ---------------- */

    // 窗下的长台：她的椅子靠窗，但中间隔着暖气片，所以她其实够不到台面
    const counter = new three.Mesh(new three.BoxGeometry(12.4, 0.06, 0.5), materials.furniture)
    counter.position.set(0, 0.98, ROOM.windowZ - 0.55)
    root.add(counter)
    colliders.push({ kind: 'box', x: 0, z: ROOM.windowZ - 0.55, halfX: 6.2, halfZ: 0.25 })
    occluders.push(counter)

    /**
     * 暖气片。只做两侧各一段，中间那段留给窗——真实的窗下墙就是这样分段的。
     *
     * 它同时承担一个叙事任务：暖气片在窗边，窗边是她的座位。
     * 后来在教室里也有暖气，但那间教室是空的、冷的（见 classroom.ts）。
     */
    const RADIATOR = { y: 0.3, height: 0.62, halfZ: 0.95, x: 6.28 } as const
    const radiatorMaterials: import('three').MeshLambertMaterial[] = []
    for (const side of [-1, 1]) {
      const finMaterial = new three.MeshLambertMaterial({ color: PALETTE.furniture })
      radiatorMaterials.push(finMaterial)
      const body = new three.Mesh(
        new three.BoxGeometry(0.22, 0.1, RADIATOR.halfZ * 2),
        finMaterial,
      )
      const x = side * RADIATOR.x
      const z = ROOM.windowZ - 0.9
      body.position.set(x, RADIATOR.y - RADIATOR.height / 2, z)
      root.add(body)

      // 一片一片的翅片：只做 7 片，密度刚好在近处读得出这是暖气片
      for (let fin = 0; fin < 7; fin += 1) {
        const plate = new three.Mesh(new three.BoxGeometry(0.16, RADIATOR.height - 0.1, 0.05), finMaterial)
        plate.position.set(
          x,
          RADIATOR.y - 0.05,
          z - RADIATOR.halfZ + 0.16 + (fin * (RADIATOR.halfZ * 2 - 0.32)) / 6,
        )
        root.add(plate)
      }
      colliders.push({ kind: 'box', x, z, halfX: 0.2, halfZ: RADIATOR.halfZ })
    }

    /**
     * 暖气片上方的热浪：两段各自往复上升的竖线。
     *
     * 用线段而不是粒子：热浪的特征是"抖动且几乎看不见的一条上升气流"，
     * 点精灵会变成"窗边在下小雪"。透明度压到 0.14——这一节的主角是两个人，
     * 暖气片只是让屋里暖起来的证据，不能抢戏。
     */
    const HEAT_LINES = 14
    const HEAT_SPAN = 0.9
    const heatBase = new Float32Array(HEAT_LINES * 3)
    for (let i = 0; i < HEAT_LINES; i += 1) {
      const side = i % 2 === 0 ? -1 : 1
      heatBase[i * 3] = side * RADIATOR.x + random.swing(0.05)
      heatBase[i * 3 + 1] = random.range(0, HEAT_SPAN)
      heatBase[i * 3 + 2] = ROOM.windowZ - 0.9 + random.spread(0, RADIATOR.halfZ - 0.2)
    }
    const heatPositions = new Float32Array(HEAT_LINES * 6)
    const heatAttribute = new three.BufferAttribute(heatPositions, 3)
    // 每帧都要重写，声明成动态用法让驱动不要把它放在只读的显存路径上
    heatAttribute.setUsage(three.DynamicDrawUsage)
    const heatGeometry = new three.BufferGeometry()
    heatGeometry.setAttribute('position', heatAttribute)
    const heat = new three.LineSegments(heatGeometry, materials.heat)
    // 热浪围在窗边一小块，包围球按实际范围给会随帧变化，直接关掉视锥剔除
    heat.frustumCulled = false
    root.add(heat)

    /**
     * 由时间直接算出热浪位置，而不是逐帧累加位移。
     *
     * 累加会随掉帧漂移，暂停再恢复时会"跳"一下；由时间求值则与帧率无关。
     */
    const stepHeat = (elapsed: number) => {
      for (let i = 0; i < HEAT_LINES; i += 1) {
        const baseY = heatBase[i * 3 + 1] + elapsed * 0.32
        // JS 的 % 对负数返回负值，这里要的是循环取模
        const y = ((baseY % HEAT_SPAN) + HEAT_SPAN) % HEAT_SPAN
        const x = heatBase[i * 3] + Math.sin(elapsed * 1.1 + i) * 0.045
        const z = heatBase[i * 3 + 2]
        heatPositions[i * 6] = x
        heatPositions[i * 6 + 1] = y + RADIATOR.y
        heatPositions[i * 6 + 2] = z
        heatPositions[i * 6 + 3] = x - Math.sin(elapsed * 1.1 + i) * 0.03
        heatPositions[i * 6 + 4] = y + RADIATOR.y + 0.16
        heatPositions[i * 6 + 5] = z
      }
      heatAttribute.needsUpdate = true
    }
    stepHeat(0)

    /* ---------------- 可交互：书架、摊开的书、窗边的椅子 ---------------- */

    /**
     * 热点一律挂在不透光的球形代理上，而不是它描述的那个网格。
     *
     * 理由与看台场景相同：书脊只有十几厘米宽，2 米外射线打中的窗口极窄，
     * 玩家会觉得"明明对着那一排书却点不中"。用一个球把整片区域包起来，
     * 拾取窗口就变成了"这一排书架"——玩家想的本来也是那一排。
     *
     * 球体用 `material.visible = false` 而不是 `mesh.visible = false`：
     * 后者会让射线直接跳过它，而我们要的是"看不见但点得到"。
     */
    const hotspots: Hotspot[] = []

    const shelfProxy = new three.Mesh(
      new three.BoxGeometry(SHELF.halfX * 2, SHELF.height, SHELF.halfZ * 2),
      new three.MeshBasicMaterial({ visible: false }),
    )
    // 挂在右侧那排上。玩家出生在过道中间，两侧一样近，选右边是因为
    // 她坐在窗那边的右半边，视线本来就在这一侧
    shelfProxy.position.set(SHELF.x, SHELF.height / 2, SHELF.centerZ + 2)
    root.add(shelfProxy)

    hotspots.push({
      id: 'shelf-spines',
      object: shelfProxy,
      label: '一排读不出书名的书脊',
      /**
       * 3.2 米。书架就在过道边上，站在过道中央时眼到书脊约 5.5 米，
       * 所以这个额度逼玩家**往旁边走一步**。刻意的：这一排书不值得走近，
       * 但玩家会走近，然后在走近的那一刻发现自己站在一排没有名字的书前面。
       */
      reach: 3.2,
      onActivate: () => true,
    })

    const bookProxy = new three.Mesh(
      new three.SphereGeometry(0.42, 10, 8),
      new three.MeshBasicMaterial({ visible: false }),
    )
    bookProxy.position.set(SEATS.his.x, TABLE.top + 0.16, SEATS.his.z + 0.34)
    root.add(bookProxy)

    hotspots.push({
      id: 'open-book',
      object: bookProxy,
      label: '他摊在桌上的那本书',
      /**
       * 2.2 米，且是**从眼睛量起的三维距离**（眼高 1.68m）。
       *
       * 书躺在 0.76 米高的桌面上，但玩家被桌子的碰撞体挡在 1.85 米外，
       * 站定时眼到书实测约 2.2 米——额度刚好卡在"走到桌边"这一步上，
       * 不留余量，也不要求玩家精确站位。
       */
      reach: 2.6,
      onActivate: () => true,
    })

    const herChairProxy = new three.Mesh(
      new three.SphereGeometry(0.62, 10, 8),
      new three.MeshBasicMaterial({ visible: false }),
    )
    herChairProxy.position.set(SEATS.hers.x, 0.6, SEATS.hers.z)
    root.add(herChairProxy)

    hotspots.push({
      id: 'her-seat-by-window',
      object: herChairProxy,
      label: '窗边那把空着的椅子',
      /**
       * 3.4 米。她这一侧被桌子的碰撞体挡住，玩家要绕到窗边才能看清那块亮色。
       *
       * 为什么额度给得比他的书宽：这个热点的意义是"你必须走过去才看得见
       * 那把椅子上没有人"，给太紧会变成一次失败的点击，给太松则
       * 从出生点就能点到——而出生点到她那里有 6.4 米。
       */
      reach: 3.4,
      onActivate: () => true,
    })

    /* ---------------- 返回 ---------------- */

    return {
      colliders,
      occluders,
      hotspots,
      /**
       * 这一节没有闸门：故事节点 s01 是纯阅读节点，`onGateSatisfied` 不注册。
       *
       * 与看台、咖啡店的区别是刻意的：那两节的闸门是"你必须先看见某样东西"，
       * 而这里玩家已经被放在他对面了——他开口讲是他自己的事，
       * 不需要玩家做任何动作去换。玩家能做的只是走近那排书、
       * 那把空椅子、那盏灯，然后决定是听下去还是走开。
       *
       * 契约里 `onGateSatisfied` 是可选项，宿主拿不到它就会
       * 按"没有前置条件"处理，这正是这里要的。
       */
      update(elapsed, _delta, player) {
        /**
         * 两处只有这个场景才有的动效（克制到与看台场景同一量级）：
         * 1. 她那一侧的台灯在呼吸——慢，比人呼吸还慢，读起来是"有人还在说话"
         * 2. 暖气片上方的热浪在往复上升
         *
         * 都放在这里而不是骨架里——骨架不该知道任何具体场景的表演。
         */
        const breath = 0.5 + 0.5 * Math.sin(elapsed * 0.62)
        breathingShade.color.setHex(PALETTE.accent).multiplyScalar(0.62 + breath * 0.38)
        if (litLamp) litLamp.intensity = 2.6 + breath * 1.9
        materials.pool.opacity = 0.05 + breath * 0.05

        stepHeat(elapsed)

        // 浮尘随呼吸几乎不动地亮一下。只是为了让窗边那束光"活"，
        // 幅度大到能看出来就变成萤火虫了
        materials.mote.opacity = 0.22 + 0.1 * Math.sin(elapsed * 0.4)

        /**
         * 玩家靠近窗边时，那排书脊更暗一点。
         *
         * 借的是"越靠近亮处，暗处越暗"这个错觉：走到窗前，眼睛适应了光，
         * 身后的书墙就沉下去了。这一手法与看台场景里水洼随距离变亮同源，
         * 都是让静止的布景对玩家的位置有反应。
         */
        const distanceToWindow = Math.abs(player.z - ROOM.windowZ)
        const towardLight = Math.max(0, 1 - distanceToWindow / 22)
        materials.spineA.color.setHex(PALETTE.spineA).multiplyScalar(1 - towardLight * 0.45)
        materials.spineB.color.setHex(PALETTE.spineB).multiplyScalar(1 - towardLight * 0.45)
        materials.spineC.color.setHex(PALETTE.spineC).multiplyScalar(1 - towardLight * 0.45)
      },
      resize() {
        // 这个场景的布景与宽高比无关（全部按米摆放），无需响应
      },
    }
  },
}
