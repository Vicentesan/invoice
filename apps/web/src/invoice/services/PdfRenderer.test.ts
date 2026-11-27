import * as Invoice from "#domain/Invoice"
import * as Money from "#domain/Money"
import * as SampleInvoice from "#domain/SampleInvoice"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { readFile } from "node:fs/promises"
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs"
import { InvoiceFonts } from "./InvoiceFonts.ts"
import { PdfRenderer, PdfRenderFailure } from "./PdfRenderer.ts"

const fontFile = (name: string) =>
  Effect.promise(() => readFile(new URL(`../../assets/fonts/${name}`, import.meta.url))).pipe(
    Effect.map((buffer) => new Uint8Array(buffer))
  )

const fontsFromDisk = Layer.succeed(
  InvoiceFonts,
  InvoiceFonts.of({
    load: Effect.all({ regular: fontFile("Inter-Regular.ttf"), semiBold: fontFile("Inter-SemiBold.ttf") })
  })
)

const layer = PdfRenderer.layerNoDeps.pipe(Layer.provide(fontsFromDisk))

/** The text of every page, as a PDF reader's copy would give it: one line per text run. */
const extractText = (bytes: Uint8Array) =>
  Effect.promise(async () => {
    const loading = getDocument({ data: bytes.slice() })
    const pdf = await loading.promise

    const pages = await Promise.all(
      Array.from({ length: pdf.numPages }, async (_, index) => {
        const page = await pdf.getPage(index + 1)
        const content = await page.getTextContent()

        return content.items.flatMap((item) => "str" in item ? [item.str] : []).join("\n")
      })
    )

    await loading.destroy()

    return pages
  })

const IBAN = "DE89 3704 0044 0532 0130 00"
const SWIFT = "COBADEFFXXX"
const INTERMEDIARY_SWIFT = "CHASUS33"
const CNPJ = "12.345.678/0001-95"

const invoice: Invoice.Invoice = {
  ...Invoice.empty("2026-11-30"),
  number: "INV-0041",
  from: {
    name: "Acme Serviços Ltda",
    addressLines: ["Av. Paulista, 1000 - Bela Vista", "São Paulo - SP, 01310-100"],
    country: "Brazil",
    taxIdLabel: "CNPJ",
    taxId: CNPJ
  },
  billTo: {
    name: "Globex GmbH",
    addressLines: ["Friedrichstraße 123", "10117 Berlin"],
    country: "Germany",
    taxIdLabel: "VAT",
    taxId: "DE123456789"
  },
  items: [
    { description: "Office fit-out (fixed fee -> final)", quantity: 1000, unitPrice: 1234500 },
    { description: "On-call support, 10x5 coverage", quantity: 7250, unitPrice: 15000 },
    { description: "", quantity: 1000, unitPrice: 0 }
  ],
  taxRate: 8875,
  discount: 5000,
  payment: [
    { label: "Beneficiary", value: "Acme Serviços Ltda" },
    { label: "IBAN", value: IBAN },
    { label: "Routing / ABA", value: "" },
    { label: "Bank name", value: "Commerzbank AG" },
    { label: "SWIFT / BIC", value: SWIFT },
    { label: "Bank address", value: "Kaiserplatz, 60311 Frankfurt am Main" },
    { label: "Intermediary bank", value: "  " },
    { label: "Intermediary SWIFT / BIC", value: INTERMEDIARY_SWIFT },
    { label: "PIX key", value: "financeiro@acme.com.br" }
  ],
  notes: "Thank you for your business.\nPlease quote the invoice number with your payment."
}

