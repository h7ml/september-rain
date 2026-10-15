import { INITIAL_VARIABLES, VARIABLE_BOUNDS, type StoryChoice, type StoryCondition, type StoryEnding, type StoryGraph, type StoryNode, type StoryRoute, type StoryVariables, type VariableDelta } from './types'

/**
 * 叙事引擎：把故事图跑起来。
 *
 * 这里是**纯函数集合**，不持有状态、不碰 React、不碰 three.js。
 * 状态由宿主（`components/world/` 与 `app/page.tsx`）持有，
 * 因为存档、UI 与场景三个地方都要读它，藏在引擎里反而到处要传引用。
 *
 * 这样做还有一个好处：引擎的所有函数都可以直接拿去给 AI 生成的故事用
 * （`/api/generate-story` 未来输出同一种图结构时，引擎不用改）。
 */

/** 玩家的完整进度。这就是要存进 localStorage 的东西。 */
export type StoryProgress = {
  /** 当前节点 id */
  currentNodeId: string
  variables: StoryVariables
  /** 已访问节点 id，按访问顺序。用于「上次你选了 X」这类回溯文案与结局图鉴。 */
  visited: string[]
  /** 当前所在路线。未分叉前为 `null`。 */
  route: StoryRoute | null
  /** 已触发的闸门 id，避免同一段探索被要求两次。 */
  openedGates: string[]
}

/** 开局状态。 */
export function createProgress(graph: StoryGraph): StoryProgress {
  return {
    currentNodeId: graph.start,
    variables: { ...INITIAL_VARIABLES },
    visited: [],
    route: null,
    openedGates: [],
  }
}

/* ------------------------------------------------------------------ *
 * 变量
 * ------------------------------------------------------------------ */

/**
 * 应用一次变量变化。
 *
 * 钳制到 `VARIABLE_BOUNDS`：段落数会随时间增长，不钳制的话
 * 后期章节的选择会把早期选择完全淹没，结局判定就只反映最后几步。
 */
export function applyDelta(variables: StoryVariables, delta: VariableDelta | undefined): StoryVariables {
  if (!delta) return variables
  const next = { ...variables }
  for (const key of Object.keys(delta) as (keyof StoryVariables)[]) {
    const raw = next[key] + (delta[key] ?? 0)
    next[key] = Math.max(VARIABLE_BOUNDS.min, Math.min(VARIABLE_BOUNDS.max, raw))
  }
  return next
}

/* ------------------------------------------------------------------ *
 * 条件求值
 * ------------------------------------------------------------------ */

/**
 * 求值一个条件。
 *
 * `visited` 用数组而不是 Set：它要被 JSON 序列化进存档，
 * 且单周目最多几十个节点，线性查找的成本可以忽略——
 * 用 Set 反而要在读存档时重建，多一处可能不一致的状态。
 */
export function evaluateCondition(
  condition: StoryCondition | undefined,
  variables: StoryVariables,
  visited: string[],
  route: StoryRoute | null,
): boolean {
  if (!condition) return true

  switch (condition.kind) {
    case 'always':
      return true
    case 'all':
      return condition.of.every((item) => evaluateCondition(item, variables, visited, route))
    case 'any':
      return condition.of.some((item) => evaluateCondition(item, variables, visited, route))
    case 'atLeast':
      return variables[condition.key] >= condition.value
    case 'atMost':
      return variables[condition.key] <= condition.value
    case 'visited':
      return visited.includes(condition.nodeId)
    case 'hasRoute':
      return route === condition.route
  }
}

/** 该选项当前是否可选。不可选的选项**不渲染**，而不是置灰——置灰会剧透"这里有别的东西"。 */
export function isChoiceVisible(choice: StoryChoice, progress: StoryProgress): boolean {
  return evaluateCondition(choice.visibleWhen, progress.variables, progress.visited, progress.route)
}

/** 过滤出当前可选的选项。 */
export function visibleChoices(node: StoryNode, progress: StoryProgress): StoryChoice[] {
  return node.choices.filter((choice) => isChoiceVisible(choice, progress))
}

/* ------------------------------------------------------------------ *
 * 推进
 * ------------------------------------------------------------------ */

/**
 * 做出一个选择，返回新的进度。
 *
 * **纯函数**：不改传入的 `progress`。宿主用 `setProgress(next)` 落地，
 * 这样 React 的状态更新与场景重构建都能拿到一份干净的前后对照。
 *
 * 返回 `null` 表示这个选项当前不可选（例如条件不满足），调用方应视为无效操作。
 * 之所以不抛异常：选项可能因为变量在两次渲染之间变化而失效，
 * 那是正常竞态，不该让页面崩。
 */
