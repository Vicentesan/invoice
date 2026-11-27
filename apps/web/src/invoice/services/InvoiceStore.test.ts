import { describe, expect, it } from "@effect/vitest"
import * as Invoice from "@invoice/shared/domain/Invoice"
import { Effect, Layer, Option } from "effect"
import { InvoiceStore, STORAGE_KEY } from "./InvoiceStore.ts"
import { Storage } from "./Storage.ts"

const invoice: Invoice.Invoice = { ...Invoice.empty("2026-11-27"), number: "INV-0007", notes: "Thank you" }

const withStorage = (seed?: ReadonlyMap<string, string>) =>
  InvoiceStore.layerNoDeps.pipe(Layer.provideMerge(Storage.layerMemory(seed)))

describe("InvoiceStore", () => {
  it.effect("has nothing to load before the first save", () =>
    Effect.gen(function*() {
      const store = yield* InvoiceStore

      expect(yield* store.load).toEqual(Option.none())
    }).pipe(Effect.provide(withStorage())))

  it.effect("loads what it saved, through the Schema both ways", () =>
    Effect.gen(function*() {
      const store = yield* InvoiceStore
      const storage = yield* Storage

      yield* store.save(invoice)

      expect(yield* store.load).toEqual(Option.some(invoice))
      expect(Option.map(yield* storage.get(STORAGE_KEY), JSON.parse)).toEqual(Option.some(invoice))
    }).pipe(Effect.provide(withStorage())))

  it.effect("fails with InvalidInvoice when the stored JSON isn't an invoice", () =>
    Effect.gen(function*() {
      const store = yield* InvoiceStore
      const error = yield* Effect.flip(store.load)

      expect(error).toBeInstanceOf(Invoice.InvalidInvoice)
    }).pipe(Effect.provide(withStorage(new Map([[STORAGE_KEY, "{\"number\": 7}"]])))))
})
