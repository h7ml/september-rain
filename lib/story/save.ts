/**
 * 存档系统 v2：节点图进度 + 旧章节存档迁移。
 *
 * ## 为什么要换 key 而不是原地升级
 *
 * v1 存的是「整份章节数组 + 当前下标」，v2 存的是「节点 id + 变量 + 足迹」。
 * 两者没有共同字段，同一把钥匙下会互相覆盖。更麻烦的是迁移**可能失败**
 * （见下面的映射规则）：一旦在旧 key 上写了一半的新格式，
 * 玩家既丢掉了旧进度，也拿不到新进度，且无法重试。
 * 所以 v2 用新 key，旧 key 只读不写，迁移失败还能重来。
 *
 * ## 一条原则
 *
 * 任何一步都不抛异常。存档是**玩家自己机器上的脏数据**：
 * 手改过、跨版本残留、被别的东西写进同一个 origin 都可能发生。
 * 读档的失败路径是「降级」，不是让首页白屏。
 */

import {
  INITIAL_VARIABLES,
  VARIABLE_BOUNDS,
  type StoryGraph,
  type StoryNode,
  type StoryRoute,
  type StoryVariables,
} from './types'
import type { StoryProgress } from './engine'

/** v2 存档的存储键。刻意不复用 v1 的 `jianjia-saved-game`。 */
export const SAVE_KEY_V2 = 'jianjia-save-v2'
/** v1 存档的存储键，只读不写。 */
export const LEGACY_SAVE_KEY = 'jianjia-saved-game'
/** 历史记录条数上限。与 v1 保持一致（12 条），足够回溯一局，又不会把 localStorage 撑满。 */
export const MAX_HISTORY = 12

/** 一次「走到某节点」的记录。只记位置，不记快照——回看正文是回顾面板从图里取的。 */
export type StoryHistoryEntry = {
  id: string
  nodeId: string
  /** 记录当时的节点标题。节点后来被改名时，历史里仍显示玩家当时看到的那个名字。 */
  nodeTitle: string
  /** ISO 时间。存 ISO 而不是展示串，格式化留给渲染层，改文案不必做数据迁移。 */
  savedAt: string
}

/** v2 存档。 */
export type StorySaveV2 = {
  version: 2
  /** 图的稳定标识。与当前图不一致时只恢复可通用的部分（收藏、历史）。 */
  graphId: string
  nodeId: string
  variables: StoryVariables
  /** 已访问节点 id。用普通数组而不是 Set：Set 走不了 JSON。 */
  visited: string[]
  /**
   * 当前所在路线。
   *
   * 引擎的 `StoryProgress` 里 `route` 与 `openedGates` 是结局判定与闸门状态的一部分，
   * 漏存它们会让读档后的玩家「走过同一条路却拿到另一个结局」——
   * 那是最难排查的一类 bug，所以这里必须与引擎字段一一对应。
   */
  route: StoryRoute | null
  /** 已打开的闸门 id。不存的话玩家读档后要重新在场景里找一遍已经找到的东西。 */
  openedGates: string[]
  favorites: string[]
  history: StoryHistoryEntry[]
}

/**
 * v1 章节。字段全部可选：这是**外部数据**，不能假设它长得和当年一样。
 * 迁移只依赖 `title`，其余字段仅用于回顾面板的展示兜底。
 */
type LegacyChapter = {
  title?: string
  year?: string
  location?: string
  text?: string
  quote?: string
}

type LegacySaveV1 = {
  chapter?: number
  started?: boolean
  chapters?: LegacyChapter[]
  title?: string
  favorites?: number[]
}

/**
 * 迁移时映射不上旧章节的去处。
 *
 * 为什么保留而不是丢弃：旧存档里可能躺着玩家自己生成的故事
 * （旧版支持 AI 生成章节）。判定不了就删掉，等于把玩家写过的东西删了。
 * 但这些章节在新图里没有对应节点，**不能**被当成当前进度——那会让玩家
 * 落进一个不存在的场景。所以它们只进回顾面板，明确标注为历史记录。
 */
