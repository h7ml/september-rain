import type { Collider, Hotspot, SceneRuntime, WorldScene, WorldSceneHandle } from '../types'

/**
 * 场景「英国 · 凌晨的窗边」——远方线的第一站（f01）。
 *
 * ## 空间布局（坐标即叙事）
 *
 * ```
 *        z = -24  街对面：英式联排屋的剪影，其中一扇窗亮着
 *        z = -12  路灯（湿冷的街灯），雨只落在室外
 *        z =  -3.5 窗户 ← 玩家出生点正对着的就是它
 *        z =  -2.8 书桌、开着的笔记本
 *        z =   0  暖气片贴在右墙上，窗外那扇亮窗在左前方
 *        z =   4  玩家出生点（房间中间偏窗，背对着床）
 *        z =   5.5 后墙
 * ```
 *
 * 出生朝 `yaw = 0`，即朝 `-z`。这条视线上依次是：书桌 → 笔记本 →
 * 窗玻璃 → 雨 → 街对面那扇亮着的窗。**这条线就是这一节的全部**。
 *
 * ## 两扇窗对望
 *
 * 这是本场景的核心意象，也是整个故事里"异地"的缩影。做法不是画两个窗框，
 * 而是让画面里**只有两个亮着的东西，且它们对望**：
 *
 * 1. 书桌上那台笔记本。屏幕朝向玩家，光打在桌面上、打在墙上。
 * 2. 街对面那栋联排屋的第二层有一扇窗亮着。
 *
 * 玩家站在房间中间看过去，左边是笔记本的冷白光，远处是那扇暖黄的窗，
 * 两者之间隔着一条下着雨的街。~~两扇窗互相照亮对方~~ 两个窗口都不可能
 * 知道对面在发生什么，但它们确实在这条视线上面对面。
 *
 * 八小时的时差就落在这两个光源之间：**笔记本屏幕上是国内的时间**，
 * 比这扇窗外的此刻快八个小时。他凌晨醒来的时候，她那边正是上班的路上。
 * 所以笔记本的时钟不是道具装饰，它是这个场景唯一一处直接说出"时差"的东西。
 *
 * 第三扇窗也值得提一句：房间里这扇。它朝室外透着他这边的光，
 * 而室外那扇亮窗属于一个和他毫无关系的人。**最近的那扇窗和唯一亮着的那扇窗，
 * 中间隔着的东西比八小时更多**——这一层不用做出来，玩家自己会读到。
 *
 * ## 凌晨的深蓝
 *
 * 街景的底色比室内更冷、更蓝，亮度却比室内更低。不是把室外调暗就算数——
 * 要的是"天快亮了但还没亮"那种发青的暗，所以街道、屋顶、树一律偏蓝，
 * 与室内那点琥珀色彻底分开。玩家回头看一眼暖气片，两种色温的分界
 * 会替你说出"我在一个离她很远的时区里"。
 */

/** 房间尺寸。多个部件要按它对齐，抽成常量避免两处各写一遍导致穿帮。 */
const ROOM = {
  /** 窗户所在的 z */
  frontZ: -3.5,
  /** 后墙（背对着玩家的那一面） */
  backZ: 5.5,
  /** 侧墙的 x 绝对值 */
  halfWidth: 3.3,
  /** 层高 */
  height: 3.2,
} as const

/**
 * 课桌。笔记本、代理球、碰撞体三处都要用它，必须同源。
 *
 * 桌面高 0.74 米是标准的书桌高度——第一人称下玩家低头看屏幕时，
 * 这个高度会让屏幕正落在视线的下缘，读起来是"我在桌前站着看它"。
 */
const DESK = { x: -0.9, z: -2.8, top: 0.74 } as const

/**
 * 时差。
 *
 * 不写成常量放进笔记本的时钟里，而是**明确标出它是时差**：
 * 这个场景里唯一提到数字的地方，只能是这个数。
 */
const TIME_ZONE_OFFSET_HOURS = 8

/** 场景调色板。室内沿用墨绿灰阶 + 琥珀；室外单独一套冷蓝。 */
const PALETTE = {
  ground: 0x1b2422,
  structure: 0x101619,
  furniture: 0x1e2929,
  /** 暖气片比家具再亮一点：它是这间屋子里唯一"活着"的金属 */
  radiator: 0x2c3636,
  /** 唯一的高亮色，留给笔记本屏幕 */
  screen: 0xe8e4da,
  accent: 0xc8a878,
  /** 凌晨的深蓝。室外全部走这一族色 */
  night: 0x0d1213,
  nightFar: 0x151d26,
  nightHouse: 0x111820,
  rain: 0x6f8b9c,
} as const

