import type { Collider, Hotspot, SceneRuntime, WorldScene, WorldSceneHandle } from '../types'

/**
 * 场景「出租屋 · 落地窗前」——第四幕，与 `loft-night.ts` 是**同一个空间的两个时刻**。
 *
 * ## 空间布局（坐标即叙事）
 *
 * ```
 *        z = -46  封城中的城市（一栋栋熄了的楼，只留几扇窗）
 *           ↑
 *        z =  -7  落地窗 ← 出生点正对着看的就是它
 *        z =  -3.4  沙发（背靠窗，她的位置在左半边）
 *        z =  -3.0  猫窝（挨着沙发扶手，空着）
 *        z =  -2.6  笔记本的小桌（屏幕的冷光）
 *        z =   0  地毯
 *        z =   5  玩家出生点
 *        z =   8  后墙与门
 * ```
 *
 * 出生朝 `yaw = 0`（视线 `(0, 0, -1)`，即朝 `-z`）。这条视线上依次是：
 * 地毯 → 沙发 → 落地窗 → 窗外静下来的城市。**这是刻意的**：她被困在
 * 上海的酒店里，每天视频时对着的是她那边的窗，他在这边对着这面窗——
 * 两个人在同一个动作里，隔着两块屏幕和一千公里。玩家一进场就站在这条视线上。
 *
 * ## 为什么沙发是背对窗的
 *
 * 现实里沙发常常正对窗。这里反过来：沙发背靠窗，面对屋里。
 * 三个理由，缺一不可——
 * 1. 出生点在 `+z`，背对窗的沙发把**座面朝向玩家**。玩家一进来就看得见
 *    她常坐的那个位置是空的，而不只是看见一张椅子的背影。这个场景里
 *    唯一重要的一块地方必须从第一眼就可见。
 * 2. 落地窗在沙发背后，于是没有人挡着窗——那面窗要留给「她那边也在下雨」。
 * 3. `loft-night.ts` 里她坐在同一个座面上，背靠窗、逆着窗光。
 *    猫趴在她腿上时，人和猫都只剩一圈轮廓——这正是这场戏要的画面。
 *
 * ## 与夜晚那一场的一致性
 *
 * 全部空间常量写在下面的 `LOFT` 里，逐字节复制到 `loft-night.ts`，
 * 两处都带一行「必须与另一方保持一致」的说明。这是刻意的取舍：
 * 抽成第三个共享模块更 DRY，但这两个场景是**同一份布景的两种光**，
 * 任何一方单独挪动一件家具都会让玩家认不出这是同一个地方；
 * 把常量摆在各自文件里，改的人第一眼就会看见那行警告。
 *
 * ## 为什么猫窝是空的
 *
 * 这场戏里猫必须在。但这一节的关键不是「猫」，而是「猫只肯睡在
 * 沙发上她常坐的那个位置」——所以猫要睡在那个位置上，猫窝要**空着**。
 * 空着的猫窝是这间屋子里唯一一件多余的家具，它说明猫是自己选了别处，
 * 而不是随便找了个地方躺下。
 */

/**
 * 房间与家具的尺度。
 *
 * **必须与 `loft-night.ts` 里的同名常量保持一致。** 两个场景共用同一套
 * 坐标，玩家在夜场里转身时看到的墙角必须还在白天那个位置。
 */
const LOFT = {
  /** 落地窗所在的 z */
  frontZ: -7,
  /** 后墙（门）所在的 z */
  backZ: 8,
  /** 侧墙的 x 绝对值 */
  halfWidth: 6,
  /** 层高。比咖啡店高半米——loft 的空间感一半来自这个高度 */
  height: 3.6,

  /** 落地窗：窗台矮、窗顶高，整面墙几乎都是玻璃 */
  windowHalfWidth: 4.4,
  windowSill: 0.12,
  windowHead: 3.2,

  /** 沙发中心 */
  sofaX: -2.0,
  sofaZ: -3.4,
  /** 她常坐的位置相对沙发中心的纵向偏移（负值 = 靠落地窗那一头） */
  seatOffsetX: -0.72,
  /** 座面高 */
  seatTop: 0.46,

  /** 猫窝。挨着沙发靠窗那一侧的扶手，与她的位置只隔半米——这个距离就是全部 */
  catBedX: -4.0,
  catBedZ: -3.0,

  /** 笔记本小桌 */
  deskX: 2.5,
  deskZ: -2.6,
  deskTop: 0.74,

  /** 落地灯 */
  lampX: 3.4,
  lampZ: 1.2,
} as const

