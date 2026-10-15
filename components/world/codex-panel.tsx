'use client'

import { useEffect, useMemo, useState } from 'react'
import { BookOpen, Flag, X } from 'lucide-react'
import { FULL_NOTICE, ORIGINAL_STORY_ARCHIVE, PROJECT_GAME_URL, PROJECT_REPOSITORY, SOURCE_NOTICE } from '@/lib/source-notice'
import type { LegacyReviewChapter, StoryHistoryEntry } from '@/lib/story/save'
import type { StoryGraph } from '@/lib/story/types'
import './codex-panel.css'

/**
 * 回顾面板：重读已经走过的正文。
 *
 * ## 为什么需要它
 *
 * 字幕层为了不挡住画面，一次只显示两段。这个取舍成立的前提是**正文不会丢**——
 * 玩家想重读时得有个地方把完整段落还给他。这个面板就是那个地方，
 * 也是第一人称化之后唯一还允许占据整屏的界面。
 *
 * ## 两种条目混在一起
 *
 * `nodes` 来自新格式进度，`legacy` 来自迁移失败的旧存档章节。晚者没有
 * `sceneId`，点不进任何场景，但它仍然是玩家读过的东西。放在同一个列表里、
 * 用标签区分，比藏在另一个入口下更诚实。
 */

type CodexPanelProps = {
  graph: StoryGraph
  /** 已访问节点 id。顺序由宿主决定（通常是走过的先后），这里只做过滤与去重。 */
  visitedIds: string[]
  /** 当前位置，列表里高亮。 */
  currentNodeId: string
  /** 收藏的节点 id。宿主还没接收藏时留空即可。 */
  favorites?: string[]
  /** 「走到某节点」的记录，按时间倒序。为空时整块历史区不出现。 */
  history?: StoryHistoryEntry[]
  /** 旧存档里映射不上的章节，只读。 */
  legacy?: LegacyReviewChapter[]
  onClose: () => void
  /** 回到某个节点。缺省时正文只读。 */
  onJump?: (nodeId: string) => void
}

