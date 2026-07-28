/** Records a real Drift session through Edge's DevTools page capture into public/showcase.mp4. */
import { mkdir, rm, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { spawn, spawnSync } from "node:child_process"
import { Cdp, sleep } from "./cdp"

const APP_URL = "http://localhost:5180"
const PORT = 9333
const DIR = "C:\\Users\\KYLEPE~1\\AppData\\Local\\Temp\\opencode\\drift-capture"
const WORKSPACE = "C:\\Users\\KylePelham\\AppData\\Local\\Temp\\opencode\\demo\\tidepool"
const PROMPT = "Add a wave animation to the hero styles and make the tests pass"

const EDGE_PATHS = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
]

const TAURI_SHIM = `globalThis.__TAURI__ = { window: { getCurrentWindow: () => ({
  minimize() {}, toggleMaximize() {}, close() {},
  isMaximized: async () => false, onResized: async () => () => {},
}) } }`

const CAPTURE_STYLE = `document.addEventListener("DOMContentLoaded", () => {
  const style = document.createElement("style")
  style.textContent = "*:focus-visible { outline: none !important; }"
  document.head.append(style)
})`

const CAPTURE_STATE = `try {
  const svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'><rect width='48' height='48' rx='11' fill='#2b6f8f'/><text x='24' y='33' font-size='26' text-anchor='middle'>\\u{1F30A}</text></svg>"
  const entry = { id: crypto.randomUUID(), path: ${JSON.stringify(WORKSPACE)}, name: "Tidepool", icon: "data:image/svg+xml;utf8," + encodeURIComponent(svg), lastUsed: Date.now() }
  localStorage.setItem("drift.store.workspaces", JSON.stringify([entry]))
  localStorage.setItem("drift.workspace", JSON.stringify(entry.id))
  localStorage.setItem("drift.model", JSON.stringify({ providerID: "openai", modelID: "gpt-5.6-sol" }))
} catch {}`

interface Frame {
  file: string
  ts: number
}

interface Mark {
  name: string
  ts: number
}

const frames: Frame[] = []
const marks: Mark[] = []

function mark(name: string) {
  marks.push({ name, ts: Date.now() / 1000 })
  console.log(`mark ${name}`)
}

async function seedWorkspace() {
  await mkdir(`${WORKSPACE}\\src`, { recursive: true })
  await Promise.all([
    writeFile(`${WORKSPACE}\\package.json`, `{
  "name": "tidepool",
  "version": "0.1.0",
  "type": "module",
  "scripts": { "test": "bun test" }
}\n`),
    writeFile(`${WORKSPACE}\\src\\hero.ts`, `export interface HeroConfig {
  title: string
  classes: string[]
}

export function heroConfig(): HeroConfig {
  return {
    title: "Ride the tide",
    classes: ["hero", "hero-static"],
  }
}\n`),
    writeFile(`${WORKSPACE}\\src\\hero.css`, `.hero {
  min-height: 60vh;
  display: grid;
  place-items: center;
  background: linear-gradient(to top, #14344a, #0a1220);
  color: #eef3f8;
}\n`),
    writeFile(`${WORKSPACE}\\src\\hero.test.ts`, `import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { heroConfig } from "./hero"

test("hero opts into the wave animation", () => {
  expect(heroConfig().classes).toContain("hero-waves")
})

test("wave keyframes exist in the stylesheet", () => {
  const css = readFileSync(new URL("./hero.css", import.meta.url), "utf8")
  expect(css).toContain("@keyframes")
  expect(css).toMatch(/hero-waves/)
})

test("hero keeps its title", () => {
  expect(heroConfig().title).toBe("Ride the tide")
})\n`),
  ])
}

