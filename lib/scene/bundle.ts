import type * as Three from 'three'
import { POINT_FRAGMENT_SHADER, POINT_VERTEX_SHADER } from './glsl'
import { damping, lerp } from './random'
import type {
  GlowLight,
  HorizonLayer,
  ParticleField,
  SceneBundle,
  SceneProp,
  SceneRecipe,
  SceneRuntime,
  SceneSharedState,
} from './types'

/**
 * 通用场景骨架。
 *
 * 每个章节的差异全部由 `SceneRecipe` 描述，这里只负责：
 * 分配缓冲区、编译一次着色器、逐帧推进粒子、处理视差与回收。
 *
 * ## 坐标约定（这套换算的正确性依赖它）
 *
 * 相机是**透视投影**：同一个世界尺寸，在越远的地方占的画面比例越小。
 * 早期版本把「画幅」当成固定的世界尺寸（按 z = 0 平面求得），
 * 而内容实际画在 z = -6 ~ -12，于是所有元素只占画面中间一小块
 * （天空只覆盖 47% 高度、剪影只占 8% 宽度）。
 *
 * 正确做法：**按每个图层自身的深度求该处的可视范围**（`visibleAt(z)`），
 * 再用它把配方的归一化坐标换算成世界坐标。这样 0.5 就真的等于半屏，
 * 无论元素放在多远。
 *
 * 配方的坐标语义：
 * - `x` / `y`：以画面中心为 0，±1 为画幅边缘（可超出，用于画面外生成）
 * - `size`：画幅高度的百分比（0.06 = 画布高度的 6%）
 */

/** 与 React 层保持一致：超过 2 倍的像素比收益极低，移动端反而拖慢帧率。 */
const MAX_PIXEL_RATIO = 2

/** 各图层的世界深度。粒子另在自己配方里声明 z。 */
const SKY_Z = -12
const HORIZON_Z = -9
const PROP_Z = -7.5
const GLOW_Z = -6

/** 越界回绕阈值（归一化单位，1 = 画幅边缘）。留出余量避免出生瞬间就被判定越界。 */
const WRAP_LIMIT = 1.05

type ParticleRuntime = {
  geometry: Three.BufferGeometry
  material: Three.ShaderMaterial
  points: Three.Points
  field: ParticleField
  /** 世界坐标，逐帧推进 */
  positions: Float32Array
  /** 世界单位/秒 */
  velocities: Float32Array
  /** 配方的归一化出生坐标（含 z），回绕时据此重新落点 */
  norm: Float32Array
  /** 归一化速度/秒 */
  normVel: Float32Array
  /** 每个粒子所在深度对应的世界单位/归一化单位，布局与回绕都要用 */
  scaleX: Float32Array
  scaleY: Float32Array
  /** 首次布局需要走「初始化」分支，之后走「按比例缩放」分支 */
  laidOut: boolean
}

