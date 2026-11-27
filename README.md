# invoice

An invoice PDF generator. Fill in a form and download the PDF, either in the browser at
[invoices.vicente.fyi](https://invoices.vicente.fyi/) or from a terminal with `npx invoices-cli`.

It is free and open source. The web app has no backend, no account, no payment processing and no tracking: the invoice
you are editing is kept in your browser's `localStorage` and is never sent anywhere.

- [Web app](#web-app)
- [Command line](#command-line)
- [The PDF](#the-pdf)
- [Money and dates](#money-and-dates)
- [Development](#development)
- [Deploy and release](#deploy-and-release)

## Web app

The form is on the left and a live preview on the right. The preview is the generated PDF itself, painted with pdf.js,
so what you see is the file you download.

| You can set              | Details                                                                                                                     |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| **Invoice details**      | Number, issue date, currency (any ISO 4217 code, USD by default) and free-text payment terms.                               |
| **Due date**             | A preset (Net 15, 30, 45 or 60, counted from the issue date) or a date you pick.                                            |
| **From and Bill to**     | Company name, address lines, country, and a tax ID with a label of your choosing, such as CNPJ, VAT or EIN.                 |
| **Line items**           | Description, quantity (up to three decimals) and unit price. Items can be added, removed and reordered.                     |
| **Totals**               | An optional fixed discount and an optional tax percentage. The discount comes off the subtotal and tax applies to the rest. |
| **Payment instructions** | A list of fields you name yourself, each a label and a value. See below.                                                    |
| **Notes**                | Free text printed under the payment instructions.                                                                           |
| **Page size**            | A4 or US Letter.                                                                                                            |

Payment instructions are a list because banks ask for different things. A new invoice starts with Beneficiary, Bank
name, Account number and SWIFT / BIC. You can add more from a list of common labels (IBAN, Routing / ABA, Sort code,
intermediary bank details and others) or as a custom field, and rename, reorder or remove any of them. A field with an
empty value is left out of the PDF.

What the app does with an invoice:

- **Download** it as `invoice-<number>.pdf`.
- **Autosave** it to `localStorage` shortly after you stop typing.
- **Export** it as JSON, to copy or to save as a file.
- **Import** JSON by pasting it or dropping a file. The JSON is validated before it replaces anything.
- **Duplicate for next month.** This adds one to the invoice number, keeping its zero padding, and moves the issue
  date one calendar month on. Dates clamp to the end of the month, so 31 January becomes 28 or 29 February. A preset
  due date follows the new issue date and a custom one moves a month too. The duplicate replaces the invoice on
  screen, so download or export the current one first.
- **Sample data.** One button fills the form with a made-up invoice and turns on demo mode, marked by a banner. Nothing
  is saved while demo mode is on, and pressing the button again brings your own invoice back.

On a small screen the commands move to a dock at the bottom of the page.

## Command line

`invoices-cli` renders the same PDF from a terminal. It reads an invoice as JSON, which is the format the web app
exports, and writes the PDF. It needs Node.js 22 or newer and nothing else.

### Try it

```sh
npx invoices-cli sample -o invoice.json    # write a made-up invoice to edit
npx invoices-cli render invoice.json       # write invoice-<number>.pdf
```

To use an invoice you made in the web app, choose **Export JSON**, then **Export to file**, and pass that file to
`render`.

### Install

```sh
npm install --global invoices-cli
invoice --version
```

Installed globally, the command is `invoice`. The examples below use that name; with `npx`, write `npx invoices-cli`
in its place.

### `invoice render <input>`

Renders an invoice JSON file to a PDF.

| Flag                         | What it does                                                                            |
| ---------------------------- | --------------------------------------------------------------------------------------- |
| `-o`, `--output <file>`      | Where to write the PDF. The default is `invoice-<number>.pdf` in the current directory. |
| `--page-size <A4 \| Letter>` | Render on this page size, whatever the file says.                                       |

```sh
invoice render invoice.json
invoice render invoice.json -o acme-november.pdf --page-size Letter
```

### `invoice sample`

Prints a made-up invoice as JSON, as a starting point to edit.

| Flag                    | What it does                                                    |
| ----------------------- | --------------------------------------------------------------- |
| `-o`, `--output <file>` | Write the JSON to this file. Without it, the JSON is printed.   |
| `--seed <number>`       | Choose the sample. The same seed always gives the same invoice. |

```sh
invoice sample
invoice sample --seed 7 -o invoice.json
```

`invoice --help` and `invoice <command> --help` list every flag.

### When something is wrong

A problem you can fix is reported as one line on standard error, and the command exits with status 1:

```
$ invoice render broken.json
error: broken.json isn't a valid invoice. Expected string
  at ["number"]
```

The same happens when the input file can't be read, when the output can't be written, and when the invoice has
characters the embedded font can't draw.

### The JSON format

`invoice sample` prints a complete file. The parts that need explaining are the numbers, which are all integers:

```jsonc
{
  "number": "INV-0039",
  "issueDate": "2026-11-27", // YYYY-MM-DD
  "due": { "_tag": "Net", "days": 45 }, // or { "_tag": "Custom", "date": "2027-01-15" }
  "currency": "USD",
  "paymentTerms": "Net 45",
  "from": {
    "name": "Pixel & Paper Ltd",
    "addressLines": ["4 Example Lane", "London EC1A 1AA"],
    "country": "United Kingdom",
    "taxIdLabel": "VAT",
    "taxId": "GB 000 0000 00",
  },
  "billTo": { "name": "Initech LLC", "addressLines": [], "country": "", "taxIdLabel": "EIN", "taxId": "" },
  "items": [
    // quantity is in thousandths and unitPrice in minor units: 4.25 hours at $140.00
    { "description": "Front-end development", "quantity": 4250, "unitPrice": 14000 },
  ],
  "taxRate": 8875, // thousandths of a percent: 8.875%. 0 means no tax
  "discount": 5000, // minor units: $50.00. 0 means no discount
  "payment": [
    { "label": "IBAN", "value": "GB82 WEST 1234 5698 7654 32" },
    { "label": "SWIFT / BIC", "value": "EXAMGB2L" },
  ],
  "notes": "Thank you for your business.",
  "pageSize": "A4", // or "Letter"
}
```

`days` must be 15, 30, 45 or 60. The comments above are for this README; a real file is plain JSON without them.

## The PDF

- The layout is a header row (invoice number, issued, due date, terms), From and Bill to side by side, the line item
  table, right-aligned totals, then payment instructions and notes. Long invoices continue on further pages, which
  are then numbered.
- Text is set in [Inter](https://rsms.me/inter/), embedded as a subset with a ToUnicode map. Ligatures and contextual
  alternates are turned off, so each glyph maps back to the characters you typed and every string copies out of the
  PDF exactly.
- Identifiers are never hyphenated or broken across lines. That covers the invoice number, tax IDs, and any payment
  value that reads as a code or number (an IBAN, a SWIFT code, an account or routing number) or whose label names
  one. An identifier too wide for its column is set smaller. Other text wraps at spaces only.
- Inter covers Latin, Greek and Cyrillic. If the invoice contains a character it has no glyph for, you are told which
  characters are the problem and no PDF is produced.
- There is no signature field.

## Money and dates

Amounts are integers in the currency's minor units (cents for USD, whole yen for JPY, thousandths for KWD) and are
never held as floats. Quantities are integer thousandths and tax rates integer thousandths of a percent. Products are
computed exactly and rounded half away from zero, and amounts are formatted with `Intl.NumberFormat`. In the web app,
changing the currency keeps the amounts as displayed, even when the new currency has a different number of minor-unit
digits.

Dates are plain calendar dates with no time zone, and print as `27 Nov 2026`.

## Development

The repository is a Bun workspace with three packages:

| Package           | What it is                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------- |
| `apps/web`        | The web app, built with Effect UI, Vite and Tailwind CSS.                                         |
| `apps/cli`        | The `invoice` command, published to npm as `invoices-cli`.                                        |
| `packages/shared` | The invoice Schema, the money and date math, sample invoices and the PDF rendering, used by both. |

Linting, formatting, type checking and the test runner are set up once at the root.

```sh
bun install
bun run dev      # start the web app
bun run build    # production build in apps/web/dist/
bun run cli      # run the CLI from source, e.g. bun run cli render invoice.json
bun run check    # format check, lint, typecheck and tests
```

How it is put together:

- It is built on [Effect](https://effect.website) and [Effect UI](https://github.com/Effect-TS/ui). `@effect/ui` and
  `@effect/ui-kit` are experimental and installed from snapshot builds.
- The invoice is an Effect `Schema`. It is decoded when loaded from storage, imported, or read by the CLI, and encoded
  when saved or exported.
- Persistence goes through a `Storage` service whose default Layer is `localStorage`. An in-memory Layer backs the
  tests.
- PDF rendering is a `PdfRenderer` service that fails with a typed `PdfRenderError`. PDFs are written with pdf-lib.
  The web app fetches the font files and the CLI reads them from disk.

The tests cover the money math, the due-date presets and month-end clamping, Schema round-trips, the editor's update
logic, the CLI, and the PDF. The PDF tests extract the text of a generated file and assert that the IBAN, SWIFT code
and total appear exactly.

## Deploy and release

### From your machine

The web build is static files only, so it can be hosted anywhere. This repository deploys it to Cloudflare with
[Alchemy](https://alchemy.run):

```sh
bunx alchemy profile edit --add Cloudflare   # once, to sign in
bun run deploy:plan                          # preview the changes
bun run deploy                               # deploy the prod stage to invoices.vicente.fyi
```

The stack is `apps/web/alchemy.run.ts`. Only the `prod` stage attaches the `invoices.vicente.fyi` domain. Any other
stage stays on a workers.dev URL. The `vicente.fyi` zone must already exist in the Cloudflare account.

### From GitHub

`.github/workflows/release.yml` is started by hand from the Actions tab, or with `gh workflow run release.yml`. It runs
`bun run check` and then, for each box ticked:

- **Website**: deploys the `prod` stage with Alchemy. It needs the repository secrets `CLOUDFLARE_API_TOKEN` and
  `CLOUDFLARE_ACCOUNT_ID`. The token needs Workers Scripts, Workers KV Storage and Secrets Store edit access and
  Account Settings read access on the account, and Zone read, Workers Routes edit and DNS edit access on the zone.
- **CLI**: bundles `apps/cli` into one file that runs on Node.js and publishes `invoices-cli` to npm under the `latest`
  tag. It uses npm [trusted publishing](https://docs.npmjs.com/trusted-publishers), so no npm token is stored. The
  version published is the one in `apps/cli/package.json`, and a version already on npm is skipped.

To release a new CLI version, change `version` in `apps/cli/package.json`, push, and run the workflow.

## License

MIT. Inter is distributed under the SIL Open Font License; see `packages/shared/src/assets/fonts/OFL.txt`. The lint
rules under `tools/oxlint` carry their own license files.