async function clearWorkspaceSessions() {
  const source = await fetch(`${APP_URL}/src/engine/connection.ts`).then((response) => response.text())
  const value = (key: string) => source.match(new RegExp(`"${key}":\\s*"([^"]+)"`))?.[1]
  const engineUrl = value("VITE_ENGINE_URL")
  const username = value("VITE_ENGINE_USERNAME")
  const password = value("VITE_ENGINE_PASSWORD")
  if (!engineUrl || !username || !password) throw new Error("could not resolve development engine credentials")

  const headers = { Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}` }
  const endpoint = new URL("/session", engineUrl)
  endpoint.searchParams.set("directory", WORKSPACE)
  const response = await fetch(endpoint, { headers })
  if (!response.ok) throw new Error(`session cleanup failed: ${response.status}`)
  const sessions = (await response.json()) as Array<{ id: string; directory: string }>
  const directory = WORKSPACE.replaceAll("\\", "/").toLowerCase()
  const stale = sessions.filter((session) => session.directory.replaceAll("\\", "/").toLowerCase() === directory)
  await Promise.all(
    stale.map(async (session) => {
      const target = new URL(`/session/${encodeURIComponent(session.id)}`, engineUrl)
      target.searchParams.set("directory", WORKSPACE)
      const deleted = await fetch(target, { method: "DELETE", headers })
      if (!deleted.ok && deleted.status !== 404) throw new Error(`could not delete session ${session.id}: ${deleted.status}`)
    }),
  )
}

async function launchEdge(): Promise<number> {
  const exe = EDGE_PATHS.find((p) => existsSync(p))
  if (!exe) throw new Error("Edge not found")
  const child = spawn(exe, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${DIR}\\profile`,
    "--inprivate",
    "--disable-sync",
    "--disable-extensions",
    "--disable-features=msImplicitSignin,EdgeSyncPromo",
    "--no-first-run",
    "--no-default-browser-check",
    "--window-size=1680,1120",
    `--app=${APP_URL}`,
  ], { detached: true, stdio: "ignore" })
  child.unref()
  if (!child.pid) throw new Error("Edge failed to spawn")
  return child.pid
}

