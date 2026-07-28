export function initLazyVideo() {
  const video = document.querySelector<HTMLVideoElement>("video[data-src]")
  if (!video) return
  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return
      video.src = video.dataset.src ?? ""
      video.play().catch(() => {})
      observer.disconnect()
    },
    { rootMargin: "600px" },
  )
  observer.observe(video)
}
