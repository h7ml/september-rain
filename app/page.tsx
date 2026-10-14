'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, BookOpen, CloudRain, History, Loader2, Plus, RotateCcw, Volume2, VolumeX, X } from 'lucide-react'

const defaultChapters = [
  { year: '01 / 九月', title: '看台上的白裙子', location: '西安 · 军训操场', text: '口号声震天响。我的余光扫到看台最高一级台阶上，那里坐着一个穿白裙子的女孩。整个班都在跟着我动，只有她一个人坐在那里哭。', quote: '所谓伊人，在水一方。', choices: [{ label: '继续领操', note: '有些人，第一次见面就隔着很远。', next: 1 }, { label: '记住她', note: '你不知道，这个念头会持续六年。', next: 1 }] },
  { year: '02 / 雨天', title: '她只回了一个字', location: '城南 · 书店旁的咖啡店', text: '雨把玻璃窗打得模糊。我删删改改，发出一条朋友圈：明天有人一起去逛书店吗？我请咖啡。下面几十个点赞，只有她回了一个字。', quote: '我。', choices: [{ label: '去食堂找她', note: '雨里，我们绕着操场走了一圈，又一圈。', next: 2 }, { label: '等她来找你', note: '有些相遇，不能只等对方迈出第一步。', next: 2 }] },
  { year: '03 / 六年', title: '把故事讲给她听', location: '校园 · 看台与图书馆窗边', text: '她不爱说话，于是我给她讲故事。马尔克斯、聂鲁达、博尔赫斯。她说她记不住，我说没关系，你听着就行。', quote: '我喜欢你是寂静的，仿佛你消失了一样。', choices: [{ label: '讲下一个故事', note: '故事讲得越多，越像是在讲我们自己。', next: 3 }, { label: '问她在想什么', note: '她弯了一下嘴角，但没有回答。', next: 3 }] },
  { year: '04 / 异乡', title: '八个小时的时差', location: '英国 · 凌晨的窗边', text: '视频从每天一次变成三天一次，变成一周一次。我睡醒的时候她也该洗洗睡了。有一次凌晨醒来，她告诉我，那个书店关门了。', quote: '等我回来，继续给你讲。', choices: [{ label: '订回国的机票', note: '多瑙河的夕阳很美，美得让人难过。', next: 4 }, { label: '再等一等', note: '有些告别，只是被推迟，并没有消失。', next: 4 }] },
  { year: '05 / 后来', title: '倒计时', location: '咸阳机场 · 行李转盘旁', text: '电话响了很多声。没人接。微信弹出来一条消息：你自己打个车吧。没有对不起，没有路上堵了，就六个字。', quote: '爱那么短，遗忘那么长。', choices: [{ label: '站在原地', note: '你站在那堆行李旁边，站了很久。', next: 5 }, { label: '自己打车回去', note: '有些故事结束时，连一句再见都没有。', next: 5 }] },
  { year: '尾声', title: '她先等到了', location: '西安 · 某个毫无征兆的傍晚', text: '你等过她，她也等过你。你等着回去，她等着习惯没有你。只是偶尔，你还是会想起那个雨天，想起她只回了一个字。', quote: '原来，那是倒计时。', choices: [] },
]

type Chapter = (typeof defaultChapters)[number]
type SavedGame = { chapter: number; started: boolean; chapters: Chapter[]; title: string }

