'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, BookOpen, CloudRain, History, Info, List, Loader2, Plus, RotateCcw, Volume2, VolumeX, X } from 'lucide-react'

const defaultChapters = [
  { year: '01 / 九月', title: '看台上的白裙子', location: '西安 · 军训操场', text: '口号声震天响。我的余光扫到看台最高一级台阶上，那里坐着一个穿白裙子的女孩。整个班都在跟着我动，只有她一个人坐在那里哭。', quote: '所谓伊人，在水一方。', choices: [{ label: '继续领操', note: '有些人，第一次见面就隔着很远。', next: 1 }, { label: '记住她', note: '你不知道，这个念头会持续六年。', next: 1 }] },
  { year: '02 / 雨天', title: '她只回了一个字', location: '城南 · 书店旁的咖啡店', text: '雨把玻璃窗打得模糊。我删删改改，发出一条朋友圈：明天有人一起去逛书店吗？我请咖啡。下面几十个点赞，只有她回了一个字。', quote: '我。', choices: [{ label: '去食堂找她', note: '雨里，我们绕着操场走了一圈，又一圈。', next: 2 }, { label: '等她来找你', note: '有些相遇，不能只等对方迈出第一步。', next: 2 }] },
  { year: '03 / 初冬', title: '一把伞的距离', location: '校园 · 银杏路', text: '风把最后几片银杏叶吹到伞面。她把伞往你这边偏了偏，自己的肩膀却湿了一小块。你们没有说喜欢，只讨论明天的天气。', quote: '沉默是今晚的康桥。', choices: [{ label: '把伞递回去', note: '有些温柔，不必急着命名。', next: 3 }, { label: '陪她走慢一点', note: '那段路后来很短，记忆却很长。', next: 4 }] },
  { year: '04 / 放学后', title: '空教室里的纸飞机', location: '校园 · 六号教学楼', text: '她在黑板角落写下一道没有答案的题。你折了一架纸飞机，把答案写在机翼上。它飞过两排课桌，落在她的书里。', quote: '少年心事当拏云。', choices: [{ label: '留下等她', note: '有些答案，不是当场说出口才算数。', next: 5 }, { label: '先走到楼下', note: '你们隔着一层楼梯，却共享了一整个黄昏。', next: 5 }] },
  { year: '04 / 雪夜', title: '末班公交的暖光', location: '城墙 · 南门公交站', text: '雪下得很轻，末班车迟迟不来。她把耳机分给你一半，歌里唱着“明天见”，你们却谁也没有约明天。', quote: '愿有人陪你颠沛流离。', choices: [{ label: '把围巾给她', note: '你们都装作只是怕她着凉。', next: 5 }, { label: '陪她等到车来', note: '暖光亮起时，离别也有了温度。', next: 5 }] },
  { year: '05 / 夏天', title: '海边寄来的明信片', location: '青岛 · 栈桥尽头', text: '毕业后的第一个夏天，她寄来一张没有署名的明信片。背面只有海浪、日期，和一句：这里的风很大，你会喜欢。', quote: '面朝大海，春暖花开。', choices: [{ label: '认真写一封回信', note: '有些话写下来，才知道自己有多舍不得。', next: 6 }, { label: '坐火车去见她', note: '有时勇敢不是改变结局，而是让当下不留空白。', next: 7 }] },
  { year: '06 / 远方', title: '旧书店的最后一盏灯', location: '青岛 · 海风里的书店', text: '你真的去了那家书店。她指着一本你们曾争论过的诗集，说：“原来你还记得。”门外海浪一遍遍替你们回答。', quote: '我们在高处相见。', choices: [{ label: '把书送给她', note: '故事有了书签，却仍没有句号。', next: 9 }, { label: '只拍一张海的照片', note: '有些同行，短到只够留下一张照片。', next: 9 }] },
  { year: '06 / 异乡', title: '八个小时的时差', location: '英国 · 凌晨的窗边', text: '视频从每天一次变成三天一次，变成一周一次。我睡醒的时候她也该洗洗睡了。有一次凌晨醒来，她告诉我，那个书店关门了。', quote: '等我回来，继续给你讲。', choices: [{ label: '订回国的机票', note: '多瑙河的夕阳很美，美得让人难过。', next: 9 }, { label: '再等一等', note: '有些告别，只是被推迟，并没有消失。', next: 9 }] },
  { year: '07 / 清晨', title: '没有寄出的信', location: '西安 · 城墙根下的邮筒', text: '你写了三页信，讲海风、讲工作，也讲你终于学会一个人吃晚饭。写到最后，却没有写她的名字。', quote: '纸短情长。', choices: [{ label: '投进邮筒', note: '有些话抵达与否，都完成了它的意义。', next: 10 }, { label: '折好收起来', note: '没有寄出的信，也曾认真保护过一段心事。', next: 10 }] },
  { year: '07 / 秋天', title: '朋友婚礼上的空位', location: '西安 · 南郊礼堂', text: '共同的朋友结婚，桌上留了一个空位。你听见有人提起她，语气像翻过一页旧日历，轻轻的，却让整个下午都慢了下来。', quote: '人生若只如初见。', choices: [{ label: '问起她近况', note: '想念并不丢脸，它只是说明你曾真诚。', next: 11 }, { label: '不再追问', note: '有些祝福，远远放在心里也足够。', next: 11 }] },
  { year: '07 / 深夜', title: '陌生号码的来电', location: '出租屋 · 凌晨一点', text: '手机亮了一下，是一串没有备注的号码。你没有接，铃声停下后，窗外刚好有一辆车驶过，像某个迟到的回答。', quote: '相见不如怀念。', choices: [{ label: '回拨过去', note: '勇敢不是一定要重逢，是允许自己确认答案。', next: 12 }, { label: '把手机放回桌面', note: '你开始把安静也当成一种选择。', next: 12 }] },
  { year: '08 / 春天', title: '那场迟到的电影', location: '城南 · 旧电影院', text: '你独自看完了曾经约好的电影。片尾字幕升起时，你忽然发现，自己已经不再期待身边的座位被谁坐下。', quote: '一切有为法，如梦幻泡影。', choices: [{ label: '买两杯汽水', note: '有些习惯会留下，但它们不再让你疼。', next: 13 }, { label: '直接回家', note: '告别不是盛大的仪式，也可以只是关灯。', next: 13 }] },
  { year: '08 / 午后', title: '雨停之后的长椅', location: '兴庆宫 · 湖边长椅', text: '雨停了，长椅还湿着。你把伞收好，第一次认真看清湖面上的光，发现它一直都在，只是过去的你总低着头。', quote: '山高水长，来日方长。', choices: [{ label: '坐下来晒太阳', note: '你终于把时间还给自己。', next: 14 }, { label: '沿湖走一圈', note: '往前走不代表忘记，而是带着记忆继续生活。', next: 14 }] },
  { year: '09 / 新年', title: '给未来的明信片', location: '西安 · 火车站候车厅', text: '你在候车厅写下一张明信片，收件人是明年此刻的自己：愿你遇见一个愿意好好说话的人，也愿你先成为这样的人。', quote: '且将新火试新茶。', choices: [{ label: '寄给自己', note: '把祝愿交给时间，也把方向交回自己。', next: 15 }, { label: '夹进旧书里', note: '有些愿望不必公开，它会在心里慢慢发芽。', next: 15 }] },
  { year: '10 / 晚风', title: '有人替你撑伞', location: '西安 · 雨后的街口', text: '你在街口等红灯，一个陌生人把伞往你这边递了递。你说谢谢，对方笑了笑。世界没有因此变得戏剧化，却忽然柔软了一点。', quote: '陌上花开，可缓缓归矣。', choices: [{ label: '和她并肩走一段', note: '新的相遇不必复制旧的故事。', next: 16 }, { label: '道谢后独自离开', note: '独自前��也很好，你已经学会照顾自己。', next: 16 }] },
  { year: '10 / 晴日', title: '把遗憾种进花盆', location: '家中 · 阳台', text: '你把那张旧明信片压在花盆底下，种下一株小小的栀子。浇水时你想起她，却不再问“如果当时”。', quote: '花会沿路盛开。', choices: [{ label: '给它取一个名字', note: '记忆被重新命名，就不再只是失去。', next: 17 }, { label: '静静看它发芽', note: '有些答案不需要说出口，生活会替你完成。', next: 17 }] },
  { year: '11 / 冬日', title: '终于学会说再见', location: '西安 · 城墙上的风', text: '你回到故事开始的地方。风还是很大，白裙子的女孩已经走远，而你终于可以对那段青春说：谢谢你来过。', quote: '此心安处是吾乡。', choices: [{ label: '转身回家', note: '不是所有故事都要重来，完整也可以是一种结局。', next: 18 }, { label: '再看一眼远方', note: '你保留了温柔，也放下了追问。', next: 18 }] },
  { year: '12 / 新章', title: '下一场雨', location: '西安 · 清晨的街道', text: '雨又落下来。你撑开伞，给自己留出一小块干燥的天空。前面还有许多没有写下的章节，而这一次，你愿意慢慢走。', quote: '愿你出走半生，归来仍是少年。', choices: [{ label: '走向有光的地方', note: '你带着全部经历，继续成为更完整的自己。', next: 19 }, { label: '停下来听雨', note: '不急着抵达，也是一种温柔的勇敢。', next: 19 }] },
  { year: '13 / 尾声', title: '她先等到了', location: '西安 · 某个毫无征兆的傍晚', text: '你等过她，她也等过你。你等着回去，她等着习惯没有你。只是偶尔，你还是会想起那个雨天，想起她只回了一个字。', quote: '原来，那是倒计时。', choices: [] },
]

