import * as Decimal from "#domain/Decimal"
import * as Invoice from "#domain/Invoice"
import * as IsoDate from "#domain/IsoDate"
import * as Money from "#domain/Money"
import { Command, Component, Mount, Subscription, UiSchema } from "@effect/ui"
import { DatePicker, Select } from "@effect/ui-kit"
import { Html, HtmlFiles, HtmlSubscription } from "@effect/ui/html"
import { DateTime, Effect, Layer, Option, Schema, Stream } from "effect"
import { CONTROL, Field, FieldGroup, ROW, Section } from "../../components/Field.ts"
import {
  CalendarIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  CloseIcon,
  PlusIcon
} from "../../components/Icon.ts"
import { InvoiceStore } from "../services/InvoiceStore.ts"
import { PdfCanvas } from "../services/PdfCanvas.ts"
import { PdfRenderer } from "../services/PdfRenderer.ts"

const TextField = Schema.Literals(["number", "paymentTerms", "notes"])
const PartyKey = Schema.Literals(["from", "billTo"])
const PartyField = Schema.Literals(["name", "country", "taxIdLabel", "taxId"])
const DateField = Schema.Literals(["issueDate", "dueDate"])

/** The popups of the form. One is open at a time. */
const Popup = Schema.Literals(["dueTerms", "issueDate", "dueDate", "paymentLabels"])

/** What the preview pane shows: nothing yet, the pages of the last render, or why it failed. */
export const Preview = UiSchema.TaggedEnum({
  Pending: {},
  Rendered: { pages: Schema.Number },
  Failed: { reason: Schema.String }
})

export type Preview = typeof Preview.Type

export const InvoiceEditorMessage = UiSchema.TaggedEnum({
  UpdatedText: { field: TextField, value: Schema.String },
  UpdatedParty: { party: PartyKey, field: PartyField, value: Schema.String },
  UpdatedPartyAddress: { party: PartyKey, value: Schema.String },
  RequestedOpenPopup: { popup: Popup },
  RequestedClosePopup: { popup: Popup },
  PressedEscape: {},
  PickedDueTerms: { value: Schema.String },
  PickedDate: { field: DateField, date: Schema.NullOr(Schema.DateTimeUtc) },
  RequestedCalendarMonth: { month: Schema.DateTimeUtc },
  UpdatedCurrency: { value: Schema.String },
  UpdatedItemDescription: { index: Schema.Number, value: Schema.String },
  UpdatedItemQuantity: { index: Schema.Number, value: Schema.String },
  UpdatedItemUnitPrice: { index: Schema.Number, value: Schema.String },
  UpdatedTaxRate: { value: Schema.String },
  UpdatedDiscount: { value: Schema.String },
  BlurredDraft: {},
  ClickedAddItem: {},
  ClickedRemoveItem: { index: Schema.Number },
  ClickedMoveItemUp: { index: Schema.Number },
  ClickedMoveItemDown: { index: Schema.Number },
  UpdatedPaymentLabel: { index: Schema.Number, value: Schema.String },
  UpdatedPaymentValue: { index: Schema.Number, value: Schema.String },
  PickedPaymentLabel: { label: Schema.String },
  ClickedRemovePaymentField: { index: Schema.Number },
  ClickedMovePaymentFieldUp: { index: Schema.Number },
  ClickedMovePaymentFieldDown: { index: Schema.Number },
  PickedPageSize: { pageSize: Invoice.PageSize },
  ClickedDuplicate: {},
  ClickedDownloadPdf: {},
  SucceededDownloadPdf: {},
  FailedDownloadPdf: { reason: Schema.String },
  ClickedExportJson: {},
  ChoseImportFiles: { files: Schema.Array(Schema.instanceOf(File)) },
  SucceededReadImport: { invoice: Invoice.Invoice },
  FailedReadImport: { name: Schema.String, reason: Schema.String },
  RequestedSave: {},
  SucceededSaveInvoice: { edits: Schema.Number },
  FailedSaveInvoice: { reason: Schema.String },
  ChangedPreview: { preview: Preview },
  ClickedDismissNotice: {}
})

export type InvoiceEditorMessage = typeof InvoiceEditorMessage.Type

/**
 * The Model holds the invoice itself, with money as integers. A number or a
 * currency code being typed may not parse yet, so the text of the one field in
 * focus is kept beside it as `draft` and dropped when the field is left.
 */
export const InvoiceEditorModel = Schema.Struct({
  invoice: Invoice.Invoice,
  draft: Schema.NullOr(Schema.Struct({ field: Schema.String, text: Schema.String, valid: Schema.Boolean })),
  /** The popup that is open, if any. */
  popup: Schema.NullOr(Popup),
  /** The month the open calendar shows. */
  calendarMonth: Schema.DateTimeUtc,
  /** Counts changes to the invoice. The autosave is keyed on it. */
  edits: Schema.Number,
  /** The value of `edits` that the last successful save wrote. */
  savedEdits: Schema.Number,
  preview: Preview,
  notice: Schema.NullOr(Schema.String)
})

export type InvoiceEditorModel = typeof InvoiceEditorModel.Type

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

export class SaveInvoice extends Command.Service<SaveInvoice>()("invoice/SaveInvoice", {
  args: { invoice: Invoice.Invoice, edits: Schema.Number },
  success: InvoiceEditorMessage,
  mode: "queue"
}) {
  static readonly layer = this.toLayer(
    Effect.gen(function*() {
      const store = yield* InvoiceStore

      return ({ edits, invoice }) =>
        store.save(invoice).pipe(
          Effect.match({
            onSuccess: () => InvoiceEditorMessage.SucceededSaveInvoice({ edits }),
            onFailure: (error) => InvoiceEditorMessage.FailedSaveInvoice({ reason: error.reason })
          })
        )
    })
  )
}

