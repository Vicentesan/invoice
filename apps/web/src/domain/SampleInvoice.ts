import * as Invoice from "./Invoice.ts"
import type { IsoDate } from "./IsoDate.ts"

/**
 * Made-up invoices for trying the app out. Every company is fictional and the
 * bank details are the documentation examples banks publish, so nothing here
 * belongs to anyone.
 */

const SENDERS: ReadonlyArray<Invoice.Party> = [
  {
    name: "Northwind Studio Lda",
    addressLines: ["18 Harbour Street", "1200-109 Lisbon"],
    country: "Portugal",
    taxIdLabel: "VAT",
    taxId: "PT 000 000 000"
  },
  {
    name: "Acme Serviços Ltda",
    addressLines: ["Av. Paulista, 1000 - Bela Vista", "São Paulo - SP, 01310-100"],
    country: "Brazil",
    taxIdLabel: "CNPJ",
    taxId: "00.000.000/0001-00"
  },
  {
    name: "Pixel & Paper Ltd",
    addressLines: ["4 Example Lane", "London EC1A 1AA"],
    country: "United Kingdom",
    taxIdLabel: "VAT",
    taxId: "GB 000 0000 00"
  }
]

const CLIENTS: ReadonlyArray<Invoice.Party> = [
  {
    name: "Globex GmbH",
    addressLines: ["Friedrichstraße 123", "10117 Berlin"],
    country: "Germany",
    taxIdLabel: "VAT",
    taxId: "DE 000 000 000"
  },
  {
    name: "Initech LLC",
    addressLines: ["4120 Example Parkway, Suite 200", "Austin, TX 78701"],
    country: "United States",
    taxIdLabel: "EIN",
    taxId: "00-0000000"
  },
  {
    name: "Vandelay Industries SAS",
    addressLines: ["12 rue de l'Exemple", "75002 Paris"],
    country: "France",
    taxIdLabel: "TVA",
    taxId: "FR 00 000000000"
  }
]

const WORK: ReadonlyArray<{ readonly description: string; readonly hourly: boolean; readonly price: number }> = [
  { description: "Product design", hourly: false, price: 840000 },
  { description: "Front-end development", hourly: true, price: 14000 },
  { description: "Design system audit", hourly: true, price: 12500 },
  { description: "Research interviews", hourly: true, price: 9500 },
  { description: "Hosting and domains", hourly: false, price: 8640 },
  { description: "On-call support", hourly: true, price: 15000 },
  { description: "Workshop facilitation", hourly: false, price: 180000 }
]

const BANKS: ReadonlyArray<ReadonlyArray<Invoice.PaymentField>> = [
  [
    { label: "Bank name", value: "Example Bank AG" },
    { label: "IBAN", value: "DE89 3704 0044 0532 0130 00" },
    { label: "SWIFT / BIC", value: "EXAMDEFFXXX" }
  ],
  [
    { label: "Bank name", value: "Example Bank plc" },
    { label: "IBAN", value: "GB82 WEST 1234 5698 7654 32" },
    { label: "Sort code", value: "00-00-00" },
    { label: "SWIFT / BIC", value: "EXAMGB2L" }
  ],
  [
    { label: "Bank name", value: "Example Bank, N.A." },
    { label: "Account number", value: "000123456789" },
    { label: "Routing / ABA", value: "000000000" },
    { label: "SWIFT / BIC", value: "EXAMUS33" }
  ]
]

const TAX_RATES = [0, 0, 8875, 20000, 23000]
const NOTES = ["Thank you for your business.", "Please quote the invoice number with your payment.", ""]

/** A small seeded generator, so one seed always gives the same invoice. */
const sequence = (seed: number) => {
  let state = Math.abs(Math.trunc(seed)) % 2_147_483_647

  return (bound: number): number => {
    state = (state * 48_271 + 1) % 2_147_483_647

    return state % bound
  }
}

/** A filled-in invoice issued on `issueDate`. The same seed gives the same invoice. */
export const make = (issueDate: IsoDate, seed: number): Invoice.Invoice => {
  const next = sequence(seed)
  const pick = <A>(options: ReadonlyArray<A>, fallback: A): A => options[next(options.length)] ?? fallback
  const from = pick(SENDERS, Invoice.empty(issueDate).from)
  const first = next(WORK.length)

  const items = Array.from({ length: 2 + next(3) }, (_, index) => {
    const work = WORK[(first + index) % WORK.length]

    return work === undefined ? Invoice.emptyLineItem : {
      description: work.description,
      // Hourly work is billed in quarter hours; everything else is one unit.
      quantity: work.hourly ? (8 + next(120)) * 250 : 1000,
      unitPrice: work.price
    }
  })

  const days = pick(Invoice.NET_DAYS, 30)

  return {
    ...Invoice.empty(issueDate),
    number: `INV-${String(1 + next(480)).padStart(4, "0")}`,
    due: Invoice.Due.Net({ days }),
    paymentTerms: Invoice.termsLabel(days),
    from,
    billTo: pick(CLIENTS, Invoice.empty(issueDate).billTo),
    items,
    taxRate: pick(TAX_RATES, 0),
    discount: next(3) === 0 ? 5000 * (1 + next(6)) : 0,
    payment: [{ label: "Beneficiary", value: from.name }, ...pick(BANKS, [])],
    notes: pick(NOTES, "")
  }
}