export default function CodexPanel({
  graph,
  visitedIds,
  currentNodeId,
  favorites = [],
  history = [],
  legacy = [],
  onClose,
  onJump,
}: CodexPanelProps) {
  /**
   * 章节序列。
   *
   * 按 `visited` 的传入顺序（即玩家实际走过的先后）排列，而不是按图里的定义顺序：
   * 这是一份**回忆**，回忆的顺序是经历的顺序。同一个节点重复走过只留一次。
   */
  const entries = useMemo(() => {
    const seen = new Set<string>()
    const nodes = visitedIds
      .filter((id) => {
        if (seen.has(id) || !(id in graph.nodes)) return false
        seen.add(id)
        return true
      })
      .map((id) => ({ kind: 'node' as const, id, node: graph.nodes[id] }))
    const legacyEntries = legacy.map((chapter) => ({ kind: 'legacy' as const, id: chapter.id, chapter }))
    return [...nodes, ...legacyEntries]
  }, [visitedIds, legacy, graph])

  const [activeId, setActiveId] = useState(() => (entries.some((entry) => entry.id === currentNodeId) ? currentNodeId : entries[0]?.id ?? ''))
  const active = entries.find((entry) => entry.id === activeId) ?? entries[0]

  // 面板打开期间 Esc 关闭。全屏弹窗吃掉键盘是必要的，但必须留一个不出错的出口。
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="generator-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="info-panel codex-panel" role="dialog" aria-modal="true" aria-labelledby="codex-title">
        <button className="close-generator" onClick={onClose} aria-label="关闭">
          <X />
        </button>
        <p className="eyebrow">CODEX / MEMORY</p>
        <h2 id="codex-title">回顾</h2>
        <p>你已经走过 {entries.length} 处。选择一处，重读那时的全文。</p>

        {entries.length === 0 ? (
          <div className="archive-empty">
            <BookOpen />
            <strong>还没有可以回顾的段落</strong>
            <span>在场景里走动，走过的地方会自动记录在这里。</span>
          </div>
        ) : (
          <div className="codex-layout">
            <ol className="codex-list">
              {entries.map((entry, index) => {
                const title = entry.kind === 'node' ? entry.node.title : entry.chapter.title
                const meta = entry.kind === 'node' ? entry.node.year : `${entry.chapter.year} · 旧存档`
                const isActive = entry.id === active?.id
                return (
                  <li key={entry.id}>
                    <button
                      className={`codex-item ${isActive ? 'active' : ''} ${entry.id === currentNodeId ? 'current' : ''}`}
                      onClick={() => setActiveId(entry.id)}
                    >
                      <b>{String(index + 1).padStart(2, '0')}</b>
                      <span>
                        <strong>{title}</strong>
                        <small>{meta}</small>
                      </span>
                      {entry.kind === 'node' && favorites.includes(entry.id) && <Flag className="codex-flag" />}
                    </button>
                  </li>
                )
              })}
            </ol>

            <article className="codex-detail">
              {active?.kind === 'node' ? (
                <>
                  <div className="codex-detail-head">
                    <span className="hud-subtitle-year">{active.node.year}</span>
                    <h3>{active.node.title}</h3>
                    <span className="codex-place">{active.node.location}</span>
                  </div>
                  <div className="original-text codex-text">{active.node.text}</div>
                  <blockquote className="hud-quote">“{active.node.quote}”</blockquote>
                  <div className="codex-detail-actions">
                    {onJump && active.id !== currentNodeId ? (
                      <button className="generate-button" onClick={() => onJump(active.id)}>
                        <Flag /> 回到这里
                      </button>
                    ) : (
                      <span className="codex-current-note">{active.id === currentNodeId ? '你正在这里' : '本节点不可跳转'}</span>
                    )}
                    <span className="codex-hint">场景：{active.node.sceneId}</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="codex-detail-head">
                    <span className="hud-subtitle-year">{active?.chapter.year}</span>
                    <h3>{active?.chapter.title}</h3>
                    <span className="codex-place">{active?.chapter.location}</span>
                  </div>
                  <p className="codex-legacy-note">这一段来自旧版存档，与新版故事对不上，只能阅读。</p>
                  <div className="original-text codex-text">{active?.chapter.text || '这一段没有留存正文。'}</div>
                  {active?.chapter.quote && <blockquote className="hud-quote">“{active.chapter.quote}”</blockquote>}
                </>
              )}
            </article>
          </div>
        )}

        {history.length > 0 && (
          <details className="codex-history">
            <summary>最近走过的 {history.length} 个瞬间</summary>
            <ul>
              {history.map((entry) => (
                <li key={entry.id}>
                  <span>{entry.nodeTitle}</span>
                  <time dateTime={entry.savedAt}>{formatMoment(entry.savedAt)}</time>
                </li>
              ))}
            </ul>
          </details>
        )}

        {/* 版权声明由 `lib/source-notice.ts` 统一提供，这里不写死任何文案。
            回顾面板是全文可读的地方，声明必须出现在这里而不是只放在说明弹窗里。 */}
        <p className="copyright-note">
          {SOURCE_NOTICE} 查看 <a className="copyright-link" href={PROJECT_REPOSITORY} target="_blank" rel="noreferrer noopener">GitHub 仓库</a> 或
          <a className="copyright-link" href={PROJECT_GAME_URL} target="_blank" rel="noreferrer noopener"> 线上游戏</a>。原文存档于 {ORIGINAL_STORY_ARCHIVE}。
        </p>
        <details className="codex-history">
          <summary>完整声明（复制与分享时请一并保留）</summary>
          <pre className="codex-notice">{FULL_NOTICE}</pre>
        </details>
      </section>
    </div>
  )
}

/** 时间戳只给到「月-日 时:分」。回顾里不需要年份，一局游戏不会跨年。 */
function formatMoment(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '时间未知'
  return date.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
