import type * as Three from 'three'
import type { Hotspot, PlayerState, RayHit, TriggerZone } from './types'

/**
 * 第一人称交互层：准星射线拾取 + 触发器区域。
 *
 * 与 `lib/world/types.ts` 的分工：那里是契约，这里是它唯一的执行者。
 * 输入是每帧的 `PlayerState` 与相机，输出是「准星当前对准哪个热点」
 * 与「玩家刚走进哪个区域」这两个事件流。
 *
 * ## 为什么不接收 scene
 *
 * 骨架持有 scene，但这里刻意不要它。一旦拿得到 scene，最顺手的写法就是
 * `raycaster.intersectObjects(scene.children, true)`——那是对整棵场景树
 * 做射线检测，雨的粒子、远景剪影、每根草都会参与求交。热点是几十个量级、
 * 场景对象是几万个量级，这个代价在第一人称下直接表现为转头卡顿。
 * 只接收 `hotspots` 的 `object`，让候选集与叙事对象的数量同阶。
 *
 * ## 生命周期
 *
 * 一个场景一个实例。场景切换时 `dispose()` 旧实例再建新的——
 * 热点对象在重建场景后会是新的一批，沿用旧实例会对着已从场景图摘除的
 * 对象做射线，永远拾取不到东西。
 */

/* ------------------------------------------------------------------ *
 * 公开类型
 * ------------------------------------------------------------------ */

/** 交互系统对外的方法集合。 */
export type InteractionSystem = {
  /** 每帧调用。做拾取检测与触发器检测。`player` 只读，不修改。 */
  update: (player: PlayerState, delta: number) => void
  /** 准星当前对准的热点 id，未对准为 `null`。 */
  getFocused: () => string | null
  /** 同上的对象形式，供需要 `label` 的地方（准星文案、场景内高亮）使用。 */
  getFocusedHotspot: () => Hotspot | null
  /**
   * 点击时调用。优先激活当前对准的热点，没有对准的返回 `false`。
   *
   * 不接收事件参数：触屏端的「点击画面中央」与鼠标左键走同一条路径，
   * 宿主不需要为两种输入各写一套判断「点在哪」的代码——第一人称下
   * 光标的唯一位置就是画面中心。
   */
  activate: () => boolean
  /** 清理。调用后再 `update`/`activate` 都是空操作。 */
  dispose: () => void
}

/** 构造参数。 */
export type InteractionOptions = {
  /**
   * three 模块本身。与 `SceneRuntime.three` 一致，由宿主注入而不是静态导入：
   * 项目里 three 是动态 import 进来的（首屏体积），骨架与场景模块
   * 都不该在模块顶层把整包拉进初始 bundle。
   */
  three: typeof Three
  /** 第一人称相机。射线从它的世界位置出发，沿它的朝向。 */
  camera: Three.Camera
  /** 本场景的可交互热点。 */
  hotspots: readonly Hotspot[]
  /** 本场景的触发区域。 */
  triggers?: readonly TriggerZone[]
  /**
   * 遮挡体：真正会挡住视线的少数对象（墙、门板、建筑主体）。
   *
   * 为什么不从 `WorldSceneHandle.colliders` 自动派生：`Collider` 是 2D 的
   * （只有 x/z 与半宽），没有高度。看台高 1.2m、围墙高 2.5m，按同一个
   * 假设高度生成代理盒必然有一方是错的——矮的看台会挡住视线，
   * 高的围墙反而挡不住。所以由场景模块明确交出「哪些东西挡视线」。
   *
   * 只放真正的遮挡物，不要放整棵树：这些对象每次拾取都要参与求交。
   */
  occluders?: readonly Three.Object3D[]
  /**
   * 拾取节流间隔（毫秒）。不传时按热点数量自动选择：
   * 热点少就每帧拾取，热点多才降频。见 `pickIntervalMs` 的说明。
   */
  pickIntervalMs?: number
  /**
   * 准星对准的热点发生变化时回调。**去重在这里做**，
   * 同一热点连续 300 帧对准也只会回调一次。
   *
   * 传 `Hotspot` 而不是 id：宿主拿到 id 还得回自己那份数组里查 label，
   * 而那份数组在 React 里通常是个 ref，查起来比直接给对象麻烦。
   * 需要 id 的地方用 `getFocused()`。
   */
  onFocusChange?: (focused: Hotspot | null) => void
  /**
   * 触发器区域被进入时回调。宿主通常用它推进章节标题、播一段环境音。
   *
   * 与 `TriggerZone.onEnter` 并存而不合并：`onEnter` 定义在场景模块里
   * （它知道「这个角落发生什么」），宿主是另一套代码（它知道「发生之后
   * 界面怎么变」），两边都需要这个时机。
   */
  onTrigger?: (zone: TriggerZone) => void
}

