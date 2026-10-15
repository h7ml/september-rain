import type { Metadata } from 'next'
import WorldCanvas from '@/components/world/world-canvas'

/**
 * 游戏入口。
 *
 * 这里**只是**一层服务端外壳：真正的游戏状态（存档、章节、交互）
 * 全在 `WorldCanvas` 里，那是一个客户端组件。
 *
 * 之所以保留这一层而不是把 `'use client'` 直接写进页面：
 * 页面需要导出 `metadata`（SEO、OG 卡片），而那是服务端能力。
 * 拆成两层之后，首屏的 HTML 里就带着完整的标题与描述，
 * 爬到的是一个有内容的页面，而不是一个空壳加一段 JS。
 */

export const metadata: Metadata = {
  title: '蒹葭｜一段关于等待的互动故事',
  description:
    '走进西安九月的雨里。第一人称探索、分支叙事，在操场、书店、多瑙河与城墙之间做出你的选择，走完一段关于相遇、等待与告别的故事。',
}

export default function Page() {
  return <WorldCanvas />
}
