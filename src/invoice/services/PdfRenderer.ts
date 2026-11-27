import type { Invoice } from "#domain/Invoice"
import { UiSchema } from "@effect/ui"
import { Context, Effect, Layer, Schema } from "effect"
import { InvoiceFonts } from "./InvoiceFonts.ts"
import { layer as bundledFonts } from "./InvoiceFontsBundled.ts"

export const PdfRenderFailure = UiSchema.TaggedEnum({
  /** The Inter font files couldn't be loaded. */
  FontsUnavailable: { detail: Schema.String },
  /** The invoice has characters Inter has no glyph for, listed once each. */
  UnsupportedCharacters: { characters: Schema.Array(Schema.String) },
  /** Building the document failed. */
  DocumentFailed: { detail: Schema.String }
})

export type PdfRenderFailure = typeof PdfRenderFailure.Type

export class PdfRenderError extends Schema.TaggedError<PdfRenderError>()("PdfRenderError", {
  failure: PdfRenderFailure
}) {
  /** A sentence for the person editing the invoice. */
  get explanation(): string {
    return PdfRenderFailure.match(this.failure, {
      FontsUnavailable: () => "The invoice font couldn't be loaded. Check your connection and reload.",
      UnsupportedCharacters: ({ characters }) =>
        `The Inter font has no glyph for: ${characters.join(" ")}. Remove these characters to render the PDF.`,
      DocumentFailed: ({ detail }) => `The PDF couldn't be built: ${detail}`
    })
  }
}

/** Renders an invoice to PDF bytes, with Inter embedded. */
export class PdfRenderer extends Context.Service<PdfRenderer, {
  render(invoice: Invoice): Effect.Effect<Uint8Array, PdfRenderError>
}>()("app/PdfRenderer") {
  static readonly layerNoDeps = Layer.effect(
    PdfRenderer,
    Effect.gen(function*() {
      const fonts = yield* InvoiceFonts

      const render = Effect.fn("PdfRenderer.render")(function*(invoice: Invoice) {
        const files = yield* fonts.load.pipe(
          Effect.mapError((error) =>
            new PdfRenderError({ failure: PdfRenderFailure.FontsUnavailable({ detail: error.reason }) })
          )
        )

        const { bytes, unsupported } = yield* Effect.tryPromise({
          // pdf-lib and the layout load on the first render, in a chunk of their own.
          try: async () => {
            const { buildDocument } = await import("../pdf/buildDocument.ts")

            return buildDocument(files, invoice)
          },
          catch: (cause) => new PdfRenderError({ failure: PdfRenderFailure.DocumentFailed({ detail: String(cause) }) })
        })

        if (unsupported.length > 0) {
          return yield* new PdfRenderError({
            failure: PdfRenderFailure.UnsupportedCharacters({ characters: unsupported })
          })
        }

        return bytes
      })

      return PdfRenderer.of({ render })
    })
  )

  static readonly layer = this.layerNoDeps.pipe(Layer.provide(bundledFonts))
}
