import { Command, Component, Mount, Subscription, UiSchema } from "@effect/ui"
import { Combobox, DatePicker, FileDrop, Select } from "@effect/ui-kit"
import { Html, HtmlFiles, HtmlSubscription } from "@effect/ui/html"
import * as Decimal from "@invoice/shared/domain/Decimal"
import * as Invoice from "@invoice/shared/domain/Invoice"
import * as IsoDate from "@invoice/shared/domain/IsoDate"
import * as Money from "@invoice/shared/domain/Money"
import * as SampleInvoice from "@invoice/shared/domain/SampleInvoice"
import { PdfRenderer } from "@invoice/shared/services/PdfRenderer"
import { DateTime, Effect, Layer, Option, Queue, Random, Schema, Stream } from "effect"
import { CONTROL, Field, FieldGroup, ROW, Section } from "../../components/Field.ts"
import {
  CalendarIcon,
  CalendarPlusIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  CloseIcon,
  CopyIcon,
  DiceIcon,
  DownloadIcon,
  ExportIcon,
  EyeIcon,
  ImportIcon,
  PageIcon,
  PlusIcon,
  RecenterIcon,
  UploadIcon,
  ZoomInIcon,
  ZoomOutIcon
} from "../../components/Icon.ts"
import { layer as bundledFonts } from "../services/InvoiceFontsBundled.ts"
import { InvoiceStore } from "../services/InvoiceStore.ts"
import { PdfCanvas } from "../services/PdfCanvas.ts"

const TextField = Schema.Literals(["number", "paymentTerms", "notes"])
const PartyKey = Schema.Literals(["from", "billTo"])
const PartyField = Schema.Literals(["name", "country", "taxIdLabel", "taxId"])
const DateField = Schema.Literals(["issueDate", "dueDate"])

/** The popups of the form. One is open at a time. */
const Popup = Schema.Literals(["dueTerms", "issueDate", "dueDate", "currency", "paymentLabels", "pageSize"])

/** The dialogs of the page. One is open at a time. */
const Dialog = Schema.Literals(["import", "export"])

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
  PickedCurrency: { value: Schema.String },
  UpdatedCurrencySearch: { value: Schema.String },
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
  ClickedPageSizeCommand: {},
  ClickedDuplicate: {},
  ClickedSampleData: {},
  CompletedDrawSeed: { seed: Schema.Number },
  ClickedExitDemo: {},
  ClickedDownloadPdf: {},
  SucceededDownloadPdf: {},
  FailedDownloadPdf: { reason: Schema.String },
  ClickedImportJson: {},
  ClickedExportJson: {},
  RequestedCloseDialog: {},
  ClosedDialog: { dialog: Dialog },
  UpdatedImportText: { value: Schema.String },
  SubmittedImport: {},
  ChoseImportFiles: { files: Schema.Array(Schema.instanceOf(File)) },
  RejectedImportFiles: {},
  ClickedCopyExport: {},
  SucceededCopyExport: {},
  FailedCopyExport: {},
  ClickedDownloadExport: {},
  SucceededReadImport: { invoice: Invoice.Invoice },
  FailedReadImport: { name: Schema.String, reason: Schema.String },
  RequestedSave: {},
  SucceededSaveInvoice: { edits: Schema.Number },
  FailedSaveInvoice: { reason: Schema.String },
  ChangedPreview: { preview: Preview },
  ClickedZoomIn: {},
  ClickedZoomOut: {},
  ClickedRecenter: {},
  PinchedPreview: { zoom: Schema.Number },
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
  /** What has been typed into the currency picker's search box. */
  currencySearch: Schema.String,
  /** The month the open calendar shows. */
  calendarMonth: Schema.DateTimeUtc,
  /** Counts changes to the invoice. The autosave is keyed on it. */
  edits: Schema.Number,
  /** The value of `edits` that the last successful save wrote. */
  savedEdits: Schema.Number,
  preview: Preview,
  /** How far the preview is zoomed on a wide screen: 1 fits the page to the pane. */
  zoom: Schema.Number,
  notice: Schema.NullOr(Schema.String),
  /**
   * Demo mode. While it is on the invoice on screen is sample data, nothing
   * is saved, and this holds the user's own invoice to put back on the way out.
   */
  demo: Schema.NullOr(Schema.Struct({ own: Invoice.Invoice })),
  /** The import or export dialog that is open, if either. */
  dialog: Schema.NullOr(Dialog),
  /** What has been pasted into the import dialog. */
  importText: Schema.String,
  /** Why the last import or copy failed, shown inside the dialog. */
  dialogError: Schema.NullOr(Schema.String),
  /** Whether the exported JSON has just been copied. */
  copied: Schema.Boolean
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

// Randomness is an effect, so the seed for a sample invoice is drawn in a Command.
export const DrawSeed = Command.make(
  "invoice/DrawSeed",
  {},
  () =>
    Random.nextIntBetween(1, 2_000_000_000).pipe(
      Effect.map((seed) => InvoiceEditorMessage.CompletedDrawSeed({ seed }))
    )
)

export const ParseImport = Command.make(
  "invoice/ParseImport",
  { args: { json: Schema.String }, mode: "switch" },
  ({ json }) =>
    Invoice.fromJson(json).pipe(
      Effect.match({
        onSuccess: (invoice) => InvoiceEditorMessage.SucceededReadImport({ invoice }),
        onFailure: (error) => InvoiceEditorMessage.FailedReadImport({ name: "The pasted text", reason: error.reason })
      })
    )
)