export function choose(graph: StoryGraph, progress: StoryProgress, choice: StoryChoice): StoryProgress | null {
  if (!isChoiceVisible(choice, progress)) return null

  const target = graph.nodes[choice.next]
  if (!target) {
    // 图数据错了（指向不存在的节点）。降级为停在原地，而不是把玩家丢进空白页。
    console.error(`[story] 选项指向不存在的节点：${choice.next}`)
    return null
  }

  // 选项的 effect 与目标节点的 effect 都要应用：
  // 前者是"你选了什么"，后者是"因此发生的不可抗的事"。
  const withChoice = applyDelta(progress.variables, choice.effect)
  const withEntry = applyDelta(withChoice, target.effect)

  return {
    ...progress,
    currentNodeId: target.id,
    variables: withEntry,
    route: choice.route ?? progress.route,
    visited: progress.visited.includes(target.id) ? progress.visited : [...progress.visited, target.id],
  }
}

/** 进入一个节点（开局或载入存档后调用），只应用节点自身的 effect 与访问记录。 */
export function enterNode(graph: StoryGraph, progress: StoryProgress, nodeId: string): StoryProgress {
  const node = graph.nodes[nodeId]
  if (!node) return progress
  return {
    ...progress,
    currentNodeId: nodeId,
    variables: applyDelta(progress.variables, node.effect),
    visited: progress.visited.includes(nodeId) ? progress.visited : [...progress.visited, nodeId],
  }
}

/** 打开一个闸门（走过探索要求的热点或触发区域）。 */
export function openGate(progress: StoryProgress, gateId: string): StoryProgress {
  if (progress.openedGates.includes(gateId)) return progress
  return { ...progress, openedGates: [...progress.openedGates, gateId] }
}

/**
 * 当前节点是否可以推进。
 *
 * 有 `gate` 且尚未打开的节点，玩家要先在场景里走到/找到那个东西。
 * 这是「探索」与「读文本」的接缝——不设闸门的节点进来就能做选择。
 */
export function isGateOpen(node: StoryNode, progress: StoryProgress): boolean {
  if (!node.gate) return true
  return progress.openedGates.includes(node.gate.id)
}

/* ------------------------------------------------------------------ *
 * 结局
 * ------------------------------------------------------------------ */

/**
 * 当前是否已经走到终态。
 *
 * 判定依据是**可选项为空**，而不是"下一个节点不存在"——
 * 终章节点（`choices: []`）与"所有选项条件都不满足"都该收束，
 * 否则玩家会卡在一个没有任何按钮的界面上。
 */
export function isAtEnding(node: StoryNode, progress: StoryProgress): boolean {
  return visibleChoices(node, progress).length === 0
}

/**
 * 解算结局。按 `graph.endings` 的顺序取第一个成立的。
 *
 * 兜底项（`{ kind: 'always' }`）必须在数据里存在，否则这里可能返回 `null`。
 * 返回 `null` 时调用方应退回展示最后一个节点的正文，而不是白屏。
 */
export function resolveEnding(graph: StoryGraph, variables: StoryVariables, visited: string[], route: StoryRoute | null): StoryEnding | null {
  return graph.endings.find((ending) => evaluateCondition(ending.when, variables, visited, route)) ?? null
}

/* ------------------------------------------------------------------ *
 * 调试与校验
 * ------------------------------------------------------------------ */

/**
 * 校验图的完整性。开发期用，也在 `/api/generate-story` 的产物上跑。
 *
 * 检查三件事：
 * 1. 每个 `next` 都指向存在的节点（断链会让玩家卡死）
 * 2. 每个节点都可达（不可达的节点是白写的，也说明图逻辑有误）
 * 3. 存在一个无条件成立的兜底结局（否则变量落到边界外就没有结局）
 *
 * 返回问题列表；空数组表示图是健康的。
 */
export function validateGraph(graph: StoryGraph): string[] {
  const problems: string[] = []

  if (!graph.nodes[graph.start]) problems.push(`入口节点不存在：${graph.start}`)

  for (const [id, node] of Object.entries(graph.nodes)) {
    for (const choice of node.choices) {
      if (!graph.nodes[choice.next]) problems.push(`节点 ${id} 的选项「${choice.label}」指向不存在的节点 ${choice.next}`)
    }
    if (node.gate && !node.gate.id) problems.push(`节点 ${id} 的闸门缺少 id`)
  }

  // 可达性：从入口做一遍广度优先
  const reachable = new Set<string>()
  const queue = [graph.start]
  while (queue.length) {
    const id = queue.shift()!
    if (reachable.has(id)) continue
    reachable.add(id)
    const node = graph.nodes[id]
    if (!node) continue
    for (const choice of node.choices) if (graph.nodes[choice.next]) queue.push(choice.next)
  }
  for (const id of Object.keys(graph.nodes)) {
    if (!reachable.has(id)) problems.push(`节点 ${id} 从入口不可达`)
  }

  if (!graph.endings.length) problems.push('没有任何结局定义')
  else if (!graph.endings.some((ending) => ending.when.kind === 'always')) {
    problems.push('缺少无条件的兜底结局，变量落到边界外时会没有结局可判')
  }

  return problems
}
