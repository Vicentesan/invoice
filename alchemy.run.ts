import * as Cloudflare from "@alchemy.run/cloudflare"
import * as Alchemy from "alchemy"
import * as Effect from "effect/Effect"

// Only this stage claims the real domain; every other stage stays on its workers.dev URL.
const PRODUCTION_STAGE = "prod"

// The app is a static single page with no server code: `vite build` emits
// the assets and Cloudflare serves them, whatever the path.
const assets = { notFoundHandling: "single-page-application" } as const

export const Website = (stage: string) =>
  stage === PRODUCTION_STAGE
    // The vicente.fyi zone must already exist in the Cloudflare account;
    // Alchemy then manages the DNS record and certificate.
    ? Cloudflare.Website.Vite("Website", { domain: { name: "invoices.vicente.fyi" }, assets })
    : Cloudflare.Website.Vite("Website", { assets })

export default Alchemy.Stack(
  "Invoice",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state({ workerName: "invoice-state" })
  },
  Effect.gen(function*() {
    const stage = yield* Alchemy.Stage
    const site = yield* Website(stage)

    return { url: site.url }
  })
)
