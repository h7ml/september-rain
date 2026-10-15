import type { WorldScene } from './types'
import { bleachersScene } from './scenes/bleachers'
import { coffeeShopScene } from './scenes/coffee-shop'
import { fieldRainScene } from './scenes/field-rain'
import { libraryScene } from './scenes/library'
import { classroomScene } from './scenes/classroom'
import { loftScene } from './scenes/loft'
import { loftNightScene } from './scenes/loft-night'
import { ukWindowScene } from './scenes/uk-window'
import { danubeScene } from './scenes/danube'
import { hotpotScene } from './scenes/hotpot'
import { airportScene } from './scenes/airport'
import { cityWallScene } from './scenes/city-wall'
import { stairwellScene } from './scenes/stairwell'

/**
 * 场景注册表：把故事节点的 `sceneId` 映射到可探索空间。
 *
 * ## 为什么要有这一层
 *
 * 故事节点只声明 `sceneId: 'bleachers'` 这样的字符串，不直接 import 场景模块。
 * 两个理由：
 * 1. **故事数据要能被序列化与生成**。AI 生成的剧情会产出新的 `sceneId`，
 *    若节点里塞的是模块引用，那份数据就没法过 JSON。
 * 2. **场景模块带着 three.js**。故事图要在服务端路由（`/api/generate-story`）
 *    与存档校验里被读取，那里不该被动拖进整个 WebGL 依赖树。
 *
 * ## 目前的进度
 *
 * 11 / 13 个场景已实现。还差 `stairwell`（e01 楼梯间）与 `city-wall`（e02 城墙），
 * 它们没有对应的模块，`getScene` 会**降级回落到 `bleachersScene`**。
 *
 * 什么不抛错：玩家可能带着一个指向未实现场景的存档回来，或故事图更新后
 * 新增了一个还没做出来的空间。让他落在操场并继续读故事，
 * 远好过让他看见一片黑屏——而且 `isSceneImplemented` 会让宿主顺手加一行
 * 「这一处还在搭建中」的提示，他就知道眼前的操场是临时的。
 */
const scenes: Record<string, WorldScene> = {
  bleachers: bleachersScene,
  'coffee-shop': coffeeShopScene,
  'field-rain': fieldRainScene,
  library: libraryScene,
  classroom: classroomScene,
  loft: loftScene,
  'loft-night': loftNightScene,
  'uk-window': ukWindowScene,
  danube: danubeScene,
  hotpot: hotpotScene,
  airport: airportScene,
  stairwell: stairwellScene,
  'city-wall': cityWallScene,
}

/** 未实现场景的回落到场。 */
const fallbackScene = bleachersScene

/**
 * 取场景模块。
 *
 * 找不到时回落而不是抛错——玩家的存档可能来自旧版本，或指向一个已重命名的场景。
 */
export function getScene(sceneId: string): WorldScene {
  return scenes[sceneId] ?? fallbackScene
}

/**
 * 该场景是否已经真正实现。
 *
 * 宿主用它给未实现的场景加一行提示，让玩家知道眼前的操场是临时的，
 * 而不是以为游戏坏了。
 */
export function isSceneImplemented(sceneId: string): boolean {
  return sceneId in scenes
}

/** 已实现的场景数量与总数，开发期用来核对进度。 */
export function sceneCoverage(): { implemented: number; total: number } {
  return { implemented: Object.keys(scenes).length, total: 13 }
}

export {
  bleachersScene,
  coffeeShopScene,
  fieldRainScene,
  libraryScene,
  classroomScene,
  loftScene,
  loftNightScene,
  ukWindowScene,
  danubeScene,
  hotpotScene,
  airportScene,
}
