import * as THREE from "three"
import { createJellyfish } from "./jellyfish"
import { waterVertex, waterFragment, bubbleVertex, bubbleFragment, crtVertex, crtFragment } from "./shaders"

export interface JellyScene {
  dispose(): void
}

function makeWater(): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    vertexShader: waterVertex,
    fragmentShader: waterFragment,
    uniforms: {
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uDeep: { value: new THREE.Color("#0a1220") },
      uShallow: { value: new THREE.Color("#1d4b66") },
    },
    depthWrite: false,
    depthTest: false,
  })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat)
  mesh.frustumCulled = false
  mesh.renderOrder = -1
  return mesh
}

function makeBubbles(count: number): THREE.Points {
  const positions = new Float32Array(count * 3)
  const seeds = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 9
    positions[i * 3 + 1] = (Math.random() - 0.5) * 7
    positions[i * 3 + 2] = (Math.random() - 0.5) * 4 - 1
    seeds[i] = Math.random()
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3))
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1))
  const mat = new THREE.ShaderMaterial({
    vertexShader: bubbleVertex,
    fragmentShader: bubbleFragment,
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color("#9fd8f0") } },
    transparent: true,
    depthWrite: false,
  })
  return new THREE.Points(geo, mat)
}

function makeCrt(target: THREE.WebGLRenderTarget) {
  const scene = new THREE.Scene()
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const mat = new THREE.ShaderMaterial({
    vertexShader: crtVertex,
    fragmentShader: crtFragment,
    uniforms: {
      uScene: { value: target.texture },
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uStrength: { value: 0.85 },
    },
    depthTest: false,
  })
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat))
  return { scene, camera, mat }
}

function driftPath(t: number, out: THREE.Vector3): THREE.Vector3 {
  out.x = Math.sin(t * 0.2) * 1.6 + Math.sin(t * 0.073) * 0.45
  out.y = Math.sin(t * 0.31) * 0.42 + Math.cos(t * 0.11) * 0.25 + 0.62
  out.z = Math.sin(t * 0.16) * 0.6
  return out
}

export function createJellyScene(canvas: HTMLCanvasElement): JellyScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false })
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 40)
  camera.position.set(0, 0.2, 6.4)

  const target = new THREE.WebGLRenderTarget(1, 1, { samples: 4 })
  const crt = makeCrt(target)
  const water = makeWater()
  const bubbles = makeBubbles(140)
  const jelly = createJellyfish()
  jelly.group.scale.setScalar(0.72)
  scene.add(water, bubbles, jelly.group)

  const pointer = new THREE.Vector2(0, 0)
  const pointerSmooth = new THREE.Vector2(0, 0)
  const look = new THREE.Vector2(0, 0)
  const ndc = new THREE.Vector3()
  const pos = new THREE.Vector3()
  const prev = new THREE.Vector3()
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  const speed = reduced ? 0.12 : 1

  function onPointer(event: PointerEvent) {
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1
    pointer.y = -((event.clientY / window.innerHeight) * 2 - 1)
  }
  window.addEventListener("pointermove", onPointer)

  function resize() {
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    if (width === 0 || height === 0) return
    const dpr = Math.min(window.devicePixelRatio, 1.75)
    renderer.setPixelRatio(dpr)
    renderer.setSize(width, height, false)
    target.setSize(Math.floor(width * dpr), Math.floor(height * dpr))
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    crt.mat.uniforms.uResolution!.value.set(width * dpr, height * dpr)
    const waterMat = water.material as THREE.ShaderMaterial
    waterMat.uniforms.uResolution!.value.set(width, height)
  }
  const observer = new ResizeObserver(resize)
  observer.observe(canvas)
  resize()

  let raf = 0
  const start = performance.now()

  function frame(now: number) {
    raf = requestAnimationFrame(frame)
    const t = ((now - start) / 1000) * speed
    pointerSmooth.lerp(pointer, 0.04)

    driftPath(t * 0.6, pos)
    driftPath(t * 0.6 - 0.25, prev)
    jelly.group.position.copy(pos)
    ndc.copy(pos).project(camera)
    look.x = THREE.MathUtils.clamp((pointerSmooth.x - ndc.x) * 1.4, -1, 1)
    look.y = THREE.MathUtils.clamp((pointerSmooth.y - ndc.y) * 1.4, -1, 1)
    jelly.group.rotation.z = THREE.MathUtils.clamp((pos.x - prev.x) * -0.9, -0.22, 0.22)
    jelly.group.rotation.y = look.x * 0.3 + Math.sin(t * 0.14) * 0.18
    jelly.group.rotation.x = -look.y * 0.12
    jelly.update(t, look)

    const waterMat = water.material as THREE.ShaderMaterial
    waterMat.uniforms.uTime!.value = t
    const bubbleMat = bubbles.material as THREE.ShaderMaterial
    bubbleMat.uniforms.uTime!.value = t
    crt.mat.uniforms.uTime!.value = t

    renderer.setRenderTarget(target)
    renderer.render(scene, camera)
    renderer.setRenderTarget(null)
    renderer.render(crt.scene, crt.camera)
  }
  raf = requestAnimationFrame(frame)

  function onVisibility() {
    if (document.hidden) cancelAnimationFrame(raf)
    else raf = requestAnimationFrame(frame)
  }
  document.addEventListener("visibilitychange", onVisibility)

  return {
    dispose() {
      cancelAnimationFrame(raf)
      observer.disconnect()
      window.removeEventListener("pointermove", onPointer)
      document.removeEventListener("visibilitychange", onVisibility)
      renderer.dispose()
      target.dispose()
    },
  }
}
