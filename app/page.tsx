'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, BookOpen, Check, CloudRain, Download, Heart, History, Info, List, Loader2, Map, Plus, RotateCcw, Share2, Volume2, VolumeX, X } from 'lucide-react'
import SceneCanvas from '@/components/scene/scene-canvas'
import { FULL_NOTICE, ORIGINAL_STORY_ARCHIVE, PROJECT_GAME_URL, PROJECT_REPOSITORY, SOURCE_NOTICE } from '@/lib/source-notice'

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
  { year: '10 / 晚风', title: '有人替你撑伞', location: '西安 · 雨后的街口', text: '你在街口等红灯，一个陌生人把伞往你这边递了递。你说谢谢，对方笑了笑。世界没有因此变得戏剧化，却忽然柔软了一点。', quote: '陌上花开，可缓缓归矣。', choices: [{ label: '和她并��走一��', note: '���的相遇不必复制旧的故事。', next: 16 }, { label: '道谢后独自离开', note: '独自前行也很好，你已经学会照顾自己。', next: 16 }] },
  { year: '10 / 晴日', title: '把遗憾种进花盆', location: '家中 · 阳台', text: '你把那张旧明信片压在花盆底下，种下一株小小的栀子。浇水时你想起她，却不再问“如果当时”。', quote: '花会沿路盛开。', choices: [{ label: '给它取一个名字', note: '记忆被重新命名，就不再只是失去。', next: 17 }, { label: '静静看它发芽', note: '有些答案不需要说出口，生活会替你完成。', next: 17 }] },
  { year: '11 / 冬日', title: '终于学会说再见', location: '西安 · 城墙上的风', text: '你回到故事开始的地方。风还是很大，白裙子的女孩已经走远，而你终于可以对那段青春说：谢谢你来过。', quote: '此心安处是吾乡。', choices: [{ label: '转身回家', note: '不是所有故事都要重来，完整也可以是一种结局。', next: 18 }, { label: '再看一眼远方', note: '你保留了温柔，也放下了追问。', next: 18 }] },
  { year: '12 / 新章', title: '下一场雨', location: '西安 · 清晨的街道', text: '雨又落下来。你撑开伞，给自己留出一小块干燥的天空。前面还有许多没有写下的章节，而这一次，你愿意慢慢走。', quote: '愿你出走半生，归来仍是少年。', choices: [{ label: '走向有光的地方', note: '你带着全部经历，继续成为更完整的自己。', next: 19 }, { label: '停下来听雨', note: '不急着抵达，也是一种温柔的勇敢。', next: 19 }] },
  { year: '13 / 尾声', title: '她先等到了', location: '西安 · 某个毫无征兆的傍晚', text: '你等过她，她也等过你。你等着回去，她等着习惯没有你。只是偶尔，你还是会想起那个雨天，想起她只回了一个字。', quote: '原来，那是倒计时。', choices: [] },
]

type Chapter = (typeof defaultChapters)[number]
type SavedGame = { chapter: number; started: boolean; chapters: Chapter[]; title: string; favorites?: number[] }
type StoryArchive = { id: string; title: string; chapter: number; chapterTitle: string; savedAt: string; chapters: Chapter[] }