type Chapter = (typeof defaultChapters)[number]
type SavedGame = { chapter: number; started: boolean; chapters: Chapter[]; title: string }

export default function Page() {
  const [chapters, setChapters] = useState<Chapter[]>(defaultChapters)
  const [chapter, setChapter] = useState(0)
  const [started, setStarted] = useState(false)
  const [sound, setSound] = useState(false)
  const [showGenerator, setShowGenerator] = useState(false)
  const [showInstructions, setShowInstructions] = useState(false)
  const [showLevels, setShowLevels] = useState(false)
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
      if (saved) {
        const game = JSON.parse(saved) as SavedGame
        const hasExpandedStory = game.chapters.length >= defaultChapters.length
        setChapter(Math.min(game.chapter, (hasExpandedStory ? game.chapters : defaultChapters).length - 1))
        setStarted(game.started)
        setChapters(hasExpandedStory ? game.chapters : defaultChapters)
        setMessage(hasExpandedStory ? '已恢复上次的阅读进度' : '故事已扩展，已为你保留当前阅读位置')
      }
    } catch { setMessage('保存进度读取失败') }
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    const game: SavedGame = { chapter, started, chapters, title: chapters[0]?.title ?? '蒹葭' }
    localStorage.setItem('jianjia-saved-game', JSON.stringify(game))
  }, [chapter, started, chapters, hydrated])

  const choose = (next: number) => { setStarted(true); setChapter(next); setMessage('进度已自动保存') }
  const jumpToLevel = (next: number) => { setChapter(next); setStarted(next > 0); setShowLevels(false); setMessage(`已进入第 ${String(next + 1).padStart(2, '0')} 章`) }
  const restart = () => { setChapter(0); setStarted(false); setMessage('已重新开始，原进度仍会被新的选择覆盖') }
  const generateStory = async (event: React.FormEvent) => {
    event.preventDefault(); setLoading(true); setMessage('正在写下新的故事……')
    try { const response = await fetch('/api/generate-story', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ theme, characters }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); setChapters(data.chapters); setChapter(0); setStarted(false); setShowGenerator(false); setMessage(`《${data.title}》已经准备好了`); setTheme(''); setCharacters('') } catch (error) { setMessage(error instanceof Error ? error.message : '生成失败，请稍后再试') } finally { setLoading(false) }
  }

  return <main className="story-shell"><div className="rain-layer" aria-hidden="true">{rainDrops.map((drop) => <i key={drop} style={{ left: `${(drop * 29) % 101}%`, animationDelay: `${(drop % 9) * -0.7}s`, animationDuration: `${1.3 + (drop % 5) * 0.25}s` }} />)}</div>
    <header className="topbar"><div className="brand"><span className="brand-mark"><CloudRain /></span><span>蒹葭</span><em>INTERACTIVE STORY</em></div><div className="top-actions"><button className="utility-button" onClick={() => setShowInstructions(true)}><Info /> 游戏说明</button><button className="utility-button" onClick={() => setShowLevels(true)}><List /> 选关</button><button className="generator-trigger" onClick={() => setShowGenerator(true)}><Plus /> 新故事</button><button className="icon-button" onClick={() => setSound(!sound)} aria-label={sound ? '关闭声音' : '打开声音'}>{sound ? <Volume2 /> : <VolumeX />}</button><span className="chapter-count">{String(chapter + 1).padStart(2, '0')} / {String(chapters.length).padStart(2, '0')}</span></div></header>
    {message && <div className="save-note" role="status"><History /> {message}</div>}
    <section className={`story-card ${started ? 'is-started' : ''}`}><div className="story-meta"><span>{current.year}</span><span className="meta-line" /><span>{current.location}</span></div><div className="story-body"><p className="eyebrow">A STORY ABOUT WAITING</p><h1>{current.title}</h1><p className="story-text">{current.text}</p><blockquote>“{current.quote}”</blockquote>{current.choices.length > 0 ? <div className="choices" aria-label="选择你的回应">{current.choices.map((choice) => <button className="choice-button" key={choice.label} onClick={() => choose(choice.next)}><span><strong>{choice.label}</strong><small>{choice.note}</small></span><ArrowRight /></button>)}</div> : <div className="ending-actions"><p className="ending-lead">有些故事的结局不会改变，但你走过的每一条路，都让它拥有了不同的光。</p><p>谢谢你认真读到这里。愿下一场雨落下时，你已经学会把遗憾放在心里柔软的地方，也愿你在新的故事里，先好好照顾自己。</p><button className="restart-button" onClick={restart}><RotateCcw /> 再听一遍</button></div>}</div><div className="story-footer"><BookOpen /><span>选择会改变你记住这段故事的方式</span><div className="progress-track"><div style={{ width: `${Math.max(progress, 8)}%` }} /></div></div></section>
    <footer className="page-footer"><span>西安 · 九月 · 雨</span><span>scroll to remember</span></footer>
    {showInstructions && <div className="generator-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowInstructions(false) }}><section className="info-panel" role="dialog" aria-modal="true" aria-labelledby="instructions-title"><button className="close-generator" onClick={() => setShowInstructions(false)} aria-label="关闭"><X /></button><p className="eyebrow">HOW TO PLAY</p><h2 id="instructions-title">把遗憾走成自己的故事</h2><p>每一章都会给你两个选择。没有错误答案，选择会改变你记住这段经历的方式。</p><div className="instruction-grid"><div><strong>阅读</strong><span>跟随时间与地点，慢慢读完每个片段。</span></div><div><strong>选择</strong><span>点击回应，进入下一章并留下你的脚印。</span></div><div><strong>继续</strong><span>进度会自动保存，关闭页面后可从上次继续。</span></div></div><p className="info-quote">结局也许相同，但你走过的路，永远只属于你。</p></section></div>}
    {showLevels && <div className="generator-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowLevels(false) }}><section className="info-panel level-panel" role="dialog" aria-modal="true" aria-labelledby="levels-title"><button className="close-generator" onClick={() => setShowLevels(false)} aria-label="关闭"><X /></button><p className="eyebrow">CHAPTER SELECT</p><h2 id="levels-title">选择关卡</h2><p>回到任何已读章节，重新感受那一刻的风。</p><div className="level-list">{chapters.map((level, index) => <button key={`${level.title}-${index}`} className={index === chapter ? 'level-button active' : 'level-button'} onClick={() => jumpToLevel(index)}><span><strong>{String(index + 1).padStart(2, '0')}</strong><span><b>{level.title}</b><small>{level.location}</small></span></span><ArrowRight /></button>)}</div></section></div>}
    {showGenerator && <div className="generator-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowGenerator(false) }}><section className="generator-panel" role="dialog" aria-modal="true" aria-labelledby="generator-title"><button className="close-generator" onClick={() => setShowGenerator(false)} aria-label="关闭"><X /></button><p className="eyebrow">CREATE YOUR STORY</p><h2 id="generator-title">写一个新的雨天</h2><p>输入主题与角色，让 AI 为你生成一段可以亲自选择的故事。</p><form onSubmit={generateStory}><label>故事主题<input value={theme} onChange={(event) => setTheme(event.target.value)} placeholder="例如：海边灯塔的最后一夜" required /></label><label>角色设定<textarea value={characters} onChange={(event) => setCharacters(event.target.value)} placeholder="例如：沉默的灯塔管理员，与一位来寻找父亲的女孩" required rows={4} /></label><button className="generate-button" disabled={loading}>{loading ? <Loader2 className="spin" /> : <CloudRain />} {loading ? '正在生成…' : '生成可玩的故事'}</button></form></section></div>}
  </main>
}
