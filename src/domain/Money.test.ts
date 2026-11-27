import { describe, expect, it } from "@effect/vitest"
import * as Money from "./Money.ts"

describe("Money", () => {
  it("knows each currency's minor-unit digits", () => {
    expect(Money.minorUnitDigits("USD")).toBe(2)
    expect(Money.minorUnitDigits("JPY")).toBe(0)
    expect(Money.minorUnitDigits("KWD")).toBe(3)
  })

  it("formats minor units with Intl.NumberFormat", () => {
    expect(Money.format(123450, "USD")).toBe("$1,234.50")
    expect(Money.format(-500, "USD")).toBe("-$5.00")
    expect(Money.format(1234, "JPY")).toBe("¥1,234")
    expect(Money.format(99, "EUR")).toBe("€0.99")
    expect(Money.format(1234567, "KWD")).toBe("KWD 1,234.567")
  })

  it("formats amounts a float can't hold exactly", () => {
    expect(Money.format(9_007_199_254_740_991, "USD")).toBe("$90,071,992,547,409.91")
  })

  it("computes line amounts from thousandths of a quantity", () => {
    expect(Money.lineAmount(1000, 1999)).toBe(1999)
    expect(Money.lineAmount(1500, 1999)).toBe(2999)
    expect(Money.lineAmount(7250, 15000)).toBe(108750)
    expect(Money.lineAmount(333, 100)).toBe(33)
    expect(Money.lineAmount(3000, 10)).toBe(30)
  })

  it("avoids the classic float errors", () => {
    // 0.1 + 0.2 and 1.15 * 100 both go wrong in floats.
    expect(Money.lineAmount(100, 100) + Money.lineAmount(200, 100)).toBe(30)
    expect(Money.lineAmount(1000, 115)).toBe(115)
  })

  it("takes a percentage in thousandths of a percent", () => {
    expect(Money.percentage(10000, 8875)).toBe(888)
    expect(Money.percentage(10000, 20000)).toBe(2000)
    expect(Money.percentage(999, 7250)).toBe(72)
    expect(Money.percentage(10000, 0)).toBe(0)
  })

  it("keeps the displayed amount when the currency's digits change", () => {
    expect(Money.convertDigits(150000, "USD", "JPY")).toBe(1500)
    expect(Money.convertDigits(1500, "JPY", "USD")).toBe(150000)
    expect(Money.convertDigits(1999, "USD", "EUR")).toBe(1999)
  })
})
