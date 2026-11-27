import { Option } from "effect"

/**
 * Fixed-point decimals held as safe integers: `value / 10 ** scale`. Money is
 * a decimal whose scale is the currency's minor-unit digits, so no amount is
 * ever a float.
 */

const DECIMAL = /^(-?)(\d*)(?:\.(\d*))?$/

/**
 * Parses what a person types ("1,234.50", " 12 ", "-3.5") into an integer at
 * `scale`. Text with more fraction digits than `scale` is rejected rather than
 * rounded, so a parsed value always prints back as it was typed.
 */
export const parse = (text: string, scale: number): Option.Option<number> => {
  const match = DECIMAL.exec(text.replace(/[\s,]/g, ""))

  if (match === null) return Option.none()
  const [, sign = "", whole = "", fraction = ""] = match

  if (whole === "" && fraction === "") return Option.none()

  if (fraction.length > scale) return Option.none()
  const value = Number(`${whole}${fraction.padEnd(scale, "0")}`)

  if (!Number.isSafeInteger(value)) return Option.none()

  return Option.some(sign === "-" && value !== 0 ? -value : value)
}

/** Prints an integer at `scale` as a plain decimal string, such as "-1234.50". */
export const format = (value: number, scale: number): string => {
  const digits = String(Math.abs(value)).padStart(scale + 1, "0")
  const whole = digits.slice(0, digits.length - scale)
  const fraction = scale === 0 ? "" : `.${digits.slice(digits.length - scale)}`

  return `${value < 0 ? "-" : ""}${whole}${fraction}`
}

/** Narrows to the decimal strings `Intl.NumberFormat` formats exactly, with no float in between. */
export const isNumeric = (text: string): text is `${number}` => /^-?\d+(\.\d+)?$/.test(text)

/** Like `format`, without trailing fraction zeros: 1500 at scale 3 is "1.5". */
export const formatTrimmed = (value: number, scale: number): string => {
  const text = format(value, scale)

  return scale === 0 ? text : text.replace(/\.?0+$/, "")
}

/** Integer division rounded half away from zero. */
export const divideRounded = (numerator: bigint, denominator: bigint): bigint => {
  const negative = (numerator < 0n) !== (denominator < 0n)
  const n = numerator < 0n ? -numerator : numerator
  const d = denominator < 0n ? -denominator : denominator
  const quotient = (n * 2n + d) / (d * 2n)

  return negative ? -quotient : quotient
}

/** `a * b / divisor`, exact in the product and rounded half away from zero. */
export const multiplyDivide = (a: number, b: number, divisor: number): number =>
  Number(divideRounded(BigInt(a) * BigInt(b), BigInt(divisor)))

/** Moves a value from one scale to another, rounding when digits are dropped. */
export const rescale = (value: number, from: number, to: number): number =>
  to >= from ? value * 10 ** (to - from) : multiplyDivide(value, 1, 10 ** (from - to))
