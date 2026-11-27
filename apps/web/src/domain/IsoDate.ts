import { DateTime, Option, Schema } from "effect"

/**
 * A calendar date as "YYYY-MM-DD". It has no time and no zone, so date math
 * can't drift across midnight or daylight saving.
 */

const PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

interface Parts {
  readonly year: number
  readonly month: number
  readonly day: number
}

const daysInMonth = (year: number, month: number): number => new Date(Date.UTC(year, month, 0)).getUTCDate()

const parts = (date: string): Option.Option<Parts> => {
  const match = PATTERN.exec(date)

  if (match === null) return Option.none()
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])

  return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month)
    ? Option.some({ year, month, day })
    : Option.none()
}

export const isValid = (date: string): boolean => Option.isSome(parts(date))

export const IsoDate = Schema.String.check(
  Schema.makeFilter((date) => isValid(date) || "a calendar date formatted as YYYY-MM-DD")
)

export type IsoDate = typeof IsoDate.Type

const make = ({ day, month, year }: Parts): IsoDate =>
  `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`

const toUtc = ({ day, month, year }: Parts): Date => {
  const date = new Date(Date.UTC(2000, month - 1, day))
  // `Date.UTC` reads years 0-99 as 1900-1999, so the year is set separately.
  date.setUTCFullYear(year)

  return date
}

const fromUtc = (date: Date): IsoDate =>
  make({ year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() })

const unsafeParts = (date: IsoDate): Parts => Option.getOrThrow(parts(date))

/** The local calendar date of an instant. */
export const fromLocalDate = (date: Date): IsoDate =>
  make({ year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() })

export const addDays = (date: IsoDate, days: number): IsoDate => {
  const utc = toUtc(unsafeParts(date))
  utc.setUTCDate(utc.getUTCDate() + days)

  return fromUtc(utc)
}

/**
 * Adds calendar months and keeps the day of the month, clamped to the target
 * month's last day: Jan 31 plus one month is Feb 28 (or 29), and Nov 30 plus
 * one month is Dec 30.
 */
export const addMonths = (date: IsoDate, months: number): IsoDate => {
  const { day, month, year } = unsafeParts(date)
  const index = year * 12 + (month - 1) + months
  const targetYear = Math.floor(index / 12)
  const targetMonth = index - targetYear * 12 + 1

  return make({ year: targetYear, month: targetMonth, day: Math.min(day, daysInMonth(targetYear, targetMonth)) })
}

const DISPLAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })

/** A date nobody reads as month-first or day-first: "27 Nov 2026". */
export const format = (date: IsoDate): string => DISPLAY.format(toUtc(unsafeParts(date)))

/** The date as midnight UTC, the form calendar widgets work in. */
export const toDateTime = (date: IsoDate): DateTime.Utc => DateTime.makeUnsafe(toUtc(unsafeParts(date)))

/** The UTC calendar day of an instant. */
export const fromDateTime = (dateTime: DateTime.Utc): IsoDate => fromUtc(DateTime.toDateUtc(dateTime))

/** The first day of the date's month. */
export const startOfMonth = (date: IsoDate): IsoDate => make({ ...unsafeParts(date), day: 1 })
