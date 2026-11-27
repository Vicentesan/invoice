import * as Decimal from "#domain/Decimal"
import * as Invoice from "#domain/Invoice"
import * as IsoDate from "#domain/IsoDate"
import * as Money from "#domain/Money"
import { type PDFDocument, type PDFFont, type PDFPage, rgb, setCharacterSpacing } from "pdf-lib"

export interface Fonts {
  readonly regular: PDFFont
  readonly semiBold: PDFFont
}

const PAGE_SIZES: Record<Invoice.PageSize, readonly [width: number, height: number]> = {
  A4: [595.28, 841.89],
  Letter: [612, 792]
}

const MARGIN = 48
const FOOTER = 24
const INK = rgb(0.09, 0.1, 0.12)
const MUTED = rgb(0.42, 0.45, 0.5)
const RULE = rgb(0.86, 0.88, 0.9)

const LABEL = 6.5

/** Extra space between the letters of an uppercase label. */
const TRACKING = 0.55
const BODY = 9.5
const STRONG = 10.5
const LINE = 13.5

/** An unbreakable value is scaled down to fit its column, but never below this size. */
const MIN_FIT = 5

/** Tabs and exotic spaces become plain spaces, and other control characters go. */
const clean = (text: string): string => text.replace(/[\t  ]/g, " ").replace(/\p{Cc}/gu, "").trim()

const breakWord = (word: string, font: PDFFont, size: number, width: number): Array<string> => {
  const pieces: Array<string> = []
  let piece = ""

  for (const character of word) {
    if (piece !== "" && font.widthOfTextAtSize(piece + character, size) > width) {
      pieces.push(piece)
      piece = character
    } else {
      piece += character
    }
  }

  return piece === "" ? pieces : [...pieces, piece]
}

/**
 * Wraps at spaces only and never hyphenates. A single word wider than the
 * whole column is the one thing split, between characters.
 */
const wrap = (text: string, font: PDFFont, size: number, width: number): Array<string> => {
  const lines: Array<string> = []

  for (const paragraph of text.split("\n")) {
    let line = ""

    for (const word of clean(paragraph).split(/ +/)) {
      const candidate = line === "" ? word : `${line} ${word}`

      if (font.widthOfTextAtSize(candidate, size) <= width) {
        line = candidate
      } else if (font.widthOfTextAtSize(word, size) <= width) {
        lines.push(line)
        line = word
      } else {
        const pieces = breakWord(word, font, size, width)

        if (line !== "") lines.push(line)

        lines.push(...pieces.slice(0, -1))
        line = pieces.at(-1) ?? ""
      }
    }

    lines.push(line)
  }

  return lines
}

/** The size at which `text` fits `width` on one line. */
const fit = (text: string, font: PDFFont, size: number, width: number): number => {
  const natural = font.widthOfTextAtSize(text, size)

  return natural <= width ? size : Math.max(MIN_FIT, size * width / natural)
}

/**
 * Draws the invoice onto fresh pages of `document` and returns the characters
 * the embedded font has no glyph for. Text holding one is left out, so the
 * caller must treat a non-empty result as a failed render.
 */