export class DownloadPdf extends Command.Service<DownloadPdf>()("invoice/DownloadPdf", {
  args: { invoice: Invoice.Invoice },
  success: InvoiceEditorMessage,
  mode: "switch"
}) {
  static readonly layer = this.toLayer(
    Effect.gen(function*() {
      const renderer = yield* PdfRenderer

      return ({ invoice }) =>
        renderer.render(invoice).pipe(
          Effect.flatMap((pdf) =>
            HtmlFiles.download(
              new File([pdf.slice()], Invoice.fileName(invoice, "pdf"), { type: "application/pdf" })
            )
          ),
          Effect.match({
            onSuccess: () => InvoiceEditorMessage.SucceededDownloadPdf(),
            onFailure: (error) => InvoiceEditorMessage.FailedDownloadPdf({ reason: error.explanation })
          })
        )
    })
  )
}

// The Model's invoice already passed the Schema, so encoding it can't fail.
export const ExportJson = Command.make(
  "invoice/ExportJson",
  { args: { invoice: Invoice.Invoice } },
  ({ invoice }) =>
    Invoice.toJson(invoice).pipe(
      Effect.orDie,
      Effect.flatMap((json) =>
        HtmlFiles.download(new File([json], Invoice.fileName(invoice, "json"), { type: "application/json" }))
      ),
      Effect.as(Component.noop)
    )
)

export const ReadImport = Command.make(
  "invoice/ReadImport",
  { args: { file: Schema.instanceOf(File) }, mode: "switch" },
  ({ file }) =>
    HtmlFiles.readAsText(file).pipe(
      Effect.mapError(() => "The file couldn't be read."),
      Effect.flatMap((json) => Invoice.fromJson(json).pipe(Effect.mapError((error) => error.reason))),
      Effect.match({
        onSuccess: (invoice) => InvoiceEditorMessage.SucceededReadImport({ invoice }),
        onFailure: (reason) => InvoiceEditorMessage.FailedReadImport({ name: file.name, reason })
      })
    )
)

// ---------------------------------------------------------------------------
// The preview mount
// ---------------------------------------------------------------------------

const PREVIEW_DELAY = "150 millis"

const drawPreview = Effect.fn("drawPreview")(function*(node: HTMLElement, invoice: Invoice.Invoice) {
  const renderer = yield* PdfRenderer
  const canvas = yield* PdfCanvas

  return yield* renderer.render(invoice).pipe(
    Effect.flatMap((pdf) => canvas.draw(node, pdf)),
    Effect.match({
      onSuccess: (pages) => Preview.Rendered({ pages }),
      onFailure: (error) => Preview.Failed({ reason: error.explanation })
    })
  )
})

/**
 * Fires when the window is resized or zoomed, by the browser's zoom or by a
 * pinch. Either one changes how many device pixels a page of the preview
 * covers, so the pages are painted again at the new size.
 */
const viewportChanges = (node: HTMLElement): Stream.Stream<void> => {
  const view = node.ownerDocument.defaultView

  if (view === null) return Stream.empty

  const resized = Stream.fromEventListener(view, "resize")
  const pinched = view.visualViewport === null ? Stream.empty : Stream.fromEventListener(view.visualViewport, "resize")

  return Stream.merge(resized, pinched).pipe(Stream.map(() => undefined))
}

/**
 * Renders the invoice to a PDF and paints its pages into the element, again
 * each time the invoice holds still for a moment or the viewport changes. A
 * render still running by then is dropped. What is on screen is the PDF
 * itself, the same bytes a download gets.
 */
export const DrawPreview = Mount.makeStream(
  "DrawPreview",
  { args: { invoice: Invoice.Invoice } },
  (node: HTMLElement, _args, changes) =>
    changes.pipe(
      Stream.zipLatest(Stream.concat(Stream.succeed(undefined), viewportChanges(node))),
      Stream.debounce(PREVIEW_DELAY),
      Stream.switchMap(([{ invoice }]) => Stream.fromEffect(drawPreview(node, invoice)))
    )
)

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

const InvoiceEditorDef = Html.component({
  name: "InvoiceEditor",
  props: Schema.Struct({
    initialInvoice: Invoice.Invoice,
    initialNotice: Schema.NullOr(Schema.String),
    /** The reader's calendar day, which the date pickers mark. */
    today: IsoDate.IsoDate
  }),
  model: InvoiceEditorModel,
  message: InvoiceEditorMessage
})

const AUTOSAVE_DELAY = "400 millis"
const MAX_TAX_RATE = 100 * 10 ** Money.RATE_SCALE

const edited = (model: InvoiceEditorModel, invoice: Invoice.Invoice): InvoiceEditorModel => ({
  ...model,
  invoice,
  edits: model.edits + 1
})

/** A structural change: the invoice changes and whatever was being typed no longer applies. */
const replaced = (model: InvoiceEditorModel, invoice: Invoice.Invoice): InvoiceEditorModel => ({
  ...edited(model, invoice),
  draft: null
})

/**
 * Records what was typed into a field that has to parse. Text that parses
 * changes the invoice at once; text that doesn't only waits in `draft`.
 */
const typed = (
  model: InvoiceEditorModel,
  field: string,
  text: string,
  parsed: Option.Option<Invoice.Invoice>
): InvoiceEditorModel =>
  Option.match(parsed, {
    onNone: () => ({ ...model, draft: { field, text, valid: false } }),
    onSome: (invoice) => ({ ...edited(model, invoice), draft: { field, text, valid: true } })
  })

/** An emptied amount or rate means zero. */
const parseOptional = (text: string, scale: number): Option.Option<number> =>
  text.trim() === "" ? Option.some(0) : Decimal.parse(text, scale)

const itemField = (index: number, field: "quantity" | "unitPrice") => `items.${index}.${field}`

const dateOf = (invoice: Invoice.Invoice, field: typeof DateField.Type): IsoDate.IsoDate =>
  field === "issueDate" ? invoice.issueDate : Invoice.dueDate(invoice)

const updatedCurrency = InvoiceEditorDef.update("UpdatedCurrency", ($, { value }) => {
  const code = value.trim().toUpperCase()
  const { invoice } = $.model

  return typed(
    $.model,
    "currency",
    value.toUpperCase(),
    Schema.is(Invoice.CurrencyCode)(code) ? Option.some(Invoice.withCurrency(invoice, code)) : Option.none()
  )
})

