import type { Collider, Hotspot, SceneRuntime, TriggerZone, WorldScene, WorldSceneHandle } from '../types'

/**
 * 场景「多瑙河 · 河边的铜鞋」——第六幕，故事里唯一一次真正的告别。
 *
 * ## 空间布局（坐标即叙事）
 *
 * ```
 *          +Z  夕阳 / 河对岸的城市剪影 / 桥（z ≈ +98 右侧）
 *           ↑
 *           │        水面 + 夕阳的金色光带
 *       z = +25  ──── 栏杆（这一侧是岸）
 *       z = +23  ──── 一排铜鞋 48 只，鞋尖朝着河
 *       z = +21  ──── 路缘石
 *       z =   0  ──── 玩家出生点（长椅旁，面朝 +Z）
 * ```
 *
 * 朝向说明：相机的 `rotation.y = yaw`，实际视线方向是 `(-sin yaw, 0, -cos yaw)`，
 * 所以节点给的 `yaw = π` 意味着玩家看向 **+Z**。整个场景因此建在 +Z 侧——
 * 出生即面对河面与落日，转身才是背后的长椅与树。
 *
 * ## 为什么鞋是"一排"而不是"一堆"
 *
 * 真实纪念地的铜鞋是沿河岸散落的，但玩家在河边步道上是从**侧面**看过去的：
 * 侧向排开的一列小鞋在逆光里就是一串连续的暗色齿痕，比一堆更接近
 * 「整整齐齐地摆着」这句话留下的印象。所以这里刻意做成一列，
 * 只在微观上打散（每双朝向随机偏 ±12°、有前后错落），
 * 宏观上保持一条线。
 *
 * ## 为什么没有人
 *
 * 这个场景里没有一个人影。原文那句「鞋还在，穿鞋的人早就不在了」
 * 只能靠**缺席**来讲：如果我在对岸或步道上放任何人，
 * 玩家第一眼读到的是"这里有人"，而这句话想说的是"这里没有"。
 * 全场唯一的"人物痕迹"是鞋的朝向——全部朝着河。
 */

/** 河岸的横向尺度与关键 z 坐标。多处要用，抽成常量避免两处各写一遍导致失配。 */
const BANK = {
  /** 步道靠城一侧的边缘 */
  backZ: -14,
  /** 路缘石所在 z */
  curbZ: 20.8,
  /** 铜鞋所在的一带（鞋在路缘石与栏杆之间） */
  shoeZ: 22.6,
  /** 铜鞋沿 x 的铺开范围 */
  shoeSpan: 34,
  /** 栏杆所在 z。玩家停在它前面，鞋在它外侧——伸手可及但走不过去 */
  railZ: 25.2,
  /** 岸壁外沿，再往外就是水面 */
  edgeZ: 26.4,
  /** 水面高度。比步道低下去，玩家从上往下看才会意识到这是"岸" */
  waterY: -0.34,
  /** 水面向远处铺开的长度 */
  waterRun: 420,
} as const

/** 太阳在世界里的位置（含 y）。水面的光带与岸上的长影都要按它算，所以提出来。 */
const SUN = { x: 20, y: 2.4, z: 100 } as const

/** 场景调色板。沿用项目既有的墨绿灰阶 + 琥珀强调色，不另起一套。 */
const PALETTE = {
  deck: 0x191f21,
  stone: 0x141b1c,
  water: 0x0f1517,
  structure: 0x101619,
  bridge: 0x0d1213,
  /** 铜鞋的基色。比结构色暖一点、亮一点，让它们从栏杆与地面上分离出来 */
  copper: 0x6a5a48,
  /** 鞋尖与鞋口的高光条。全场最亮的东西，靠它把"反着光"做出来 */
  sheen: 0xc8a878,
  /** 远处的灯与窗。极少量，只在对岸与步道尽头，避免抢掉落日的分量 */
  lamp: 0xe0b880,
} as const

