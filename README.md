# invoice

An invoice PDF generator that runs entirely in the browser. Fill in the form on the left and the PDF on the right
redraws as you type; download it when it looks right.

There is no backend, no account, no payment processing and no tracking. The invoice you are editing lives in your
browser's `localStorage` and never leaves the page.

## What it does

- **One page.** The form sits on the left and a live preview on the right. The preview is the generated PDF itself,
  painted with pdf.js, so what you see is the file you download.
- **Invoice details.** Invoice number, issue date, currency (any ISO 4217 code, USD by default), free-text payment
  terms, and a due date that is either a preset (Net 15, 30, 45 or 60, counted from the issue date) or a date you pick.
- **From and Bill to.** Company name, address lines, country, and a tax ID with a label of your choosing, such as
  CNPJ, VAT or EIN.
- **Line items.** Description, quantity and unit price, with add, remove and reorder. Quantities take up to three
  decimals.
- **Totals.** Subtotal, an optional fixed discount, an optional tax percentage (up to three decimals) and the total.
  The discount comes off the subtotal and tax is charged on what remains.
- **Payment instructions.** A list of fields you name yourself, each a label and a value, so it fits a bank wire, a
  local transfer or whatever your bank asks for. A new invoice starts with Beneficiary, Bank name, Account number and
  SWIFT / BIC; add more from a list of common labels (IBAN, Routing / ABA, Sort code, intermediary bank details and
  others) or as a custom field, rename, reorder and remove them. A field with an empty value is left out of the PDF
  altogether.
- **Notes.** Free text printed below the payment instructions.
- **A4 or US Letter.**
- **Download** as `invoice-<number>.pdf`.
- **Autosave** to `localStorage`, shortly after you stop typing.
- **Import and export** the invoice as JSON. An imported file is validated before it replaces anything.
- **Duplicate for next month.** Adds one to the invoice number (keeping its zero padding), moves the issue date one
  calendar month on, and keeps everything else. Dates clamp to the end of the month: 31 January becomes 28 or 29
  February, 30 November becomes 30 December. A preset due date follows the new issue date; a custom one moves a month
  too. The duplicate replaces the invoice on screen, so download or export the current one first.

## The PDF

- The layout is a header row (invoice number, issued, due date, terms), From and Bill to side by side, the line item
  table, right-aligned totals, then payment instructions and notes. Long invoices continue on further pages, which
  are then numbered.
- Text is set in [Inter](https://rsms.me/inter/), embedded as a subset with a ToUnicode map. Ligatures and contextual
  alternates are turned off, so each glyph maps back to the characters you typed and every string copies out of the
  PDF exactly.
- Identifiers are never hyphenated or broken across lines: the invoice number, tax IDs, and any payment value that
  reads as a code or number (an IBAN, a SWIFT code, an account or routing number) or whose label names one. One that
  is too wide for its column is set smaller instead. Other text wraps at spaces only.
- Inter covers Latin, Greek and Cyrillic. If the invoice contains a character it has no glyph for, the preview says
  which characters are the problem instead of rendering a PDF with gaps in it.
- There is no signature field.

## Money and dates

Amounts are integers in the currency's minor units (cents for USD, whole yen for JPY, thousandths for KWD) and are
never held as floats. Quantities are integer thousandths and tax rates integer thousandths of a percent; products are
computed exactly and rounded half away from zero. Amounts are formatted with `Intl.NumberFormat`. Changing the
currency keeps the amounts as displayed, even when the new currency has a different number of minor-unit digits.

Dates are plain calendar dates with no time zone, and print as `27 Nov 2026`.

## Built with

[Effect](https://effect.website) and [Effect UI](https://github.com/Effect-TS/ui) (`@effect/ui`, experimental and
installed from a snapshot build) with the headless select and date picker from `@effect/ui-kit`, TypeScript, Vite
and Tailwind CSS, on Bun. PDFs are written with pdf-lib and
previewed with pdf.js.

- The invoice is an Effect `Schema`. It is decoded when loaded from storage or imported, and encoded when saved or
  exported.
- Persistence goes through a `Storage` service whose default Layer is `localStorage`; an in-memory Layer backs the
  tests.
- PDF rendering is a `PdfRenderer` service that fails with a typed `PdfRenderError`.

## Development

```sh
bun install
bun run dev      # start the app
bun run build    # production build in dist/
bun run check    # format check, lint, typecheck and tests
```

The tests cover the money math, the due-date presets and month-end clamping, Schema round-trips, the editor's update
logic, and the PDF: they extract the text of a generated file and assert that the IBAN, SWIFT code and total appear
exactly.

## License

MIT. Inter is distributed under the SIL Open Font License; see `src/assets/fonts/OFL.txt`. The lint rules under
`tools/oxlint` carry their own license files.
