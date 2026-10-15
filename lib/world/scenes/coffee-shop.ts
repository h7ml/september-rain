import type { Collider, Hotspot, SceneRuntime, WorldScene, WorldSceneHandle } from '../types'

/**
 * 场景「城南 · 咖啡店」——第二幕。故事在这里第一次真正分叉。
 *
 * ## 空间布局（坐标即叙事）
 *
 * ```
 *        z = -32  街对面（书店的剪影，几扇还亮着的窗）
 *           ↑     雨落在这条街上方，只落在室外
 *        z = -20  书店正面
 *        z =  -9  落地玻璃窗 ← 玩家从出生点正对着看的就是它
 *        z = -7.5 窗边小桌（桌上的手机）
 *        z =   0  吧台在左手边，右侧两张空桌
 *        z =   8  玩家出生点（门口，背对着门与伞架）
 *        z =  10  后墙与门
 * ```
 *
 * 出生朝 `yaw = 0`，即朝 `-z`。这条视线上依次是：空桌 → 窗边小桌 →
 * 落地玻璃 → 雨 → 街对面的书店。**这是刻意的**：这一幕的全部信息
 * 都在那面玻璃上，「他在躲雨，外面在下雨，隔一条街是他待了一下午的书店」。
 * 把关闸的手机放在这条线上，玩家只要顺着看就走过去了。
 *
 * ## 为什么房间是封死的
 *
 * 四面墙都有碰撞体，玻璃也是墙。这不是偷懒——这一节的标题叫
 * 「再坐一会儿」，玩家唯一能做的事就是**待在店里**。如果玻璃能穿过去，
 * 雨就变成了布景而不是处境。
 *
 * ## 打烊前
 *
 * 全场只有三张桌子、几把椅子，其中一把是倒扣在桌面上的。
 * 空荡不靠"少放东西"实现，靠那把翻起来的椅子——它是这家店
 * 即将关门、而他还没走的唯一证据。
 */

/** 房间尺寸。多个部件要按它对齐，抽成常量避免两处各写一遍导致穿帮。 */
const ROOM = {
  /** 玻璃墙所在的 z */
  frontZ: -9,
  /** 后墙（门）所在的 z */
  backZ: 10,
  /** 侧墙的 x 绝对值 */
  halfWidth: 7,
  /** 层高 */
  height: 3.4,
} as const

/** 窗边小桌的落点。手机、代理球、碰撞体、吊灯四处都要用它，必须同源。 */
const TABLE_BY_WINDOW = { x: 0.4, z: -7.5, top: 0.72, collider: 1.0 } as const

/** 场景调色板。与项目既有的墨绿灰阶 + 琥珀强调色保持一致。 */
const PALETTE = {
  ground: 0x1b2422,
  /** 室外街道比室内更暗一档，玻璃两侧才有一道分界 */
  street: 0x0d1213,
  structure: 0x101619,
  /** 家具比结构稍亮，否则在暗墙前看不出体积 */
  furniture: 0x1e2929,
  glass: 0x9fb4b8,
  rain: 0x9fb0b4,
  accent: 0xc8a878,
} as const

