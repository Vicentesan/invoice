import { describe, expect, it } from "@effect/vitest"
import { Schema } from "effect"
import * as Invoice from "./Invoice.ts"
import * as SampleInvoice from "./SampleInvoice.ts"

const SEEDS = Array.from({ length: 40 }, (_, index) => index * 7919 + 1)

describe("SampleInvoice", () => {
  it("gives the same invoice for the same seed", () => {
    expect(SampleInvoice.make("2026-11-27", 42)).toEqual(SampleInvoice.make("2026-11-27", 42))
  })

  it("varies with the seed", () => {
    const numbers = new Set(SEEDS.map((seed) => SampleInvoice.make("2026-11-27", seed).number))

    expect(numbers.size).toBeGreaterThan(20)
  })

  it("always makes an invoice the Schema accepts, filled in and worth something", () => {
    for (const seed of SEEDS) {
      const invoice = SampleInvoice.make("2026-11-27", seed)

      expect(Schema.is(Invoice.Invoice)(invoice)).toBe(true)
      expect(invoice.issueDate).toBe("2026-11-27")
      expect(invoice.items.length).toBeGreaterThanOrEqual(2)
      expect(invoice.from.name).not.toBe("")
      expect(Invoice.paymentRows(invoice.payment).length).toBeGreaterThanOrEqual(3)
      expect(Invoice.totals(invoice).total).toBeGreaterThan(0)
    }
  })
})
