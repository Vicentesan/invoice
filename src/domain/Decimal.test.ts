import { describe, expect, it } from "@effect/vitest"
import { Option } from "effect"
import * as Decimal from "./Decimal.ts"

describe("Decimal", () => {
  it("parses typed amounts into integers at the scale", () => {
    expect(Decimal.parse("12.5", 2)).toEqual(Option.some(1250))
    expect(Decimal.parse("1,234.56", 2)).toEqual(Option.some(123456))
    expect(Decimal.parse(" 7 ", 2)).toEqual(Option.some(700))
    expect(Decimal.parse(".5", 2)).toEqual(Option.some(50))
    expect(Decimal.parse("-3.05", 2)).toEqual(Option.some(-305))
    expect(Decimal.parse("1500", 0)).toEqual(Option.some(1500))
    expect(Decimal.parse("0.1", 3)).toEqual(Option.some(100))
  })

  it("never produces a float artefact", () => {
    expect(Decimal.parse("0.29", 2)).toEqual(Option.some(29))
    expect(Decimal.parse("1.15", 2)).toEqual(Option.some(115))
    expect(Decimal.parse("4.35", 2)).toEqual(Option.some(435))
  })

  it("rejects text it would have to guess at", () => {
    for (const text of ["", "-", ".", "abc", "1.2.3", "12.345", "1e3", "9007199254740993"]) {
      expect(Decimal.parse(text, 2)).toEqual(Option.none())
    }

    expect(Decimal.parse("1.5", 0)).toEqual(Option.none())
  })

  it("prints integers back as decimals", () => {
    expect(Decimal.format(123456, 2)).toBe("1234.56")
    expect(Decimal.format(5, 2)).toBe("0.05")
    expect(Decimal.format(-305, 2)).toBe("-3.05")
    expect(Decimal.format(1500, 0)).toBe("1500")
    expect(Decimal.formatTrimmed(1500, 3)).toBe("1.5")
    expect(Decimal.formatTrimmed(1000, 3)).toBe("1")
    expect(Decimal.formatTrimmed(10000, 3)).toBe("10")
    expect(Decimal.formatTrimmed(0, 3)).toBe("0")
  })

  it("rounds half away from zero", () => {
    expect(Decimal.multiplyDivide(1, 5, 10)).toBe(1)
    expect(Decimal.multiplyDivide(-1, 5, 10)).toBe(-1)
    expect(Decimal.multiplyDivide(1, 4, 10)).toBe(0)
    expect(Decimal.multiplyDivide(3, 5, 10)).toBe(2)
  })

  it("multiplies beyond the float-safe range before dividing", () => {
    expect(Decimal.multiplyDivide(9_007_199_254_740_991, 1000, 1000)).toBe(9_007_199_254_740_991)
  })

  it("rescales between minor-unit digits", () => {
    expect(Decimal.rescale(1050, 2, 0)).toBe(11)
    expect(Decimal.rescale(11, 0, 2)).toBe(1100)
    expect(Decimal.rescale(1234, 2, 3)).toBe(12340)
  })
})
