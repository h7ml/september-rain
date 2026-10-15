import type { Collider, Hotspot, SceneRuntime, WorldScene, WorldSceneHandle } from '../types'

/**
 * 场景「城墙」——终章，e02「它在我记忆里，永远是那年九月的样子」。
 *
 * ## 空间布局（坐标即叙事）
 *
 * ```
 *        z = -4.6  外侧垛口（垛墙 1.75m 高，挡人，但墙垛之间有缺口）
 *             │
 *        z =  0   走道中线：城砖步道，宽 8m
 *             │
 *        z =  4.4  内侧宇墙（1.1m，略矮——内侧只是护栏）
 *             ↑
 *        z =  6    玩家出生点（靠内墙，面朝城外）
 *
 *        x = -46 ────────── 走道 ────────── x = +46（两端在雾里收头）
 *                          ↑
 *              x = +22, z = -94  记忆里那个看台
 * ```
 *
 * 玩家朝 `yaw = 0` 即朝 `-z`：正前方是垛口的缺口，缺口之外是一片雾，
 * 雾里约 84 米外有一片比雾略亮的、看得出是阶梯的东西。
 *
 * ## 视觉回环：为什么必须做到，以及为什么必须看不清
 *
 * 第一幕的看台是一块 44m 宽的六级阶梯，玩家在操场另一头 34 米外看它，
 * 那时它是清晰可辨的——他能数出她坐在第几级。这一节里，同一块形状
 * 出现在约 84 米外的雾中，**只剩下一个轮廓的暗示**。
 *
 * 这就是全部的收束：他没有回去看过那个操场，所以他也说不清看台现在什么样。
 * 画面里那点若有若无的形状不是"远景"，是他**记忆的分辨率**。
 *
 * 雾不能调（骨架统一持有，且这一场的雾是全局唯一能表达"看不清"的工具），
 * 所以"看不清"是靠**距离 + 亮度**做出来的，见 `MEMORY_BLEACHER` 的注释。
 *
 * ## 风
 *
 * 原文里这一节的空气是有动静的：风、以及雨停之后云缝里的天光。
 * 两者都做成极慢的、不需要玩家参与的位移——他在这里什么都不用做，
 * 只需要站一会儿。
 */

/** 走道尺寸。护栏、垛口、砖缝多处要对齐，抽成常量避免两处各写一遍导致穿帮。 */
const WALK = {
  /** 走道沿 x 的绝对边界。两端不进碰撞体，让雾去收边 */
  halfLength: 52,
  /** 走道半宽（z 方向） */
  halfWidth: 4,
  /** 走道面高度（场景地面） */
  y: 0,
} as const

/** 外侧垛墙与垛口。垛口必须挡人，所以尺寸和碰撞体共用一份。 */
const PARAPET = {
  /** 外侧垛墙所在的 z */
  z: -4.6,
  /** 垛墙厚度的一半 */
  thickness: 0.42,
  /** 垛墙高（人胸口以上，站着能趴上去） */
  height: 1.75,
  /** 单个墙垛沿 x 的长度 */
  merlonLength: 2.6,
  /** 垛口（墙垛之间的缺口）沿 x 的长度 */
  embrasureLength: 1.5,
} as const

/** 内侧宇墙：只作护栏，比外侧矮一截。 */
const INNER_WALL = {
  z: 4.4,
  thickness: 0.35,
  height: 1.1,
} as const