export const CopyExport = Command.make(
  "invoice/CopyExport",
  { args: { json: Schema.String } },
  ({ json }) =>
    Effect.tryPromise(() => globalThis.navigator.clipboard.writeText(json)).pipe(
      Effect.match({
        onSuccess: () => InvoiceEditorMessage.SucceededCopyExport(),
        onFailure: () => InvoiceEditorMessage.FailedCopyExport()
      })
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

// How long the page-size switch takes to slide. It matches the transition in styles.css.
const SWITCH_SLIDE = "200 millis"

// How long a zoom waits before the pages are painted at their new size, so a pinch isn't repainted at every step.
const ZOOM_SETTLE = "120 millis"

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
 * Renders the invoice to a PDF and paints its pages into the element, at once
 * and again on every change to the invoice, the zoom or the viewport. The
 * pages are painted at the element's width, which `ZoomPreview` has changed
 * by the time a zoom has settled. Renders never
 * overlap: changes that arrive while one is running collapse into the latest,
 * which is rendered next, so the preview keeps up with typing without a wait
 * before it starts. What is on screen is the PDF itself, the same bytes a
 * download gets.
 */
export const DrawPreview = Mount.makeStream(
  "DrawPreview",
  { args: { invoice: Invoice.Invoice, zoom: Schema.Number } },
  (node: HTMLElement, _args, changes) => {
    let pageSize: Invoice.PageSize | undefined
    let painted: number | undefined

    return changes.pipe(
      Stream.zipLatest(Stream.concat(Stream.succeed(undefined), viewportChanges(node))),
      Stream.buffer({ capacity: 1, strategy: "sliding" }),
      Stream.mapEffect(([{ invoice, zoom }]) => {
        // A new page size comes from the switch, whose thumb gets to finish its slide first.
        const settle = pageSize !== undefined && pageSize !== invoice.pageSize
          ? Effect.sleep(SWITCH_SLIDE)
          : painted !== undefined && painted !== zoom
          ? Effect.sleep(ZOOM_SETTLE)
          : Effect.void

        pageSize = invoice.pageSize
        painted = zoom

        return Effect.andThen(settle, drawPreview(node, invoice))
      })
    )
  }
)

/** The zoom levels the buttons step through. A pinch can stop anywhere between the first and the last. */
const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4]
const MIN_ZOOM = 0.5
const MAX_ZOOM = 4

const clampZoom = (zoom: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))

const zoomedIn = (zoom: number): number => ZOOM_STEPS.find((step) => step > zoom + 0.001) ?? MAX_ZOOM

const zoomedOut = (zoom: number): number => ZOOM_STEPS.findLast((step) => step < zoom - 0.001) ?? MIN_ZOOM

// The preview only scrolls on its own, and so only zooms, at the `lg` breakpoint and up.
const WIDE_SCREEN = "(min-width: 64rem)"

/**
 * Zooms and pans the preview on a wide screen. The element is the scroller;
 * its `--zoom` sets the width of the sheet inside it (see styles.css), and the
 * scroll position pans, over the `data-pan` area. A zoom keeps one point of the sheet where it is on
 * screen: the pointer for a pinch on a trackpad or a wheel turned with Ctrl or
 * Cmd held, and the middle of the pane for the buttons. Dragging with a mouse
 * pans. A pinch is applied here at once and then emitted, so the Model learns
 * the zoom the element already has.
 */
export const ZoomPreview = Mount.makeStream(
  "ZoomPreview",
  { args: { zoom: Schema.Number } },
  (node: HTMLElement, _args, changes) => {
    const view = node.ownerDocument.defaultView
    let applied = 1

    const isWide = (): boolean => view !== null && view.matchMedia(WIDE_SCREEN).matches

    const apply = (zoom: number, clientX: number, clientY: number): void => {
      const sheet = node.querySelector<HTMLElement>("[data-sheet]")

      applied = zoom

      if (sheet === null) {
        node.style.setProperty("--zoom", String(zoom))

        return
      }

      // Where the anchor sits on the sheet, as a fraction of its size, before and after.
      const before = sheet.getBoundingClientRect()
      const x = before.width === 0 ? 0.5 : (clientX - before.left) / before.width
      const y = before.height === 0 ? 0 : (clientY - before.top) / before.height

      node.style.setProperty("--zoom", String(zoom))

      const after = sheet.getBoundingClientRect()

      node.scrollLeft += after.left + x * after.width - clientX
      node.scrollTop += after.top + y * after.height - clientY
    }

    const fromModel = changes.pipe(
      Stream.map(({ zoom }) => {
        if (zoom === applied) return

        const pane = node.getBoundingClientRect()

        apply(zoom, pane.left + pane.width / 2, pane.top + pane.height / 2)
      }),
      Stream.drain
    )

    const pinches = Stream.callback<number>((queue) =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const listening = new AbortController()
          const { signal } = listening
          let dragging: number | undefined

          node.addEventListener("wheel", (event) => {
            if (!(event.ctrlKey || event.metaKey) || !isWide()) return

            // Otherwise the browser zooms the whole page.
            event.preventDefault()

            const zoom = clampZoom(applied * Math.exp(-event.deltaY / 100))

            if (zoom === applied) return

            apply(zoom, event.clientX, event.clientY)
            Queue.offerUnsafe(queue, zoom)
          }, { passive: false, signal })

          node.addEventListener("pointerdown", (event) => {
            // Only the area under the commands pans: a press on a command, or on a scrollbar, is left alone.
            const pans = event.target instanceof Element && event.target.closest("[data-pan]") !== null

            if (event.pointerType !== "mouse" || event.button !== 0 || !pans || !isWide()) return

            dragging = event.pointerId
            node.setPointerCapture(event.pointerId)
          }, { signal })

          node.addEventListener("pointermove", (event) => {
            if (dragging !== event.pointerId) return

            node.scrollLeft -= event.movementX
            node.scrollTop -= event.movementY
          }, { signal })

          const released = (event: PointerEvent): void => {
            if (dragging === event.pointerId) dragging = undefined
          }

          node.addEventListener("pointerup", released, { signal })
          node.addEventListener("pointercancel", released, { signal })

          return listening
        }),
        (listening) => Effect.sync(() => listening.abort())
      )
    )

    return Stream.merge(fromModel, pinches)
  }
)

/** Emits once at the start and again whenever the element changes size, such as when a web font arrives. */
const sizeChanges = (node: HTMLElement): Stream.Stream<void> =>
  Stream.callback<void>((queue) =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const observer = new ResizeObserver(() => Queue.offerUnsafe(queue, undefined))

        observer.observe(node)

        return observer
      }),
      (observer) => Effect.sync(() => observer.disconnect())
    )
  )

/**
 * Keeps the thumb of a segmented control over the pressed segment. The
 * segments keep their own widths, so the thumb's edges are measured and
 * handed to CSS as custom properties, which a `clip-path` transition follows.
 * Only a change of segment slides: the first placement, and one after the
 * control changed size, are applied with the transition off.
 */