export type LegacyReviewChapter = {
  id: string
  year: string
  title: string
  location: string
  text: string
  quote: string
  /** 匹配上的节点 id；`null` 表示新图里没有对应节点。 */
  nodeId: string | null
}

/** 可继续游玩的存档。 */
export type PlayableSave = {
  kind: 'playable'
  save: StorySaveV2
  /** 旧存档里没映射上的章节，交给回顾面板单独展示。 */
  legacyReview: LegacyReviewChapter[]
  /** 本次读档要向玩家交代的一句话；无异常时为 `null`。 */
  notice: string | null
}

/**
 * 不可推进、只能回看的存档。
 *
 * `reason` 覆盖三类场景：旧数据整块映射不上、图换了 id、节点 id 已被删。
 * 它们的共同点是——数据还在，只是不能再往前走。
 */
export type ReadonlySave = {
  kind: 'readonly'
  reason: 'legacy-unmapped' | 'graph-mismatch' | 'unknown-node'
  /** 能确定的部分尽量恢复，避免玩家连走过的正文都读不到。 */
  save: StorySaveV2
  legacyReview: LegacyReviewChapter[]
  notice: string
}

export type LoadSaveResult = PlayableSave | ReadonlySave | null

/* ------------------------------------------------------------------ *
 * 基础工具
 * ------------------------------------------------------------------ */

function clamp(value: number): number {
  return Math.max(VARIABLE_BOUNDS.min, Math.min(VARIABLE_BOUNDS.max, value))
}

/** 把任意来源的对象收敛成合法的 `StoryVariables`。缺失维度取初始值，越界钳制，非数值丢弃。 */
function sanitizeVariables(raw: unknown): StoryVariables {
  const source = (raw ?? {}) as Partial<Record<keyof StoryVariables, unknown>>
  const pick = (key: keyof StoryVariables) =>
    typeof source[key] === 'number' && Number.isFinite(source[key]) ? clamp(source[key] as number) : INITIAL_VARIABLES[key]
  return { closeness: pick('closeness'), regret: pick('regret'), growth: pick('growth') }
}

function sanitizeStringList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return Array.from(new Set(raw.filter((item): item is string => typeof item === 'string' && item.length > 0)))
}

/** 路线标记只有两种取值。存进来的任何别的东西都当作「还没分叉」。 */
function sanitizeRoute(raw: unknown): StoryRoute | null {
  return raw === 'approach' || raw === 'hold-back' ? raw : null
}

function sanitizeHistory(raw: unknown): StoryHistoryEntry[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((item): item is StoryHistoryEntry => {
      const entry = item as Partial<StoryHistoryEntry> | null
      return !!entry && typeof entry.nodeId === 'string' && entry.nodeId.length > 0
    })
    .slice(0, MAX_HISTORY)
    .map((entry) => ({
      id: typeof entry.id === 'string' ? entry.id : `${entry.nodeId}-${entry.savedAt ?? ''}`,
      nodeId: entry.nodeId,
      nodeTitle: typeof entry.nodeTitle === 'string' ? entry.nodeTitle : entry.nodeId,
      savedAt: typeof entry.savedAt === 'string' ? entry.savedAt : new Date(0).toISOString(),
    }))
}

/** 空存档：全新玩家与「数据完全不可用」共用同一起点。 */
export function createSave(graphId: string, startNodeId: string): StorySaveV2 {
  return {
    version: 2,
    graphId,
    nodeId: startNodeId,
    variables: { ...INITIAL_VARIABLES },
    visited: [startNodeId],
    route: null,
    openedGates: [],
    favorites: [],
    history: [],
  }
}

