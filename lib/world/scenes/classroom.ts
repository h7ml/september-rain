import type { Collider, Hotspot, SceneRuntime, WorldScene, WorldSceneHandle } from '../types'

/**
 * 场景「六号教学楼」——s01b「有些差距，不是靠努力能填上的」。
 *
 * ## 空间布局（坐标即叙事）
 *
 * ```
 *                x = -8  ← 高窗在左手边（只有这边有窗，光斜着切进来）
 *                   │
 *     z = -9   黑板 + 讲台（左下角有一块没擦干净的粉笔字）
 *     z = -5   第一排课桌
 *     z = -1   第二排课桌（靠右的第二列，是他常坐的位置）
 *     z = +3   第三排课桌（靠右的第二列，桌面合着一本抄满的笔记本）
 *     z = +8.5 玩家出生点，朝 -z（黑板在正前方）
 *     z = +12  后墙 + 成绩单（在玩家背后）
 *     z = +3   纸飞机落在靠近天花板下方、右前侧的地面上
 * ```
 *
 * ## 坐标即叙事：为什么成绩单在背后
 *
 * 这一节要讲的是"她看见过成绩单，然后合上了笔记本"。所以成绩单必须
 * **在玩家背后**——玩家一开始只能看见黑板和成排的空桌子，
 * 要看见这张纸，他必须自己转身。
 *
 * 那个转身就是这一节的全部：她盯着它发很久的呆，而玩家要主动转身
 * 才看得见它。**没有人会把一件不想知道的事放在正前方。**
 *
 * ## 与图书馆的对照
 *
 * 两个场景是同一段关系里的一对比：
 * - 图书馆：他在讲，她在听，中间隔着一张长桌和 5.3 米。**距离是温柔的**——
 *   那道距离是可选的，她随时可以往前坐一点。
 * - 教室：黑板在正前方，成绩单在背后，课桌是按列排的。**距离是尖锐的**——
 *   这里的距离是被排好的，和前面对齐的是天花板上的灯管，不是谁的选择。
 *
 * 布景上最直接的一处对照：图书馆有两盏台灯，只有一盏亮；
 * 教室里没有一盏灯是开的——光全部来自左边的高窗，而且是**空的**。
 *
 * ## 为什么这里比图书馆空
 *
 * 图书馆里到处是人留下的东西（书、灯、暖气片、一块靠垫）；
 * 教室里的东西全是**制度给的**（课桌、讲台、黑板、名次表）。
 * 空教室的"空"不是没人，是这里本来就不该有个人痕迹。
 * 所以全场只有两件私人的东西：一本合上的笔记本，和一架纸飞机。
 * 它们都不该在这里，所以它们都在这里。
 */

/** 房间尺寸。窗、课桌、讲台、成绩单都要按它对齐，抽成常量避免两处各写一遍导致穿帮。 */
const ROOM = {
  /** 黑板墙所在的 z（房间最里侧） */
  frontZ: -9,
  /** 后墙所在的 z */
  backZ: 12,
  /** 侧墙的 x 绝对值 */
  halfWidth: 8,
  /** 层高。比图书馆高半米多，为的是给左边那排高窗留出位置 */
  height: 4.2,
} as const

/** 课桌的排布。列宽 3.1 米、行距 2.3 米是真实教室的尺度，也让成排的空桌子读得出"班级" */
const DESK = {
  columns: [-4.6, -1.5, 1.6, 4.7],
  rows: [-5, -2.7, -0.4],
  /** 桌面高 */
  top: 0.76,
} as const

/** 只有这两张课桌上有东西。其余必须全空——见文首「为什么这里比图书馆空」。 */
const HER_DESK = { x: 1.6, z: 3.0 } as const
const HIS_DESK = { x: 4.7, z: 0.5 } as const

/** 场景调色板。与项目既有的墨绿灰阶 + 琥珀强调色保持一致。 */
const PALETTE = {
  ground: 0x1b2422,
  structure: 0x101619,
  /** 课桌与讲台比结构稍亮，否则在暗墙前看不出体积 */
  furniture: 0x1e2929,
  /** 黑板比墙更暗：一块几乎全黑的面，写在上面的字才有地方亮 */
  blackboard: 0x0b0f10,
  /** 粉笔与纸。全场唯一的亮色，只在三处用：没擦干净的字、那架纸飞机、那块靠垫 */
  chalk: 0xe8e4da,
  /** 窗外。做成低透明度的亮面而不是真天空：要的是"亮"，不是天气 */
  window: 0x9fb4b8,
  accent: 0xc8a878,
} as const