/** 她常坐的那个位置。三个地方要用（猫、代理球、猫窝的对位），只能算一次。 */
const HER_SEAT = { x: LOFT.sofaX + LOFT.seatOffsetX, z: LOFT.sofaZ } as const

/** 场景调色板。墨绿灰阶 + 琥珀强调色，与项目其余场景同一套。 */
const PALETTE = {
  ground: 0x1b2422,
  structure: 0x101619,
  /** 家具比结构稍亮，否则在暗墙前读不出体积 */
  furniture: 0x1e2929,
  /** 白天的城市：比室内更亮一点，但一点不暖——封控期的天空没有颜色 */
  city: 0x232e31,
  glass: 0x9fb4b8,
  accent: 0xc8a878,
  /** 笔记本屏幕的冷光。全场唯一一处非琥珀的亮色，它与窗外的城市同温 */
  screen: 0x9fb4b8,
  /** 高亮人物色，与看台场景的白裙子同源 */
  figure: 0xe8e4da,
} as const

export const loftScene: WorldScene = {
  id: 'loft',
  caption: '出租屋 · 落地窗前',
  /** 固定种子。同一批城市亮窗、同一道玻璃反光，每次进入都必须在同一处。 */
  seed: 0x5e9e06,

  build(runtime: SceneRuntime): WorldSceneHandle {
    const { three, root, random } = runtime

    /* ---------------- 材质 ---------------- */

    /**
     * 全场共用一组材质，理由与看台、咖啡店两场相同：剪影风里颜色本来
     * 就只有几种，每网格一份材质只会让回收时要释放的意外变多。
     */
    const materials = {
      ground: new three.MeshLambertMaterial({ color: PALETTE.ground }),
      structure: new three.MeshLambertMaterial({ color: PALETTE.structure }),
      furniture: new three.MeshLambertMaterial({ color: PALETTE.furniture }),
      city: new three.MeshLambertMaterial({ color: PALETTE.city }),
      accent: new three.MeshBasicMaterial({ color: PALETTE.accent, transparent: true, opacity: 0.5 }),
      /** 窗外投在屋里的一层冷光。与琥珀色分开——这一场里没有暖的东西 */
      daylight: new three.MeshBasicMaterial({ color: PALETTE.glass, transparent: true, opacity: 0.12, depthWrite: false }),
      /** 白天的玻璃比夜里更"存在"一点：日光打在玻璃上会留一层灰白 */
      glass: new three.MeshBasicMaterial({
        color: PALETTE.glass,
        transparent: true,
        opacity: 0.05,
        side: three.DoubleSide,
        depthWrite: false,
      }),
      screen: new three.MeshBasicMaterial({ color: PALETTE.screen, transparent: true, opacity: 0.55 }),
      figure: new three.MeshLambertMaterial({ color: PALETTE.figure }),
    }

    const colliders: Collider[] = []
    const occluders: import('three').Object3D[] = []

    /* ---------------- 地面与天花板 ---------------- */

    // 地板往下沉 0.1，脚底平面才是 y = 0
    const floor = new three.Mesh(
      new three.BoxGeometry(LOFT.halfWidth * 2, 0.2, LOFT.backZ - LOFT.frontZ),
      materials.ground,
    )
    floor.position.set(0, -0.1, (LOFT.backZ + LOFT.frontZ) / 2)
    root.add(floor)

    /**
     * 天花板是这场戏的必需品，不是补完。
     *
     * 没有它，抬头就是场景背景色，「落地窗」这个立面的高度就失去了参照，
     * 会退化成"地板上竖着的一块玻璃"。有了天花板，玩家才会意识到
     * 自己的头离窗顶还有一米多——loft 的高就是在这段距离里读出来的。
     */
    const ceiling = new three.Mesh(
      new three.BoxGeometry(LOFT.halfWidth * 2, 0.2, LOFT.backZ - LOFT.frontZ),
      materials.structure,
    )
    ceiling.position.set(0, LOFT.height, (LOFT.backZ + LOFT.frontZ) / 2)
    root.add(ceiling)
    occluders.push(ceiling)

    /* ---------------- 落地窗 ---------------- */

    /**
     * 窗做成「下窗台 + 上过梁 + 竖棂 + 一整面玻璃」。
     *
     * 窗台只有 12 厘米——真实落地窗的窗台就是一条压条。把它做得像
     * 咖啡店那道半米矮墙，站立时视线就会被切掉一截，"落地"两个字就没了。
     *
     * 竖棂间距 2.2 米，比咖啡店（1.75 米）更疏：这一场的窗要看起来
     * **更整块**，因为它是"一整面窗对着她一整面窗"。
     */
    const windowGroup = new three.Group()

    const sill = new three.Mesh(
      new three.BoxGeometry(LOFT.windowHalfWidth * 2, LOFT.windowSill, 0.24),
      materials.structure,
    )
    sill.position.set(0, LOFT.windowSill / 2, LOFT.frontZ)
    windowGroup.add(sill)

    const head = new three.Mesh(
      new three.BoxGeometry(LOFT.halfWidth * 2, LOFT.height - LOFT.windowHead, 0.24),
      materials.structure,
    )
    head.position.set(0, (LOFT.windowHead + LOFT.height) / 2, LOFT.frontZ)
    windowGroup.add(head)

    // 窗两侧到侧墙之间的实墙。窗是 8.8 米宽，房间 12 米——两侧各留 1.6 米，
    // 玩家站在角落里才有"这面窗是开在这面墙上的"这个认识
    for (const side of [-1, 1]) {
      const pier = new three.Mesh(
        new three.BoxGeometry(LOFT.halfWidth - LOFT.windowHalfWidth, LOFT.height, 0.24),
        materials.structure,
      )
      pier.position.set(side * (LOFT.halfWidth + LOFT.windowHalfWidth) / 2, LOFT.height / 2, LOFT.frontZ)
      windowGroup.add(pier)
    }

    const paneHeight = LOFT.windowHead - LOFT.windowSill
    for (let i = 0; i <= 4; i += 1) {
      const mullion = new three.Mesh(
        new three.BoxGeometry(0.07, paneHeight, 0.12),
        materials.structure,
      )
      mullion.position.set(-LOFT.windowHalfWidth + (i * LOFT.windowHalfWidth) / 2, LOFT.windowSill + paneHeight / 2, LOFT.frontZ)
      windowGroup.add(mullion)
    }

    const pane = new three.Mesh(
      new three.PlaneGeometry(LOFT.windowHalfWidth * 2, paneHeight),
      materials.glass,
    )
    pane.position.set(0, LOFT.windowSill + paneHeight / 2, LOFT.frontZ)
    windowGroup.add(pane)

    /**
     * 窗光落在地板上的一块亮斑。
     *
     * 白天这一场的全部信息量都在"光从哪来"。屋里没有第二处光源
     * （落地灯是灭的，笔记本只照亮自己），如果只在窗外放几栋楼，
     * 室内会是一块均匀的暗，白天和夜里就分不出来。一块贴着地面的
     * 长条亮斑花不了几个面片，却把"这面窗正在往屋里送光"钉死了——
     * 它在夜场里会被换成一盏灯在地板上的暖色光晕。
     */
    const daylightPool = new three.Mesh(
      new three.PlaneGeometry(LOFT.windowHalfWidth * 1.7, 3.6),
      materials.daylight,
    )
    daylightPool.rotation.x = -Math.PI / 2
    daylightPool.position.set(0, 0.014, LOFT.frontZ + 2.2)
    root.add(daylightPool)
    root.add(windowGroup)

    /**
     * 窗台上的一只杯子。
     *
     * 全场唯一的琥珀色，放在窗台上而不是桌上——它是"人还在这里生活"
     * 的最后一个证据，而位置选在窗前，是因为他每天站在这里和她视频。
     * 杯子就在他手边。
     */
    const mug = new three.Mesh(new three.CylinderGeometry(0.055, 0.045, 0.1, 10), materials.structure)
    mug.position.set(1.3, LOFT.windowSill + 0.05, LOFT.frontZ + 0.2)
    root.add(mug)

    /* ---------------- 围合：三面墙 ---------------- */

    /**
     * 侧墙与后墙同时是碰撞体和遮挡体，所以只能建一次、两处共用。
     *
     * 窗那一面**不进** `occluders`：它是透明的，玩家要透过它看见城市，
     * 交给遮挡判定会直接掐掉本场景最重要的那个视角。碰撞体还是要给——
     * 这一节里他哪儿也去不了，正是这个意思。
     */
    const walls: { x: number; z: number; halfX: number; halfZ: number }[] = [
      { x: 0, z: LOFT.frontZ, halfX: LOFT.halfWidth, halfZ: 0.15 },
      { x: 0, z: LOFT.backZ, halfX: LOFT.halfWidth, halfZ: 0.15 },
      { x: -LOFT.halfWidth, z: (LOFT.backZ + LOFT.frontZ) / 2, halfX: 0.15, halfZ: (LOFT.backZ - LOFT.frontZ) / 2 },
      { x: LOFT.halfWidth, z: (LOFT.backZ + LOFT.frontZ) / 2, halfX: 0.15, halfZ: (LOFT.backZ - LOFT.frontZ) / 2 },
    ]
    for (const w of walls) {
      const mesh = new three.Mesh(
        new three.BoxGeometry(w.halfX * 2, LOFT.height, w.halfZ * 2),
        materials.structure,
      )
      mesh.position.set(w.x, LOFT.height / 2, w.z)
      root.add(mesh)
      colliders.push({ kind: 'box', x: w.x, z: w.z, halfX: w.halfX, halfZ: w.halfZ })
      if (w.z !== LOFT.frontZ) occluders.push(mesh)
    }

    /* ---------------- 沙发 ---------------- */

    /**
     * 布艺沙发：底座 + 靠背 + 两个扶手 + 三个坐垫。
     *
     * 三个坐垫是刻意的。一个整块长坐垫会让"她的位置"变成沙发的一部分，
     * 而三个坐垫里**左边那个**才是她的位置——猫睡在其中一个坐垫上，
     * 比猫睡在沙发上具体得多。
     *
     * 沙发背朝落地窗（靠背在 `+z` 侧），所以玩家从出生点看见的是座面。
     */
    const sofa = new three.Group()
    const sofaDepth = 0.94
    const base = new three.Mesh(new three.BoxGeometry(2.16, LOFT.seatTop, sofaDepth), materials.furniture)
    base.position.y = LOFT.seatTop / 2
    const back = new three.Mesh(new three.BoxGeometry(2.16, 0.5, 0.18), materials.furniture)
    back.position.set(0, LOFT.seatTop + 0.25, -sofaDepth / 2 + 0.09)
    sofa.add(base, back)
    for (const side of [-1, 1]) {
      const arm = new three.Mesh(new three.BoxGeometry(0.16, 0.2, sofaDepth), materials.furniture)
      arm.position.set(side * 1.0, LOFT.seatTop + 0.1, 0)
      sofa.add(arm)
    }
    for (let i = 0; i < 3; i += 1) {
      const cushion = new three.Mesh(new three.BoxGeometry(0.64, 0.11, 0.72), materials.furniture)
      cushion.position.set(-0.68 + i * 0.68, LOFT.seatTop + 0.055, 0.06)
      sofa.add(cushion)
    }
    sofa.position.set(LOFT.sofaX, 0, LOFT.sofaZ)
    root.add(sofa)
    colliders.push({ kind: 'box', x: LOFT.sofaX, z: LOFT.sofaZ, halfX: 1.08, halfZ: sofaDepth / 2 })
    occluders.push(sofa)

    /**
     * 沙发上她常坐的那个位置。
     *
     * 只放一件东西：一块比坐垫更深的凹陷（一个略高的薄垫）。
     * 剪影风里"坐过"是画不出来的，能画的只有"这里有一块不一样的地方"。
     * 猫就要躺在它上面——这是全场唯一的两个东西之间的因果关系，
     * 玩家不需要被告知，看一眼就懂。
     */
    const seatWorn = new three.Mesh(new three.BoxGeometry(0.62, 0.03, 0.68), materials.structure)
    seatWorn.position.set(HER_SEAT.x - LOFT.sofaX, LOFT.seatTop + 0.125, 0.06)
    sofa.add(seatWorn)

    /**
     * 猫。
     *
     * 造型照搬看台场景的白裙子思路：一个椭球当身子、一个球当头，
     * 能读出"这里有一团东西在呼吸"就够。用全场唯一的高亮色，
     * 视线自然会落到它身上——它睡的那块地方才是这一节真正的主角。
     *
     * 呼吸起伏在 `update` 里给，幅度极小：猫睡着时只有肚皮在动。
     */
    const cat = new three.Group()
    const catBody = new three.Mesh(new three.SphereGeometry(0.19, 12, 10), materials.figure)
    catBody.scale.set(1.5, 0.85, 1)
    catBody.position.y = 0.16
    const catHead = new three.Mesh(new three.SphereGeometry(0.115, 10, 8), materials.figure)
    catHead.position.set(-0.24, 0.2, 0)
    cat.add(catBody, catHead)
    cat.position.set(HER_SEAT.x, LOFT.seatTop + 0.14, HER_SEAT.z + 0.06)
    root.add(cat)

    /* ---------------- 猫窝（空着） ---------------- */

    /**
     * 猫窝是这间屋子里唯一一件**未被使用**的家具，而它必须是空的。
     *
     * 做法：一个矮圆柱边圈 + 一块软垫，垫子上留一道凹陷的痕迹。
     * 不留这道痕迹的话，它看起来只是个托盘；留了，它才像是
     * "本来是它可以睡的地方，但它选了别处"。
     */
    const catBed = new three.Group()
    const rim = new three.Mesh(
      new three.CylinderGeometry(0.36, 0.32, 0.16, 14, 1, true),
      new three.MeshLambertMaterial({ color: PALETTE.structure, side: three.DoubleSide }),
    )
    rim.position.y = 0.08
    const mattress = new three.Mesh(new three.CylinderGeometry(0.32, 0.32, 0.06, 14), materials.furniture)
    mattress.position.y = 0.09
    const dent = new three.Mesh(new three.CircleGeometry(0.17, 12), materials.structure)
    dent.rotation.x = -Math.PI / 2
    dent.position.y = 0.122
    catBed.add(rim, mattress, dent)
    catBed.position.set(LOFT.catBedX, 0, LOFT.catBedZ)
    root.add(catBed)
    colliders.push({ kind: 'cylinder', x: LOFT.catBedX, z: LOFT.catBedZ, radius: 0.4 })

    /* ---------------- 笔记本的小桌 ---------------- */

    /**
     * 小桌正对沙发——这是他每天视频时坐的地方。桌上摊着开着的笔记本。
     *
     * 屏幕朝着沙发（`-x` 侧），所以玩家从屋里任何位置都能看见那块冷光，
     * 但从出生点看是**竖着的一条**：他坐在这儿，屏幕在他那边。
     */
    const deskGroup = new three.Group()
    const deskTop = new three.Mesh(new three.BoxGeometry(1.1, 0.05, 0.6), materials.furniture)
    deskTop.position.set(LOFT.deskX, LOFT.deskTop, LOFT.deskZ)
    deskGroup.add(deskTop)
    for (let i = 0; i < 4; i += 1) {
      const leg = new three.Mesh(new three.BoxGeometry(0.05, LOFT.deskTop, 0.05), materials.structure)
      leg.position.set(
        LOFT.deskX + (i % 2 ? 0.5 : -0.5),
        LOFT.deskTop / 2,
        LOFT.deskZ + (i < 2 ? 0.25 : -0.25),
      )
      deskGroup.add(leg)
    }

    // 笔记本：底座 + 掀起的盖
    const laptopBase = new three.Mesh(new three.BoxGeometry(0.3, 0.018, 0.21), materials.structure)
    laptopBase.position.set(LOFT.deskX, LOFT.deskTop + 0.034, LOFT.deskZ)
    const lid = new three.Mesh(new three.BoxGeometry(0.016, 0.2, 0.3), materials.structure)
    lid.position.set(LOFT.deskX - 0.14, LOFT.deskTop + 0.13, LOFT.deskZ)
    lid.rotation.z = -0.18
    const screen = new three.Mesh(new three.PlaneGeometry(0.27, 0.18), materials.screen)
    // 屏幕朝向与盖子同轴：绕 y 转 90° 让平面正对 -x（他坐的那一侧），
    // 再跟着盖子一起后仰，否则屏幕会从掀起的盖子里穿出来
    screen.rotation.y = -Math.PI / 2
    screen.rotation.z = -0.18
    screen.position.set(LOFT.deskX - 0.148, LOFT.deskTop + 0.13, LOFT.deskZ)
    deskGroup.add(laptopBase, lid, screen)
    root.add(deskGroup)
    colliders.push({ kind: 'box', x: LOFT.deskX, z: LOFT.deskZ, halfX: 0.6, halfZ: 0.35 })
    occluders.push(deskGroup)

    /**
     * 屏幕往屋里打的一小片冷光。
     *
     * 与咖啡店那部手机的暖光是一组对照：同一种手法（一个小点光把
     * 一片区域从黑暗里提出来），但这里用冷色。这一节里所有光都应该是
     * "不是为他亮的"——他守着这个家，光来自一块屏幕和一座停下来的城市。
     */
    const screenGlow = new three.PointLight(PALETTE.screen, 2.2, 3.4, 2)
    screenGlow.position.set(LOFT.deskX - 0.35, LOFT.deskTop + 0.28, LOFT.deskZ)
    root.add(screenGlow)

    /* ---------------- 地毯与落地灯 ---------------- */

    // 地毯：圈出"起居"这一块，也把地面从一整片灰绿里分出层次
    const rug = new three.Mesh(new three.CircleGeometry(2.3, 24), materials.furniture)
    rug.rotation.x = -Math.PI / 2
    rug.position.set(-0.6, 0.012, -1.6)
    root.add(rug)

    /**
     * 落地灯在这边是**关着的**，而且刻意留在原地。
     *
     * 它在 `loft-night.ts` 里是唯一亮着的灯。白天这一场把它留在同一个
     * 位置但不点亮——玩家在夜场里见到它亮起时，会认出这是同一盏灯。
     * 灯罩用高亮人物色：即便不亮，玻璃罩子也会反一点天光。
     */
    const lampPole = new three.Mesh(new three.CylinderGeometry(0.04, 0.05, 1.5, 6), materials.structure)
    lampPole.position.set(LOFT.lampX, 0.75, LOFT.lampZ)
    const lampShade = new three.Mesh(
      new three.CylinderGeometry(0.2, 0.28, 0.3, 12, 1, true),
      new three.MeshLambertMaterial({ color: PALETTE.furniture, side: three.DoubleSide }),
    )
    lampShade.position.set(LOFT.lampX, 1.62, LOFT.lampZ)
    const lampFoot = new three.Mesh(new three.CylinderGeometry(0.24, 0.24, 0.04, 12), materials.structure)
    lampFoot.position.set(LOFT.lampX, 0.02, LOFT.lampZ)
    root.add(lampPole, lampShade, lampFoot)
    colliders.push({ kind: 'cylinder', x: LOFT.lampX, z: LOFT.lampZ, radius: 0.3 })

    /* ---------------- 门 ---------------- */

    // 门做得比周围更暗：这一节里没有人会出去，门只是一块黑
    const door = new three.Mesh(
      new three.BoxGeometry(1.4, 2.5, 0.12),
      new three.MeshLambertMaterial({ color: 0x0b0f10 }),
    )
    door.position.set(-2.2, 1.25, LOFT.backZ - 0.12)
    root.add(door)
    // 门口一只鞋，另一只不在——他在这儿住了两个月，鞋脱在门里
    for (let i = 0; i < 2; i += 1) {
      const shoe = new three.Mesh(new three.BoxGeometry(0.12, 0.09, 0.28), materials.structure)
      shoe.position.set(-1.5 + i * 0.22, 0.045, LOFT.backZ - 0.6)
      shoe.rotation.y = random.swing(0.3)
      root.add(shoe)
    }

    /* ---------------- 窗外的城市 ---------------- */

    /**
     * 窗外只做一件事：证明这座城市还醒着，但不太醒。
     *
     * 楼群排成两到三层纵深，越远越暗——`MeshLambert` 会被雾吃掉，
     * 所以不需要手动做远近配色。亮着的窗按 0.28 的概率抽，
     * **比咖啡店（0.55）低一半**：那是打烊前的街，这是封城中的城。
     *
     * 它们全部用冷色而不是琥珀色。琥珀色在本项目里一直代表"人还在"，
     * 而这一节窗外没有人在等他，只有城市本身的灯。
     */
    const city = new three.Group()
    for (let row = 0; row < 3; row += 1) {
      const z = -18 - row * 13
      const blockCount = 7 - row
      for (let i = 0; i < blockCount; i += 1) {
        const width = random.range(7, 13)
        const height = random.range(11, 27) - row * 2
        const x = -34 + (i * 68) / blockCount + random.swing(3)
        const block = new three.Mesh(new three.BoxGeometry(width, height, 8), materials.city)
        block.position.set(x, height / 2 - 0.4, z)
        city.add(block)

        if (!random.chance(0.28)) continue
        for (let w = 0; w < 3; w += 1) {
          const lit = new three.Mesh(
            new three.PlaneGeometry(random.range(0.9, 1.7), random.range(1.1, 1.8)),
            materials.screen,
          )
          lit.position.set(x + random.swing(width / 2.6), random.range(5, height - 3), z + 4.05)
          city.add(lit)
        }
      }
    }
    root.add(city)

    /* ---------------- 可交互 ---------------- */

    const hotspots: Hotspot[] = []

    /**
     * 代理球：一个不可见的球把要点的东西包起来。
     *
     * 用 `material.visible = false` 而不是 `mesh.visible = false`：
     * 后者会让射线直接跳过它，而我们要的是"看不见但点得到"。
     */
    const makeProxy = (x: number, y: number, z: number, radius: number) => {
      const proxy = new three.Mesh(
        new three.SphereGeometry(radius, 10, 8),
        new three.MeshBasicMaterial({ visible: false }),
      )
      proxy.position.set(x, y, z)
      root.add(proxy)
      return proxy
    }

    /**
     * 窗外。这是全场最"没用"的一个热点，而它必须在。
     *
     * 原文里她每天对着酒店窗户，他每天对着落地窗——这一节的情绪没有
     * 任何动作，只有**两个人对着两块玻璃**。玩家走到窗前点一下，
     * 等于完成了他这两个月每天做的那个动作。
     */
    hotspots.push({
      id: 'window-view',
      object: makeProxy(0, 1.6, LOFT.frontZ + 0.4, 1.1),
      label: '窗外，一座停下来的城市',
      /** 3 米：够玩家走到窗前站住，但不允许隔着整个房间点它 */
      reach: 3,
      onActivate: () => true,
    })

    /**
     * 沙发。代理球同时罩住猫和它身下那块坐垫。
     *
     * 她的位置与猫是一件事，所以只有一个热点——拆成两个会让玩家
     * 以为这里有两样东西可以分别关心。
     */
    hotspots.push({
      id: 'cat-on-her-seat',
      object: makeProxy(HER_SEAT.x, LOFT.seatTop + 0.3, HER_SEAT.z, 0.62),
      label: '猫睡在沙发上她常坐的那个位置',
      /**
       * 2.4 米，且是**从眼睛量起的三维距离**。
       *
       * 猫伏在 0.78 米高的坐垫上，眼高 1.68 米——光是这 0.9 米的高度差
       * 就吃掉大半额度。沙发的碰撞盒挡住玩家（半深 0.47 米），
       * 站定时眼睛到猫约 1.6 米，所以这里留的余量很窄：
       * 要求玩家走到沙发边，但不要求他精确站定。
       */
      reach: 2.4,
      onActivate: () => true,
    })

    /**
     * 空着的猫窝。
     *
     * 它是这一场最容易被忽略、也最该被点开的东西：玩家先看见猫睡在她
     * 的位置上，再走过去看见猫窝是空的，这两件事连起来才是那句
     * 「它想我了」真正的意思。
     */
    hotspots.push({
      id: 'empty-cat-bed',
      object: makeProxy(LOFT.catBedX, 0.28, LOFT.catBedZ, 0.45),
      label: '猫窝空着，垫子上有一道浅浅的窝',
      /** 2.0 米。猫窝在地上（0.13 米高），高度差几乎吃满额度，必须走近 */
      reach: 2,
      onActivate: () => true,
    })

    /**
     * 笔记本。屏幕的冷光。
     *
     * 这是他这一场的"在场证明"——桌上的笔记本开着，人却站在窗前。
     * 点它，等于承认那两个月里陪伴这件事发生在一块屏幕上。
     */
    hotspots.push({
      id: 'laptop-screen',
      object: makeProxy(LOFT.deskX - 0.1, LOFT.deskTop + 0.16, LOFT.deskZ, 0.45),
      label: '笔记本还开着，屏幕上是她们那边的时间',
      reach: 2.4,
      onActivate: () => true,
    })

    /* ---------------- 返回 ---------------- */

    return {
      colliders,
      occluders,
      hotspots,

      /**
       * 没有 `onGateSatisfied`。
       *
       * 这一节不需要闸门：玩家在这个屋子里看见了什么、先看猫还是先看窗，
       * 都不该影响他能不能做那个选择。原文推进这里的不是某个动作，
       * 而是一间屋子本身的样子——硬加一道"必须先看完猫才能选"的门，
       * 等于替他规定什么才是重要的。
       */

      update(elapsed, _delta, player) {
        /**
         * 三处克制的动效。这个数量是上限——这一场的情感是"安静"，
         * 动得越多越不像有人刚从这里走出去。
         */
        // 1. 猫的呼吸。整组等比缩到 3% 的幅度：睡着的东西只有肚皮在动
        cat.scale.set(1, 1 + Math.sin(elapsed * 1.1) * 0.03, 1)

        // 2. 屏幕的微光呼吸。周期约 4 秒，比人的呼吸慢——它是待机，不是提醒
        const breath = 0.5 + 0.5 * Math.sin(elapsed * 1.5)
        materials.screen.opacity = 0.42 + breath * 0.16
        screenGlow.intensity = 1.8 + breath * 1.0

        /**
         * 3. 玩家走近沙发时，窗光落在地板上的那块亮斑略微收窄变亮。
         *
         * 与看台场景里水洼随距离变亮同源：让静止的布景对玩家的位置有反应。
         * 这里量的是水平距离而不是三维距离——"走近了"是脚的事。
         */
        const distanceToSeat = Math.hypot(player.x - HER_SEAT.x, player.z - HER_SEAT.z)
        materials.daylight.opacity = 0.09 + Math.max(0, 1 - distanceToSeat / 7) * 0.07
      },
      resize() {
        // 布景全部按米摆放、与宽高比无关，不随相机拉伸，无需响应
      },
    }
  },
}