/**
 * 记忆里的那个看台。
 *
 * ## 这组数字是整个场景的核心，值得逐个解释
 *
 * - `x: 22`：刻意不放正中。他记忆里的操场从来不在城墙正前方，
 *   而且偏离视线中点之后，"发现它"才是一个动作——玩家得自己找。
 * - `width: 44 / steps: 6 / stepHeight: 1.2 / stepDepth: 2.4`：
 *   与 `bleachers.ts` 里的 `BLEACHER` **完全一致**。这不是巧合，是要求：
 *   回环必须共用同一组形状参数，否则玩家认出来的就不是"那个看台"。
 *   缩放过的小号看台是搭景，同尺寸的远看台才是回忆。
 * - `z: -78`：从出生点（z = 6）量过去约 84 米。骨架的雾是 `FogExp2`、
 *   密度 0.019，**保留系数是 `t = exp(-(density × depth)²)`**——
 *   density 与 depth 都在平方括号内（three 的 `fog_fragment.glsl.js`：
 *   `fogFactor = 1 - exp(-density² × depth²)`），而且 `depth` 是
 *   **相机到片元的视深**（`vFogDepth = -mvPosition.z`），不是某两点之间的距离。
 *
 *   所以 84 米处 `exp(-(0.019 × 84)²) = exp(-2.545) ≈ 0.078`；
 *   正对着看台时的视深约 86.8 米，`t ≈ 0.066`。**取值区间约 0.066 ~ 0.078。**
 *
 *   这个数字决定了回环的表现力：`t` 就是"物体颜色在最终像素里还剩多少"。
 *   一个浅灰（0x6b7472）与雾色（0x141b1c）混色后是 rgb(27,34,35)，
 *   与背景只差 **约 7 个色阶**——一个形状确实在那里，但只有凑近看才分辨得出。
 *   而这已经接近这个距离上的上限：把材质提到纯白也只能到 18 个色阶
 *   （`(255-32) × 0.078`），所以想要更清楚只能减少雾密度或把看台挪近，
 *   **brightening 材质是无效的**。真正让玩家确认"那是看台"的其实是看台脚下
 *   那线琥珀微光（见 `memoryGlint`），它比剪影本身亮一倍以上。
 * - `groundY: -1.4`：这一条是被几何逼出来的，不是随手给的。
 *   垛墙高 1.75m，而眼高 1.68m——也就是说**眼比垛口低一点点**。
 *   如果城外地面比走道低得多（真实城墙外就是低 8~12m），
 *   看台整个会沉在垛口以下，被墙挡死，回环根本看不见。
 *   所以城外必须是**台地**：地面只比走道低 1.4m，看台六级的顶面
 *   落在 +5.8m，比垛口高出 4 米。玩家从缺口看出去时，
 *   看见的是它露在墙顶以上的那部分——**只看得到露出来的那一点**，
 *   这个限制本身就是这一节的意思。
 * - `y: 0` 的落点在下面用 `groundY` 修正，见 `memoryBleacher.position`。
 */
const MEMORY_BLEACHER = {
  x: 22,
  z: -78,
  width: 44,
  steps: 6,
  stepHeight: 1.2,
  stepDepth: 2.4,
  /** 看台所在台地的高度。见上面关于「眼比垛口低」的说明 */
  groundY: -1.4,
} as const

/** 场景调色板。与项目既有的墨绿灰阶 + 琥珀强调色保持一致。 */
const PALETTE = {
  /** 城砖步道。比操场地面略暖一点——砖和土不是一种东西 */
  stone: 0x1b2422,
  /** 垛口与宇墙的结构色 */
  structure: 0x101619,
  /**
   * 城砖的缝。整场只有这一个纯装饰性的亮色，密排在步道上，
   * 它存在的唯一理由是给"长度"一个刻度——没有砖缝，8×100 米的走道
   * 会读成一块空地。
   */
  joint: 0x2a3536,
  /** 记忆里的看台。比普通结构色亮一档，见 `bleacherMaterial` 的注释 */
  memory: 0x6b7472,
  /** 云缝里漏下的天光 */
  sunbreak: 0xc8a878,
  /** 雨停之后的天。比雾色略亮，才能"亮起来" */
  sky: 0x2a3b3e,
} as const