/* ------------------------------------------------------------------ *
 * 内部常量
 * ------------------------------------------------------------------ */

/**
 * 遮挡判定的容差（米）。热点贴着一面墙时，命中点与墙面的距离可能是
 * 毫米级，不留余量会被自己身后的墙判成遮挡。
 */
const OCCLUSION_EPSILON = 0.02

/** 超过这个热点数量才降频。第一版场景是 3-5 个，远够不到。 */
const CROWDED_HOTSPOT_COUNT = 10

/** 降频后的拾取间隔。20Hz 左右，转头时准星提示的延迟在可感知阈值之下。 */
const CROWDED_PICK_INTERVAL_MS = 60

/* ------------------------------------------------------------------ *
 * 实现
 * ------------------------------------------------------------------ */

export function createInteractionSystem(options: InteractionOptions): InteractionSystem {
  const { three, camera, hotspots, onFocusChange, onTrigger } = options

  /**
   * 候选集。只含热点根对象，射线靠 `intersectObjects(..., true)` 递归到子网格。
   * 复制成可变数组：入参是 readonly，而 three 的 `intersectObjects` 要 `Object3D[]`。
   */
  const pickables: Three.Object3D[] = hotspots.map((hotspot) => hotspot.object)
  const occluders: Three.Object3D[] = [...(options.occluders ?? [])]
  const triggers: readonly TriggerZone[] = options.triggers ?? []

  /**
   * 子对象 → 所属热点。热点对象通常是个 `Group`，真正被射线命中的是它下面的
   * 某个 `Mesh`（信封本体、邮筒顶盖），所以命中后必须沿 `parent` 链回溯，
   * 否则拿到的只是一个匿名网格，不知道是谁被点了。
   */
  const owners = new Map<Three.Object3D, Hotspot>()
  for (const hotspot of hotspots) owners.set(hotspot.object, hotspot)

  /**
   * 拾取节流。
   *
   * 用时间而不是帧计数：60fps 下「每 3 帧」是 50ms，在 144Hz 屏幕上变成 20ms、
   * 在 30fps 的弱机上变成 100ms，同一份代码在不同设备上的手感不一致。
   * 按毫秒节流的结果与帧率无关。
   *
   * 空间划分（BVH / 网格哈希）在这个量级不值得：热点是手工布景的，
   * 天然是几十个；而每次场景重建都要重建索引，代价比省下的求交更高。
   * 真到几百个热点再换成静态 BVH 也不迟——那时瓶颈会变成
   * `intersectObjects` 逐三角形的求交，而不是对象数量。
   */
  const pickIntervalMs =
    options.pickIntervalMs ??
    (hotspots.length > CROWDED_HOTSPOT_COUNT ? CROWDED_PICK_INTERVAL_MS : 0)

  const raycaster = new three.Raycaster()
  const rayOrigin = new three.Vector3()
  const rayDirection = new three.Vector3()

  let focused: Hotspot | null = null
  let focusedId: string | null = null
  let sinceLastPickMs = Number.POSITIVE_INFINITY
  let matricesPrimed = false
  let disposed = false

  /** 触发区域的「上一帧是否在区域内」。只在外→内的跨越帧触发。 */
  const insideZones = new Set<string>()
  /** 已经投递过 `onEnter` 的区域。`repeatable` 时这个集合不参与判断。 */
  const firedZones = new Set<string>()

  /**
   * 首帧兜底更新世界矩阵。
   *
   * 射线依赖 `matrixWorld`，而它由渲染循环里的 `renderer.render` 维护。
   * 若本系统的 `update` 排在 render 之前（常见顺序），第一帧读到的
   * 是单位矩阵，所有热点都会被认为堆在原点——表现为「刚进场景点什么都没反应」，
   * 而且第二帧就自愈，极难排查。这里只在第一次拾取时补一次。
   *
   * 之后不再重复更新：热点若在做动画，一帧的矩阵延迟可以接受，
   * 而每帧给所有子节点重算矩阵的开销不值得。
   */
  const primeMatrices = () => {
    for (const object of pickables) object.updateWorldMatrix(false, true)
    for (const object of occluders) object.updateWorldMatrix(false, true)
    matricesPrimed = true
  }

  /** 沿 parent 链找到命中对象所属的热点。 */
  const resolveOwner = (object: Three.Object3D): Hotspot | null => {
    let node: Three.Object3D | null = object
    while (node) {
      const owner = owners.get(node)
      if (owner) return owner
      node = node.parent
    }
    return null
  }

  /**
   * 命中对象及其整条祖先链是否可见。
   *
   * three 的射线**不会**跳过 `visible === false` 的对象，所以「已经烧掉的信」
   * 这种设了 `visible = false` 的东西默认仍然可以被点中。必须自己过滤。
   *
   * 代价：想用「不可见的简化代理」做拾取也不能用 `visible = false`。
   * 那种情况应该给代理网格设 `material.visible = false`（或 `opacity: 0`），
   * 射线不看材质，仍然能命中。
   */
  const isVisibleInTree = (object: Three.Object3D): boolean => {
    let node: Three.Object3D | null = object
    while (node) {
      if (!node.visible) return false
      node = node.parent
    }
    return true
  }

  /**
   * 相机到命中点之间是否有遮挡物。
   *
   * 用 `raycaster.far` 截断而不是事后比较距离，是为了让粗放的 `occluders`
   * 配置不会自杀：一栋楼的可见网格和它内部那封信都可能出现在候选里，
   * 事后比较会认为「楼挡住了信」。截断后，与命中点同距离的面不会被算作遮挡。
   */
  const isOccluded = (distance: number): boolean => {
    if (occluders.length === 0) return false
    const limit = distance - OCCLUSION_EPSILON
    // 镜头几乎贴在热点上（距离小于容差），中间不可能再塞下东西
    if (limit <= 0) return false

    const previousFar = raycaster.far
    raycaster.far = limit
    const blockers = raycaster.intersectObjects(occluders, true)
    raycaster.far = previousFar

    for (const blocker of blockers) {
      if (isVisibleInTree(blocker.object)) return true
    }
    return false
  }

  /**
   * 从屏幕中心发一条射线，返回对准的热点。
   *
   * 方向取自 `camera.getWorldDirection()` 而不是常量 `(0, 0, -1)`：
   * 后者只在相机未旋转时成立，第一人称下相机的旋转就是玩家的视线，
   * 用固定方向等于永远朝场景的原初朝向拾取，转头时准星指向与命中的东西对不上。
   */
  const pick = (): { hotspot: Hotspot; hit: RayHit } | null => {
    if (!matricesPrimed) primeMatrices()

    camera.getWorldPosition(rayOrigin)
    camera.getWorldDirection(rayDirection)
    raycaster.set(rayOrigin, rayDirection)
    raycaster.far = Number.POSITIVE_INFINITY

    const hits = raycaster.intersectObjects(pickables, true)

    for (const hit of hits) {
      const hotspot = resolveOwner(hit.object)
      if (!hotspot) continue
      if (!isVisibleInTree(hit.object)) continue

      /**
       * 最近的命中就定生死，不做「跳过这个看看后面有没有更合适的」。
       *
       * `hits` 已按距离升序。若最近的那个超出了它的 `reach`，说明准星
       * 正压在一个够不着的东西上——此时应该判定未对准，而不是穿透它
       * 去激活后面的热点。玩家看到的是眼前那封信，不是它背后的邮筒。
       *
       * 距离取的是「命中点到相机」的三维距离（`RayHit.distance` 的定义）。
       * 注意这意味着 `reach` 是从**眼睛**量起的：一个 `reach: 2` 的地面信件，
       * 水平方向得走到约 1.1m。这是契约里的定义，地面小物件的 `reach`
       * 要按这个尺度给。
       */
      if (hit.distance > hotspot.reach) return null
      if (isOccluded(hit.distance)) return null

      return { hotspot, hit: { id: hotspot.id, distance: hit.distance } }
    }

    return null
  }

  /**
   * 重新拾取并回报变化。
   *
   * 去重放在这里，而不是让宿主拿到每帧的结果自己比：宿主是 React，
   * 每帧派发一次「焦点可能变了」等于每帧一次 setState 的风险，
   * 而准星文案一年也就变几十次。
   */
  const refreshFocus = () => {
    const result = pick()
    focused = result ? result.hotspot : null

    const nextId = result ? result.hotspot.id : null
    if (nextId === focusedId) {
      // id 相同但对象引用可能已经换了（宿主重建了同 id 的热点），
      // 静默跟进，不回调——回调的语义是「焦点变了」。
      return
    }

    focusedId = nextId
    onFocusChange?.(focused)
  }

  const updateTriggers = (player: PlayerState) => {
    for (const zone of triggers) {
      const dx = player.x - zone.x
      const dz = player.z - zone.z
      // 比较平方距离，省掉每帧每个区域一次开方
      const inside = dx * dx + dz * dz < zone.radius * zone.radius
      const wasInside = insideZones.has(zone.id)

      if (inside === wasInside) continue

      if (!inside) {
        insideZones.delete(zone.id)
        continue
      }

      /**
       * 只在「外→内」的跨越帧投递，而不是「本帧在区域内」。
       *
       * 后者会让 `repeatable: false` 完全失效：玩家站在区域里不动时
       * 每帧都是「在区域内」，`onEnter` 会被调用 60 次/秒。
       *
       * 已经投递过的区域即使 `repeatable` 为假也要跳过，但**仍然记入
       * `insideZones`**——否则玩家在区域边缘来回蹭一步，每次「进入」
       * 都会被当成新的一次进入。
       */
      insideZones.add(zone.id)

      /**
       * 投递即标记，不看 `onEnter` 的返回值。
       *
       * `onEnter` 返回 `false` 若被解释成「这次不算数」，那么一个
       * 「条件未满足时返回 false」的区域会在条件永远不满足时保持可重试、
       * 在条件满足后又因为已经被标记过而再也不触发——两头都错。
       * 触发器的「一次」由区域自己的 `repeatable` 决定，不由回调的返回值决定。
       */
      if (!zone.repeatable && firedZones.has(zone.id)) continue

      firedZones.add(zone.id)
      zone.onEnter()
      onTrigger?.(zone)
    }
  }

  return {
    update(player, delta) {
      if (disposed) return

      updateTriggers(player)

      sinceLastPickMs += delta * 1000
      if (sinceLastPickMs < pickIntervalMs) return
      sinceLastPickMs = 0
      refreshFocus()
    },

    getFocused() {
      return focusedId
    },

    getFocusedHotspot() {
      return focused
    },

    activate() {
      if (disposed) return false

      /**
       * 点击时强制重新拾取，不吃节流。
       *
       * 降频期间 `focused` 最长可能过期一个间隔（默认 60ms），触发端
       * （鼠标、触屏）如果直接用这个值，会出现「明明对准了却没反应」
       * ——玩家会归因于点击没生效，而不是准星提示慢了。
       */
      sinceLastPickMs = 0
      refreshFocus()

      if (!focused) return false

      // 返回值链：`onActivate` 返回 `true` 表示这次点击被消费（通常要弹叙事层），
      // 宿主拿到 `true` 才会去暂停玩家控制。返回 `void`/`false` 的热点
      // 是「点了有点反馈，但不打断探索」，比如一盏会亮的灯。
      return focused.onActivate() === true
    },

    dispose() {
      disposed = true
      focused = null
      pickables.length = 0
      occluders.length = 0
      owners.clear()
      insideZones.clear()
      firedZones.clear()

      // 只在真的有焦点时补一次 null：准星提示属于宿主 UI，场景销毁时
      // 如果只剩它没清，会留下一条指向已消失场景的文案。
      if (focusedId !== null) {
        focusedId = null
        onFocusChange?.(null)
      }
    },
  }
}