export const coffeeShopScene: WorldScene = {
  id: 'coffee-shop',
  caption: '城南 · 咖啡店',
  /** 固定种子。同一片雨、同一批亮着的窗，每次进入都必须在同一处。 */
  seed: 0x5e9e02,

  build(runtime: SceneRuntime): WorldSceneHandle {
    const { three, root, random } = runtime

    /* ---------------- 材质 ---------------- */

    /**
     * 全场共用一组材质，理由与看台场景相同：剪影风里颜色本来就只有几种，
     * 每网格一份材质只会让回收时要释放的意外变多。
     */
    const materials = {
      ground: new three.MeshLambertMaterial({ color: PALETTE.ground }),
      street: new three.MeshLambertMaterial({ color: PALETTE.street }),
      structure: new three.MeshLambertMaterial({ color: PALETTE.structure }),
      furniture: new three.MeshLambertMaterial({ color: PALETTE.furniture }),
      /** 玻璃只是"有一点存在感"的存在：太实就看不见雨，太透就读不出这是窗 */
      glass: new three.MeshBasicMaterial({
        color: PALETTE.glass,
        transparent: true,
        opacity: 0.07,
        side: three.DoubleSide,
        depthWrite: false,
      }),
      /** 沿玻璃往下爬的水痕。静态即可，动它反而会让人盯着看 */
      streak: new three.MeshBasicMaterial({
        color: PALETTE.glass,
        transparent: true,
        opacity: 0.05,
        depthWrite: false,
      }),
      accent: new three.MeshBasicMaterial({ color: PALETTE.accent, transparent: true, opacity: 0.6 }),
      lamp: new three.MeshBasicMaterial({ color: PALETTE.accent }),
      /** 灯下的光锥。用极低透明度的一大块体积冒充"光洒下来"，比做体积光便宜得多 */
      beam: new three.MeshBasicMaterial({
        color: PALETTE.accent,
        transparent: true,
        opacity: 0.045,
        side: three.DoubleSide,
        depthWrite: false,
      }),
      rain: new three.LineBasicMaterial({
        color: PALETTE.rain,
        transparent: true,
        opacity: 0.26,
      }),
    }

    const colliders: Collider[] = []
    const occluders: import('three').Object3D[] = []

    /* ---------------- 地面 ---------------- */

    // 室内地板略高于室外街道，玻璃墙上那道半米高的矮墙才有立足点
    const floor = new three.Mesh(new three.BoxGeometry(ROOM.halfWidth * 2, 0.2, ROOM.backZ - ROOM.frontZ), materials.ground)
    floor.position.set(0, -0.1, (ROOM.backZ + ROOM.frontZ) / 2)
    root.add(floor)

    // 街道。往外多铺 20 米，让雾而不是建模去收边
    const street = new three.Mesh(new three.BoxGeometry(56, 0.2, 26), materials.street)
    street.position.set(0, -0.16, -21)
    root.add(street)

    /* ---------------- 围合（墙与玻璃） ---------------- */

    /**
     * 玻璃墙由三部分组成：矮墙、窗框、玻璃面。
     *
     * 为什么不做成一整块透明平面：完全透明的窗在第一人称里会让人
     * 分不清"外面在下雨"还是"我已经走出去了"。窗框负责给一层面内参照，
     * 矮墙负责给一个高度参照——玩家低头看见墙，才知道自己还在屋里。
     */
    const wallGroup = new three.Group()

    // 矮墙（窗台）：0.5m，正好是坐下时胳膊能搭的高度
    const sill = new three.Mesh(new three.BoxGeometry(ROOM.halfWidth * 2, 0.5, 0.3), materials.structure)
    sill.position.set(0, 0.25, ROOM.frontZ)
    wallGroup.add(sill)

    // 窗顶横梁，把立面封到层高
    const lintel = new three.Mesh(new three.BoxGeometry(ROOM.halfWidth * 2, ROOM.height - 3.1, 0.3), materials.structure)
    lintel.position.set(0, (3.1 + ROOM.height) / 2, ROOM.frontZ)
    wallGroup.add(lintel)

    // 竖棂。间隔 1.75m，是真实玻璃幕墙的模数，也刚好把"外面的雨"切成几段
    const mullionHeight = 3.1 - 0.5
    for (let i = 0; i <= 8; i += 1) {
      const x = -ROOM.halfWidth + (i * ROOM.halfWidth) / 4
      const mullion = new three.Mesh(new three.BoxGeometry(0.08, mullionHeight, 0.14), materials.structure)
      mullion.position.set(x, 0.5 + mullionHeight / 2, ROOM.frontZ)
      wallGroup.add(mullion)
    }
    // 一道横梁，把窗分成上下两段——上段给天光，下段给街景
    const transom = new three.Mesh(new three.BoxGeometry(ROOM.halfWidth * 2, 0.07, 0.12), materials.structure)
    transom.position.set(0, 2.1, ROOM.frontZ)
    wallGroup.add(transom)

    const glass = new three.Mesh(new three.PlaneGeometry(ROOM.halfWidth * 2, mullionHeight), materials.glass)
    glass.position.set(0, 0.5 + mullionHeight / 2, ROOM.frontZ)
    wallGroup.add(glass)

    /**
     * 玻璃上的水痕：几道随机的竖线。
     *
     * 原文那句「雨把玻璃窗打得模糊」只靠一面透明玻璃是表达不出来的——
     * 透明的东西看起来是干净的。几道淡痕花不掉几个面片，
     * 却能把"这面玻璃是湿的"钉在画面上。
     */
    for (let i = 0; i < 9; i += 1) {
      const length = random.range(0.5, 2.1)
      const streak = new three.Mesh(new three.PlaneGeometry(random.range(0.02, 0.05), length), materials.streak)
      streak.position.set(random.spread(0, 6.4), 3.1 - length / 2, ROOM.frontZ + 0.03)
      wallGroup.add(streak)
    }
    root.add(wallGroup)

    /** 侧墙与后墙。它们同时是碰撞体和遮挡体，所以只能建一次、两处共用。 */
    const walls: { x: number; z: number; halfX: number; halfZ: number }[] = [
      { x: 0, z: ROOM.frontZ, halfX: ROOM.halfWidth, halfZ: 0.15 },
      { x: 0, z: ROOM.backZ, halfX: ROOM.halfWidth, halfZ: 0.15 },
      { x: -ROOM.halfWidth, z: (ROOM.backZ + ROOM.frontZ) / 2, halfX: 0.15, halfZ: (ROOM.backZ - ROOM.frontZ) / 2 },
      { x: ROOM.halfWidth, z: (ROOM.backZ + ROOM.frontZ) / 2, halfX: 0.15, halfZ: (ROOM.backZ - ROOM.frontZ) / 2 },
    ]
    for (const w of walls) {
      const mesh = new three.Mesh(
        new three.BoxGeometry(w.halfX * 2, ROOM.height, w.halfZ * 2),
        materials.structure,
      )
      mesh.position.set(w.x, ROOM.height / 2, w.z)
      root.add(mesh)
      colliders.push({ kind: 'box', x: w.x, z: w.z, halfX: w.halfX, halfZ: w.halfZ })
      // 玻璃墙那面**不进** occluders：它是透明的，玩家要透过它
      // 看见雨和书店，把它交给遮挡判定会直接掐掉本场景最重要的那个热点视角。
      if (w.z !== ROOM.frontZ) occluders.push(mesh)
    }

    /* ---------------- 天花板与吊灯 ---------------- */

    /**
     * 加天花板是为了让室内的暗有来源。
     *
     * 没有它，抬头就是场景背景色，吊灯那点暖光会像悬在空气里；
     * 有了它，光有了落点，房间也从"地面上的几件家具"变成一个空间。
     */
    const ceiling = new three.Mesh(
      new three.BoxGeometry(ROOM.halfWidth * 2, 0.2, ROOM.backZ - ROOM.frontZ),
      materials.structure,
    )
    ceiling.position.set(0, ROOM.height, (ROOM.backZ + ROOM.frontZ) / 2)
    root.add(ceiling)
    occluders.push(ceiling)

    /**
     * 三盏吊灯。灯罩用纯色球体（不吃光），光锥用低透明度圆锥。
     *
     * 只给其中两盏挂真实点光：这一场景的光应该集中在
     * 「窗边那张桌」和「吧台」两处，第三盏亮着但不投光，
     * 于是画面里就有了"主次"——满场一样亮就不像打烊前了。
     */
    const lampPositions: [number, number, number][] = [
      [TABLE_BY_WINDOW.x, 2.75, TABLE_BY_WINDOW.z],
      [-5.3, 2.55, 1],
      [4.6, 2.55, -1.8],
    ]
    lampPositions.forEach(([x, y, z], index) => {
      const bulb = new three.Mesh(new three.SphereGeometry(0.075, 10, 8), materials.lamp)
      bulb.position.set(x, y, z)
      root.add(bulb)

      const cord = new three.Mesh(new three.CylinderGeometry(0.012, 0.012, ROOM.height - y, 4), materials.structure)
      cord.position.set(x, (ROOM.height + y) / 2, z)
      root.add(cord)

      const beam = new three.Mesh(new three.ConeGeometry(1.15, y, 12, 1, true), materials.beam)
      beam.position.set(x, y / 2, z)
      root.add(beam)

      if (index < 2) {
        const light = new three.PointLight(PALETTE.accent, index === 0 ? 7 : 5, 11, 2)
        light.position.set(x, y - 0.2, z)
        root.add(light)
      }
    })

    /* ---------------- 吧台 ---------------- */

    const counter = new three.Mesh(new three.BoxGeometry(1.0, 1.05, 7.6), materials.furniture)
    counter.position.set(-5.3, 0.525, 1.75)
    root.add(counter)
    colliders.push({ kind: 'box', x: -5.3, z: 1.75, halfX: 0.5, halfZ: 3.8 })
    occluders.push(counter)

    // 吧台后墙的架子与瓶子的剪影。只用方块，这个距离上形状比内容重要
    const shelf = new three.Mesh(new three.BoxGeometry(0.35, 2.2, 7.0), materials.structure)
    shelf.position.set(-6.7, 1.6, 1.75)
    root.add(shelf)
    for (let i = 0; i < 11; i += 1) {
      const bottle = new three.Mesh(
        new three.CylinderGeometry(0.045, 0.06, random.range(0.22, 0.4), 6),
        materials.structure,
      )
      bottle.position.set(-6.45, 0.95 + random.range(0, 0.05), -1.6 + i * 0.62)
      root.add(bottle)
    }
    // 台面上几只用过的杯子：说明这里刚才还有人，现在没了
    for (let i = 0; i < 3; i += 1) {
      const cup = new three.Mesh(new three.CylinderGeometry(0.04, 0.032, 0.09, 8), materials.furniture)
      cup.position.set(-5.3, 1.1, random.range(-2.2, 4.6))
      root.add(cup)
    }

    /* ---------------- 桌椅 ---------------- */

    /**
     * 一张桌 + 两把椅。做成局部函数是因为要摆三处，
     * 而倒扣的那把椅子必须和正着的椅子**同一套几何**——
     * 只有形状完全一致，"翻过来"才读得出来是同一把椅子。
     */
    const addChair = (x: number, z: number, facing: number) => {
      const chair = new three.Group()
      const seat = new three.Mesh(new three.BoxGeometry(0.42, 0.06, 0.42), materials.furniture)
      seat.position.y = 0.44
      const back = new three.Mesh(new three.BoxGeometry(0.42, 0.46, 0.05), materials.furniture)
      back.position.set(0, 0.69, -0.19)
      chair.add(seat, back)
      for (let i = 0; i < 4; i += 1) {
        const leg = new three.Mesh(new three.BoxGeometry(0.04, 0.44, 0.04), materials.furniture)
        leg.position.set(i % 2 ? 0.17 : -0.17, 0.22, i < 2 ? 0.17 : -0.17)
        chair.add(leg)
      }
      chair.position.set(x, 0, z)
      chair.rotation.y = facing
      root.add(chair)
      return chair
    }

    const addTableSet = (x: number, z: number, facing: number, flipChair: boolean) => {
      const top = new three.Mesh(new three.CylinderGeometry(0.5, 0.5, 0.06, 16), materials.furniture)
      top.position.set(x, TABLE_BY_WINDOW.top, z)
      const column = new three.Mesh(new three.CylinderGeometry(0.06, 0.06, 0.7, 8), materials.structure)
      column.position.set(x, 0.35, z)
      const foot = new three.Mesh(new three.CylinderGeometry(0.3, 0.3, 0.04, 12), materials.structure)
      foot.position.set(x, 0.02, z)
      root.add(top, column, foot)

      addChair(x + Math.sin(facing) * 1.0, z + Math.cos(facing) * 1.0, facing + Math.PI)
      const other = addChair(x - Math.sin(facing) * 1.0, z - Math.cos(facing) * 1.0, facing)
      // 倒扣：绕 x 轴翻 180° 后落到桌面上。位置要按桌面高度补回椅子的自身高度，
      // 否则椅子会埋进桌面里——旋转改变的是几何朝向，不改变原点在哪。
      if (flipChair) {
        other.rotation.z = Math.PI
        other.position.y = TABLE_BY_WINDOW.top + 0.92
      }

      colliders.push({ kind: 'cylinder', x, z, radius: TABLE_BY_WINDOW.collider })
    }

    // 窗边那张。facing = 0 表示椅子沿 +z 摆，即**背对窗、面向屋里**——
    // 他是坐在这里看雨的，不该背对着雨。
    addTableSet(TABLE_BY_WINDOW.x, TABLE_BY_WINDOW.z, 0, false)
    // 右边两张空桌；靠里那张已经翻了椅子
    addTableSet(4.6, -4.2, Math.PI / 2, true)
    addTableSet(4.6, 0.6, -Math.PI / 2, false)

    /* ---------------- 门与伞架 ---------------- */

    // 门。做得比周围更暗，因为外面更暗——打烊前，门是一块黑
    const door = new three.Mesh(new three.BoxGeometry(1.5, 2.6, 0.12), new three.MeshLambertMaterial({ color: 0x0b0f10 }))
    door.position.set(2.6, 1.3, ROOM.backZ - 0.12)
    root.add(door)

    /**
     * 门边的伞架。
     *
     * 这是全场唯一会让人"回头"的东西，而它的位置是刻意的：
     * 玩家出生朝向是 `-z`，伞架在背后。要看见它就必须转身——
     * 那一刻玩家会意识到自己是从雨里进来的，而这个转身
     * 正好把人从"我要去找手机"拉回到"我为什么会在这里"。
     */
    const rack = new three.Group()
    const bucket = new three.Mesh(
      new three.CylinderGeometry(0.3, 0.26, 0.52, 10, 1, true),
      new three.MeshLambertMaterial({ color: PALETTE.structure, side: three.DoubleSide }),
    )
    bucket.position.y = 0.26
    rack.add(bucket)
    for (let i = 0; i < 3; i += 1) {
      const umbrella = new three.Mesh(new three.CylinderGeometry(0.022, 0.022, 1.05, 5), materials.furniture)
      const angle = (i / 3) * Math.PI * 2
      umbrella.position.set(Math.cos(angle) * 0.15, 0.62, Math.sin(angle) * 0.15)
      umbrella.rotation.set(Math.sin(angle) * 0.22, 0, -Math.cos(angle) * 0.22)
      rack.add(umbrella)
    }
    rack.position.set(4.0, 0, 8.6)
    root.add(rack)
    colliders.push({ kind: 'cylinder', x: 4.0, z: 8.6, radius: 0.35 })

    /* ---------------- 街对面：书店 ---------------- */

    /**
     * 街对面只做一件事：给出"对面还开着"的证据。
     *
     * 不建整条街、不做招牌、不做树——20 米外隔着雨，玩家能读到的
     * 只有一个方块体量和几扇亮着的窗。亮窗用暖色，与店里的手机同色，
     * 于是画面里唯一的两种亮色互相解释：他在那边待了一下午，
     * 现在坐在这边看着它。
     */
    const bookstore = new three.Mesh(new three.BoxGeometry(26, 9, 8), materials.structure)
    bookstore.position.set(-2, 4.5, -24)
    root.add(bookstore)
    // 一楼门洞，比窗户更暗
    const doorway = new three.Mesh(new three.BoxGeometry(2.4, 3.0, 0.2), new three.MeshLambertMaterial({ color: 0x0b0f10 }))
    doorway.position.set(-2, 1.5, -19.9)
    root.add(doorway)

    for (let i = 0; i < 7; i += 1) {
      // 亮的窗比不亮的少：打烊前的街对面，只该剩几盏
      if (!random.chance(0.55)) continue
      const pane = new three.Mesh(new three.PlaneGeometry(random.range(1.1, 1.6), random.range(1.3, 1.9)), materials.accent)
      pane.position.set(-11 + i * 3.2, random.range(2.6, 5.4), -19.9)
      root.add(pane)
    }

    // 路灯。雨丝只在暗背景上看得见，所以这道光同时也在照亮雨
    const lampPost = new three.Mesh(new three.CylinderGeometry(0.09, 0.12, 7, 6), materials.structure)
    lampPost.position.set(5.5, 3.5, -14)
    root.add(lampPost)
    const lampHead = new three.Mesh(new three.SphereGeometry(0.22, 8, 6), materials.lamp)
    lampHead.position.set(5.5, 7.1, -14)
    root.add(lampHead)
    const lampHalo = new three.Mesh(new three.SphereGeometry(1.3, 10, 8), materials.beam)
    lampHalo.position.set(5.5, 7.1, -14)
    root.add(lampHalo)

    // 街面上的积水。浅盘 + 琥珀反光，与看台场景同一套手法
    for (let i = 0; i < 5; i += 1) {
      const puddle = new three.Mesh(new three.CircleGeometry(random.range(1.4, 3.2), 14), materials.accent)
      puddle.rotation.x = -Math.PI / 2
      puddle.position.set(random.spread(0, 16), -0.05, random.range(-30, -11))
      root.add(puddle)
    }

    /* ---------------- 雨 ---------------- */

    /**
     * 用线段而不是粒子点。
     *
     * 雨在照片里的特征是一条**方向一致的短划**，点精灵做不出拉长的形状，
     * 而用一个 300 根线段的 LineSegments，一次 draw call 就能拿到
     * 「很多条朝同一方向斜落的短线」。这个场景要的就是那个质感。
     *
     * 雨的 z 范围严格锁在玻璃之外（`z <= frontZ - 0.4`）：
     * 只要有一根雨丝落进屋里，"躲雨"这件事就不成立了。
     */
    const DROPS = 320
    const RAIN = { span: 16, x: 22, zNear: ROOM.frontZ - 0.4, zFar: -32, wind: 0.18 } as const

    const rainBase = new Float32Array(DROPS * 3)
    const rainSpeed = new Float32Array(DROPS)
    const rainLength = new Float32Array(DROPS)
    for (let i = 0; i < DROPS; i += 1) {
      rainBase[i * 3] = random.spread(0, RAIN.x)
      // y 的初值铺满整个高度区间，否则雨会像一块下落的板
      rainBase[i * 3 + 1] = random.range(0, RAIN.span)
      rainBase[i * 3 + 2] = random.range(RAIN.zFar, RAIN.zNear)
      rainSpeed[i] = random.range(9, 16)
      rainLength[i] = random.range(0.22, 0.5)
    }

    const rainPositions = new Float32Array(DROPS * 6)
    const rainAttribute = new three.BufferAttribute(rainPositions, 3)
    // 每帧都要重写，声明成动态用法让驱动不要把它放在只读的显存路径上
    rainAttribute.setUsage(three.DynamicDrawUsage)
    const rainGeometry = new three.BufferGeometry()
    rainGeometry.setAttribute('position', rainAttribute)
    const rain = new three.LineSegments(rainGeometry, materials.rain)
    // 雨横跨半个场景，包围球按实际范围给，否则会被视锥体提前剔掉
    rain.frustumCulled = false
    root.add(rain)

    /**
     * 每帧从 `elapsed` 直接算出雨丝位置，而不是逐帧累加位移。
     *
     * 累加会随掉帧产生漂移，且一旦宿主暂停再恢复，雨会"跳"一下；
     * 由时间直接求值则与帧率完全无关，暂停后接着放也不会错位。
     */
    const stepRain = (elapsed: number) => {
      for (let i = 0; i < DROPS; i += 1) {
        const baseY = rainBase[i * 3 + 1] - elapsed * rainSpeed[i]
        // JS 的 % 对负数返回负值，这里要的是循环取模
        const y = ((baseY % RAIN.span) + RAIN.span) % RAIN.span
        const x = rainBase[i * 3] + y * RAIN.wind
        const z = rainBase[i * 3 + 2]
        const length = rainLength[i]

        rainPositions[i * 6] = x
        rainPositions[i * 6 + 1] = y
        rainPositions[i * 6 + 2] = z
        rainPositions[i * 6 + 3] = x - length * RAIN.wind
        rainPositions[i * 6 + 4] = y - length
        rainPositions[i * 6 + 5] = z
      }
      rainAttribute.needsUpdate = true
    }
    stepRain(0)

    /* ---------------- 桌上的手机：本场景唯一的闸门 ---------------- */

    /**
     * 手机是这一节的**全部**。
     *
     * 原文里推进剧情的不是某个动作，而是一条只有一个字的回复；
     * 所以可交互的对象必须是一部躺着的手机，而不是一个人、一扇门。
     * 玩家点它的那一刻，等于承认了自己正盯着屏幕看。
     */
    const phone = new three.Group()
    const shell = new three.Mesh(new three.BoxGeometry(0.075, 0.012, 0.15), materials.structure)
    const screen = new three.Mesh(
      new three.PlaneGeometry(0.065, 0.135),
      new three.MeshBasicMaterial({ color: PALETTE.accent, transparent: true, opacity: 0.3 }),
    )
    screen.rotation.x = -Math.PI / 2
    screen.position.y = 0.007

    /**
     * 屏幕亮起时往桌面上打一小片光。
     *
     * 这是全场唯一的"动态光源"，也是玩家在房间另一头唯一可能注意到的东西——
     * 一盏不动的灯只会被当成布景，一盏会闪的灯会让人走过去。
     * 距离与衰减都给得很小，避免把整张桌子照成一块白斑。
     */
    const phoneGlow = new three.PointLight(PALETTE.accent, 1.4, 2.4, 2)
    phoneGlow.position.set(0, 0.06, 0)
    phone.add(shell, screen, phoneGlow)
    phone.position.set(TABLE_BY_WINDOW.x, TABLE_BY_WINDOW.top + 0.033, TABLE_BY_WINDOW.z + 0.16)
    // 微微侧向屋里，玩家从房间中间走过来正好看到屏幕而不是手机背面
    phone.rotation.y = 0.34
    root.add(phone)

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

    /**
     * 热点挂在一个不可见的球上，而不是手机本身。
     *
     * 手机只有巴掌大，在 1.5 米外射线打中的概率低得让人恼火；
     * 用一个球把手机连同它周围一小圈桌面包起来，拾取窗口就变成了
     * "这张桌子上他放手机的地方"——玩家想的本来也是那里，
     * 而不是那个 7.5 厘米宽的机身。
     *
     * 球用 `material.visible = false` 而不是 `mesh.visible = false`：
     * 后者会让射线直接跳过它，而我们要的是"看不见但点得到"。
     */
    const phoneProxy = new three.Mesh(
      new three.SphereGeometry(0.6, 10, 8),
      new three.MeshBasicMaterial({ visible: false }),
    )
    phoneProxy.position.set(TABLE_BY_WINDOW.x, TABLE_BY_WINDOW.top + 0.3, TABLE_BY_WINDOW.z)
    root.add(phoneProxy)

    hotspots.push({
      id: 'phone-on-table',
      object: phoneProxy,
      label: '桌上的手机亮了一下',
      /**
       * 2.4 米，且是**从眼睛量起的三维距离**。
       *
       * 手机躺在 0.75 米高的桌面上，眼高 1.68 米——光是这 0.93 米的
       * 高度差就吃掉了大半额度。桌子的碰撞体半径 1.0 米挡住玩家，
       * 站定时眼睛到手机实测约 1.5 米，所以 2.4 留出的余量其实很窄：
       * 刚好要求玩家走到桌边，但不要求他精确站定。
       */
      reach: 2.4,
      onActivate: () => {
        // 点开手机就等于读过那条回复，闸门在这里关闭，故事才允许分叉
        satisfyGate()
        return true
      },
    })

    /* ---------------- 返回 ---------------- */

    return {
      colliders,
      occluders,
      hotspots,
      /**
       * 宿主注册闸门监听。
       *
       * 契约要求宿主在赋值时若闸门**已经**满足过会拿不到通知，
       * 所以这里主动补发一次——玩家可能一进门就直奔窗边点了手机，
       * 之后宿主才完成挂载，那种顺序下缺了补发就会一直停在"等待探索"。
       */
      set onGateSatisfied(callback: () => void) {
        notifyGate = callback
        if (gateSatisfied) callback()
      },
      update(elapsed, _delta, player) {
        stepRain(elapsed)

        /**
         * 屏幕的呼吸。周期压到 3 秒多一点，比人的呼吸略慢——
         * 太快像通知提醒，太慢就注意不到了。
         *
         * 点过之后转为常亮：那条只有两个字的回复一旦被看见，
         * 就该一直亮着，它不再是"有什么东西在闪"，而是"他知道了"。
         */
        const breath = 0.5 + 0.5 * Math.sin(elapsed * 1.85)
        const screenMaterial = screen.material as import('three').MeshBasicMaterial
        screenMaterial.opacity = gateSatisfied ? 0.92 : 0.16 + breath * 0.6
        phoneGlow.intensity = gateSatisfied ? 6 : 1.2 + breath * 3.4

        /**
         * 玩家靠近时雨丝略微变亮。
         *
         * 借的是「看得越久，雨越大」这个错觉：玻璃在眼前放大，
         * 雨自然也"近"了。这一手法与看台场景里水洼随距离变亮同源，
         * 都是让静止的布景对玩家的位置有反应。
         */
        const distanceToWindow = Math.abs(player.z - ROOM.frontZ)
        materials.rain.opacity = 0.22 + Math.max(0, 1 - distanceToWindow / 18) * 0.2
      },
      resize() {
        // 这个场景的布景全部按米摆放、与宽高比无关；雨也不随相机拉伸，无需响应
      },
    }
  },
}
