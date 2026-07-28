const REPO = "kylepelham/Drift"

interface ReleaseAsset {
  name: string
  browser_download_url: string
  download_count: number
}

interface Release {
  tag_name: string
  draft: boolean
  prerelease: boolean
  assets: ReleaseAsset[]
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: { Accept: "application/vnd.github+json" } })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

function format(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`
  return String(value)
}

function setText(attr: string, value: string) {
  for (const el of document.querySelectorAll(`[${attr}]`)) el.textContent = value
}

export async function initStats() {
  const [repo, releases] = await Promise.all([
    fetchJson<{ stargazers_count: number; forks_count: number }>(`https://api.github.com/repos/${REPO}`),
    fetchJson<Release[]>(`https://api.github.com/repos/${REPO}/releases?per_page=100`),
  ])

  if (repo) {
    setText("data-stars", format(repo.stargazers_count))
    setText("data-forks", format(repo.forks_count))
  }
  if (!releases) return

  const downloads = releases.flatMap((r) => r.assets).reduce((sum, a) => sum + a.download_count, 0)
  setText("data-downloads", format(downloads))

  const latest = releases.find((r) => !r.draft && !r.prerelease)
  if (!latest) return
  setText("data-version", latest.tag_name)
  const installer = latest.assets.find((a) => a.name.endsWith(".exe"))
  if (!installer) return
  for (const el of document.querySelectorAll<HTMLAnchorElement>("[data-installer]")) {
    el.href = installer.browser_download_url
  }
}