export default function Page() {
  const [chapters, setChapters] = useState<Chapter[]>(defaultChapters)
  const [chapter, setChapter] = useState(0)
  const [started, setStarted] = useState(false)
  const [sound, setSound] = useState(false)
  const [showGenerator, setShowGenerator] = useState(false)
  const [showInstructions, setShowInstructions] = useState(false)
  const [showLevels, setShowLevels] = useState(false)
  const [showMap, setShowMap] = useState(false)
  const [theme, setTheme] = useState('')
  const [characters, setCharacters] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [hydrated, setHydrated] = useState(false)
  const [favorites, setFavorites] = useState<number[]>([])
  const [archives, setArchives] = useState<StoryArchive[]>([])
  const [showArchives, setShowArchives] = useState(false)
  const [showOriginal, setShowOriginal] = useState(false)
  const [shared, setShared] = useState(false)
  const [cardCopied, setCardCopied] = useState(false)
  /** 选项按钮悬停：驱动 3D 场景的「呼吸」反馈 */
  const [choiceHovered, setChoiceHovered] = useState(false)
  /** 每次做出选择递增，作为触发场景闪光的一次性信号 */
  const [flashToken, setFlashToken] = useState(0)
  /**
   * 记录每一章选中的候选序号，用来推导整体「暖度」。
   * 同一章重选会覆盖旧值，所以颜色始终反映当前这条路径，
   * 而不是历史点击的累加。
   */
  const [choiceIndexes, setChoiceIndexes] = useState<Record<number, number>>({})
  const current = chapters[chapter] ?? chapters[0]
  const originalStory = `西安的九月，总是阴的。法桐叶子还没黄透，雨说来就来。

那年我大一刚刚入学，军训还没结束。我是领操的，站在全班最前面，带着整班的人做动作。我的余光扫到看台最高一级台阶上坐着一个人。她没穿迷彩，穿一条白裙子，头发很长。整个班都在跟着我动，只有她一个人坐在那里哭。

后来我们在雨里绕着操场走了一圈，又一圈。她只回了一个字：“我。”后来我给她讲了六年故事，讲等待、爱情与远方。我们曾经以为会等到那句“一生一世”，最后却在一个炎热的夏天分开。

她先等到了。爱那么短，遗忘那么长。只是偶尔，在某个毫无征兆的傍晚，我还是会想起那个雨天，想起她只回了一个字：“我。”

${FULL_NOTICE}
此处保留原文核心叙事，供阅读与个人分享。`
  const getSceneClass = (scene: Chapter) => scene.title.includes('雨') || scene.location.includes('雨') ? 'scene-rain' : scene.title.includes('雪') ? 'scene-snow' : scene.title.includes('海') || scene.location.includes('海') ? 'scene-sea' : scene.title.includes('夜') || scene.location.includes('深夜') ? 'scene-night' : scene.title.includes('春') || scene.title.includes('花') ? 'scene-spring' : 'scene-memory'
  const isRomanceScene = current?.title === '一把伞的距离' || current?.title === '空教室里的纸飞机'
  const romanceScene = current?.title === '一把伞的距离'
    ? '她没有立刻接伞，只是抬眼看你。雨声把周围的世界推远了，你们靠得很近，近到能听见彼此不太平稳的呼吸。你轻声问她可不可以，她点了点头。这个吻很短，像一句终于说出口的“我在这里”。'
    : '纸飞机落进她的书里，她没有翻开，只把书合上，向你走近了一步。你们聊了很久，从一场电影聊到各自害怕的未来。分别前，她轻轻吻了吻你的额头，笑着说：“明天见。”'
  const isEnding = chapter >= chapters.length - 1 || current.choices.length === 0
  const sceneClass = getSceneClass(current)
  const progress = Math.round((chapter / Math.max(chapters.length - 1, 1)) * 100)
  const rainDrops = useMemo(() => Array.from({ length: 42 }, (_, index) => index), [])

  /**
   * 场景暖度：由已做出的选择推导，取值 [-1, 1]。
   *
   * 每个选项按它在当章中的相对位置计分——排在前面的选项偏向克制与等候，
   * 排在后面的偏向主动与靠近，所以首选项偏冷、末选项偏暖。
   * 取平均而非累加，避免章节越多偏移越极端。
   */
  const sceneWarmth = useMemo(() => {
    const scores = Object.entries(choiceIndexes)
      .map(([chapterKey, index]) => {
        const level = chapters[Number(chapterKey)]
        const total = level?.choices.length ?? 0
        if (total < 2) return null
        // 单选项章节不产生倾向，跳过以免把平均值拉向 0
        return (index / (total - 1)) * 2 - 1
      })
      .filter((score): score is number => score !== null)

    if (!scores.length) return 0
    const average = scores.reduce((sum, score) => sum + score, 0) / scores.length
    return Math.max(-1, Math.min(1, average))
  }, [choiceIndexes, chapters])

  /** 选项序号越高越暖，点击时的闪光色也随之在同一色阶上平移。 */
  const choiceFlashColor = (index: number, total: number) => {
    const ratio = total < 2 ? 0 : index / (total - 1)
    // 冷端 #a8c8e8（偏蓝）→ 暖端 #e8c088（偏琥珀）
    const red = Math.round(0xa8 + (0xe8 - 0xa8) * ratio)
    const green = Math.round(0xc8 + (0xc0 - 0xc8) * ratio)
    const blue = Math.round(0xe8 + (0x88 - 0xe8) * ratio)
    return `rgb(${red}, ${green}, ${blue})`
  }

  useEffect(() => {
    try {
      const saved = localStorage.getItem('jianjia-saved-game')
      if (saved) {
        const game = JSON.parse(saved) as SavedGame
        const hasExpandedStory = game.chapters.length >= defaultChapters.length
        setChapter(Math.min(game.chapter, (hasExpandedStory ? game.chapters : defaultChapters).length - 1))
        setStarted(game.started)
        setChapters(hasExpandedStory ? game.chapters : defaultChapters)
        setFavorites(game.favorites ?? [])
        setMessage(hasExpandedStory ? '已恢复上次的阅读进度' : '故事已扩展，已为你保留当前阅读位置')
      }
      const savedArchives = localStorage.getItem('jianjia-story-archives')
      if (savedArchives) setArchives(JSON.parse(savedArchives) as StoryArchive[])
    } catch { setMessage('保存进度读取失败') }
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    const game: SavedGame = { chapter, started, chapters, title: chapters[0]?.title ?? '蒹葭', favorites }
    localStorage.setItem('jianjia-saved-game', JSON.stringify(game))
    if (started) {
      const archive: StoryArchive = { id: `${Date.now()}-${chapter}`, title: chapters[0]?.title ?? '蒹葭', chapter, chapterTitle: current.title, savedAt: new Date().toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }), chapters }
      setArchives((items) => [archive, ...items.filter((item) => !(item.title === archive.title && item.chapter === archive.chapter))].slice(0, 12))
    }
  }, [chapter, started, chapters, favorites, hydrated])

  useEffect(() => {
    if (hydrated) localStorage.setItem('jianjia-story-archives', JSON.stringify(archives))
  }, [archives, hydrated])

  useEffect(() => {
    document.title = isEnding
      ? `尾声｜${chapters[0]?.title ?? '蒹葭'}｜蒹葭互动故事`
      : `${current.title}｜${chapters[0]?.title ?? '蒹葭'}｜蒹葭互动故事`
  }, [current.title, chapters, isEnding])

  /**
   * 做出选择。
   * `choiceIndex` 用于推导场景暖度与闪光色，缺省（例如程序化跳转）时按中立处理。
   */
  const choose = (next: number, choiceIndex?: number) => {
    setStarted(true)
    setChapter(next)
    setShared(false)
    if (choiceIndex !== undefined) {
      setChoiceIndexes((indexes) => ({ ...indexes, [chapter]: choiceIndex }))
      setFlashToken((token) => token + 1)
    }
    setMessage('进度已自动保存，并写入历史存档')
  }
  const restoreArchive = (archive: StoryArchive) => { setChapters(archive.chapters); setChapter(archive.chapter); setStarted(archive.chapter > 0); setShowArchives(false); setMessage(`已载入「${archive.chapterTitle}」存档`) }
  const clearArchives = () => { setArchives([]); setMessage('历史存档已清空') }
  const toggleFavorite = () => { setFavorites((items) => items.includes(chapter) ? items.filter((item) => item !== chapter) : [...items, chapter]); setMessage(favorites.includes(chapter) ? '已取消收藏' : '已收藏这张故事卡片') }
  const shareResult = async () => {
    const shareText = `《${chapters[0]?.title ?? '蒹葭'}》· ${current.title}\n${current.text}\n\n${current.quote}\n\n来自：蒹葭互动故事 · jiangjia.story`
    try { if (navigator.share) await navigator.share({ title: current.title, text: shareText }); else { await navigator.clipboard.writeText(shareText); setShared(true); setMessage('故事结果已复制到剪贴板') } } catch { setMessage('分享已取消') }
  }
  const downloadResult = () => {
    const content = `《${chapters[0]?.title ?? '蒹葭'}》\n${current.year} · ${current.location}\n\n${current.title}\n\n${current.text}\n\n“${current.quote}”\n\n${current.choices.length ? '我走到了这里。' : '谢谢你走完这段故事。'}`
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' })); link.download = `${current.title}-故事结果.txt`; link.click(); URL.revokeObjectURL(link.href); setMessage('故事结果卡已下载')
  }
  const copyCard = async () => {
    // 用 Canvas 绘制一张 900×540 的故事卡片图片。
    // 配色按当前场景类型微调，内容包含章节号、标题、正文节选、引言和落款。
    const W = 900, H = 540, DPR = 2
    const canvas = document.createElement('canvas')
    canvas.width = W * DPR; canvas.height = H * DPR
    const ctx = canvas.getContext('2d')!
    ctx.scale(DPR, DPR)

    // 背景渐变：从 sceneClass 的色调取样，场景夜色用蓝黑，海景用墨绿，其余雨色
    const bgMap: Record<string, [string, string]> = {
      'scene-sea':    ['#1a2f34', '#0d1a1e'],
      'scene-night':  ['#111827', '#0d1219'],
      'scene-snow':   ['#1e2d34', '#111a20'],
      'scene-spring': ['#1e2820', '#101611'],
    }
    const [bgTop, bgBot] = bgMap[sceneClass] ?? ['#1e2929', '#0d1213']
    const grad = ctx.createLinearGradient(0, 0, 0, H)
    grad.addColorStop(0, bgTop); grad.addColorStop(1, bgBot)
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H)

    // 纹理：细颗粒感（每 4px 一个半透明灰点）
    ctx.fillStyle = 'rgba(200,210,210,0.028)'
    for (let y = 0; y < H; y += 4) for (let x = 0; x < W; x += 4) ctx.fillRect(x, y, 1, 1)

    // 左侧装饰竖线
    ctx.strokeStyle = 'rgba(200,180,140,0.22)'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(52, 52); ctx.lineTo(52, H - 52); ctx.stroke()

    // 章节标签
    ctx.fillStyle = 'rgba(200,178,138,0.72)'
    ctx.font = `600 11px 'Arial', sans-serif`
    ctx.letterSpacing = '0.22em'
    const chNum = String(chapter + 1).padStart(2, '0')
    ctx.fillText(`CHAPTER ${chNum} · ${current.year} · ${current.location}`, 72, 76)

    // 主标题
    ctx.fillStyle = '#f0ece3'
    const titleSize = Math.min(64, Math.max(36, Math.floor(540 / (current.title.length + 1))))
    ctx.font = `400 ${titleSize}px 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif`
    ctx.fillText(current.title, 72, 76 + titleSize + 18)

    // 正文节选（最多 80 字，换行）
    ctx.font = `400 15px 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif`
    ctx.fillStyle = 'rgba(224,218,206,0.82)'
    const excerpt = current.text.length > 80 ? current.text.slice(0, 78) + '…' : current.text
    const lineH = 24, lineW = W - 72 - 52, textY0 = 76 + titleSize + 18 + 38
    // 简单按字数折行
    const chars = Array.from(excerpt)
    let line = '', lines: string[] = []
    for (const ch of chars) {
      const test = line + ch
      if (ctx.measureText(test).width > lineW) { lines.push(line); line = ch }
      else line = test
    }
    if (line) lines.push(line)
    lines.slice(0, 4).forEach((l, i) => ctx.fillText(l, 72, textY0 + i * lineH))

    // 引言
    const quoteY = H - 52 - 58
    ctx.strokeStyle = 'rgba(200,178,138,0.35)'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(72, quoteY - 10); ctx.lineTo(W - 52, quoteY - 10); ctx.stroke()
    ctx.fillStyle = 'rgba(200,178,138,0.85)'
    ctx.font = `italic 400 15px 'Noto Serif SC', Georgia, serif`
    ctx.fillText(`”${current.quote}”`, 72, quoteY + 14)

    // 落款
    ctx.fillStyle = 'rgba(150,160,158,0.65)'
    ctx.font = `400 11px 'Arial', sans-serif`
    ctx.fillText('蒹葭互动故事  ·  jiangjia.story', W - 52 - ctx.measureText('蒹葭互动故事  ·  jiangjia.story').width, H - 52)

    // 写入剪贴板，降级为下载
    try {
      const blob = await new Promise<Blob>((res, rej) => canvas.toBlob(b => b ? res(b) : rej(new Error('toBlob failed')), 'image/png'))
      if (typeof ClipboardItem !== 'undefined') {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
        setCardCopied(true); setMessage('卡片图片已复制，可直接粘贴到微信、微博或相册')
      } else {
        // Safari 等不支持 ClipboardItem 时直接触发下载
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a'); a.href = url; a.download = `${current.title}-故事卡片.png`
        a.click(); URL.revokeObjectURL(url)
        setCardCopied(true); setMessage('卡片图片已下载（该浏览器不支持直接复制图片）')
      }
    } catch {
      // 权限被拒等异常时降级为文本复制
      const text = `《${chapters[0]?.title ?? '蒹葭'}》·${current.title}\n${current.year} · ${current.location}\n\n${current.text}\n\n”${current.quote}”\n\n来自：蒹葭互动故事 · jiangjia.story`
      await navigator.clipboard.writeText(text)
      setCardCopied(true); setMessage('已复制为文字卡片（请在浏览器设置中允许访问剪贴板以复制图片）')
    }
    window.setTimeout(() => setCardCopied(false), 2200)
  }
  const copyOriginal = async () => { await navigator.clipboard.writeText(originalStory); setMessage('原文故事已复制，素材来源与版权声明也已一并保留') }
  const jumpToLevel = (next: number) => { setChapter(next); setStarted(next > 0); setShowLevels(false); setMessage(`已进入第 ${String(next + 1).padStart(2, '0')} 章`) }
  const restart = () => { setChapter(0); setStarted(false); setMessage('已重新开始，原进度仍会被新的选择覆盖') }
  const generateStory = async (event: React.FormEvent) => {
    event.preventDefault(); setLoading(true); setMessage('正在写下新的故事……')
    try { const response = await fetch('/api/generate-story', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ theme, characters }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); setChapters(data.chapters); setChapter(0); setStarted(false); setShowGenerator(false); setMessage(`《${data.title}》已经准备好了`); setTheme(''); setCharacters('') } catch (error) { setMessage(error instanceof Error ? error.message : '生成失败，请稍后再试') } finally { setLoading(false) }
  }

  return <><SceneCanvas chapter={chapter} hovered={choiceHovered} flashToken={flashToken} warmth={sceneWarmth} flashColor={choiceFlashColor(choiceIndexes[chapter] ?? 0, current.choices.length)} /><main className={`story-shell ${sceneClass}-cursor`}><div className="rain-layer" aria-hidden="true">{rainDrops.map((drop) => <i key={drop} style={{ left: `${(drop * 29) % 101}%`, animationDelay: `${(drop % 9) * -0.7}s`, animationDuration: `${1.3 + (drop % 5) * 0.25}s` }} />)}</div>
    <header className="topbar"><div className="brand"><span className="brand-mark"><CloudRain /></span><span>蒹葭</span><em>INTERACTIVE STORY</em></div><div className="top-actions"><button className="utility-button" onClick={() => setShowInstructions(true)}><Info /> 游戏说明</button><button className="utility-button" onClick={() => setShowLevels(true)}><List /> 选关</button><button className="utility-button" onClick={() => setShowMap(true)}><Map /> 地图</button><button className="utility-button" onClick={() => setShowArchives(true)}><History /> 存档 <b className="archive-count">{archives.length}</b></button><button className="utility-button" onClick={() => setShowOriginal(true)}><BookOpen /> 原文</button><button className="generator-trigger" onClick={() => setShowGenerator(true)}><Plus /> 新故事</button><button className="icon-button" onClick={() => setSound(!sound)} aria-label={sound ? '关闭声音' : '打开声音'}>{sound ? <Volume2 /> : <VolumeX />}</button><span className="chapter-count">{String(chapter + 1).padStart(2, '0')} / {String(chapters.length).padStart(2, '0')}</span></div></header>
    {message && <div className="save-note" role="status"><History /> {message}</div>}
    <section className={`story-card ${started ? 'is-started' : ''} ${sceneClass}`}><div className="story-meta"><span>{current.year}</span><span className="meta-line" /><span>{current.location}</span><span className="scene-caption">{sceneClass === 'scene-sea' ? '潮汐记忆' : sceneClass === 'scene-night' ? '凌晨一点' : sceneClass === 'scene-snow' ? '雪落无声' : sceneClass === 'scene-spring' ? '来日方长' : '雨中的记忆'}</span></div><div className="story-body"><p className="eyebrow">A STORY ABOUT WAITING</p><h1>{current.title}</h1><p className="story-text">{current.text}</p>{isRomanceScene && <div className="romance-scene" aria-label="亲密剧情"><span className="romance-kicker">A QUIET MOMENT</span><p>{romanceScene}</p></div>}<blockquote>“{current.quote}”</blockquote>{!isEnding ? <div className="choices" aria-label="选择你的回应">{current.choices.map((choice, index) => <button className="choice-button" key={choice.label} onClick={() => choose(Math.min(choice.next, chapters.length - 1), index)} onPointerEnter={() => setChoiceHovered(true)} onPointerLeave={() => setChoiceHovered(false)} onFocus={() => setChoiceHovered(true)} onBlur={() => setChoiceHovered(false)}><span><strong>{choice.label}</strong><small>{choice.note}</small></span><ArrowRight /></button>)}</div> : <div className="ending-actions"><p className="ending-lead">遗憾不是故事的终点，而是你开始把自己放回人生中心的那一刻。</p><p>你没有改变过去，却改变了与过去相处的方式。那些没有走到最后的相遇，依然教会你真诚、勇敢、温柔，也让你更清楚自己值得怎样的爱与生活。</p><div className="ending-summary"><strong>给此刻的你</strong><span>愿你把失去变成力量，把等待变成成长。下一段路不必复制旧故事，带着走过的雨，你仍然可以向光而行。</span></div><button className="restart-button" onClick={restart}><RotateCcw /> 再听一遍</button></div>}<div className="result-actions" aria-label="故事结果操作"><button className={favorites.includes(chapter) ? 'result-action active' : 'result-action'} onClick={toggleFavorite}><Heart /> {favorites.includes(chapter) ? '已收藏' : '收藏卡片'}</button><button className="result-action" onClick={shareResult}>{shared ? <Check /> : <Share2 />} {shared ? '已复制' : '分享结果'}</button><button className="result-action" onClick={copyCard}>{cardCopied ? <Check /> : <BookOpen />} {cardCopied ? '卡片已复制' : '复制为卡片'}</button><button className="result-action" onClick={downloadResult}><Download /> 下载结果</button></div></div><div className="story-footer"><BookOpen /><span>选择会改变你记住这段故事的方式</span><div className="progress-track"><div style={{ width: `${Math.max(progress, 8)}%` }} /></div></div></section>
    <footer className="page-footer"><span>西安 · 九月 · 雨</span><span>scroll to remember</span></footer>
    {showInstructions && <div className="generator-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowInstructions(false) }}><section className="info-panel" role="dialog" aria-modal="true" aria-labelledby="instructions-title"><button className="close-generator" onClick={() => setShowInstructions(false)} aria-label="关闭"><X /></button><p className="eyebrow">HOW TO PLAY</p><h2 id="instructions-title">把遗憾走成自己的故事</h2><p>每一关都会给你两个选择。没有错误答案，选择会改变你记住这段经历的方式。</p><div className="instruction-grid"><div><strong>阅读</strong><span>跟随时间与地点，慢慢读完每个片段。</span></div><div><strong>选择</strong><span>点击回应，进入下一章并留下你的脚印。</span></div><div><strong>继续</strong><span>进度会自动保存，关闭页面后可从上次继续。</span></div></div><p className="info-quote">结局也许相同，但你走过的路，永远只属于你。</p><p className="copyright-note">素材来源于互联网故事原文，原文存档于 {ORIGINAL_STORY_ARCHIVE}，版权归原作者所有。查看 <a className="copyright-link" href={PROJECT_REPOSITORY} target="_blank" rel="noreferrer noopener">GitHub 仓库</a> 或 <a className="copyright-link" href={PROJECT_GAME_URL} target="_blank" rel="noreferrer noopener">线上游戏</a>。</p></section></div>}
    {showLevels && <div className="generator-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowLevels(false) }}><section className="info-panel level-panel" role="dialog" aria-modal="true" aria-labelledby="levels-title"><button className="close-generator" onClick={() => setShowLevels(false)} aria-label="关闭"><X /></button><p className="eyebrow">CHAPTER SELECT</p><h2 id="levels-title">选择关卡</h2><p>回到任何已读章节，重新感受那一刻的风。</p><div className="level-list">{chapters.map((level, index) => <button key={`${level.title}-${index}`} className={index === chapter ? 'level-button active' : 'level-button'} onClick={() => jumpToLevel(index)}><span><strong>{String(index + 1).padStart(2, '0')}</strong><span><b>{level.title}</b><small>{level.location}</small></span></span><ArrowRight /></button>)}</div></section></div>}
    {showMap && <div className="generator-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowMap(false) }}><section className="info-panel map-panel" role="dialog" aria-modal="true" aria-labelledby="map-title"><button className="close-generator" onClick={() => setShowMap(false)} aria-label="关闭"><X /></button><p className="eyebrow">MEMORY MAP / JOURNEY</p><h2 id="map-title">故事地图</h2><p>沿着记忆里的雨、风与海，选择一处地点重新抵达。地图上的每个节点，都是你走过的一段路。</p><div className="story-map" aria-label="故事场景地图">{chapters.map((level, index) => <button key={`map-${level.title}-${index}`} className={`${getSceneClass(level)} ${index === chapter ? 'map-node active' : index < chapter ? 'map-node visited' : 'map-node'}`} style={{ '--map-x': `${12 + ((index * 37) % 76)}%`, '--map-y': `${18 + ((index * 53) % 65)}%` } as React.CSSProperties} onClick={() => { jumpToLevel(index); setShowMap(false) }} aria-label={`前往第 ${index + 1} 章 ${level.title}`}><span className="map-dot" /><span className="map-label"><b>{String(index + 1).padStart(2, '0')}</b>{level.title}</span></button>) }<div className="map-route" aria-hidden="true" /></div><div className="map-legend"><span><i className="legend-dot visited" />已走过</span><span><i className="legend-dot active" />当前章节</span><span><i className="legend-dot" />未抵达</span></div></section></div>}
    {showArchives && <div className="generator-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowArchives(false) }}><section className="info-panel archive-panel" role="dialog" aria-modal="true" aria-labelledby="archives-title"><button className="close-generator" onClick={() => setShowArchives(false)} aria-label="关闭"><X /></button><p className="eyebrow">STEAM LIBRARY / SAVES</p><h2 id="archives-title">历史结果与存档</h2><p>每一次选择都会留下一个可回看的瞬间。最多保留最近 12 条记录。</p>{archives.length ? <div className="archive-list">{archives.map((archive) => <button className="archive-button" key={archive.id} onClick={() => restoreArchive(archive)}><span className="archive-cover"><BookOpen /></span><span><strong>{archive.title}</strong><b>第 {String(archive.chapter + 1).padStart(2, '0')} 章 · {archive.chapterTitle}</b><small>{archive.savedAt} · 点击载入</small></span><ArrowRight /></button>)}</div> : <div className="archive-empty"><History /><strong>还没有历史存档</strong><span>开始一段故事，你的选择会自动出现在这里。</span></div>}<button className="archive-clear" onClick={clearArchives} disabled={!archives.length}>清空历史存档</button></section></div>}
    {showOriginal && <div className="generator-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowOriginal(false) }}><section className="info-panel original-panel" role="dialog" aria-modal="true" aria-labelledby="original-title"><button className="close-generator" onClick={() => setShowOriginal(false)} aria-label="关闭"><X /></button><p className="eyebrow">ORIGINAL TEXT / COPYRIGHT</p><h2 id="original-title">原文故事</h2><p>保留你提供的原文叙事。你可以随时复制全文，或将当前结果复制为卡片分享。</p><textarea className="original-text" value={originalStory} readOnly aria-label="原文故事全文" /><div className="original-actions"><button className="generate-button" onClick={copyOriginal}><Check /> 复制原文</button><button className="archive-clear" onClick={() => setShowOriginal(false)}>返回故事</button></div><p className="copyright-note">{SOURCE_NOTICE} 复制与分享时请保留这段声明：<a className="copyright-link" href={PROJECT_REPOSITORY} target="_blank" rel="noreferrer noopener">GitHub 仓库</a> · <a className="copyright-link" href={PROJECT_GAME_URL} target="_blank" rel="noreferrer noopener">线上游戏</a></p></section></div>}
    {showGenerator && <div className="generator-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowGenerator(false) }}><section className="generator-panel" role="dialog" aria-modal="true" aria-labelledby="generator-title"><button className="close-generator" onClick={() => setShowGenerator(false)} aria-label="关闭"><X /></button><p className="eyebrow">CREATE YOUR STORY</p><h2 id="generator-title">写一个新的雨天</h2><p>输入主题与角色，让 AI 为你生成一段可以亲自选择的故事。</p><form onSubmit={generateStory}><label>故事主题<input value={theme} onChange={(event) => setTheme(event.target.value)} placeholder="例如：海边灯塔的最后一夜" required /></label><label>角色设定<textarea value={characters} onChange={(event) => setCharacters(event.target.value)} placeholder="例如：沉默的灯塔管理员，与一位来寻找父亲的女孩" required rows={4} /></label><button className="generate-button" disabled={loading}>{loading ? <Loader2 className="spin" /> : <CloudRain />} {loading ? '正在生成…' : '生成可玩的故事'}</button></form></section></div>}
  </main></>
}