// A calendar opens on the month of the date it edits.
const requestedOpenPopup = InvoiceEditorDef.update(
  "RequestedOpenPopup",
  ($, { popup }) =>
    popup === "issueDate" || popup === "dueDate"
      ? $.evolve({
        popup,
        calendarMonth: IsoDate.toDateTime(IsoDate.startOfMonth(dateOf($.model.invoice, popup)))
      })
      : $.evolve({ popup })
)

const pickedDueTerms = InvoiceEditorDef.update("PickedDueTerms", ($, { value }) => {
  const { invoice } = $.model
  const days = Invoice.NET_DAYS.find((preset) => String(preset) === value)

  return {
    ...replaced(
      $.model,
      days === undefined
        ? { ...invoice, due: Invoice.Due.Custom({ date: Invoice.dueDate(invoice) }) }
        : Invoice.withNetDue(invoice, days)
    ),
    popup: null
  }
})

// A date typed or picked. Picking a due date by hand makes it a custom one,
// and a cleared field keeps the date it had.
const pickedDate = InvoiceEditorDef.update("PickedDate", ($, { date, field }) => {
  if (date === null) return $.model

  const picked = IsoDate.fromDateTime(date)
  const { invoice } = $.model

  return edited(
    $.model,
    field === "issueDate"
      ? { ...invoice, issueDate: picked }
      : { ...invoice, due: Invoice.Due.Custom({ date: picked }) }
  )
})

const choseImportFiles = InvoiceEditorDef.update(
  "ChoseImportFiles",
  ($, { files: [file] }) => file === undefined ? $.model : $.run(ReadImport.make({ file }))
)

const requestedSave = InvoiceEditorDef.update(
  "RequestedSave",
  ($) =>
    $.model.edits === $.model.savedEdits
      ? $.model
      : $.run(SaveInvoice.make({ invoice: $.model.invoice, edits: $.model.edits }))
)

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

const TextInput = InvoiceEditorDef.fragment((h, options: {
  readonly label: string
  readonly value: string
  readonly placeholder?: string
  readonly updated: (value: string) => InvoiceEditorMessage
}) =>
  Field(h, {
    label: options.label,
    children: [
      h.input
        .attrs({ type: "text", placeholder: options.placeholder, autocomplete: "off", spellcheck: "false" })
        .class(CONTROL)
        .value(options.value)
        .on("input", ({ value }) => options.updated(value))
    ]
  })
)

const TextArea = InvoiceEditorDef.fragment((h, options: {
  readonly label: string
  readonly value: string
  readonly placeholder?: string
  readonly updated: (value: string) => InvoiceEditorMessage
}) =>
  Field(h, {
    label: options.label,
    children: [
      h.textarea
        .attrs({ rows: "2", placeholder: options.placeholder })
        .class(CONTROL, "resize-none [field-sizing:content]")
        .value(options.value)
        .on("input", ({ value }) => options.updated(value))
    ]
  })
)

/** The text a parsed field shows: what is being typed there, or else the invoice's value. */
const shown = (model: InvoiceEditorModel, field: string, value: string): string =>
  model.draft !== null && model.draft.field === field ? model.draft.text : value

const isInvalid = (model: InvoiceEditorModel, field: string): boolean =>
  model.draft !== null && model.draft.field === field && !model.draft.valid

interface ParsedOptions {
  readonly field: string
  readonly label: string
  readonly value: string
  readonly placeholder?: string
  readonly list?: string
  readonly updated: (value: string) => InvoiceEditorMessage
}

/** An input whose text has to parse: a number or a currency code. */
const ParsedInput = InvoiceEditorDef.fragment((h, model: InvoiceEditorModel, options: ParsedOptions) =>
  h.input
    .attrs({
      type: "text",
      inputmode: options.list === undefined ? "decimal" : undefined,
      list: options.list,
      placeholder: options.placeholder,
      autocomplete: "off",
      "aria-label": options.label,
      "aria-invalid": isInvalid(model, options.field) ? "true" : undefined
    })
    .value(shown(model, options.field, options.value))
    .on("input", ({ value }) => options.updated(value))
    .on("blur", InvoiceEditorMessage.BlurredDraft())
)

const ParsedField = InvoiceEditorDef.fragment((h, model: InvoiceEditorModel, options: ParsedOptions) =>
  Field(h, {
    label: options.label,
    invalid: isInvalid(model, options.field),
    children: [ParsedInput(h, model, options).class(CONTROL, "tabular-nums")]
  })
)

// Press feedback: a small scale-down that only transitions the transform, so hover stays instant.
const PRESS =
  "transition-transform duration-100 ease-out active:scale-[0.97] disabled:active:scale-100 motion-reduce:transition-none [-webkit-tap-highlight-color:transparent]"

// A popover comes with a border, padding and a background of its own.
const POSITIONER = "m-0 overflow-visible border-0 bg-transparent p-0 outline-none"

// A hairline drawn as a shadow sits outside the box, so the corners stay clean. The popup grows from its anchor.
const POPUP =
  "origin-(--transform-origin) rounded-xl bg-white text-primary shadow-[0_0_0_1px_rgb(0_0_0/7%),0_4px_6px_-2px_rgb(0_0_0/5%),0_12px_28px_-6px_rgb(0_0_0/12%)] outline-none transition-[opacity,scale] duration-150 ease-out motion-reduce:transition-none starting:scale-[0.97] starting:opacity-0"

const TRIGGER =
  "flex cursor-pointer items-center gap-1.5 rounded-md text-[14px] text-primary outline-none focus-visible:ring-2 focus-visible:ring-primary/25"

// The popup's radius is 12px and its padding 4px, so an item's is 8px.
const MENU_ITEM =
  "relative flex cursor-default items-center rounded-lg py-1.5 pr-8 pl-2.5 text-[13px] outline-none select-none data-[highlighted]:bg-neutral-100"

const DUE_CHOICES = [
  ...Invoice.NET_DAYS.map((days) => ({ value: String(days), label: Invoice.termsLabel(days) })),
  { value: "custom", label: "Custom date" }
]

