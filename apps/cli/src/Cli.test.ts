import { NodeServices } from "@effect/platform-node"
import { describe, expect, it } from "@effect/vitest"
import * as Invoice from "@invoice/shared/domain/Invoice"
import * as SampleInvoice from "@invoice/shared/domain/SampleInvoice"
import { PdfRenderer } from "@invoice/shared/services/PdfRenderer"
import { Effect, FileSystem, Layer, Path } from "effect"
import { Command } from "effect/cli"
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs"
import { cli, InvoiceCliError, version } from "./Cli.ts"
import { layer as fonts } from "./Fonts.ts"

const services = PdfRenderer.layer.pipe(Layer.provide(fonts), Layer.provideMerge(NodeServices.layer))

const run = Command.runWith(cli, { version })

/** The text of the first page, one line per text run. */
const firstPageText = (bytes: Uint8Array) =>
  Effect.promise(async () => {
    // The file system hands back a Buffer, which pdf.js refuses; this copies it into a plain Uint8Array.
    const loading = getDocument({ data: new Uint8Array(bytes) })
    const page = await (await loading.promise).getPage(1)
    const content = await page.getTextContent()

    await loading.destroy()

    return content.items.flatMap((item) => "str" in item ? [item.str] : [])
  })

describe("invoice CLI", () => {
  it.effect("writes a sample invoice and renders it to a PDF", () =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const directory = yield* fs.makeTempDirectoryScoped()
      const json = path.join(directory, "invoice.json")
      const pdf = path.join(directory, "out.pdf")

      yield* run(["sample", "--seed", "7", "--output", json])

      const invoice = yield* Invoice.fromJson(yield* fs.readFileString(json))

      expect({ ...invoice, issueDate: "2026-11-27" }).toEqual(SampleInvoice.make("2026-11-27", 7))

      yield* run(["render", json, "--output", pdf, "--page-size", "Letter"])

      const lines = yield* firstPageText(yield* fs.readFile(pdf))

      expect(lines).toContain(invoice.number)
      expect(lines).toContain(invoice.from.name)
    }).pipe(Effect.provide(services)))

  it.effect("fails with one sentence when the file isn't an invoice", () =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const json = path.join(yield* fs.makeTempDirectoryScoped(), "bad.json")

      yield* fs.writeFileString(json, "{\"number\": 1}")

      const error = yield* Effect.flip(run(["render", json]))

      expect(error).toBeInstanceOf(InvoiceCliError)
      expect(error.message).toContain("isn't a valid invoice")
    }).pipe(Effect.provide(services)))

  it.effect("fails with one sentence when the file is missing", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(run(["render", "no-such-file.json"]))

      expect(error.message).toContain("Couldn't read no-such-file.json")
    }).pipe(Effect.provide(services)))
})
