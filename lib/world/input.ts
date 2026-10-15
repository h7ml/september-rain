import type { PlayerMoveInput } from './player'

/**
 * 输入采集：把键盘、指针锁定、触屏三种来源压成同一种形状。
 *
 * ## 为什么单独成模块
 *
 * 移动与视角的**语义**在 `player.ts`（阻尼、归一化、像素到弧度），
 * 这里只负责「事件长什么样」。分开的直接收益：桌面端、触屏端、
 * 将来的手柄都只是换一个采集器，玩家手感参数一处生效。
 *
 * ## 生命周期
 *
 * 所有监听器都挂在 `window` / `document` / 传入的 canvas 上，`dispose()` 全部摘除。
 * 骨架在 React 严格模式下会被重复挂载，漏掉一条监听就是「初始化两次、
 * 走一步跳两米」这种只在开发模式出现的怪相。
 *
 * ## 为什么不把输入写进 React state
 *
 * 键盘与鼠标事件以每秒数百次的频率到达，进 state 就是每秒数百次重渲染，
 * 在第一人称里直接表现为掉帧。这里全部落在闭包变量里，由帧循环同步读取。
 */

/** 一帧的输入快照。`move` 是给 `stepPlayer` 的，`look` 是给 `applyLook` 的像素位移。 */
export type InputSnapshot = {
  move: PlayerMoveInput
  look: { x: number; y: number }
}

/** 骨架持有的输入句柄。 */
export type PlayerInput = {
  /**
   * 取走这一帧累积的输入。**有副作用**：视角位移取走即清零。
   *
   * 同时返回移动与视角，而不是分成两个方法：视角位移必须每次恰好被消费一次，
   * 分开成两个方法之后，调用方漏掉其中一个就会持续累积，
   * 表现为「松开鼠标后视角还在缓慢旋转」。
   *
   * `yaw` / `pitch` 目前不参与运算，参数保留是为了让触屏的「拖动灵敏度」
   * 将来能随视场角或缩放变化（俯仰越大拖同样的距离该转得更少）。
   */
  poll: (yaw: number, pitch: number) => InputSnapshot
  /** 指针是否已被捕获。`false` 时宿主应显示「点击进入场景」引导。 */
  isLocked: () => boolean
  /** 主动请求进入锁定（触屏端的「进入」按钮、或宿主自己的开始按钮会用到）。 */
  requestLock: () => void
  /** 当前移动输入，不消费视角位移。 */
  getMove: () => PlayerMoveInput
  /**
   * 清空一切输入。
   *
   * 落点过渡、暂停恢复时调用：过渡期间玩家还按着 W 的话，位移会在
   * 「过渡插值」和「输入移动」之间来回抢同一个状态，表现为落点被拽偏。
   * 刻意**不动**已累积的视角位移——那是玩家已经做出的动作，丢弃会让
   * 手机端「刚滑到一半突然不转了」。
   */
  reset: () => void
  /** 摘除全部监听器、移除触屏 UI。可重复调用。 */
  dispose: () => void
}

export type InputOptions = {
  /** 锁定状态变化。宿主靠它切换引导层与准星。 */
  onLockChange?: (locked: boolean) => void
  /** 一次「确认」：锁定时点了左键，或触屏点了右侧观察区。 */
  onAction?: () => void
}

/** 摇杆基座半径（CSS 像素）。手感参数，最终要以真机试玩定档。 */
const STICK_RADIUS = 56
/** 摇杆旋钮半径，比基座小一圈，留出可见的行程。 */
const STICK_KNOB_RADIUS = 24
/** 下半屏这个高度以下、左侧这个宽度以内，落下手指即唤出摇杆。 */
const STICK_GRAB_HEIGHT = 0.55
const STICK_GRAB_WIDTH = 0.5
/** 摇杆方向的死区比例，低于它视为不动，避免手指微抖就在走。 */
const STICK_DEAD_ZONE = 0.16
/** 触屏观察区的灵敏度倍率。手指的位移精度远不如鼠标，1.0 会转得太快。 */
const TOUCH_LOOK_SCALE = 1.6
/**
 * 单次事件的视角位移上限（像素）。
 *
 * 指针锁定刚生效的那一帧、系统弹窗关闭、输入法候选框抢焦点之后，
 * 浏览器可能一次性补上几百像素。硬截断会在限幅处出现手感断层，
 * 所以这里用软钳制（超出后开平方衰减），保留单调性。
 */
const LOOK_EVENT_LIMIT = 140

