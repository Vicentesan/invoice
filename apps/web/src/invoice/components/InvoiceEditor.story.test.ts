import { Component } from "@effect/ui"
import { Story } from "@effect/ui/testing"
import { describe, expect, it } from "@effect/vitest"
import * as Invoice from "@invoice/shared/domain/Invoice"
import * as SampleInvoice from "@invoice/shared/domain/SampleInvoice"
import { DateTime, Effect, Option } from "effect"
import {
  CopyExport,
  DownloadPdf,
  DrawSeed,
  ExportJson,
  InvoiceEditorMessage,
  InvoiceEditorNoDeps,
  ParseImport,
  ReadImport,
  SaveInvoice
} from "./InvoiceEditor.ts"

const initialInvoice: Invoice.Invoice = {
  ...Invoice.empty("2026-01-31"),
  number: "INV-0009",
  items: [
    { description: "Consulting", quantity: 1000, unitPrice: 150000 },
    { description: "Hosting", quantity: 2000, unitPrice: 4999 }
  ]
}

const props = { initialInvoice, initialNotice: null, today: "2026-02-10" }

describe("InvoiceEditor", () => {
  it.effect("turns a typed unit price into minor units as it parses", () =>
    Effect.gen(function*() {
      const s = yield* Story.make(InvoiceEditorNoDeps, props)

      s.send(InvoiceEditorMessage.UpdatedItemUnitPrice({ index: 1, value: "12.5" }))
      expect(s.model.invoice.items[1]?.unitPrice).toBe(1250)
      expect(s.model.draft).toEqual({ field: "items.1.unitPrice", text: "12.5", valid: true })
      expect(Invoice.totals(s.model.invoice).total).toBe(152500)

      // Text that doesn't parse waits in the draft and leaves the invoice alone.
      s.send(InvoiceEditorMessage.UpdatedItemUnitPrice({ index: 1, value: "12.5x" }))
      expect(s.model.invoice.items[1]?.unitPrice).toBe(1250)
      expect(s.model.draft?.valid).toBe(false)

      s.send(InvoiceEditorMessage.BlurredDraft())
      expect(s.model.draft).toBeNull()
    }))

  it.effect("reads quantity, tax and discount as fixed-point numbers", () =>
    Effect.gen(function*() {
      const s = yield* Story.make(InvoiceEditorNoDeps, props)

      s.send(InvoiceEditorMessage.UpdatedItemQuantity({ index: 0, value: "7.25" }))
        .send(InvoiceEditorMessage.UpdatedTaxRate({ value: "8.875" }))
        .send(InvoiceEditorMessage.UpdatedDiscount({ value: "50" }))
      expect(s.model.invoice.items[0]?.quantity).toBe(7250)
      expect(s.model.invoice.taxRate).toBe(8875)
      expect(s.model.invoice.discount).toBe(5000)

      // Emptying an optional amount clears it; a rate above 100% is refused.
      s.send(InvoiceEditorMessage.UpdatedDiscount({ value: "" }))
        .send(InvoiceEditorMessage.UpdatedTaxRate({ value: "120" }))
      expect(s.model.invoice.discount).toBe(0)
      expect(s.model.invoice.taxRate).toBe(8875)
    }))

  it.effect("autosaves once edits settle and records what was saved", () =>
    Effect.gen(function*() {
      const s = yield* Story.make(InvoiceEditorNoDeps, props)

      expect(s.subscriptions).toEqual([])
      s.send(InvoiceEditorMessage.UpdatedText({ field: "notes", value: "Thank you" }))
      expect(s.subscriptions).toEqual(["autosave:1"])

      s.send(InvoiceEditorMessage.RequestedSave())
        .expectExact(SaveInvoice.make({ invoice: { ...initialInvoice, notes: "Thank you" }, edits: 1 }))
        .resolve(SaveInvoice, InvoiceEditorMessage.SucceededSaveInvoice({ edits: 1 }))
      expect(s.model.savedEdits).toBe(1)
      expect(s.subscriptions).toEqual([])
    }))

  it.effect("duplicates for next month with a bumped number and clamped dates", () =>
    Effect.gen(function*() {
      const s = yield* Story.make(InvoiceEditorNoDeps, props)

      s.send(InvoiceEditorMessage.ClickedDuplicate())
      expect(s.model.invoice).toEqual({ ...initialInvoice, number: "INV-0010", issueDate: "2026-02-28" })
      expect(Invoice.dueDate(s.model.invoice)).toBe("2026-03-30")
    }))

  it.effect("follows a due preset and switches to a custom date when one is typed", () =>
    Effect.gen(function*() {
      const s = yield* Story.make(InvoiceEditorNoDeps, props)

      s.send(InvoiceEditorMessage.PickedDueTerms({ value: "45" }))
      expect(s.model.invoice.due).toEqual(Invoice.Due.Net({ days: 45 }))
      expect(s.model.invoice.paymentTerms).toBe("Net 45")
      expect(Invoice.dueDate(s.model.invoice)).toBe("2026-03-17")

      // Opening a calendar shows the month of the date it edits.
      s.send(InvoiceEditorMessage.RequestedOpenPopup({ popup: "dueDate" }))
      expect(s.model.popup).toBe("dueDate")
      expect(DateTime.formatIsoDateUtc(s.model.calendarMonth)).toBe("2026-03-01")

      s.send(InvoiceEditorMessage.PickedDate({ field: "dueDate", date: DateTime.makeUnsafe("2026-04-01T00:00:00Z") }))
        .send(InvoiceEditorMessage.RequestedClosePopup({ popup: "dueDate" }))
      expect(s.model.invoice.due).toEqual(Invoice.Due.Custom({ date: "2026-04-01" }))
      expect(s.model.popup).toBeNull()

      // A cleared date field keeps the date it had.
      s.send(InvoiceEditorMessage.PickedDate({ field: "dueDate", date: null }))
      expect(s.model.invoice.due).toEqual(Invoice.Due.Custom({ date: "2026-04-01" }))

      s.send(InvoiceEditorMessage.PickedDate({ field: "issueDate", date: DateTime.makeUnsafe("2026-03-15T00:00:00Z") }))
      expect(s.model.invoice.issueDate).toBe("2026-03-15")
    }))

  it.effect("builds payment instructions from fields the user names", () =>
    Effect.gen(function*() {
      const s = yield* Story.make(InvoiceEditorNoDeps, props)

      s.send(InvoiceEditorMessage.RequestedOpenPopup({ popup: "paymentLabels" }))
        .send(InvoiceEditorMessage.PickedPaymentLabel({ label: "Sort code" }))
        .send(InvoiceEditorMessage.UpdatedPaymentValue({ index: 4, value: "40-47-84" }))
        .send(InvoiceEditorMessage.PickedPaymentLabel({ label: "" }))
        .send(InvoiceEditorMessage.UpdatedPaymentLabel({ index: 5, value: "PIX key" }))
        .send(InvoiceEditorMessage.UpdatedPaymentValue({ index: 5, value: "financeiro@acme.com.br" }))
        .send(InvoiceEditorMessage.ClickedMovePaymentFieldUp({ index: 5 }))
        .send(InvoiceEditorMessage.ClickedRemovePaymentField({ index: 0 }))
      expect(s.model.popup).toBeNull()
      expect(Invoice.paymentRows(s.model.invoice.payment)).toEqual([
        { label: "PIX key", value: "financeiro@acme.com.br", unbreakable: true },
        { label: "Sort code", value: "40-47-84", unbreakable: true }
      ])
    }))

  it.effect("keeps displayed amounts when the currency's minor units change", () =>
    Effect.gen(function*() {
      const s = yield* Story.make(InvoiceEditorNoDeps, props)

      s.send(InvoiceEditorMessage.UpdatedCurrency({ value: "jp" }))
      expect(s.model.invoice.currency).toBe("USD")

      s.send(InvoiceEditorMessage.UpdatedCurrency({ value: "jpy" }))
      expect(s.model.invoice.currency).toBe("JPY")
      expect(s.model.invoice.items.map((item) => item.unitPrice)).toEqual([1500, 50])
    }))

  it.effect("adds, reorders and removes line items", () =>
    Effect.gen(function*() {
      const s = yield* Story.make(InvoiceEditorNoDeps, props)

      s.send(InvoiceEditorMessage.ClickedAddItem())
        .send(InvoiceEditorMessage.UpdatedItemDescription({ index: 2, value: "Support" }))
        .send(InvoiceEditorMessage.ClickedMoveItemUp({ index: 2 }))
        .send(InvoiceEditorMessage.ClickedRemoveItem({ index: 0 }))
        .send(InvoiceEditorMessage.ClickedMoveItemDown({ index: 0 }))
      expect(s.model.invoice.items.map((item) => item.description)).toEqual(["Hosting", "Support"])
    }))

  it.effect("imports pasted JSON through the Schema and reports text it can't read", () =>
    Effect.gen(function*() {
      const s = yield* Story.make(InvoiceEditorNoDeps, props)
      const imported = { ...initialInvoice, number: "INV-0100" }

      s.send(InvoiceEditorMessage.ClickedImportJson())
        .send(InvoiceEditorMessage.UpdatedImportText({ value: "{}" }))
        .send(InvoiceEditorMessage.SubmittedImport())
        .expectExact(ParseImport.make({ json: "{}" }))
        .resolve(ParseImport, InvoiceEditorMessage.FailedReadImport({ name: "The pasted text", reason: "Missing key" }))
      expect(s.model.dialog).toBe("import")
      expect(s.model.dialogError).toBe("The pasted text isn't an invoice this app can open. Missing key")
      expect(s.model.invoice).toEqual(initialInvoice)

      // Typing again clears the error; a valid invoice replaces the one on screen and closes the dialog.
      s.send(InvoiceEditorMessage.UpdatedImportText({ value: "{…}" }))
      expect(s.model.dialogError).toBeNull()

      s.send(InvoiceEditorMessage.SubmittedImport())
        .resolve(ParseImport, InvoiceEditorMessage.SucceededReadImport({ invoice: imported }))
      expect(s.model.invoice).toEqual(imported)
      expect(s.model.dialog).toBeNull()
      expect(s.model.importText).toBe("")
    }))

  it.effect("imports a JSON file chosen in the dialog", () =>
    Effect.gen(function*() {
      const s = yield* Story.make(InvoiceEditorNoDeps, props)
      const file = new File(["{}"], "broken.json", { type: "application/json" })

      s.send(InvoiceEditorMessage.ClickedImportJson())
        .send(InvoiceEditorMessage.ChoseImportFiles({ files: [file] }))
        .expectExact(ReadImport.make({ file }))
        .resolve(ReadImport, InvoiceEditorMessage.FailedReadImport({ name: "broken.json", reason: "Missing key" }))
      expect(s.model.dialogError).toBe("broken.json isn't an invoice this app can open. Missing key")
    }))

  it.effect("shows the invoice as JSON to copy or save to a file", () =>
    Effect.gen(function*() {
      const s = yield* Story.make(InvoiceEditorNoDeps, props)
      const json = Option.getOrThrow(Invoice.toJsonText(initialInvoice))

      s.send(InvoiceEditorMessage.ClickedExportJson())
      expect(s.model.dialog).toBe("export")

      s.send(InvoiceEditorMessage.ClickedCopyExport())
        .expectExact(CopyExport.make({ json }))
        .resolve(CopyExport, InvoiceEditorMessage.SucceededCopyExport())
      expect(s.model.copied).toBe(true)

      s.send(InvoiceEditorMessage.ClickedDownloadExport()).expectExact(ExportJson.make({ invoice: initialInvoice }))
        .resolve(ExportJson, Component.noop)
      s.send(InvoiceEditorMessage.RequestedCloseDialog())
      expect(s.model.dialog).toBeNull()
    }))

  it.effect("fills in sample data in a demo mode that saves nothing and gives the invoice back", () =>
    Effect.gen(function*() {
      const s = yield* Story.make(InvoiceEditorNoDeps, props)

      s.send(InvoiceEditorMessage.ClickedSampleData())
        .expectExact(DrawSeed.make())
        .resolve(DrawSeed, InvoiceEditorMessage.CompletedDrawSeed({ seed: 7 }))
      expect(s.model.invoice).toEqual(SampleInvoice.make("2026-02-10", 7))
      expect(s.model.demo).toEqual({ own: initialInvoice })
      // Edits in demo mode never reach storage.
      s.send(InvoiceEditorMessage.UpdatedText({ field: "notes", value: "Just trying it" }))
      expect(s.subscriptions).toEqual([])

      // Pressing the button again leaves demo mode and puts the invoice back.
      s.send(InvoiceEditorMessage.ClickedSampleData())
      expect(s.model.invoice).toEqual(initialInvoice)
      expect(s.model.demo).toBeNull()

      // The banner's link does the same.
      s.send(InvoiceEditorMessage.ClickedSampleData())
        .resolve(DrawSeed, InvoiceEditorMessage.CompletedDrawSeed({ seed: 8 }))
      expect(s.model.demo).toEqual({ own: initialInvoice })

      s.send(InvoiceEditorMessage.ClickedExitDemo())
      expect(s.model.invoice).toEqual(initialInvoice)
      expect(s.model.demo).toBeNull()
    }))

  it.effect("downloads the PDF of the invoice as it stands", () =>
    Effect.gen(function*() {
      const s = yield* Story.make(InvoiceEditorNoDeps, props)

      s.send(InvoiceEditorMessage.ClickedDownloadPdf())
        .expectExact(DownloadPdf.make({ invoice: initialInvoice }))
        .resolve(DownloadPdf, InvoiceEditorMessage.FailedDownloadPdf({ reason: "No font" }))
      expect(s.model.notice).toBe("No font")
    }))
})