export const classroomScene: WorldScene = {
  id: 'classroom',
  caption: '校园 · 六号教学楼',
  /** 固定种子。同一批课桌的抖动、同一块没擦干净的粉笔字，每次进入都必须在同一处。 */
  seed: 0x5e9e05,

  build(runtime: SceneRuntime): WorldSceneHandle {
    const { three, root, random } = runtime

    /* ---------------- 材质 ---------------- */

    /**
     * 全场共用一组材质，理由与看台场景相同：剪影风里颜色本来就只有几种，
     * 每网格一份材质只会让回收时要释放的对象变多。
     */
    const materials = {
      ground: new three.MeshLambertMaterial({ color: PALETTE.ground }),
      structure: new three.MeshLambertMaterial({ color: PALETTE.structure }),
      furniture: new three.MeshLambertMaterial({ color: PALETTE.furniture }),
      blackboard: new three.MeshLambertMaterial({ color: PALETTE.blackboard }),
      chalk: new three.MeshBasicMaterial({ color: PALETTE.chalk }),
      /** 粉笔字迹。压到很淡——那不是"写着什么"，是"擦过但没擦干净" */
      smear: new three.MeshBasicMaterial({
        color: PALETTE.chalk,
        transparent: true,
        opacity: 0.13,
        depthWrite: false,
      }),
      /** 窗外。不写深度，否则它会挡住窗框 */
      window: new three.MeshBasicMaterial({
        color: PALETTE.window,
        transparent: true,
        opacity: 0.1,
        side: three.DoubleSide,
        depthWrite: false,
      }),
      /** 从高窗斜进来的光柱。用低透明度的大块体积冒充"光洒下来"，比做体积光便宜得多 */
      shaft: new three.MeshBasicMaterial({
        color: PALETTE.accent,
        transparent: true,
        opacity: 0.035,
        side: three.DoubleSide,
        depthWrite: false,
      }),
      accent: new three.MeshBasicMaterial({ color: PALETTE.accent, transparent: true, opacity: 0.5 }),
      /** 成绩单上那些色块。用同一个材质，靠 scale 区分长短 */
      rankBar: new three.MeshBasicMaterial({
        color: PALETTE.chalk,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
      }),
    }

    const colliders: Collider[] = []
    const occluders: import('three').Object3D[] = []

    /* ---------------- 地面、天花板与围合 ---------------- */

    const floor = new three.Mesh(
      new three.BoxGeometry(ROOM.halfWidth * 2, 0.2, ROOM.backZ - ROOM.frontZ),
      materials.ground,
    )
    floor.position.set(0, -0.1, (ROOM.backZ + ROOM.frontZ) / 2)
    root.add(floor)

    const ceiling = new three.Mesh(
      new three.BoxGeometry(ROOM.halfWidth * 2, 0.2, ROOM.backZ - ROOM.frontZ),
      materials.structure,
    )
    ceiling.position.set(0, ROOM.height, (ROOM.backZ + ROOM.frontZ) / 2)
    root.add(ceiling)
    occluders.push(ceiling)

    /**
     * 四面墙。它们同时是碰撞体与遮挡体，所以只能建一次、两处共用。
     *
     * 左墙（x = -8）不进 occluders：那一面是窗，光柱要从那里进来，
     * 玩家也要能透过它读到"外面是白天"。右墙、黑板墙、后墙都进——
     * 这一节的关键视线（从出生点看黑板、转身看成绩单）都在墙之间，
     * 隔墙点击会让"必须转身"这件事失去意义。
     */
    const walls: { x: number; z: number; halfX: number; halfZ: number; transparent?: boolean }[] = [
      { x: 0, z: ROOM.frontZ, halfX: ROOM.halfWidth, halfZ: 0.15 },
      { x: 0, z: ROOM.backZ, halfX: ROOM.halfWidth, halfZ: 0.15 },
      { x: -ROOM.halfWidth, z: (ROOM.backZ + ROOM.frontZ) / 2, halfX: 0.15, halfZ: (ROOM.backZ - ROOM.frontZ) / 2, transparent: true },
      { x: ROOM.halfWidth, z: (ROOM.backZ + ROOM.frontZ) / 2, halfX: 0.15, halfZ: (ROOM.backZ - ROOM.frontZ) / 2 },
    ]
    for (const w of walls) {
      const mesh = new three.Mesh(new three.BoxGeometry(w.halfX * 2, ROOM.height, w.halfZ * 2), materials.structure)
      mesh.position.set(w.x, ROOM.height / 2, w.z)
      root.add(mesh)
      colliders.push({ kind: 'box', x: w.x, z: w.z, halfX: w.halfX, halfZ: w.halfZ })
      if (!w.transparent) occluders.push(mesh)
    }

    /* ---------------- 黑板 ---------------- */

    /**
     * 黑板一块整板 + 一圈木框。板面做得比墙更暗，因为剪影风里
     * "更暗"就是"更深"，而教室里最深的地方本来就该是黑板。
     */
    const BLACKBOARD = { x: -0.6, halfX: 5.4, height: 1.7, centerY: 2.15 } as const
    const board = new three.Mesh(
      new three.BoxGeometry(BLACKBOARD.halfX * 2, BLACKBOARD.height, 0.08),
      materials.blackboard,
    )
    board.position.set(BLACKBOARD.x, BLACKBOARD.centerY, ROOM.frontZ + 0.12)
    root.add(board)

    const frame = new three.Mesh(
      new three.BoxGeometry(BLACKBOARD.halfX * 2 + 0.24, BLACKBOARD.height + 0.24, 0.05),
      materials.furniture,
    )
    frame.position.set(BLACKBOARD.x, BLACKBOARD.centerY, ROOM.frontZ + 0.07)
    root.add(frame)

    // 粉笔槽。有它，黑板才像个真板子而不是贴在墙上的一块矩形
    const tray = new three.Mesh(new three.BoxGeometry(BLACKBOARD.halfX * 2, 0.06, 0.14), materials.furniture)
    tray.position.set(BLACKBOARD.x, BLACKBOARD.centerY - BLACKBOARD.height / 2 - 0.06, ROOM.frontZ + 0.18)
    root.add(tray)

    /**
     * 没擦干净的粉笔字：下半个板面上的一小片短竖线。
     *
     * 做成**读不出内容的短竖线**，而不是一段真文字。理由是这一节的题眼
     * 不在黑板上写了什么，而在"有人擦过它、没擦干净"——上一次课的痕迹
     * 还留着，而这间教室现在空了。真写出字来，玩家就会去读；
     * 读不出东西，玩家才会去注意"它没被擦干净"这件事本身。
     *
     * 位置刻意压在下半块靠左下角：那是擦黑板的人手够得着、
     * 但懒得再擦第二遍的区域。
     */
    for (let i = 0; i < 22; i += 1) {
      const line = new three.Mesh(
        new three.PlaneGeometry(random.range(0.02, 0.045), random.range(0.12, 0.4)),
        materials.smear,
      )
      line.position.set(
        BLACKBOARD.x - 3.4 + random.range(0, 2.6),
        BLACKBOARD.centerY - 0.62 + random.range(0, 0.5),
        ROOM.frontZ + 0.165,
      )
      // 微微歪斜：擦过之后残留的字不会是正的了
      line.rotation.z = random.swing(0.22)
      root.add(line)
    }
    // 一处拖长的擦痕。整片竖线里只有这一道是横向的，视线会先落在这里
    const wipe = new three.Mesh(new three.PlaneGeometry(1.5, 0.22), materials.smear)
    wipe.position.set(BLACKBOARD.x - 2.6, BLACKBOARD.centerY + 0.1, ROOM.frontZ + 0.165)
    wipe.rotation.z = -0.06
    root.add(wipe)

    /* ---------------- 讲台 ---------------- */

    // 讲台在黑板前偏左。做成两级台阶的样子——它比课桌高，
    // 这是这一节里唯一一处"站在上面的人和坐在下面的人"的高度差
    const podium = new three.Group()
    const podiumBody = new three.Mesh(new three.BoxGeometry(1.5, 0.9, 0.8), materials.furniture)
    podiumBody.position.set(0, 0.45, 0)
    const podiumTop = new three.Mesh(new three.BoxGeometry(1.7, 0.08, 0.95), materials.furniture)
    podiumTop.position.set(0, 0.94, 0)
    const podiumStep = new three.Mesh(new three.BoxGeometry(1.2, 0.22, 0.4), materials.furniture)
    podiumStep.position.set(0, 0.11, 0.58)
    podium.add(podiumBody, podiumTop, podiumStep)
    podium.position.set(-2.6, 0, ROOM.frontZ + 1.6)
    root.add(podium)
    colliders.push({ kind: 'box', x: -2.6, z: ROOM.frontZ + 1.6, halfX: 0.85, halfZ: 0.5 })
    occluders.push(podium)

    /* ---------------- 高窗与光柱（左手边） ---------------- */

    /**
     * 高窗开在左墙上，窗台高 2.30 米、窗顶 3.9 米。
     *
     * 为什么这么高：这间教室是**空的**，所以没有一个人会站在光的中间。
     * 低窗会把成排空桌子照成一片均匀的亮，"没人"这件事就看不出来了；
     * 高窗的光只能斜着切过整个房间，从左上角一直铺到右下角的地面，
     * 于是玩家读到的不是"光线好"，而是"光穿过了这些没有人坐的桌子"。
     */
    const WINDOW = { sill: 2.3, top: 3.9, spacing: 3.4 } as const
    const windowCount = 5
    for (let i = 0; i < windowCount; i += 1) {
      const z = ROOM.frontZ + 2.6 + i * WINDOW.spacing
      const pane = new three.Mesh(
        new three.PlaneGeometry(WINDOW.spacing - 0.7, WINDOW.top - WINDOW.sill),
        materials.window,
      )
      pane.rotation.y = Math.PI / 2
      pane.position.set(-ROOM.halfWidth + 0.1, (WINDOW.sill + WINDOW.top) / 2, z)
      root.add(pane)

      // 窗框：一圈十字棂，给面内一层参照，否则亮面在斜视时会糊成一片
      const sillBar = new three.Mesh(new three.BoxGeometry(0.16, 0.12, WINDOW.spacing - 0.7), materials.structure)
      sillBar.position.set(-ROOM.halfWidth + 0.1, WINDOW.sill, z)
      const headBar = new three.Mesh(new three.BoxGeometry(0.16, 0.12, WINDOW.spacing - 0.7), materials.structure)
      headBar.position.set(-ROOM.halfWidth + 0.1, WINDOW.top, z)
      const jambA = new three.Mesh(new three.BoxGeometry(0.16, WINDOW.top - WINDOW.sill, 0.14), materials.structure)
      jambA.position.set(-ROOM.halfWidth + 0.1, (WINDOW.sill + WINDOW.top) / 2, z - (WINDOW.spacing - 0.7) / 2)
      const jambB = jambA.clone()
      jambB.position.z = z + (WINDOW.spacing - 0.7) / 2
      root.add(sillBar, headBar, jambA, jambB)

      /**
       * 光柱：从窗面沿着 +x/-y 斜切进房间的一块薄板。
       *
       * 用一块**斜放的平面**而不是圆锥或体积雾：
       * 一束穿窗的日光在剪影里就是一个亮梯形，平面最便宜也最像。
       *
       * 尺寸与角度被算死了：7.6 米长的板子、绕 z 轴偏 0.38 弧度之后，
       * 上端在窗台高度（2.3m）、下端刚好落在右半侧的地面上，
       * 沿 x 的范围是 -6.3 到 +0.2——再长一点就会穿进右墙或穿出场地。
       */
      const shaft = new three.Mesh(new three.PlaneGeometry(WINDOW.spacing - 1.0, 7.6), materials.shaft)
      shaft.position.set(-ROOM.halfWidth + 4.3, WINDOW.sill - 1.5, z)
      shaft.rotation.set(0, Math.PI / 2, -Math.PI / 2 + 0.38)
      root.add(shaft)
    }

    /**
     * 白天从左边进来。在窗内侧放三盏大范围点光，而不是一盏照亮全屋的灯。
     *
     * 理由与图书馆场景相同：方向光要真的穿窗，得靠窗框的阴影贴图去切出光形状，
     * 而这个项目不开阴影贴图（剪影风不需要）。三盏衰减很快的暖色点光
     * 排成一列之后，房间会呈现"左边亮、右边一路暗下去"的梯度，
     * 那个梯度就是这间教室的光本身。
     */
    for (let i = 0; i < 3; i += 1) {
      const light = new three.PointLight(PALETTE.accent, 9, 17, 2)
      light.position.set(-ROOM.halfWidth + 2.2, WINDOW.sill + 0.9, ROOM.frontZ + 4.5 + i * 5.2)
      root.add(light)
    }

    /* ---------------- 课桌 ---------------- */

    /**
     * 成排的课桌。做成局部函数是因为要摆 12 张，而**每一张都必须一模一样**——
     * 只有尺寸完全一致，"这里是按列排好的"才成立。
     *
     * 每张桌子的位置带一点点抖动（±0.06 米）：完全对齐会像 CAD 图，
     * 完全随机又会散成杂物堆。那点抖动正是"有人坐过、起身时碰了一下"的痕迹。
     *
     * 桌子附带一块碰撞体。用 box 而不是 cylinder：课桌是方的，
     * 且成排摆放时圆碰撞会让玩家从两排之间的缝里挤过去，
     * 而真实的课桌之间本来就只够侧身。
     */
    const deskGroup = new three.Group()
    const addDesk = (x: number, z: number) => {
      const jitterX = random.swing(0.06)
      const jitterZ = random.swing(0.06)
      const deskX = x + jitterX
      const deskZ = z + jitterZ

      const top = new three.Mesh(new three.BoxGeometry(1.2, 0.06, 0.62), materials.furniture)
      top.position.set(deskX, DESK.top, deskZ)
      const front = new three.Mesh(new three.BoxGeometry(1.14, 0.5, 0.06), materials.furniture)
      front.position.set(deskX, DESK.top - 0.28, deskZ + 0.28)
      deskGroup.add(top, front)

      for (let i = 0; i < 4; i += 1) {
        const leg = new three.Mesh(new three.BoxGeometry(0.05, DESK.top, 0.05), materials.structure)
        leg.position.set(deskX + (i % 2 ? 0.54 : -0.54), DESK.top / 2, deskZ + (i < 2 ? 0.24 : -0.24))
        deskGroup.add(leg)
      }

      colliders.push({ kind: 'box', x: deskX, z: deskZ, halfX: 0.62, halfZ: 0.34 })
    }

    for (const z of DESK.rows) {
      for (const x of DESK.columns) {
        addDesk(x, z)
      }
    }
    root.add(deskGroup)
    occluders.push(deskGroup)

    /**
     * 她桌上那本抄满的笔记本：合着。
     *
     * **合上**是这一节最要紧的一个动作。原文里她"把抄满的笔记本合上，
     * 再也没翻开"——所以这本子必须出现在玩家能够走近的地方，而且必须
     * 是合着的。做成一摞摊开的纸，这一节就没了。
     *
     * 位置在靠右的第二列（x = 1.6）第三排（z = 3.0）：从玩家出生点
     * 直着往前走会经过它，而它就在右手边——不需要转弯就能看见，
     * 但需要低头。
     */
    const notebook = new three.Group()
    const cover = new three.Mesh(new three.BoxGeometry(0.26, 0.045, 0.34), materials.furniture)
    const pages = new three.Mesh(new three.BoxGeometry(0.24, 0.03, 0.32), materials.chalk)
    pages.position.y = 0.036
    notebook.add(cover, pages)
    // 桌面上还有那点被反复翻动留下的厚度差：再叠两块几乎看不见的板
    for (let i = 0; i < 2; i += 1) {
      const sheet = new three.Mesh(new three.BoxGeometry(0.22, 0.008, 0.3), materials.chalk)
      sheet.position.set(random.swing(0.01), 0.055 + i * 0.008, random.swing(0.01))
      notebook.add(sheet)
    }
    notebook.position.set(HER_DESK.x, DESK.top + 0.06, HER_DESK.z - 0.06)
    notebook.rotation.y = -0.14
    root.add(notebook)

    /**
     * 他的课桌：空的。
     *
     * 全场唯一一张**什么都没有**的桌子，而且刻意摆在靠右的第二列
     * （x = 4.7，离窗最远、离讲台最远的一列，也就是最不显眼的位置）。
     * 这不算布景，算一句陈述：专业第一的人桌上是空的。
     *
     * 用的是和他座位同一条 z 上没人坐的那一格——不额外建几何，
     * 只是把原来那张桌子的位置记下来，给它挂一个热点。
     */
    const hisDeskProxy = new three.Mesh(
      new three.BoxGeometry(1.3, 0.9, 0.75),
      new three.MeshBasicMaterial({ visible: false }),
    )
    hisDeskProxy.position.set(HIS_DESK.x, 0.55, HIS_DESK.z)
    root.add(hisDeskProxy)

    /* ---------------- 纸飞机 ---------------- */

    /**
     * 一架落在右前侧地上的纸飞机。
     *
     * 谁折的、什么时候折的、为什么在这里，全都不说。它只是**唯一一件
     * 不属于这间教室规则的东西**——黑板、讲台、排好的课桌、背后的名次表，
     * 全部是制度；纸飞机不是。
     *
     * 摆的位置（x = 2.4，z = 3.6）刻意落在她那张桌子往窗那边的地面上：
     * 从她坐的地方一伸手就能扔出去，而它没能飞多远。
     *
     * 建模就是一个细长的四边形 + 两片折翼，翅膀的角度用固定种子抖一下，
     * 免得它看起来像一块纸板。
     */
    const plane = new three.Group()
    const wingA = new three.Mesh(new three.BoxGeometry(0.34, 0.008, 0.13), materials.chalk)
    wingA.position.set(0, 0, -0.035)
    wingA.rotation.x = -0.24
    const wingB = new three.Mesh(new three.BoxGeometry(0.34, 0.008, 0.13), materials.chalk)
    wingB.position.set(0, 0.02, 0.035)
    wingB.rotation.x = 0.24
    const keel = new three.Mesh(new three.BoxGeometry(0.3, 0.05, 0.012), materials.chalk)
    keel.position.set(0.01, -0.022, 0)
    plane.add(wingA, wingB, keel)
    plane.position.set(2.4, 0.03, 3.6)
    plane.rotation.set(0, -0.9, 0.12)
    root.add(plane)

    /**
     * 纸飞机不建碰撞体。
     *
     * 它是全场唯一一件玩家**可以走过去、甚至踩过去**的东西——
     * 而这一节里没有一个动作比"从一架纸飞机上迈过去"更难受。
     * 给它一块碰撞体，玩家会绕开它；不建，玩家会踩上去，
     * 然后为一件三克重的东西停一下。
     */

    /* ---------------- 后墙的成绩单 ---------------- */

    /**
     * 成绩单：一张纸 + 里面十几条色块，**绝对不写名字**。
     *
     * 为什么不写名字：这一节要讲的是"她看着它发很久的呆"，
     * 而不是"她排第几名"。一旦有名字，玩家就会去读名次，
     * 于是这件事从**一种处境**变成**一个数据**。
     * 色块只表达"这里有一列长短不一的条目"——它读起来像名次表，
     * 但不提供任何可以被记住的信息。
     *
     * 色块的长度分布刻意压倒性地偏长（多数条目都接近满宽），
     * 只有一条很短。那一条短的就是这张纸的全部内容。
     */
    const RANK_BOARD = { x: 5.2, y: 1.9 } as const
    // 这张纸单独一份材质，不进 materials 字典：它的透明度是这一节里
    // 唯一需要被压到 0.14 的（墙上的纸要"淡得像个影子"），
    // 而字典里那几份都是不透明的结构体，混在一起会互相牵制
    const sheetMaterial = new three.MeshBasicMaterial({
      color: PALETTE.chalk,
      transparent: true,
      opacity: 0.14,
      side: three.DoubleSide,
    })
    const sheet = new three.Mesh(new three.PlaneGeometry(0.86, 1.18), sheetMaterial)
    sheet.position.set(RANK_BOARD.x, RANK_BOARD.y, ROOM.backZ - 0.16)
    sheet.rotation.y = Math.PI
    root.add(sheet)

    // 表头一道压得很实的横杠，让整张纸读起来是"有抬头的公文"
    const header = new three.Mesh(new three.PlaneGeometry(0.7, 0.05), materials.accent)
    header.position.set(RANK_BOARD.x, RANK_BOARD.y + 0.44, ROOM.backZ - 0.17)
    header.rotation.y = Math.PI
    root.add(header)

    /**
     * 十几条名次条。用 `rankBar` 一份材质 + 各自的 scale，
     * 而不是每条一份材质——回收时少十几个对象。
     *
     * 最下面那条特别短，而且单独给它一份略微亮一点的材质：
     * 它是这张纸上唯一一处"不一样"，而它必须不显眼到玩家要走近才认得出。
     */
    const ROWS = 13
    let shortRowMaterial: import('three').MeshBasicMaterial | null = null
    for (let i = 0; i < ROWS; i += 1) {
      const isShort = i === 4
      let barMaterial = materials.rankBar
      if (isShort) {
        barMaterial = new three.MeshBasicMaterial({
          color: PALETTE.chalk,
          transparent: true,
          opacity: 0.34,
          depthWrite: false,
        })
        shortRowMaterial = barMaterial
      }
      const width = isShort ? 0.1 : random.range(0.34, 0.72)
      const bar = new three.Mesh(new three.PlaneGeometry(width, 0.026), barMaterial)
      // 左对齐：名次表是从左边一列一列排下来的，居中会让它像一张图表
      bar.position.set(
        RANK_BOARD.x - 0.3 + width / 2,
        RANK_BOARD.y + 0.34 - i * 0.062,
        ROOM.backZ - 0.17,
      )
      bar.rotation.y = Math.PI
      root.add(bar)
    }

    /**
     * 成绩单下缘的一小片暖光。
     *
     * 与咖啡店桌上那部手机是同一个手法：**一盏不动的灯只会被当成布景，
     * 一盏有光的灯会让人走过去**。这里甚至不需要它在动——
     * 它只需要从背后那面暗墙上"亮出来"，玩家转身时就会看见。
     *
     * 强度压得很低（2.2，衰减半径 3.2），否则后墙会被照成一片暖色，
     * 而这一节的光应该只从左边的窗来。
     */
    const rankGlow = new three.PointLight(PALETTE.accent, 2.2, 3.2, 2)
    rankGlow.position.set(RANK_BOARD.x, RANK_BOARD.y - 0.55, ROOM.backZ - 0.5)
    root.add(rankGlow)

    /* ---------------- 可交互 ---------------- */

    /**
     * 热点一律挂在不透光的球形代理上，而不是它描述的那个网格。
     *
     * 理由与看台场景相同：笔记本只有巴掌大、纸飞机只有三十厘米长，
     * 玩家会觉得"明明对着它却点不中"。用球把它们连同周围一小块空间包起来，
     * 拾取窗口就变成了"她桌上那块地方"、"地上那架飞机"——
     * 玩家想的本来也是那里，而不是那 26 厘米宽的封面。
     *
     * 球体用 `material.visible = false` 而不是 `mesh.visible = false`：
     * 后者会让射线直接跳过它，而我们要的是"看不见但点得到"。
     */
    const hotspots: Hotspot[] = []

    const notebookProxy = new three.Mesh(
      new three.SphereGeometry(0.4, 10, 8),
      new three.MeshBasicMaterial({ visible: false }),
    )
    notebookProxy.position.set(HER_DESK.x, DESK.top + 0.2, HER_DESK.z - 0.06)
    root.add(notebookProxy)

    hotspots.push({
      id: 'closed-notebook',
      object: notebookProxy,
      label: '她合上的那本笔记本',
      /**
       * 2.1 米，且是**从眼睛量起的三维距离**（眼高 1.68m）。
       *
       * 笔记本躺在 0.82 米高的桌面上，桌子的碰撞体在 0.34 米外挡住玩家；
       * 站定时眼到本子实测约 1.35 米。给 2.1 留出的余量很窄——
       * 刚好要求玩家走到桌前，但不要求他精确站位。
       */
      reach: 2.1,
      onActivate: () => true,
    })

    const rankProxy = new three.Mesh(
      new three.SphereGeometry(0.8, 10, 8),
      new three.MeshBasicMaterial({ visible: false }),
    )
    rankProxy.position.set(RANK_BOARD.x, RANK_BOARD.y, ROOM.backZ - 0.35)
    root.add(rankProxy)

    hotspots.push({
      id: 'rank-sheet',
      object: rankProxy,
      label: '后墙上的成绩单',
      /**
       * 3.0 米。这一条是全场最宽的额度，因为它是唯一一个
       * **需要玩家转身**才存在的热点。
       *
       * 转身本身已经是一个成本了；如果还要玩家贴到墙根才点得到，
       * 这个动作就从"我自己要看"变成了"游戏逼我看"。
       * 给 3 米，让他转过来就能点到——而这个决定是他自己做的。
       */
      reach: 3.0,
      onActivate: () => true,
    })

    const planeProxy = new three.Mesh(
      new three.SphereGeometry(0.45, 10, 8),
      new three.MeshBasicMaterial({ visible: false }),
    )
    planeProxy.position.set(2.4, 0.25, 3.6)
    root.add(planeProxy)

    hotspots.push({
      id: 'paper-plane',
      object: planeProxy,
      label: '地上一架纸飞机',
      /**
       * 2.3 米。它躺在地上（0.03 米高），眼到它的三维距离里
       * 有 1.65 米是**纯高度差**——玩家必须走到几乎踩到它才够得着。
       * 这不是额度没给够，正是要这个效果：想看它就得站到它跟前。
       */
      reach: 2.3,
      onActivate: () => true,
    })

    /* ---------------- 返回 ---------------- */

    return {
      colliders,
      occluders,
      hotspots,
      /**
       * 这一节没有闸门：故事节点 s01b 是纯阅读节点，`onGateSatisfied` 不注册。
       *
       * 与看台、咖啡店的区别是刻意的：那两节的闸门是"你必须先看见某样东西"，
       * 而这里的落差是**已经发生过的**——她留级、她六点占座、她合上本子，
       * 全部在玩家进门之前就结束了。玩家能做的只是走近、
       * 低头看那本本子，或者转身去看那张纸。
       */
      update(elapsed, _delta, player) {
        /**
         * 两处只有这个场景才有的动效（克制到与看台场景同一量级）：
         * 1. 纸飞机的翅膀以极小的幅度抖——教室里有风，说明门开着，而这间屋子空着
         * 2. 光柱随玩家走近而略微变亮
         *
         * 都放在这里而不是骨架里——骨架不该知道任何具体场景的表演。
         */
        const flutter = Math.sin(elapsed * 1.2)
        wingA.rotation.x = -0.24 + flutter * 0.012
        wingB.rotation.x = 0.24 - flutter * 0.012
        // 整架飞机跟着那阵风极轻地转一下头。幅度刻意小到需要盯着看才认得出，
        // 否则一张地上的纸会变成"会动的东西"，那就成了另一个故事
        plane.rotation.y = -0.9 + flutter * 0.02

        /**
         * 玩家走近左边的窗时，光柱更亮一点。
         *
         * 借的是"走进光里"这个体感：不是灯被点亮了，是玩家挪到了光经过的地方。
         * 与看台场景里水洼随距离变亮、图书馆里书脊随距离变暗同源——
         * 都是让静止的布景对玩家的位置有反应。
         */
        const towardWindow = Math.max(0, 1 - (player.x + ROOM.halfWidth) / 14)
        materials.shaft.opacity = 0.026 + towardWindow * 0.03

        /**
         * 成绩单下缘那点光极缓地亮暗。
         *
         * 周期压到 5 秒以上——比呼吸慢得多。这里要的不是"有东西在闪"，
         * 而是"墙角有块纸，光落在它上面"。太快就变成了通知。
         */
        if (shortRowMaterial) {
          shortRowMaterial.opacity = 0.28 + 0.08 * Math.sin(elapsed * 1.1)
        }
        rankGlow.intensity = 2.0 + 0.4 * Math.sin(elapsed * 1.1)
      },
      resize() {
        // 这个场景的布景与宽高比无关（全部按米摆放），无需响应
      },
    }
  },
}
