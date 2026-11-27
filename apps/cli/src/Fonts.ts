import { FontLoadError, InvoiceFonts } from "@invoice/shared/services/InvoiceFonts"
import { Effect, FileSystem, Layer, Path } from "effect"

/** Where the shared package keeps a font file, as a URL the module loader resolves. */
const fontUrl = (name: string): string => import.meta.resolve(`@invoice/shared/fonts/${name}`)

/** Inter read from the shared package's files on disk, once per run. */
export const layer = Layer.effect(
  InvoiceFonts,
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path

    const read = (name: string) =>
      path.fromFileUrl(new URL(fontUrl(name))).pipe(
        Effect.flatMap((file) => fs.readFile(file)),
        Effect.mapError((cause) => new FontLoadError({ url: fontUrl(name), reason: String(cause) }))
      )

    const load = yield* Effect.cached(
      Effect.all({ regular: read("Inter-Regular.ttf"), semiBold: read("Inter-SemiBold.ttf") })
    )

    return InvoiceFonts.of({ load })
  })
)
