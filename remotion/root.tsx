import { Composition } from "remotion"
import { OgCard } from "./scenes/og-card"

export function RemotionRoot() {
  return <Composition id="OgCard" component={OgCard} durationInFrames={1} fps={30} width={1200} height={630} />
}