async function findPage(): Promise<string> {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`)
      const targets = (await res.json()) as Array<{ type: string; url: string; webSocketDebuggerUrl: string }>
      const page = targets.find((t) => t.type === "page" && t.url.startsWith(APP_URL))
      if (page) return page.webSocketDebuggerUrl
    } catch {}
    await sleep(500)
  }
  throw new Error("page target not found")
}

async function waitReady(cdp: Cdp, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const ok = await cdp.eval<boolean>("(() => { const t = document.querySelector('textarea'); return !!t && !t.disabled })()")
    if (ok) return
    await sleep(600)
  }
  throw new Error("app not ready")
}

async function waitIdle(cdp: Cdp, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs
  let started = false
  while (Date.now() < deadline) {
    const state = await cdp.eval<{ busy: boolean; perm: boolean }>(
      `(() => { const btns = Array.from(document.querySelectorAll("button")).map(b => b.textContent.trim());
        return { busy: btns.includes("Stop"), perm: btns.includes("Always allow") } })()`,
    )
    if (state.busy) started = true
    if (state.perm) {
      await cdp.eval("Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Always allow')?.click()")
    } else if (started && !state.busy) return
    await sleep(750)
  }
  throw new Error("session never finished")
}

async function clickText(cdp: Cdp, needle: string) {
  await cdp.eval(
    `Array.from(document.querySelectorAll("button")).find(b => b.textContent.trim().includes(${JSON.stringify(needle)}))?.click()`,
  )
}

async function showGpt56Picker(cdp: Cdp) {
  const label = await cdp.eval<string>("document.querySelector(\"button[title='Model']\")?.textContent ?? ''")
  if (!label.includes("GPT-5.6 Sol")) throw new Error(`wrong model selected: ${label.trim()}`)
  await cdp.eval("document.querySelector(\"button[title='Model']\")?.click()")
  await sleep(2600)
  await pressKey(cdp, "Escape", "Escape", 27)
}

async function typeText(cdp: Cdp, text: string) {
  await cdp.eval("document.querySelector('textarea')?.focus()")
  for (const char of text) {
    await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", text: char })
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp" })
    await sleep(40 + Math.random() * 55)
  }
}

async function pressKey(cdp: Cdp, key: string, code: string, vk: number, text?: string) {
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode: vk, text })
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: vk })
}

let recording = false

async function recordFrames(cdp: Cdp) {
  let n = 0
  while (recording) {
    const started = performance.now()
    const result = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 85, fromSurface: true })
    const data = result.data as string
    const file = `${DIR}\\frames\\f${String(n++).padStart(5, "0")}.jpg`
    frames.push({ file, ts: Date.now() / 1000 })
    await writeFile(file, Buffer.from(data, "base64"))
    await sleep(Math.max(0, 1000 / 30 - (performance.now() - started)))
  }
}

async function drive(cdp: Cdp) {
  await cdp.send("Page.enable")
  await cdp.send("Runtime.enable")
  await cdp.send("Page.bringToFront")
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: TAURI_SHIM })
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: CAPTURE_STYLE })
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: CAPTURE_STATE })
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false })

  await cdp.send("Page.reload")
  recording = true
  const recordingDone = recordFrames(cdp)
  mark("boot")
  await waitReady(cdp, 60_000)
  mark("ready")
  await sleep(2200)

  await cdp.eval("document.querySelector(\"button[title='New thread']\")?.click()")
  await sleep(1400)

  mark("picker")
  await showGpt56Picker(cdp)
  await sleep(900)

  mark("typing")
  await typeText(cdp, PROMPT)
  await sleep(500)
  mark("send")
  await pressKey(cdp, "Enter", "Enter", 13, "\r")
  await waitIdle(cdp, 300_000)
  mark("idle")
  await sleep(1800)

  await clickText(cdp, "hero.css")
  await sleep(2600)

  mark("settings")
  await clickText(cdp, "Settings")
  await sleep(1600)
  await clickText(cdp, "Appearance")
  await sleep(1800)
  await clickText(cdp, "Midnight")
  await sleep(2000)
  await clickText(cdp, "Aubergine")
  await sleep(2000)
  await clickText(cdp, "Dark")
  await sleep(1400)
  await pressKey(cdp, "Escape", "Escape", 27)
  await sleep(2200)
  mark("end")

  recording = false
  await recordingDone
}

interface Segment {
  from: number
  to: number
  speed: number
}

function markAt(name: string): number {
  return marks.find((m) => m.name === name)?.ts ?? 0
}

function buildSegments(): Segment[] {
  const idle = markAt("idle")
  const send = markAt("send")
  const runSpeed = Math.max(2, (idle - send) / 5)
  return [
    { from: markAt("boot"), to: markAt("ready") + 2, speed: 1 },
    { from: markAt("ready") + 2, to: markAt("typing"), speed: 1.5 },
    { from: markAt("typing"), to: send, speed: 2.1 },
    { from: send, to: idle, speed: runSpeed },
    { from: idle, to: markAt("settings"), speed: 1.7 },
    { from: markAt("settings"), to: markAt("end") + 1, speed: 1.5 },
  ]
}

function outputTime(ts: number, segments: Segment[]): number {
  let out = 0
  for (const seg of segments) {
    if (ts <= seg.from) break
    const end = Math.min(ts, seg.to)
    out += (end - seg.from) / seg.speed
    if (ts <= seg.to) break
  }
  return out
}

function ffmpeg(args: string[]) {
  const result = spawnSync("bunx", ["remotion", "ffmpeg", ...args], { stdio: ["ignore", "inherit", "inherit"] })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error("ffmpeg failed")
}

async function assemble() {
  const segments = buildSegments()
  const start = markAt("boot")
  const end = markAt("end") + 1
  const usable = frames.filter((f) => f.ts >= start && f.ts <= end).sort((a, b) => a.ts - b.ts)
  if (usable.length < 20) throw new Error(`too few frames: ${usable.length}`)

  const selected: Array<Frame & { out: number }> = []
  for (const frame of usable) {
    const out = outputTime(frame.ts, segments)
    if (selected.length && out - selected.at(-1)!.out < 1 / 30) continue
    selected.push({ ...frame, out })
  }
  const last = usable.at(-1)!
  if (selected.at(-1)?.file !== last.file) selected.push({ ...last, out: outputTime(last.ts, segments) })

  const lines = ["ffconcat version 1.0"]
  for (let i = 0; i < selected.length; i++) {
    const current = selected[i]!
    const nextOut = i + 1 < selected.length ? selected[i + 1]!.out : current.out + 0.7
    const duration = Math.max(1 / 30, nextOut - current.out)
    lines.push(`file '${current.file.replaceAll("\\", "/")}'`, `duration ${duration.toFixed(4)}`)
  }
  await writeFile(`${DIR}\\list.txt`, lines.join("\n") + "\n")

  ffmpeg(["-y", "-f", "concat", "-safe", "0", "-i", `${DIR}\\list.txt`, "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2", "-r", "30", "-c:v", "libx264", "-preset", "slow", "-crf", "21", "-pix_fmt", "yuv420p", "public/showcase.mp4"])

  const posterAt = outputTime(markAt("idle") + 1, buildSegments())
  ffmpeg(["-y", "-i", "public/showcase.mp4", "-ss", posterAt.toFixed(2), "-frames:v", "1", "-update", "1", "-q:v", "3", "public/poster.jpg"])
}

await seedWorkspace()
await clearWorkspaceSessions()
await rm(DIR, { recursive: true, force: true })
await mkdir(`${DIR}\\frames`, { recursive: true })

const pid = await launchEdge()
try {
  const wsUrl = await findPage()
  const cdp = await Cdp.connect(wsUrl)
  await drive(cdp)
  cdp.close()
} finally {
  try {
    process.kill(pid)
  } catch {}
}

await sleep(1000)
await assemble()
console.log(`done: ${frames.length} frames captured`)
