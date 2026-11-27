import * as Decimal from "./Decimal.ts"

/**
 * Money is an integer count of the currency's minor units (cents for USD,
 * whole yen for JPY). Quantities are thousandths and tax rates are
 * thousandths of a percent, so every calculation stays in integers.
 */

export const QUANTITY_SCALE = 3
export const RATE_SCALE = 3

const LOCALE = "en-US"

/** How many minor-unit digits a currency has: 2 for USD, 0 for JPY, 3 for KWD. */
export const minorUnitDigits = (currency: string): number =>
  new Intl.NumberFormat(LOCALE, { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2

/**
 * Formats minor units for display, such as "$1,234.50". The amount reaches
 * `Intl.NumberFormat` as a decimal string, never as a float. No-break spaces
 * become plain spaces so the text copies cleanly out of a PDF.
 */
export const format = (minor: number, currency: string): string => {
  const decimal = Decimal.format(minor, minorUnitDigits(currency))
  const formatter = new Intl.NumberFormat(LOCALE, { style: "currency", currency })
  const text = Decimal.isNumeric(decimal) ? formatter.format(decimal) : decimal

  return text.replace(/[  ]/g, " ")
}

/** The amount for a line: quantity (thousandths) times unit price. */
export const lineAmount = (quantity: number, unitPrice: number): number =>
  Decimal.multiplyDivide(quantity, unitPrice, 10 ** QUANTITY_SCALE)

/** `rate` (thousandths of a percent) of an amount. */
export const percentage = (amount: number, rate: number): number =>
  Decimal.multiplyDivide(amount, rate, 100 * 10 ** RATE_SCALE)

/** Keeps the displayed amount when the currency's minor-unit digits change. */
export const convertDigits = (minor: number, fromCurrency: string, toCurrency: string): number =>
  Decimal.rescale(minor, minorUnitDigits(fromCurrency), minorUnitDigits(toCurrency))
