'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createWorld } from '@/lib/world/renderer'
import { getScene, isSceneImplemented } from '@/lib/world/scenes'
import { DEFAULT_PLAYER_CONFIG } from '@/lib/world/player'
import type { PlayerState, WorldHandle, WorldFrameState } from '@/lib/world/types'
import { jianjiaStory } from '@/lib/story/jianjia'
import {
  choose as applyChoice,
  isAtEnding,
  isGateOpen,
  resolveEnding,
  visibleChoices,
} from '@/lib/story/engine'
import type { StoryChoice } from '@/lib/story/types'
import {
  createSave,
  fromProgress,
  loadSave,
  saveGame,
  toProgress,
  advanceTo,
  type LegacyReviewChapter,
  type StorySaveV2,
} from '@/lib/story/save'
import { createAmbience, type AmbienceHandle } from '@/lib/audio/ambience'
import StoryHud from './story-hud'
import CodexPanel from './codex-panel'

/**
 * 游戏主视图：把世界、故事、存档串起来。
 *
 * ## 数据流
 *
 * ```
 *   StoryProgress ──► 当前节点 ──► sceneId ──► WorldScene ──► createWorld
 *        ▲                                                        │
 *        │                                                    onFrame
 *        │                                                        ▼
 *        └──────────── 选择 / 闸门满足 ◄──── StoryHud / 交互 ◄── 准星
 * ```
 *
 * 这个组件是**唯一**同时知道叙事与渲染的地方。故事引擎（`lib/story/`）
 * 不知道 three.js 的存在，世界骨架（`lib/world/`）不知道故事的存在，
 * 只有这里把两者接起来。
 *
 * ## 为什么状态放在这里而不是用 Context
 *
 * 只有一个消费者。Context 会让"谁在改进度"变得不透明，
 * 而这个项目里进度的写入点应该少而明确（选择、闸门、载入存档）。
 */

/**
 * 热点文案来自骨架回报的 `Hotspot.label`，这里不再维护 id → 文案的映射表。
 *
 * 曾经有过一张 `HOTSPOT_LABELS`，删掉的原因：它是**第二份真相**。
 * `label` 写在每个场景模块里，而那张表在集成层；每新增一个场景就要记得补一行，
 * 漏掉的表现只是"准星不显示提示"——不报错、不崩溃，只能靠人眼在几十个热点里发现。
 * 让骨架把 `label` 一起回报，这条链上就只有一份数据。
 */

