'use client'

import { useEffect, useRef, useState } from 'react'
import { buildScene } from '@/lib/scene/bundle'
import { createRandom, damping, lerp } from '@/lib/scene/random'
import { getSceneRecipe } from '@/lib/scene/recipes'
import type { SceneBundle, SceneSharedState } from '@/lib/scene/types'

/**
 * 章节场景画布。
 *
 * 职责分层：
 * - WebGL 上下文、尺寸观测、可见性暂停、降级策略 → 本文件
 * - 场景长什么样（雨、雪、海、灯火）→ `lib/scene/recipes.ts`
 * - 缓冲区与着色器生命周期 → `lib/scene/bundle.ts`
 *
 * 关键设计：**渲染器只在挂载时创建一次**，章节切换仅替换场景内容。
 * 若把渲染器绑在章节上，每次切章都要重建 canvas 并重新编译着色器，
 * 会带来肉眼可见的闪烁与 GC 抖动。
 */

type SceneCanvasProps = {
  /** 章节索引，决定使用哪份配方 */
  chapter: number
  /** 是否有选项按钮处于悬停状态 */
  hovered: boolean
  /** 每次点击选项递增，用于触发一次闪光 */
  flashToken: number
  /** 玩家历史选择累计的暖度偏移，负冷正暖 */
  warmth: number
  /** 本次点击闪光的目标颜色 */
  flashColor: string
}

/** 相机视场角与距离决定可见世界尺寸，配方按此比例布局。 */
const CAMERA_FOV = 52
const CAMERA_DEPTH = 6
const MAX_PIXEL_RATIO = 2
/** 视野外或标签页隐藏时停帧；40fps 对这块窄画幅足够，且显著降低发热 */
const TARGET_FRAME_INTERVAL = 1000 / 40

