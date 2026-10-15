import type { Collider, Hotspot, SceneRuntime, WorldScene, WorldSceneHandle } from '../types'

/**
 * 场景「咸阳机场 · 行李转盘」——第三幕的落点，也是全故事第二次出现闸门。
 *
 * ## 空间布局（坐标即叙事）
 *
 * ```
 *        z =  34  玻璃门（门外是夜，没有一个人）
 *        ↑
 *        z =  20  三号行李转盘（空的，还在转）
 *        z =  23  那堆行李（他到这儿就不再往前走了）
 *        z =   8  玩家出生点，朝 +z
 *        z =  -8  他来时走过的到达通道
 * ```
 *
 * 出生朝 `yaw = π`，即朝 `+z`。这条视线上依次是：空转盘 → 玻璃门 → 夜。
 * **这是刻意的**：机场是这一场里唯一一个"有明确出口"的空间，
 * 而他停在了转盘旁边那堆行李前，没有走向那扇门。
 *
 * ## 为什么全场没有一个人
 *
 * 原文里她说会来接他，然后没有来。「没有人接」不能靠"少放几个人"表达——
 * 少放几个人读出来只是"这个厅很大"。所以整个厅里**一个人都没有**：
 * 只有连排的空座椅、空的到达口、空的转盘。
 * 玩家是这里唯一还在原地的东西。
 *
 * 顺带一个副产品：调色板里唯一的高亮色（`0xe8e4da`，第一幕给白裙子的那个）
 * 在这里被让给了头顶那几盏惨白的灯。全场没有一张脸可以承接它。
 *
 * ## 两件"还在运转"的东西
 *
 * 转盘在转，灯亮着，门自己开合——这个系统还在为别人正常工作，
 * 只是不再为他停留。所以转盘必须**一直转**：它空着却不停，
 * 才是这一场最准确的比喻。
 */

/** 大厅尺寸。多个部件按它对齐，抽成常量避免两处各写一遍导致穿帮。 */
const HALL = {
  /** 到达通道那头的墙 */
  backZ: -8,
  /** 玻璃门所在的 z */
  frontZ: 34,
  /** 侧墙的 x 绝对值 */
  halfWidth: 16,
  /** 层高。比前两个室内场景高一倍——机场的空是从头顶来的 */
  height: 6.2,
} as const

/** 三号转盘。带面、岛上、碰撞体、代理球四处都要用它，必须同源。 */
const CAROUSEL = { x: 0, z: 20, islandRadius: 4.0, beltOuter: 5.4, beltTop: 0.46 } as const

/** 那堆行李。行李、手机、碰撞体、代理球四处共用，写错任何一处都会穿帮。 */
const PILE = { x: 7.4, z: 23.5, collider: 1.8 } as const

/** 场景调色板。沿用墨绿灰阶 + 琥珀强调色。 */
const PALETTE = {
  /** 机场地面是光洁的，取灰阶里最亮的一档 */
  ground: 0x1e2929,
  /** 门外那条街比厅里暗得多，玻璃两侧才有一道分界 */
  night: 0x0d1213,
  structure: 0x101619,
  furniture: 0x1e2929,
  glass: 0x9fb4b8,
  /** 惨白的顶灯。之所以敢用高亮色，是因为全场没有第二样东西配得上它 */
  ceilingLight: 0xe8e4da,
  accent: 0xc8a878,
} as const