export const cityWallScene: WorldScene = {
  id: 'city-wall',
  caption: '西安 · 城墙上的风',
  /** 固定种子。同一批砖缝、同一片云缝，每次进入都必须一模一样 */
  seed: 0x5e9e0d,

  build(runtime: SceneRuntime): WorldSceneHandle {
    const { three, root, random } = runtime

    /* ---------------- 材质 ---------------- */

    /**
     * 全场共用一组材质，理由与其余场景相同：剪影风里颜色本来就只有几种。
     *
     * 有两份材质是**必须**独立的，不能并进共用表里：
     * - `bleacher`：它要单独接收"记忆的褪色"，见下面的注释。
     * - `cloud`：云缝的天光要逐帧缓慢移动，透明度归它自己管。
     */
    const materials = {
      stone: new three.MeshLambertMaterial({ color: PALETTE.stone }),
      structure: new three.MeshLambertMaterial({ color: PALETTE.structure }),
      /** 砖缝：贴在地面上的一层薄线，不吃光、不写深度，免得在砖面上割出黑边 */
      joint: new three.MeshBasicMaterial({
        color: PALETTE.joint,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
      }),
      /**
       * 记忆里的看台。
       *
       * 用 `MeshBasicMaterial` 而不是 `MeshLambertMaterial`，这一点与
       * 其余所有结构体都不同，是刻意的：Lambert 的受光面会随视角变化，
       * 而 100 米外的雾已经把对比度压到 15%，任何逐面的光照差异
       * 都会先被雾吃掉、再被当成噪点。给一个**不受光、恒定亮度**的
       * 浅灰，它在雾里的呈现就只由距离决定——干净，且完全可控。
       *
       * 亮度 0x6b7472 是算出来的：雾色是 0x141b1c 附近，
       * 这个灰经过 15% 保留之后落在 (0x22,0x28,0x27) 一带，
       * 比背景亮一点点——正好是"隐约有一片东西"的亮度差。
       */
      bleacher: new three.MeshBasicMaterial({ color: PALETTE.memory }),
      /** 走道尽头之外的地面。比城砖暗，让走道本身成为一条带子 */
      ground: new three.MeshLambertMaterial({ color: 0x0d1213 }),
      /** 云缝里的天光。缓慢移动的一大片低透明度矩形，见 update */
      sunbreak: new three.MeshBasicMaterial({
        color: PALETTE.sunbreak,
        transparent: true,
        opacity: 0.06,
        side: three.DoubleSide,
        depthWrite: false,
      }),
      /**
       * 风的可视化。
       *
       * 「风」在第一人称里最难做——它没有形状。这里用的是**远处一层会动的雾**：
       * 走道外几片极低透明度的横向长条，缓慢反向漂移。
       * 便宜，而且它不撒谎：城墙上的风本来就是先吹动远处的雾，而不是吹动你脚下。
       */
      drift: new three.MeshBasicMaterial({
        color: PALETTE.sky,
        transparent: true,
        opacity: 0.05,
        depthWrite: false,
      }),
      /** 垛口上挂着的一小段布。它是这个场景里唯一会明确"动"的东西 */
      cloth: new three.MeshBasicMaterial({
        color: PALETTE.structure,
        transparent: true,
        opacity: 0.85,
        side: three.DoubleSide,
      }),
    }

    const colliders: Collider[] = []
    const occluders: import('three').Object3D[] = []

    /* ---------------- 走道 ---------------- */

    /**
     * 走道是一整块平板，不是逐块铺的砖。
     *
     * 逐块铺 100 米需要上千个网格，而在这套画风里，砖的存在感来自
     * **缝**而不是砖本身。所以砖面用一块整板，缝用一批极薄的片，
     * 一次 draw call 就能拿到"很长的一条城砖路"。
     */
    const walkway = new three.Mesh(
      new three.BoxGeometry(WALK.halfLength * 2, 0.4, WALK.halfWidth * 2),
      materials.stone,
    )
    walkway.position.set(0, WALK.y - 0.2, 0)
    root.add(walkway)

    /** 走道之外的地面。往四周铺开 260m，让雾去收边而不是让几何体收边 */
    const outerGround = new three.Mesh(new three.BoxGeometry(320, 0.4, 320), materials.ground)
    outerGround.position.set(0, WALK.y - 0.62, 0)
    root.add(outerGround)

    /**
     * 砖缝。
     *
     * 横向一道一道（沿 x 各铺 0.08m 宽），间距 1.4m —— 这个数比真实城砖大得多，
     * 真实城砖的缝在这个尺度上会变成一片噪点。1.4m 是**视觉砖**：
     * 它给出的刻度刚好让人感到"我走了很久"，又不至于让地面花掉。
     */
    const joints = new three.Group()
    for (let z = -WALK.halfWidth + 0.7; z < WALK.halfWidth; z += 1.4) {
      const joint = new three.Mesh(
        new three.PlaneGeometry(WALK.halfLength * 2, 0.08),
        materials.joint,
      )
      joint.rotation.x = -Math.PI / 2
      joint.position.set(0, WALK.y + 0.006, z)
      joints.add(joint)
    }
    // 纵向一道中线，把走道分成两半——巡逻的人各走各的那一边
    const centerLine = new three.Mesh(new three.PlaneGeometry(WALK.halfLength * 2, 0.06), materials.joint)
    centerLine.rotation.x = -Math.PI / 2
    centerLine.position.set(0, WALK.y + 0.005, 0)
    joints.add(centerLine)
    root.add(joints)

    /* ---------------- 外侧垛墙与垛口 ---------------- */

    /**
     * 垛口：墙垛与缺口交替。
     *
     * 垛口用 `MERLON + EMBRASURE` 的节奏排出来，而不是让代码随手点几个位置——
     * 这个节奏（2.6m 实、1.5m 空）在城墙上就是标准模数，
     * 玩家走在旁边时，缺口会像取景框一样一帧一帧地刷过去，
     * **那是这个场景唯一提供的"节奏"，不需要任何动效就有了**。
     *
     * 碰撞体逐块登记：玩家应该能走到垛口前，把身体贴在缺口上往外看，
     * 但绝不能被允许穿出去。走道两侧的墙垛（z 方向那两片）不登记，
     * 因为垛口本身就是开口，真正的边界由缺口外那圈隐形的护栏兜住（见下）。
     */
    const parapetGroup = new three.Group()
    const pitch = PARAPET.merlonLength + PARAPET.embrasureLength
    const merlonCount = Math.floor((WALK.halfLength * 2) / pitch)

    for (let i = 0; i <= merlonCount; i += 1) {
      const centerX = -WALK.halfLength + i * pitch + PARAPET.merlonLength / 2
      const merlon = new three.Mesh(
        new three.BoxGeometry(PARAPET.merlonLength, PARAPET.height, PARAPET.thickness * 2),
        materials.structure,
      )
      merlon.position.set(centerX, PARAPET.height / 2, PARAPET.z)
      parapetGroup.add(merlon)

      colliders.push({
        kind: 'box',
        x: centerX,
        z: PARAPET.z,
        halfX: PARAPET.merlonLength / 2,
        halfZ: PARAPET.thickness,
      })
    }

    /**
     * 垛口底部的连续矮墙（每垛之间那截 0.5m 高的墙）。
     *
     * 真实城墙上垛口不是通到地面的洞，底下有一截墙。这里必须有它，
     * 有两个理由：视觉上它让垛口像垛口而不是缺口；
     * 功能上它和下面那道隐形护栏一起，把"掉下去"这件事彻底堵死。
     */
    const kneeWall = new three.Mesh(
      new three.BoxGeometry(WALK.halfLength * 2, 0.5, PARAPET.thickness * 1.5),
      materials.structure,
    )
    kneeWall.position.set(0, 0.25, PARAPET.z)
    root.add(kneeWall)
    parapetGroup.add(kneeWall)
    colliders.push({
      kind: 'box',
      x: 0,
      z: PARAPET.z,
      halfX: WALK.halfLength,
      halfZ: PARAPET.thickness * 0.75,
    })

    root.add(parapetGroup)
    occluders.push(parapetGroup)

    /**
     * 缺口的护栏。
     *
     * 上面那道矮墙已经保证了不会掉下去，这一道是**只在缺口处**的额外一层
     * （半高，不可见）。为什么不干脆不写：玩家如果只被矮墙挡住，
     * 会有一种"我在一个台子上"的错觉，会去试着翻——而这一节不该有任何
     * 需要玩家试探的边界。多一层看不见的墙，他第一次碰到就知道到头了。
     *
     * 用一个细长的盒子横跨整条走道，比逐缺口建便宜得多，效果完全一样。
     */
    colliders.push({
      kind: 'box',
      x: 0,
      z: PARAPET.z + 0.2,
      halfX: WALK.halfLength,
      halfZ: 0.05,
    })

    /* ---------------- 内侧宇墙 ---------------- */

    /**
     * 内侧宇墙比外侧矮一大截（1.1m 对 1.75m）。
     *
     * 这个高度差是有用的：玩家朝外看的时候，余光里只有外侧那道高墙——
     * 视线被自然地压低到城外；而当他转身，矮墙不会挡住内侧，
     * 于是他会看见城里那片更暗的屋顶。**两种方向的对比，就靠这 0.65m 做出来。**
     */
    const innerWall = new three.Mesh(
      new three.BoxGeometry(WALK.halfLength * 2, INNER_WALL.height, INNER_WALL.thickness * 2),
      materials.structure,
    )
    innerWall.position.set(0, INNER_WALL.height / 2, INNER_WALL.z)
    root.add(innerWall)
    colliders.push({
      kind: 'box',
      x: 0,
      z: INNER_WALL.z,
      halfX: WALK.halfLength,
      halfZ: INNER_WALL.thickness,
    })
    occluders.push(innerWall)

    /* ---------------- 城里 ---------------- */

    /**
     * 内侧的城市：一层低矮、密集、更暗的屋顶。
     *
     * 它不承担任何叙事，只承担一件事——让"我在城墙**上**"这个位置成立。
     * 没有它，内侧就是一片平地，城墙会读成一道孤立的隔墙。
     *
     * 全部用盒子，全靠随机的宽度、高度、间距拉开层次；
     * 亮度压在结构色以下（0x0d1213），因为它们只是轮廓，
     * 一旦比城墙亮就会把视线从城外拽回来——而这一节玩家该一直朝外看。
     */
    const city = new three.Group()
    for (let i = 0; i < 90; i += 1) {
      const width = random.range(6, 14)
      const depth = random.range(6, 14)
      // 越远的房子越矮：这不是透视，是城里近处是民房、远处被雾吃掉
      const height = random.range(4, 11)
      const building = new three.Mesh(new three.BoxGeometry(width, height, depth), materials.ground)
      building.position.set(
        random.spread(0, 62),
        height / 2 - 1.2,
        random.range(INNER_WALL.z + 8, INNER_WALL.z + 96),
      )
      city.add(building)
    }
    root.add(city)

    /* ---------------- 记忆里的那个看台 ---------------- */

    /**
     * 第一幕那块看台的复现，见 `MEMORY_BLEACHER` 的注释：尺寸与
     * `bleachers.ts` 完全一致，位置在 100 米外的雾里。
     *
     * 单独建一个 Group 是为了两件事：整块进出视锥（`frustumCulled` 默认开着，
     * 玩家背对它时它不参与渲染），以及把"视线遮挡"这件事留给它自己——
     * **它不进 occluders**，因为它远在墙外，永远不该挡住任何东西的拾取。
     */
    const memoryBleacher = new three.Group()
    for (let step = 0; step < MEMORY_BLEACHER.steps; step += 1) {
      const tier = new three.Mesh(
        new three.BoxGeometry(MEMORY_BLEACHER.width, MEMORY_BLEACHER.stepHeight, MEMORY_BLEACHER.stepDepth),
        materials.bleacher,
      )
      tier.position.set(
        0,
        (MEMORY_BLEACHER.stepHeight * (step + 1)) / 2,
        -step * MEMORY_BLEACHER.stepDepth,
      )
      memoryBleacher.add(tier)
    }
    // 整组落在台地高度上。写成一个组的位置而不是逐级加偏移：
    // 形状参数与 `bleachers.ts` 保持完全一致，落差只由这一处承担——
    // 两边各改一半是最容易让"回环认不出来"的写法。
    memoryBleacher.position.set(MEMORY_BLEACHER.x, MEMORY_BLEACHER.groundY, MEMORY_BLEACHER.z)
    root.add(memoryBleacher)

    /**
     * 看台后面那片更暗的体量：操场边上的建筑与树。
     *
     * 只有看台孤零零浮在雾里会显得像一块漂浮的白板。在它背后和两侧
     * 压几个更暗的方块，把看台"衬"出来——这是剪影画里最基本的做法，
     * 也是唯一能让那点残余对比度被读出来的办法：
     * **不是把它加亮，是把周围压暗。**
     */
    const backdrop = new three.Group()
    for (let i = 0; i < 26; i += 1) {
      const height = random.range(6, 16)
      const block = new three.Mesh(
        new three.BoxGeometry(random.range(6, 18), height, random.range(6, 14)),
        materials.ground,
      )
      block.position.set(
        MEMORY_BLEACHER.x + random.spread(0, 58),
        MEMORY_BLEACHER.groundY + height / 2,
        MEMORY_BLEACHER.z + random.range(-26, -3),
      )
      backdrop.add(block)
    }
    root.add(backdrop)

    /**
     * 看台脚下一线极淡的琥珀色，与第一幕雨里那点水洼同色。
     *
     * 整个游戏里，操场那场雨的现场感就是靠水洼的琥珀反光建立的。
     * 在这里让同样的色温重新出现在七十米外的看台脚下，
     * 是回环的第二层：**形状对应第一次，颜色对应第二次**。
     * 玩家未必会想明白这一步，但他在城墙上看过去时，
     * 会觉得那个东西"眼熟"——眼熟就是这一节要的一切。
     *
     * 位置压在垛口可以望见的高度（+0.6m），否则它会掉到墙以下，
     * 而这一层对应关系是整场回环里最容易丢的一环。
     */
    const memoryGlintMaterial = new three.MeshBasicMaterial({
      color: PALETTE.sunbreak,
      transparent: true,
      opacity: 0.09,
      depthWrite: false,
    })
    const memoryGlint = new three.Mesh(
      new three.PlaneGeometry(MEMORY_BLEACHER.width * 0.6, 5),
      memoryGlintMaterial,
    )
    memoryGlint.rotation.x = -Math.PI / 2
    memoryGlint.position.set(MEMORY_BLEACHER.x, 0.55, MEMORY_BLEACHER.z + 8)
    root.add(memoryGlint)

    /* ---------------- 雨停之后的天 ---------------- */

    /**
     * 云缝。
     *
     * 原文里这是"雨停了"的唯一证据，而这套画风里没有天空——
     * 天就是雾。所以云缝不能画成云，只能画成**一片比雾略亮的斜带**，
     * 低得刚好压在地平线上，从看台的方向斜切过去。
     *
     * 它的透明度归 `materials.sunbreak` 管，逐帧缓慢变化（见 update）。
     * 变化周期给到 40 秒以上：一块云飘过去就是这个量级，
     * 而这个场景的时长是"站一会儿"，太快就成了特效。
     */
    const cloudGroup = new three.Group()
    for (let i = 0; i < 5; i += 1) {
      const band = new three.Mesh(
        new three.PlaneGeometry(random.range(60, 150), random.range(10, 26)),
        materials.sunbreak,
      )
      band.position.set(random.spread(0, 90), random.range(44, 70), MEMORY_BLEACHER.z + random.range(-30, 34))
      // 略向玩家一侧倾斜，于是它读起来是"从云里斜着漏下来"而不是一块贴片
      band.rotation.z = random.range(-0.22, 0.22)
      cloudGroup.add(band)
    }
    root.add(cloudGroup)

    /* ---------------- 风 ---------------- */

    /**
     * 远处的雾在动。
     *
     * 五片极长的低透明度横条，铺在垛口之外 30 米处，整个场景里缓慢横向漂移。
     * 玩家永远不会走到它们跟前（垛口挡着），所以看不出那是一块薄片——
     * 他看到的只是"外面的雾不是静止的"。
     *
     * 逐帧只改 `position.x`（见 update），且位移由 `elapsed` 直接求值，
     * 与帧率无关，暂停再恢复也不会错位。
     */
    const driftGroup = new three.Group()
    const driftLayers: { mesh: import('three').Mesh; speed: number; span: number }[] = []
    for (let i = 0; i < 5; i += 1) {
      const span = random.range(40, 70)
      const mesh = new three.Mesh(new three.PlaneGeometry(span, random.range(2.5, 5)), materials.drift)
      const z = MEMORY_BLEACHER.z + random.range(-20, 40)
      // 高度压在 4~9m：再高就跑到垛口视野的上沿之外，
      // 玩家低头看缺口时完全看不见它，"风"就白做了
      mesh.position.set(random.spread(0, 60), random.range(4, 9), z)
      driftGroup.add(mesh)
      driftLayers.push({ mesh, speed: random.range(0.28, 0.75), span: 260 })
    }
    root.add(driftGroup)

    /* ---------------- 垛口上挂着的那一小段布 ---------------- */

    /**
     * 全场唯一明确在动的东西。
     *
     * 一块系在垛口上的布条（或者谁忘在这里的一件衣服）——它不做叙事，
     * 它只是把"风"从一个形容词变成一件看得见的事。
     * 放在玩家出生点正前方偏左一点，让他一抬头就能看见。
     *
     * 它是本场景两处动效之一（另一处是云缝），这个数量与 `bleachers.ts`
     * 保持同一克制程度：一场戏只该有两三个东西在动，多了就成了屏保。
     */
    const cloth = new three.Mesh(new three.PlaneGeometry(0.34, 0.62, 3, 4), materials.cloth)
    cloth.position.set(-2.2, PARAPET.height - 0.05, PARAPET.z + PARAPET.thickness + 0.03)
    root.add(cloth)

    /**
     * 让布条的顶点风吹起来。
     *
     * 用顶点位移而不是旋转：一块布被风吹的时候，**根部是钉死的、末端在飘**，
     * 整体旋转做不出这个。四个顶点里越靠下的越自由，
     * 于是它在风里会像一面小旗一样抖。
     *
     * 位移量很小（最大 0.09m），因为这是一块布，不是一面旗。
     */
    const clothGeometry = cloth.geometry as import('three').BufferGeometry
    const clothBase = (clothGeometry.attributes.position.array as Float32Array).slice()
    const CLOTH_WAVE = 0.09

    /* ---------------- 可交互 ---------------- */

    const hotspots: Hotspot[] = []

    /**
     * 记忆里的看台。
     *
     * `reach` 用的是**水平距离量不到的量**——契约要求三维距离从眼睛算，
     * 而看台在七十多米外。这个 `reach` 显然不能是"走过去"的距离，
     * 因为垛口挡着，玩家永远走不过去。
     *
     * 那它为什么要有：因为它让玩家**可以指着它看**。准星扫过去、
     * 提示浮出来一行字，那一刻玩家会确认"我没看错，那是那个看台"。
     * 这一节的收束全靠玩家自己认出它来，所以这个"确认"必须被允许。
     *
     * 85 米按最有利的位置给：玩家沿走道往 +x 走到 x = 22 附近时，
     * 眼睛到看台中心的距离约 74 米；85 留出的余量刚好让他在走道中段
     * 就能点到，而不必精确站到正对面——但也就仅此而已，
     * 站到走道另一头（x = -20）时距离超过 90 米，点不到。
     */
    const bleacherProxy = new three.Mesh(
      new three.SphereGeometry(24, 8, 6),
      new three.MeshBasicMaterial({ visible: false }),
    )
    bleacherProxy.position.set(
      MEMORY_BLEACHER.x,
      MEMORY_BLEACHER.groundY + MEMORY_BLEACHER.stepHeight * MEMORY_BLEACHER.steps * 0.5,
      MEMORY_BLEACHER.z - MEMORY_BLEACHER.stepDepth * 2,
    )
    root.add(bleacherProxy)

    hotspots.push({
      id: 'memory-bleachers',
      object: bleacherProxy,
      label: '雾里那片看台的轮廓',
      reach: 85,
      onActivate: () => true,
    })

    /**
     * 垛口。
     *
     * 这一个热点是给"往外看"这个动作一个落点。玩家走到墙前，
     * 准星落在缺口上，提示是一行很轻的字——他不需要点它，
     * 但点下去是允许的。这一节没有闸门，也没有必须完成的动作。
     */
    const merlonProxy = new three.Mesh(
      new three.SphereGeometry(1.4, 10, 8),
      new three.MeshBasicMaterial({ visible: false }),
    )
    merlonProxy.position.set(2.5, PARAPET.height + 0.1, PARAPET.z + 0.4)
    root.add(merlonProxy)

    hotspots.push({
      id: 'city-parapet',
      object: merlonProxy,
      label: '垛口外的风',
      // 垛墙 1.75m 高，眼高 1.68m——站在墙前时眼睛略低于墙顶，
      // 玩家得贴着墙才能让准星越过垛口。3.0m 允许他站在缺口前一步内。
      reach: 3.0,
      onActivate: () => true,
    })

    /* ---------------- 逐帧 ---------------- */

    return {
      colliders,
      occluders,
      hotspots,
      update(elapsed, _delta, player) {
        /**
         * 本场景只有两处动效：云缝缓慢明灭、远处的雾横向漂移。
         * 走道尽头没有事件，没有触发器，没有闸门——终章不需要玩家做任何事。
         */

        /* --- 云缝 --- */

        /**
         * 一条 46 秒的慢波，幅度压到 0.035 到 0.085。
         *
         * 上限 0.085 是刻意的：云缝不能真的把天照亮，它只能让那一块雾
         * "比别处亮一点"。这个量级下，玩家盯着看半分钟才会确定它在变——
         * 而这正是雨停了的样子：天光是一点一点回来的。
         */
        const drift = 0.5 + 0.5 * Math.sin(elapsed * 0.137)
        materials.sunbreak.opacity = 0.035 + drift * 0.05

        /* --- 风：远处的雾 --- */

        /**
         * 由 `elapsed` 直接求值而不是累加位移。
         *
         * 累加会在暂停恢复后跳一下，也会随掉帧漂移；这个项目里
         * 咖啡店场景的雨已经踩过同一个坑，这里沿用同一套写法。
         *
         * 位移量除以 2π 后取模再折算回位置，等价于"以 speed 的角速度转圈"，
         * 但实际观感是匀速横移——因为一个 260m 的跨度远大于视野。
         */
        for (const layer of driftLayers) {
          const travel = ((elapsed * layer.speed) % layer.span) * 2 - layer.span
          layer.mesh.position.x = travel * 0.5
        }

        /* --- 布条 --- */

        /**
         * 顶点位移。两个不同频率的正弦叠加，避免出现规则的节拍——
         * 布在风里是**没有节奏**的，一旦有了周期就会变成机械装置。
         *
         * 越靠下的顶点（y 越小）位移越大：根部钉在垛口上，末端自由。
         */
        const positions = clothGeometry.attributes.position
        for (let i = 0; i < positions.count; i += 1) {
          const baseX = clothBase[i * 3]
          const baseY = clothBase[i * 3 + 1]
          // 0（根部，y = +0.31）到 1（末端，y = -0.31）
          const freedom = (0.31 - baseY) / 0.62
          const wave =
            Math.sin(elapsed * 2.6 + baseY * 3.2) * 0.6 +
            Math.sin(elapsed * 4.1 + baseY * 5.7) * 0.4
          positions.setX(i, baseX + wave * freedom * CLOTH_WAVE)
          // 顺带让末端往下垂一点，布才不会像一块平板
          positions.setY(i, baseY - freedom * 0.04)
        }
        positions.needsUpdate = true

        /* --- 一处极轻的位置反应 --- */

        /**
         * 玩家越靠近垛口，云缝那点天光越亮一点点。
         *
         * 幅度极小（最多再加 0.02），作用不是"反馈"而是**取景**：
         * 走到墙前时，城外那片雾会稍微亮一档，看台的轮廓跟着浮出来一点。
         * 于是"走近一点，才看得清"这件事被重复了一遍——
         * 与第一幕"走近看台"的方向正好相反：那次他走过去了，
         * 这次他只能走到墙边。
         */
        const distanceToParapet = Math.abs(player.z - PARAPET.z)
        const approach = Math.max(0, 1 - distanceToParapet / 12)
        materials.sunbreak.opacity += approach * 0.02

        /**
         * 看台脚下那线琥珀光随玩家靠近而略亮。
         * 与看台场景里水洼随距离变亮是同一手法，
         * 这里是第三次（也是最后一次）使用它——整部作品的一个小签名。
         *
         * 呼吸周期约 30 秒：它不属于任何机制，只是让那一小片光看起来还活着。
         * 这一节里没有任何东西该是死的。
         */
        memoryGlintMaterial.opacity = 0.06 + approach * 0.05 + Math.sin(elapsed * 0.21) * 0.015
      },
      resize() {
        // 这个场景的布景全部按米摆放、与宽高比无关，无需响应
      },
    }
  },
}