export default function Page() {
  const [chapters, setChapters] = useState<Chapter[]>(defaultChapters)
  const [chapter, setChapter] = useState(0)
  const [started, setStarted] = useState(false)
  const [sound, setSound] = useState(false)
  const [showGenerator, setShowGenerator] = useState(false)
  const [theme, setTheme] = useState('')
  const [characters, setCharacters] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [hydrated, setHydrated] = useState(false)
  const current = chapters[chapter] ?? chapters[0]
  const progress = Math.round((chapter / (chapters.length - 1)) * 100)
  const rainDrops = useMemo(() => Array.from({ length: 42 }, (_, index) => index), [])

  useEffect(() => {
    try {
      const saved = localStorage.getItem('jianjia-saved-game')
      if (saved) { const game = JSON.parse(saved) as SavedGame; setChapter(game.chapter); setStarted(game.started); setChapters(game.chapters); setMessage('已恢复上次的阅读进度') }
    } catch { setMessage('保存进度读取失败') }
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    const game: SavedGame = { chapter, started, chapters, title: chapters[0]?.title ?? '蒹葭' }
    localStorage.setItem('jianjia-saved-game', JSON.stringify(game))
  }, [chapter, started, chapters, hydrated])

  const choose = (next: number) => { setStarted(true); setChapter(next); setMessage('进度已自动保存') }
  const restart = () => { setChapter(0); setStarted(false); setMessage('已重新开始，原进度仍会被新的选择覆盖') }
  const generateStory = async (event: React.FormEvent) => {
    event.preventDefault(); setLoading(true); setMessage('正在写下新的故事……')
    try { const response = await fetch('/api/generate-story', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ theme, characters }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); setChapters(data.chapters); setChapter(0); setStarted(false); setShowGenerator(false); setMessage(`《${data.title}》已经准备好了`); setTheme(''); setCharacters('') } catch (error) { setMessage(error instanceof Error ? error.message : '生成失败，请稍后再试') } finally { setLoading(false) }
  }

  return <main className="story-shell"><div className="rain-layer" aria-hidden="true">{rainDrops.map((drop) => <i key={drop} style={{ left: `${(drop * 29) % 101}%`, animationDelay: `${(drop % 9) * -0.7}s`, animationDuration: `${1.3 + (drop % 5) * 0.25}s` }} />)}</div>
    <header className="topbar"><div className="brand"><span className="brand-mark"><CloudRain /></span><span>蒹葭</span><em>INTERACTIVE STORY</em></div><div className="top-actions"><button className="generator-trigger" onClick={() => setShowGenerator(true)}><Plus /> 新故事</button><button className="icon-button" onClick={() => setSound(!sound)} aria-label={sound ? '关闭声音' : '打开声音'}>{sound ? <Volume2 /> : <VolumeX />}</button><span className="chapter-count">{String(chapter + 1).padStart(2, '0')} / {String(chapters.length).padStart(2, '0')}</span></div></header>
    {message && <div className="save-note" role="status"><History /> {message}</div>}
    <section className={`story-card ${started ? 'is-started' : ''}`}><div className="story-meta"><span>{current.year}</span><span className="meta-line" /><span>{current.location}</span></div><div className="story-body"><p className="eyebrow">A STORY ABOUT WAITING</p><h1>{current.title}</h1><p className="story-text">{current.text}</p><blockquote>“{current.quote}”</blockquote>{current.choices.length > 0 ? <div className="choices" aria-label="选择你的回应">{current.choices.map((choice) => <button className="choice-button" key={choice.label} onClick={() => choose(choice.next)}><span><strong>{choice.label}</strong><small>{choice.note}</small></span><ArrowRight /></button>)}</div> : <div className="ending-actions"><p>故事没有真正的结局，只有某些傍晚，会把你带回雨里。</p><button className="restart-button" onClick={restart}><RotateCcw /> 再听一遍</button></div>}</div><div className="story-footer"><BookOpen /><span>选择会改变你记住这段故事的方式</span><div className="progress-track"><div style={{ width: `${Math.max(progress, 8)}%` }} /></div></div></section>
    <footer className="page-footer"><span>西安 · 九月 · 雨</span><span>scroll to remember</span></footer>
    {showGenerator && <div className="generator-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowGenerator(false) }}><section className="generator-panel" role="dialog" aria-modal="true" aria-labelledby="generator-title"><button className="close-generator" onClick={() => setShowGenerator(false)} aria-label="关闭"><X /></button><p className="eyebrow">CREATE YOUR STORY</p><h2 id="generator-title">写一个新的雨天</h2><p>输入主题与角色，让 AI 为你生成一段可以亲自选择的故事。</p><form onSubmit={generateStory}><label>故事主题<input value={theme} onChange={(event) => setTheme(event.target.value)} placeholder="例如：海边灯塔的最后一夜" required /></label><label>角色设定<textarea value={characters} onChange={(event) => setCharacters(event.target.value)} placeholder="例如：沉默的灯塔管理员，与一位来寻找父亲的女孩" required rows={4} /></label><button className="generate-button" disabled={loading}>{loading ? <Loader2 className="spin" /> : <CloudRain />} {loading ? '正在生成…' : '生成可玩的故事'}</button></form></section></div>}
  </main>
}
