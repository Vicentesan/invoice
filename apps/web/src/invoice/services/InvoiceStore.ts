import * as Invoice from "@invoice/shared/domain/Invoice"
import { Context, Effect, Layer, Option } from "effect"
import { Storage, type StorageError } from "./Storage.ts"

export const STORAGE_KEY = "invoice/draft"

/**
 * Keeps the invoice being edited. It is decoded with the invoice Schema on
 * load and encoded with it on save.
 */
export class InvoiceStore extends Context.Service<InvoiceStore, {
  readonly load: Effect.Effect<Option.Option<Invoice.Invoice>, StorageError | Invoice.InvalidInvoice>
  save(invoice: Invoice.Invoice): Effect.Effect<void, StorageError | Invoice.InvalidInvoice>
}>()("app/InvoiceStore") {
  static readonly layerNoDeps = Layer.effect(
    InvoiceStore,
    Effect.gen(function*() {
      const storage = yield* Storage

      return InvoiceStore.of({
        load: storage.get(STORAGE_KEY).pipe(
          Effect.flatMap(Option.match({
            onNone: () => Effect.succeedNone,
            onSome: (json) => Effect.asSome(Invoice.fromJson(json))
          }))
        ),
        save: (invoice) => Invoice.toJson(invoice).pipe(Effect.flatMap((json) => storage.set(STORAGE_KEY, json)))
      })
    })
  )

  static readonly layer = this.layerNoDeps.pipe(Layer.provide(Storage.layerLocalStorage))
}
