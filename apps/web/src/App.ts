import { Command, Component, Head, UiSchema } from "@effect/ui"
import { Html } from "@effect/ui/html"
import * as Invoice from "@invoice/shared/domain/Invoice"
import * as IsoDate from "@invoice/shared/domain/IsoDate"
import { Clock, Effect, Layer, Option, Schema } from "effect"
import { InvoiceEditor } from "./invoice/components/InvoiceEditor.ts"
import { InvoiceStore } from "./invoice/services/InvoiceStore.ts"

/** The app waits for the saved invoice, then hands it to the editor as its starting point. */
export const AppModel = UiSchema.TaggedEnum({
  Loading: {},
  Ready: { invoice: Invoice.Invoice, today: IsoDate.IsoDate, notice: Schema.NullOr(Schema.String) }
})

export type AppModel = typeof AppModel.Type

export const AppMessage = UiSchema.TaggedEnum({
  SucceededLoadInvoice: { invoice: Invoice.Invoice, today: IsoDate.IsoDate },
  FailedLoadInvoice: { invoice: Invoice.Invoice, today: IsoDate.IsoDate, reason: Schema.String }
})

/**
 * Loads the invoice saved in this browser, or starts a blank one dated today.
 * A saved invoice that can't be read is reported and replaced by a blank one.
 */
export class LoadInvoice extends Command.Service<LoadInvoice>()("invoice/LoadInvoice", {
  success: AppMessage
}) {
  static readonly layer = this.toLayer(
    Effect.gen(function*() {
      const store = yield* InvoiceStore

      return Effect.fnUntraced(function*() {
        const now = yield* Clock.currentTimeMillis
        const today = IsoDate.fromLocalDate(new Date(now))
        const blank = Invoice.empty(today)

        return yield* store.load.pipe(
          Effect.match({
            onSuccess: (saved) =>
              AppMessage.SucceededLoadInvoice({ invoice: Option.getOrElse(saved, () => blank), today }),
            onFailure: (error) => AppMessage.FailedLoadInvoice({ invoice: blank, today, reason: error.reason })
          })
        )
      })
    })
  )
}

export const AppNoDeps = Html.component({
  name: "App",
  model: AppModel,
  message: AppMessage
}).make({
  init: ($) => $.set(AppModel.Loading()).run(LoadInvoice.make()),
  update: {
    SucceededLoadInvoice: (_, { invoice, today }) => AppModel.Ready({ invoice, today, notice: null }),
    FailedLoadInvoice: (_, { invoice, reason, today }) =>
      AppModel.Ready({
        invoice,
        today,
        notice: `The invoice saved in this browser couldn't be read, so this is a blank one. ${reason}`
      })
  },
  // The same title as index.html, which is what a crawler reads before any script runs.
  head: () => [Head.title("Free invoice generator that runs in your browser")],
  view: (h, model) =>
    h.div.children(
      AppModel.match(model, {
        Loading: () => null,
        Ready: ({ invoice, notice, today }) =>
          InvoiceEditor(h, { props: { initialInvoice: invoice, initialNotice: notice, today } })
      })
    )
})

export const App = AppNoDeps.pipe(Component.provide(LoadInvoice.layer.pipe(Layer.provide(InvoiceStore.layer))))