export const danubeScene: WorldScene = {
  id: 'danube',
  caption: '多瑙河 · 河边的铜鞋',
  /** 固定种子。同一批鞋、同一批水纹，每次进入都必须在同一个位置。 */
  seed: 0x5e9e09,

  build(runtime: SceneRuntime): WorldSceneHandle {
    const { three, root, random } = runtime

    /* ---------------- 取景 ---------------- */

    /**
     * 太阳方向（单位向量），天空着色器与水面光带共用。
     *
     * 为什么必须共用一个来源：天空里的落日与水面上的倒影如果各算各的，
     * 只要有一处改动了位置，玩家就会看到"太阳在这里、倒影在那里"，
     * 那一瞬间整个场景的物理可信度就没了。这里的代价只是多一个常量。
     */
    const sunDir = new three.Vector3(SUN.x, SUN.y, SUN.z).normalize()
    /** 太阳的方位角（水平面上的方向）。水面光带的收束、天空的暖区都按它算。 */
    const sunAzimuth = Math.atan2(SUN.x, SUN.z)

    /** 落日方向在水平面上的单位向量，用来给长影定向。 */
    const shadowDir = new three.Vector3(-SUN.x, 0, -SUN.z).normalize()
    /** 长影椭圆绕 Y 的旋转量：把默认沿 +X 的长轴转到影子方向上。 */
    const shadowYaw = Math.atan2(-shadowDir.z, shadowDir.x)

    /* ---------------- 材质 ---------------- */

    /**
     * 全场共用一组材质。
     *
     * 每个网格各建一份材质在剪影风里没有收益（颜色本来就只有几种），
     * 却会让骨架回收时要遍历的材质对象多出几十个。共用之下，
     * 骨架对同一份材质会重复 dispose——这是安全的，three 的 `dispose()` 幂等。
     */
    const materials = {
      /** 步道石板。比场地地面暖一档，才像被落日晒过 */
      deck: new three.MeshLambertMaterial({ color: PALETTE.deck }),
      stone: new three.MeshLambertMaterial({ color: PALETTE.stone }),
      structure: new three.MeshLambertMaterial({ color: PALETTE.structure }),
      bridge: new three.MeshLambertMaterial({ color: PALETTE.bridge }),
      /**
       * 水面用 Lambert 而不是 Basic：水面要能接住垂直方向的天空色，
       * Basic 不吃光，整片河会是死平的一块。
       */
      water: new three.MeshLambertMaterial({ color: PALETTE.water }),
      /**
       * 铜鞋的鞋身。
       *
       * 全场只有这一处用 `MeshStandardMaterial`：其余物件是剪影，
       * 而鞋必须"反着光"——那是这段故事唯一的视觉动词。
       * Lambert 没有镜面项，做成同样的暗色就只是一排黑鞋。
       * `metalness` 取 0.35 而不是更高：没有环境贴图时，金属度过高会让
       * 表面只剩光源的高光点、丢掉自身的颜色，在这套灰阶里就是"消失"。
       */
      copper: new three.MeshStandardMaterial({
        color: PALETTE.copper,
        metalness: 0.35,
        roughness: 0.4,
        emissive: 0x1a1409,
      }),
      /** 鞋尖与鞋口的高光条。Basic + 透明，保证任何视角下都留着那道亮痕 */
      sheen: new three.MeshBasicMaterial({
        color: PALETTE.sheen,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
      }),
      /** 水面上被夕阳照亮的那一条金带 */
      glow: new three.MeshBasicMaterial({
        color: PALETTE.sheen,
        transparent: true,
        opacity: 0.14,
        depthWrite: false,
      }),
      /** 岸上的长影。比地面暗两档，用半透明混过去，不做真实阴影 */
      shadow: new three.MeshBasicMaterial({
        color: 0x05090a,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
      }),
      /** 步道尽头的灯。极暗的琥珀，只是给"城市在这边"一个提示 */
      lamp: new three.MeshBasicMaterial({
        color: PALETTE.lamp,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      }),
    }

    const colliders: Collider[] = []
    const occluders: import('three').Object3D[] = []

    /* ---------------- 天空与落日 ---------------- */

    /**
     * 天空用一个大球壳 + 自定义着色器，而不是 `scene.background` 的纯色。
     *
     * 骨架把背景设成了雾色，那是为了操场那种"阴天无景可看"的场景。
     * 这里恰好相反：整幕故事的全部视觉张力都来自**低角度的落日**，
     * 而 `FogExp2` 只按距离衰减、不认方向，纯色背景做不出
     * "一侧暖、另一侧冷"的天。球壳画在雾之外（半径远大于可见范围），
     * 所以它本身不会被雾吃掉。
     *
     * 为什么不用贴图：项目约定不引入外部资源，而且 3 个颜色插值就够——
     * 这套画面里天空只承担一件事：告诉玩家太阳在哪、离地平线多近。
     */
    const skyMaterial = new three.ShaderMaterial({
      side: three.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uSunDir: { value: sunDir.clone() },
        uZenith: { value: new three.Color(0x0b1113) },
        uHorizon: { value: new three.Color(0x1e2929) },
        uWarm: { value: new three.Color(0x9a6a3a) },
        uSun: { value: new three.Color(0xe8c89a) },
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          // position 是球面上一点，球心在原点，所以它本身就是方向
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uSunDir;
        uniform vec3 uZenith;
        uniform vec3 uHorizon;
        uniform vec3 uWarm;
        uniform vec3 uSun;
        varying vec3 vDir;

        void main() {
          vec3 dir = normalize(vDir);
          // 地平线附近 -> 天顶：指数曲线让暖色只在很低的一条带上
          float h = clamp(dir.y, 0.0, 1.0);
          vec3 sky = mix(uHorizon, uZenith, pow(h, 0.55));

          float toSun = max(dot(dir, uSunDir), 0.0);
          // 落日周围一团紧的暖晕。指数 12 是为了让它只糊住太阳附近，
          // 拉低会变成整片天都发黄，落日就不再是一个"点"了
          sky += uWarm * pow(toSun, 12.0) * 0.75;
          // 贴着地平线的一层晚霞。乘 (1-h)^4 把它压在低空，
          // 否则抬头会看见天顶也在发光，那是正午不是黄昏
          sky += uWarm * pow(1.0 - h, 4.0) * 0.3 * smoothstep(-0.1, 0.55, toSun);
          // 太阳本体
          sky += uSun * smoothstep(0.9993, 0.99985, toSun) * 1.6;

          gl_FragColor = vec4(sky, 1.0);
          #include <colorspace_fragment>
        }
      `,
    })
    const sky = new three.Mesh(new three.SphereGeometry(600, 24, 16), skyMaterial)
    root.add(sky)
    occluders.push(sky)

    /**
     * 落日的实体盘与它的热点代理。
     *
     * 为什么在天空着色器里画了太阳之后还要一个网格：天空球是 `BackSide` 的
     * 巨大球壳，热点挂在它上面等于"随便看向哪个方向都在点太阳"。
     * 这里放一个真的小盘，`reach` 才有一个物理上说得通的对象。
     * 盘面正对原点，玩家绕到侧面会看到它变薄——但玩家本来也不会绕到河对岸去。
     */
    const sunDisc = new three.Mesh(
      new three.CircleGeometry(4.6, 24),
      new three.MeshBasicMaterial({ color: 0xf0d3a0, transparent: true, opacity: 0.9, fog: false }),
    )
    sunDisc.position.set(SUN.x, SUN.y, SUN.z)
    sunDisc.lookAt(0, 1.68, 0)
    root.add(sunDisc)

    /** 太阳外圈的晕。加法混合，把小盘的亮度散开一圈 */
    const sunHalo = new three.Mesh(
      new three.CircleGeometry(17, 24),
      new three.MeshBasicMaterial({
        color: PALETTE.sheen,
        transparent: true,
        opacity: 0.1,
        blending: three.AdditiveBlending,
        depthWrite: false,
        fog: false,
      }),
    )
    sunHalo.position.copy(sunDisc.position)
    sunHalo.quaternion.copy(sunDisc.quaternion)
    root.add(sunHalo)

    // 拾取代理：比可见的盘大一圈，让"对着太阳点一下"有个宽容的窗口
    const sunProxy = new three.Mesh(
      new three.SphereGeometry(22, 8, 6),
      new three.MeshBasicMaterial({ visible: false }),
    )
    sunProxy.position.copy(sunDisc.position)
    root.add(sunProxy)

    /* ---------------- 水面与步道 ---------------- */

    /**
     * 水面。
     *
     * 用 `PlaneGeometry` 并保留分段，因为顶点要在 `update` 里被微微推成波纹。
     * 不做真实反射（那要额外一遍渲染或多一遍相机），剪影风里
     * "水面"的信息量全部由那条金色光带提供，水面本身只要够暗就成立。
     */
    const waterGeometry = new three.PlaneGeometry(520, BANK.waterRun, 32, 26)
    const water = new three.Mesh(waterGeometry, materials.water)
    water.rotation.x = -Math.PI / 2
    water.position.set(0, BANK.waterY, BANK.edgeZ + BANK.waterRun / 2)
    root.add(water)
    occluders.push(water)

    /**
     * 步道石板。
     *
     * 做成一块厚板而不是一张平面：河岸是有**高度**的。
     * 玩家站在步道上时，水在脚下一档，这个落差就是"岸"这个概念的来源；
     * 一张平铺的平面会让河看起来只是地面上的一块蓝色贴纸。
     */
    const deck = new three.Mesh(
      new three.BoxGeometry(150, 0.7, BANK.edgeZ - BANK.backZ),
      materials.deck,
    )
    deck.position.set(0, -0.35, (BANK.edgeZ + BANK.backZ) / 2)
    root.add(deck)
    occluders.push(deck)

    /**
     * 石板缝。
     *
     * 与操场用薄盒子画白线同一个取舍：贴图要生成 canvas 纹理、
     * 要处理各向异性过滤与 mipmap，而这里只需要"地面被分成了板"这一个信息。
     * 薄盒子便宜、不用纹理，且天然吃雾——远端的缝会自动淡掉，
     * 视觉上正好像真的走远了。
     */
    const seams = new three.Group()
    for (let x = -70; x <= 70; x += 4.2) {
      const seam = new three.Mesh(new three.BoxGeometry(0.05, 0.02, BANK.edgeZ - BANK.backZ), materials.structure)
      seam.position.set(x, 0.011, (BANK.edgeZ + BANK.backZ) / 2)
      seams.add(seam)
    }
    for (let z = BANK.backZ + 3; z < BANK.edgeZ; z += 4.2) {
      const seam = new three.Mesh(new three.BoxGeometry(140, 0.02, 0.05), materials.structure)
      seam.position.set(0, 0.012, z)
      seams.add(seam)
    }
    root.add(seams)

    // 路缘石：隔开步道与铜鞋那一带，也是"这里开始不是给你走的"的第一道暗示
    const curb = new three.Mesh(new three.BoxGeometry(150, 0.26, 0.5), materials.stone)
    curb.position.set(0, 0.13, BANK.curbZ)
    root.add(curb)
    occluders.push(curb)

    // 岸壁：从路缘石外侧直落水面，做出河岸的高度
    const quay = new three.Mesh(new three.BoxGeometry(150, 1.4, 0.8), materials.structure)
    quay.position.set(0, -0.4, BANK.edgeZ - 0.4)
    root.add(quay)
    occluders.push(quay)

    /* ---------------- 夕阳的金色光带 ---------------- */

    /**
     * 水面上的反光。
     *
     * 用一串沿视线方向铺开的横条，而不是一个大平面：横条在低角度下
     * 会自然叠出"一层一层的波光"，而整片贴上去只会是一块均匀的亮斑。
     * 每条的宽度与透明度都按**方位角**收束到太阳所在的方向上——
     * 这正是真实水面反光的形状：一条从岸边直指落日的窄路。
     *
     * 位置全部走 `random`，保证同一 seed 每次都是同一片光。
     */
    const glints: { mesh: import('three').Mesh; baseOpacity: number; phase: number }[] = []
    const glintCount = 46
    for (let i = 0; i < glintCount; i += 1) {
      // 越靠近太阳（远处）越窄，模拟透视下的收束
      const progress = i / (glintCount - 1)
      const width = 1.4 + (1 - progress) * 16
      const z = BANK.edgeZ + 2 + progress * (BANK.waterRun * 0.42)
      // 横向摆动：用方位角把光带压到太阳那一侧，再让每一条自己抖一点
      const drift = random.swing(2.6) + Math.tan(sunAzimuth) * (z - BANK.edgeZ) * 0.55
      const glint = new three.Mesh(
        new three.PlaneGeometry(width, 0.5 + random.range(0.2, 1.1)),
        materials.glow.clone(),
      )
      glint.rotation.x = -Math.PI / 2
      glint.position.set(SUN.x * 0.35 + drift, BANK.waterY + 0.02, z)
      glint.renderOrder = 1
      // 远处的光条亮一点（那里正对落日），近岸的只是余光
      const opacity = 0.06 + progress * 0.16
      glint.material.opacity = opacity
      glints.push({ mesh: glint, baseOpacity: opacity, phase: random.range(0, Math.PI * 2) })
      root.add(glint)
    }

    /* ---------------- 栏杆 ---------------- */

    /**
     * 河岸栏杆。
     *
     * 它是这个场景里**唯一挡在玩家和河之间的东西**，也是叙事上的关键：
     * 玩家能看见鞋、能伸手够到鞋的提示，但走不过去。
     * 所以它必须实心（进 `occluders`），否则玩家能隔着栏杆点到水里的东西。
     */
    const railing = new three.Group()
    const railLength = 150
    // 上扶手与中横杆
    for (const y of [1.02, 0.62]) {
      const bar = new three.Mesh(new three.BoxGeometry(railLength, 0.07, 0.07), materials.structure)
      bar.position.set(0, y, BANK.railZ)
      railing.add(bar)
    }
    // 立柱：间距 2.4m，是欧洲河岸栏杆的常见尺度，也让远处能读出节奏
    for (let x = -75; x <= 75; x += 2.4) {
      const post = new three.Mesh(new three.BoxGeometry(0.07, 1.05, 0.07), materials.structure)
      post.position.set(x, 0.52, BANK.railZ)
      railing.add(post)
    }
    root.add(railing)
    occluders.push(railing)

    /**
     * 栏杆的碰撞体。
     *
     * `halfZ` 取 0.75 而不是立柱的真实厚度 0.035：
     * 玩家半径 0.35，若按 0.035 给，玩家能贴到 z≈24.8——那时铜鞋
     * （在 22.9~24.3）会整个落在身后，反而看不见。
     * 给到 0.75 之后玩家的可行进边界停在 z≈24.1，
     * 正好是"站在栏杆前、低头就能看清鞋"的那个位置。
     */
    colliders.push({ kind: 'box', x: 0, z: BANK.railZ, halfX: railLength / 2, halfZ: 0.75 })

    /* ---------------- 铜鞋 ---------------- */

    /**
     * 一双铜鞋的几何。
     *
     * 用三个共享几何体拼：鞋底（扁盒）、鞋身（略收的四棱台）、鞋头（更小的一节）。
     * 刻意不做鞋带、鞋跟、脚踝这些细节——在 5 米以外它们全是噪点，
     * 而玩家读到"这是一双鞋"只需要一个**带方向的前宽后窄轮廓**。
     *
     * 几何体共享、只靠 `scale` 区分大小：48 只鞋若各建一份几何体，
     * 就是 144 份顶点数据；共享之后每只鞋只是三个矩阵。
     */
    const shoeForms = {
      sole: new three.BoxGeometry(0.34, 0.045, 0.6),
      body: new three.BoxGeometry(0.3, 0.11, 0.62),
      toe: new three.BoxGeometry(0.21, 0.08, 0.22),
      /** 鞋口的高光条：贴在鞋身后半截的上沿 */
      lip: new three.BoxGeometry(0.31, 0.012, 0.2),
      /** 鞋尖的高光条：正对着西边的那一小段亮边 */
      cap: new three.BoxGeometry(0.22, 0.012, 0.06),
    }

    const shoeRoot = new three.Group()
    const shadows = new three.Group()
    /** 每一组鞋（同一处摆放的 1~3 双）作为一个热点单位。 */
    const shoeGroups: { group: import('three').Group; center: import('three').Vector3; count: number }[] = []
    const hotspots: Hotspot[] = []

    /**
     * 鞋的摆放。
     *
     * 布局是**成组**的：真实纪念地上鞋是一双一双、三五只一起摆的，
     * 不是等距排队。所以先在 x 上铺开若干组，组内再放 1~3 双，
     * 组内抖动小（0.3m 量级）、组间位置靠 `random` 决定但不均匀，
     * 宏观上仍是一条线。每双再单独旋转一个 ±12° 的偏移——
     * "整整齐齐"与"被人脱下时随手一放"之间的那点差别，全在这个角度里。
     */
    const groupCenters: { x: number; count: number; label: string | null }[] = [
      { x: -BANK.shoeSpan * 0.5, count: 2, label: null },
      { x: -BANK.shoeSpan * 0.34, count: 3, label: '并排摆着的三双' },
      { x: -BANK.shoeSpan * 0.2, count: 1, label: '一双很小的鞋' },
      { x: -BANK.shoeSpan * 0.06, count: 2, label: null },
      { x: BANK.shoeSpan * 0.08, count: 3, label: '鞋尖朝着河' },
      { x: BANK.shoeSpan * 0.2, count: 2, label: '一只鞋单独放着' },
      { x: BANK.shoeSpan * 0.32, count: 3, label: null },
      { x: BANK.shoeSpan * 0.44, count: 2, label: '鞋跟磨得很平的一双' },
    ]

    for (const slot of groupCenters) {
      const group = new three.Group()
      // 组中心：在给定 x 上抖一点，并让整组沿 z 有轻微前后错落
      const groupX = slot.x + random.swing(0.5)
      const groupZ = BANK.shoeZ + random.swing(0.42)

      for (let i = 0; i < slot.count; i += 1) {
        const shoe = new three.Group()
        // 尺码：成人鞋 0.86~1.06，那一双"很小的鞋"刻意压到 0.6 左右
        const scale = slot.label === '一双很小的鞋' ? random.range(0.54, 0.63) : random.range(0.86, 1.06)

        const sole = new three.Mesh(shoeForms.sole, materials.copper)
        sole.position.y = 0.022
        const body = new three.Mesh(shoeForms.body, materials.copper)
        body.position.set(0, 0.1, 0.02)
        const toe = new three.Mesh(shoeForms.toe, materials.copper)
        // 鞋头压得更低更窄：这个"前低后高"是鞋的轮廓能被一眼认出的原因
        toe.position.set(0, 0.055, 0.36)
        const lip = new three.Mesh(shoeForms.lip, materials.sheen)
        lip.position.set(0, 0.16, -0.22)
        const cap = new three.Mesh(shoeForms.cap, materials.sheen)
        cap.position.set(0, 0.093, 0.44)

        shoe.add(sole, body, toe, lip, cap)
        shoe.scale.setScalar(scale)
        // 组内偏移：同组的两三只鞋贴得很近，但绝不重叠
        shoe.position.set((i - (slot.count - 1) / 2) * 0.46 + random.swing(0.06), 0, random.swing(0.14))
        /**
         * 鞋尖一律朝河（+Z）。
         *
         * 模型自身的鞋尖在 +Z，而玩家在 -Z 一侧看，所以鞋尖是背着玩家的。
         * 这正是要的：玩家看到的是**一排鞋跟**，鞋尖指着水面。
         * 若把鞋转过来鞋尖朝人，就成了商店橱窗，那句"鞋还在"也就不用读了。
         */
        shoe.rotation.y = random.swing(0.21)

        group.add(shoe)

        /**
         * 每只鞋自己的长影。
         *
         * 不用真实阴影贴图：全场只有一个低角度平行光，而阴影贴图要额外的
         * 深度 pass、要调 bias（低角度下极容易出现条纹与摩尔纹），
         * 而这个场景要的只是"地上有一道朝东拉长的黑"。
         * 用一个压扁的圆片按太阳方向拉长即可，代价几乎为零。
         */
        const shadow = new three.Mesh(new three.CircleGeometry(0.5, 12), materials.shadow)
        shadow.rotation.x = -Math.PI / 2
        // 圆片默认在 XY 平面，先绕 Z 转到长轴方向，再由外层网格绕 X 放平
        shadow.rotation.z = shadowYaw
        shadow.scale.set(4.6, 1, 1)
        shadow.position.set(0, 0.004, 0)
        shadow.renderOrder = 0
        const shadowHolder = new three.Group()
        shadowHolder.position.set(shoe.position.x, 0, shoe.position.z)
        shadowHolder.add(shadow)
        shadows.add(shadowHolder)
      }

      group.position.set(groupX, 0.02, groupZ)
      shoeRoot.add(group)
      // 影子是相对鞋组的位置生成的，整体再平移到鞋组处
      shadows.children[shadows.children.length - 1].position.add(new three.Vector3(groupX, 0, groupZ))

      const center = new three.Vector3(groupX, 0.08, groupZ)
      shoeGroups.push({ group, center, count: slot.count })
      if (slot.label) {
        /**
         * 带名字的组要一个独立的拾取代理。
         *
         * 理由同操场上的白裙子：鞋由五个很小的网格拼成，射线穿过它们的窗口很窄，
         * 玩家会觉得"明明对着它却点不中"。用一个不可见的球把所有部件包起来，
         * 拾取窗口就变成了整组鞋的轮廓。
         * 球体用 `material.visible = false` 而不是 `visible = false`：
         * 后者会让射线跳过它，而我们要的是"看不见但能点"。
         */
        const proxy = new three.Mesh(
          new three.SphereGeometry(0.75 + slot.count * 0.12, 10, 8),
          new three.MeshBasicMaterial({ visible: false }),
        )
        proxy.position.copy(center)
        proxy.position.y = 0.3
        root.add(proxy)
      }
    }
    root.add(shadows)
    root.add(shoeRoot)

    /**
     * 单个鞋组的可达距离。
     *
     * 按契约，`reach` 是**从眼睛量起的三维距离**，眼高 1.68m。
     * 玩家被栏杆挡在 z≈24.1，鞋中心在 z≈22.6、y≈0.08，
     * 所以最近时的三维距离约 √(1.5² + 1.6²) ≈ 2.2m。
     * 取 2.6 是留了半步余量：站在栏杆前能点到，隔着三四米就点不到——
     * 「能看清但够不着」在这里是错的，这一段的意义恰恰是**够得着**。
     */
    for (let i = 0; i < shoeGroups.length; i += 1) {
      const entry = shoeGroups[i]
      const label = groupCenters[i].label
      hotspots.push({
        id: `bronze-shoes-${i + 1}`,
        object: entry.group,
        label: label ?? '一排铜鞋',
        reach: 2.6 + entry.count * 0.2,
        onActivate: () => true,
      })
    }

    /* ---------------- 桥 ---------------- */

    /**
     * 远处的桥。
     *
     * 放在 x=+55 一侧而不是正前方：正前方必须留给落日。
     * 桥在这个场景里承担的是"河的尺度"——没有它，那条金带会像一片湖，
     * 有了桥墩之间的跨度，玩家才知道水有多宽。
     *
     * 造型上只有两根塔柱、一根水平主梁与几条拉索，全靠剪影。
     * 桥面必须**高于**落日所在的低空带（SUN.y=2.4 换算到 z=98 处
     * 在视线里几乎贴着地平线），所以塔高取 26m——先立起来，
     * 才能在天上切出一条横线，告诉玩家这不是天边而是人造物。
     */
    const bridge = new three.Group()
    /** 桥整体跨度沿 x 铺开，跨过玩家的右侧视野 */
    const bridgeSpanX = 190
    for (const towerX of [58, 148]) {
      const tower = new three.Mesh(new three.BoxGeometry(2.6, 26, 2.6), materials.bridge)
      tower.position.set(towerX, 12.6, SUN.z - 2)
      bridge.add(tower)
      // 塔上的一条横档：剪影里的桥都是靠这几个"T"字被认出来的
      const cross = new three.Mesh(new three.BoxGeometry(9, 0.9, 1.4), materials.bridge)
      cross.position.set(towerX, 21, SUN.z - 2)
      bridge.add(cross)
    }
    // 主梁：桥面
    const bridgeDeck = new three.Mesh(new three.BoxGeometry(bridgeSpanX, 1.6, 9), materials.bridge)
    bridgeDeck.position.set(bridgeSpanX / 2 + 16, 7.2, SUN.z - 2)
    bridge.add(bridgeDeck)
    // 拉索：从塔顶拉到主梁，只画 8 条，多了在雾里会糊成一团
    for (let i = 0; i < 8; i += 1) {
      const cable = new three.Mesh(new three.BoxGeometry(0.22, 20, 0.22), materials.bridge)
      const spread = 10 + i * 15
      cable.position.set(58 + spread, 16, SUN.z - 2)
      // 拉索是斜的：绕 Z 转动让它一头在塔顶、一头落到桥面上
      cable.rotation.z = -0.62
      bridge.add(cable)
    }
    root.add(bridge)
    occluders.push(bridge)

    /* ---------------- 对岸 ---------------- */

    /**
     * 河对岸的城市剪影。
     *
     * 这一片的存在意义是**界定地平线**：没有它，水面与天空会在地平线处
     * 连成一片无法分辨的灰，玩家读不出"河有多远"。
     * 高度全部压在 14m 以下（在 175m 外，换算成仰角只有 4° 左右），
     * 绝不会挡住上方那片天空。
     */
    const farBank = new three.Group()
    for (let i = 0; i < 26; i += 1) {
      const width = random.range(6, 16)
      const height = random.range(6, 14)
      const block = new three.Mesh(new three.BoxGeometry(width, height, random.range(6, 12)), materials.bridge)
      block.position.set(random.range(-140, 140), height / 2 - 0.3, random.range(SUN.z + 62, SUN.z + 92))
      farBank.add(block)
      // 极少数窗户亮着。数量少是刻意的：多一格，落日就少一分
      if (random.chance(0.18)) {
        const window = new three.Mesh(new three.PlaneGeometry(0.9, 1.1), materials.lamp)
        window.position.set(
          block.position.x + random.swing(width * 0.3),
          height * random.range(0.35, 0.8),
          block.position.z - 5.2,
        )
        farBank.add(window)
      }
    }
    root.add(farBank)
    occluders.push(farBank)

    // 对岸的树线：把建筑与水面之间的那条硬边揉开
    const farTrees = new three.Group()
    for (let i = 0; i < 34; i += 1) {
      const crown = new three.Mesh(new three.IcosahedronGeometry(random.range(2.6, 5.2), 0), materials.bridge)
      crown.position.set(random.range(-150, 150), random.range(1.4, 4.2), random.range(SUN.z + 22, SUN.z + 46))
      farTrees.add(crown)
    }
    root.add(farTrees)
    occluders.push(farTrees)

    /* ---------------- 长椅 ---------------- */

    /**
     * 河边的一把长椅。
     *
     * 放在玩家背后的 -Z 侧，朝向河（背板朝城）。
     * "朝河"这件事是有讲究的：这段故事里他站了很久，
     * 而人站着看累了会想坐——但椅子是空的，坐的人也不在了。
     * 它同时是转身之后的第一个可交互物，把玩家自然带回河边。
     */
    const bench = new three.Group()
    const benchSeat = new three.Mesh(new three.BoxGeometry(1.9, 0.09, 0.52), materials.structure)
    benchSeat.position.set(0, 0.44, 0)
    const benchBack = new three.Mesh(new three.BoxGeometry(1.9, 0.42, 0.07), materials.structure)
    benchBack.position.set(0, 0.72, 0.24)
    bench.add(benchSeat, benchBack)
    for (const legX of [-0.8, 0.8]) {
      const leg = new three.Mesh(new three.BoxGeometry(0.08, 0.44, 0.46), materials.structure)
      leg.position.set(legX, 0.22, 0)
      bench.add(leg)
    }
    // 椅面上一线被夕阳打出来的琥珀色。全场只有两处非鞋的亮色，这是其中之一
    const benchShine = new three.Mesh(new three.PlaneGeometry(1.88, 0.5), materials.glow.clone())
    benchShine.material.opacity = 0.16
    benchShine.rotation.x = -Math.PI / 2
    benchShine.position.set(0, 0.492, 0)
    bench.add(benchShine)
    bench.position.set(-5.5, 0, -3.2)
    bench.rotation.y = Math.PI
    root.add(bench)

    const benchProxy = new three.Mesh(
      new three.BoxGeometry(2.1, 1, 0.7),
      new three.MeshBasicMaterial({ visible: false }),
    )
    benchProxy.position.set(bench.position.x, 0.5, bench.position.z)
    root.add(benchProxy)
    colliders.push({ kind: 'box', x: bench.position.x, z: bench.position.z, halfX: 1.05, halfZ: 0.4 })
    occluders.push(bench)

    /* ---------------- 灯与树 ---------------- */

    /**
     * 步道尽头的路灯。
     *
     * 灯**不能多**。这个场景的全部亮度预算都给了那排鞋，
     * 多立一盏灯，鞋上的高光就不再是全场最亮的东西，
     * "夕阳照在上面反着光"这句话也就落空了。
     * 所以只放两盏，而且都在侧后方的远处，只负责交代"城市在背后"。
     */
    const lamps = new three.Group()
    const lampLights: import('three').Mesh[] = []
    for (const spec of [
      { x: -21, z: -6, height: 4.6 },
      { x: 26, z: -2, height: 4.2 },
    ]) {
      const post = new three.Mesh(new three.CylinderGeometry(0.09, 0.13, spec.height, 8), materials.structure)
      post.position.set(spec.x, spec.height / 2, spec.z)
      lamps.add(post)
      const bulb = new three.Mesh(new three.SphereGeometry(0.22, 10, 8), materials.lamp)
      bulb.position.set(spec.x, spec.height, spec.z)
      lamps.add(bulb)
      lampLights.push(bulb)
      // 灯罩：让灯变得"有方向"，不然只是一个悬在空中的亮点
      const hood = new three.Mesh(new three.ConeGeometry(0.42, 0.34, 10, 1, true), materials.structure)
      hood.position.set(spec.x, spec.height + 0.22, spec.z)
      lamps.add(hood)
      colliders.push({ kind: 'cylinder', x: spec.x, z: spec.z, radius: 0.3 })
    }
    root.add(lamps)

    // 步道背面的几棵树，位置用固定种子抖动——同一 seed 每次都在同一处
    const trees = new three.Group()
    for (let i = 0; i < 9; i += 1) {
      const x = random.range(-58, 58)
      const z = random.range(BANK.backZ - 12, BANK.backZ - 1)
      // 城一侧的树比操场上的高：它们离玩家近，矮了会被雾整片抹掉
      const height = random.range(6.5, 10)
      const trunk = new three.Mesh(new three.CylinderGeometry(0.2, 0.3, height, 6), materials.structure)
      trunk.position.set(x, height / 2, z)
      trees.add(trunk)
      const crown = new three.Mesh(new three.IcosahedronGeometry(random.range(2.2, 3.2), 0), materials.structure)
      crown.position.set(x, height + 0.7, z)
      trees.add(crown)
      colliders.push({ kind: 'cylinder', x, z, radius: 0.5 })
    }
    root.add(trees)
    occluders.push(trees)

    /* ---------------- 可交互 ---------------- */

    hotspots.push({
      id: 'evening-light',
      object: sunProxy,
      label: '落在河面上的夕阳',
      /**
       * 100 米。这是全场最远的一个 `reach`，刻意的。
       *
       * 在这个场景里，"看落日"和"看鞋"是两件不同的事：
       * 鞋可以走近看，落日不行——你只能站在这里看着它一点一点沉下去。
       * 距离本身就是那一幕的全部内容。
       * 雾在 100m 处的透过率只剩约 15%，所以再远一点它就沉进雾里，
       * 这个 reach 同时也是"还看得见"的边界。
       */
      reach: 100,
      onActivate: () => true,
    })

    hotspots.push({
      id: 'bench-by-the-river',
      object: benchProxy,
      label: '空着的长椅',
      // 长椅在零米处、椅面高 0.45：站在它旁边时眼睛到椅面的距离约 1.7m
      reach: 2.4,
      onActivate: () => true,
    })

    /**
     * 桥上的热点。
     *
     * 挂在桥的主梁上而不是整座桥（`bridge` 组）：组的包围盒会把两座塔
     * 之间的空处也框进去，玩家准星对着河面上的天空也能点到桥。
     */
    hotspots.push({
      id: 'far-bridge',
      object: bridgeDeck,
      label: '河上的桥',
      /**
       * 78 米。桥在 z=98、玩家最多走到 z=24，水平距离 74m，
       * 加上眼高差后三维距离约 74.1m。给 78 是刚好够到，
       * 让玩家必须走到栏杆边、把身体探向水面那一侧才能点中。
       */
      reach: 78,
      onActivate: () => true,
    })

    const railProxy = new three.Mesh(
      new three.BoxGeometry(railLength, 1.1, 0.9),
      new three.MeshBasicMaterial({ visible: false }),
    )
    railProxy.position.set(0, 0.55, BANK.railZ)
    root.add(railProxy)
    hotspots.push({
      id: 'quay-railing',
      object: railProxy,
      label: '被手掌磨亮的栏杆',
      reach: 2.4,
      onActivate: () => true,
    })

    /* ---------------- 触发区域 ---------------- */

    /**
     * 三个触发点，都只是节奏标记，**不推进剧情**。
     *
     * 这个场景没有闸门——玩家进来之后随时可以做选择，
     * 所以我们没有任何理由用触发器去拦他。这里的三个区域
     * 只做一件事：当玩家**自己走到**某处时，确认一下他确实看见了。
     *
     * 为什么不做成"进入即弹面板"：那会把"站在河边很久"这件事变成
     * 一次点击任务。玩家愿意在这里站多久，是这个场景唯一要测量的东西。
     */
    const triggers: TriggerZone[] = [
      {
        id: 'before-the-shoes',
        x: -12,
        z: 20,
        radius: 5,
        onEnter: () => true,
      },
      {
        id: 'at-the-railing',
        x: 2,
        z: 23.4,
        radius: 4.4,
        onEnter: () => true,
      },
      {
        id: 'walking-the-row',
        x: 12,
        z: 21,
        radius: 5,
        onEnter: () => true,
      },
    ]

    /* ---------------- 逐帧 ---------------- */

    /** 水面顶点的原始高度，逐帧在它之上叠加波纹，避免累积漂移。 */
    const waterPositions = waterGeometry.getAttribute('position')
    const waterBase = (waterPositions.array as Float32Array).slice()

    /**
     * 船。
     *
     * 两条，一近一远。船在这个场景里不做叙事（不像操场上的白裙子），
     * 它只提供**尺度与时间**：水面上唯一会动的东西，
     * 让玩家意识到河是活的、太阳是在落的。
     * 位置用 `elapsed` 算出而不是逐帧累加——累加会让帧率影响船速，
     * 而且切回来时会对不上同一个相位。
     */
    const boatSpecs = [
      { z: 62, speed: 0.022, offset: 0, scale: 1.5 },
      { z: 118, speed: 0.016, offset: 210, scale: 2.2 },
    ]
    const boats = boatSpecs.map((spec) => {
      const boat = new three.Group()
      const hull = new three.Mesh(new three.BoxGeometry(7, 1, 2.6), materials.bridge)
      hull.position.y = 0.5
      const cabin = new three.Mesh(new three.BoxGeometry(2.4, 1.3, 2.2), materials.bridge)
      cabin.position.set(-0.8, 1.6, 0)
      boat.add(hull, cabin)
      boat.scale.setScalar(spec.scale)
      boat.position.set(0, BANK.waterY, spec.z)
      root.add(boat)
      return { boat, spec }
    })

    return {
      colliders,
      occluders,
      hotspots,
      triggers,

      /**
       * 没有 `onGateSatisfied`。
       *
       * 这一段不需要闸门：玩家在河边站了多久、看没看见那排鞋都不影响
       * 他做那个决定。硬加一个"必须先看完鞋才能选"的门，
       * 等于替玩家判断什么才是重要的——而这段记忆的性质恰恰是
       * 他自己也不知道哪一秒下定了决心。
       */

      update(elapsed, _delta, player) {
        /* 水面波纹：两组不同波长与方向的正弦叠加。单个正弦会看出明显的条纹周期 */
        const array = waterPositions.array as Float32Array
        for (let i = 0; i < array.length; i += 3) {
          const x = waterBase[i]
          const z = waterBase[i + 2]
          array[i + 2] =
            waterBase[i + 2] +
            Math.sin(x * 0.16 + elapsed * 0.9) * 0.045 +
            Math.sin(z * 0.09 - elapsed * 0.6) * 0.03
        }
        waterPositions.needsUpdate = true

        /**
         * 金带的呼吸。
         *
         * 每条光带按自己的相位微微明灭，模拟水面被风吹皱时反光忽明忽暗。
         * 幅度压得很小（±25% 的基准值）：大了会变成频闪，
         * 而这套画面里所有动效都应该是"看不出在动，但停下来会觉得不对"。
         */
        for (const glint of glints) {
          /**
           * 窄化材质类型：`Mesh.material` 的静态类型是 `Material | Material[]`，
           * 而这条光带是单材质的，`opacity` 一定存在。这里不改成数组处理，
           * 因为多材质网格根本不会进这个循环——用一次断言表达这个前提，
           * 比为了消除类型错误而写一段永远不会走到的分支更诚实。
           */
          const material = glint.mesh.material as import('three').MeshBasicMaterial
          material.opacity =
            glint.baseOpacity * (0.78 + Math.sin(elapsed * 1.1 + glint.phase) * 0.22)
        }

        /* 船横过河面。超出范围后从另一侧回来，避免它消失在雾里时"被记住" */
        for (const { boat, spec } of boats) {
          const travel = (elapsed * spec.speed + spec.offset) % 320
          boat.position.x = travel - 160
        }

        /* 落日的呼吸：极慢、极小，只是让这块画面不完全静止 */
        const sunPulse = 1 + Math.sin(elapsed * 0.4) * 0.02
        sunDisc.scale.setScalar(sunPulse)
        sunHalo.scale.setScalar(1 + Math.sin(elapsed * 0.31) * 0.05)

        /**
         * 灯的亮度随玩家走近而升起。
         *
         * 与操场上水洼反光的处理同一个思路：**亮度是对玩家位置的回答**。
         * 这里的用途是把玩家往回城的方向引一点——完全不引的话，
         * 玩家会一直面朝河站到腻，而这一幕的结尾是"订了回国的机票"，
         * 他终究要转过身去。
         */
        for (const bulb of lampLights) {
          const distance = Math.hypot(player.x - bulb.position.x, player.z - bulb.position.z)
          const nearness = Math.max(0, 1 - distance / 26)
          materials.lamp.opacity = 0.32 + nearness * 0.4
        }
      },

      resize() {
        // 布景全部按米摆放，水面与天空的尺度都与视口宽高比无关，无需响应
      },
    }
  },
}