/**
 * 与叙事引擎的转换层。
 *
 * 为什么不让 `StorySaveV2` 直接等于 `StoryProgress`：引擎那侧是**运行时形状**，
 * 这侧是**磁盘形状**，职责不同。磁盘要带 `version`、`graphId`、`favorites`
 * 这些运行时没有的东西；运行时也不该知道存档格式。转换放在一处，
 * 引擎加字段时这里会立刻报类型错，比两边共用一个类型再悄悄丢字段安全。
 */
export function toProgress(save: StorySaveV2): StoryProgress {
  return {
    currentNodeId: save.nodeId,
    variables: save.variables,
    visited: save.visited,
    route: save.route,
    openedGates: save.openedGates,
  }
}

/** 把运行时进度落成存档形状。`extra` 用来带上不属于引擎状态的收藏与历史。 */
export function fromProgress(
  progress: StoryProgress,
  graphId: string,
  extra: { favorites?: string[]; history?: StoryHistoryEntry[] } = {},
): StorySaveV2 {
  return {
    version: 2,
    graphId,
    nodeId: progress.currentNodeId,
    variables: progress.variables,
    visited: progress.visited,
    route: progress.route,
    openedGates: progress.openedGates,
    favorites: extra.favorites ?? [],
    history: extra.history ?? [],
  }
}

/**
 * 写入历史记录：同一节点只保留最新一条，整体截断到 `MAX_HISTORY`。
 *
 * 去重是为了让「历史」读起来是**一条路线**而不是一份重复列表——
 * 玩家在场景里来回走会反复经过同一节点，不去重的话记录会被同一处刷满。
 */
export function appendHistory(
  save: StorySaveV2,
  node: Pick<StoryNode, 'id' | 'title'>,
  now: Date = new Date(),
): StorySaveV2 {
  const entry: StoryHistoryEntry = {
    id: `${now.getTime()}-${node.id}`,
    nodeId: node.id,
    nodeTitle: node.title,
    savedAt: now.toISOString(),
  }
  return { ...save, history: [entry, ...save.history.filter((item) => item.nodeId !== node.id)].slice(0, MAX_HISTORY) }
}

/** 把玩家推进到某个节点：更新位置、足迹与历史。变量由调用方另行传入。 */
export function advanceTo(
  save: StorySaveV2,
  node: Pick<StoryNode, 'id' | 'title'>,
  variables: StoryVariables = save.variables,
): StorySaveV2 {
  const next = { ...save, nodeId: node.id, variables: sanitizeVariables(variables) }
  next.visited = save.visited.includes(node.id) ? save.visited : [...save.visited, node.id]
  return appendHistory(next, node)
}

/* ------------------------------------------------------------------ *
 * 旧存档迁移
 * ------------------------------------------------------------------ */

function buildTitleIndex(graph: StoryGraph): Map<string, string> {
  const index = new Map<string, string>()
  for (const node of Object.values(graph.nodes)) {
    if (!index.has(node.title)) index.set(node.title, node.id)
  }
  return index
}

/**
 * 旧章节 → 新节点。
 *
 * 只用标题匹配，理由：v1 的下标在 v2 里毫无意义（图结构已经不同），
 * 而标题是唯一一份两边都有人手写、且玩家能认出来的标识。
 * 匹配不上就返回 `null`，交给上层降级，而不是猜一个位置。
 */
function matchLegacyChapter(chapter: LegacyChapter, index: Map<string, string>): string | null {
  const title = chapter.title?.trim()
  if (!title) return null
  const exact = index.get(title)
  if (exact) return exact
  // 标题被改写过的情况：一侧是另一侧的前缀（例如「看台上的白裙子」→「看台上的白裙子（重写）」）。
  // 只接受前缀，不做模糊相似度——相似度会把两个不同章节映射到同一节点，比不映射更糟。
  for (const [nodeTitle, nodeId] of index) {
    if (nodeTitle.startsWith(title) || title.startsWith(nodeTitle)) return nodeId
  }
  return null
}

/**
 * 把 v1 存档搬进 v2。
 *
 * 返回值是**结果联合**而不是「成功/抛错」：迁移失败的正常出口是
 * 「保留内容、禁止推进」，这条路必须能被显式表达。
 */