const MOVE_KEYS = {
  KeyW: ['forward', 1],
  ArrowUp: ['forward', 1],
  KeyS: ['forward', -1],
  ArrowDown: ['forward', -1],
  KeyA: ['strafe', -1],
  ArrowLeft: ['strafe', -1],
  KeyD: ['strafe', 1],
  ArrowRight: ['strafe', 1],
} as const

/** 触屏 HUD 的样式。内联注入而不是写进 `globals.css`：这段 DOM 由本模块创建和销毁，
 * 样式跟着走才不会出现「模块已换实现，全局样式还留着旧类名」的悬空引用。 */
const STYLE_ID = 'september-rain-world-input-style'
const STYLE_TEXT = `
.world-touch { position: absolute; inset: 0; z-index: 4; touch-action: none; -webkit-user-select: none; user-select: none; }
.world-touch__stick { position: absolute; width: ${STICK_RADIUS * 2}px; height: ${STICK_RADIUS * 2}px;
  border: 1px solid rgba(233, 229, 220, 0.28); border-radius: 50%; background: rgba(13, 18, 19, 0.22); }
.world-touch__knob { position: absolute; left: 50%; top: 50%; width: ${STICK_KNOB_RADIUS * 2}px; height: ${STICK_KNOB_RADIUS * 2}px;
  margin: ${-STICK_KNOB_RADIUS}px 0 0 ${-STICK_KNOB_RADIUS}px; border: 1px solid rgba(200, 168, 120, 0.6);
  border-radius: 50%; background: rgba(200, 168, 120, 0.14); }
`

/** 软钳制：限幅内原样返回，超出部分开平方，保证连续且单调。 */
function softClamp(value: number, limit: number) {
  const magnitude = Math.abs(value)
  if (magnitude <= limit) return value
  return Math.sign(value) * (limit + Math.sqrt(magnitude - limit))
}

/**
 * 采集输入。
 *
 * `canvas` 只用来挂「点击进入锁定」与左键确认——指针锁定的请求必须来自
 * 用户手势，绑在 window 上会让整页任何一次点击都去抢锁定。
 */