const DueTerms = InvoiceEditorDef.fragment((h, model: InvoiceEditorModel) =>
  Select(h, {
    key: "dueTerms",
    props: {
      open: model.popup === "dueTerms",
      value: Invoice.Due.match(model.invoice.due, { Net: ({ days }) => String(days), Custom: () => "custom" }),
      items: DUE_CHOICES,
      alignItemWithTrigger: false,
      side: "bottom",
      align: "end",
      sideOffset: 8
    },
    onEmit: {
      RequestedOpen: () => InvoiceEditorMessage.RequestedOpenPopup({ popup: "dueTerms" }),
      RequestedClose: () => InvoiceEditorMessage.RequestedClosePopup({ popup: "dueTerms" }),
      Picked: ({ value }) => InvoiceEditorMessage.PickedDueTerms({ value: String(value) }),
      Settled: () => undefined
    },
    view: (select) =>
      FieldGroup(h, {
        label: "Due",
        children: [
          select.trigger(h.button.class(TRIGGER).attr("aria-label", "Due")).children(
            select.value(h.span),
            select.icon(h.span.class("text-muted-foreground")).children(ChevronDownIcon(h))
          ),
          select.positioner(h.div.class(POSITIONER)).children(
            select.popup(h.div.class(POPUP, "min-w-40 p-1")).children(
              DUE_CHOICES.map(({ label, value }) =>
                select.item({ element: h.div.class(MENU_ITEM), value }).children(
                  select.itemText(h.div).children(label),
                  select.itemIndicator({ element: h.span.class("absolute right-2.5"), value })?.children(CheckIcon(h))
                )
              )
            )
          )
        ]
      })
  })
)

const GHOST_BUTTON =
  `flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground outline-none ${PRESS} hover:bg-neutral-100 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/25 disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground`

const DAY =
  "flex size-8 cursor-pointer items-center justify-center rounded-md text-[13px] tabular-nums outline-none hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-primary/25 data-[outside-month]:text-placeholder data-[today]:bg-neutral-100 data-[today]:font-medium data-[selected]:!bg-primary data-[selected]:text-white"

const DateRow = InvoiceEditorDef.fragment((h, model: InvoiceEditorModel, options: {
  readonly field: typeof DateField.Type
  readonly label: string
}) =>
  DatePicker(h, {
    key: options.field,
    props: {
      value: IsoDate.toDateTime(dateOf(model.invoice, options.field)),
      open: model.popup === options.field,
      month: model.calendarMonth,
      today: IsoDate.toDateTime(h.props.today),
      side: "bottom",
      align: "end",
      sideOffset: 12
    },
    onEmit: {
      Picked: ({ date }) => InvoiceEditorMessage.PickedDate({ field: options.field, date }),
      RequestedOpen: () => InvoiceEditorMessage.RequestedOpenPopup({ popup: options.field }),
      RequestedClose: () => InvoiceEditorMessage.RequestedClosePopup({ popup: options.field }),
      RequestedMonth: ({ month }) => InvoiceEditorMessage.RequestedCalendarMonth({ month })
    },
    view: (datePicker) =>
      FieldGroup(h, {
        label: options.label,
        children: [
          h.div.class("flex min-w-0 flex-1 items-center justify-end gap-2").children(
            datePicker.input(h.input.class(CONTROL, "tabular-nums")).attrs({
              "aria-label": options.label,
              placeholder: datePicker.pattern,
              autocomplete: "off"
            }),
            datePicker.trigger(h.button.class(GHOST_BUTTON, "-my-1.5 -mr-1.5")).attr(
              "aria-label",
              `Choose ${options.label.toLowerCase()}`
            ).children(CalendarIcon(h))
          ),
          datePicker.positioner(h.div.class(POSITIONER)).children(
            datePicker.popup(h.div.class(POPUP, "p-3").attr("aria-label", `${options.label} calendar`)).children(
              datePicker.root(h.div.class("flex flex-col gap-3")).children(
                datePicker.months.map((month) =>
                  h.div.key(DateTime.formatIsoDateUtc(month.month)).class("flex flex-col gap-3").children(
                    h.div.class("flex items-center justify-between").children(
                      datePicker.previous(h.button.class(GHOST_BUTTON)).attr("aria-label", "Previous month")
                        .children(ChevronLeftIcon(h)),
                      month.heading(h.div.class("text-[13px] font-medium")).children(month.title),
                      datePicker.next(h.button.class(GHOST_BUTTON)).attr("aria-label", "Next month").children(
                        ChevronRightIcon(h)
                      )
                    ),
                    month.grid(h.table.class("border-collapse")).children(
                      h.thead(
                        h.tr(
                          datePicker.weekdays.map((day, index) =>
                            datePicker.weekday({
                              element: h.th.key(String(index)).class(
                                "size-8 text-[12px] font-normal text-muted-foreground"
                              ),
                              index
                            }).children(day.short.slice(0, 2))
                          )
                        )
                      ),
                      h.tbody(
                        month.weeks.map((week, weekIndex) =>
                          h.tr.key(String(weekIndex)).children(
                            week.map((date) =>
                              month.cell({ element: h.td.class("p-0"), date }).children(
                                month.day({ element: h.button.class(DAY), date }).children(
                                  String(DateTime.getPartUtc(date, "day"))
                                )
                              )
                            )
                          )
                        )
                      )
                    )
                  )
                )
              )
            )
          )
        ]
      })
  })
)

const CURRENCIES = Intl.supportedValuesOf("currency")

const Details = InvoiceEditorDef.fragment((h, model: InvoiceEditorModel) => {
  const { invoice } = model

  return Section(h, "Details").children(
    TextInput(h, {
      label: "Invoice number",
      value: invoice.number,
      placeholder: "INV-0001",
      updated: (value) => InvoiceEditorMessage.UpdatedText({ field: "number", value })
    }),
    DateRow(h, model, { field: "issueDate", label: "Issue date" }),
    DueTerms(h, model),
    DateRow(h, model, { field: "dueDate", label: "Due date" }),
    ParsedField(h, model, {
      field: "currency",
      label: "Currency",
      list: h.id("currencies"),
      placeholder: "USD",
      value: invoice.currency,
      updated: (value) => InvoiceEditorMessage.UpdatedCurrency({ value })
    }),
    TextInput(h, {
      label: "Payment terms",
      value: invoice.paymentTerms,
      placeholder: "Net 30",
      updated: (value) => InvoiceEditorMessage.UpdatedText({ field: "paymentTerms", value })
    }),
    h.datalist.id(h.id("currencies")).children(
      CURRENCIES.map((code) => h.option.key(code).attr("value", code))
    )
  )
})