export default function SceneCanvas({ chapter, hovered, flashToken, warmth, flashColor }: SceneCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const bundleRef = useRef<SceneBundle | null>(null)
  const threeRef = useRef<typeof import('three') | null>(null)
  const sceneRef = useRef<import('three').Scene | null>(null)
  const cameraRef = useRef<import('three').PerspectiveCamera | null>(null)
  const rendererRef = useRef<import('three').WebGLRenderer | null>(null)
  const layoutRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 })

  const sharedRef = useRef<SceneSharedState>({
    pointerX: 0,
    pointerY: 0,
    hover: 0,
    flash: 0,
    flashColor,
    warmth,
    progress: 0,
  })

  // 每帧读取的最新输入放 ref：渲染循环不依赖 React 渲染周期，
  // 悬停/暖度变化不会重建任何 WebGL 资源。必须在循环定义之前声明。
  const hoveredRef = useRef(hovered)
  const warmthRef = useRef(warmth)
  hoveredRef.current = hovered
  warmthRef.current = warmth

  // 未支持（无 WebGL / 用户要求减少动态效果）时整块不渲染，让下层 CSS 场景接管
  const [unsupported, setUnsupported] = useState(false)
  // three 动态导入完成、渲染器与相机就绪后置为 true，用作建场景的前置条件
  const [ready, setReady] = useState(false)

  /* ---------- 输入：鼠标视差 ---------- */

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const handlePointerMove = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return
      // 归一化到 [-1, 1]，以画面中心为原点
      sharedRef.current.pointerX = ((event.clientX - rect.left) / rect.width) * 2 - 1
      sharedRef.current.pointerY = -(((event.clientY - rect.top) / rect.height) * 2 - 1)
    }
    const handlePointerLeave = () => {
      sharedRef.current.pointerX = 0
      sharedRef.current.pointerY = 0
    }

    // 挂在 window 上：鼠标移出卡片时视差也能平滑归位，而不是卡在半途
    window.addEventListener('pointermove', handlePointerMove, { passive: true })
    host.addEventListener('pointerleave', handlePointerLeave)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      host.removeEventListener('pointerleave', handlePointerLeave)
    }
  }, [])

  /* ---------- 点击闪光 ---------- */

  useEffect(() => {
    if (flashToken === 0) return
    // 闪光色与强度必须同时写入：颜色由点击的那个选项决定
    // （排位越靠后越暖），只在初始化时读一次的话，画面永远闪同一个颜色。
    sharedRef.current.flashColor = flashColor
    sharedRef.current.flash = 1
  }, [flashToken, flashColor])

  /* ---------- 渲染器：仅挂载时创建 ---------- */

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    // 尊重系统「减少动态效果」：不启动 WebGL，交给既有 CSS 场景
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setUnsupported(true)
      return
    }

    let disposed = false
    let frame = 0
    let resizeObserver: ResizeObserver | undefined
    let intersectionObserver: IntersectionObserver | undefined
    let handleVisibility: (() => void) | undefined

    // 动态导入：three 体积可观，不放进首屏关键路径；
    // 加载期间底层 CSS 场景继续可见，不会出现空白。
    void (async () => {
      let THREE: typeof import('three')
      try {
        THREE = await import('three')
      } catch {
        setUnsupported(true)
        return
      }
      if (disposed) return

      const rect = host.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) {
        setUnsupported(true)
        return
      }

      let renderer: import('three').WebGLRenderer
      try {
        renderer = new THREE.WebGLRenderer({
          alpha: true,
          antialias: rect.width > 320,
          powerPreference: 'low-power',
        })
      } catch {
        // 拿不到 WebGL 上下文：静默回退到 CSS 场景
        setUnsupported(true)
        return
      }
      if (disposed) {
        renderer.dispose()
        return
      }

      renderer.setClearAlpha(0)
      renderer.domElement.style.width = '100%'
      renderer.domElement.style.height = '100%'
      renderer.domElement.style.display = 'block'
      host.appendChild(renderer.domElement)

      const camera = new THREE.PerspectiveCamera(CAMERA_FOV, Math.max(rect.width / rect.height, 0.001), 0.1, 60)
      camera.position.set(0, 0, CAMERA_DEPTH)

      const scene = new THREE.Scene()

      threeRef.current = THREE
      sceneRef.current = scene
      cameraRef.current = camera
      rendererRef.current = renderer
      layoutRef.current = { width: rect.width, height: rect.height }

      /* ----- 尺寸观测 ----- */

      const applySize = () => {
        const next = host.getBoundingClientRect()
        if (next.width === 0 || next.height === 0) return
        const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO)
        renderer.setPixelRatio(ratio)
        renderer.setSize(next.width, next.height, false)
        camera.aspect = next.width / next.height
        camera.updateProjectionMatrix()
        layoutRef.current = { width: next.width, height: next.height }

        // 传**画布像素高度**：粒子尺寸以「画布高度的百分比」声明，
        // 所以基准是设备像素高，而不是世界坐标下的可视高度。
        bundleRef.current?.resize(next.height * ratio)
      }

      resizeObserver = new ResizeObserver(applySize)
      resizeObserver.observe(host)
      applySize()

      // 通知场景 effect：渲染器与相机就绪，可以开始建场景了。
      // 直接在这里建首个场景也可以，但那样就把「建场景」的逻辑分成两处，
      // 用 ready 让下面的 effect 统一负责更不容易走样。
      setReady(true)

      /* ----- 帧循环 ----- */

      let lastTime = performance.now()
      let lastRender = 0
      let visible = true
      let paused = document.hidden

      intersectionObserver = new IntersectionObserver(
        (entries) => { visible = entries.some((entry) => entry.isIntersecting) },
        { threshold: 0.05 },
      )
      intersectionObserver.observe(host)

      handleVisibility = () => { paused = document.hidden }
      document.addEventListener('visibilitychange', handleVisibility)

      const loop = (now: number) => {
        frame = window.requestAnimationFrame(loop)
        if (paused || !visible) {
          lastTime = now
          return
        }
        // 节流：这块窄画幅的观感几乎无损，但省下大量 GPU 时间
        if (now - lastRender < TARGET_FRAME_INTERVAL) return
        const delta = Math.min((now - lastTime) / 1000, 0.1)
        lastTime = now
        lastRender = now

        const shared = sharedRef.current
        const step = Math.min(delta, 0.05)
        shared.hover = lerp(shared.hover, hoveredRef.current ? 1 : 0, damping(0.14, step))
        shared.warmth = lerp(shared.warmth, warmthRef.current, damping(0.05, step))
        shared.flash = Math.max(0, shared.flash - step * 1.6)

        bundleRef.current?.update(now / 1000, delta, shared)
        renderer.render(scene, camera)
      }
      frame = window.requestAnimationFrame(loop)
    })()

    return () => {
      disposed = true
      window.cancelAnimationFrame(frame)
      resizeObserver?.disconnect()
      intersectionObserver?.disconnect()
      if (handleVisibility) document.removeEventListener('visibilitychange', handleVisibility)

      bundleRef.current?.dispose()
      bundleRef.current = null

      const renderer = rendererRef.current
      if (renderer) {
        // 必须显式释放上下文：React 严格模式会重复挂载，
        // 不回收会很快耗尽浏览器的 WebGL 上下文配额
        renderer.dispose()
        renderer.forceContextLoss()
        renderer.domElement.remove()
      }
      rendererRef.current = null
      sceneRef.current = null
      cameraRef.current = null
      threeRef.current = null
    }
  }, [])

  /* ---------- 章节配方：切章只替换场景内容 ---------- */

  useEffect(() => {
    // ready 必须出现在依赖数组里：它在渲染器 effect 的异步回调中由 false 变 true，
    // 只写进函数体而漏掉依赖，effect 永远不会因它重新运行，首个场景就建不出来。
    if (!ready) return

    const THREE = threeRef.current
    const scene = sceneRef.current
    const camera = cameraRef.current
    if (!THREE || !scene || !camera) return

    const { width, height } = layoutRef.current
    if (width === 0 || height === 0) return

    // 旧场景先回收，避免两套网格叠加渲染
    bundleRef.current?.dispose()

    // 世界尺寸的换算是按各图层深度在骨架内部完成的（visibleAt），
    // 这里提供相机、随机种子，以及按画布面积换算出的粒子密度。
    bundleRef.current = buildScene(getSceneRecipe(chapter), {
      three: THREE,
      scene,
      camera,
      // 种子固定：同一章节每次重建都得到同一片雨，切章往返不会跳变
      random: createRandom(0x5e9e + chapter * 7919),
      // 配方的 count 以 760×112 的窄条画幅为基准调校；
      // 取面积比的平方根（而非线性比值），否则满屏时粒子会密到糊成一片。
      density: Math.min(4, Math.max(0.6, Math.sqrt((width * height) / (760 * 112)))),
    })

    // 立刻按当前尺寸完成首次布局，否则要等到下一次 resize 才有正确构图
    const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO)
    bundleRef.current.resize(height * ratio)

    // 切章时重置闪光，避免上一章的点击效果串到新场景
    sharedRef.current.flash = 0
  }, [chapter, ready])

  if (unsupported) return null

  return <div className="scene-canvas" ref={hostRef} aria-hidden="true" />
}
