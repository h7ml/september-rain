'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, BookOpen, Flag, Loader2, Map, Save, Settings, Volume2, VolumeX } from 'lucide-react'
import type { StoryChoice, StoryEnding, StoryNode, StoryVariables } from '@/lib/story/types'
import './story-hud.css'

/**
 * 叙事 HUD。
 *
 * ## 与旧版居中卡片的根本区别
 *
 * 旧版把故事放在**屏幕正中**，因为那里是唯一的焦点。第一人称下屏幕正中
 * 是玩家正在看的场景，`gate` 未解开时更是唯一的交互区——再压一张卡片上去，
 * 探索就变成了「透过一扇窗户读文字」。
 *
 * 所以这里按状态分三档：
 * 1. **探索中**（指针未锁定）→ 只有准星与引导，正文不出现。
 * 2. **交互中**（已锁定，且 gate 已解开或无 gate）→ 正文从**底部字幕层**升起，
 *    压在画面下沿，视平线以上保持干净。
 * 3. **回顾**（打开回顾面板）→ 全文可读，但那是全屏弹窗，此时不需要看场景。
 *
 * ## 为什么正文自己分页而不是 `overflow: auto`
 *
 * 滚轮在第一人称里是高频输入，一个会滚动的正文容器迟早会吃掉玩家的操作。
 * 换成「先给两段 + 手动展开」，玩家读不完时是主动要的更多，而不是被动滚动。
 */

type StoryHudProps = {
  /** 当前节点。 */
  node: StoryNode
  /** 当前世界记忆，用于左下角的倾向指示。 */
  variables: StoryVariables
  /**
   * 本节点当前可见的选择。
   *
   * 条件求值在宿主（故事引擎）那边做，HUD 不碰 `StoryCondition`：
   * 同一套判定若在两处实现，迟早出现「按钮出现了但点不动」。
   */
  choices: StoryChoice[]
  /** 已抵达的结局。非空时本节点是终态，不再显示选择。 */
  ending: StoryEnding | null
  /** 未解开的 gate 提示；`null` 表示闸门已开或本节点没有闸门。 */
  gateHint: string | null
  /** 准星当前对准的热点文案，由交互系统从 `Hotspot.label` 取。 */
  focusedLabel: string | null
  /** 指针是否已被锁定。 */
  locked: boolean
  /** 当前节点的场景是否已经实现。未实现时要告诉玩家，而不是给一片黑。 */
  sceneReady: boolean
  /** 宿主的一次性提示，例如「已恢复上次的进度」。 */
  notice?: string
  /** 选项悬停/聚焦。宿主拿它驱动 3D 场景的反应。 */
  onChoiceHover?: (hovered: boolean) => void
  onChoose: (choice: StoryChoice) => void
  onOpenCodex: () => void
  /** 点击画面请求进入指针锁定。 */
  onRequestLock: () => void
  onOpenMap?: () => void
  onSave?: () => void
  onOpenSettings?: () => void
  /**
   * 声音是否打开。
   *
   * 刻意用「开 / 关」而不是音量条：这个游戏的声景是场景氛围的一部分
   * （雨、风、房间的嗡鸣），没有"调小一点"的中间诉求——
   * 要么听这场雨，要么安静地读。给一个音量滑块会让玩家开始
   * 琢磨"调到多少合适"，那是听音乐的心态，不是读故事的心态。
   */
  soundOn?: boolean
  onToggleSound?: () => void
  /** 顶栏右侧的进度文本，例如「03 / 18」。 */
  progressLabel?: string
}

/** 字幕层首屏显示几段。再多就把画面吃掉一半。 */
const VISIBLE_PARAGRAPHS = 2
/** 展开后最多显示几段，超出部分引导去回顾面板。 */
const MAX_PARAGRAPHS = 5