const PartyFields = InvoiceEditorDef.fragment((
  h,
  title: string,
  key: typeof PartyKey.Type,
  party: Invoice.Party,
  example: Invoice.Party
) =>
  Section(h, title).children(
    TextInput(h, {
      label: "Company name",
      value: party.name,
      placeholder: example.name,
      updated: (value) => InvoiceEditorMessage.UpdatedParty({ party: key, field: "name", value })
    }),
    TextArea(h, {
      label: "Address",
      value: party.addressLines.join("\n"),
      placeholder: example.addressLines.join("\n"),
      updated: (value) => InvoiceEditorMessage.UpdatedPartyAddress({ party: key, value })
    }),
    TextInput(h, {
      label: "Country",
      value: party.country,
      placeholder: example.country,
      updated: (value) => InvoiceEditorMessage.UpdatedParty({ party: key, field: "country", value })
    }),
    TextInput(h, {
      label: "Tax ID label",
      value: party.taxIdLabel,
      placeholder: example.taxIdLabel,
      updated: (value) => InvoiceEditorMessage.UpdatedParty({ party: key, field: "taxIdLabel", value })
    }),
    TextInput(h, {
      label: party.taxIdLabel.trim() === "" ? "Tax ID" : party.taxIdLabel,
      value: party.taxId,
      placeholder: example.taxId,
      updated: (value) => InvoiceEditorMessage.UpdatedParty({ party: key, field: "taxId", value })
    })
  )
)

const FROM_EXAMPLE: Invoice.Party = {
  name: "Acme Serviços Ltda",
  addressLines: ["Av. Paulista, 1000", "São Paulo - SP, 01310-100"],
  country: "Brazil",
  taxIdLabel: "CNPJ",
  taxId: "12.345.678/0001-95"
}

const BILL_TO_EXAMPLE: Invoice.Party = {
  name: "Globex GmbH",
  addressLines: ["Friedrichstraße 123", "10117 Berlin"],
  country: "Germany",
  taxIdLabel: "VAT",
  taxId: "DE123456789"
}

/** A row that carries `RowActions`. */
const ACTION_ROW = "group relative"

// Shown while the row is hovered or one of the buttons has focus, and always on a touch screen.
const REVEALED =
  "pointer-events-none absolute top-1/2 flex -translate-y-1/2 opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100"

const MOVE_BUTTON =
  `flex h-5 w-6 cursor-pointer items-center justify-center rounded-md text-placeholder outline-none ${PRESS} hover:bg-neutral-100 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/25 disabled:hidden`

/**
 * The move and remove buttons of a row in a list. They sit in the margins on
 * either side of the row, so showing them never moves or covers its content.
 * Each group touches the row's edge, which keeps the row hovered on the way to it.
 */
const RowActions = InvoiceEditorDef.fragment((h, options: {
  readonly index: number
  readonly count: number
  readonly movedUp: InvoiceEditorMessage
  readonly movedDown: InvoiceEditorMessage
  readonly removed: InvoiceEditorMessage
}) => [
  h.div.class(REVEALED, "right-full flex-col lg:pr-1.5").children(
    h.button
      .attrs({ type: "button", "aria-label": "Move up", title: "Move up" })
      .class(MOVE_BUTTON)
      .disabled(options.index === 0)
      .on("click", options.movedUp)
      .children(ChevronUpIcon(h)),
    h.button
      .attrs({ type: "button", "aria-label": "Move down", title: "Move down" })
      .class(MOVE_BUTTON)
      .disabled(options.index === options.count - 1)
      .on("click", options.movedDown)
      .children(ChevronDownIcon(h))
  ),
  h.div.class(REVEALED, "left-full lg:pl-1.5").children(
    h.button
      .attrs({ type: "button", "aria-label": "Remove", title: "Remove" })
      .class(GHOST_BUTTON, "max-lg:size-6")
      .on("click", options.removed)
      .children(CloseIcon(h))
  )
])

const QUIET_BUTTON =
  "cursor-pointer text-[13px] text-muted-foreground hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"

const ADD_BUTTON =
  `flex cursor-pointer items-center gap-1.5 rounded-md text-[13px] text-muted-foreground outline-none ${PRESS} hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/25`

const SummaryRow = InvoiceEditorDef.fragment((h, label: string, value: string, strong: boolean) => [
  h.dt.class(strong ? "text-[14px] font-medium text-primary" : "text-[14px] text-muted-foreground").children(label),
  h.dd.class("text-right tabular-nums", strong ? "text-[18px] font-semibold text-primary" : "text-[14px] text-primary")
    .children(value)
])

