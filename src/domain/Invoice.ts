import { UiSchema } from "@effect/ui"
import { Effect, Schema } from "effect"
import * as IsoDate from "./IsoDate.ts"
import * as Money from "./Money.ts"

export const PageSize = Schema.Literals(["A4", "Letter"])

export type PageSize = typeof PageSize.Type

export const NetDays = Schema.Literals([15, 30, 45, 60])

export type NetDays = typeof NetDays.Type

export const NET_DAYS: ReadonlyArray<NetDays> = NetDays.literals

/** When the invoice is due: a number of days after the issue date, or a date of its own. */
export const Due = UiSchema.TaggedEnum({
  Net: { days: NetDays },
  Custom: { date: IsoDate.IsoDate }
})

export type Due = typeof Due.Type

export const Party = Schema.Struct({
  name: Schema.String,
  addressLines: Schema.Array(Schema.String),
  country: Schema.String,
  taxIdLabel: Schema.String,
  taxId: Schema.String
})

export type Party = typeof Party.Type

export const LineItem = Schema.Struct({
  description: Schema.String,
  /** Thousandths: 1500 is a quantity of 1.5. */
  quantity: Schema.Int,
  /** Minor units of the invoice's currency. */
  unitPrice: Schema.Int
})

export type LineItem = typeof LineItem.Type

/**
 * One line of the payment instructions, such as "IBAN" and its number. Both
 * parts are free text, so the block fits a wire, a local transfer or anything
 * else. A field with an empty value is left out of the PDF.
 */
export const PaymentField = Schema.Struct({
  label: Schema.String,
  value: Schema.String
})

export type PaymentField = typeof PaymentField.Type

export const CurrencyCode = Schema.String.check(
  Schema.isPattern(/^[A-Z]{3}$/, {
    description: "a three-letter ISO 4217 currency code"
  })
)

export type CurrencyCode = typeof CurrencyCode.Type

export const Invoice = Schema.Struct({
  number: Schema.String,
  issueDate: IsoDate.IsoDate,
  due: Due,
  currency: CurrencyCode,
  paymentTerms: Schema.String,
  from: Party,
  billTo: Party,
  items: Schema.Array(LineItem),
  /** Thousandths of a percent: 8875 is 8.875%. Zero means no tax. */
  taxRate: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  /** Minor units taken off the subtotal before tax. Zero means no discount. */
  discount: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  payment: Schema.Array(PaymentField),
  notes: Schema.String,
  pageSize: PageSize
})

export type Invoice = typeof Invoice.Type

/** The invoice as JSON text, for storage and for import and export. */
export const InvoiceFromJson = Schema.fromJsonString(Invoice)

/** JSON text that isn't a valid invoice, or an invoice that can't be written as one. */
export class InvalidInvoice extends Schema.TaggedError<InvalidInvoice>()("InvalidInvoice", {
  reason: Schema.String
}) {}

const invalid = (error: Schema.SchemaError) => new InvalidInvoice({ reason: error.message })

/** Decodes and validates JSON text with the invoice Schema. */
export const fromJson = (json: string): Effect.Effect<Invoice, InvalidInvoice> =>
  Schema.decodeUnknownEffect(InvoiceFromJson)(json).pipe(Effect.mapError(invalid))

/** Encodes with the invoice Schema into indented JSON text. */
export const toJson = (invoice: Invoice): Effect.Effect<string, InvalidInvoice> =>
  Schema.encodeEffect(Invoice)(invoice).pipe(
    Effect.map((encoded) => JSON.stringify(encoded, null, 2)),
    Effect.mapError(invalid)
  )

const emptyParty: Party = {
  name: "",
  addressLines: [],
  country: "",
  taxIdLabel: "Tax ID",
  taxId: ""
}

export const emptyLineItem: LineItem = {
  description: "",
  quantity: 1000,
  unitPrice: 0
}

export const termsLabel = (days: NetDays): string => `Net ${days}`

