import { staticFile } from "remotion"

const FONT = '"Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif'

function Logo({ size, color }: { size: number; color: string }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        background: color,
        WebkitMaskImage: `url(${staticFile("drift-logo.svg")})`,
        WebkitMaskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        WebkitMaskSize: "contain",
        maskImage: `url(${staticFile("drift-logo.svg")})`,
        maskRepeat: "no-repeat",
        maskPosition: "center",
        maskSize: "contain",
      }}
    />
  )
}

export function OgCard() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 64,
        fontFamily: FONT,
        background: "linear-gradient(120deg, #10161f 40%, #1d3550 75%, #52577f 100%)",
      }}
    >
      <Logo size={220} color="#8fd9fb" />
      <div>
        <div style={{ fontSize: 110, fontWeight: 700, letterSpacing: 2, color: "#eef3f8", lineHeight: 1 }}>Drift</div>
        <div style={{ marginTop: 18, fontSize: 34, color: "#a3b1c2", maxWidth: 640 }}>
          A focused Windows desktop for coding with AI agents
        </div>
        <div
          style={{
            display: "inline-block",
            marginTop: 34,
            padding: "12px 34px",
            borderRadius: 999,
            background: "linear-gradient(120deg, #8fd9fb, #b8ecff)",
            color: "#0d1420",
            fontSize: 26,
            fontWeight: 700,
          }}
        >
          Free on Windows
        </div>
      </div>
    </div>
  )
}