export const drawInvoice = (document: PDFDocument, fonts: Fonts, invoice: Invoice.Invoice): ReadonlyArray<string> => {
  const [pageWidth, pageHeight] = PAGE_SIZES[invoice.pageSize]
  const left = MARGIN
  const right = pageWidth - MARGIN
  const width = right - left
  const supported = new Set(fonts.regular.getCharacterSet())
  const missing = new Set<string>()
  const totals = Invoice.totals(invoice)
  const money = (minor: number) => Money.format(minor, invoice.currency)

  let page: PDFPage = document.addPage([pageWidth, pageHeight])
  /** The top of the next thing to draw. */
  let y = pageHeight - MARGIN

  interface Style {
    readonly font?: PDFFont
    readonly size?: number
    readonly color?: ReturnType<typeof rgb>
    /** Right-align so the text ends at `x`. */
    readonly end?: boolean
    /** Extra space after each character. */
    readonly tracking?: number
  }

  /** Draws one line with its top at `top`. */
  const draw = (text: string, x: number, top: number, style: Style = {}): void => {
    const { color = INK, end = false, font = fonts.regular, size = BODY, tracking = 0 } = style
    const unsupported = Array.from(text).filter((character) => !supported.has(character.codePointAt(0) ?? 0))

    if (unsupported.length > 0) {
      for (const character of unsupported) missing.add(character)

      return
    }

    if (text === "") return

    const textWidth = font.widthOfTextAtSize(text, size) + tracking * (Array.from(text).length - 1)

    page.pushOperators(setCharacterSpacing(tracking))
    page.drawText(text, { x: end ? x - textWidth : x, y: top - size, font, size, color })
    page.pushOperators(setCharacterSpacing(0))
  }

  /** A small uppercase caption, as above a header value or a table column. */
  const label = (text: string, x: number, top: number, end = false): void => {
    draw(text.toUpperCase(), x, top, { font: fonts.semiBold, size: LABEL, color: MUTED, tracking: TRACKING, end })
  }

  /** Draws a value that must never break, shrinking it when the column is too narrow. */
  const drawUnbroken = (text: string, x: number, top: number, maxWidth: number, style: Style = {}): void => {
    const { font = fonts.regular, size = BODY } = style

    draw(text, x, top, { ...style, size: fit(text, font, size, maxWidth) })
  }

  const rule = (top: number, from = left, to = right): void => {
    page.drawLine({ start: { x: from, y: top }, end: { x: to, y: top }, thickness: 0.6, color: RULE })
  }

  const verticalRule = (x: number, from: number, to: number): void => {
    page.drawLine({ start: { x, y: from }, end: { x, y: to }, thickness: 0.6, color: RULE })
  }

  /** Starts a new page when fewer than `height` points are left on this one. */
  const ensure = (height: number): boolean => {
    if (y - height >= MARGIN + FOOTER) return false

    page = document.addPage([pageWidth, pageHeight])
    y = pageHeight - MARGIN

    return true
  }

  /** Opens a section below the table: a rule across the page, then its caption. */
  const heading = (text: string): void => {
    ensure(LINE * 4)
    rule(y)
    y -= 18
    label(text, left, y)
    y -= LABEL + 10
  }

  // Header row.
  const headerFields = [
    { label: "Invoice no", value: clean(invoice.number) },
    { label: "Issued", value: IsoDate.format(invoice.issueDate) },
    { label: "Due date", value: IsoDate.format(Invoice.dueDate(invoice)) },
    { label: "Terms", value: clean(invoice.paymentTerms) }
  ].filter((field) => field.value !== "")

  const headerColumn = width / headerFields.length

  headerFields.forEach((field, index) => {
    const x = left + headerColumn * index

    label(field.label, x, y)
    drawUnbroken(field.value, x, y - LABEL - 6, headerColumn - 12, { size: STRONG })
  })
  y -= LABEL + 6 + STRONG + 16
  rule(y)

  const partiesTop = y

  y -= 18

  // From and Bill to, side by side.
  const gutter = 40
  const partyWidth = (width - gutter) / 2

  const drawParty = (caption: string, party: Invoice.Party, x: number): number => {
    let top = y

    label(caption, x, top)
    top -= LABEL + 10

    for (const line of clean(party.name) === "" ? [] : wrap(party.name, fonts.semiBold, STRONG, partyWidth)) {
      draw(line, x, top, { font: fonts.semiBold, size: STRONG })
      top -= LINE + 1
    }

    const addressLines = [...party.addressLines, party.country].filter((line) => clean(line) !== "")

    for (const line of addressLines.flatMap((text) => wrap(text, fonts.regular, BODY, partyWidth))) {
      draw(line, x, top)
      top -= LINE
    }

    const taxId = clean(party.taxId)

    if (taxId !== "") {
      const taxIdLabel = clean(party.taxIdLabel)

      drawUnbroken(taxIdLabel === "" ? taxId : `${taxIdLabel}: ${taxId}`, x, top, partyWidth)
      top -= LINE
    }

    return top
  }

  y = Math.min(drawParty("From", invoice.from, left), drawParty("Bill to", invoice.billTo, left + partyWidth + gutter))
  y -= 14
  rule(y)
  verticalRule(left + partyWidth + gutter / 2, partiesTop, y)
  y -= 22

  // Line items.
  const amountEnd = right
  const unitEnd = right - 96
  const quantityEnd = right - 192
  const descriptionWidth = quantityEnd - 56 - left

  const tableHeader = (): void => {
    label("Description", left, y)
    label("Qty", quantityEnd, y, true)
    label("Unit price", unitEnd, y, true)
    label("Amount", amountEnd, y, true)
    y -= LABEL + 9
    rule(y)
    y -= 8
  }

  tableHeader()
  invoice.items.forEach((item, index) => {
    const amount = totals.lines[index] ?? 0

    if (clean(item.description) === "" && amount === 0) return

    const lines = wrap(item.description, fonts.regular, BODY, descriptionWidth)
    const rowHeight = lines.length * LINE

    if (ensure(rowHeight + 8)) tableHeader()

    lines.forEach((line, lineIndex) => draw(line, left, y - lineIndex * LINE))
    draw(Decimal.formatTrimmed(item.quantity, Money.QUANTITY_SCALE), quantityEnd, y, { end: true })
    draw(money(item.unitPrice), unitEnd, y, { end: true })
    draw(money(amount), amountEnd, y, { end: true })
    y -= rowHeight + 4
    rule(y)
    y -= 8
  })

  // Totals, right-aligned under the amounts.
  const totalRows = [
    ...(totals.discount !== 0 || totals.tax !== 0 ? [{ label: "Subtotal", value: money(totals.subtotal) }] : []),
    ...(totals.discount === 0 ? [] : [{ label: "Discount", value: money(-totals.discount) }]),
    ...(invoice.taxRate === 0
      ? []
      : [{ label: `Tax (${Decimal.formatTrimmed(invoice.taxRate, Money.RATE_SCALE)}%)`, value: money(totals.tax) }])
  ]

  const totalsStart = right - 220

  ensure(totalRows.length * (LINE + 4) + 40)
  y -= 4

  for (const row of totalRows) {
    draw(row.label, totalsStart, y, { color: MUTED })
    draw(row.value, right, y, { end: true })
    y -= LINE + 4
  }

  if (totalRows.length > 0) {
    rule(y, totalsStart)
    y -= 8
  }

  draw(`Total (${invoice.currency})`, totalsStart, y + -1, { font: fonts.semiBold, size: STRONG })
  draw(money(totals.total), right, y, { font: fonts.semiBold, size: 12, end: true })
  y -= 12 + 30

  // Payment instructions: only the fields that were filled in.
  const paymentRows = Invoice.paymentRows(invoice.payment)
  const valueStart = left + 150

  if (paymentRows.length > 0) {
    heading("Payment instructions")

    for (const row of paymentRows) {
      const lines = row.unbreakable ? [clean(row.value)] : wrap(row.value, fonts.regular, BODY, right - valueStart)

      ensure(lines.length * LINE)
      drawUnbroken(row.label, left, y, valueStart - left - 10, { color: MUTED })

      if (row.unbreakable) {
        drawUnbroken(clean(row.value), valueStart, y, right - valueStart)
      } else {
        lines.forEach((line, lineIndex) => draw(line, valueStart, y - lineIndex * LINE))
      }

      y -= lines.length * LINE + 2
    }

    y -= 20
  }

  if (clean(invoice.notes) !== "") {
    heading("Notes")

    for (const line of wrap(invoice.notes.trim(), fonts.regular, BODY, width)) {
      ensure(LINE)
      draw(line, left, y)
      y -= LINE
    }
  }

  const pages = document.getPages()

  if (pages.length > 1) {
    pages.forEach((numbered, index) => {
      page = numbered
      draw(`Page ${index + 1} of ${pages.length}`, right, MARGIN - 6, { size: 8, color: MUTED, end: true })
    })
  }

  return Array.from(missing)
}
