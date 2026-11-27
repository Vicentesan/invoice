import { describe, expect, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import * as Invoice from "./Invoice.ts"

const descriptions = (invoice: Invoice.Invoice) => invoice.items.map((item) => item.description)

const labels = (invoice: Invoice.Invoice) => invoice.payment.map((field) => field.label)

const netDue = (days: Invoice.NetDays) => Invoice.dueDate({ issueDate: "2026-11-30", due: Invoice.Due.Net({ days }) })

const rejects = (json: string) => Schema.decodeUnknownEffect(Invoice.InvoiceFromJson)(json).pipe(Effect.flip)

const sample: Invoice.Invoice = {
  ...Invoice.empty("2026-11-30"),
  number: "INV-0041",
  from: {
    name: "Acme Serviços Ltda",
    addressLines: ["Av. Paulista, 1000", "São Paulo - SP"],
    country: "Brazil",
    taxIdLabel: "CNPJ",
    taxId: "12.345.678/0001-95"
  },
  items: [
    { description: "Consulting", quantity: 7250, unitPrice: 15000 },
    { description: "Hosting", quantity: 1000, unitPrice: 4999 }
  ],
  taxRate: 8875,
  discount: 5000
}

describe("Invoice totals", () => {
  it("sums lines, takes the discount off, then adds tax", () => {
    expect(Invoice.totals(sample)).toEqual({
      lines: [108750, 4999],
      subtotal: 113749,
      discount: 5000,
      tax: 9651,
      total: 118400
    })
  })

  it("is zero for an invoice with no items", () => {
    expect(
      Invoice.totals({ items: [], taxRate: 20000, discount: 0 }).total
    ).toBe(0)
  })
})

describe("Invoice due date", () => {
  it("computes each Net preset from the issue date", () => {
    expect(netDue(15)).toBe("2026-12-15")
    expect(netDue(30)).toBe("2026-12-30")
    expect(netDue(45)).toBe("2027-01-14")
    expect(netDue(60)).toBe("2027-01-29")
  })

  it("uses a custom date as it is", () => {
    expect(
      Invoice.dueDate({
        issueDate: "2026-11-30",
        due: Invoice.Due.Custom({ date: "2026-12-05" })
      })
    ).toBe("2026-12-05")
  })
})

describe("Invoice duplicate for next month", () => {
  it("bumps the number and keeps its zero padding", () => {
    expect(Invoice.nextNumber("INV-0041")).toBe("INV-0042")
    expect(Invoice.nextNumber("INV-0099")).toBe("INV-0100")
    expect(Invoice.nextNumber("9")).toBe("10")
    expect(Invoice.nextNumber("2026/007-A")).toBe("2026/008-A")
    expect(Invoice.nextNumber("draft")).toBe("draft-2")
  })

  it("moves the issue date one month and lets a Net due date follow", () => {
    const next = Invoice.duplicateForNextMonth(sample)
    expect(next.number).toBe("INV-0042")
    expect(next.issueDate).toBe("2026-12-30")
    expect(Invoice.dueDate(next)).toBe("2027-01-29")
    expect({
      ...next,
      number: sample.number,
      issueDate: sample.issueDate
    }).toEqual(sample)
  })

  it("clamps both dates to the month's end", () => {
    const next = Invoice.duplicateForNextMonth({
      ...sample,
      issueDate: "2026-01-31",
      due: Invoice.Due.Custom({ date: "2026-03-31" })
    })

    expect(next.issueDate).toBe("2026-02-28")
    expect(next.due).toEqual(Invoice.Due.Custom({ date: "2026-04-30" }))
  })
})

describe("Invoice schema", () => {
  it.effect("round-trips through JSON", () =>
    Effect.gen(function*() {
      const json = yield* Schema.encodeEffect(Invoice.InvoiceFromJson)(sample)

      const decoded = yield* Schema.decodeUnknownEffect(
        Invoice.InvoiceFromJson
      )(json)

      expect(decoded).toEqual(sample)
      expect(yield* Schema.encodeEffect(Invoice.InvoiceFromJson)(decoded)).toBe(
        json
      )
    }))

  it.effect("rejects fractional money, bad dates and unknown currencies", () =>
    Effect.gen(function*() {
      yield* rejects(JSON.stringify({ ...sample, discount: 10.5 }))
      yield* rejects(
        JSON.stringify({
          ...sample,
          items: [{ description: "x", quantity: 1000, unitPrice: 0.1 }]
        })
      )
      yield* rejects(JSON.stringify({ ...sample, issueDate: "2026-02-30" }))
      yield* rejects(JSON.stringify({ ...sample, currency: "usd" }))
      yield* rejects(
        JSON.stringify({
          ...sample,
          due: { ...Invoice.Due.Net({ days: 30 }), days: 20 }
        })
      )
      yield* rejects(JSON.stringify({ ...sample, pageSize: "A5" }))
      yield* rejects("{not json")
    }))
})

describe("Invoice helpers", () => {
  it("re-expresses amounts when the currency's digits change", () => {
    const yen = Invoice.withCurrency(sample, "JPY")
    expect(yen.items.map((item) => item.unitPrice)).toEqual([150, 50])
    expect(yen.discount).toBe(50)
  })

  it("moves, removes and adds line items", () => {
    expect(descriptions(Invoice.moveItem(sample, 0, 1))).toEqual(["Hosting", "Consulting"])
    expect(descriptions(Invoice.moveItem(sample, 1, -1))).toEqual(["Hosting", "Consulting"])
    expect(Invoice.moveItem(sample, 0, -1)).toEqual(sample)
    expect(Invoice.moveItem(sample, 1, 1)).toEqual(sample)
    expect(descriptions(Invoice.removeItem(sample, 0))).toEqual(["Hosting"])
    expect(Invoice.addItem(sample).items.at(-1)).toEqual(Invoice.emptyLineItem)
    expect(Invoice.withItem(sample, 1, { unitPrice: 1 }).items[1]).toEqual({
      description: "Hosting",
      quantity: 1000,
      unitPrice: 1
    })
  })

  it("lets payment terms follow a Net preset unless they were customised", () => {
    expect(Invoice.withNetDue(sample, 45).paymentTerms).toBe("Net 45")
    expect(Invoice.withNetDue({ ...sample, paymentTerms: "" }, 15).paymentTerms).toBe("Net 15")
    expect(Invoice.withNetDue({ ...sample, paymentTerms: "Due on receipt" }, 60).paymentTerms).toBe("Due on receipt")
  })

  it("prints only the payment fields that were filled in", () => {
    expect(Invoice.paymentRows(sample.payment)).toEqual([])
    expect(
      Invoice.paymentRows([
        { label: "Beneficiary", value: "" },
        { label: " IBAN ", value: " GB82 WEST 1234 5698 7654 32 " },
        { label: "Bank address", value: "1 Main Street, London" },
        { label: "", value: "Quote the invoice number" }
      ])
    ).toEqual([
      { label: "IBAN", value: "GB82 WEST 1234 5698 7654 32", unbreakable: true },
      { label: "Bank address", value: "1 Main Street, London", unbreakable: false },
      { label: "", value: "Quote the invoice number", unbreakable: false }
    ])
  })

  it("treats codes and numbers as identifiers that must not break", () => {
    expect(Invoice.isIdentifier({ label: "Whatever", value: "CHASUS33" })).toBe(true)
    expect(Invoice.isIdentifier({ label: "PIX key", value: "financeiro@acme.com.br" })).toBe(true)
    expect(Invoice.isIdentifier({ label: "Account number", value: "abc-123" })).toBe(true)
    expect(Invoice.isIdentifier({ label: "Beneficiary", value: "Acme Serviços Ltda" })).toBe(false)
  })

  it("adds, edits, moves and removes payment fields", () => {
    const added = Invoice.addPaymentField(sample, "Sort code")

    expect(labels(added)).toEqual(["Beneficiary", "Bank name", "Account number", "SWIFT / BIC", "Sort code"])
    expect(labels(Invoice.movePaymentField(added, 4, -1)).at(3)).toBe("Sort code")
    expect(labels(Invoice.removePaymentField(added, 0))[0]).toBe("Bank name")
    expect(Invoice.withPaymentField(added, 4, { value: "40-47-84" }).payment[4]).toEqual({
      label: "Sort code",
      value: "40-47-84"
    })
  })

  it("names downloads after the invoice number", () => {
    expect(Invoice.fileName({ number: "INV-0041" }, "pdf")).toBe(
      "invoice-INV-0041.pdf"
    )
    expect(Invoice.fileName({ number: "2026/007 A" }, "pdf")).toBe(
      "invoice-2026-007-A.pdf"
    )
    expect(Invoice.fileName({ number: "  " }, "json")).toBe(
      "invoice-draft.json"
    )
  })
})