/** A blank invoice issued on `issueDate`. */
export const empty = (issueDate: IsoDate.IsoDate): Invoice => ({
  number: "INV-0001",
  issueDate,
  due: Due.Net({ days: 30 }),
  currency: "USD",
  paymentTerms: termsLabel(30),
  from: emptyParty,
  billTo: emptyParty,
  items: [emptyLineItem],
  taxRate: 0,
  discount: 0,
  payment: ["Beneficiary", "Bank name", "Account number", "SWIFT / BIC"].map((label) => ({ label, value: "" })),
  notes: "",
  pageSize: "A4"
})

export const dueDate = (
  invoice: Pick<Invoice, "issueDate" | "due">
): IsoDate.IsoDate =>
  Due.match(invoice.due, {
    Net: ({ days }) => IsoDate.addDays(invoice.issueDate, days),
    Custom: ({ date }) => date
  })

export interface Totals {
  /** One amount per line item, in order. */
  readonly lines: ReadonlyArray<number>
  readonly subtotal: number
  readonly discount: number
  readonly tax: number
  readonly total: number
}

/** The discount comes off the subtotal, and tax is charged on what is left. */
export const totals = (
  invoice: Pick<Invoice, "items" | "taxRate" | "discount">
): Totals => {
  const lines = invoice.items.map((item) => Money.lineAmount(item.quantity, item.unitPrice))
  const subtotal = lines.reduce((sum, amount) => sum + amount, 0)
  const tax = Money.percentage(subtotal - invoice.discount, invoice.taxRate)

  return {
    lines,
    subtotal,
    discount: invoice.discount,
    tax,
    total: subtotal - invoice.discount + tax
  }
}

/**
 * Adds one to the last run of digits and keeps its zero padding: "INV-0009"
 * becomes "INV-0010". A number with no digits gets "-2" appended.
 */
export const nextNumber = (number: string): string => {
  const match = /^(.*?)(\d+)(\D*)$/s.exec(number)

  if (match === null) return `${number}-2`
  const [, prefix = "", digits = "", suffix = ""] = match

  return `${prefix}${String(BigInt(digits) + 1n).padStart(digits.length, "0")}${suffix}`
}

/**
 * The same invoice for the following month: the number goes up by one and the
 * dates move one calendar month on, clamped to the month's end. A "Net" due
 * date follows the new issue date.
 */
export const duplicateForNextMonth = (invoice: Invoice): Invoice => ({
  ...invoice,
  number: nextNumber(invoice.number),
  issueDate: IsoDate.addMonths(invoice.issueDate, 1),
  due: Due.match(invoice.due, {
    Net: (due) => due,
    Custom: ({ date }) => Due.Custom({ date: IsoDate.addMonths(date, 1) })
  })
})

/** Re-expresses every amount when the currency changes, keeping what is displayed. */
export const withCurrency = (
  invoice: Invoice,
  currency: CurrencyCode
): Invoice => ({
  ...invoice,
  currency,
  discount: Money.convertDigits(invoice.discount, invoice.currency, currency),
  items: invoice.items.map((item) => ({
    ...item,
    unitPrice: Money.convertDigits(item.unitPrice, invoice.currency, currency)
  }))
})

const patched = <A>(items: ReadonlyArray<A>, index: number, patch: Partial<A>): ReadonlyArray<A> =>
  items.map((item, position) => position === index ? { ...item, ...patch } : item)

const without = <A>(items: ReadonlyArray<A>, index: number): ReadonlyArray<A> =>
  items.filter((_, position) => position !== index)

/** Swaps the entry at `index` with the one `offset` places away, when there is one. */
const moved = <A>(items: ReadonlyArray<A>, index: number, offset: -1 | 1): ReadonlyArray<A> => {
  const item = items[index]
  const other = items[index + offset]

  if (item === undefined || other === undefined) return items

  return items.map((current, position) => position === index ? other : position === index + offset ? item : current)
}