export const airportScene: WorldScene = {
  id: 'airport',
  caption: '咸阳机场 · 行李转盘',
  /** 固定种子。同一堆行李、同一批还亮着的灯，每次进入都必须在同一处。 */
  seed: 0x5e9e0b,

  build(runtime: SceneRuntime): WorldSceneHandle {
    const { three, root, random } = runtime

    /* ---------------- 材质 ---------------- */

    /**
     * 全场共用一组材质，理由与前两个场景相同：剪影风里颜色本来就只有几种，
     * 每网格一份材质只会让回收时要释放的意外变多。
     */
    const materials = {
      ground: new three.MeshLambertMaterial({ color: PALETTE.ground }),
      night: new three.MeshLambertMaterial({ color: PALETTE.night }),
      structure: new three.MeshLambertMaterial({ color: PALETTE.structure }),
      furniture: new three.MeshLambertMaterial({ color: PALETTE.furniture }),
      /**
       * 玻璃给得比咖啡店那面还淡（0.04）。
       *
       * 那一场玻璃上要有雨痕，这一场玻璃是干净的、什么都挡不住的：
       * 门外那条夜街必须看得清清楚楚，因为"外面没有人"才是这一场的落点。
       */
      glass: new three.MeshBasicMaterial({
        color: PALETTE.glass,
        transparent: true,
        opacity: 0.04,
        side: three.DoubleSide,
        depthWrite: false,
      }),
      /** 顶灯灯面。用高亮色 + 不吃光，于是它是画面里唯一的白 */
      ceilingLight: new three.MeshBasicMaterial({ color: PALETTE.ceilingLight }),
      /** 灯下的光斑。低透明度的一大片，比做体积光便宜得多 */
      glow: new three.MeshBasicMaterial({
        color: PALETTE.ceilingLight,
        transparent: true,
        opacity: 0.035,
        side: three.DoubleSide,
        depthWrite: false,
      }),
      accent: new three.MeshBasicMaterial({ color: PALETTE.accent, transparent: true, opacity: 0.6 }),
    }

    const colliders: Collider[] = []
    const occluders: import('three').Object3D[] = []

    /* ---------------- 地面 ---------------- */

    const floor = new three.Mesh(
      new three.BoxGeometry(HALL.halfWidth * 2, 0.2, HALL.frontZ - HALL.backZ),
      materials.ground,
    )
    floor.position.set(0, -0.1, (HALL.frontZ + HALL.backZ) / 2)
    root.add(floor)

    // 门外那条街。往外多铺 20 米，让雾而不是建模去收边
    const outside = new three.Mesh(new three.BoxGeometry(60, 0.2, 24), materials.night)
    outside.position.set(0, -0.16, HALL.frontZ + 12)
    root.add(outside)

    /* ---------------- 围合（墙与玻璃门） ---------------- */

    /**
     * 玻璃门那面由门垛、门框、玻璃组成，与前两个场景同一套手法。
     *
     * 但这里多了一点：**中间那两扇门是开着的**（用的是同一块玻璃材质，
     * 只是位置分开了）。一扇关着的玻璃门会读成"你还出不去"，
     * 而这一场的处境恰恰是他**随时可以走，只是没有走**——
     * 门必须是真的开着的，停在行李旁边才是一个选择而不是一次被困。
     */
    const glassWall = new three.Group()
    const doorFrameHeight = 2.8

    // 两侧门垛：把门洞夹出来，也给玻璃一个端点
    for (const side of [-1, 1]) {
      const pier = new three.Mesh(
        new three.BoxGeometry(HALL.halfWidth - 1.8, doorFrameHeight, 0.4),
        materials.structure,
      )
      pier.position.set(side * (1.8 + (HALL.halfWidth - 1.8) / 2), doorFrameHeight / 2, HALL.frontZ)
      glassWall.add(pier)
    }
    // 门楣，把门洞以上的立面封到层高
    const lintel = new three.Mesh(
      new three.BoxGeometry(HALL.halfWidth * 2, HALL.height - doorFrameHeight, 0.4),
      materials.structure,
    )
    lintel.position.set(0, (doorFrameHeight + HALL.height) / 2, HALL.frontZ)
    glassWall.add(lintel)

    // 两扇推开的门：分立在门洞两侧，各自斜开 70°——很轻，谁都能过
    for (const side of [-1, 1]) {
      const leaf = new three.Mesh(new three.PlaneGeometry(1.7, doorFrameHeight), materials.glass)
      leaf.position.set(side * 1.6, doorFrameHeight / 2, HALL.frontZ - 0.35)
      leaf.rotation.y = side * (Math.PI / 2) * 0.78
      glassWall.add(leaf)
    }

    root.add(glassWall)

    /**
     * 侧墙、后墙，以及玻璃面本身。
     *
     * 玻璃面**单独**做一层碰撞体：它不遮挡视线（不进 occluders），
     * 但必须挡住玩家——否则玩家会走到门外的夜街里，
     * 而这一场要他站在厅里。
     */
    const walls: { x: number; z: number; halfX: number; halfZ: number }[] = [
      { x: 0, z: HALL.backZ, halfX: HALL.halfWidth, halfZ: 0.2 },
      { x: -HALL.halfWidth, z: (HALL.frontZ + HALL.backZ) / 2, halfX: 0.2, halfZ: (HALL.frontZ - HALL.backZ) / 2 },
      { x: HALL.halfWidth, z: (HALL.frontZ + HALL.backZ) / 2, halfX: 0.2, halfZ: (HALL.frontZ - HALL.backZ) / 2 },
    ]
    for (const w of walls) {
      const mesh = new three.Mesh(new three.BoxGeometry(w.halfX * 2, HALL.height, w.halfZ * 2), materials.structure)
      mesh.position.set(w.x, HALL.height / 2, w.z)
      root.add(mesh)
      colliders.push({ kind: 'box', x: w.x, z: w.z, halfX: w.halfX, halfZ: w.halfZ })
      occluders.push(mesh)
    }

    // 玻璃门那面：只有碰撞体，没有遮挡体——玩家得看得见外面的夜
    colliders.push({ kind: 'box', x: 0, z: HALL.frontZ, halfX: HALL.halfWidth, halfZ: 0.2 })

    /* ---------------- 天花板与惨白的顶灯 ---------------- */

    const ceiling = new three.Mesh(
      new three.BoxGeometry(HALL.halfWidth * 2, 0.3, HALL.frontZ - HALL.backZ),
      materials.structure,
    )
    ceiling.position.set(0, HALL.height, (HALL.frontZ + HALL.backZ) / 2)
    root.add(ceiling)
    occluders.push(ceiling)

    /**
     * 顶灯排成两列一直铺到玻璃门那头。
     *
     * 为什么用**两列长排**而不是几盏孤灯：机场的惨白是"均匀到没有层次"的，
     * 灯越是成排、越是没有明暗变化，那种"这里不针对任何人"的感觉越准。
     * 只有转盘上方空出一格——那一格的黑是留给玩家的。
     */
    const lampPositions: [number, number, number][] = []
    for (const x of [-8.5, 8.5]) {
      for (let i = 0; i < 4; i += 1) {
        lampPositions.push([x, HALL.height - 0.18, -2 + i * 11])
      }
    }
    lampPositions.forEach(([x, y, z], index) => {
      const panel = new three.Mesh(new three.PlaneGeometry(3.6, 1.5), materials.ceilingLight)
      // 灯面朝下
      panel.rotation.x = Math.PI / 2
      panel.position.set(x, y, z)
      root.add(panel)

      const halo = new three.Mesh(new three.PlaneGeometry(9, 7), materials.glow)
      halo.rotation.x = Math.PI / 2
      halo.position.set(x, y - 0.05, z)
      root.add(halo)

      // 只给前四盏真实点光：够照亮地面与那堆行李，又不至于把整个厅算成白天。
      // 强度刻意压得比咖啡店的吊灯（7）还低一档——这一场的光是"惨白"而不是"暖亮"，
      // 玩家读出的应该是"灯很多，但没有一盏在照我"。
      if (index < 4) {
        const light = new three.PointLight(PALETTE.ceilingLight, 6, 22, 2)
        light.position.set(x, y - 0.4, z)
        root.add(light)
      }
    })

    /* ---------------- 立柱 ---------------- */

    /**
     * 四根柱子。它们不承担叙事，只承担**尺度**——
     * 一个空旷的大厅若没有可以走过去的东西，玩家读不出它有多大，
     * 而"大而空"正是这一场要的。
     */
    for (const x of [-11, 11]) {
      for (const z of [10, 27]) {
        const column = new three.Mesh(
          new three.CylinderGeometry(0.55, 0.62, HALL.height, 12),
          materials.structure,
        )
        column.position.set(x, HALL.height / 2, z)
        root.add(column)
        colliders.push({ kind: 'cylinder', x, z, radius: 0.7 })
        occluders.push(column)
      }
    }

    /* ---------------- 三号转盘 ---------------- */

    /**
     * 转盘由三部分组成：中央岛、带面、以及带面上那一圈会转的挡条。
     *
     * 为什么一定要那圈挡条：一个空转盘如果只是"一个空的环"，
     * 玩家根本看不出它在转——**空**抹掉了运动的参照物。
     * 一圈低矮的挡条是转盘唯一还在动、也还在为你转的证据，
     * 而它上面什么都没有，这就是这一场最准确的那句话。
     */
    const carousel = new three.Group()

    const island = new three.Mesh(
      new three.CylinderGeometry(CAROUSEL.islandRadius, CAROUSEL.islandRadius, 0.5, 32),
      materials.structure,
    )
    island.position.y = 0.25
    carousel.add(island)

    const belt = new three.Mesh(
      new three.RingGeometry(CAROUSEL.islandRadius, CAROUSEL.beltOuter, 40),
      materials.furniture,
    )
    belt.rotation.x = -Math.PI / 2
    belt.position.y = CAROUSEL.beltTop
    carousel.add(belt)

    /**
     * 会转的那一圈挡条。18 根均匀分布，用固定种子做一点点错位——
     * 完全等距会读成机器，轻微不均才像一条真的用旧了的传送带。
     */
    const SLATS = 18
    const beltSlats = new three.Group()
    const slatRadius = (CAROUSEL.islandRadius + CAROUSEL.beltOuter) / 2
    for (let i = 0; i < SLATS; i += 1) {
      const angle = (i / SLATS) * Math.PI * 2 + random.swing(0.03)
      const slat = new three.Mesh(
        new three.BoxGeometry(0.16, 0.05, CAROUSEL.beltOuter - CAROUSEL.islandRadius - 0.1),
        materials.structure,
      )
      slat.position.set(Math.cos(angle) * slatRadius, CAROUSEL.beltTop + 0.03, Math.sin(angle) * slatRadius)
      // 挡条沿半径方向铺，所以要转到与半径对齐
      slat.rotation.y = -angle
      beltSlats.add(slat)
    }
    carousel.add(beltSlats)

    carousel.position.set(CAROUSEL.x, 0, CAROUSEL.z)
    root.add(carousel)

    /**
     * 转盘一个圆柱碰撞体就够，不要逐段建。
     *
     * 半径取 `beltOuter` 而不是 `islandRadius`：玩家不该踩上传送带。
     * 他只能绕着它走——这正是这一场要的，"我围着它转了半圈，
     * 上面没有一件是我的"。
     */
    colliders.push({ kind: 'cylinder', x: CAROUSEL.x, z: CAROUSEL.z, radius: CAROUSEL.beltOuter + 0.2 })
    occluders.push(island)

    /* ---------------- 那堆行李 ---------------- */

    /**
     * 行李堆成四层，越往上越小。
     *
     * 尺寸与角度全部走固定种子，于是同一份种子每次堆出来的是**同一座山**——
     * 它必须是同一堆，因为它是这一场里唯一属于他的东西。
     *
     * 用四层而不是随意撒一地：原文说的是"一堆行李落在一起，像一座小山"，
     * 而"小山"的形状是有层次的，散一地就成了"行李还没拿完"。
     */
    const pile = new three.Group()
    const PILE_LAYERS = [
      { count: 6, radius: 0.95, y: 0.17 },
      { count: 5, radius: 0.72, y: 0.46 },
      { count: 4, radius: 0.5, y: 0.73 },
      { count: 3, radius: 0.34, y: 0.96 },
    ]

    for (const layer of PILE_LAYERS) {
      for (let i = 0; i < layer.count; i += 1) {
        const angle = (i / layer.count) * Math.PI * 2 + random.swing(0.5)
        const width = random.range(0.42, 0.72)
        const height = random.range(0.24, 0.36)
        const depth = random.range(0.3, 0.46)

        // 最外圈偶尔用结构色：一堆行李里总要有一两件是深色的，
        // 全是同一个灰度就成了一块没有信息的方盒子
        const material = random.chance(0.3) ? materials.structure : materials.furniture
        const caseMesh = new three.Mesh(new three.BoxGeometry(width, height, depth), material)
        caseMesh.position.set(
          Math.cos(angle) * layer.radius,
          layer.y,
          Math.sin(angle) * layer.radius,
        )
        caseMesh.rotation.y = angle + random.swing(0.6)
        pile.add(caseMesh)
      }
    }

    /**
     * 顶上那一件：他自己的箱子，斜着搁着。
     *
     * 单独的、歪的、暴露在最高处的一件，是整座山的"我"——
     * 其余几件都是随便落的，只有它是被特意放稳的。
     * 上面挂一条琥珀色的行李牌，全场只有这一点和手机是暖色。
     */
    const ownCase = new three.Mesh(new three.BoxGeometry(0.7, 0.34, 0.44), materials.furniture)
    ownCase.position.set(0.06, 1.28, -0.04)
    ownCase.rotation.set(0.06, 0.42, -0.05)
    pile.add(ownCase)

    const tag = new three.Mesh(new three.PlaneGeometry(0.11, 0.05), materials.accent)
    tag.position.set(0.3, 1.28, 0.2)
    tag.rotation.set(-Math.PI / 2, 0.4, 0)
    pile.add(tag)

    pile.position.set(PILE.x, 0, PILE.z)
    root.add(pile)

    // 一个圆柱碰撞体。半径给到 1.8 米：玩家会停在离箱子约一个身位的地方，
    // 那是站着看一件东西时会站的位置，而不是贴上去。
    colliders.push({ kind: 'cylinder', x: PILE.x, z: PILE.z, radius: PILE.collider })

    /* ---------------- 手机 ---------------- */

    /**
     * 手机搁在最下面一层的箱子上，屏幕朝上。
     *
     * 位置是刻意的：它**不在他手上**，而在那堆行李上面。
     * 也就是说他刚把箱子放下、掏出过手机、然后又放下了。
     * 玩家要在行李旁边才看得见它——那正是他站了很久的那个位置。
     */
    const phone = new three.Group()
    const shell = new three.Mesh(new three.BoxGeometry(0.075, 0.012, 0.15), materials.structure)
    const screen = new three.Mesh(
      new three.PlaneGeometry(0.063, 0.132),
      new three.MeshBasicMaterial({ color: PALETTE.accent, transparent: true, opacity: 0.2 }),
    )
    screen.rotation.x = -Math.PI / 2
    screen.position.y = 0.007

    /**
     * 屏幕的光往那堆箱子上打一小片。
     *
     * 与咖啡店那部手机同一个手法：一盏会亮的东西是玩家在厅里唯一
     * 可能注意到的动态光源。距离与衰减都给得极小，
     * 免得在惨白的顶灯下多出一块说不清的暖斑。
     */
    const phoneGlow = new three.PointLight(PALETTE.accent, 1.2, 2.2, 2)
    phoneGlow.position.set(0, 0.05, 0)
    phone.add(shell, screen, phoneGlow)
    phone.position.set(0.5, 0.4, 0.42)
    // 微微侧向玩家走来的方向，走过去正好看到屏幕而不是手机背面
    phone.rotation.y = 2.6
    pile.add(phone)

    /* ---------------- 连排空座椅 ---------------- */

    /**
     * 到达口的连排座椅，一把都没坐。
     *
     * 为什么不干脆不放：空座椅是"这里本可以有人在"的唯一说法。
     * 一个只有转盘和柱子的厅只是一个物流空间，加上座椅它才变成一个
     * 有人等过人的地方——而今天没有。
     */
    const addBenchRow = (x: number, z: number) => {
      const beam = new three.Mesh(new three.BoxGeometry(0.5, 0.08, 6.4), materials.structure)
      beam.position.set(x, 0.42, z)
      root.add(beam)

      for (let i = 0; i < 5; i += 1) {
        const seat = new three.Mesh(new three.BoxGeometry(0.48, 0.06, 0.6), materials.furniture)
        seat.position.set(x, 0.48, z - 2.6 + i * 1.3)
        root.add(seat)
        const back = new three.Mesh(new three.BoxGeometry(0.06, 0.4, 0.6), materials.furniture)
        back.position.set(x + 0.22, 0.7, z - 2.6 + i * 1.3)
        root.add(back)
      }
      colliders.push({ kind: 'box', x: x + 0.1, z, halfX: 0.45, halfZ: 3.2 })
    }
    addBenchRow(-9.5, 15)
    addBenchRow(-9.5, 24)

    /* ---------------- 到达通道（他来的那一边） ---------------- */

    /**
     * 后墙上的通道口。
     *
     * 它**不在出生朝向上**（出生朝 +z），玩家必须回头。
     * 与咖啡店门口的伞架是同一个手法：回头这个动作本身就是内容——
     * 他刚从那里走出来，而那里已经没有回去的意义了。
     */
    const tunnel = new three.Mesh(
      new three.BoxGeometry(6, 2.9, 0.3),
      new three.MeshLambertMaterial({ color: 0x0b0f10 }),
    )
    tunnel.position.set(0, 1.45, HALL.backZ + 0.25)
    root.add(tunnel)

    // 通道口两侧的护栏：只有被拦起来的地方才叫"到达口"
    for (const side of [-1, 1]) {
      const rail = new three.Mesh(new three.BoxGeometry(0.06, 0.9, 4.5), materials.structure)
      rail.position.set(side * 3.6, 0.85, HALL.backZ + 2.4)
      root.add(rail)
      colliders.push({ kind: 'box', x: side * 3.6, z: HALL.backZ + 2.4, halfX: 0.15, halfZ: 2.25 })
    }

    /* ---------------- 门外的夜 ---------------- */

    /**
     * 门外只做三件事：一条空街、一排还在亮的路灯、几辆停着的车。
     *
     * 刻意**不放任何人**。机场门外本该是接机的人最多的地方——
     * 一群人举着牌子朝里面张望。把这里清空，比任何一句台词都直接。
     */
    const terminalOutside = new three.Mesh(new three.BoxGeometry(46, 9, 6), materials.structure)
    terminalOutside.position.set(0, 4.5, HALL.frontZ + 9)
    root.add(terminalOutside)

    // 路灯：一排还亮着的琥珀色，一路排到看不清的地方
    for (let i = 0; i < 6; i += 1) {
      const x = -22 + i * 9
      const post = new three.Mesh(new three.CylinderGeometry(0.1, 0.14, 8, 6), materials.structure)
      post.position.set(x, 4, HALL.frontZ + 5)
      root.add(post)
      const head = new three.Mesh(new three.SphereGeometry(0.24, 8, 6), materials.accent)
      head.position.set(x, 8.1, HALL.frontZ + 5)
      root.add(head)
    }

    // 远处候机楼/停车楼的体量。只给一层剪影，让门外不是一条空的黑
    for (let i = 0; i < 3; i += 1) {
      const blockMesh = new three.Mesh(
        new three.BoxGeometry(random.range(14, 22), random.range(8, 14), 10),
        materials.structure,
      )
      blockMesh.position.set(random.range(-34, 34), 6, HALL.frontZ + random.range(22, 34))
      root.add(blockMesh)
    }

    /* ---------------- 可交互 ---------------- */

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
     * 代理球用 `material.visible = false` 而不是 `mesh.visible = false`：
     * 后者会让拾取系统（它自己会遍历祖先链查 visible）跳过这个对象，
     * 而我们要的恰恰是"看不见但点得到"。
     */
    const pileProxy = new three.Mesh(
      new three.SphereGeometry(1.0, 10, 8),
      new three.MeshBasicMaterial({ visible: false }),
    )
    pileProxy.position.set(PILE.x, 1.0, PILE.z)
    root.add(pileProxy)

    /**
     * 闸门热点：**id 必须严格是 `luggage-pile`**。
     * 故事图 f04 的 `gate.id` 就是这个字符串，写错会导致剧情卡死。
     *
     * 为什么闸门是这个而不是"走到转盘旁边"：这一场要玩家做的动作
     * 是**低头看那部手机**。点它，等于承认了自己正在盯着屏幕等一条回复。
     */
    hotspots.push({
      id: 'luggage-pile',
      object: pileProxy,
      label: '那堆行李旁边，手机亮了',
      /**
       * 2.8 米，从眼睛量起。行李堆的碰撞体半径 1.8 米把玩家挡住，
       * 站定时眼到代理球中心（1.0 米高）实测约 2.2 米，
       * 所以 2.8 留出的余量很窄：刚好要求玩家走到行李旁边，但不要求精确站定。
       */
      reach: 2.8,
      onActivate: () => {
        // 点开手机就等于读过了那条消息，闸门在这里关闭，故事才允许继续
        satisfyGate()
        return true
      },
    })

    // 空转盘。代理球挂在朝向出生点的那一段带面上，玩家一抬头就能点
    const carouselProxy = new three.Mesh(
      new three.SphereGeometry(0.9, 10, 8),
      new three.MeshBasicMaterial({ visible: false }),
    )
    carouselProxy.position.set(CAROUSEL.x, 0.9, CAROUSEL.z - slatRadius)
    root.add(carouselProxy)

    const nightProxy = new three.Mesh(
      new three.SphereGeometry(1.2, 10, 8),
      new three.MeshBasicMaterial({ visible: false }),
    )
    nightProxy.position.set(0, 1.6, HALL.frontZ - 0.8)
    root.add(nightProxy)

    const tunnelProxy = new three.Mesh(
      new three.SphereGeometry(1.4, 10, 8),
      new three.MeshBasicMaterial({ visible: false }),
    )
    tunnelProxy.position.set(0, 1.6, HALL.backZ + 0.8)
    root.add(tunnelProxy)

    /**
     * 另外三个热点都不是闸门，全部只返回 `true`。
     *
     * 与看台、咖啡店的分工一致：只有推进剧情的那一个东西是闸门，
     * 其余的是"可以看，但看了也不会改变什么"——
     * 而这一场里那三样东西（空转盘、门外、来路）本来就都是这种。
     */
    hotspots.push(
      {
        id: 'empty-carousel',
        object: carouselProxy,
        label: '空的转盘，还在转',
        // 玩家被带面的碰撞体挡在约 5.9 米外，代理球就挂在最近的那段带面上
        reach: 3.0,
        onActivate: () => true,
      },
      {
        id: 'night-outside',
        object: nightProxy,
        label: '玻璃门外是夜',
        /**
         * 4.5 米。玻璃门的碰撞体把玩家挡在门前半米处，
         * 但门是**通**的（没有遮挡体），所以站在厅里任何一处都看得见它。
         * 距离给得宽一点，是因为这一场里"望向门外"不需要走到底——
         * 他在行李旁边就已经能看见外面没有一个人了。
         */
        reach: 4.5,
        onActivate: () => true,
      },
      {
        id: 'arrival-tunnel',
        object: tunnelProxy,
        label: '我就是从这儿出来的',
        // 在出生点背后。5.5 米，要求玩家真的转过身来
        reach: 5.5,
        onActivate: () => true,
      },
    )

    /* ---------------- 返回 ---------------- */

    return {
      colliders,
      occluders,
      hotspots,
      /**
       * 宿主注册闸门监听。
       *
       * 契约要求宿主在赋值时若闸门**已经**满足过会拿不到通知，
       * 所以这里主动补发一次——玩家可能一出生就直奔那堆行李点了手机，
       * 之后宿主才完成挂载，那种顺序下缺了补发就会一直停在"等待探索"。
       */
      set onGateSatisfied(callback: () => void) {
        notifyGate = callback
        if (gateSatisfied) callback()
      },
      update(elapsed, _delta, player) {
        /**
         * 全场只有两处动效，与看台场景的克制程度一致。
         *
         * 1. 转盘在转（空着也不停）。
         * 2. 手机屏幕的呼吸（点过之后转为常亮）。
         *
         * 顶灯的微闪刻意**没做**：这一场的光已经是均匀惨白的，
         * 再让它闪就会变成"有什么东西坏了"的悬念，
         * 而这里什么都不会再坏了。
         */
        // 周期约 26 秒一圈。慢到玩家不会盯着它看，但一转身就会发现位置变了
        beltSlats.rotation.y = elapsed * 0.24

        /**
         * 屏幕的呼吸。周期压到 2.6 秒左右，比呼吸快一点——
         * 它读起来该是"有人在给你发消息"，而不是"某个灯在慢慢闪"。
         *
         * 点过之后转为常亮：那条消息一旦被看见，就该一直亮着。
         * 它不再是"有什么东西在闪"，而是"他知道了"。
         */
        const breath = 0.5 + 0.5 * Math.sin(elapsed * 2.4)
        const screenMaterial = screen.material as import('three').MeshBasicMaterial
        screenMaterial.opacity = gateSatisfied ? 0.9 : 0.12 + breath * 0.62
        phoneGlow.intensity = gateSatisfied ? 5 : 0.8 + breath * 3.0

        /**
         * 玩家走近行李时，屏幕的光略微变强。
         *
         * 与看台场景里水洼随距离变亮、咖啡店里雨丝随距离变亮同源：
         * 让静止的布景对玩家的位置有反应。这里还多一层意思——
         * 走过去的那几步，就是原文里他"站在那堆行李旁边，站了很久"。
         */
        const distanceToPile = Math.hypot(player.x - PILE.x, player.z - PILE.z)
        materials.accent.opacity = 0.45 + Math.max(0, 1 - distanceToPile / 12) * 0.3
      },
      resize() {
        // 全部按米摆放，与宽高比无关，无需响应
      },
    }
  },
}