const LineItems = InvoiceEditorDef.fragment((h, model: InvoiceEditorModel) => {
  const { invoice } = model
  const digits = Money.minorUnitDigits(invoice.currency)
  const totals = Invoice.totals(invoice)
  const money = (minor: number) => Money.format(minor, invoice.currency)

  return Section(h, "Line items").children(
    h.ol.class("flex flex-col gap-8").children(
      invoice.items.map((item, index) =>
        h.li.key(String(index)).attr("aria-label", `Line ${index + 1}`).class("flex flex-col").children(
          // The item's heading carries its amount, and the row actions while it is hovered.
          h.div.class(ACTION_ROW, "flex items-center justify-between gap-6 py-1 text-[14px]").children(
            h.span.class("text-muted-foreground").children(`Item ${index + 1}`),
            h.output.class("text-muted-foreground tabular-nums").attr("aria-label", "Amount").children(
              money(totals.lines[index] ?? 0)
            ),
            RowActions(h, {
              index,
              count: invoice.items.length,
              movedUp: InvoiceEditorMessage.ClickedMoveItemUp({ index }),
              movedDown: InvoiceEditorMessage.ClickedMoveItemDown({ index }),
              removed: InvoiceEditorMessage.ClickedRemoveItem({ index })
            })
          ),
          TextInput(h, {
            label: "Description",
            value: item.description,
            placeholder: "Consulting services",
            updated: (value) => InvoiceEditorMessage.UpdatedItemDescription({ index, value })
          }),
          ParsedField(h, model, {
            field: itemField(index, "quantity"),
            label: "Quantity",
            value: Decimal.formatTrimmed(item.quantity, Money.QUANTITY_SCALE),
            updated: (value) => InvoiceEditorMessage.UpdatedItemQuantity({ index, value })
          }),
          ParsedField(h, model, {
            field: itemField(index, "unitPrice"),
            label: "Unit price",
            value: Decimal.format(item.unitPrice, digits),
            updated: (value) => InvoiceEditorMessage.UpdatedItemUnitPrice({ index, value })
          })
        )
      )
    ),
    h.div.class("flex border-b border-line py-4").children(
      h.button.attr("type", "button").class(ADD_BUTTON).on("click", InvoiceEditorMessage.ClickedAddItem())
        .children(PlusIcon(h), "Add line item")
    ),
    ParsedField(h, model, {
      field: "discount",
      label: "Discount",
      placeholder: Decimal.format(0, digits),
      value: invoice.discount === 0 ? "" : Decimal.format(invoice.discount, digits),
      updated: (value) => InvoiceEditorMessage.UpdatedDiscount({ value })
    }),
    ParsedField(h, model, {
      field: "taxRate",
      label: "Tax %",
      placeholder: "0",
      value: invoice.taxRate === 0 ? "" : Decimal.formatTrimmed(invoice.taxRate, Money.RATE_SCALE),
      updated: (value) => InvoiceEditorMessage.UpdatedTaxRate({ value })
    }),
    h.dl.class("grid grid-cols-[1fr_auto] items-baseline gap-x-6 gap-y-3 pt-5").children(
      SummaryRow(h, "Subtotal", money(totals.subtotal), false),
      totals.discount !== 0 && SummaryRow(h, "Discount", money(-totals.discount), false),
      invoice.taxRate !== 0 && SummaryRow(h, "Tax", money(totals.tax), false),
      SummaryRow(h, `Total (${invoice.currency})`, money(totals.total), true)
    )
  )
})

const CUSTOM_LABEL = "custom"

const PAYMENT_EXAMPLES = new Map([
  ["Beneficiary", "Acme Serviços Ltda"],
  ["Bank name", "Commerzbank AG"],
  ["Bank address", "Kaiserplatz, 60311 Frankfurt"],
  ["Account number", "000123456789"],
  ["IBAN", "DE89 3704 0044 0532 0130 00"],
  ["SWIFT / BIC", "COBADEFFXXX"],
  ["Routing / ABA", "021000021"],
  ["Sort code", "40-47-84"],
  ["Intermediary bank", "JPMorgan Chase Bank, N.A."],
  ["Intermediary SWIFT / BIC", "CHASUS33"],
  ["Intermediary ABA", "021000021"],
  ["Intermediary account", "400123456"]
])

const AddPaymentField = InvoiceEditorDef.fragment((h, model: InvoiceEditorModel) => {
  const used = new Set(model.invoice.payment.map((field) => field.label))

  const choices = [
    ...Invoice.PAYMENT_LABELS.filter((label) => !used.has(label)).map((label) => ({ value: label, label })),
    { value: CUSTOM_LABEL, label: "Custom field" }
  ]

  return Select(h, {
    key: "paymentLabels",
    props: {
      open: model.popup === "paymentLabels",
      value: "",
      items: choices,
      alignItemWithTrigger: false,
      side: "bottom",
      align: "start",
      sideOffset: 8
    },
    onEmit: {
      RequestedOpen: () => InvoiceEditorMessage.RequestedOpenPopup({ popup: "paymentLabels" }),
      RequestedClose: () => InvoiceEditorMessage.RequestedClosePopup({ popup: "paymentLabels" }),
      Picked: ({ value }) =>
        InvoiceEditorMessage.PickedPaymentLabel({ label: value === CUSTOM_LABEL ? "" : String(value) }),
      Settled: () => undefined
    },
    view: (select) =>
      h.div.class("flex border-b border-line py-4").children(
        select.trigger(h.button.class(ADD_BUTTON)).children(PlusIcon(h), "Add field"),
        select.positioner(h.div.class(POSITIONER)).children(
          // The list scrolls inside the popup, so its fade doesn't mask the popup's shadow.
          select.popup(h.div.class(POPUP, "min-w-52")).children(
            select.list(h.div.class("scroll-fade-y scrollbar-none max-h-72 overflow-y-auto p-1")).children(
              choices.map(({ label, value }) =>
                select.item({ element: h.div.class(MENU_ITEM), value }).children(
                  select.itemText(h.div).children(label)
                )
              )
            )
          )
        )
      )
  })
})

const PaymentFields = InvoiceEditorDef.fragment((h, model: InvoiceEditorModel) => {
  const { payment } = model.invoice

  return Section(h, "Payment instructions").children(
    h.p.class("text-[13px] text-pretty text-muted-foreground").children(
      "Name each field as your bank does. A field left empty stays out of the PDF."
    ),
    h.ol.class("flex flex-col").children(
      payment.map((field, index) =>
        h.li
          .key(String(index))
          .attr("aria-label", `Payment field ${index + 1}`)
          .class(ACTION_ROW, ROW, "border-line focus-within:border-primary")
          .children(
            h.input
              .attrs({ type: "text", "aria-label": "Label", placeholder: "Label", autocomplete: "off" })
              .class(
                "w-2/5 min-w-0 shrink-0 bg-transparent text-[14px] font-medium text-primary outline-none placeholder:font-normal placeholder:text-placeholder"
              )
              .value(field.label)
              .on("input", ({ value }) => InvoiceEditorMessage.UpdatedPaymentLabel({ index, value })),
            h.input
              .attrs({
                type: "text",
                "aria-label": field.label.trim() === "" ? "Value" : field.label,
                placeholder: PAYMENT_EXAMPLES.get(field.label) ?? "Value",
                autocomplete: "off",
                spellcheck: "false"
              })
              .class(CONTROL)
              .value(field.value)
              .on("input", ({ value }) => InvoiceEditorMessage.UpdatedPaymentValue({ index, value })),
            RowActions(h, {
              index,
              count: payment.length,
              movedUp: InvoiceEditorMessage.ClickedMovePaymentFieldUp({ index }),
              movedDown: InvoiceEditorMessage.ClickedMovePaymentFieldDown({ index }),
              removed: InvoiceEditorMessage.ClickedRemovePaymentField({ index })
            })
          )
      )
    ),
    AddPaymentField(h, model)
  )
})

