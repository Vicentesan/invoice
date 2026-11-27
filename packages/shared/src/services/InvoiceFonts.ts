import { Context, Effect, Layer, Schema } from "effect"

export class FontLoadError extends Schema.TaggedError<FontLoadError>()("FontLoadError", {
  url: Schema.String,
  reason: Schema.String
}) {}

export interface FontFiles {
  readonly regular: Uint8Array
  readonly semiBold: Uint8Array
}

const fetchFont = (url: string): Effect.Effect<Uint8Array, FontLoadError> =>
  Effect.tryPromise({
    try: async (signal) => {
      const response = await fetch(url, { signal })

      if (!response.ok) throw new Error(`HTTP ${response.status}`)

      return new Uint8Array(await response.arrayBuffer())
    },
    catch: (cause) => new FontLoadError({ url, reason: String(cause) })
  })

/** The Inter font files that every PDF embeds. */
export class InvoiceFonts extends Context.Service<InvoiceFonts, {
  readonly load: Effect.Effect<FontFiles, FontLoadError>
}>()("app/InvoiceFonts") {
  /** Fetches the two files once and keeps them for later renders. */
  static readonly layerFetch = (urls: { readonly regular: string; readonly semiBold: string }) =>
    Layer.effect(
      InvoiceFonts,
      Effect.gen(function*() {
        const load = yield* Effect.cached(
          Effect.all({ regular: fetchFont(urls.regular), semiBold: fetchFont(urls.semiBold) }, {
            concurrency: 2
          })
        )

        return InvoiceFonts.of({ load })
      })
    )
}