export function buildScene(recipe: SceneRecipe, runtime: SceneRuntime): SceneBundle {
  const { three, scene, camera, random } = runtime

  /** 相机基准距离，由 React 层按视锥给出。 */
  const cameraDepth = camera.position.z

  /**
   * 指定深度处的可视世界尺寸。
   * 这是整套换算的地基：透视投影下可视范围与到相机的距离成正比。
   */
  const visibleAt = (z: number) => {
    const distance = Math.max(cameraDepth - z, 0.001)
    const height = 2 * Math.tan((camera.fov * Math.PI) / 360) * distance
    return { height, width: height * Math.max(camera.aspect, 0.001) }
  }

  let framePixelHeight = 1

  const disposables: Array<{ dispose: () => void }> = []
  const root = new three.Group()
  scene.add(root)
  disposables.push({ dispose: () => scene.remove(root) })

  // 实例级集合：必须是每次构建独立的局部变量，
  // 放在模块作用域会让多个场景实例互相污染并持续累积网格。
  const horizonMeshes: Array<{ mesh: Three.Mesh; layer: HorizonLayer }> = []
  const glowMeshes: Array<{ mesh: Three.Mesh; material: Three.ShaderMaterial; light: GlowLight }> = []
  const propMeshes: Array<{ mesh: Three.Mesh; prop: SceneProp }> = []

  /* ---------- 天空底色 ---------- */

  const skyMaterial = new three.ShaderMaterial({
    uniforms: {
      uTop: { value: new three.Color(recipe.palette.sky) },
      uBottom: { value: new three.Color(recipe.palette.horizon) },
      uVignette: { value: recipe.palette.vignette },
      uWarmth: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop;
      uniform vec3 uBottom;
      uniform float uVignette;
      uniform float uWarmth;
      varying vec2 vUv;

      void main() {
        vec3 color = mix(uBottom, uTop, smoothstep(0.0, 0.95, vUv.y));
        // 暖度偏移：玩家选择越靠后，画面越偏琥珀；越靠前越偏冷蓝
        color += vec3(0.06, 0.035, 0.0) * uWarmth;
        color -= vec3(0.0, 0.012, 0.05) * max(0.0, -uWarmth);

        // 四角压暗，让窄条画面产生「望向远处」的错觉
        float vignette = distance(vUv, vec2(0.5)) * uVignette;
        color *= 1.0 - vignette;

        gl_FragColor = vec4(color, 1.0);
      }
    `,
    depthWrite: false,
    depthTest: false,
  })
  disposables.push(skyMaterial)

  const sky = new three.Mesh(new three.PlaneGeometry(1, 1), skyMaterial)
  sky.position.set(0, 0, SKY_Z)
  sky.renderOrder = -20
  root.add(sky)
  disposables.push(sky.geometry)

  /* ---------- 地平线 ---------- */

  recipe.horizons.forEach((layer) => {
    const material = new three.ShaderMaterial({
      uniforms: {
        uColor: { value: new three.Color(layer.color) },
        uSoftness: { value: Math.max(layer.softness, 0.001) },
        uOpacity: { value: layer.opacity },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uSoftness;
        uniform float uOpacity;
        varying vec2 vUv;

        void main() {
          float band = 1.0 - smoothstep(0.0, uSoftness, abs(vUv.y - 0.5));
          float sides = smoothstep(0.0, 0.22, vUv.x) * smoothstep(1.0, 0.78, vUv.x);
          gl_FragColor = vec4(uColor, band * sides * uOpacity);
        }
      `,
      transparent: true,
      depthWrite: false,
      depthTest: false,
    })
    const mesh = new three.Mesh(new three.PlaneGeometry(1, 1), material)
    mesh.position.z = HORIZON_Z
    mesh.renderOrder = -15
    root.add(mesh)
    disposables.push(material, mesh.geometry)
    horizonMeshes.push({ mesh, layer })
  })

  /* ---------- 光晕：太阳、街灯、车窗、远处灯火 ---------- */

  recipe.glows.forEach((light) => {
    const material = new three.ShaderMaterial({
      uniforms: {
        uColor: { value: new three.Color(light.color) },
        uOpacity: { value: light.opacity },
        uPulse: { value: light.pulse },
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uOpacity;
        uniform float uPulse;
        uniform float uTime;
        varying vec2 vUv;

        void main() {
          float radius = distance(vUv, vec2(0.5)) * 2.0;
          float halo = pow(max(0.0, 1.0 - radius), 2.4);
          float breathe = uPulse > 0.0 ? 0.86 + 0.14 * sin(uTime * 6.2831 / uPulse) : 1.0;
          gl_FragColor = vec4(uColor, halo * uOpacity * breathe);
        }
      `,
      transparent: true,
      blending: three.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    })
    const mesh = new three.Mesh(new three.PlaneGeometry(1, 1), material)
    mesh.position.z = GLOW_Z
    mesh.renderOrder = -10
    root.add(mesh)
    disposables.push(material, mesh.geometry)
    glowMeshes.push({ mesh, material, light })
  })

  /* ---------- 剪影装饰：看台、教学楼、栈桥、邮筒…… ---------- */

  ;(recipe.props ?? []).forEach((prop) => {
    const geometry = buildPropGeometry(three, prop)
    const material = new three.MeshBasicMaterial({
      color: new three.Color(prop.color),
      transparent: true,
      opacity: prop.opacity,
      depthWrite: false,
      depthTest: false,
    })
    const mesh = new three.Mesh(geometry, material)
    mesh.position.z = PROP_Z
    mesh.renderOrder = -12
    root.add(mesh)
    disposables.push(geometry, material)
    propMeshes.push({ mesh, prop })
  })

  /* ---------- 粒子场 ---------- */

  const particleRuntimes: ParticleRuntime[] = recipe.particles.map((field) => {
    // 密度系数让同一份配方能适配窄条画幅与整屏背景：
    // count 是作者按「看得清」的手感定的基准值，实际数量再按画布面积放大。
    const count = Math.max(1, Math.round(field.count * runtime.density))
    const positions = new Float32Array(count * 3)
    const velocities = new Float32Array(count * 3)
    const norm = new Float32Array(count * 3)
    const normVel = new Float32Array(count * 3)
    const scaleX = new Float32Array(count)
    const scaleY = new Float32Array(count)
    const sizes = new Float32Array(count)
    const alphas = new Float32Array(count)
    const phases = new Float32Array(count)

    for (let index = 0; index < count; index += 1) {
      const point = field.spawn(random)
      norm[index * 3] = point.x
      norm[index * 3 + 1] = point.y
      norm[index * 3 + 2] = point.z

      const velocity = field.velocity(random)
      normVel[index * 3] = velocity.x
      normVel[index * 3 + 1] = velocity.y
      normVel[index * 3 + 2] = velocity.z

      sizes[index] = point.size
      alphas[index] = point.alpha
      phases[index] = random.unit()
    }

    const geometry = new three.BufferGeometry()
    geometry.setAttribute('position', new three.BufferAttribute(positions, 3))
    geometry.setAttribute('aSize', new three.BufferAttribute(sizes, 1))
    geometry.setAttribute('aAlpha', new three.BufferAttribute(alphas, 1))
    geometry.setAttribute('aPhase', new three.BufferAttribute(phases, 1))
    // 粒子会越出画幅后回绕，视锥剔除反而会误杀，直接关闭
    geometry.boundingSphere = new three.Sphere(new three.Vector3(), 1e6)

    const material = new three.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uFramePixelHeight: { value: 1 },
        uDepth: { value: Math.abs(cameraDepth) },
        uColor: { value: new three.Color(field.color) },
        uOpacity: { value: field.opacity },
        uSoftness: { value: field.softness },
        uStretch: { value: field.stretch },
      },
      vertexShader: POINT_VERTEX_SHADER,
      fragmentShader: POINT_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: three.AdditiveBlending,
    })

    const points = new three.Points(geometry, material)
    points.frustumCulled = false
    points.renderOrder = 5
    root.add(points)
    disposables.push(geometry, material)

    return {
      geometry,
      material,
      points,
      field,
      positions,
      velocities,
      norm,
      normVel,
      scaleX,
      scaleY,
      laidOut: false,
    }
  })

  /* ---------- 布局：把归一化坐标按各自深度换算成世界坐标 ---------- */

  function layout(pixelHeight: number) {
    framePixelHeight = pixelHeight

    const skyVisible = visibleAt(SKY_Z)
    // 留 15% 余量，透视与相机漂移都不会露出边缘
    sky.scale.set(skyVisible.width * 1.15, skyVisible.height * 1.15, 1)

    const horizonVisible = visibleAt(HORIZON_Z)
    horizonMeshes.forEach(({ mesh, layer }) => {
      const bandHeight = horizonVisible.height * Math.max(layer.softness * 1.6, 0.04)
      mesh.scale.set(horizonVisible.width * 1.1, bandHeight, 1)
      // layer.at 是「0 为底部、1 为顶部」的画幅比例
      mesh.position.set(0, (layer.at - 0.5) * horizonVisible.height, HORIZON_Z)
    })

    const glowVisible = visibleAt(GLOW_Z)
    glowMeshes.forEach(({ mesh, light }) => {
      // radius 是画幅高度的比例，2.6 让光晕有明显的外扩
      const size = glowVisible.height * light.radius * 2.6
      mesh.scale.set(size, size, 1)
      mesh.position.set(light.x * glowVisible.width * 0.5, light.y * glowVisible.height * 0.5, GLOW_Z)
    })

    const propVisible = visibleAt(PROP_Z)
    propMeshes.forEach(({ mesh, prop }) => {
      mesh.scale.set(prop.width * propVisible.width, prop.height * propVisible.height, 1)
      mesh.position.set(prop.x * propVisible.width * 0.5, prop.y * propVisible.height * 0.5, PROP_Z)
    })

    particleRuntimes.forEach((runtime_) => {
      const { field, positions, velocities, norm, normVel, scaleX, scaleY } = runtime_
      runtime_.material.uniforms.uFramePixelHeight.value = framePixelHeight

      for (let index = 0; index < field.count; index += 1) {
        const visible = visibleAt(norm[index * 3 + 2])

        if (runtime_.laidOut) {
          // 尺寸变化时按比例缩放既有状态，保留粒子的相对位置与动量，
          // 避免每次 resize 都重置成出生分布
          const ratioX = visible.width / scaleX[index]
          const ratioY = visible.height / scaleY[index]
          positions[index * 3] *= ratioX
          velocities[index * 3] *= ratioX
          positions[index * 3 + 1] *= ratioY
          velocities[index * 3 + 1] *= ratioY
        } else {
          positions[index * 3] = norm[index * 3] * visible.width
          positions[index * 3 + 1] = norm[index * 3 + 1] * visible.height
          positions[index * 3 + 2] = norm[index * 3 + 2]
          velocities[index * 3] = normVel[index * 3] * visible.width
          velocities[index * 3 + 1] = normVel[index * 3 + 1] * visible.height
          velocities[index * 3 + 2] = normVel[index * 3 + 2]
        }

        scaleX[index] = visible.width
        scaleY[index] = visible.height
      }

      runtime_.laidOut = true
    })
  }

  /* ---------- 逐帧推进 ---------- */

  /**
   * 越界回绕。
   *
   * 只判定**运动方向上的那一侧**：`top` 只看下缘、`left` 只看速度方向的出口。
   * 若两侧都判，配方里那些「从画面外生成」的粒子（|x| / |y| 可达 1.15）
   * 会在第一帧就被判定越界，出生分布会被压平。
   */
  function wrapParticle(runtime_: ParticleRuntime, index: number) {
    const { field, positions, velocities, norm, scaleX, scaleY } = runtime_
    const offset = index * 3

    if (field.wrap === 'top') {
      // 横向回到出生位置附近（带确定性抖动，避免排成一列）
      norm[offset] = clampUnit(norm[offset] + Math.sin(index * 12.9898) * 0.12)
      positions[offset] = norm[offset] * scaleX[index]
      positions[offset + 1] = WRAP_LIMIT * scaleY[index]
    } else if (field.wrap === 'left') {
      // 依据速度方向决定从哪一侧重新进场，这样同一套配方
      // 既能表达「向右飞的纸飞机」也能表达「向左掠过的列车」
      const direction = velocities[offset] >= 0 ? -1 : 1
      positions[offset] = direction * WRAP_LIMIT * scaleX[index]
      norm[offset + 1] = clampUnit(norm[offset + 1] + Math.cos(index * 7.233) * 0.12)
      positions[offset + 1] = norm[offset + 1] * scaleY[index]
    }
  }

  const skyWarmth = skyMaterial.uniforms.uWarmth
  const flashColor = new three.Color(0xffffff)
  let dolly = 0

  function update(elapsed: number, delta: number, shared: SceneSharedState) {
    const step = Math.min(delta, 0.05)

    skyWarmth.value = lerp(skyWarmth.value, shared.warmth, damping(0.6, step))

    // 运镜：缓慢漂移 + 悬停推近 + 鼠标视差。
    // 相机由 React 层持有，这里只改它的位置，避免每章重建导致视锥参数漂移。
    const driftPhase = (elapsed / recipe.camera.period) * Math.PI * 2
    dolly = lerp(dolly, shared.hover * recipe.reaction.hoverDolly, damping(0.08, step))

    camera.position.x = lerp(
      camera.position.x,
      Math.sin(driftPhase) * recipe.camera.driftX + shared.pointerX * recipe.camera.parallax,
      damping(0.12, step),
    )
    camera.position.y = lerp(
      camera.position.y,
      Math.cos(driftPhase * 0.7) * recipe.camera.driftY + shared.pointerY * recipe.camera.parallax * 0.6,
      damping(0.12, step),
    )
    // 闪光时轻微推近，让「点击」在画面上有物理感
    camera.position.z = cameraDepth + dolly - shared.flash * recipe.camera.dolly * 0.5
    camera.lookAt(0, 0, SKY_Z)

    glowMeshes.forEach(({ material, light }) => {
      material.uniforms.uTime.value = elapsed
      material.uniforms.uOpacity.value = light.opacity * (1 + shared.hover * 0.35) * (1 + shared.flash * 0.8)
    })

    propMeshes.forEach(({ mesh, prop }) => {
      if (prop.sway <= 0) return
      const phase = elapsed * (6.2831 / prop.sway)
      mesh.rotation.z = Math.sin(phase) * 0.014
      mesh.position.y += Math.sin(phase + 1.2) * 0.0004 * framePixelHeight
    })

    particleRuntimes.forEach((runtime_) => {
      const { field, material, positions, velocities, geometry, points } = runtime_
      const tint = material.uniforms.uColor.value as Three.Color
      const base = field.color
      const warmth = shared.warmth * 0.16
      tint.setRGB(
        clamp01(((base >> 16) & 0xff) / 255 + warmth),
        clamp01(((base >> 8) & 0xff) / 255 + warmth * 0.55),
        clamp01((base & 0xff) / 255 - warmth * 0.35),
      )

      if (shared.flash > 0.001) {
        flashColor.set(shared.flashColor)
        tint.lerp(flashColor, shared.flash * 0.5)
      }

      material.uniforms.uTime.value = elapsed
      material.uniforms.uOpacity.value =
        field.opacity * (1 + shared.hover * (recipe.reaction.hoverDensity - 1)) * (1 + shared.flash * recipe.reaction.flashStrength)

      // 视差：整批粒子随鼠标反向微移，制造纵深
      points.position.x = shared.pointerX * (0.05 + shared.hover * 0.03) * (framePixelHeight / 100)
      points.position.y = shared.pointerY * (0.05 + shared.hover * 0.03) * (framePixelHeight / 100)

      const limitX = WRAP_LIMIT
      const limitY = WRAP_LIMIT

      for (let index = 0; index < field.count; index += 1) {
        const offset = index * 3
        positions[offset] += velocities[offset] * step
        positions[offset + 1] += velocities[offset + 1] * step

        if (field.wrap === 'top') {
          if (positions[offset + 1] < -limitY * runtime_.scaleY[index]) wrapParticle(runtime_, index)
        } else if (field.wrap === 'left') {
          const bound = limitX * runtime_.scaleX[index]
          if (positions[offset] > bound || positions[offset] < -bound) wrapParticle(runtime_, index)
        }
      }

      ;(geometry.attributes.position as Three.BufferAttribute).needsUpdate = true
    })
  }

  function resize(pixelHeight: number) {
    layout(pixelHeight)
  }

  function dispose() {
    disposables.forEach((item) => item.dispose())
    disposables.length = 0
  }

  return { update, resize, dispose }
}

/** 把数值夹到 [-0.92, 0.92]，避免回绕时粒子落到画面之外。 */
function clampUnit(value: number) {
  return Math.max(-0.92, Math.min(0.92, value))
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function buildPropGeometry(three: typeof Three, prop: SceneProp) {
  switch (prop.kind) {
    case 'triangle': {
      const shape = new three.Shape()
      shape.moveTo(-0.5, -0.5)
      shape.lineTo(0.5, -0.5)
      shape.lineTo(0, 0.5)
      shape.closePath()
      return new three.ShapeGeometry(shape)
    }
    case 'arch': {
      const shape = new three.Shape()
      shape.moveTo(-0.5, -0.5)
      shape.lineTo(0.5, -0.5)
      shape.lineTo(0.5, 0.1)
      shape.absarc(0, 0.1, 0.5, 0, Math.PI, false)
      shape.lineTo(-0.5, -0.5)
      return new three.ShapeGeometry(shape, 24)
    }
    case 'pillar':
    case 'slab':
    default:
      return new three.PlaneGeometry(1, 1)
  }
}
