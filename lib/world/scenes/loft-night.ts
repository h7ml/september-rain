import type { Collider, Hotspot, SceneRuntime, WorldScene, WorldSceneHandle } from '../types'

/**
 * 场景「出租屋 · 出国前的夜」——第五幕，与 `loft.ts` 是**同一个空间的两个时刻**。
 *
 * ## 这一场是白天那一场换了个光
 *
 * 房间、家具、猫、墙、窗外那座城市，全部与 `loft.ts` 同一套坐标、同一批
 * 几何尺寸。玩家从白天那一场走过来，应该能不假思索地认出这里是同一个地方：
 * 落地窗还在原位、沙发还在原位、猫窝还在沙发扶手旁边——**而猫已经不在那儿了，
 * 猫趴在她腿上**。认出空间的那一瞬间，也就是认出"谁在这个房间里"的一瞬间。
 *
 * 凡是两场共有的东西，坐标一律从下面的 `LOFT` 取，与 `loft.ts` 逐字一致。
 *
 * ## 空间布局（坐标即叙事）
 *
 * ```
 *        z = -46  夜里的城市（同一批楼，亮着的窗换了几个）
 *           ↑
 *        z =  -7  落地窗 ← 只反着屋里那点灯，外面是黑的
 *        z =  -3.4  沙发：她坐在左半边，猫趴在她腿上
 *        z =  -3.0  猫窝（还是空的，而且这一晚它不是重点）
 *        z =  -1.4  他站着，侧身对着窗
 *        z =  -2.6  小桌（笔记本合上了）
 *        z =   0  地毯
 *        z =   4  玩家出生点
 *        z =   6  行李箱，靠门放着
 *        z =   8  后墙与门
 * ```
 *
 * 出生朝 `yaw = 0`，视线 `(0, 0, -1)`。一眼看过去是：地毯 → 沙发上的两个人
 * → 落地窗。白天那一场同样的视线上只有一只猫。
 *
 * ## 全部的光只有一盏
 *
 * 白天那一场的光是"从窗外来的"，冷、宽、不属于任何人。这一夜反过来：
 * 落地灯是全场唯一的光源，暖色，照亮的范围刚好是沙发那一片。
 * 于是房间的其余部分——门、行李箱、猫窝、走廊那一侧的墙——全部退进暗里，
 * 只剩两个人看得见。**这个对比是这两场戏的全部技术含量**：
 * 同一间屋子，同样没有人动过布局，只换了一盏灯，
 * 玩家就从一个"守着"的白天到了一个"要走"的夜晚。
 *
 * ## 谁都没有动
 *
 * 猫窝依旧空着，窗台上白天那只杯子还在原位，笔记本合上放在同一张桌上。
 * 所有"痕迹"都刻意保持不动——这一节里唯一发生变化的是人。
 */

/**
 * 房间与家具的尺度。
 *
 * **必须与 `loft.ts` 里的同名常量保持一致。** 两个场景共用同一套坐标，
 * 玩家在夜场里转身时看到的墙角必须还在白天那个位置。
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

  /** 落地灯。这一夜里它是全场唯一的光源，位置必须与白天那一盏重合 */
  lampX: 3.4,
  lampZ: 1.2,
} as const

/** 她常坐的那个位置。夜场里她本人在那儿，猫在她腿上——全场只有这一个点重要。 */
const HER_SEAT = { x: LOFT.sofaX + LOFT.seatOffsetX, z: LOFT.sofaZ } as const

/** 他站着的位置。侧身对着窗，不挡住她——这一晚还没有人转身走开。 */
const HIM = { x: 0.9, z: -1.4 } as const

/** 行李箱。靠门放着，还没被提起来。 */
const SUITCASE = { x: 1.9, z: 6.0 } as const