describe("PdfRenderer", () => {
  it.effect("embeds text that copies out exactly", () =>
    Effect.gen(function*() {
      const renderer = yield* PdfRenderer
      const [text = ""] = yield* extractText(yield* renderer.render(invoice))
      const lines = text.split("\n")
      const total = Money.format(Invoice.totals(invoice).total, "USD")

      expect(total).toBe("$14,570.20")
      expect(lines).toContain(IBAN)
      expect(lines).toContain(SWIFT)
      expect(lines).toContain(INTERMEDIARY_SWIFT)
      expect(lines).toContain(total)
      expect(lines).toContain(`CNPJ: ${CNPJ}`)
      expect(lines).toContain("INV-0041")
      expect(lines).toContain("30 Nov 2026")
      expect(lines).toContain("30 Dec 2026")
      expect(lines).toContain("Acme Serviços Ltda")
      expect(lines).toContain("Friedrichstraße 123")
      // Ligatures and contextual alternates would turn "fi", "->" and "10x5" into other glyphs.
      expect(lines).toContain("Office fit-out (fixed fee -> final)")
      expect(lines).toContain("On-call support, 10x5 coverage")
      expect(lines).toContain("7.25")
      expect(lines).toContain("Tax (8.875%)")
      expect(lines).toContain("-$50.00")
    }).pipe(Effect.provide(layer)))

  it.effect("leaves out payment fields that are empty", () =>
    Effect.gen(function*() {
      const renderer = yield* PdfRenderer
      const [text = ""] = yield* extractText(yield* renderer.render(invoice))

      expect(text).toContain("PAYMENT INSTRUCTIONS")
      expect(text).toContain("NOTES")
      expect(text).toContain("SWIFT / BIC")
      expect(text).toContain("Intermediary SWIFT / BIC")
      expect(text).not.toContain("Routing / ABA")
      expect(text).not.toContain("Intermediary bank")
      expect(text).toContain("PIX key")

      const bare = yield* extractText(
        yield* renderer.render({ ...invoice, payment: [], notes: "" })
      )

      expect(bare[0]).not.toContain("PAYMENT INSTRUCTIONS")
      expect(bare[0]).not.toContain("NOTES")
    }).pipe(Effect.provide(layer)))

  it.effect("keeps a long IBAN on one line in a narrow page", () =>
    Effect.gen(function*() {
      const renderer = yield* PdfRenderer
      const iban = "MT84 MALT 0110 0001 2345 MTLC AST0 01S"

      const [text = ""] = yield* extractText(
        yield* renderer.render({ ...invoice, pageSize: "Letter", payment: [{ label: "IBAN", value: iban }] })
      )

      expect(text.split("\n")).toContain(iban)
    }).pipe(Effect.provide(layer)))

  it.effect("flows many line items onto further pages", () =>
    Effect.gen(function*() {
      const renderer = yield* PdfRenderer

      const items = Array.from({ length: 80 }, (_, index) => ({
        description: `Line ${index + 1}`,
        quantity: 1000,
        unitPrice: 100
      }))

      const pages = yield* extractText(yield* renderer.render({ ...invoice, items }))

      expect(pages.length).toBeGreaterThan(1)
      expect(pages.join("\n")).toContain("Line 80")
      expect(pages.at(-1)).toContain(`Page ${pages.length} of ${pages.length}`)
    }).pipe(Effect.provide(layer)))

  it.effect("renders every sample invoice", () =>
    Effect.gen(function*() {
      const renderer = yield* PdfRenderer

      for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
        const sample = SampleInvoice.make("2026-11-27", seed)
        const [text = ""] = yield* extractText(yield* renderer.render(sample))

        expect(text.split("\n")).toContain(sample.number)
      }
    }).pipe(Effect.provide(layer)))

  it.effect("fails with the characters Inter can't draw", () =>
    Effect.gen(function*() {
      const renderer = yield* PdfRenderer
      const error = yield* Effect.flip(renderer.render({ ...invoice, notes: "株式会社 Globex" }))

      expect(error.failure).toEqual(PdfRenderFailure.UnsupportedCharacters({ characters: ["株", "式", "会", "社"] }))
    }).pipe(Effect.provide(layer)))
})
