import { FontLoadError, InvoiceFonts } from "@invoice/shared/services/InvoiceFonts"
import { Effect, FileSystem, Layer } from "effect"

/**
 * Inter read from the given files, once per run. The paths differ by how the
 * CLI runs: the compiled binary carries the fonts inside it, and the tests
 * read them from the shared package.
 */
export const layerFiles = (files: { readonly regular: string; readonly semiBold: string }) =>
  Layer.effect(
    InvoiceFonts,
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem

      const read = (file: string) =>
        fs.readFile(file).pipe(
          Effect.mapError((cause) => new FontLoadError({ url: file, reason: String(cause) }))
        )

      const load = yield* Effect.cached(Effect.all({ regular: read(files.regular), semiBold: read(files.semiBold) }))

      return InvoiceFonts.of({ load })
    })
  )