export const TrackThumb = Mount.makeStream(
  "TrackThumb",
  { args: { pressed: Schema.String } },
  (node: HTMLElement, _args, changes) => {
    let placed: string | undefined

    return changes.pipe(
      Stream.zipLatest(sizeChanges(node)),
      Stream.map(([{ pressed }]) => {
        const segment = node.querySelector<HTMLElement>("[aria-pressed=\"true\"]")
        const thumb = node.querySelector<HTMLElement>("[data-thumb]")

        if (segment === null || thumb === null) return

        const track = thumb.getBoundingClientRect()
        const target = segment.getBoundingClientRect()
        const slides = placed !== undefined && placed !== pressed

        if (!slides) thumb.style.transition = "none"

        node.style.setProperty("--thumb-start", `${target.left - track.left}px`)
        node.style.setProperty("--thumb-end", `${track.right - target.right}px`)
        node.setAttribute("data-tracking", "")

        if (!slides) {
          // Reading layout applies the new clip before the transition comes back.
          thumb.getBoundingClientRect()
          thumb.style.transition = ""
        }

        placed = pressed
      }),
      Stream.drain
    )
  }
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

/** Leaves demo mode and puts the user's own invoice back. */
const exitDemo = (model: InvoiceEditorModel): InvoiceEditorModel =>
  model.demo === null ? model : { ...replaced(model, model.demo.own), demo: null }

/** An emptied amount or rate means zero. */
const parseOptional = (text: string, scale: number): Option.Option<number> =>
  text.trim() === "" ? Option.some(0) : Decimal.parse(text, scale)

const itemField = (index: number, field: "quantity" | "unitPrice") => `items.${index}.${field}`

const dateOf = (invoice: Invoice.Invoice, field: typeof DateField.Type): IsoDate.IsoDate =>
  field === "issueDate" ? invoice.issueDate : Invoice.dueDate(invoice)

// Amounts keep the numbers they show when the new currency has more or fewer decimal places.
const pickedCurrency = InvoiceEditorDef.update("PickedCurrency", ($, { value }) => {
  const code = value.trim().toUpperCase()

  return Schema.is(Invoice.CurrencyCode)(code)
    ? { ...replaced($.model, Invoice.withCurrency($.model.invoice, code)), popup: null }
    : $.model
})

// A calendar opens on the month of the date it edits, and the currency picker with an empty search.
const requestedOpenPopup = InvoiceEditorDef.update(
  "RequestedOpenPopup",
  ($, { popup }) =>
    popup === "issueDate" || popup === "dueDate"
      ? $.evolve({
        popup,
        calendarMonth: IsoDate.toDateTime(IsoDate.startOfMonth(dateOf($.model.invoice, popup)))
      })
      : $.evolve({ popup, currencySearch: "" })
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

const submittedImport = InvoiceEditorDef.update(
  "SubmittedImport",
  ($) => $.model.importText.trim() === "" ? $.model : $.run(ParseImport.make({ json: $.model.importText }))
)

const clickedCopyExport = InvoiceEditorDef.update(
  "ClickedCopyExport",
  ($) =>
    Option.match(Invoice.toJsonText($.model.invoice), {
      onNone: () => $.model,
      onSome: (json) => $.run(CopyExport.make({ json }))
    })
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
  readonly updated: (value: string) => InvoiceEditorMessage
}

/** An input whose text has to parse as a number. */
const ParsedInput = InvoiceEditorDef.fragment((h, model: InvoiceEditorModel, options: ParsedOptions) =>
  h.input
    .attrs({
      type: "text",
      inputmode: "decimal",
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
  "origin-(--transform-origin) rounded-xl bg-surface text-primary [box-shadow:var(--shadow-popup)] outline-none transition-[opacity,scale] duration-150 ease-out motion-reduce:transition-none starting:scale-[0.97] starting:opacity-0"

const TRIGGER =
  "flex cursor-pointer items-center gap-1.5 rounded-md text-[14px] text-primary outline-none focus-visible:ring-2 focus-visible:ring-primary/25"

// The popup's radius is 12px and its padding 4px, so an item's is 8px.
const MENU_ITEM =
  "relative flex cursor-default items-center rounded-lg py-1.5 pr-8 pl-2.5 text-[13px] outline-none select-none data-[highlighted]:bg-hover"

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
  `flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground outline-none ${PRESS} hover:bg-hover hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/25 disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground`

const DAY =
  "flex size-8 cursor-pointer items-center justify-center rounded-md text-[13px] tabular-nums outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-primary/25 data-[outside-month]:text-placeholder data-[today]:bg-hover data-[today]:font-medium data-[selected]:!bg-primary data-[selected]:text-primary-foreground"

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

// The currencies most invoices are in come first; the rest follow in the order of their codes.
const COMMON_CURRENCIES = ["USD", "EUR", "GBP", "BRL", "CAD", "AUD", "CHF", "JPY"]
const currencyNames = new Intl.DisplayNames(["en"], { type: "currency" })

const CURRENCY_NAMES = new Map(
  [...COMMON_CURRENCIES, ...Intl.supportedValuesOf("currency").filter((code) => !COMMON_CURRENCIES.includes(code))]
    .map((code) => [code, currencyNames.of(code) ?? code])
)

// The label is what the search matches, so a currency is found by its code or by its name.
const CURRENCY_CHOICES = Array.from(CURRENCY_NAMES, ([code, name]) => ({ value: code, label: `${code} ${name}` }))

/**
 * The currency of the invoice: a button showing its code, which opens a list
 * of every currency with a search box above it.
 */
const CurrencyPicker = InvoiceEditorDef.fragment((h, model: InvoiceEditorModel) =>
  Combobox(h, {
    key: "currency",
    props: {
      open: model.popup === "currency",
      value: model.invoice.currency,
      inputValue: model.currencySearch,
      items: CURRENCY_CHOICES,
      inputInPopup: true,
      autoHighlight: true,
      side: "bottom",
      align: "end",
      sideOffset: 8
    },
    onEmit: {
      RequestedOpen: () => InvoiceEditorMessage.RequestedOpenPopup({ popup: "currency" }),
      RequestedClose: () => InvoiceEditorMessage.RequestedClosePopup({ popup: "currency" }),
      Picked: ({ value }) => InvoiceEditorMessage.PickedCurrency({ value: String(value) }),
      RequestedInputValue: ({ inputValue }) => InvoiceEditorMessage.UpdatedCurrencySearch({ value: inputValue }),
      Highlighted: () => undefined,
      Settled: () => undefined
    },
    view: (combobox) =>
      FieldGroup(h, {
        label: "Currency",
        children: [
          combobox.trigger(h.button.class(TRIGGER).attr("aria-label", `Currency: ${model.invoice.currency}`))
            .children(
              h.span.class("tabular-nums").children(model.invoice.currency),
              combobox.icon(h.span.class("text-muted-foreground")).children(ChevronDownIcon(h))
            ),
          combobox.positioner(h.div.class(POSITIONER)).children(
            combobox.popup(h.div.class(POPUP, "w-64")).children(
              h.div.class("border-b border-line px-3.5 py-2.5").children(
                combobox.input(
                  h.input.class(
                    "w-full bg-transparent text-[13px] text-primary outline-none placeholder:text-placeholder"
                  )
                ).attrs({ placeholder: "Search currencies", "aria-label": "Search currencies", spellcheck: "false" })
              ),
              combobox.empty(h.div.class("px-3 text-center text-[13px] text-muted-foreground *:py-5")).children(
                h.p("No currency found")
              ),
              combobox.list(h.div.class("scroll-fade-y scrollbar-none max-h-72 overflow-y-auto p-1")).children(
                combobox.items.map(({ value }) =>
                  combobox.item({ element: h.div.class(MENU_ITEM, "gap-3"), value }).children(
                    h.span.class("w-9 shrink-0 font-medium tabular-nums").children(value),
                    h.span.class("truncate text-muted-foreground").children(CURRENCY_NAMES.get(value) ?? ""),
                    combobox.itemIndicator({ element: h.span.class("absolute right-2.5"), value })?.children(
                      CheckIcon(h)
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
    CurrencyPicker(h, model),
    TextInput(h, {
      label: "Payment terms",
      value: invoice.paymentTerms,
      placeholder: "Net 30",
      updated: (value) => InvoiceEditorMessage.UpdatedText({ field: "paymentTerms", value })
    })
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
  `flex h-5 w-6 cursor-pointer items-center justify-center rounded-md text-placeholder outline-none ${PRESS} hover:bg-hover hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/25 disabled:hidden`

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

const PRIMARY_BUTTON =
  `cursor-pointer rounded-full bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground outline-none ${PRESS} hover:opacity-85 focus-visible:ring-2 focus-visible:ring-primary/25 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-default disabled:opacity-40 disabled:hover:opacity-40`

const SECONDARY_BUTTON =
  `cursor-pointer rounded-full px-4 py-2 text-[13px] font-medium text-primary shadow-[inset_0_0_0_1px_var(--color-line)] outline-none ${PRESS} hover:bg-hover focus-visible:ring-2 focus-visible:ring-primary/25`

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

const pageSizeLabel = (pageSize: Invoice.PageSize): string => pageSize === "Letter" ? "US Letter" : pageSize

// Shared by a segment and its copy inside the thumb, so the two line up exactly.
const SEGMENT = "px-3 py-1 text-center whitespace-nowrap"

/**
 * A segmented control with a sliding thumb. The thumb is a dark copy of the
 * labels laid exactly over them and clipped to the pressed segment, so each
 * label turns white as the thumb's edge passes it. Moving the clip is paint
 * only: nothing is laid out again while it slides.
 */
const Segmented = InvoiceEditorDef.fragment((h, options: {
  readonly label: string
  readonly pressed: string
  readonly segments: ReadonlyArray<{
    readonly value: string
    readonly label: string
    readonly picked: InvoiceEditorMessage
  }>
}) =>
  h.div
    .class("segmented relative inline-flex rounded-full border border-line bg-background p-0.5 text-[13px]")
    .attrs({ role: "group", "aria-label": options.label })
    .onMount(TrackThumb({ pressed: options.pressed }))
    .children(
      options.segments.map(({ label, picked, value }) =>
        h.button
          .key(value)
          .attrs({ type: "button", "aria-pressed": String(options.pressed === value) })
          .class(
            SEGMENT,
            "cursor-pointer rounded-full text-muted-foreground outline-none hover:text-primary",
            "focus-visible:ring-2 focus-visible:ring-primary/25 [-webkit-tap-highlight-color:transparent]"
          )
          .on("click", picked)
          .children(label)
      ),
      h.div
        .attrs({ "aria-hidden": "true", "data-thumb": "" })
        .class("segmented-thumb pointer-events-none absolute inset-0.5 flex bg-primary text-primary-foreground")
        .children(options.segments.map(({ label, value }) => h.span.key(value).class(SEGMENT).children(label)))
    )
)

const PageSizeSwitch = InvoiceEditorDef.fragment((h, model: InvoiceEditorModel) =>
  Segmented(h, {
    label: "Page size",
    pressed: model.invoice.pageSize,
    segments: Invoice.PageSize.literals.map((pageSize) => ({
      value: pageSize,
      label: pageSizeLabel(pageSize),
      picked: InvoiceEditorMessage.PickedPageSize({ pageSize })
    }))
  })
)

const sampleLabel = (model: InvoiceEditorModel): string => model.demo === null ? "Sample data" : "Exit demo"

const DownloadButton = InvoiceEditorDef.fragment((h) =>
  h.button
    .attr("type", "button")
    .class(PRIMARY_BUTTON)
    .on("click", InvoiceEditorMessage.ClickedDownloadPdf())
    .children(h.isRunning(DownloadPdf) ? "Preparing…" : "Download PDF")
)

/** The commands, across the top of the preview on a wide screen. A small screen gets `CommandDock` instead. */
const Actions = InvoiceEditorDef.fragment((h, model: InvoiceEditorModel) =>
  h.div.class("flex flex-wrap items-center justify-between gap-x-6 gap-y-3 max-lg:hidden").children(
    PageSizeSwitch(h, model),
    h.div.class("flex flex-wrap items-center gap-x-5 gap-y-3").children(
      h.button.attr("type", "button").class(QUIET_BUTTON).on("click", InvoiceEditorMessage.ClickedImportJson())
        .children("Import JSON"),
      h.button.attr("type", "button").class(QUIET_BUTTON).on("click", InvoiceEditorMessage.ClickedExportJson())
        .children("Export JSON"),
      h.button.attr("type", "button").class(QUIET_BUTTON).on("click", InvoiceEditorMessage.ClickedDuplicate())
        .children("Duplicate for next month"),
      h.button.attr("type", "button").class(QUIET_BUTTON).on("click", InvoiceEditorMessage.ClickedSampleData())
        .children(sampleLabel(model)),
      DownloadButton(h)
    )
  )
)

const DOCK = "rounded-2xl bg-dock shadow-[0_0_0_1px_rgb(255_255_255/8%)_inset,0_8px_24px_-4px_rgb(0_0_0/35%)]"

const DOCK_BUTTON =
  `flex h-9 min-w-9 cursor-pointer items-center justify-center gap-1.5 rounded-xl px-2 text-white/75 outline-none ${PRESS} hover:bg-white/10 hover:text-white focus-visible:bg-white/15 focus-visible:text-white active:bg-white/15 [-webkit-tap-highlight-color:transparent]`

const DOCK_DISABLED =
  "disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-white/75"

/**
 * The commands on a small screen: a dock floating over the bottom edge, in
 * reach of a thumb wherever the page is scrolled. Each command is an icon
 * with its name as the label a screen reader and a long press give. The page
 * size opens a smaller dock of its own, just above, with the two sizes.
 */
const CommandDock = InvoiceEditorDef.fragment((h, model: InvoiceEditorModel) => {
  const sample = sampleLabel(model)
  const choosingSize = model.popup === "pageSize"

  return [
    // A press anywhere else puts the page-size dock away.
    choosingSize &&
    h.div
      .class("fixed inset-0 z-20 lg:hidden")
      .on("click", InvoiceEditorMessage.RequestedClosePopup({ popup: "pageSize" })),
    h.nav
      .attr("aria-label", "Commands")
      .class(
        "fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-1/2 z-20 flex -translate-x-1/2 items-center gap-0.5 p-1.5 lg:hidden",
        DOCK
      )
      .children(
        h.a
          .attrs({ href: "#preview", "aria-label": "Preview", title: "Preview" })
          .class(DOCK_BUTTON)
          .children(EyeIcon(h, 18)),
        h.button
          .attrs({ type: "button", "aria-label": "Import JSON", title: "Import JSON" })
          .class(DOCK_BUTTON)
          .on("click", InvoiceEditorMessage.ClickedImportJson())
          .children(ImportIcon(h, 18)),
        h.button
          .attrs({ type: "button", "aria-label": "Export JSON", title: "Export JSON" })
          .class(DOCK_BUTTON)
          .on("click", InvoiceEditorMessage.ClickedExportJson())
          .children(ExportIcon(h, 18)),
        h.button
          .attrs({ type: "button", "aria-label": "Duplicate for next month", title: "Duplicate for next month" })
          .class(DOCK_BUTTON)
          .on("click", InvoiceEditorMessage.ClickedDuplicate())
          .children(CalendarPlusIcon(h, 18)),
        h.button
          .attrs({ type: "button", "aria-label": sample, "aria-pressed": String(model.demo !== null), title: sample })
          .class(DOCK_BUTTON, model.demo !== null && "bg-white/15 !text-amber-300")
          .on("click", InvoiceEditorMessage.ClickedSampleData())
          .children(DiceIcon(h, 18)),
        h.div.class("relative").children(
          h.button
            .attrs({
              type: "button",
              "aria-label": `Page size: ${pageSizeLabel(model.invoice.pageSize)}`,
              "aria-expanded": String(choosingSize),
              title: "Page size"
            })
            .class(DOCK_BUTTON, choosingSize && "bg-white/15 !text-white")
            .on("click", InvoiceEditorMessage.ClickedPageSizeCommand())
            .children(PageIcon(h, 18)),
          choosingSize &&
            h.div
              .attrs({ role: "group", "aria-label": "Page size" })
              .class(
                "absolute bottom-full left-1/2 mb-3 flex -translate-x-1/2 gap-0.5 p-1 text-[13px] font-medium whitespace-nowrap",
                DOCK,
                "rounded-xl transition-[opacity,translate] duration-150 ease-out motion-reduce:transition-none starting:translate-y-1 starting:opacity-0"
              )
              .children(
                Invoice.PageSize.literals.map((pageSize) =>
                  h.button
                    .key(pageSize)
                    .attrs({ type: "button", "aria-pressed": String(model.invoice.pageSize === pageSize) })
                    .class(
                      "cursor-pointer rounded-lg px-3 py-1.5 outline-none focus-visible:bg-white/15 [-webkit-tap-highlight-color:transparent]",
                      PRESS,
                      model.invoice.pageSize === pageSize ? "bg-white/15 text-white" : "text-white/70 hover:text-white"
                    )
                    .on("click", InvoiceEditorMessage.PickedPageSize({ pageSize }))
                    .children(pageSizeLabel(pageSize))
                )
              )
        ),
        h.button
          .attrs({ type: "button", "aria-label": "Download PDF", title: "Download PDF" })
          .class(DOCK_BUTTON, "bg-white/15 text-white")
          .on("click", InvoiceEditorMessage.ClickedDownloadPdf())
          .children(DownloadIcon(h, 18))
      )
  ]
})

// `closedby="any"` on a dialog makes a press on its backdrop a close request, sent as `cancel` like Escape.
const DIALOG =
  "m-auto w-[min(36rem,calc(100vw-2rem))] rounded-2xl bg-surface p-6 text-primary [box-shadow:var(--shadow-dialog)] outline-none backdrop:bg-black/25 transition-[opacity,scale] duration-150 ease-out motion-reduce:transition-none starting:scale-[0.97] starting:opacity-0"

const CODE = "rounded-xl bg-hover p-3 font-mono text-[12px] leading-relaxed text-primary outline-none"

const DialogError = InvoiceEditorDef.fragment((h, model: InvoiceEditorModel) =>
  model.dialogError !== null &&
  h.p.class("text-[13px] text-pretty text-danger").attr("role", "alert").children(model.dialogError)
)

const IMPORT_TYPES = [".json", "application/json"]

// The whole dialog takes a dropped file; the dashed zone says so and lights up while one is dragged over.
const ImportDialog = InvoiceEditorDef.fragment((h, model: InvoiceEditorModel) =>
  h.dialog
    .class(DIALOG)
    .attrs({ "aria-label": "Import JSON", closedby: "any" })
    .modal(model.dialog === "import")
    .on("cancel", InvoiceEditorMessage.RequestedCloseDialog())
    .on("close", InvoiceEditorMessage.ClosedDialog({ dialog: "import" }))
    .children(
      FileDrop(h, {
        props: { accept: IMPORT_TYPES },
        onEmit: {
          Picked: ({ files }) => InvoiceEditorMessage.ChoseImportFiles({ files }),
          Rejected: () => InvoiceEditorMessage.RejectedImportFiles()
        },
        view: (fileDrop) =>
          fileDrop.root(
            h.form.class("group flex flex-col gap-4").on("submit", InvoiceEditorMessage.SubmittedImport())
          ).children(
            h.div.class("flex flex-col gap-1").children(
              h.h2.class("text-[17px] font-semibold tracking-tight").children("Import JSON"),
              h.p.class("text-[13px] text-pretty text-muted-foreground").children(
                "Paste an invoice exported from this app, or drop its file. It replaces the invoice on screen."
              )
            ),
            h.textarea
              .attrs({
                "aria-label": "Invoice JSON",
                rows: "10",
                placeholder: "{ \"number\": \"INV-0001\", … }",
                spellcheck: "false"
              })
              .class(
                CODE,
                "resize-none placeholder:text-placeholder focus-visible:ring-2 focus-visible:ring-primary/25"
              )
              .value(model.importText)
              .on("input", ({ value }) => InvoiceEditorMessage.UpdatedImportText({ value })),
            h.div
              .class(
                "flex items-center justify-center gap-2 rounded-xl border border-dashed border-neutral-300 px-4 py-5 text-[13px] text-muted-foreground",
                "group-data-[drag-over]:border-primary group-data-[drag-over]:bg-hover group-data-[drag-over]:text-primary"
              )
              .children(
                UploadIcon(h),
                h.span("Drop a .json file here, or"),
                fileDrop.trigger(
                  h.button.class(
                    "cursor-pointer rounded-sm font-medium text-primary underline decoration-neutral-300 underline-offset-4 outline-none hover:decoration-primary focus-visible:ring-2 focus-visible:ring-primary/25"
                  )
                ).children("browse")
              ),
            DialogError(h, model),
            h.div.class("flex items-center justify-end gap-2").children(
              h.button.attr("type", "button").class(SECONDARY_BUTTON)
                .on("click", InvoiceEditorMessage.RequestedCloseDialog())
                .children("Cancel"),
              h.button.attr("type", "submit").class(PRIMARY_BUTTON).disabled(model.importText.trim() === "")
                .children("Import")
            )
          )
      })
    )
)

const ExportDialog = InvoiceEditorDef.fragment((h, model: InvoiceEditorModel) =>
  h.dialog
    .class(DIALOG)
    .attrs({ "aria-label": "Export JSON", closedby: "any" })
    .modal(model.dialog === "export")
    .on("cancel", InvoiceEditorMessage.RequestedCloseDialog())
    .on("close", InvoiceEditorMessage.ClosedDialog({ dialog: "export" }))
    .children(
      h.div.class("flex flex-col gap-4").children(
        h.div.class("flex flex-col gap-1").children(
          h.h2.class("text-[17px] font-semibold tracking-tight").children("Export JSON"),
          h.p.class("text-[13px] text-pretty text-muted-foreground").children(
            "The whole invoice as JSON. Import it later to pick up where you left off."
          )
        ),
        h.div.class("relative").children(
          // Rendered only while open, so a closed dialog costs nothing per keystroke.
          h.pre
            .attrs({ tabindex: "0", "aria-label": "Invoice JSON" })
            .class(
              CODE,
              "max-h-80 overflow-auto whitespace-pre select-all focus-visible:ring-2 focus-visible:ring-primary/25"
            )
            .children(model.dialog === "export" ? Option.getOrElse(Invoice.toJsonText(model.invoice), () => "") : ""),
          h.button
            .attrs({
              type: "button",
              "aria-label": model.copied ? "Copied" : "Copy",
              title: model.copied ? "Copied" : "Copy"
            })
            .class(
              GHOST_BUTTON,
              "absolute top-2 right-2 size-8 bg-surface shadow-[0_0_0_1px_var(--color-line)] hover:bg-surface"
            )
            .on("click", InvoiceEditorMessage.ClickedCopyExport())
            .children(model.copied ? CheckIcon(h) : CopyIcon(h))
        ),
        DialogError(h, model),
        h.div.class("flex flex-wrap items-center justify-end gap-2").children(
          h.button.attr("type", "button").class(SECONDARY_BUTTON)
            .on("click", InvoiceEditorMessage.ClickedDownloadExport())
            .children("Export to file"),
          h.button.attr("type", "button").class(PRIMARY_BUTTON)
            .on("click", InvoiceEditorMessage.RequestedCloseDialog())
            .children("Close")
        )
      )
    )
)

const DemoBanner = InvoiceEditorDef.fragment((h, model: InvoiceEditorModel) =>
  model.demo !== null &&
  h.div
    .class(
      // On a small screen the whole page scrolls, so the banner sticks to the top to stay in view.
      "sticky top-0 z-20 flex items-center justify-between gap-x-4 gap-y-1 border-b border-amber-200 bg-amber-50 px-6 py-2.5 text-[13px] text-amber-900 sm:justify-center"
    )
    .attr("role", "status")
    .children(
      h.p.class("text-pretty").children(
        h.strong.class("font-semibold").children("Demo mode."),
        " Sample data, nothing is saved.",
        h.span.class("max-sm:hidden").children(" Your own invoice comes back when you exit.")
      ),
      h.button
        .attr("type", "button")
        .class(
          "shrink-0 cursor-pointer rounded-sm font-medium underline decoration-amber-400 underline-offset-4 outline-none hover:decoration-amber-900 focus-visible:ring-2 focus-visible:ring-amber-900/30"
        )
        .on("click", InvoiceEditorMessage.ClickedExitDemo())
        .children("Exit demo")
    )
)

/**
 * The zoom commands on a wide screen: a dock like `CommandDock`, floating over
 * the bottom of the preview. The percentage in the middle is read out as it
 * changes. A small screen has none: there the browser's own pinch zooms the page.
 */
const ZoomDock = InvoiceEditorDef.fragment((h, model: InvoiceEditorModel) =>
  h.div
    .attrs({ role: "group", "aria-label": "Zoom" })
    .class("absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 items-center gap-0.5 p-1.5 max-lg:hidden", DOCK)
    .children(
      h.button
        .attrs({ type: "button", "aria-label": "Zoom out", title: "Zoom out" })
        .class(DOCK_BUTTON, DOCK_DISABLED)
        .disabled(model.zoom <= MIN_ZOOM)
        .on("click", InvoiceEditorMessage.ClickedZoomOut())
        .children(ZoomOutIcon(h, 18)),
      h.output
        .attr("aria-label", "Zoom level")
        .class("w-12 text-center text-[13px] font-medium text-white tabular-nums select-none")
        .children(`${Math.round(model.zoom * 100)}%`),
      h.button
        .attrs({ type: "button", "aria-label": "Zoom in", title: "Zoom in" })
        .class(DOCK_BUTTON, DOCK_DISABLED)
        .disabled(model.zoom >= MAX_ZOOM)
        .on("click", InvoiceEditorMessage.ClickedZoomIn())
        .children(ZoomInIcon(h, 18)),
      h.div.attr("aria-hidden", "true").class("mx-1 h-5 w-px bg-white/15"),
      h.button
        .attrs({ type: "button", "aria-label": "Re-center", title: "Re-center: fit the page to the pane" })
        .class(DOCK_BUTTON, DOCK_DISABLED)
        .disabled(model.zoom === 1)
        .on("click", InvoiceEditorMessage.ClickedRecenter())
        .children(RecenterIcon(h, 18))
    )
)

// A page's width over its height, which fits the sheet to the pane (see styles.css).
const PAGE_ASPECT: Record<Invoice.PageSize, string> = { A4: "0.7071", Letter: "0.7727" }

const PreviewPane = InvoiceEditorDef.fragment((h, model: InvoiceEditorModel) =>
  h.aside
    .class("dotted relative flex min-w-0 flex-1 scroll-mt-12 flex-col lg:h-full")
    .attrs({ "aria-label": "PDF preview", id: "preview" })
    .children(
      h.div
        .class("preview-scroller min-w-0 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col")
        .onMount(
          ZoomPreview({ zoom: model.zoom }).pipe(Mount.map((zoom) => InvoiceEditorMessage.PinchedPreview({ zoom })))
        )
        .children(
          // The commands stick to the top of the scroller, in reach however the page is zoomed and panned, and a
          // zoomed page slides under them through a blur that fades out (see styles.css).
          h.div.class("preview-bar sticky top-0 left-0 z-10 shrink-0 px-10 pt-6 pb-4 max-lg:hidden").children(
            Actions(h, model)
          ),
          // The area the sheet is fitted to. Its content is as wide as the zoomed sheet, so the padding is there
          // at both ends of a pan, and the dock floats over the last of it.
          h.div.attr("data-pan", "").class(
            "preview-area lg:min-h-0 lg:flex-1",
            model.zoom > 1 && "lg:cursor-grab lg:active:cursor-grabbing"
          ).children(
            h.div.class("px-6 pt-6 pb-10 lg:w-max lg:min-w-full lg:px-10 lg:pt-2 lg:pb-24").children(
              h.div.attr("data-sheet", "").class("preview-sheet flex flex-col gap-4").style({
                "--page-aspect": PAGE_ASPECT[model.invoice.pageSize]
              }).children(
                Preview.match(model.preview, {
                  Pending: () =>
                    h.p.class("text-center text-[13px] text-muted-foreground").children("Rendering the PDF…"),
                  Rendered: () => null,
                  Failed: ({ reason }) =>
                    h.p
                      .class("rounded-xl border border-danger/30 bg-surface px-4 py-3 text-[13px] text-danger")
                      .attr("role", "alert")
                      .children(reason)
                }),
                h.div
                  .class(
                    "pages flex flex-col gap-6 transition-opacity",
                    Preview.is("Failed")(model.preview) && "opacity-40"
                  )
                  .onMount(
                    DrawPreview({ invoice: model.invoice, zoom: model.zoom }).pipe(
                      Mount.map((preview) => InvoiceEditorMessage.ChangedPreview({ preview }))
                    )
                  )
              )
            )
          )
        ),
      ZoomDock(h, model)
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
    currencySearch: "",
    calendarMonth: IsoDate.toDateTime(IsoDate.startOfMonth($.props.initialInvoice.issueDate)),
    edits: 0,
    savedEdits: 0,
    preview: Preview.Pending(),
    zoom: 1,
    notice: $.props.initialNotice,
    demo: null,
    dialog: null,
    importText: "",
    dialogError: null,
    copied: false
  }),
  update: {
    UpdatedText: ($, { field, value }) => edited($.model, { ...$.model.invoice, [field]: value }),
    UpdatedParty: ($, { field, party, value }) =>
      edited($.model, { ...$.model.invoice, [party]: { ...$.model.invoice[party], [field]: value } }),
    UpdatedPartyAddress: ($, { party, value }) =>
      edited($.model, {
        ...$.model.invoice,
        // An emptied box is no lines at all, not one empty line.
        [party]: { ...$.model.invoice[party], addressLines: value === "" ? [] : value.split("\n") }
      }),
    RequestedOpenPopup: requestedOpenPopup,
    // A close request for a popup that another has already replaced changes nothing.
    RequestedClosePopup: ($, { popup }) => $.model.popup === popup ? $.evolve({ popup: null }) : $.model,
    // Escape closes the open popup wherever focus is, such as on the page after a press on the popup's padding.
    PressedEscape: ($) => $.evolve({ popup: null }),
    PickedDueTerms: pickedDueTerms,
    PickedDate: pickedDate,
    RequestedCalendarMonth: ($, { month }) => $.evolve({ calendarMonth: month }),
    PickedCurrency: pickedCurrency,
    UpdatedCurrencySearch: ($, { value }) => $.evolve({ currencySearch: value }),
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
    // Picking in the dock's own little menu also puts that menu away.
    PickedPageSize: ($, { pageSize }) => ({
      ...edited($.model, { ...$.model.invoice, pageSize }),
      popup: $.model.popup === "pageSize" ? null : $.model.popup
    }),
    // Picking in the dock's own little menu also puts that menu away.
    ClickedPageSizeCommand: ($) => $.evolve({ popup: $.model.popup === "pageSize" ? null : "pageSize" }),
    ClickedDuplicate: ($) => replaced($.model, Invoice.duplicateForNextMonth($.model.invoice)),
    // The button is a toggle: it enters demo mode, and pressed again it leaves.
    ClickedSampleData: ($) => $.model.demo === null ? $.run(DrawSeed.make()) : exitDemo($.model),
    // Entering sets the user's own invoice aside, to put back on the way out.
    CompletedDrawSeed: ($, { seed }) => ({
      ...replaced($.model, SampleInvoice.make($.props.today, seed)),
      demo: $.model.demo ?? { own: $.model.invoice }
    }),
    ClickedExitDemo: ($) => exitDemo($.model),
    ClickedDownloadPdf: ($) => $.run(DownloadPdf.make({ invoice: $.model.invoice })),
    SucceededDownloadPdf: ($) => $.evolve({ notice: null }),
    FailedDownloadPdf: ($, { reason }) => $.evolve({ notice: reason }),
    ClickedImportJson: ($) => $.evolve({ dialog: "import", importText: "", dialogError: null }),
    ClickedExportJson: ($) => $.evolve({ dialog: "export", dialogError: null, copied: false }),
    RequestedCloseDialog: ($) => $.evolve({ dialog: null }),
    // `close` also follows the editor's own close, and one dialog closing as
    // another opens in its place, so it only counts for the dialog still open.
    ClosedDialog: ($, { dialog }) => $.model.dialog === dialog ? $.evolve({ dialog: null }) : $.model,
    UpdatedImportText: ($, { value }) => $.evolve({ importText: value, dialogError: null }),
    SubmittedImport: submittedImport,
    ChoseImportFiles: choseImportFiles,
    SucceededReadImport: ($, { invoice }) => ({
      ...replaced($.model, invoice),
      notice: null,
      demo: null,
      dialog: null,
      importText: "",
      dialogError: null
    }),
    FailedReadImport: ($, { name, reason }) =>
      $.evolve({ dialogError: `${name} isn't an invoice this app can open. ${reason}` }),
    RejectedImportFiles: ($) => $.evolve({ dialogError: "Drop a single .json file." }),
    ClickedCopyExport: clickedCopyExport,
    SucceededCopyExport: ($) => $.evolve({ copied: true, dialogError: null }),
    FailedCopyExport: ($) =>
      $.evolve({
        copied: false,
        dialogError: "The browser didn't allow copying. Select the text and copy it instead."
      }),
    ClickedDownloadExport: ($) => $.run(ExportJson.make({ invoice: $.model.invoice })),
    RequestedSave: requestedSave,
    SucceededSaveInvoice: ($, { edits }) => $.evolve({ savedEdits: edits }),
    FailedSaveInvoice: ($, { reason }) =>
      $.evolve({ notice: `The invoice couldn't be saved in this browser. ${reason}` }),
    ChangedPreview: ($, { preview }) => $.evolve({ preview }),
    ClickedZoomIn: ($) => $.evolve({ zoom: zoomedIn($.model.zoom) }),
    ClickedZoomOut: ($) => $.evolve({ zoom: zoomedOut($.model.zoom) }),
    // At 1 the sheet fits the pane, where the layout centres it.
    ClickedRecenter: ($) => $.evolve({ zoom: 1 }),
    PinchedPreview: ($, { zoom }) => $.evolve({ zoom: clampZoom(zoom) }),
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
    // Sample data is never saved, so the user's own invoice is still in storage after a reload.
    model.demo === null && model.edits !== model.savedEdits &&
    Subscription.make(
      "autosave",
      model.edits,
      () => Stream.fromEffect(Effect.as(Effect.sleep(AUTOSAVE_DELAY), InvoiceEditorMessage.RequestedSave()))
    )
  ],
  view: (h, model) =>
    // On a small screen the page leaves room at the bottom for the command bar.
    h.div.class("flex flex-col max-lg:pb-24 lg:h-dvh").children(
      DemoBanner(h, model),
      h.div.class("flex flex-col lg:min-h-0 lg:flex-1 lg:flex-row").children(
        h.main
          .class(
            "flex w-full shrink-0 flex-col gap-14 border-line px-6 py-10 lg:h-full lg:w-[520px] lg:overflow-y-auto lg:border-r lg:px-12"
          )
          .children(
            h.header.class("flex flex-col gap-1").children(
              h.h1.class("text-[15px] font-semibold tracking-tight text-primary").children("Invoice"),
              h.p.class("text-[13px] text-muted-foreground").attr("role", "status").children(
                model.demo !== null
                  ? "Demo mode: nothing is saved"
                  : model.edits === model.savedEdits
                  ? "Saved in this browser"
                  : "Saving…"
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
      ),
      CommandDock(h, model),
      ImportDialog(h, model),
      ExportDialog(h, model)
    )
})

export const InvoiceEditor = InvoiceEditorNoDeps.pipe(
  Component.provide(
    Layer.mergeAll(
      SaveInvoice.layer,
      DownloadPdf.layer,
      PdfCanvas.layer
    ).pipe(
      Layer.provideMerge(Layer.mergeAll(InvoiceStore.layer, PdfRenderer.layer.pipe(Layer.provide(bundledFonts))))
    )
  )
)
