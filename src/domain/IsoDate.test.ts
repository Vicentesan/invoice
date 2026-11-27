import { describe, expect, it } from "@effect/vitest"
import { Schema } from "effect"
import * as IsoDate from "./IsoDate.ts"

describe("IsoDate", () => {
  it("accepts only real calendar dates", () => {
    const is = Schema.is(IsoDate.IsoDate)
    expect(is("2026-11-27")).toBe(true)
    expect(is("2024-02-29")).toBe(true)
    expect(is("2026-02-29")).toBe(false)
    expect(is("2026-13-01")).toBe(false)
    expect(is("2026-1-1")).toBe(false)
    expect(is("27/11/2026")).toBe(false)
  })

  it("adds days across month and year ends", () => {
    expect(IsoDate.addDays("2026-11-27", 15)).toBe("2026-12-12")
    expect(IsoDate.addDays("2026-11-27", 30)).toBe("2026-12-27")
    expect(IsoDate.addDays("2026-11-27", 45)).toBe("2027-01-11")
    expect(IsoDate.addDays("2026-11-27", 60)).toBe("2027-01-26")
    expect(IsoDate.addDays("2024-02-28", 1)).toBe("2024-02-29")
    expect(IsoDate.addDays("2026-02-28", 1)).toBe("2026-03-01")
  })

  it("adds a month and keeps the day when the month has it", () => {
    expect(IsoDate.addMonths("2026-11-30", 1)).toBe("2026-12-30")
    expect(IsoDate.addMonths("2026-12-15", 1)).toBe("2027-01-15")
    expect(IsoDate.addMonths("2026-12-31", 1)).toBe("2027-01-31")
  })

  it("clamps to the month's end when the day doesn't exist", () => {
    expect(IsoDate.addMonths("2026-01-31", 1)).toBe("2026-02-28")
    expect(IsoDate.addMonths("2024-01-31", 1)).toBe("2024-02-29")
    expect(IsoDate.addMonths("2026-03-31", 1)).toBe("2026-04-30")
    expect(IsoDate.addMonths("2026-01-29", 1)).toBe("2026-02-28")
    expect(IsoDate.addMonths("2024-02-29", 12)).toBe("2025-02-28")
  })

  it("formats without month and day ambiguity", () => {
    expect(IsoDate.format("2026-11-27")).toBe("27 Nov 2026")
    expect(IsoDate.format("2027-01-05")).toBe("5 Jan 2027")
  })

  it("reads the local calendar date of an instant", () => {
    expect(IsoDate.fromLocalDate(new Date(2026, 10, 27, 23, 59))).toBe("2026-11-27")
  })
})