export default function StoryHud({
  node,
  variables,
  choices,
  ending,
  gateHint,
  focusedLabel,
  locked,
  sceneReady,
  notice,
  onChoiceHover,
  onChoose,
  onOpenCodex,
  onRequestLock,
  onOpenMap,
  onSave,
  onOpenSettings,
  soundOn = false,
  onToggleSound,
  progressLabel,
}: StoryHudProps) {
  const [expanded, setExpanded] = useState(false)

  // 换节点时收起正文：上一节的展开状态带过来会让新节点一进来就占满下半屏。
  useEffect(() => setExpanded(false), [node.id])

  const paragraphs = useMemo(() => node.text.split(/\n+/).map((line) => line.trim()).filter(Boolean), [node.text])
  const visibleCount = expanded ? MAX_PARAGRAPHS : VISIBLE_PARAGRAPHS
  const shown = paragraphs.slice(0, visibleCount)
  const remaining = paragraphs.length - visibleCount

  /**
   * 字幕层的显示条件：已锁定指针，且**本节点真有可读的东西或可做的选择**。
   *
   * 只判 `locked` 会让纯探索场景（没有 gate、也没到选择点）也压一层字幕上来，
   * 而那种节点的正文通常要在玩家找到东西之后才该出现。
   */
  const showSubtitle = locked && (paragraphs.length > 0 || choices.length > 0 || Boolean(gateHint) || Boolean(ending))

  /**
   * 数字键选分支。
   *
   * 条件与字幕层完全一致。只判「未锁定」会留下一个隐藏操作：
   * 字幕层没出现时按键照样能推进剧情，玩家会在不知情的情况下跳过一个场景。
   */
  useEffect(() => {
    if (!showSubtitle || gateHint || ending || !choices.length) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const index = Number(event.key) - 1
      const choice = choices[index]
      if (!choice) return
      event.preventDefault()
      onChoose(choice)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [choices, ending, gateHint, onChoose, showSubtitle])

  return (
    <div className="hud-layer">
      {/* 顶栏：比旧版更薄。地点与章节是玩家的方位感来源，其余按钮退成图标。
          按钮按「有没有回调」决定是否出现——宿主还没接的功能不该占着一个点不动的位置。 */}
      <header className="hud-topbar">
        <div className="hud-place">
          <span className="hud-location">{node.location}</span>
          <span className="hud-year">{node.year}</span>
          {!sceneReady && <span className="hud-scene-flag">场景建设中</span>}
        </div>
        <div className="hud-actions">
          <button className="hud-icon-button" onClick={onOpenCodex} aria-label="回顾已读正文" title="回顾">
            <BookOpen />
          </button>
          {onOpenMap && (
            <button className="hud-icon-button" onClick={onOpenMap} aria-label="打开场景地图" title="地图">
              <Map />
            </button>
          )}
          {onSave && (
            <button className="hud-icon-button" onClick={onSave} aria-label="保存当前进度" title="存档">
              <Save />
            </button>
          )}
          {onOpenSettings && (
            <button className="hud-icon-button" onClick={onOpenSettings} aria-label="打开设置" title="设置">
              <Settings />
            </button>
          )}
          {onToggleSound && (
            /**
             * 声音开关常驻可见，不放进设置面板。
             *
             * 理由：它是最可能被**立刻需要**的一个开关——玩家可能在图书馆、
             * 深夜、或者旁边有人。埋进二级面板意味着他要先探索 UI 才能让游戏安静下来，
             * 而那几秒里声音已经在放了。这是少数值得占用顶栏位置的控制。
             */
            <button
              className="hud-icon-button"
              onClick={onToggleSound}
              aria-label={soundOn ? '关闭声音' : '打开声音'}
              aria-pressed={soundOn}
              title={soundOn ? '关闭声音' : '打开声音'}
            >
              {soundOn ? <Volume2 /> : <VolumeX />}
            </button>
          )}
          {progressLabel && <span className="hud-progress">{progressLabel}</span>}
        </div>
      </header>

      {/* 提示条贴在顶栏下方：宿主的状态变化（读档、存档失败）通常发生在玩家
          还没进入场景的时候，这时任何居中的东西都会和引导层打架。 */}
      {notice && (
        <div className="hud-notice" role="status">
          <Flag />
          <span>{notice}</span>
        </div>
      )}

      {/* 准星：探索状态下唯一持续存在的 UI。未对准时只是一个点。 */}
      <div className={`hud-crosshair ${focusedLabel ? 'is-focused' : ''}`} aria-hidden="true">
        <span className="hud-crosshair-mark" />
      </div>

      {/* 热点提示挂在准星下沿 26px 处，视线不用离开焦点就能读到。 */}
      {focusedLabel && locked && (
        <div className="hud-focus-label" role="status">
          <span>{focusedLabel}</span>
          <small>点击查看</small>
        </div>
      )}

      {/* 指针锁定引导。首次进入与每次 Esc 退出后都要出现，否则玩家不知道如何回到场景。 */}
      {!locked && (
        <div
          className="hud-gate-veil"
          role="button"
          tabIndex={0}
          onClick={onRequestLock}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              onRequestLock()
            }
          }}
        >
          <div className="hud-gate-card">
            <p className="hud-gate-kicker">FIRST PERSON</p>
            <h2 className="hud-gate-title">点击进入场景</h2>
            <ul className="hud-keys">
              <li><b>点击画面</b><span>进入场景，鼠标变为视线</span></li>
              <li><b>W A S D</b><span>走动，按住 Shift 快走</span></li>
              <li><b>鼠标左键</b><span>查看准星对准的东西</span></li>
              <li><b>Esc</b><span>退出观察，回到本页</span></li>
            </ul>
            <p className="hud-gate-hint">{gateHint ?? '在场景里走走，故事会在该发生的地方等你。'}</p>
          </div>
        </div>
      )}

      {/* 底部字幕层。只在有正事可做时升起，不遮挡视平线。 */}
      {showSubtitle && (
        <section className="hud-subtitle" aria-label="当前段落">
          <div className="hud-subtitle-head">
            <span className="hud-subtitle-year">{node.year}</span>
            <h1 className="hud-subtitle-title">{node.title}</h1>
          </div>
          <div className="hud-subtitle-body">
            {shown.map((line, index) => (
              <p key={index}>{line}</p>
            ))}
          </div>
          {remaining > 0 && (
            <button className="hud-more" onClick={() => setExpanded(true)}>
              继续读这段（还有 {remaining} 段）
            </button>
          )}
          <blockquote className="hud-quote">“{node.quote}”</blockquote>

          {ending ? (
            /* 终态：给一句定调的话和一个出口。旧版终章还渲染着选择按钮，
               这条在 AGENT.md 里是被明确禁止的。 */
            <div className={`hud-ending is-${ending.tone}`}>
              <p className="hud-ending-kicker">ENDING · {ending.title}</p>
              <p className="hud-ending-text">{ending.text}</p>
              <blockquote className="hud-quote">“{ending.quote}”</blockquote>
              <button className="hud-ending-action" onClick={onOpenCodex}>
                <BookOpen /> 重读这一路
              </button>
            </div>
          ) : gateHint ? (
            /* 闸门未开：给提示而不是空等。玩家该知道是自己还没找到东西，不是游戏卡了。 */
            <p className="hud-gate-note">{gateHint}</p>
          ) : choices.length > 0 ? (
            <div className={`hud-choices ${choices.length > 2 ? 'is-grid' : ''}`} aria-label="选择你的回应">
              {choices.map((choice, index) => (
                <button
                  key={`${choice.next}-${index}`}
                  className="choice-button hud-choice"
                  onClick={() => onChoose(choice)}
                  onPointerEnter={() => onChoiceHover?.(true)}
                  onPointerLeave={() => onChoiceHover?.(false)}
                  onFocus={() => onChoiceHover?.(true)}
                  onBlur={() => onChoiceHover?.(false)}
                >
                  <span>
                    <strong>{choice.label}</strong>
                    <small>{choice.note}</small>
                  </span>
                  <ArrowRight />
                  {index < 9 && (
                    <i className="hud-choice-key" aria-hidden="true">{index + 1}</i>
                  )}
                </button>
              ))}
            </div>
          ) : sceneReady ? (
            <p className="hud-gate-note">这一段走到了尽头。打开回顾，可以重读一路走来的全部正文。</p>
          ) : (
            /* 场景还没实现时，唯一诚实的话是「再等等」。 */
            <p className="hud-gate-note">
              <Loader2 className="spin" /> 这个场景还在搭建中，先在这里读一段。
            </p>
          )}
        </section>
      )}

      {/* 心情指示：只在有偏移时出现。它不是进度条，不告诉玩家「还差多少」。 */}
      <MoodIndicator variables={variables} />
    </div>
  )
}

/**
 * 三项变量的低调显示。
 *
 * 刻意不给数值：`closeness: 3` 会让玩家开始优化分数，
 * 而这段故事想表达的恰恰是「选择没有正确答案」。
 * 条形只表达方向与大致强度。
 */
function MoodIndicator({ variables }: { variables: StoryVariables }) {
  const items: Array<{ key: keyof StoryVariables; label: string }> = [
    { key: 'closeness', label: '靠近' },
    { key: 'regret', label: '遗憾' },
    { key: 'growth', label: '成长' },
  ]
  return (
    <div className="hud-mood" aria-label="这一路的倾向">
      {items.map(({ key, label }) => {
        const value = variables[key]
        return (
          <span className="hud-mood-item" key={key}>
            <i className="hud-mood-track">
              <i
                className="hud-mood-fill"
                style={{ transform: `scaleX(${Math.max(Math.abs(value) / 10, 0.02)})`, opacity: value === 0 ? 0.18 : 1 }}
              />
            </i>
            <span>{label}</span>
          </span>
        )
      })}
    </div>
  )
}
