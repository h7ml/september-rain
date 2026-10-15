import type { Collider, Hotspot, SceneRuntime, TriggerZone, WorldScene, WorldSceneHandle } from '../types'

/**
 * 场景「楼梯间」——故事倒数第二幕，e01「我在门口站了很久」。
 *
 * ## 空间布局（坐标即叙事）
 *
 * ```
 *           z = -6    她家的门（门缝下透出一道暖光）
 *              ↑
 *       z = -1 │      声控灯第一盏
 *              │      走廊：宽 5m、高 3.2m，没有窗，没有岔路
 *       z =  3 │      西侧楼梯起步
 *              │
 *       z = 10.5 单元门（身后，外面是黑的）
 *           z = 10   玩家出生点（刚出楼梯间，背对着门）
 * ```
 *
 * 玩家朝 `yaw = 0` 即朝 `-z`：一条笔直的走廊，尽头是一扇不属于你的门。
 * **这条走廊上什么都没安排**——没有选择、没有岔口、没有第二扇门。
 * 他走进来的那一刻就已经决定了，剩下的十几米只是让他走到尽头。
 *
 * ## 声控灯是这个场景的全部
 *
 * 一场「他什么都没做」的戏，如果按常规做法（点热点→弹文本→给选项）
 * 会立刻变成一场他"做了什么"的戏。所以这里唯一的机制是一件他**不做**的事：
 * 站着不动，灯就会灭。
 *
 * 灯亮着的时候，玩家看得见那扇门，也就必须看着它；
 * 灯灭下去的时候，画面里只剩下门缝那一条光。**光明与黑暗取决于你是否行动**——
 * 这正是他在门外那段时间的全部内容：他站了很久，所以他什么也看不见。
 *
 * 灯的响应刻意做成需要"走到"才亮：阈值 0.6m/s，比步行速度（3.2m/s）
 * 低得多，慢慢挪也会亮；但**只要停下来超过零点几秒就必然熄灭**，
 * 没有喘息余地。这是唯一能让玩家自己体会到"站着不动会怎样"的办法。
 *
 * ## 为什么门缝的光永远不会灭
 *
 * 全场唯一不参与声控的东西。声控灯从没有过开关的习惯，它只是"听见脚步"；
 * 而门缝里那道光是别人家里的事，跟他在不在场毫无关系。
 * 一个会对他有反应，一个永远不会对他有反应——这条对比就是这一节的标题。
 */

/** 走廊尺寸。墙、天花板、楼梯、声控灯多处要对齐，抽成常量避免两处各写一遍导致穿帮。 */
const CORRIDOR = {
  /** 两侧墙的 x 绝对值 */
  halfWidth: 2.5,
  /** 北墙（她家的门所在的那面墙）的 z */
  farZ: -6,
  /** 南墙（单元门）的 z。给到 11.5 是为了让出生点（z = 10）背后还有一步半的余地 */
  nearZ: 11.5,
  /** 层高。低到 3.2m 是故意的：比一层住宅的层高略低，走廊会显得更窄更长 */
  height: 3.2,
} as const

/** 她家的门。热点、代理球、门缝光、碰撞体四处都要用它，必须同源。 */
const HER_DOOR = {
  /** 紧贴东侧墙，所以她家就是走廊尽头右手边那一户 */
  centerX: 1.75,
  /** 门宽的一半 */
  halfWidth: 0.75,
  /** 门高 */
  height: 2.2,
} as const

/** 单元门（玩家背后那扇）。宽 1.5m，通向楼外。 */
const GATE = {
  centerX: 0,
  halfWidth: 0.75,
  height: 2.4,
} as const

/** 楼梯。只作视觉，不进碰撞体——他今晚不会上楼。 */
const STAIR = {
  /** 踏步在西侧的 x 范围 */
  innerX: -1.2,
  /** 起步所在的 z */
  startZ: 3,
  /** 级数 */
  steps: 11,
  /** 踏步高 */
  rise: 0.17,
  /** 踏步深 */
  run: 0.5,
  /** 休息平台的顶面高度 */
  landingY: 11 * 0.17,
} as const

/** 场景调色板。与项目既有的墨绿灰阶 + 琥珀强调色保持一致。 */
const PALETTE = {
  floor: 0x1b2422,
  structure: 0x101619,
  /** 楼梯与踢脚比墙面亮一档，暗走廊里全靠这点差别读出体积 */
  stone: 0x1a2325,
  /** 门板比墙更暗：他要去的那扇门，看起来像一个洞 */
  door: 0x0b0f10,
  /** 声控灯的白炽光，也是本场景唯一会变化的东西 */
  lamp: 0xe8e4da,
  /** 门缝里的暖光。楼层走廊的声控灯是白的，别人家里的光是暖的 */
  accent: 0xc8a878,
} as const