export function migrateLegacySave(raw: unknown, graph: StoryGraph): PlayableSave | ReadonlySave {
  const legacy = (raw ?? {}) as LegacySaveV1
  const chapters = Array.isArray(legacy.chapters) ? legacy.chapters : []
  const index = buildTitleIndex(graph)

  const legacyReview: LegacyReviewChapter[] = chapters.map((chapter, position) => ({
    id: `legacy-${position}`,
    year: chapter.year || `第 ${String(position + 1).padStart(2, '0')} 章`,
    title: chapter.title || `未命名章节 ${String(position + 1).padStart(2, '0')}`,
    location: chapter.location || '未知地点',
    text: chapter.text || '',
    quote: chapter.quote || '',
    nodeId: matchLegacyChapter(chapter, index),
  }))

  const mappedIds = legacyReview.flatMap((chapter) => (chapter.nodeId ? [chapter.nodeId] : []))
  // 从玩家当时停下的那一章往前找第一个映射得上的节点：
  // 旧下标指向的章节若映射失败，退到它之前最近的一处，比退回起点更接近玩家的真实位置。
  const stopAt = Math.min(Math.max(legacy.chapter ?? 0, 0), Math.max(legacyReview.length - 1, 0))
  let resumeNodeId: string | null = null
  for (let position = stopAt; position >= 0; position -= 1) {
    const candidate = legacyReview[position]?.nodeId
    if (candidate) {
      resumeNodeId = candidate
      break
    }
  }

  // 收藏在 v1 里也是下标，映射失败就整条放弃：把收藏指向错误的节点比丢掉更让人困惑。
  const favorites = Array.isArray(legacy.favorites)
    ? legacy.favorites.flatMap((position) => {
        const id = Number.isInteger(position) ? legacyReview[position]?.nodeId : null
        return id ? [id] : []
      })
    : []

  if (mappedIds.length === 0) {
    return {
      kind: 'readonly',
      reason: 'legacy-unmapped',
      save: {
        ...createSave(graph.id, graph.start),
        variables: { ...INITIAL_VARIABLES },
        visited: [],
        favorites: [],
        history: legacyReview
          .filter((chapter) => chapter.text.length > 0)
          .slice(0, MAX_HISTORY)
          .map((chapter) => ({ id: chapter.id, nodeId: chapter.id, nodeTitle: chapter.title, savedAt: new Date(0).toISOString() })),
      },
      legacyReview,
      notice: '旧存档与新版故事对不上，已作为历史记录保留在回顾面板，不影响新的一周目。',
    }
  }

  const resumeNode = resumeNodeId ? graph.nodes[resumeNodeId] : undefined
  const save: StorySaveV2 = {
    version: 2,
    graphId: graph.id,
    nodeId: resumeNode?.id ?? graph.start,
    // v1 没有变量系统，只能从零开始。这里不做任何"补偿性"初始化：
    // 变量的意义是「玩家做过什么」，凭旧下标猜一个值会污染结局判定。
    variables: { ...INITIAL_VARIABLES },
    visited: Array.from(new Set(mappedIds)),
    // 路线与闸门同理：v1 里根本没有这两个概念，只能留空。
    route: null,
    openedGates: [],
    favorites,
    history: [],
  }
  const withHistory = resumeNode ? appendHistory(save, resumeNode) : save
  const dropped = legacyReview.length - mappedIds.length

  return {
    kind: 'playable',
    save: withHistory,
    legacyReview,
    notice: dropped > 0
      ? `旧存档已升级到新版，其中 ${dropped} 章找不到对应的场景，已移入回顾面板。`
      : '旧存档已升级到新版，阅读位置已为你保留。',
  }
}

/* ------------------------------------------------------------------ *
 * 读写
 * ------------------------------------------------------------------ */

/** 存储可用性。隐私模式下 `localStorage` 存在但写入抛错，所以读写都要夹住。 */
function getStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null
    return window.localStorage
  } catch {
    return null
  }
}