/** Replaces some fields of the line item at `index`. */
export const withItem = (invoice: Invoice, index: number, patch: Partial<LineItem>): Invoice => ({
  ...invoice,
  items: patched(invoice.items, index, patch)
})

/** Replaces the tax rate, the discount or both. */
export const withAmounts = (invoice: Invoice, patch: Partial<Pick<Invoice, "taxRate" | "discount">>): Invoice => ({
  ...invoice,
  ...patch
})

export const addItem = (invoice: Invoice): Invoice => ({ ...invoice, items: [...invoice.items, emptyLineItem] })

export const removeItem = (invoice: Invoice, index: number): Invoice => ({
  ...invoice,
  items: without(invoice.items, index)
})

export const moveItem = (invoice: Invoice, index: number, offset: -1 | 1): Invoice => ({
  ...invoice,
  items: moved(invoice.items, index, offset)
})

/** Labels offered when adding a payment field. Any other label can be typed in. */
export const PAYMENT_LABELS: ReadonlyArray<string> = [
  "Beneficiary",
  "Bank name",
  "Bank address",
  "Account number",
  "IBAN",
  "SWIFT / BIC",
  "Routing / ABA",
  "Sort code",
  "Intermediary bank",
  "Intermediary SWIFT / BIC",
  "Intermediary ABA",
  "Intermediary account",
  "Reference"
]

export const withPaymentField = (invoice: Invoice, index: number, patch: Partial<PaymentField>): Invoice => ({
  ...invoice,
  payment: patched(invoice.payment, index, patch)
})

export const addPaymentField = (invoice: Invoice, label: string): Invoice => ({
  ...invoice,
  payment: [...invoice.payment, { label, value: "" }]
})

export const removePaymentField = (invoice: Invoice, index: number): Invoice => ({
  ...invoice,
  payment: without(invoice.payment, index)
})

export const movePaymentField = (invoice: Invoice, index: number, offset: -1 | 1): Invoice => ({
  ...invoice,
  payment: moved(invoice.payment, index, offset)
})

/**
 * Picks a "Net" preset. Payment terms that were empty or still named a preset
 * follow it; terms the user wrote themselves are kept.
 */
export const withNetDue = (invoice: Invoice, days: NetDays): Invoice => ({
  ...invoice,
  due: Due.Net({ days }),
  paymentTerms:
    invoice.paymentTerms.trim() === "" || NET_DAYS.some((preset) => termsLabel(preset) === invoice.paymentTerms)
      ? termsLabel(days)
      : invoice.paymentTerms
})

/** The file name a download of this invoice gets: `invoice-<number>.pdf`. */
export const fileName = (
  invoice: Pick<Invoice, "number">,
  extension: "pdf" | "json"
): string => {
  const number = invoice.number
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")

  return `invoice-${number === "" ? "draft" : number}.${extension}`
}

export interface PaymentRow {
  readonly label: string
  readonly value: string
  /** Identifiers such as an IBAN or a SWIFT code, which must stay on one line. */
  readonly unbreakable: boolean
}

const IDENTIFIER_LABEL = /iban|swift|bic|account|routing|aba|sort code|number|code|key|id\b|no\.?$/i

/**
 * Whether a payment value is an identifier rather than prose. Identifiers are
 * written in digits and capitals, so a value with no lowercase word counts,
 * and so does any value whose label names one.
 */
export const isIdentifier = (field: PaymentField): boolean =>
  IDENTIFIER_LABEL.test(field.label) || !/\p{Ll}{3,}/u.test(field.value)

/** The payment fields to print, in order. A field with an empty value has no row at all. */
export const paymentRows = (payment: ReadonlyArray<PaymentField>): ReadonlyArray<PaymentRow> =>
  payment.flatMap((field) => {
    const value = field.value.trim()

    return value === "" ? [] : [{ label: field.label.trim(), value, unbreakable: isIdentifier(field) }]
  })