export const stairwellScene: WorldScene = {
  id: 'stairwell',
  caption: '西安 · 她家楼下',
  /** 固定种子。同一批砖缝、同一批回声，每次进入都必须一模一样 */
  seed: 0x5e9e0c,

  build(runtime: SceneRuntime): WorldSceneHandle {
    const { three, root, random } = runtime

    /* ---------------- 材质 ---------------- */

    /**
     * 全场共用一组材质，理由与看台、咖啡店两个场景相同：
     * 剪影风里颜色本来就只有几种，每网格一份材质只会让回收变得难以预料。
     *
     * 声控灯相关的三份材质（灯泡、光锥、灯泡外晕）**必须共用**，
     * 因为逐帧更新会直接改它们的 `opacity`——一旦某盏灯各持一份，
     * 就得维护一个材质数组，而那些数组迟早会和灯的位置列表脱节。
     */
    const materials = {
      floor: new three.MeshLambertMaterial({ color: PALETTE.floor }),
      structure: new three.MeshLambertMaterial({ color: PALETTE.structure }),
      stone: new three.MeshLambertMaterial({ color: PALETTE.stone }),
      ceiling: new three.MeshLambertMaterial({ color: PALETTE.structure }),
      door: new three.MeshLambertMaterial({ color: PALETTE.door }),
      /** 墙上的暗痕。透明且不写深度，避免在暗墙前割出可见的矩形边 */
      stain: new three.MeshBasicMaterial({
        color: 0x0b0f10,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
      }),
      /** 灯泡本体。不吃光，强度直接由 opacity 表达 */
      bulb: new three.MeshBasicMaterial({ color: PALETTE.lamp, transparent: true, opacity: 0 }),
      /** 灯下的光锥 */
      cone: new three.MeshBasicMaterial({
        color: PALETTE.lamp,
        transparent: true,
        opacity: 0,
        side: three.DoubleSide,
        depthWrite: false,
      }),
      /** 灯泡外的一小团晕。声控灯最容易被认出的特征就是那个白点先亮起来 */
      halo: new three.MeshBasicMaterial({
        color: PALETTE.lamp,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
      /** 门缝里透出的光。全场唯一不参与声控的亮色 */
      seam: new three.MeshBasicMaterial({
        color: PALETTE.accent,
        transparent: true,
        opacity: 0.7,
        side: three.DoubleSide,
        depthWrite: false,
      }),
      /** 门口那一小片被门缝照亮的地面 */
      seamPool: new three.MeshBasicMaterial({
        color: PALETTE.accent,
        transparent: true,
        opacity: 0.1,
        depthWrite: false,
      }),
      /** 楼梯间高处那扇小窗漏进来的一点天光 */
      windowLight: new three.MeshBasicMaterial({
        color: PALETTE.accent,
        transparent: true,
        opacity: 0.09,
        depthWrite: false,
      }),
      /** 走廊里那个人影。纯黑，只在他走动时出现 */
      shadow: new three.MeshBasicMaterial({ color: 0x05080a, transparent: true, opacity: 0 }),
    }

    const colliders: Collider[] = []
    const occluders: import('three').Object3D[] = []

    /** 建一个立方体并登记碰撞体与遮挡体。走廊里绝大多数物件都要这两样，抽出来避免漏登记。 */
    const addBlock = (
      width: number,
      height: number,
      depth: number,
      x: number,
      y: number,
      z: number,
      material: import('three').Material,
      options: { collider?: boolean; occluder?: boolean } = {},
    ) => {
      const mesh = new three.Mesh(new three.BoxGeometry(width, height, depth), material)
      mesh.position.set(x, y, z)
      root.add(mesh)
      if (options.collider) colliders.push({ kind: 'box', x, z, halfX: width / 2, halfZ: depth / 2 })
      if (options.occluder) occluders.push(mesh)
      return mesh
    }

    /* ---------------- 地面与天花板 ---------------- */

    const spanZ = CORRIDOR.nearZ - CORRIDOR.farZ

    const floor = new three.Mesh(
      new three.BoxGeometry(CORRIDOR.halfWidth * 2, 0.2, spanZ),
      materials.floor,
    )
    floor.position.set(0, -0.1, (CORRIDOR.nearZ + CORRIDOR.farZ) / 2)
    root.add(floor)

    /**
     * 天花板不是可选的。没有它，抬头是场景背景色，
     * 声控灯那点白光就会像悬在空气里——光需要一个可以落上去的面，
     * "楼道"才会从"一条地上的走道"变成一个空间。
     */
    addBlock(
      CORRIDOR.halfWidth * 2,
      0.2,
      spanZ,
      0,
      CORRIDOR.height + 0.1,
      (CORRIDOR.nearZ + CORRIDOR.farZ) / 2,
      materials.ceiling,
      { occluder: true },
    )

    /* ---------------- 两侧墙 ---------------- */

    for (const side of [-1, 1]) {
      addBlock(
        0.3,
        CORRIDOR.height,
        spanZ,
        side * (CORRIDOR.halfWidth + 0.15),
        CORRIDOR.height / 2,
        (CORRIDOR.nearZ + CORRIDOR.farZ) / 2,
        materials.structure,
        { collider: true, occluder: true },
      )
    }

    /* ---------------- 北墙与她家的门 ---------------- */

    /**
     * 北墙分成三段：门的左右各一段，门上方一段门楣。
     *
     * 门洞本身是**堵死**的：碰撞体横跨整面墙，不留缺口。
     * 这是这一节最关键的取舍——门必须存在、必须看得见、必须近到能贴着站，
     * 但**绝对不能打开**。原文明写「没有敲门，也没有进去」；
     * 一个能推开的门会让玩家整节戏都在试着推它，而那不是这段故事的内容。
     */
    const doorLeftWidth = HER_DOOR.centerX - HER_DOOR.halfWidth - -CORRIDOR.halfWidth
    const doorRightWidth = CORRIDOR.halfWidth - (HER_DOOR.centerX + HER_DOOR.halfWidth)
    const doorY = HER_DOOR.height / 2

    addBlock(
      doorLeftWidth,
      CORRIDOR.height,
      0.3,
      -CORRIDOR.halfWidth + doorLeftWidth / 2,
      CORRIDOR.height / 2,
      CORRIDOR.farZ - 0.15,
      materials.structure,
      { occluder: true },
    )
    addBlock(
      doorRightWidth,
      CORRIDOR.height,
      0.3,
      CORRIDOR.halfWidth - doorRightWidth / 2,
      CORRIDOR.height / 2,
      CORRIDOR.farZ - 0.15,
      materials.structure,
      { occluder: true },
    )
    // 门楣：把立面封到层高，门洞上方才不是一条通向天空的缝
    addBlock(
      HER_DOOR.halfWidth * 2,
      CORRIDOR.height - HER_DOOR.height,
      0.3,
      HER_DOOR.centerX,
      HER_DOOR.height + (CORRIDOR.height - HER_DOOR.height) / 2,
      CORRIDOR.farZ - 0.15,
      materials.structure,
      { occluder: true },
    )

    // 门板本身比墙面**薄**（0.06 而非 0.3），且略往走廊里凸出一点：
    // 门框于是在暗墙前留下一圈极细的影，门的轮廓不用打光就能读出来。
    const doorPanel = new three.Mesh(
      new three.BoxGeometry(HER_DOOR.halfWidth * 2, HER_DOOR.height, 0.06),
      materials.door,
    )
    doorPanel.position.set(HER_DOOR.centerX, doorY, CORRIDOR.farZ + 0.03)
    root.add(doorPanel)

    /**
     * 北墙整面一块碰撞体，**门洞不留缺口**。
     *
     * 三段墙各自登记碰撞体也能用，但那样门板那 1.5m 就没有任何东西挡着——
     * 玩家会直接走进门里、穿出场景。用一整块把整面墙封死，
     * 顺便把「门永远打不开」这件事从建模层面坐实：
     * 它不是"我们没做开门功能"，是这扇门在几何上就不通。
     *
     * 碰撞面落在 z = -5.9（墙体网格在 -6.15、门板在 -5.97）：
     * 玩家半径 0.35，于是他会停在门外 0.4m 处，身体几乎贴着门板。
     * 若按墙体网格算碰撞，他会被挡在门外近 0.5m——
     * 那半米会把「站在门外」变成「站在走廊尽头」，这一节就不成立了。
     */
    colliders.push({
      kind: 'box',
      x: 0,
      z: -5.9,
      halfX: CORRIDOR.halfWidth + 0.15,
      halfZ: 0.1,
    })

    // 门框。只用四根细料，不给门板雕花——这个距离上任何细节都会被暗吃掉
    const frameMaterial = materials.stone
    for (const x of [HER_DOOR.centerX - HER_DOOR.halfWidth - 0.045, HER_DOOR.centerX + HER_DOOR.halfWidth + 0.045]) {
      const jamb = new three.Mesh(new three.BoxGeometry(0.09, HER_DOOR.height + 0.09, 0.12), frameMaterial)
      jamb.position.set(x, doorY, CORRIDOR.farZ + 0.06)
      root.add(jamb)
    }
    const lintel = new three.Mesh(new three.BoxGeometry(HER_DOOR.halfWidth * 2 + 0.27, 0.09, 0.12), frameMaterial)
    lintel.position.set(HER_DOOR.centerX, HER_DOOR.height + 0.045, CORRIDOR.farZ + 0.06)
    root.add(lintel)

    /* ---------------- 门缝里透出的光 ---------------- */

    /**
     * 门缝做成**一道有宽度的光**而不是一扇亮着的窗。
     *
     * 原文里他听得见她在哭、听得见有人抱着她——他知道屋里的一切，
     * 但**一道缝都没有**。所以这里的光必须窄到只能确认"里面亮着"，
     * 不能提供任何形状。整面门只有底部这 3 厘米和门框一圈的极细边。
     *
     * 它同时是全场唯一不参与声控灯的亮色：他在门外站久了，
     * 走廊会黑下去，这条缝会一直亮着。**灯灭之后，画面里剩的就只有它。**
     */
    const seamHeight = 0.032
    const seam = new three.Mesh(
      new three.PlaneGeometry(HER_DOOR.halfWidth * 2 - 0.06, seamHeight),
      materials.seam,
    )
    seam.position.set(HER_DOOR.centerX, seamHeight / 2 + 0.006, CORRIDOR.farZ + 0.075)
    root.add(seam)

    // 门框左右两道的余光。比底缝更淡，只是让门框不是一条黑边
    for (const offset of [-1, 1]) {
      const edge = new three.Mesh(new three.PlaneGeometry(0.014, HER_DOOR.height - 0.3), materials.seam)
      edge.position.set(
        HER_DOOR.centerX + offset * (HER_DOOR.halfWidth - 0.02),
        0.12 + (HER_DOOR.height - 0.3) / 2,
        CORRIDOR.farZ + 0.075,
      )
      root.add(edge)
    }

    /**
     * 光洒在走廊地上的那一小片。
     *
     * 没有它，那道缝只是黑墙上的一条黄线，读不出"光从那边过来"。
     * 有了这片极淡的暖色，走廊尽头的地面会比别处亮一点点，
     * 玩家的脚步也会自然停在那条边界上——**站的位置就是被这光划出来的**。
     */
    const seamPool = new three.Mesh(new three.PlaneGeometry(HER_DOOR.halfWidth * 2 + 0.4, 2.6), materials.seamPool)
    seamPool.rotation.x = -Math.PI / 2
    seamPool.position.set(HER_DOOR.centerX, 0.012, CORRIDOR.farZ + 1.35)
    root.add(seamPool)

    /* ---------------- 她家门后的那点存在感 ---------------- */

    /**
     * 门里那个**人**。
     *
     * 只有一个方块：0.5m 宽、1.6m 高，比门板亮一点点。
     * 它不会动，也不该动——玩家永远只能看见一个影子，
     * 因为门永远不开。放它的目的是让门后面"有人"这件事
     * 在玩家走到近处、灯灭下去的瞬间才成立：
     * 他先看见的是一道缝，然后才意识到缝后面站着谁。
     */
    const figureBehindDoor = new three.Mesh(
      new three.BoxGeometry(0.5, 1.6, 0.04),
      new three.MeshBasicMaterial({ color: PALETTE.accent, transparent: true, opacity: 0.07, depthWrite: false }),
    )
    figureBehindDoor.position.set(HER_DOOR.centerX, 0.8, CORRIDOR.farZ - 0.1)
    root.add(figureBehindDoor)

    /* ---------------- 走廊里走过的那个人影 ---------------- */

    /**
     * 下一个瞬间：一个人影进了她家。
     *
     * 做成一段**循环的过场**而不是一个触发器：他出楼梯间的那一秒看见了它，
     * 而玩家是在走廊里走着的某一刻看见它的——两者对得上。
     * 人影只在灯亮着时可见（灯的强度直接乘进它的 opacity）：
     * 声控灯照见的东西本来就是这样，一闪，然后你就不确定自己看见了什么。
     *
     * 造型是一个 0.42m × 1.7m 的纯黑方块。在暗走廊里它读起来是"某个人"，
     * 而不是"一个盒子"——黑到没有轮廓，这正是他记忆里那一眼的样子。
     */
    const shadowWalk = { fromZ: 2.6, toZ: -4.4, period: 9.5, visibleSpan: 3.4 }
    const shadowFigure = new three.Mesh(new three.PlaneGeometry(0.42, 1.7), materials.shadow)
    shadowFigure.position.set(-0.2, 0.85, shadowWalk.fromZ)
    root.add(shadowFigure)

    /* ---------------- 楼梯 ---------------- */

    /**
     * 西侧一段上行的楼梯。
     *
     * 它**不在动线上**，玩家不需要上去，也上不去——这很重要：
     * 他今晚是下楼来的。给它踏步、扶手和一块休息平台就够了，
     * 楼梯在暗走廊里本来就只以「一排横向的亮边」存在。
     */
    const stairGroup = new three.Group()
    for (let i = 0; i < STAIR.steps; i += 1) {
      const tread = new three.Mesh(
        new three.BoxGeometry(CORRIDOR.halfWidth - 1.2, STAIR.rise, STAIR.run),
        materials.stone,
      )
      tread.position.set(
        (-CORRIDOR.halfWidth + STAIR.innerX) / 2,
        STAIR.rise * (i + 0.5),
        STAIR.startZ + i * STAIR.run,
      )
      stairGroup.add(tread)
    }
    // 休息平台：与最后一级同高，一直铺到单元门那一侧
    const landingDepth = CORRIDOR.nearZ - (STAIR.startZ + STAIR.steps * STAIR.run)
    const landing = new three.Mesh(
      new three.BoxGeometry(CORRIDOR.halfWidth - 1.2, 0.25, landingDepth),
      materials.stone,
    )
    landing.position.set(
      (-CORRIDOR.halfWidth + STAIR.innerX) / 2,
      STAIR.landingY - 0.125,
      STAIR.startZ + STAIR.steps * STAIR.run + landingDepth / 2,
    )
    stairGroup.add(landing)

    // 扶手：一根细斜杆。踏步之间的高度差靠它来读，否则楼梯只是几块台阶
    const rail = new three.Mesh(
      new three.BoxGeometry(0.06, 0.06, STAIR.steps * STAIR.run + 0.4),
      materials.structure,
    )
    rail.position.set(STAIR.innerX, STAIR.landingY / 2 + 0.85, STAIR.startZ + (STAIR.steps * STAIR.run) / 2)
    rail.rotation.x = -Math.atan2(STAIR.landingY, STAIR.steps * STAIR.run)
    stairGroup.add(rail)
    root.add(stairGroup)

    // 楼梯**没有碰撞体**。这一点是刻意的：他今晚是下楼来的，不会上去，
    // 而按楼梯半高建一块盒子会在单元门口那一带挡出一条看不见的墙——
    // 玩家想走到门口，却先撞在空气上，那种"卡住"的感觉会直接毁掉这一节的克制。
    // 楼梯只作为遮挡体存在（它确实挡视线），不做实体。
    occluders.push(stairGroup)

    /* ---------------- 单元门（玩家背后） ---------------- */

    /**
     * 单元门在北墙的对面。它是一块**几乎纯黑**的板，
     * 只在底部留一道极淡的街光——不是为了照路，
     * 是为了让玩家回头时知道"我刚刚是从那里进来的"。
     *
     * 门洞同样堵死。这一节不存在任何出口：他要么转身下楼（走完选项），
     * 要么留在这条走廊里。玩家如果现在就想走，那不是他能做的决定。
     */
    const gateBackdrop = new three.Mesh(
      new three.PlaneGeometry(GATE.halfWidth * 2, GATE.height),
      new three.MeshBasicMaterial({ color: 0x05080a }),
    )
    gateBackdrop.position.set(GATE.centerX, GATE.height / 2, CORRIDOR.nearZ - 0.14)
    gateBackdrop.rotation.y = Math.PI
    root.add(gateBackdrop)

    // 门框
    for (const x of [GATE.centerX - GATE.halfWidth - 0.06, GATE.centerX + GATE.halfWidth + 0.06]) {
      const jamb = new three.Mesh(new three.BoxGeometry(0.12, GATE.height + 0.12, 0.16), materials.stone)
      jamb.position.set(x, GATE.height / 2, CORRIDOR.nearZ - 0.08)
      root.add(jamb)
    }
    const gateLintel = new three.Mesh(new three.BoxGeometry(GATE.halfWidth * 2 + 0.36, 0.12, 0.16), materials.stone)
    gateLintel.position.set(GATE.centerX, GATE.height + 0.06, CORRIDOR.nearZ - 0.08)
    root.add(gateLintel)

    /**
     * 单元门外的一线街光。
     *
     * 与门缝光同色系但更冷（蓝灰而非琥珀）：外面是雨夜，里面有人住。
     * 这一线光是全场唯一**完全不动**的亮色，它的作用是给玩家一个回头时的坐标——
     * 他转身能认出那是门，但不会觉得那是一个出口。
     */
    const gateStreetLight = new three.Mesh(
      new three.PlaneGeometry(GATE.halfWidth * 2 - 0.1, 0.05),
      new three.MeshBasicMaterial({
        color: 0x9fb0b4,
        transparent: true,
        opacity: 0.14,
        depthWrite: false,
      }),
    )
    gateStreetLight.position.set(GATE.centerX, 0.025, CORRIDOR.nearZ - 0.18)
    root.add(gateStreetLight)

    // 单元门与两侧墙垛的碰撞体。门洞不留缺口——这一节不存在任何出口，
    // 他要么转身下楼（由故事层的选项表达），要么留在这条走廊里。
    colliders.push({ kind: 'box', x: GATE.centerX, z: CORRIDOR.nearZ + 0.2, halfX: 1.0, halfZ: 0.2 })
    colliders.push({ kind: 'box', x: -1.75, z: CORRIDOR.nearZ + 0.2, halfX: 0.75, halfZ: 0.2 })
    colliders.push({ kind: 'box', x: 1.75, z: CORRIDOR.nearZ + 0.2, halfX: 0.75, halfZ: 0.2 })

    /* ---------------- 走廊上的痕迹与回声 ---------------- */

    /**
     * 墙面的水渍与踢脚。
     *
     * 一条两头都是门的空走廊如果只有六面墙，会读成一间空房而不是"楼道"。
     * 真正让楼道成立的是它**不干净**：墙根常年被水泡出一道深色，
     * 上面还有几块位置随机的暗痕。这些东西花不掉几个面片，
     * 但它们给出了尺度的参照——人眼就是靠这些不均匀来判断空间有多长的。
     */
    const stains = new three.Group()
    for (let i = 0; i < 16; i += 1) {
      const side = i % 2 === 0 ? -1 : 1
      const patch = new three.Mesh(
        new three.PlaneGeometry(random.range(0.6, 2.2), random.range(0.3, 1.1)),
        materials.stain,
      )
      patch.position.set(
        side * (CORRIDOR.halfWidth - 0.01),
        random.range(0.2, 1.2),
        random.range(CORRIDOR.farZ + 0.5, CORRIDOR.nearZ - 0.5),
      )
      patch.rotation.y = side * -Math.PI / 2
      stains.add(patch)
    }
    root.add(stains)

    /**
     * 「回声感」在这里只能靠视觉做，所以用的是**等距的重复**。
     *
     * 声学上的回声来自规则反射面之间的固定延时；视觉上等价的东西
     * 就是一根一根间隔相同、亮度递增的横梁——人眼会把它读成"这条走廊有长度"，
     * 而长度正是声音需要走的时间。横梁间隔取 2.5m，与走廊宽度 5m 成 1:2，
     * 于是从任何角度看过去，横梁都在地面上投下规则的一串，像节拍。
     *
     * 它们的亮度绑在声控灯上（见 update）：灯亮时这一串浮现出来，
     * 灯灭时它们一起消失。走廊一黑，回声也就没了——空无一人的楼道是安静的。
     */
    const echoGroup = new three.Group()
    const echoCount = 7
    for (let i = 0; i < echoCount; i += 1) {
      const beam = new three.Mesh(
        new three.PlaneGeometry(CORRIDOR.halfWidth * 2 - 0.06, 0.05),
        new three.MeshBasicMaterial({
          color: PALETTE.lamp,
          transparent: true,
          opacity: 0,
          depthWrite: false,
        }),
      )
      beam.position.set(0, CORRIDOR.height - 0.12, CORRIDOR.farZ + 1.6 + i * 2.5)
      beam.rotation.x = Math.PI / 2
      echoGroup.add(beam)
    }
    root.add(echoGroup)

    /* ---------------- 楼梯间高处的小窗 ---------------- */

    /**
     * 休息平台上沿有一扇高窗，漏进来一点雨夜的天光。
     *
     * 它是场景里唯一**不随声控灯变化**的光源（除了门缝），
     * 作用是把"这栋楼外面在下雨"这件事留在画面边缘——
     * 玩家回头的时候会看见它，然后想起自己是从雨里进来的。
     * 亮度压得很低（0.09）：它不是照明，是一点灰。
     */
    const windowPane = new three.Mesh(new three.PlaneGeometry(1.1, 0.7), materials.windowLight)
    windowPane.position.set(-CORRIDOR.halfWidth + 0.02, 2.5, 9.4)
    windowPane.rotation.y = Math.PI / 2
    root.add(windowPane)
    // 窗框
    const windowFrame = new three.Mesh(new three.BoxGeometry(1.26, 0.06, 0.08), materials.stone)
    windowFrame.position.set(-CORRIDOR.halfWidth + 0.05, 2.13, 9.4)
    root.add(windowFrame)

    /* ---------------- 声控灯 ---------------- */

    /**
     * 灯座位置。四盏，沿走廊从里到外：
     * 她家门口上方、走廊中段两盏、休息平台一盏。
     *
     * 间隔刻意不均匀（5m、7m、2.6m）：等距的灯会让走廊看起来像酒店，
     * 而老楼的声控灯是当年想起来才装一盏的。
     */
    const fixturePlan: { x: number; z: number; y: number }[] = [
      { x: -0.5, z: -4.2, y: 2.78 },
      { x: 0.6, z: 1.0, y: 2.78 },
      { x: -0.6, z: 6.2, y: 2.78 },
      { x: -1.9, z: 9.4, y: CorridorFixtureY(STAIR.landingY) },
    ]

    /**
     * 每盏灯的光源。`intensity` 逐帧改，`distance` 给 8.5m——
     * 刚好比相邻两盏灯的间距略大一点，所以一盏亮着时相邻那盏的位置
     * 也有一点余光，走廊看起来是连续的；但也足够小，不会一盏灯照亮全场。
     */
    const lampLights = fixturePlan.map(({ x, y, z }) => {
      const light = new three.PointLight(PALETTE.lamp, 0, 8.5, 2)
      light.position.set(x, y - 0.06, z)
      root.add(light)

      // 吸顶灯座
      const base = new three.Mesh(new three.CylinderGeometry(0.16, 0.19, 0.06, 10), materials.stone)
      base.position.set(x, y + 0.03, z)
      root.add(base)

      // 灯泡。不亮时它是暗的，但仍然在那里——一盏看得见却没亮的灯本身就是提示
      const bulb = new three.Mesh(new three.SphereGeometry(0.115, 10, 8), materials.bulb)
      bulb.position.set(x, y, z)
      root.add(bulb)

      // 灯下的光锥：底半径 1.5m、高到地面，正好覆盖走廊宽度的六成
      const cone = new three.Mesh(
        new three.ConeGeometry(1.5, y, 14, 1, true),
        materials.cone,
      )
      cone.position.set(x, y / 2, z)
      root.add(cone)

      // 外晕：声控灯亮起来的那一下，先看见的是这个白点
      const halo = new three.Mesh(new three.SphereGeometry(0.34, 10, 8), materials.halo)
      halo.position.set(x, y, z)
      root.add(halo)

      return light
    })

    /* ---------------- 声控灯的状态机 ---------------- */

    /**
     * 一盏声控灯的记忆：它被踩亮多久了、上一次被踩是什么时候。
     *
     * 为什么不用一个全局的 `lampOn` 布尔量：那样四盏灯会完全同步，
     * 一盏亮四盏一起亮，看着像舞台灯。真实楼道里的灯是各管一段的——
     * 你走过去，前面那盏先亮，身后那盏还亮着，再远的地方是黑的。
     * **这个"一段一段亮过去"的过程，恰好就是玩家在走廊里前进的进度条。**
     */
    const lampState = fixturePlan.map(() => ({ since: 0, lastStep: -99 }))

    /**
     * 触发阈值（米/秒）。
     *
     * 步行速度是 3.2m/s，所以 0.6 意味着**几乎任何移动都会点亮它**，包括慢慢挪。
     * 这个宽松是刻意的：如果只有走快了才亮，玩家会学会"小心翼翼地走"，
     * 而这一节要的不是小心，是"你一动它就亮，你一停它就暗"这个事实本身。
     */
    const TRIGGER_SPEED = 0.6
    /**
     * 从脚步到亮灯的延迟（秒）。
     *
     * 0.18 秒是这套装置的关键。声控灯不是跟着人亮，是**慢半拍**亮的——
     * 那半拍就是电路里的延时继电器。没有它，光会像手电筒一样粘在玩家身上，
     * 而那个"迟了一下才亮"的空隙，正是这个场景唯一能给出的悬念。
     */
    const TRIGGER_DELAY = 0.18
    /** 亮起来的速度（每秒趋近比例）。通电瞬间的钨丝灯是很快的 */
    const RISE = 5.5
    /** 灭下去的速度。明显慢于点亮——余晖、以及继电器那几十秒的计时 */
    const FALL = 0.85
    /** 灯亮时的强度 */
    const PEAK = 7

    let lastPlayerX = NaN
    let lastPlayerZ = NaN

    /* ---------------- 热点 ---------------- */

    const hotspots: Hotspot[] = []

    /**
     * 她家的门。
     *
     * `reach` 给 2.3m 而不是更大，是一个**位置上的表达**：
     * 它允许玩家贴到门口，但不允许他退到走廊中段远远地"点"它。
     * 这一节的全部内容是他站在门外听——要触发，就得先走到门跟前，
     * 那个距离是 0.4m 左右，近到他能听见自己的呼吸。
     *
     * 代理球比门板大一圈（半径 0.85m），因为门只有 0.06m 厚，
     * 射线打中它的窗口窄得让玩家恼火。用球把整扇门连同门缝光包起来，
     * 拾取窗口就变成了"那扇门"，而玩家想的本来就是那扇门。
     *
     * 球用 `material.visible = false` 而不是 `visible = false`：
     * 后者会让射线直接跳过它。
     */
    const doorProxy = new three.Mesh(
      new three.SphereGeometry(0.85, 10, 8),
      new three.MeshBasicMaterial({ visible: false }),
    )
    doorProxy.position.set(HER_DOOR.centerX, 1.0, CORRIDOR.farZ + 0.4)
    root.add(doorProxy)

    /**
     * 「闸门是否已满足」的那套置位 + 补发机制在本场景**刻意不写**。
     *
     * 这一节没有闸门：原文明写他什么都没做，所以不存在任何一个
     * "玩家必须先完成 X 才能继续"的条件。其余场景里那套
     * `gateSatisfied` / `notifyGate` 的写法是为了解决宿主挂载顺序的问题，
     * 而这里既然永远不触发，写下来只会让人以为漏了一段没接上。
     * 正文读完由故事层直接给选项，见 `lib/story/jianjia.ts` 的 e01 节点。
     */

    hotspots.push({
      id: 'her-door',
      object: doorProxy,
      label: '门缝里透出的光',
      reach: 2.3,
      onActivate: () => true,
    })

    /**
     * 声控灯本身也是一个可点的地方。
     *
     * 它是全场景唯一"能被他影响的东西"——他可以踩亮它，也可以让它灭。
     * 让玩家能指着它看一眼，是把这条机制明说出来：
     * 你手里唯一有的东西，就只是照亮一条不属于你的走廊。
     */
    const lampProxy = new three.Mesh(
      new three.SphereGeometry(0.7, 10, 8),
      new three.MeshBasicMaterial({ visible: false }),
    )
    lampProxy.position.set(0.6, 2.5, 1.0)
    root.add(lampProxy)

    hotspots.push({
      id: 'voice-lamp',
      object: lampProxy,
      label: '声控灯',
      // 灯在 2.4m 高，眼高 1.68m，所以站在灯下时眼睛到它的距离约 0.95m。
      // 3.5m 允许玩家站在灯的前后各一米左右，不必精确站位。
      reach: 3.5,
      onActivate: () => true,
    })

    /* ---------------- 触发区域 ---------------- */

    /**
     * 「在门外站住」。
     *
     * 与热点分开：热点是玩家主动看、主动点，走到门口是**身体先到**。
     * 原文里没有"他决定在那里站住"这一步——是脚自己停下来的。
     * 所以这件事交给触发器，玩家不需要按键，故事就自己发生了。
     *
     * 半径 2.0m 从门口往外量，正好覆盖玩家被门挡住之后能站的那一小片。
     */
    const triggers: TriggerZone[] = [
      {
        id: 'stops-at-the-door',
        x: HER_DOOR.centerX,
        z: CORRIDOR.farZ + 1.3,
        radius: 2.0,
        onEnter: () => true,
      },
    ]

    /* ---------------- 逐帧 ---------------- */

    return {
      colliders,
      occluders,
      hotspots,
      triggers,
      update(elapsed, delta, player) {
        /* --- 声控灯：这是本场景唯一真正的机制 --- */

        /**
         * 玩家速度由**位置差**求，而不是从控制器拿。
         *
         * 契约把 `player` 定义成只读的位置快照，不含速度——这是对的，
         * 速度是控制器的内部状态。而这里要的也不是精确速度，
         * 只是"他在动吗"，一阶差分完全够用，还顺带把"撞墙时速度不为零
         * 但位置不变"这种情况自然排除了：声控灯只认脚步，
         * 而他撞在墙上那一下确实是没有声音的。
         */
        const moved = Number.isFinite(lastPlayerX)
          ? Math.hypot(player.x - lastPlayerX, player.z - lastPlayerZ) / Math.max(delta, 1e-4)
          : 0
        lastPlayerX = player.x
        lastPlayerZ = player.z

        const stepping = moved > TRIGGER_SPEED

        /**
         * 每盏灯的强度。先全部算出来再统一写进材质，
         * 这样"灯的总体亮度"（后面回声横梁要用）才有地方取。
         */
        let brightest = 0

        for (let i = 0; i < lampLights.length; i += 1) {
          const state = lampState[i]

          if (stepping) state.lastStep = elapsed

          /**
           * 延迟：脚步停下后的 TRIGGER_DELAY 秒内仍然算"被踩亮"。
           *
           * 用的是"上一次被踩的时刻"而不是一个倒计时变量，
           * 因为倒计时需要逐帧减，一旦宿主暂停（打开叙事面板）就会
           * 在恢复时多扣一秒，灯会莫名其妙地灭在玩家眼前。
           * 由 `elapsed` 直接求值与帧率、暂停都无关。
           */
          const sinceStep = elapsed - state.lastStep
          const active = sinceStep < TRIGGER_DELAY

          /**
           * 距离衰减：灯只管自己那一段。
           *
           * 玩家的水平距离超过 7m 之后，即使他还在走，这盏灯也收不到信号——
           * 真实的声控灯靠声音触发，而声音是会被距离吃掉的。
           * 这条衰减让"一段一段亮过去"成为可能：玩家往前走，
           * 身后的灯因为距离超出了而不再被重新点亮，于是走廊在他身后慢慢黑下去。
           */
          const distanceToPlayer = Math.hypot(player.x - fixturePlan[i].x, player.z - fixturePlan[i].z)
          const audible = distanceToPlayer < 7

          const target = active && audible ? PEAK : 0
          const rate = target > 0 ? RISE : FALL
          state.since += (target - state.since) * Math.min(1, rate * delta)

          lampLights[i].intensity = state.since
          brightest = Math.max(brightest, state.since)
        }

        /**
         * 材质跟着强度走。三份共用材质每帧只写一次，
         * 不逐盏灯各写一份——四盏灯的亮度差主要由 pointLight 承担，
         * 视觉上灯泡那点 11 厘米的球体，差一点点看不出来。
         */
        const glow = brightest / PEAK
        materials.bulb.opacity = glow * 0.95
        materials.halo.opacity = glow * 0.16
        materials.cone.opacity = glow * 0.05

        /* --- 回声横梁 --- */

        /**
         * 亮的时候一列横梁浮出来，灭的时候一起消失。
         *
         * 同时用每根梁自己的 x 位置做一点相位差，
         * 于是靠近玩家的那几根先亮、远处的后亮——走廊因此有了纵深。
         */
        for (let i = 0; i < echoCount; i += 1) {
          const beam = echoGroup.children[i] as import('three').Mesh
          const material = beam.material as import('three').MeshBasicMaterial
          const near = 1 - Math.min(1, Math.abs(beam.position.z - player.z) / 12)
          material.opacity = glow * (0.05 + near * 0.07)
        }

        /* --- 走廊里走过的那个人影 --- */

        /**
         * 人影按固定周期从楼梯口走向她家，走到门口就消失（不是转身走回来）。
         *
         * 用取模而不是"走到头再逆向"：他要的是一次"进去"，不是来回踱步。
         * 消失的位置压在 z = -4.4，比门还差 1.6m——
         * **他永远不会真的走到门前**。玩家看见的只是"有人往那边去了"，
         * 剩下那一步发生在玩家的视线之外，正如原文里也只是"一瞬间"。
         */
        const cycle = (elapsed % shadowWalk.period) / shadowWalk.period
        const walking = cycle < shadowWalk.visibleSpan / shadowWalk.period
        if (walking) {
          const t = cycle * (shadowWalk.period / shadowWalk.visibleSpan)
          shadowFigure.position.z = shadowWalk.fromZ + (shadowWalk.toZ - shadowWalk.fromZ) * t
          // 进出都淡：出现和消失都不该有边界，否则会被看成"一个东西弹出来了"
          const fade = Math.min(1, Math.min(t, 1 - t) * 4)
          // 只在灯亮着的时候看得见。灯灭时它依然是"某个人进了她家"，
          // 只是玩家什么都没看见——这比让他看见更接近那天。
          materials.shadow.opacity = fade * glow * 0.85
        } else {
          materials.shadow.opacity = 0
        }

        /* --- 门缝的光 --- */

        /**
         * 门缝的亮度随玩家靠近**略微**变亮，并且带一点极慢的呼吸。
         *
         * 幅度压得很小（0.55 → 0.86）：它是"别人家里的灯"，
         * 不该对走廊里的任何人有反应。变亮的那一点点只是透视——
         * 走近了，那道缝在视野里占的角度更大，看起来自然更实。
         *
         * 呼吸周期约 12 秒，比人的呼吸慢得多：屋里有人在哭，
         * 哭声不是节拍器，它只是一直在那里。
         */
        const distanceToDoor = Math.hypot(player.x - HER_DOOR.centerX, player.z - (CORRIDOR.farZ + 0.2))
        const approach = 1 - Math.min(1, distanceToDoor / 14)
        const breath = 0.5 + 0.5 * Math.sin(elapsed * 0.52)
        materials.seam.opacity = 0.55 + approach * 0.24 + breath * 0.07
        materials.seamPool.opacity = 0.07 + approach * 0.09

        /* --- 单元门外的街光 --- */

        // 单元门外是雨夜，这点光恒定且冷淡，不参与任何机制。
        // 它存在的唯一理由是让玩家回头时能认出那是一扇门而不是一块黑。
      },
      resize() {
        // 这个场景的布景全部按米摆放、与宽高比无关，无需响应
      },
    }
  },
}

/** 声控灯挂在横梁下方，比层高略低——老楼很少把灯装在正中间 */
function CorridorFixtureY(landingY: number): number {
  return Math.min(2.78, landingY + 1.7)
}