/** 场景调色板。同一套墨绿灰阶，整体比白天那一场再压暗一档。 */
const PALETTE = {
  /** 地板比白天暗一档：夜里只剩灯光能照到的那一圈是有颜色的 */
  ground: 0x131c1d,
  structure: 0x101619,
  /** 后墙一带最暗。灯光够不到的地方应该直接化进黑里，而不是变成灰 */
  back: 0x0d1213,
  furniture: 0x1a2424,
  /** 夜里的楼群：比白天的城市更暗、更蓝，只剩一层轮廓 */
  city: 0x161f22,
  glass: 0x9fb4b8,
  accent: 0xc8a878,
  /** 高亮人物色。她的轮廓、他的轮廓、猫，都用它 */
  figure: 0xe8e4da,
} as const

export const loftNightScene: WorldScene = {
  id: 'loft-night',
  caption: '出租屋 · 出国前的夜',
  /** 固定种子。与白天同一批楼、同一套尺寸，只是亮着的窗换了几个。 */
  seed: 0x5e9e07,

  build(runtime: SceneRuntime): WorldSceneHandle {
    const { three, root, random } = runtime

    /* ---------------- 材质 ---------------- */

    /**
     * 全场共用一组材质，理由与其余场景相同。夜里多出两样东西：
     * 一盏灯罩（自发光，不吃光）和一层地板上的暖色光晕——
     * 这两样就是"入夜"的全部道具。
     */
    const materials = {
      ground: new three.MeshLambertMaterial({ color: PALETTE.ground }),
      structure: new three.MeshLambertMaterial({ color: PALETTE.structure }),
      back: new three.MeshLambertMaterial({ color: PALETTE.back }),
      furniture: new three.MeshLambertMaterial({ color: PALETTE.furniture }),
      city: new three.MeshLambertMaterial({ color: PALETTE.city }),
      /** 灯罩。自发光而不是被照亮——它是光源本身 */
      shade: new three.MeshBasicMaterial({ color: PALETTE.accent, transparent: true, opacity: 0.85 }),
      /** 灯下的光锥。用极低透明度的一大块体积冒充"光洒下来"，比做体积光便宜得多 */
      beam: new three.MeshBasicMaterial({
        color: PALETTE.accent,
        transparent: true,
        opacity: 0.05,
        side: three.DoubleSide,
        depthWrite: false,
      }),
      /** 灯光落在地板上的光晕。白天那一场这里是窗光的长条亮斑 */
      pool: new three.MeshBasicMaterial({
        color: PALETTE.accent,
        transparent: true,
        opacity: 0.07,
        depthWrite: false,
      }),
      /** 夜里的玻璃几乎不存在，只留一层很淡的反光 */
      glass: new three.MeshBasicMaterial({
        color: PALETTE.glass,
        transparent: true,
        opacity: 0.028,
        side: three.DoubleSide,
        depthWrite: false,
      }),
      /** 窗外远处的城市灯。冷色、低透明度——那些灯不在等他 */
      cityLight: new three.MeshBasicMaterial({ color: PALETTE.glass, transparent: true, opacity: 0.3 }),
      accent: new three.MeshBasicMaterial({ color: PALETTE.accent, transparent: true, opacity: 0.6 }),
      figure: new three.MeshLambertMaterial({ color: PALETTE.figure }),
    }

    const colliders: Collider[] = []
    const occluders: import('three').Object3D[] = []

    /* ---------------- 地面与天花板 ---------------- */

    const floor = new three.Mesh(
      new three.BoxGeometry(LOFT.halfWidth * 2, 0.2, LOFT.backZ - LOFT.frontZ),
      materials.ground,
    )
    floor.position.set(0, -0.1, (LOFT.backZ + LOFT.frontZ) / 2)
    root.add(floor)

    const ceiling = new three.Mesh(
      new three.BoxGeometry(LOFT.halfWidth * 2, 0.2, LOFT.backZ - LOFT.frontZ),
      materials.back,
    )
    ceiling.position.set(0, LOFT.height, (LOFT.backZ + LOFT.frontZ) / 2)
    root.add(ceiling)
    occluders.push(ceiling)

    /* ---------------- 落地窗 ---------------- */

    /**
     * 窗的几何与白天那一场逐字一致（窗台 12 厘米、竖棂间距 2.2 米、
     * 整面墙几乎都是玻璃）——玩家必须一眼认出这是同一面窗。
     *
     * 变的只有玻璃：白天它挡着一层灰白的天光，夜里它退到几乎不存在，
     * 于是窗外那片黑直接压进来。**同一块面片，两种存在感**，
     * 这就是"白天"和"夜里"在剪影风里最省的区分方式。
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
    root.add(windowGroup)

    /**
     * 窗台上还放着白天那只杯子。
     *
     * 位置与 `loft.ts` 里的杯子完全相同。这一节里它什么也不说明，
     * 也不可交互——它只是"这间屋子还是那间屋子"的一个证据。
     * 玩家如果从白天那一场走过来，会认得它。
     */
    const mug = new three.Mesh(new three.CylinderGeometry(0.055, 0.045, 0.1, 10), materials.structure)
    mug.position.set(1.3, LOFT.windowSill + 0.05, LOFT.frontZ + 0.2)
    root.add(mug)

    /* ---------------- 围合：三面墙 ---------------- */

    /**
     * 侧墙与后墙。这一场它们全部比白天更暗——灯照不到的地方应该化进黑里。
     *
     * 窗那一面依旧**不进** `occluders`：玩家要透过它看见外面的夜，
     * 交给遮挡判定会把这一场唯一的"外面"掐掉。碰撞体照给：这一夜他哪儿也去不了。
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
        materials.back,
      )
      mesh.position.set(w.x, LOFT.height / 2, w.z)
      root.add(mesh)
      colliders.push({ kind: 'box', x: w.x, z: w.z, halfX: w.halfX, halfZ: w.halfZ })
      if (w.z !== LOFT.frontZ) occluders.push(mesh)
    }

    /* ---------------- 沙发（与白天同一张） ---------------- */

    /**
     * 同一张沙发、同一套几何。白天那三块坐垫里最左边那块是她的位置；
     * 这一夜她本人就坐在上面，猫趴在她腿上。
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

    /* ---------------- 她，和趴在她腿上的猫 ---------------- */

    /**
     * 她坐在白天那只猫睡过的坐垫上，背靠落地窗。
     *
     * 造型与看台上的白裙子同源（胶囊躯干 + 球形头），但姿态不同：
     * 白天那个是背影、是远远地坐着；这一夜是**膝盖朝屋里**、
     * 侧面对着玩家，因为这一场她要说话，而说话的人是有正面的。
     *
     * 她逆着窗——窗在背后、屋里唯一的灯在右手边。这个位置是刻意的：
     * 原文里那句「我大一那年总在操场哭」，是她在自己家里、
     * 在灯和窗之间那个半明半暗的位置说出来的。
     */
    const her = new three.Group()
    const herTorso = new three.Mesh(new three.CapsuleGeometry(0.22, 0.46, 4, 12), materials.figure)
    herTorso.position.set(0, 0.62, -0.12)
    const herHead = new three.Mesh(new three.SphereGeometry(0.15, 12, 10), materials.figure)
    herHead.position.set(0, 1.04, -0.14)
    // 大腿：从座面往前伸出来的一段，猫要趴在这上面
    const herThigh = new three.Mesh(new three.BoxGeometry(0.42, 0.16, 0.5), materials.figure)
    herThigh.position.set(0, LOFT.seatTop - 0.08, 0.2)
    herThigh.rotation.x = -0.16
    const herShin = new three.Mesh(new three.BoxGeometry(0.38, 0.44, 0.14), materials.figure)
    herShin.position.set(0, LOFT.seatTop - 0.28, 0.42)
    her.add(herTorso, herHead, herThigh, herShin)
    her.position.set(HER_SEAT.x, LOFT.seatTop + 0.11, HER_SEAT.z + 0.06)
    root.add(her)

    /**
     * 猫趴在她腿上。
     *
     * 与白天那一场是**同一只猫**：同样的椭球身子、同样的球头、
     * 同样的高亮色。变的只有位置（白天在坐垫上，这一夜在她腿上）
     * 和朝向（不再蜷着，而是趴平、头朝着她）。
     *
     * 它是这一场里唯一还在呼吸的东西——挂在她身上，所以她在动的时候
     * 猫也跟着动，这一点不需要额外写代码。
     */
    const cat = new three.Group()
    const catBody = new three.Mesh(new three.SphereGeometry(0.19, 12, 10), materials.figure)
    catBody.scale.set(1.45, 0.8, 1)
    catBody.position.y = 0.14
    const catHead = new three.Mesh(new three.SphereGeometry(0.115, 10, 8), materials.figure)
    catHead.position.set(0.22, 0.16, 0)
    cat.add(catBody, catHead)
    cat.position.set(HER_SEAT.x + 0.02, LOFT.seatTop + 0.16, HER_SEAT.z + 0.16)
    // 头朝着她（+z 那一侧），背对着玩家——猫不关心谁走进来
    cat.rotation.y = Math.PI
    root.add(cat)

    /* ---------------- 他，站着 ---------------- */

    /**
     * 他站在沙发和窗之间，侧身对着窗。
     *
     * 位置是这一场最要紧的一处取舍：他**不能**站在她和玩家之间，
     * 否则玩家进门第一眼看到的是一个背影挡着她，而这一节的标题是
     * 「我看见了」——他必须是被看见的那个方向，不是遮挡物。
     * 把他放在 `x = 0.9`（她右手边、离窗 5.6 米），玩家从出生点看过去
     * 是"她在左、他在右"，两个人都在画面里。
     *
     * 这里没有给他任何动作。原文里他说完那句"我看见了"之后没有下一步，
     * 所以这一晚他也不会走、不会伸手、不会回头。
     */
    const him = new three.Group()
    const himTorso = new three.Mesh(new three.CapsuleGeometry(0.2, 0.66, 4, 12), materials.figure)
    himTorso.position.y = 1.02
    const himHead = new three.Mesh(new three.SphereGeometry(0.15, 12, 10), materials.figure)
    himHead.position.y = 1.52
    const himLegs = new three.Mesh(new three.BoxGeometry(0.32, 0.68, 0.22), materials.figure)
    himLegs.position.y = 0.34
    him.add(himTorso, himHead, himLegs)
    him.position.set(HIM.x, 0, HIM.z)
    // 面朝沙发：绕 y 转到 x 轴负方向，侧身对着窗
    him.rotation.y = -Math.PI / 2 + 0.35
    root.add(him)

    /* ---------------- 猫窝（还是空的） ---------------- */

    /**
     * 猫窝的位置和白天完全一样，也**依旧是空的**。
     *
     * 不为了"入夜"去动它：这两场之间没有发生过任何事，
     * 变的只有那两个人。玩家如果记得白天那一场，他会发现
     * 唯一挪动过的东西就是猫——从坐垫挪到了腿上。
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

    /* ---------------- 小桌：笔记本已经合上了 ---------------- */

    /**
     * 同一张桌、同一个位置，笔记本在原先的位置上，但**盖上了**。
     *
     * 白天那一场，屏幕的冷光是这间屋子里唯一"别人还在"的证据——
     * 他在这边开着电脑等她。这一夜不用再等了：他要走了。
     * 冷光的熄灭是这场戏唯一一处"变化"发生在物件上，
     * 所以它必须发生在同一件物件、同一个位置上。
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
    const laptopClosed = new three.Mesh(new three.BoxGeometry(0.3, 0.035, 0.21), materials.structure)
    laptopClosed.position.set(LOFT.deskX, LOFT.deskTop + 0.042, LOFT.deskZ)
    deskGroup.add(laptopClosed)
    root.add(deskGroup)
    colliders.push({ kind: 'box', x: LOFT.deskX, z: LOFT.deskZ, halfX: 0.6, halfZ: 0.35 })
    occluders.push(deskGroup)

    /* ---------------- 地毯与落地灯 ---------------- */

    const rug = new three.Mesh(new three.CircleGeometry(2.3, 24), materials.furniture)
    rug.rotation.x = -Math.PI / 2
    rug.position.set(-0.6, 0.012, -1.6)
    root.add(rug)

    /**
     * 全场唯一的光。
     *
     * 白天那一场这盏灯是灭的，位置一模一样。这一夜它亮着，
     * 而它照亮的范围必须刚好覆盖"沙发那一片"——超出这个范围，
     * 房间就会变成均匀的暖色，这个夜晚就失去了它的边界感。
     *
     * 衰减距离给 9 米、强度 15：够照亮沙发、地毯与两个人的轮廓，
     * 到门口只剩一点余温。参数调大手一点，"只剩一盏灯"就变成了"屋里挺亮"。
     */
    const POOL_LIGHT = { y: 1.62, intensity: 15, distance: 9 } as const

    const lampPole = new three.Mesh(new three.CylinderGeometry(0.04, 0.05, 1.5, 6), materials.structure)
    lampPole.position.set(LOFT.lampX, 0.75, LOFT.lampZ)
    const lampShade = new three.Mesh(new three.CylinderGeometry(0.2, 0.28, 0.3, 12, 1, true), materials.shade)
    lampShade.position.set(LOFT.lampX, POOL_LIGHT.y, LOFT.lampZ)
    const lampFoot = new three.Mesh(new three.CylinderGeometry(0.24, 0.24, 0.04, 12), materials.structure)
    lampFoot.position.set(LOFT.lampX, 0.02, LOFT.lampZ)
    root.add(lampPole, lampShade, lampFoot)
    colliders.push({ kind: 'cylinder', x: LOFT.lampX, z: LOFT.lampZ, radius: 0.3 })

    const lampLight = new three.PointLight(PALETTE.accent, POOL_LIGHT.intensity, POOL_LIGHT.distance, 2)
    lampLight.position.set(LOFT.lampX, POOL_LIGHT.y - 0.12, LOFT.lampZ)
    root.add(lampLight)

    // 灯罩下的光锥。开口朝下，与灯罩同顶
    const beam = new three.Mesh(
      new three.ConeGeometry(1.5, POOL_LIGHT.y, 12, 1, true),
      materials.beam,
    )
    beam.position.set(LOFT.lampX, POOL_LIGHT.y / 2, LOFT.lampZ)
    root.add(beam)

    /**
     * 灯落在地板上的一圈光晕。
     *
     * 白天那一场，这个位置上是窗外进来的一条长条亮斑（`daylightPool`）。
     * 同一块地板、同一件东西、两种光——两场戏的对照就落在这一处：
     * 白天的光从窗来、是冷的、铺开成一条；夜里的光从屋里来、是暖的、缩成一圈。
     */
    const pool = new three.Mesh(new three.CircleGeometry(2.4, 20), materials.pool)
    pool.rotation.x = -Math.PI / 2
    pool.position.set(LOFT.lampX - 0.4, 0.013, LOFT.lampZ - 0.4)
    root.add(pool)

    /* ---------------- 门与行李箱 ---------------- */

    const door = new three.Mesh(
      new three.BoxGeometry(1.4, 2.5, 0.12),
      new three.MeshLambertMaterial({ color: 0x080b0c }),
    )
    door.position.set(-2.2, 1.25, LOFT.backZ - 0.12)
    root.add(door)

    /**
     * 行李箱。这一节里最好认的一件"要走"的证据，所以它站在**门口**，
     * 而且是立着的——已经收好了，但还没被提起来。
     *
     * 造型只用两个盒子加一根提手：这个体量在门口那一带的暗里
     * 只能读出一个方正的轮廓，而那正好是对的，它不需要细节。
     * 唯一的亮色是那块行李牌——在全场的暗里，它是唯一一处琥珀色的杂物，
     * 视线早晚会落上去。
     */
    const suitcase = new three.Group()
    const caseBody = new three.Mesh(new three.BoxGeometry(0.46, 0.68, 0.24), materials.furniture)
    caseBody.position.y = 0.34
    const caseLid = new three.Mesh(new three.BoxGeometry(0.48, 0.05, 0.26), materials.structure)
    caseLid.position.y = 0.66
    const handle = new three.Mesh(new three.BoxGeometry(0.16, 0.04, 0.03), materials.structure)
    handle.position.y = 0.72
    const tag = new three.Mesh(new three.BoxGeometry(0.02, 0.09, 0.06), materials.accent)
    tag.position.set(0.24, 0.52, 0)
    suitcase.add(caseBody, caseLid, handle, tag)
    // 微微歪着靠在门边，而不是笔直立正——它是刚被放下、不是摆好的
    suitcase.rotation.y = random.swing(0.2)
    suitcase.position.set(SUITCASE.x, 0, SUITCASE.z)
    root.add(suitcase)
    colliders.push({ kind: 'box', x: SUITCASE.x, z: SUITCASE.z, halfX: 0.28, halfZ: 0.2 })

    /**
     * 门边还有一只摞起来的纸箱。
     *
     * 一个箱子说明不了"要走了"，一只箱子和一只行李箱放在一起才能：
     * 搬家这件事从来不是一件行李。放在灯光的射程之外，只留一个块的暗影——
     * 玩家得走过去才看得清那是什么。
     */
    const box = new three.Mesh(new three.BoxGeometry(0.6, 0.42, 0.5), materials.structure)
    box.position.set(-0.6, 0.21, 6.6)
    root.add(box)
    colliders.push({ kind: 'box', x: -0.6, z: 6.6, halfX: 0.32, halfZ: 0.27 })

    /* ---------------- 窗外的城市 ---------------- */

    /**
     * 楼群与白天那一场**完全同源**：同三层纵深、同七/六/五栋的排布、
     * 同一套高度与宽度的随机区间。种子不同，所以有几栋的尺寸会差一点，
     * 但整条天际线的形状是一样的——玩家应当认出这是同一片窗外的同一座城。
     *
     * 唯一主动改变的是窗：白天按 0.28 抽亮窗，这一夜按 0.16。
     * 夜里的城市该更黑，亮着的窗该更少、更散。
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

        if (!random.chance(0.16)) continue
        for (let w = 0; w < 2; w += 1) {
          const lit = new three.Mesh(
            new three.PlaneGeometry(random.range(0.9, 1.7), random.range(1.1, 1.8)),
            materials.cityLight,
          )
          lit.position.set(x + random.swing(width / 2.6), random.range(5, height - 3), z + 4.05)
          city.add(lit)
        }
      }
    }
    root.add(city)

    /* ---------------- 可交互 ---------------- */

    const hotspots: Hotspot[] = []

    /** 不可见的拾取代理。用 `material.visible = false`，否则射线会直接跳过它。 */
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
     * 她，和趴在她腿上的猫。全场唯一真正重要的热点。
     *
     * 代理球一次罩住人和猫——这一节里"她说了那句话"和"猫趴在她腿上"
     * 是同一个画面，拆成两个热点会把玩家推去分别打量，而这一场
     * 要的是他站着、看着，不说话。
     *
     * `reach` 给 3 米：够玩家从地毯上走近到沙发前站住。
     * 再近就会被沙发的碰撞盒挡住，再远就成了"隔着房间看她"——
     * 而这一节的情绪恰恰是**必须走近**，因为那个问题只有走近了才听得见。
     */
    hotspots.push({
      id: 'her-with-cat',
      object: makeProxy(HER_SEAT.x, LOFT.seatTop + 0.72, HER_SEAT.z - 0.4, 0.85),
      label: '她说：可是我怕，你走之后，就没人看见我了',
      reach: 3,
      onActivate: () => true,
    })

    /**
     * 他。站着的人。
     *
     * 这一场里他没有任何可做的动作——原文中他说完"我看见了"就停在那里。
     * 但玩家必须能**看着他**：这一节的标题是他的那句话，
     * 主角不该是一个玩家点不到的布景。
     */
    hotspots.push({
      id: 'him-standing',
      object: makeProxy(HIM.x, 1.0, HIM.z, 0.6),
      label: '他说：我看见了',
      /** 3 米。他站在屋子中间，玩家从出生点走两步就能对着他 */
      reach: 3,
      onActivate: () => true,
    })

    /**
     * 门口的行李箱。
     *
     * 全场最沉的一个热点，而且它在**玩家背后**——出生朝向是 `-z`，
     * 箱子在 `z = 6`。玩家必须转身才会看见它。
     * 这个转身和咖啡店里那个转身同源：人总是在要走的那个晚上
     * 才第一次认真看自己的行李。
     */
    hotspots.push({
      id: 'packed-suitcase',
      object: makeProxy(SUITCASE.x, 0.42, SUITCASE.z, 0.55),
      label: '箱子已经收好了，靠在门边',
      /** 2.2 米。箱子在 0.7 米高，高度差吃掉大半额度，必须走到跟前 */
      reach: 2.2,
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
       * 这一节的推进不取决于玩家做什么。她会不会把那个怕字说出来，
       * 不是因为他看见了什么、点了什么——原文里那句话是自己来的，
       * 过了很久才来的。硬加一道闸门，就等于替她规定什么时候开口。
       */

      update(elapsed, _delta, player) {
        /**
         * 只有两处动效，与看台场景同样的克制程度。
         *
         * 这一场的情感是"告别的静"：屋子里唯一的活物是猫，
         * 唯一在动的东西是那盏灯。任何第三处动效都会把这间屋子
         * 从"夜里十一点"变成"布景在演出"。
         */

        /**
         * 1. 灯的呼吸。两个频率叠加：
         *    慢的那一层（0.7 rad/s）是老式灯泡的热漂移，肉眼几乎看不出；
         *    快的那一层（9.3 rad/s）幅度只有慢层的四分之一，是电流的抖动。
         *    只给慢层会显得像在做动画，只给快层会像在闪故障——
         *    两层的叠加才是"有人开着的一盏灯"。
         */
        const breath = Math.sin(elapsed * 0.7) * 0.5 + Math.sin(elapsed * 9.3) * 0.12
        materials.shade.opacity = 0.8 + breath * 0.06
        materials.beam.opacity = 0.045 + breath * 0.014
        lampLight.intensity = POOL_LIGHT.intensity * (1 + breath * 0.05)

        /**
         * 2. 猫的呼吸。它趴在她腿上，所以整组随呼吸一起一伏——
         *    幅度 2.5%：这是全场唯一的生命迹象，但绝不能大到让人盯着看。
         */
        cat.scale.set(1, 1 + Math.sin(elapsed * 1.15) * 0.025, 1)

        /**
         * 玩家走近沙发时，地板上的光晕略微收拢变亮。
         *
         * 与其余场景同源的手法：让静止的布景对玩家的位置有反应。
         * 这里量的是到她那儿去的水平距离——"走近了"是脚的事。
         */
        const distanceToHer = Math.hypot(player.x - HER_SEAT.x, player.z - HER_SEAT.z)
        materials.pool.opacity = 0.06 + Math.max(0, 1 - distanceToHer / 7) * 0.05
      },
      resize() {
        // 布景全部按米摆放、与宽高比无关，不随相机拉伸，无需响应
      },
    }
  },
}
