export function initHeroScene() {
  const canvas = document.querySelector<HTMLCanvasElement>(".hero-canvas")
  if (!canvas) return

  const load = () => {
    import("../jelly/scene")
      .then((m) => m.createJellyScene(canvas))
      .catch(() => {
        canvas.style.display = "none"
      })
  }

  if (!window.matchMedia("(max-width: 720px)").matches) {
    load()
    return
  }

  const activate = () => {
    window.removeEventListener("pointerdown", activate)
    window.removeEventListener("keydown", activate)
    if ("requestIdleCallback" in window) window.requestIdleCallback(load, { timeout: 1000 })
    else setTimeout(load, 100)
  }
  window.addEventListener("pointerdown", activate, { passive: true })
  window.addEventListener("keydown", activate)
}
