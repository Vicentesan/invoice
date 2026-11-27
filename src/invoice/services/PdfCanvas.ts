import { Context, Effect, Layer, Schema } from "effect"

export class PdfCanvasError extends Schema.TaggedError<PdfCanvasError>()("PdfCanvasError", {
  reason: Schema.String
}) {
  /** A sentence for the person editing the invoice. */
  get explanation(): string {
    return `The preview couldn't be drawn: ${this.reason}`
  }
}

/**
 * pdf.js and its parser load on first use, in a chunk of their own. With the
 * parser module already on `globalThis.pdfjsWorker`, pdf.js runs it on the
 * main thread instead of fetching a worker script.
 */
const loadPdfjs = Effect.tryPromise({
  try: async () => {
    const [pdfjs, pdfjsWorker] = await Promise.all([
      import("pdfjs-dist"),
      import("pdfjs-dist/build/pdf.worker.mjs")
    ])

    Object.assign(globalThis, { pdfjsWorker })

    return pdfjs
  },
  catch: (cause) => new PdfCanvasError({ reason: String(cause) })
})

/** The most pixels one page's canvas may hold, which bounds its memory when the page is zoomed far in. */
const MAX_CANVAS_PIXELS = 24_000_000

/** Paints a PDF's pages as canvases, the way a PDF reader shows them. */
export class PdfCanvas extends Context.Service<PdfCanvas, {
  /** Replaces the container's content with one canvas per page and returns the page count. */
  draw(container: HTMLElement, pdf: Uint8Array): Effect.Effect<number, PdfCanvasError>
}>()("app/PdfCanvas") {
  static readonly layer = Layer.effect(
    PdfCanvas,
    Effect.gen(function*() {
      const load = yield* Effect.cached(loadPdfjs)

      const draw = Effect.fn("PdfCanvas.draw")(function*(container: HTMLElement, pdf: Uint8Array) {
        const pdfjs = yield* load

        return yield* Effect.tryPromise({
          try: async () => {
            // pdf.js takes ownership of the bytes it is given.
            const loading = pdfjs.getDocument({ data: pdf.slice(), verbosity: 0 })

            try {
              const document = await loading.promise
              const cssWidth = container.clientWidth === 0 ? 640 : container.clientWidth
              const zoom = globalThis.visualViewport === null ? 1 : globalThis.visualViewport.scale
              // Twice the CSS size at least, and more when the page is zoomed in, so text stays sharp.
              const wanted = Math.max(2, Math.ceil(globalThis.devicePixelRatio * zoom))

              const canvases = await Promise.all(
                Array.from({ length: document.numPages }, async (_, index) => {
                  const page = await document.getPage(index + 1)
                  const natural = page.getViewport({ scale: 1 })
                  const cssHeight = cssWidth * natural.height / natural.width

                  const pixelRatio = Math.min(
                    wanted,
                    Math.max(1, Math.sqrt(MAX_CANVAS_PIXELS / (cssWidth * cssHeight)))
                  )

                  const viewport = page.getViewport({ scale: cssWidth / natural.width * pixelRatio })
                  const canvas = container.ownerDocument.createElement("canvas")

                  canvas.width = Math.round(viewport.width)
                  canvas.height = Math.round(viewport.height)
                  canvas.style.aspectRatio = `${natural.width} / ${natural.height}`
                  await page.render({ canvas, viewport }).promise

                  return canvas
                })
              )

              container.replaceChildren(...canvases)

              return canvases.length
            } finally {
              await loading.destroy()
            }
          },
          catch: (cause) => new PdfCanvasError({ reason: String(cause) })
        })
      })

      return PdfCanvas.of({ draw })
    })
  )
}