export default function WorldCanvas() {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const worldRef = useRef<WorldHandle | null>(null)
  /**
   * 闸门回调的转发槽。
   *
   * 世界只在挂载时建一次，而闸门处理逻辑依赖当前节点；用 ref 中转可以让
   * 回调始终指向最新那一版，同时世界不必重建。少了它，换章之后触发的
   * 会是上一章的闸门 id——表现为「走过操场中央后选项还是不出现」。
   */
  const gateCallbackRef = useRef<(() => void) | null>(null)

  /**
   * 存档是**唯一真相源**。
   *
   * 不把 `StoryProgress` 另存一份 state：两者包含同一组字段
   * （节点、变量、visited、route、openedGates），各存一份迟早会不同步——
   * 而这一层最典型的表现是「选择生效了但刷新后又回退」。
   * 需要引擎形状时用 `toProgress(save)` 派生，方向是单向的。
   */
  const [save, setSave] = useState<StorySaveV2>(() => createSave(jianjiaStory.id, jianjiaStory.start))
  const [frame, setFrame] = useState<WorldFrameState>({ focusedHotspotId: null, focusedHotspotLabel: null, locked: false })
  const [showCodex, setShowCodex] = useState(false)
  const [notice, setNotice] = useState('')
  /**
   * 是否已完成读档。
   *
   * 落盘 effect 必须等它为真：挂载时 `save` 还是空存档，
   * 不等就会先用空存档覆盖掉玩家真实的进度——一个只在刷新时出现的丢档 bug。
   */
  const [hydrated, setHydrated] = useState(false)
  /**
   * 旧存档里映射不上新图的章节。
   *
   * 只进回顾面板、不参与游戏进度——旧版支持 AI 生成章节，
   * 那些章节在新图里没有对应节点，当成进度会让玩家落进一个不存在的场景。
   */
  const [legacy, setLegacy] = useState<LegacyReviewChapter[]>([])

  /**
   * 声音是否打开。默认关闭。
   *
   * 默认关而不是开：浏览器在用户交互前不允许出声（`AudioContext` 是
   * `suspended` 的），所以默认开会在首屏静默失败、然后在第一次点击时
   * 突然响起一片雨声——那种"以为什么都没发生、然后被吓一跳"的体验
   * 比默认安静要糟。让玩家主动打开，声音就是他自己请来的。
   */
  const [soundOn, setSoundOn] = useState(false)
  const ambienceRef = useRef<AmbienceHandle | null>(null)

  /** 引擎形状的进度，从存档派生。 */
  const progress = useMemo(() => toProgress(save), [save])

  /**
   * 准星焦点的中文文案。
   *
   * 文案由骨架直接给出（它就是场景模块里的 `Hotspot.label`），
   * 这里不做 id → 文案的转换——那会引入第二份真相，漏一行的表现是
   * "准星不显示提示"，不报错也不崩溃，只能靠人眼发现。
   */
  const focusedLabel = frame.focusedHotspotLabel

  const node = jianjiaStory.nodes[progress.currentNodeId] ?? jianjiaStory.nodes[jianjiaStory.start]
  const choices = useMemo(() => visibleChoices(node, progress), [node, progress])
  const ending = useMemo(
    () => (isAtEnding(node, progress) ? resolveEnding(jianjiaStory, progress.variables, progress.visited, progress.route) : null),
    [node, progress],
  )
  const gateOpen = isGateOpen(node, progress)
  const sceneReady = isSceneImplemented(node.sceneId)

  /**
   * 点击画面进入指针锁定。
   *
   * 优先走 `WorldHandle.setPaused(false)` 让骨架处理锁定请求——骨架持有 canvas，
   * 知道该对哪个元素调用 `requestPointerLock()`，而且它要顺带恢复帧循环。
   */
  /**
   * 点击引导层 → 进入指针锁定。
   *
   * **必须在点击处理器里同步调用**，不能包 `setTimeout`、也不能等一个
   * `await`：浏览器的指针锁定和自动播放走同一套策略，会检查调用是否
   * 源自用户手势；异步发起会被静默拒绝（不抛错、不触发
   * `pointerlockerror` 的可捕获路径），表现就是「点了没反应」。
   *
   * 这里曾经调的是 `setPaused(false)` + `activateAtCenter()`——两个都不请求锁定，
   * 而 `activateAtCenter` 在未锁定时直接返回 `false`。于是点击什么也不发生、
   * 遮罩永不消失。根因是 `WorldHandle` 当时没有暴露请求锁定的入口。
   */
  const requestLock = useCallback(() => {
    worldRef.current?.requestPointerLock()
  }, [])

  /* ------------------------------------------------------------------ *
   * 世界生命周期
   * ------------------------------------------------------------------ */

  /**
   * 只在**挂载时**创建世界，不在节点变化时重建。
   *
   * 这是整个改造里最关键的一条。旧实现（`components/scene/scene-canvas.tsx`）
   * 每次切章都 dispose 再 build，对一两百个粒子没问题，但对有几何体、
   * 材质、光照的 3D 空间会带来肉眼可见的闪烁与 GC 抖动。
   *
   * 现在的做法：世界常驻，切场景时只换内容（见下面那个 `useEffect`）。
   * 代价是世界骨架必须提供"换场景"的入口；如果它没提供，
   * 这里会退化成 `dispose` + 重建——那是坏情况，值得在骨架里补上。
   */
  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    /**
     * 闸门回调通过 ref 转发。
     *
     * 世界只在挂载时创建一次（依赖数组是空的），而 `onGateSatisfied` 依赖
     * 当前节点——直接把函数塞进 createWorld 会拿到第一次渲染时的闭包，
     * 之后换章就一直是那个旧节点的闸门 id。用 ref 中转，回调每次渲染都最新，
     * 而世界本身不必重建。
     */
    const scene = getScene(jianjiaStory.nodes[jianjiaStory.start]?.sceneId ?? 'bleachers')
    const world = createWorld({
      host,
      scene,
      player: DEFAULT_PLAYER_CONFIG,
      onFrame: (state) => {
        /**
         * 骨架保证只在变化时回调（见 `WorldFrameState` 的契约注释），
         * 所以这里可以直接 setState。若骨架违约逐帧回调，
         * 每秒几十次重渲染会让第一人称直接掉帧——
         * 那是骨架的 bug，不是这里该加的节流。
         */
        setFrame(state)
      },
      onGate: () => gateCallbackRef.current?.(),
    })

    if (!world) {
      setNotice('这台设备的浏览器没有可用的 WebGL，无法进入 3D 场景')
      return
    }
    worldRef.current = world

    return () => {
      world.dispose()
      worldRef.current = null
    }
  }, [])

  /* ------------------------------------------------------------------ *
   * 切换到新节点对应的场景
   * ------------------------------------------------------------------ */

  useEffect(() => {
    const world = worldRef.current
    if (!world || !node.spawn) return
    /**
     * 只在换节点时摆放玩家。骨架若没有热切换场景的能力，
     * 至少要把玩家送到新节点的出生点，否则他会用上一个场景的坐标
     * 落在新场景里（可能卡在墙里或浮在空中）。
     */
    world.placePlayer(node.spawn as Partial<PlayerState>)
  }, [node.id, node.spawn])

  /* ------------------------------------------------------------------ *
   * 声音
   * ------------------------------------------------------------------ */

  /**
   * 音频引擎只在**第一次打开开关**时创建。
   *
   * 不在挂载时建：`AudioContext` 会占用一个音频输出流，移动端上
   * 「进过页面就一直在播放」表现为耗电与状态栏的播放图标。
   * 而这个游戏默认静音，绝大多数场景下那个上下文是不需要的。
   */
  useEffect(() => {
    if (!soundOn) return
    if (!ambienceRef.current) ambienceRef.current = createAmbience()
    ambienceRef.current.play(node.sceneId)
  }, [soundOn, node.sceneId])

  /** 关闭时淡出并释放。 */
  useEffect(() => {
    if (soundOn) return
    ambienceRef.current?.dispose()
    ambienceRef.current = null
  }, [soundOn])

  /** 组件卸载时确保释放。 */
  useEffect(() => () => {
    ambienceRef.current?.dispose()
    ambienceRef.current = null
  }, [])

  const toggleSound = useCallback(() => setSoundOn((on) => !on), [])

  /**
   * 选项悬停的一声轻响。
   *
   * 只在开启声音时发声——`cue` 内部也判了静音，但在这里再判一次是
   * 为了避免每次悬停都去碰 `AudioContext`：鼠标在按钮上划过会触发几十次，
   * 而静音时那些调用全是白做。
   */
  const onChoiceHover = useCallback((hovered: boolean) => {
    if (hovered && soundOn) ambienceRef.current?.cue('hover')
  }, [soundOn])

  /* ------------------------------------------------------------------ *
   * 存档
   * ------------------------------------------------------------------ */

  /**
   * 载入存档。
   *
   * `loadSave` 返回的是联合类型而**不是**「成功 / 抛错」：v1 迁移、
   * 图不匹配、节点已删这些情况都属于「数据还在但不能推进」，
   * 用异常表达会逼调用方把每一种都写成 catch，而那些都不是错误。
   *
   * 这里刻意不自己读写 localStorage：`save.ts` 已经处理了字段校验、
   * 越界钳制、v1 章节标题映射、以及「映射不上就进回顾面板」的降级。
   * 重复实现一遍只会静默丢掉 favorites / history / legacy。
   */
  useEffect(() => {
    const result = loadSave(jianjiaStory)
    if (result) {
      setSave(result.save)
      if (result.kind === 'playable') {
        if (result.notice) setNotice(result.notice)
        if (result.legacyReview.length) setLegacy(result.legacyReview)
      } else {
        // readonly：进度不能推进，但收藏与历史仍属于玩家，照常恢复
        setNotice(result.notice)
        setLegacy(result.legacyReview)
      }
    }
    /**
     * 无论有没有读到存档都要放行落盘。
     *
     * 漏掉这一句的表现是「新玩家的进度永远存不上」——没有旧存档时
     * `hydrated` 一直是 false，落盘 effect 永远提前返回，而这个 bug
     * 在有存档的机器上完全复现不出来。
     */
    setHydrated(true)
  }, [])

  /**
   * 落盘。
   *
   * 每次选择都会触发，所以这里不能做重活——`saveGame` 只是一次
   * `setItem`。失败（隐私模式、配额满）不该打断游戏，只提示一次。
   */
  useEffect(() => {
    if (!hydrated) return
    const result = saveGame(save)
    if (!result.ok) setNotice('当前浏览器设置无法保存进度')
  }, [save, hydrated])

  /* ------------------------------------------------------------------ *
   * 选择
   * ------------------------------------------------------------------ */

  const onChoose = useCallback(
    (choice: StoryChoice) => {
      const next = applyChoice(jianjiaStory, progress, choice)
      if (!next) {
        // 选项在两次渲染之间失效（变量变化导致条件不再成立）。
        // 这是正常竞态，提示一下即可，不要抛错。
        setNotice('这个选择现在不可用了')
        return
      }
      /**
       * 先把引擎进度回写成存档，再用 `advanceTo` 补上访问记录与历史。
       *
       * 不自己拼 `visited`：`advanceTo` 同时负责「去重加入 visited」
       * 与「插入一条 history 并按 MAX_HISTORY 截断」，
       * 分散在两处写迟早会出现「回顾面板里的顺序和实际走过的顺序不一致」。
       */
      const base = fromProgress(next, jianjiaStory.id, { favorites: save.favorites })
      setSave(advanceTo(base, jianjiaStory.nodes[next.currentNodeId], next.variables))

      // 确认音。放在状态落地之后：声音是"这一下已经生效了"的回执，
      // 提前响会在选择被拒（上面那个 return）时给出一个骗人的确认。
      if (soundOn) ambienceRef.current?.cue('confirm')
    },
    [progress, save.favorites, soundOn],
  )

  /** 闸门满足：记录到进度里。场景已经知道自己满足了，这里只补上宿主的记录。 */
  const onGateSatisfied = useCallback(() => {
    if (!node.gate) return
    const gateId = node.gate.id
    setSave((current) => (toProgress(current).openedGates.includes(gateId) ? current : {
      ...current,
      openedGates: [...current.openedGates, gateId],
    }))
  }, [node])

  /**
   * 把最新的闸门处理函数挂进转发槽。
   *
   * 写在 effect 里而不是渲染期直接赋值：渲染期改 ref 在并发渲染下可能被
   * 丢弃或重复执行，而这一个副作用必须精确地「跟着当前节点走」。
   */
  useEffect(() => {
    gateCallbackRef.current = onGateSatisfied
  }, [onGateSatisfied])

  return (
    <div className="world-shell">
      <div className="world-host" ref={hostRef} />

      <StoryHud
        node={node}
        variables={progress.variables}
        choices={choices}
        ending={ending}
        gateHint={gateOpen ? null : (node.gate?.hint ?? null)}
        focusedLabel={focusedLabel}
        locked={frame.locked}
        sceneReady={sceneReady}
        notice={notice}
        onChoose={onChoose}
        onOpenCodex={() => setShowCodex(true)}
        onOpenMap={() => setNotice('故事地图还在搭建中')}
        onSave={() => setNotice('进度已自动保存')}
        onOpenSettings={() => setNotice('设置面板还在搭建中')}
        onRequestLock={requestLock}
        onChoiceHover={onChoiceHover}
        soundOn={soundOn}
        onToggleSound={toggleSound}
        progressLabel={`${String(progress.visited.length).padStart(2, '0')} / ${String(Object.keys(jianjiaStory.nodes).length).padStart(2, '0')}`}
      />

      {showCodex && (
        <CodexPanel
          graph={jianjiaStory}
          visitedIds={progress.visited}
          currentNodeId={progress.currentNodeId}
          favorites={save.favorites}
          history={save.history}
          legacy={legacy}
          onClose={() => setShowCodex(false)}
          onJump={(nodeId) => {
            /**
             * 跳转只改当前位置，不动 visited / history。
             *
             * 回顾面板里的跳转是"重读"，不是"重走"——
             * 把它记成一次新的访问会让进度文本与历史记录双双虚高，
             * 而玩家只是回头看了一眼。
             */
            setSave((current) => ({ ...current, nodeId }))
            setShowCodex(false)
          }}
        />
      )}
    </div>
  )
}