export function createInput(canvas: HTMLElement, options: InputOptions = {}): PlayerInput {
  const onLockChange = options.onLockChange
  const onAction = options.onAction

  /* ---------- 状态 ---------- */

  const forwardPositive = new Set<string>()
  const forwardNegative = new Set<string>()
  const strafePositive = new Set<string>()
  const strafeNegative = new Set<string>()
  let running = false

  let lookX = 0
  let lookY = 0

  // 摇杆：`stickId` 是当前抓住摇杆的那根手指/指针的 id，null 表示没在操作。
  let stickId: number | null = null
  let stickMoveForward = 0
  let stickMoveStrafe = 0
  let knob: HTMLElement | null = null

  // 触屏观察区：右侧按下后的拖动量转成视角。
  let lookId: number | null = null
  let lookLastX = 0
  let lookLastY = 0
  let lookDragged = false

  let disposed = false

  // 本项目是叙事游戏，没有可输入的文本框；但宿主将来可能加。焦点在可编辑
  // 元素上时一律不接管键盘，否则「往输入框里打 s」会变成后退。
  const isTypingTarget = (target: EventTarget | null) => {
    const element = target as HTMLElement | null
    if (!element || !element.tagName) return false
    const tag = element.tagName.toLowerCase()
    return tag === 'input' || tag === 'textarea' || tag === 'select' || element.isContentEditable === true
  }

  /* ---------- 键盘 ---------- */

  const applyKey = (code: string, pressed: boolean) => {
    const entry = MOVE_KEYS[code as keyof typeof MOVE_KEYS]
    if (!entry) return false
    const [axis, sign] = entry
    const bucket =
      axis === 'forward'
        ? sign > 0
          ? forwardPositive
          : forwardNegative
        : sign > 0
          ? strafePositive
          : strafeNegative
    if (pressed) bucket.add(code)
    else bucket.delete(code)
    return true
  }

  const clearKeys = () => {
    forwardPositive.clear()
    forwardNegative.clear()
    strafePositive.clear()
    strafeNegative.clear()
    running = false
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.repeat || isTypingTarget(event.target)) return
    // 方向键与空格会滚动页面。第一人称下「按上键画面整体动一下」是很糟的手感，
    // 而且滚动后 canvas 的 getBoundingClientRect 会变，指针锁定的坐标全偏。
    if (event.code === 'Space' || event.code.startsWith('Arrow')) event.preventDefault()
    if (event.key === 'Shift' || event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
      running = true
      return
    }
    applyKey(event.code, true)
  }

  const handleKeyUp = (event: KeyboardEvent) => {
    if (event.key === 'Shift' || event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
      running = false
      return
    }
    applyKey(event.code, false)
  }

  /**
   * 失焦即清空按键。
   *
   * 这是第一人称最常见的一类 bug：Alt+Tab 切走时 keyup 落在别的窗口上，
   * 回来以后 `keys` 里还留着 W，角色一直向前走，只能再按一次 W 才停。
   * 触屏端同理——切到后台时 pointerup 收不到，摇杆会永远停在最后的方向。
   */
  const handleBlur = () => {
    clearKeys()
    releaseStick()
    releaseLook()
  }

  /* ---------- 指针锁定 ---------- */

  const canLock = typeof canvas.requestPointerLock === 'function'
  let locked = !canLock

  const applyLock = (next: boolean) => {
    if (locked === next) return
    locked = next
    // 锁定变化时清空移动输入。锁定／解锁本身就是一次状态切换：
    // 「点进场景」那一下如果带着之前的按键状态，人会先冲出去半步。
    clearKeys()
    stickMoveForward = 0
    stickMoveStrafe = 0
    onLockChange?.(locked)
  }

  const requestLock = () => {
    if (!canLock) return
    try {
      // unadjustedMovement 关掉系统鼠标加速：第一人称下加速度会让
      // 「慢慢转」和「快速甩」对同样的位移给出不同结果，瞄准感全失。
      // 不支持的浏览器（以及该选项尚在实验阶段的版本）会抛错或拒绝 Promise，
      // 两种情况都要退回普通模式，否则请求锁定失败、玩家连点几下都进不去。
      const pending = canvas.requestPointerLock({ unadjustedMovement: true })
      void Promise.resolve(pending).catch(() => {
        try {
          void Promise.resolve(canvas.requestPointerLock()).catch(() => undefined)
        } catch {
          // 浏览器在刚退出锁定的几百毫秒内会直接抛 SecurityError。
          // 这是正常节流，不是错误，宿主看到的「未锁定」状态就是正确反馈。
        }
      })
    } catch {
      try {
        void Promise.resolve(canvas.requestPointerLock()).catch(() => undefined)
      } catch {
        /* 同上 */
      }
    }
  }

  const handlePointerLockChange = () => {
    applyLock(document.pointerLockElement === canvas)
  }

  const handlePointerLockError = () => {
    // 失败时把状态摆回未锁定，宿主才能重新显示引导层。
    applyLock(false)
  }

  /* ---------- 鼠标 ---------- */

  const handleMouseMove = (event: MouseEvent) => {
    if (!locked) return
    // 累积而非直接写入：高刷鼠标一帧里可能报告多次位移，
    // 覆盖写法会只剩最后一次，快速甩头会「丢距离」。
    lookX += softClamp(event.movementX, LOOK_EVENT_LIMIT)
    lookY += softClamp(event.movementY, LOOK_EVENT_LIMIT)
  }

  const handleCanvasMouseDown = (event: MouseEvent) => {
    if (event.button !== 0) return
    if (!locked) {
      requestLock()
      return
    }
    onAction?.()
  }

  const handleContextMenu = (event: MouseEvent) => {
    // 右键菜单一弹出，指针锁定就被浏览器释放，回来还得重新点一次。
    event.preventDefault()
  }

  /* ---------- 触屏 ---------- */

  // 用 matchMedia 判断而不是 UA：UA 嗅探在平板、iPad 桌面模式、
  // 带触摸屏的笔记本上都会判错，而这些设备恰好都有真实的鼠标。
  let touchHud: HTMLDivElement | null = null
  let stickBase: HTMLDivElement | null = null
  let queryCleanup: (() => void) | undefined
  let hasCoarsePointer = false
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    const query = window.matchMedia('(pointer: coarse)')
    hasCoarsePointer = query.matches
    // 外接鼠标后要能切回指针锁定。狩猎式地长期持有这个监听没必要，
    // 但它在模块存续期内只触发一次几次，成本可以忽略。
    const handleQueryChange = (event: MediaQueryListEvent) => {
      hasCoarsePointer = event.matches
      /**
       * 主指针变了，锁定语义也要跟着切。
       *
       * 变回 `fine`（接上鼠标）：置为未锁定，让宿主显示引导层，
       * 玩家点一下进入指针锁定。
       * 变为 `coarse`（拔掉鼠标进平板模式）：直接视为已锁定——
       * 触摸设备没有"进入"这个概念，它的输入永远可用，
       * 留一个锁不上的遮罩只会把虚拟摇杆挡在下面。
       */
      if (event.matches) {
        applyLock(true)
      } else if (canLock) {
        applyLock(false)
      }
      syncTouchHud()
    }
    query.addEventListener?.('change', handleQueryChange)
    queryCleanup = () => query.removeEventListener?.('change', handleQueryChange)

    /**
     * 触摸设备直接进入已锁定状态。
     *
     * ## 这修的是一个会让手机玩家完全卡死的 bug
     *
     * 原来的判定是 `locked = !canLock`——只检查 `requestPointerLock`
     * **是否存在**。但手机上存在这个 API 却常常无法成功锁定
     * （Android Chrome 在非全屏元素上会静默拒绝，iOS Safari 长期不支持）。
     * 于是：遮罩显示 → 玩家点它 → 请求锁定失败 → `applyLock(false)`
     * 与当前值相同而被 `===` 短路 → **永不回调宿主** → 遮罩永不消失。
     * 虚拟摇杆的 z-index 是 4、遮罩是 5，所以摇杆还被压在下面，
     * 手机上表现为"点进去一片黑，怎么点都没反应"。
     *
     * 语义上也该这么修：指针锁定解决的是"鼠标光标会跑出画面"，
     * 触摸设备根本没有光标要锁。它不需要"进入"，所以它一开始就在里面。
     */
    if (hasCoarsePointer) applyLock(true)
  }

  const releaseStick = () => {
    stickId = null
    stickMoveForward = 0
    stickMoveStrafe = 0
    if (knob) knob.style.transform = 'translate(0px, 0px)'
  }

  const releaseLook = () => {
    lookId = null
    lookDragged = false
  }

  const updateStick = (clientX: number, clientY: number) => {
    if (!stickBase) return
    const rect = stickBase.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    let dx = clientX - centerX
    let dy = clientY - centerY

    // 位移钳到基座半径：手指拖到屏幕边缘时摇杆不该继续加长行程。
    const distance = Math.hypot(dx, dy)
    if (distance > STICK_RADIUS) {
      const scale = STICK_RADIUS / distance
      dx *= scale
      dy *= scale
    }

    if (knob) knob.style.transform = `translate(${dx}px, ${dy}px)`

    const magnitude = Math.min(1, distance / STICK_RADIUS)
    if (magnitude <= STICK_DEAD_ZONE) {
      stickMoveForward = 0
      stickMoveStrafe = 0
      return
    }

    // 死区外重新拉伸回满量程：直接减死区会在边界处出现「推一点没反应、
    // 再推一点突然全速」的台阶，玩家会以为摇杆坏了。
    const amount = (magnitude - STICK_DEAD_ZONE) / (1 - STICK_DEAD_ZONE)
    const dirX = dx / (distance || 1)
    const dirY = dy / (distance || 1)
    // 屏幕 y 轴向下，屏幕上方是前进：前向分量取负。
    stickMoveStrafe = dirX * amount
    stickMoveForward = -dirY * amount
  }

  const handleTouchPointerDown = (event: PointerEvent) => {
    if (!hasCoarsePointer || stickId !== null || lookId !== null) return
    const width = window.innerWidth
    const height = window.innerHeight
    const inStickZone = event.clientX < width * STICK_GRAB_WIDTH && event.clientY > height * (1 - STICK_GRAB_HEIGHT)

    if (inStickZone) {
      stickId = event.pointerId
      if (stickBase) {
        // 摇杆基座跟着手指落点走。
        // 固定基座是另一种做法，但拇指的舒适区因人而异；跟随落点让
        // 「在左下角随便一按」都能用，代价是基座位置每次不同，熟记位置练不出来。
        stickBase.style.left = `${event.clientX}px`
        stickBase.style.top = `${event.clientY}px`
        stickBase.style.opacity = '1'
      }
      updateStick(event.clientX, event.clientY)
      return
    }

    // 其余区域一律是观察区。第一人称里没有别的东西需要手指，
    // 把它整块当作「拖动转头」比再划一个隐形按钮更好用。
    lookId = event.pointerId
    lookLastX = event.clientX
    lookLastY = event.clientY
    lookDragged = false
  }

  const handleTouchPointerMove = (event: PointerEvent) => {
    if (!hasCoarsePointer) return
    if (event.pointerId === stickId) {
      updateStick(event.clientX, event.clientY)
      return
    }
    if (event.pointerId !== lookId) return
    const dx = event.clientX - lookLastX
    const dy = event.clientY - lookLastY
    lookLastX = event.clientX
    lookLastY = event.clientY
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) lookDragged = true
    lookX += softClamp(dx * TOUCH_LOOK_SCALE, LOOK_EVENT_LIMIT)
    lookY += softClamp(dy * TOUCH_LOOK_SCALE, LOOK_EVENT_LIMIT)
  }

  const handleTouchPointerUp = (event: PointerEvent) => {
    if (event.pointerId === stickId) {
      releaseStick()
      if (stickBase) stickBase.style.opacity = '0.55'
      return
    }
    if (event.pointerId !== lookId) return
    // 没拖动过的轻点视为一次「确认」：触屏没有准星点击，
    // 玩家对「看着某个东西点一下」的期待落在观察区上。
    if (!lookDragged) onAction?.()
    releaseLook()
  }

  const syncTouchHud = () => {
    if (!touchHud) return
    touchHud.style.display = hasCoarsePointer ? 'block' : 'none'
  }

  if (typeof document !== 'undefined') {
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = STYLE_TEXT
    // 幂等注入：模块被重复创建时不该堆叠多份同 id 的样式表。
    if (!document.getElementById(STYLE_ID)) document.head.appendChild(style)
  }

  if (hasCoarsePointer && canvas.parentElement) {
    const hud = document.createElement('div')
    hud.className = 'world-touch'
    hud.setAttribute('aria-hidden', 'true')

    const base = document.createElement('div')
    base.className = 'world-touch__stick'
    base.style.opacity = '0.55'
    const grip = document.createElement('div')
    grip.className = 'world-touch__knob'
    base.appendChild(grip)
    hud.appendChild(base)

    canvas.parentElement.appendChild(hud)
    touchHud = hud
    stickBase = base
    knob = grip
  }

  /* ---------- 监听器 ---------- */

  // 键盘挂 window：canvas 不在焦点上时 keydown 只会派发到 document/window。
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('keyup', handleKeyUp)
  window.addEventListener('blur', handleBlur)
  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('pointerlockchange', handlePointerLockChange)
  document.addEventListener('pointerlockerror', handlePointerLockError)
  canvas.addEventListener('mousedown', handleCanvasMouseDown)
  canvas.addEventListener('contextmenu', handleContextMenu)
  canvas.addEventListener('pointerdown', handleTouchPointerDown)
  window.addEventListener('pointermove', handleTouchPointerMove, { passive: true })
  window.addEventListener('pointerup', handleTouchPointerUp)
  window.addEventListener('pointercancel', handleTouchPointerUp)

  /* ---------- 句柄 ---------- */

  const getMove = (): PlayerMoveInput => {
    // 键盘是数字量，摇杆是模拟量；同时使用时取绝对值更大的那个，
    // 而不是相加——相加会让「一边推摇杆一边按 W」速度翻倍。
    // 同一个轴上可能有互相抵消的键（W 与 S 同时按住），取反方向的那一组是无效的，
    // 这里直接用两组方向键各自的存在性做减法。
    const keyboardForward = (forwardPositive.size > 0 ? 1 : 0) - (forwardNegative.size > 0 ? 1 : 0)
    const keyboardStrafe = (strafePositive.size > 0 ? 1 : 0) - (strafeNegative.size > 0 ? 1 : 0)

    return {
      forward: Math.abs(stickMoveForward) > Math.abs(keyboardForward) ? stickMoveForward : keyboardForward,
      strafe: Math.abs(stickMoveStrafe) > Math.abs(keyboardStrafe) ? stickMoveStrafe : keyboardStrafe,
      run: running,
    }
  }

  return {
    poll(_yaw: number, _pitch: number): InputSnapshot {
      const snapshot: InputSnapshot = { move: getMove(), look: { x: lookX, y: lookY } }
      lookX = 0
      lookY = 0
      return snapshot
    },

    isLocked: () => locked,

    requestLock,

    getMove,

    reset() {
      clearKeys()
      releaseStick()
      // lookX / lookY 不清，理由见类型定义。
    },

    dispose() {
      if (disposed) return
      disposed = true
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', handleBlur)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('pointerlockchange', handlePointerLockChange)
      document.removeEventListener('pointerlockerror', handlePointerLockError)
      canvas.removeEventListener('mousedown', handleCanvasMouseDown)
      canvas.removeEventListener('contextmenu', handleContextMenu)
      canvas.removeEventListener('pointerdown', handleTouchPointerDown)
      window.removeEventListener('pointermove', handleTouchPointerMove)
      window.removeEventListener('pointerup', handleTouchPointerUp)
      window.removeEventListener('pointercancel', handleTouchPointerUp)
      queryCleanup?.()

      touchHud?.remove()
      touchHud = null
      stickBase = null
      knob = null

      const style = document.getElementById(STYLE_ID)
      style?.remove()
    },
  }
}
