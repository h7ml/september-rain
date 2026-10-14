import { generateText, gateway } from 'ai'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { theme, characters } = await request.json()

    if (typeof theme !== 'string' || theme.trim().length < 2 || typeof characters !== 'string' || characters.trim().length < 2) {
      return NextResponse.json({ error: '请填写故事主题和角色设定。' }, { status: 400 })
    }

    const result = await generateText({
      model: gateway('openai/o4-mini'),
      system: '你是互动小说编剧。只返回严格 JSON，不要 Markdown。JSON 格式为 {"title": string, "setting": string, "chapters": [{"year": string, "title": string, "location": string, "text": string, "quote": string, "choices": [{"label": string, "note": string, "next": number}]}]}。生成 4 个章节加 1 个尾声，next 必须指向下一个章节索引，尾声 choices 为空。文字优美克制，适合中文互动故事，每章 80-120 字。',
      prompt: `故事主题：${theme.trim()}\n角色设定：${characters.trim()}\n请生成完整可游玩的分支剧情。`,
    })

    const normalizedText = result.text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
    const jsonStart = normalizedText.indexOf('{')
    const jsonEnd = normalizedText.lastIndexOf('}')
    const story = JSON.parse(normalizedText.slice(jsonStart, jsonEnd + 1))
    return NextResponse.json(story)
  } catch (error) {
    const message = error instanceof Error && error.message.includes('credit card')
      ? 'AI Gateway 需要先完成计费验证，请在 Vercel AI 设置中添加有效信用卡后重试。'
      : '剧情生成失败，请稍后再试。'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