export const ukWindowScene: WorldScene = {
  id: 'uk-window',
  caption: '英国 · 凌晨的窗边',
  /** 固定种子。同一场雨、同一条街、同一扇亮着的窗，每次进入都必须在同一处。 */
  seed: 0x5e9e08,

  build(runtime: SceneRuntime): WorldSceneHandle {
    const { three, root, random } = runtime

    /* ---------------- 材质 ---------------- */

    // 与既有场景同一套做法：全场共用一组材质。室外另起一族冷色，
    // 因为它和室内的色温必须彻底分开，否则"我在很远的时区"读不出来。
    const materials = {
      floor: new three.MeshLambertMaterial({ color: PALETTE.ground }),
      structure: new three.MeshLambertMaterial({ color: PALETTE.structure }),
      furniture: new three.MeshLambertMaterial({ color: PALETTE.furniture }),
      radiator: new three.MeshLambertMaterial({ color: PALETTE.radiator }),
      /** 玻璃只是"有一点存在感"：太实就看不见街，太透就读不出这是窗 */
      glass: new three.MeshBasicMaterial({
        color: PALETTE.nightFar,
        transparent: true,
        opacity: 0.09,
        side: three.DoubleSide,
        depthWrite: false,
      }),
      /** 笔记本屏幕。亮度由 update 驱动 */
      screen: new three.MeshBasicMaterial({ color: PALETTE.screen }),
      /** 屏幕打在桌面与墙上的光斑，用低透明度的大面冒充，比做体积光便宜 */
      spill: new three.MeshBasicMaterial({
        color: PALETTE.screen,
        transparent: true,
        opacity: 0.055,
        side: three.DoubleSide,
        depthWrite: false,
      }),
      /**
       * 玻璃上的水痕与暖气片的热气。
       *
       * 与 `spill` 分开一份材质是必须的，不是洁癖：`spill` 的不透明度
       * 每帧按玩家到桌子的距离重写，两组东西若共用一份，
       * 玩家一走近桌子，玻璃上的水痕和暖气片上的热气会一起变亮——
       * 那三样东西属于三个不同的因果，不该被同一个距离牵动。
       */
      haze: new three.MeshBasicMaterial({
        color: PALETTE.screen,
        transparent: true,
        opacity: 0.05,
        side: three.DoubleSide,
        depthWrite: false,
      }),
      accent: new three.MeshBasicMaterial({ color: PALETTE.accent }),
      /**
       * 街面的积水。单独一份冷色，**不用琥珀**。
       *
       * 这个场景里只能有两处暖光：笔记本电脑和街对面那扇窗。
       * 街上的水洼若也用琥珀，画面里就出现了第三、第四、第五处暖色，
       * 而那两处就不再是"仅有的两个窗口"，两扇窗对望的构图会散掉。
       * 积水在这里的任务只是"地面是湿的"，所以它冷、它暗、它不发光。
       */
      puddle: new three.MeshBasicMaterial({
        color: PALETTE.rain,
        transparent: true,
        opacity: 0.09,
        depthWrite: false,
      }),
      /** 街对面那扇亮着的窗。全场第二处、也是最后一处亮色 */
      farWindow: new three.MeshBasicMaterial({ color: PALETTE.accent }),
      /**
       * 远处那扇窗的光晕。独立一份材质，理由同 `haze`：
       * 它每帧按自己的节拍起伏，与玩家在屋里的位置无关——
       * 街对面有没有人在走动，不该因为**他**走近了自己的桌子而改变。
       * 这是全场唯一一份不响应玩家的材质，刻意如此。
       */
      farHalo: new three.MeshBasicMaterial({
        color: PALETTE.accent,
        transparent: true,
        opacity: 0.06,
        depthWrite: false,
      }),
      street: new three.MeshLambertMaterial({ color: PALETTE.night }),
      house: new three.MeshLambertMaterial({ color: PALETTE.nightHouse }),
      roof: new three.MeshLambertMaterial({ color: PALETTE.nightFar }),
      rain: new three.LineBasicMaterial({
        color: PALETTE.rain,
        transparent: true,
        opacity: 0.24,
      }),
    }

    const colliders: Collider[] = []
    const occluders: import('three').Object3D[] = []

    /* ---------------- 室内：地面与围合 ---------------- */

    const floor = new three.Mesh(
      new three.BoxGeometry(ROOM.halfWidth * 2, 0.2, ROOM.backZ - ROOM.frontZ),
      materials.floor,
    )
    floor.position.set(0, -0.1, (ROOM.backZ + ROOM.frontZ) / 2)
    root.add(floor)

    /**
     * 房间围合。
     *
     * 四面墙都有碰撞体，人出不去——这一节的标题是「八个小时」，
     * 玩家唯一能做的事就是**待在屋里看着窗外**。如果能走出去，
     * 异地就变成了出门散步，整个场景的前提就没了。
     */
    const walls: { x: number; z: number; halfX: number; halfZ: number }[] = [
      { x: 0, z: ROOM.frontZ, halfX: ROOM.halfWidth, halfZ: 0.15 },
      { x: 0, z: ROOM.backZ, halfX: ROOM.halfWidth, halfZ: 0.15 },
      { x: -ROOM.halfWidth, z: (ROOM.backZ + ROOM.frontZ) / 2, halfX: 0.15, halfZ: (ROOM.backZ - ROOM.frontZ) / 2 },
      { x: ROOM.halfWidth, z: (ROOM.backZ + ROOM.frontZ) / 2, halfX: 0.15, halfZ: (ROOM.backZ - ROOM.frontZ) / 2 },
    ]
    for (const w of walls) {
      // 窗那一面只做上下两截，中间留给玻璃——整块砌上就把街景封死了
      const isWindowWall = w.z === ROOM.frontZ
      const mesh = new three.Mesh(
        new three.BoxGeometry(w.halfX * 2, isWindowWall ? 0.62 : ROOM.height, w.halfZ * 2),
        materials.structure,
      )
      if (isWindowWall) {
        // 窗台高度 0.62 米。做矮不是为了好看：站着的时候视线在 1.68 米，
        // 站在窗前正好能看见街，坐下来的话会看见自己的脚——这间屋子没有椅子。
        mesh.position.set(w.x, 0.31, w.z)
      } else {
        mesh.position.set(w.x, ROOM.height / 2, w.z)
      }
      root.add(mesh)

      if (isWindowWall) {
        // 窗楣：把立面的上段补齐，让"窗"有一个高度上的边界
        const lintel = new three.Mesh(new three.BoxGeometry(w.halfX * 2, ROOM.height - 2.5, w.halfZ * 2 + 0.4), materials.structure)
        lintel.position.set(w.x, (2.5 + ROOM.height) / 2, w.z)
        root.add(lintel)
      }

      colliders.push({ kind: 'box', x: w.x, z: w.z, halfX: w.halfX, halfZ: w.halfZ })
      // 窗那一面**不进** occluders：它是透明的，玩家要透过它看见街。
      // 交给遮挡判定会直接掐掉本场景最重要的那个视角。
      if (!isWindowWall) occluders.push(mesh)
    }

    /* ---------------- 天花板与灯 ---------------- */

    const ceiling = new three.Mesh(
      new three.BoxGeometry(ROOM.halfWidth * 2, 0.2, ROOM.backZ - ROOM.frontZ),
      materials.structure,
    )
    ceiling.position.set(0, ROOM.height, (ROOM.backZ + ROOM.frontZ) / 2)
    root.add(ceiling)
    occluders.push(ceiling)

    /**
     * 吸顶灯，关着的。
     *
     * 这一处刻意不发光：凌晨四点不会有人开着大灯。房间里所有的光
     * 都来自笔记本屏幕，玩家抬头看见的是一盏没亮的灯，
     * 那是"他醒着，但整个世界没醒"最省的一笔。
     */
    const ceilingLamp = new three.Mesh(new three.SphereGeometry(0.14, 10, 8), materials.furniture)
    ceilingLamp.position.set(0, ROOM.height - 0.12, 0)
    root.add(ceilingLamp)

    /* ---------------- 暖气片 ---------------- */

    /**
     * 暖气片。贴在右墙上，玩家出生时它在右手边、稍微偏后。
     *
     * 为什么要有一组暖气片：这个场景缺一个"这里很冷，但屋里有个热的东西"的物证。
     * 窗外的雨与凌晨的光都在说冷，而暖气片是这间出租屋里唯一替人撑着的东西。
     * 它也是全场唯一有动态细节的物件——热气流在它上方微微扭动。
     */
    const radiator = new three.Group()
    const RADIATOR = { x: ROOM.halfWidth - 0.22, z: 0.4, width: 1.7 } as const
    for (let i = 0; i < 11; i += 1) {
      const fin = new three.Mesh(new three.BoxGeometry(0.14, 0.62, 0.09), materials.radiator)
      fin.position.set(0, 0.42, -RADIATOR.width / 2 + (i * RADIATOR.width) / 10)
      radiator.add(fin)
    }
    // 进出水管：一进一出，两端各接一根。做这个是为了让它读起来是"管道"
    // 而不是"一排竖着的板子"
    for (const end of [-1, 1]) {
      const pipe = new three.Mesh(new three.CylinderGeometry(0.03, 0.03, 0.42, 6), materials.structure)
      pipe.position.set(0, 0.2, end * (RADIATOR.width / 2 - 0.1))
      radiator.add(pipe)
    }
    radiator.position.set(RADIATOR.x, 0, RADIATOR.z)
    root.add(radiator)
    colliders.push({ kind: 'box', x: RADIATOR.x, z: RADIATOR.z, halfX: 0.25, halfZ: RADIATOR.width / 2 + 0.1 })

    /**
     * 暖气片上方的热气流。三块极低透明度的薄片，随时间缓慢扭动。
     *
     * 不做粒子：这个房间里正在发生的事总共只有两件（雨在下、屏幕亮着），
     * 热气流是第三件，它必须安静到玩家不确定自己有没有看见。
     */
    const heat = new three.Group()
    for (let i = 0; i < 3; i += 1) {
      const wisp = new three.Mesh(new three.PlaneGeometry(0.5, 0.9), materials.haze)
      wisp.position.set(RADIATOR.x - 0.05, 0.95 + i * 0.22, RADIATOR.z + random.spread(0, 0.5))
      wisp.rotation.y = -Math.PI / 2
      heat.add(wisp)
    }
    root.add(heat)

    /* ---------------- 床 ---------------- */

    /**
     * 床。靠左墙、在玩家出生点背后。
     *
     * 位置是刻意的：出生朝向 `-z`，床在身后。玩家要看见它必须转身——
     * 那一刻他会发现被子是掀开的。这是这一节唯一的动作痕迹：
     * **他是从这张床上醒过来的**，而且是一个人醒的。
     */
    const bed = new three.Group()
    const frame = new three.Mesh(new three.BoxGeometry(1.3, 0.32, 2.0), materials.furniture)
    frame.position.y = 0.16
    const blanket = new three.Mesh(new three.BoxGeometry(1.24, 0.14, 1.15), materials.structure)
    // 被子只盖到床的下半截：上半截是空的，人刚起来
    blanket.position.set(0, 0.39, 0.42)
    const pillow = new three.Mesh(new three.BoxGeometry(0.6, 0.14, 0.36), materials.furniture)
    pillow.position.set(0, 0.39, -0.78)
    bed.add(frame, blanket, pillow)
    bed.position.set(-2.2, 0, 2.6)
    root.add(bed)
    colliders.push({ kind: 'box', x: -2.2, z: 2.6, halfX: 0.7, halfZ: 1.05 })
    occluders.push(frame)

    /* ---------------- 窗与窗台 ---------------- */

    /**
     * 窗由三部分组成：窗台、竖棂、玻璃面。
     *
     * 英式联排屋的窗是上下推拉窗（sash window），所以中横棂的位置
     * 比门楣低、且明显偏上——这个细节决定了它看起来是"英国的窗"
     * 还是"随便一扇窗"。这一处是场景名里就写着的地点，值得较真。
     */
    const windowGroup = new three.Group()
    const WIN = { x: 0.2, halfWidth: 1.15 } as const

    // 窗台
    const sill = new three.Mesh(new three.BoxGeometry(WIN.halfWidth * 2 + 0.3, 0.1, 0.34), materials.structure)
    sill.position.set(WIN.x, 0.62, ROOM.frontZ + 0.05)
    windowGroup.add(sill)

    // 竖棂：三根，把窗分成四格。格子数少才读得出"这是民居的窗"
    const paneHeight = 2.5 - 0.62
    for (let i = 0; i < 3; i += 1) {
      const mullion = new three.Mesh(new three.BoxGeometry(0.07, paneHeight, 0.14), materials.structure)
      mullion.position.set(WIN.x - WIN.halfWidth + (i * WIN.halfWidth * 2) / 2, 0.62 + paneHeight / 2, ROOM.frontZ)
      windowGroup.add(mullion)
    }
    // 上下推拉窗的中横棂：位置在窗高中点偏上，这是 sash window 的识别特征
    const sashBar = new three.Mesh(new three.BoxGeometry(WIN.halfWidth * 2, 0.09, 0.16), materials.structure)
    sashBar.position.set(WIN.x, 0.62 + paneHeight * 0.62, ROOM.frontZ)
    windowGroup.add(sashBar)

    const glass = new three.Mesh(new three.PlaneGeometry(WIN.halfWidth * 2, paneHeight), materials.glass)
    glass.position.set(WIN.x, 0.62 + paneHeight / 2, ROOM.frontZ)
    windowGroup.add(glass)

    /**
     * 玻璃上的水痕。与咖啡店同一套手法：透明的东西看起来是干净的，
     * 几道淡痕花不掉几个面片，却能把"这面玻璃是湿的"钉在画面上。
     * 英国的雨不大，所以痕比咖啡店那边细、比那边密。
     */
    for (let i = 0; i < 7; i += 1) {
      const length = random.range(0.4, 1.9)
      const streak = new three.Mesh(
        new three.PlaneGeometry(random.range(0.015, 0.04), length),
        materials.haze,
      )
      streak.position.set(WIN.x + random.spread(0, WIN.halfWidth - 0.15), 2.4 - length / 2, ROOM.frontZ + 0.03)
      windowGroup.add(streak)
    }
    root.add(windowGroup)

    /* ---------------- 书桌与笔记本 ---------------- */

    const desk = new three.Group()
    const deskTop = new three.Mesh(new three.BoxGeometry(1.7, 0.06, 0.8), materials.furniture)
    deskTop.position.y = DESK.top
    desk.add(deskTop)
    for (const end of [-1, 1]) {
      const leg = new three.Mesh(new three.BoxGeometry(0.07, DESK.top, 0.07), materials.furniture)
      leg.position.set(end * 0.78, DESK.top / 2, 0.32)
      desk.add(leg)
      const legBack = new three.Mesh(new three.BoxGeometry(0.07, DESK.top, 0.07), materials.furniture)
      legBack.position.set(end * 0.78, DESK.top / 2, -0.32)
      desk.add(legBack)
    }
    desk.position.set(DESK.x, 0, DESK.z)
    root.add(desk)
    colliders.push({ kind: 'box', x: DESK.x, z: DESK.z, halfX: 0.85, halfZ: 0.4 })
    occluders.push(deskTop)

    /**
     * 笔记本。开着的，屏幕朝向屋里——也就是朝向玩家。
     *
     * 这是本场景第一个光源，也是"两扇窗对望"里离他最近的那一扇。
     * 屏幕本身用纯亮色（不吃光，才有显示器那种自发光感），
     * 亮起的亮度由 update 按玩家是否在看它来调。
     */
    const laptop = new three.Group()
    const base = new three.Mesh(new three.BoxGeometry(0.34, 0.018, 0.24), materials.structure)
    const screen = new three.Mesh(new three.PlaneGeometry(0.32, 0.2), materials.screen)
    screen.position.set(0, 0.105, -0.055)
    // 打开角度约 105°：比垂直后仰一点，正对站在桌前的玩家
    screen.rotation.x = -Math.PI / 2 + 0.26
    const laptopLid = new three.Mesh(new three.BoxGeometry(0.34, 0.2, 0.012), materials.structure)
    laptopLid.position.set(0, 0.1, -0.062)
    laptopLid.rotation.x = -Math.PI / 2 + 0.26
    laptop.add(base, screen, laptopLid)
    laptop.position.set(DESK.x, DESK.top + 0.03, DESK.z)
    laptop.rotation.y = 0.22
    root.add(laptop)

    /**
     * 屏幕的光。一盏很暗的点光 + 一层贴在桌面上的光斑。
     *
     * 点光衰减给得极小（3 米），只够照亮桌面、笔记本背面和窗台那一片——
     * 让整间屋子亮起来的话，这个场景就变成了"他在熬夜工作"，
     * 而不是"他凌晨醒着，屋里只有一块屏幕亮着"。
     */
    const screenLight = new three.PointLight(PALETTE.screen, 2.6, 3.4, 2)
    screenLight.position.set(DESK.x + 0.1, DESK.top + 0.16, DESK.z + 0.02)
    root.add(screenLight)

    const screenSpill = new three.Mesh(new three.PlaneGeometry(1.5, 1.0), materials.spill)
    screenSpill.rotation.x = -Math.PI / 2
    screenSpill.position.set(DESK.x, DESK.top + 0.02, DESK.z + 0.42)
    root.add(screenSpill)

    /**
     * 桌上的杯子。
     *
     * 一个细节值得写一行注释：它是**空的**。八小时时差里，
     * 他这边在深夜，她那边在上班——桌上那杯东西是谁喝的、
     * 什么时候喝的，不用交代，看见杯底就行。
     */
    const cup = new three.Mesh(new three.CylinderGeometry(0.042, 0.034, 0.1, 10), materials.furniture)
    cup.position.set(DESK.x - 0.62, DESK.top + 0.05, DESK.z + 0.12)
    root.add(cup)

    /* ---------------- 街对面：英式联排屋 ---------------- */

    /**
     * 街的位置。雨、路面、路灯、联排屋全部按它对齐。
     *
     * 街在窗外 8 米处开始，比咖啡店那边近——因为这一节的重点
     * 不是"街对面有家店"，而是"街对面有一扇窗"。窗里的东西要看得清。
     */
    const STREET = { z: -12, halfWidth: 26 } as const

    /**
     * 街面。往**窗户这侧**一直铺到 z = -3.6，也就是窗台脚下。
     *
     * 不是随手给的一个大数：街若从 z = -1 才开始，窗前到街沿之间
     * 会露出一段没有地面的黑缝——玩家站在窗前低头就能看见，
     * 那一眼会让"窗外是街道"变成"外面是一块布景"。
     */
    const street = new three.Mesh(new three.BoxGeometry(STREET.halfWidth * 2, 0.2, 20.4), materials.street)
    street.position.set(0, -0.16, STREET.z + 1.6)
    root.add(street)

    /**
     * 联排屋（terraced houses）。
     *
     * 认得出是英国的街，靠三件事，按重要性排序：
     * 1. **连成一排、立面齐平**。独立小楼就不像了，联排的连续性是第一特征。
     * 2. 陡而高的双坡屋顶 + 烟囱。屋顶比墙还高，这是英式排屋最扎眼的轮廓。
     * 3. 二层比一层矮一点，窗小一点。
     *
     * 全部由盒子与三棱柱拼成，没有一处贴图。26 米外隔着雨，
     * 玩家读到的就是"一排尖顶的房子"，那已经够认出是英国了。
     */
    const houses = new three.Group()
    const HOUSE_COUNT = 9
    for (let i = 0; i < HOUSE_COUNT; i += 1) {
      const width = 5.2
      const x = (i - (HOUSE_COUNT - 1) / 2) * width
      // 高度轻微参差：整齐的一排反而假，真实的联排屋高度差个半米
      const height = random.range(7.4, 8.6)
      const depth = 7

      const body = new three.Mesh(new three.BoxGeometry(width - 0.1, height, depth), materials.house)
      body.position.set(x, height / 2, STREET.z - 8 - depth / 2)
      houses.add(body)

      /**
       * 双坡屋顶。用四棱锥（CylinderGeometry 的 4 边变体）而不是三棱柱，
       * 因为它自带四个斜面——排屋是前后坡，左右会和邻居的屋顶相接，
       * 单看一栋会觉得奇怪，连成一排之后正好连成一条起伏的屋脊线。
       */
      const roof = new three.Mesh(new three.CylinderGeometry(0, width * 0.62, 2.6, 4), materials.roof)
      roof.position.set(x, height + 1.3, STREET.z - 8 - depth / 2)
      // 四棱锥默认是尖顶朝上的方锥，旋 45° 让四个面正对前后左右
      roof.rotation.y = Math.PI / 4
      // 压扁 x，让屋脊沿街方向延伸而不是变成一个塔尖
      roof.scale.set(1.5, 1, 0.62)
      houses.add(roof)

      // 烟囱。屋顶线上的小凸起，是这条街轮廓里最小也最有效的一笔
      const chimney = new three.Mesh(new three.BoxGeometry(0.62, 1.1, 0.62), materials.house)
      chimney.position.set(x - width * 0.28, height + 2.3, STREET.z - 8 - depth / 2)
      houses.add(chimney)

      /**
       * 一二层的窗。全是暗的，只有一扇例外——留到循环外面单独建，
       * 因为它不能被随机数决定落在哪一栋上。
       */
      for (let floor = 0; floor < 2; floor += 1) {
        const paneY = floor === 0 ? 2.0 : 4.9
        const paneH = floor === 0 ? 1.5 : 1.2
        for (let j = 0; j < 2; j += 1) {
          const pane = new three.Mesh(new three.PlaneGeometry(0.95, paneH), materials.structure)
          pane.position.set(x - width * 0.2 + j * width * 0.4, paneY, STREET.z - 8 + 0.02)
          houses.add(pane)
        }
      }

      // 一层的门。暗色凹进，门就是一块更黑的方块
      const door = new three.Mesh(new three.PlaneGeometry(1.0, 2.1), materials.structure)
      door.position.set(x + width * 0.18, 1.05, STREET.z - 8 + 0.02)
      houses.add(door)
    }

    /**
     * 那扇亮着的窗。全场第二个、也是最后一个光源。
     *
     * 位置固定（第五栋、二层左边那格），不走随机——一扇随机落点的亮窗
     * 只是"街上有个人没睡"，一扇**固定**的亮窗才是"对面那扇窗一直在那儿"。
     * 玩家第二眼一定会去找它，第三眼会发现它的位置和笔记本的屏幕
     * 连成一条线。这条线就是异地。
     */
    const litX = (4 - (HOUSE_COUNT - 1) / 2) * 5.2 - 5.2 * 0.2
    const farWindow = new three.Mesh(new three.PlaneGeometry(0.95, 1.2), materials.farWindow)
    farWindow.position.set(litX, 4.9, STREET.z - 8 + 0.03)
    root.add(farWindow)
    /**
     * 亮窗外的光晕。一层极淡的大平面罩住窗，
     * 让它在湿空气里有"散开"的感觉——凌晨的雾就是这样把一盏灯
     * 变成一团光的。这是全场唯一一处让光溢出边界的处理。
     */
    const farHalo = new three.Mesh(new three.PlaneGeometry(3.4, 3.4), materials.farHalo)
    farHalo.position.set(litX, 4.9, STREET.z - 8 + 0.01)
    root.add(farHalo)

    /* ---------------- 路灯 ---------------- */

    /**
     * 街灯。湿冷的冷白光，与远处那扇暖窗是两种光。
     *
     * 用法与咖啡店那边相反：那边路灯是暖色的（因为要照亮雨、要给人味），
     * 这里的路灯**必须是冷的**。同一画面里如果两处光都是暖的，
     * 街对面那扇窗就不再特别了；冷光把暖光衬出来，两束光一冷一暖，
     * 玩家才知道哪一束是"有人"。
     */
    const lampPost = new three.Mesh(new three.CylinderGeometry(0.08, 0.11, 6.4, 6), materials.structure)
    lampPost.position.set(3.4, 3.2, STREET.z + 1.5)
    root.add(lampPost)
    const lampHead = new three.Mesh(new three.SphereGeometry(0.2, 8, 6), materials.glass)
    lampHead.position.set(3.4, 6.5, STREET.z + 1.5)
    root.add(lampHead)

    /* ---------------- 雨 ---------------- */

    /**
     * 英国的雨：细、密、慢。
     *
     * 与操场那一场刻意不同——操场那场雨是 620 根、速度 12~21、长度 0.3~0.7，
     * 那种雨是"下得很大"；这里是 340 根、速度 6~11、长度 0.12~0.3，
     * 是"一直在下"。同一套代码，两组参数，两种天气。
     *
     * 雨的 z 范围严格锁在窗外，一根都不能落进屋里：只要有一根进来，
     * "他在窗的这一侧、她在窗的那一侧"就不成立了。
     */
    const DROPS = 340
    /**
     * `zFar` 停在 -22 而不是更远：街对面那排房子的正立面在 z = -20，
     * 再往后留两米的空档，雨就**不会落在房子和那扇亮窗之间**。
     * 少了这两米，那扇窗会被一层雨丝筛成一片模糊的暖斑，
     * 而它必须是一扇能被看清的、有人在那边的窗。
     */
    const RAIN = { span: 12, x: 30, zNear: ROOM.frontZ - 0.6, zFar: -22, wind: 0.1 } as const

    const rainBase = new Float32Array(DROPS * 3)
    const rainSpeed = new Float32Array(DROPS)
    const rainLength = new Float32Array(DROPS)
    for (let i = 0; i < DROPS; i += 1) {
      rainBase[i * 3] = random.spread(0, RAIN.x)
      // y 的初值铺满整个高度区间，否则雨会像一块下落的板
      rainBase[i * 3 + 1] = random.range(0, RAIN.span)
      rainBase[i * 3 + 2] = random.range(RAIN.zFar, RAIN.zNear)
      rainSpeed[i] = random.range(6, 11)
      rainLength[i] = random.range(0.12, 0.3)
    }

    const rainPositions = new Float32Array(DROPS * 6)
    const rainAttribute = new three.BufferAttribute(rainPositions, 3)
    // 每帧都要重写，声明成动态用法让驱动不要把它放在只读的显存路径上
    rainAttribute.setUsage(three.DynamicDrawUsage)
    const rainGeometry = new three.BufferGeometry()
    rainGeometry.setAttribute('position', rainAttribute)
    const rain = new three.LineSegments(rainGeometry, materials.rain)
    rain.frustumCulled = false
    root.add(rain)

    /**
     * 每帧从 `elapsed` 直接算出雨丝位置，而不是逐帧累加位移。
     *
     * 累加会随掉帧产生漂移，且一旦宿主暂停再恢复，雨会"跳"一下；
     * 由时间直接求值则与帧率完全无关，暂停后接着放也不会错位。
     *
     * 这一场的雨**不跟随玩家**：雨的横向范围远超房间，玩家又只能在屋里走动，
     * 跟着走没有意义，反而会让窗框外的雨在他转身时整体平移。
     */
    const stepRain = (elapsed: number) => {
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
    }
    stepRain(0)

    /* ---------------- 街面上的积水 ---------------- */

    for (let i = 0; i < 8; i += 1) {
      const puddle = new three.Mesh(new three.CircleGeometry(random.range(1.0, 2.6), 14), materials.puddle)
      puddle.rotation.x = -Math.PI / 2
      puddle.position.set(random.spread(0, 18), -0.05, random.range(STREET.z + 5, STREET.z - 20))
      root.add(puddle)
    }

    /* ---------------- 可交互：笔记本 ---------------- */

    /**
     * 笔记本是这一节唯一能点的东西，代理球把屏幕连同键盘一起包住。
     *
     * 理由与咖啡店那台手机相同：笔记本只有 34 厘米宽，射线打中的概率
     * 低得让人恼火；用一个球把它连同一圈桌面包起来，拾取窗口就变成了
     * "他在桌上放电脑的地方"。
     *
     * 球用 `material.visible = false` 而不是 `mesh.visible = false`：
     * 后者会让射线直接跳过它，而我们要的是"看不见但点得到"。
     */
    const laptopProxy = new three.Mesh(
      new three.SphereGeometry(0.62, 10, 8),
      new three.MeshBasicMaterial({ visible: false }),
    )
    laptopProxy.position.set(DESK.x, DESK.top + 0.28, DESK.z)
    root.add(laptopProxy)

    const hotspots: Hotspot[] = [
      {
        id: 'laptop-on-desk',
        object: laptopProxy,
        label: '开着的笔记本',
        /**
         * 2.4 米，且是**从眼睛量起的三维距离**。
         *
         * 笔记本躺在 0.77 米高的桌面上，眼高 1.68 米——光是这 0.9 米的
         * 高度差就吃掉大半额度。桌子的碰撞体挡住玩家（半径 0.85 米的盒），
         * 站定时眼睛到屏幕实测约 1.4 米，2.4 留出的余量刚好要求玩家
         * 走到桌边，但不要求他精确站定。
         */
        reach: 2.4,
        onActivate: () => {
          /**
           * 这一节没有闸门（f01 只有两个选项，玩家读完正文就能选）。
           * 点它只是"我看了一眼屏幕上的时间"，返回 true 消费掉点击。
           */
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
        stepRain(elapsed)

        /**
         * 三处动效，仍然按 bleachers 那种克制程度：
         * 1. 暖气片上的热气流缓慢扭动
         * 2. 屏幕亮度随玩家走近而变亮
         * 3. 远处那扇窗的光晕极慢地起伏
         *
         * 雨幕流动不算"动效"——它是布景，一直在流。
         */
        for (let i = 0; i < heat.children.length; i += 1) {
          const wisp = heat.children[i]
          // 每片用不同的相位，避免三片整齐地一起摆（那看起来像呼吸而不是热气）
          wisp.position.y = 0.95 + i * 0.22 + Math.sin(elapsed * 0.7 + i * 2.1) * 0.06
          wisp.rotation.z = Math.sin(elapsed * 0.5 + i * 1.4) * 0.12
        }

        /**
         * 屏幕变亮。玩家站在桌前看屏幕时最亮，走开就暗下去。
         *
         * 用 4 米的软阈值：房间本来就只有 9 米深，硬阈值会让玩家
         * 一转身就看到屏幕灭掉，那像坏了的显示器。软阈值的观感是
         * "你靠近的时候它才是清楚的"——与他这一节的状态同源：
         * 隔着八个小时，他只能看清她那边的一小块。
         */
        const distanceToDesk = Math.hypot(player.x - DESK.x, player.z - DESK.z)
        const near = Math.max(0, 1 - distanceToDesk / 4)
        screenLight.intensity = 1.6 + near * 2.4
        materials.spill.opacity = 0.04 + near * 0.05

        /**
         * 远处那扇窗的光晕起伏。
         *
         * 周期压到 11 秒——比人的呼吸慢得多，慢到玩家不该确定它在动。
         * 这一处是全场唯一一处"她没有消失"的暗示：她那边天亮了，
         * 有人在走动，灯是活的。做快了就变成了闪烁信号，那是另一件事。
         */
        const pulse = 0.5 + 0.5 * Math.sin(elapsed * 0.57 + TIME_ZONE_OFFSET_HOURS)
        materials.farWindow.opacity = 0.72 + pulse * 0.28
        farHalo.scale.setScalar(0.94 + pulse * 0.12)
      },
      resize() {
        // 这个场景的布景全部按米摆放、与宽高比无关；雨也不随相机拉伸，无需响应
      },
    }
  },
}
