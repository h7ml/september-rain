/**
 * 素材来源与版权声明的唯一出处。
 *
 * 页面展示、剪贴板复制、卡片分享与原文面板都从这里取值，避免各处措辞漂移
 * （此前同一份声明在不同位置分别写成「版权归原作者所有」与「版权归提供者所有」）。
 */

/** 原文存档在仓库中的相对路径，复制出的文本里用它指认来源。 */
export const ORIGINAL_STORY_ARCHIVE = 'public/store.txt'

/** 项目仓库地址。 */
export const PROJECT_REPOSITORY = 'https://github.com/h7ml/september-rain'

/** 线上游戏地址。 */
export const PROJECT_GAME_URL = 'https://september-rain.20apixa.cn'

/**
 * 素材来源声明（纯文本形态）。
 *
 * 用于剪贴板内容、分享文本等无法渲染链接的场景。
 */
export const SOURCE_NOTICE = `素材来源：互联网故事原文（原文存档于 ${ORIGINAL_STORY_ARCHIVE}）。
原文故事版权归原作者所有，本项目仅提供互动编排、阅读体验与个人分享，不对原文主张任何权利。`

/** 项目地址信息（纯文本形态）。 */
export const PROJECT_NOTICE = `项目地址：${PROJECT_REPOSITORY}
游戏地址：${PROJECT_GAME_URL}`

/** 完整声明：素材来源 + 项目地址，供复制与分享使用。 */
export const FULL_NOTICE = `${SOURCE_NOTICE}\n${PROJECT_NOTICE}`