const Actions = InvoiceEditorDef.fragment((h, model: InvoiceEditorModel) =>
  h.div.class("flex flex-wrap items-center justify-between gap-x-6 gap-y-3").children(
    h.div
      .class("flex rounded-full border border-line bg-white p-0.5 text-[13px]")
      .attrs({ role: "group", "aria-label": "Page size" })
      .children(
        Invoice.PageSize.literals.map((pageSize) =>
          h.button
            .key(pageSize)
            .attrs({ type: "button", "aria-pressed": String(model.invoice.pageSize === pageSize) })
            .class(
              "cursor-pointer rounded-full px-3 py-1 focus-visible:outline-2 focus-visible:outline-primary",
              model.invoice.pageSize === pageSize
                ? "bg-primary text-white"
                : "text-muted-foreground hover:text-primary"
            )
            .on("click", InvoiceEditorMessage.PickedPageSize({ pageSize }))
            .children(pageSize === "Letter" ? "US Letter" : pageSize)
        )
      ),
    h.div.class("flex flex-wrap items-center gap-x-5 gap-y-3").children(
      h.label.class(QUIET_BUTTON, "focus-within:text-primary").children(
        "Import JSON",
        h.input.attrs({ type: "file", accept: ".json,application/json" }).class("sr-only").value("")
          .on("change", ({ files }) => InvoiceEditorMessage.ChoseImportFiles({ files }))
      ),
      h.button.attr("type", "button").class(QUIET_BUTTON).on("click", InvoiceEditorMessage.ClickedExportJson())
        .children("Export JSON"),
      h.button.attr("type", "button").class(QUIET_BUTTON).on("click", InvoiceEditorMessage.ClickedDuplicate())
        .children("Duplicate for next month"),
      h.button
        .attr("type", "button")
        .class(
          "cursor-pointer rounded-full bg-primary px-4 py-2 text-[13px] font-medium text-white",
          PRESS,
          "hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        )
        .on("click", InvoiceEditorMessage.ClickedDownloadPdf())
        .children(h.isRunning(DownloadPdf) ? "Preparing…" : "Download PDF")
    )
  )
)

const PreviewPane = InvoiceEditorDef.fragment((h, model: InvoiceEditorModel) =>
  h.aside
    .class("dotted flex min-w-0 flex-1 flex-col gap-8 px-6 py-6 lg:h-dvh lg:overflow-y-auto lg:px-10")
    .attr("aria-label", "PDF preview")
    .children(
      Actions(h, model),
      h.div.class("mx-auto flex w-full max-w-[640px] flex-col gap-4 pb-10").children(
        Preview.match(model.preview, {
          Pending: () => h.p.class("text-center text-[13px] text-muted-foreground").children("Rendering the PDF…"),
          Rendered: () => null,
          Failed: ({ reason }) =>
            h.p
              .class("rounded-xl border border-danger/30 bg-white px-4 py-3 text-[13px] text-danger")
              .attr("role", "alert")
              .children(reason)
        }),
        h.div
          .class(
            "pages flex flex-col gap-6 transition-opacity",
            Preview.is("Failed")(model.preview) && "opacity-40"
          )
          .onMount(
            DrawPreview({ invoice: model.invoice }).pipe(
              Mount.map((preview) => InvoiceEditorMessage.ChangedPreview({ preview }))
            )
          )
      )
    )
)

// ---------------------------------------------------------------------------
// The component
// ---------------------------------------------------------------------------

export const InvoiceEditorNoDeps = InvoiceEditorDef.make({
  init: ($) => ({
    invoice: $.props.initialInvoice,
    draft: null,
    popup: null,
    calendarMonth: IsoDate.toDateTime(IsoDate.startOfMonth($.props.initialInvoice.issueDate)),
    edits: 0,
    savedEdits: 0,
    preview: Preview.Pending(),
    notice: $.props.initialNotice
  }),
  update: {
    UpdatedText: ($, { field, value }) => edited($.model, { ...$.model.invoice, [field]: value }),
    UpdatedParty: ($, { field, party, value }) =>
      edited($.model, { ...$.model.invoice, [party]: { ...$.model.invoice[party], [field]: value } }),
    UpdatedPartyAddress: ($, { party, value }) =>
      edited($.model, {
        ...$.model.invoice,
        [party]: { ...$.model.invoice[party], addressLines: value.split("\n") }
      }),
    RequestedOpenPopup: requestedOpenPopup,
    // A close request for a popup that another has already replaced changes nothing.
    RequestedClosePopup: ($, { popup }) => $.model.popup === popup ? $.evolve({ popup: null }) : $.model,
    // Escape closes the open popup wherever focus is, such as on the page after a press on the popup's padding.
    PressedEscape: ($) => $.evolve({ popup: null }),
    PickedDueTerms: pickedDueTerms,
    PickedDate: pickedDate,
    RequestedCalendarMonth: ($, { month }) => $.evolve({ calendarMonth: month }),
    UpdatedCurrency: updatedCurrency,
    UpdatedItemDescription: ($, { index, value }) =>
      edited($.model, Invoice.withItem($.model.invoice, index, { description: value })),
    UpdatedItemQuantity: ($, { index, value }) =>
      typed(
        $.model,
        itemField(index, "quantity"),
        value,
        Decimal.parse(value, Money.QUANTITY_SCALE).pipe(
          Option.filter((quantity) => quantity >= 0),
          Option.map((quantity) => Invoice.withItem($.model.invoice, index, { quantity }))
        )
      ),
    UpdatedItemUnitPrice: ($, { index, value }) =>
      typed(
        $.model,
        itemField(index, "unitPrice"),
        value,
        Decimal.parse(value, Money.minorUnitDigits($.model.invoice.currency)).pipe(
          Option.map((unitPrice) => Invoice.withItem($.model.invoice, index, { unitPrice }))
        )
      ),
    UpdatedTaxRate: ($, { value }) =>
      typed(
        $.model,
        "taxRate",
        value,
        parseOptional(value, Money.RATE_SCALE).pipe(
          Option.filter((taxRate) => taxRate >= 0 && taxRate <= MAX_TAX_RATE),
          Option.map((taxRate) => Invoice.withAmounts($.model.invoice, { taxRate }))
        )
      ),
    UpdatedDiscount: ($, { value }) =>
      typed(
        $.model,
        "discount",
        value,
        parseOptional(value, Money.minorUnitDigits($.model.invoice.currency)).pipe(
          Option.filter((discount) => discount >= 0),
          Option.map((discount) => Invoice.withAmounts($.model.invoice, { discount }))
        )
      ),
    BlurredDraft: ($) => $.evolve({ draft: null }),
    ClickedAddItem: ($) => replaced($.model, Invoice.addItem($.model.invoice)),
    ClickedRemoveItem: ($, { index }) => replaced($.model, Invoice.removeItem($.model.invoice, index)),
    ClickedMoveItemUp: ($, { index }) => replaced($.model, Invoice.moveItem($.model.invoice, index, -1)),
    ClickedMoveItemDown: ($, { index }) => replaced($.model, Invoice.moveItem($.model.invoice, index, 1)),
    UpdatedPaymentLabel: ($, { index, value }) =>
      edited($.model, Invoice.withPaymentField($.model.invoice, index, { label: value })),
    UpdatedPaymentValue: ($, { index, value }) =>
      edited($.model, Invoice.withPaymentField($.model.invoice, index, { value })),
    PickedPaymentLabel: ($, { label }) => ({
      ...edited($.model, Invoice.addPaymentField($.model.invoice, label)),
      popup: null
    }),
    ClickedRemovePaymentField: ($, { index }) => edited($.model, Invoice.removePaymentField($.model.invoice, index)),
    ClickedMovePaymentFieldUp: ($, { index }) => edited($.model, Invoice.movePaymentField($.model.invoice, index, -1)),
    ClickedMovePaymentFieldDown: ($, { index }) => edited($.model, Invoice.movePaymentField($.model.invoice, index, 1)),
    PickedPageSize: ($, { pageSize }) => edited($.model, { ...$.model.invoice, pageSize }),
    ClickedDuplicate: ($) => replaced($.model, Invoice.duplicateForNextMonth($.model.invoice)),
    ClickedDownloadPdf: ($) => $.run(DownloadPdf.make({ invoice: $.model.invoice })),
    SucceededDownloadPdf: ($) => $.evolve({ notice: null }),
    FailedDownloadPdf: ($, { reason }) => $.evolve({ notice: reason }),
    ClickedExportJson: ($) => $.run(ExportJson.make({ invoice: $.model.invoice })),
    ChoseImportFiles: choseImportFiles,
    SucceededReadImport: ($, { invoice }) => ({ ...replaced($.model, invoice), notice: null }),
    FailedReadImport: ($, { name, reason }) =>
      $.evolve({ notice: `${name} isn't an invoice this app can open. ${reason}` }),
    RequestedSave: requestedSave,
    SucceededSaveInvoice: ($, { edits }) => $.evolve({ savedEdits: edits }),
    FailedSaveInvoice: ($, { reason }) =>
      $.evolve({ notice: `The invoice couldn't be saved in this browser. ${reason}` }),
    ChangedPreview: ($, { preview }) => $.evolve({ preview }),
    ClickedDismissNotice: ($) => $.evolve({ notice: null })
  },
  // Saves once the invoice has held still for a moment. `edits` is part of
  // the key, so each change restarts the wait.
  subscriptions: ({ model }) => [
    model.popup !== null &&
    HtmlSubscription.onDocument(
      "keydown",
      ({ key }) => key === "Escape" ? InvoiceEditorMessage.PressedEscape() : undefined
    ),
    model.edits !== model.savedEdits &&
    Subscription.make(
      "autosave",
      model.edits,
      () => Stream.fromEffect(Effect.as(Effect.sleep(AUTOSAVE_DELAY), InvoiceEditorMessage.RequestedSave()))
    )
  ],
  view: (h, model) =>
    h.div.class("flex flex-col lg:h-dvh lg:flex-row").children(
      h.main
        .class(
          "flex w-full shrink-0 flex-col gap-14 border-line px-6 py-10 lg:h-dvh lg:w-[520px] lg:overflow-y-auto lg:border-r lg:px-12"
        )
        .children(
          h.header.class("flex flex-col gap-1").children(
            h.h1.class("text-[15px] font-semibold tracking-tight text-primary").children("Invoice"),
            h.p.class("text-[13px] text-muted-foreground").attr("role", "status").children(
              model.edits === model.savedEdits ? "Saved in this browser" : "Saving…"
            )
          ),
          model.notice !== null &&
            h.div
              .class(
                "-my-6 flex items-start justify-between gap-4 rounded-xl border border-danger/30 px-4 py-3 text-[13px] text-danger"
              )
              .attr("role", "alert")
              .children(
                h.span(model.notice),
                h.button
                  .attr("type", "button")
                  .class("shrink-0 cursor-pointer font-medium underline-offset-4 hover:underline")
                  .on("click", InvoiceEditorMessage.ClickedDismissNotice())
                  .children("Dismiss")
              ),
          Details(h, model),
          PartyFields(h, "From", "from", model.invoice.from, FROM_EXAMPLE),
          PartyFields(h, "Bill to", "billTo", model.invoice.billTo, BILL_TO_EXAMPLE),
          LineItems(h, model),
          PaymentFields(h, model),
          Section(h, "Notes").children(
            TextArea(h, {
              label: "Notes",
              value: model.invoice.notes,
              placeholder: "Thank you for your business.",
              updated: (value) => InvoiceEditorMessage.UpdatedText({ field: "notes", value })
            })
          )
        ),
      PreviewPane(h, model)
    )
})

export const InvoiceEditor = InvoiceEditorNoDeps.pipe(
  Component.provide(
    Layer.mergeAll(SaveInvoice.layer, DownloadPdf.layer, PdfCanvas.layer).pipe(
      Layer.provideMerge(Layer.mergeAll(InvoiceStore.layer, PdfRenderer.layer))
    )
  )
)