function readRaw(key: string): unknown {
  const storage = getStorage()
  if (!storage) return null
  try {
    const text = storage.getItem(key)
    return text ? JSON.parse(text) : null
  } catch {
    // JSON 坏了就当作没有存档。这里不删 key：玩家可能想自己修。
    return null
  }
}

/**
 * 读档：v2 优先，v1 迁移兜底。
 *
 * 不返回「错误」——调用方只关心走到哪一步、以及要不要显示一句提示。
 */
export function loadSave(graph: StoryGraph): LoadSaveResult {
  const raw = readRaw(SAVE_KEY_V2) as Partial<StorySaveV2> | null

  if (raw && raw.version === 2) {
    const visited = sanitizeStringList(raw.visited)
    const nodeId = typeof raw.nodeId === 'string' ? raw.nodeId : ''
    const save: StorySaveV2 = {
      version: 2,
      graphId: typeof raw.graphId === 'string' ? raw.graphId : graph.id,
      nodeId,
      variables: sanitizeVariables(raw.variables),
      visited,
      route: sanitizeRoute(raw.route),
      openedGates: sanitizeStringList(raw.openedGates),
      favorites: sanitizeStringList(raw.favorites).filter((id) => id in graph.nodes),
      history: sanitizeHistory(raw.history),
    }

    // 图换了（作者改了故事或玩家自己生成了新故事）：进度不可信，但收藏与历史仍属于玩家。
    if (save.graphId !== graph.id) {
      return {
        kind: 'readonly',
        reason: 'graph-mismatch',
        save: { ...createSave(graph.id, graph.start), favorites: save.favorites, history: save.history, visited: [] },
        legacyReview: [],
        notice: '这段存档属于另一个故事，已作为回顾保留，你将从头开始新的旅程。',
      }
    }

    if (!save.nodeId || !(save.nodeId in graph.nodes)) {
      return {
        kind: 'readonly',
        reason: 'unknown-node',
        save: { ...save, nodeId: graph.start },
        legacyReview: [],
        notice: '存档里的目的地已不存在，已回到故事开头，走过的正文仍可在回顾面板里读到。',
      }
    }

    return { kind: 'playable', save, legacyReview: [], notice: null }
  }

  // v2 键下躺着未知/损坏的结构：连同 v1 一起当作没有存档，避免把一个乱版本号强行解释成进度。
  const legacy = readRaw(LEGACY_SAVE_KEY)
  if (legacy && typeof legacy === 'object') return migrateLegacySave(legacy, graph)

  return null
}

export type SaveGameResult = { ok: true } | { ok: false; reason: 'unavailable' | 'quota' }

/** 写档。配额满（章节全文很长时并非不可能）要能区分出来，让调用方决定是否提示玩家。 */
export function saveGame(save: StorySaveV2): SaveGameResult {
  const storage = getStorage()
  if (!storage) return { ok: false, reason: 'unavailable' }
  try {
    storage.setItem(
      SAVE_KEY_V2,
      JSON.stringify({
        version: 2,
        graphId: save.graphId,
        nodeId: save.nodeId,
        variables: sanitizeVariables(save.variables),
        visited: sanitizeStringList(save.visited),
        route: sanitizeRoute(save.route),
        openedGates: sanitizeStringList(save.openedGates),
        favorites: sanitizeStringList(save.favorites),
        history: sanitizeHistory(save.history),
      } satisfies StorySaveV2),
    )
    return { ok: true }
  } catch {
    return { ok: false, reason: 'quota' }
  }
}

/** 清空 v2 存档。刻意不动 v1 键：迁移是一次性的，删掉旧数据之后就没法再迁了。 */
export function clearSave(): void {
  try {
    getStorage()?.removeItem(SAVE_KEY_V2)
  } catch {
    // 清不掉就算了，下一次 loadSave 会把它当损坏数据处理
  }
}
