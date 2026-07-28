export function initHeroScene() {
  const canvas = document.querySelector<HTMLCanvasElement>(".hero-canvas")
  if (!canvas) return
  import("../jelly/scene")
    .then((m) => m.createJellyScene(canvas))
    .catch(() => {
      canvas.style.display = "none"
    })
}
