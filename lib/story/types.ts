/**
 * 叙事图契约：真分支故事的数据结构。
 *
 * ## 为什么要换掉「章节数组」
 *
 * 旧结构是 `Chapter[]`：一维数组，每章的 `choices[].next` 指向下标。
 * 它的致命处不是"只有一条路径"，而是**选项的表达力为零**——
 * 一个选项能携带的全部信息就是"跳到第几章"，
 * 所以无论玩家选什么，世界不会有任何记忆。
 *
 * 这里换成**节点图 + 变量系统**：
 * - 节点是图上的点，选项是带条件的边（`StoryChoice`）。
 * - `StoryVariables` 是唯一的世界记忆，选项改它，门（`StoryCondition`）读它。
 * - 结局不是"最后一个节点"，而是由变量求值决定的一个终态。
 *
 * ## 一条硬规则
 *
 * **叙事层不碰 three.js，渲染层不碰故事。**
 * `lib/story/` 只描述"发生什么"，`lib/world/` 只描述"在哪里"，
 * 两者通过 `sceneId` 与回调相连。混在一起会让每加一个场景都要改故事代码。
 */

/* ------------------------------------------------------------------ *
 * 变量
 * ------------------------------------------------------------------ */

/**
 * 世界记忆。
 *
 * 三个维度刻意只做三条轴，不做一堆 flag：
 * - `closeness` 亲近：你们之间实际发生过的靠近
 * - `regret` 遗憾：错过的、没说出口的、来不及的
 * - `growth` 成长：你是否学会了把自己放回人生中心
 *
 * 原因：结局种类会随时间增长，但"这一段故事是关于什么的"不会变。
 * 用可累加的连续量描述主题，比用几十个布尔 flag 更容易写出自洽的结局判定，
 * 也让"玩家做了什么"与"结局说什么"之间的因果可以被解释。
 *
 * 取值：三个维度都在 `-10 ~ 10`，初始 `0`。
 * 刻意写成长度而不是无界累加：章节变多时不会把早期选择淹没。
 */
export type StoryVariables = {
  closeness: number
  regret: number
  growth: number
}

export const INITIAL_VARIABLES: StoryVariables = { closeness: 0, regret: 0, growth: 0 }

/** 变量的取值上下限。超出会被钳制。 */
export const VARIABLE_BOUNDS = { min: -10, max: 10 } as const

/** 一次选择对变量的影响。省略即不改变该维度。 */
export type VariableDelta = Partial<StoryVariables>

/* ------------------------------------------------------------------ *
 * 条件
 * ------------------------------------------------------------------ */

/**
 * 选项/分支的可见性条件。
 *
 * 刻意做成**可序列化的数据**而不是 `(vars) => boolean` 函数：
 * 函数无法被存进 localStorage、无法被 AI 生成、也无法被校验。
 * 这个项目要支持"AI 生成可玩剧情"与"存档恢复"，
 * 所以条件必须是数据。
 */
export type StoryCondition =
  | { kind: 'always' }
  /** 全部子条件成立 */
  | { kind: 'all'; of: StoryCondition[] }
  /** 任一子条件成立 */
  | { kind: 'any'; of: StoryCondition[] }
  /** 变量达到阈值 */
  | { kind: 'atLeast'; key: keyof StoryVariables; value: number }
  | { kind: 'atMost'; key: keyof StoryVariables; value: number }
  /** 玩家走过某个节点（用于"上次你选了 X"这类回溯表达） */
  | { kind: 'visited'; nodeId: string }
  /** 玩家走过某条路线标记 */
  | { kind: 'hasRoute'; route: string }

/** 路线标记：分叉后玩家所在的大方向，用于结局判定与文案切换。 */
export type StoryRoute = 'approach' | 'hold-back'

/* ------------------------------------------------------------------ *
 * 图
 * ------------------------------------------------------------------ */

/**
 * 一个选择。
 *
 * `next` 是节点 id 而不是数组下标——旧结构用下标，
 * 导致中间插入一章就会让所有存档指向错误的位置。
 */
export type StoryChoice = {
  label: string
  /** 一行小字，暗示这个选项的情绪倾向，但不剧透后果。 */
  note: string
  next: string
  /** 选择后的变量变化。 */
  effect?: VariableDelta
  /** 选择后打上的路线标记，覆盖此前的。 */
  route?: StoryRoute
  /** 不满足时该选项不出现。省略表示总是出现。 */
  visibleWhen?: StoryCondition
}

/** 一个叙事节点：一段可读的文本 + 若干选择。 */
export type StoryNode = {
  id: string
  /** 章节序号，显示用的「01 / 九月」。 */
  year: string
  title: string
  /** 世界里的地点名，同时用于选择场景模块。 */
  location: string
  /** 对应的可探索空间 id。决定玩家进入哪个 `WorldScene`。 */
  sceneId: string
  /** 正文。 */
  text: string
  /** 场景里的一句引言。 */
  quote: string
  /** 玩家出生点。缺省由场景模块决定。 */
  spawn?: Partial<{ x: number; z: number; yaw: number; pitch: number }>
  /**
   * 进入本节点时就生效的变量变化。
   * 用于表达"不管你选什么，这段时间都会过去"这类不可抗的推移。
   */
  effect?: VariableDelta
  /** 本节点的选择。空数组表示这是终态。 */
  choices: StoryChoice[]
  /**
   * 是否需要先找到场景里的某个东西才能推进。
   *
   * 这是「探索」与「读文本」的接缝：留空表示进场景后直接给选择，
   * 填了则必须走到对应热点/触发器才出现选择。
   */
  gate?: { kind: 'hotspot' | 'trigger'; id: string; hint: string }
}

/** 一条完整的故事线。 */
export type StoryGraph = {
  /** 图的稳定标识，用于存档校验。 */
  id: string
  title: string
  /** 入口节点 id */
  start: string
  nodes: Record<string, StoryNode>
  /** 终态判定：按顺序求值，第一个成立的就是结局。最后一项通常是无条件的兜底。 */
  endings: StoryEnding[]
}

/** 一个结局。 */
export type StoryEnding = {
  id: string
  /** 结局标题，进"结局图鉴"。 */
  title: string
  /** 何时进入这个结局。 */
  when: StoryCondition
  /** 结局正文。 */
  text: string
  quote: string
  /** 结局基调，决定画面配色与图标。 */
  tone: 'warm' | 'bittersweet' | 'quiet'
}
