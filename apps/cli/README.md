# invoices-cli

Render an invoice to PDF from the command line. It reads the invoice as JSON, the format
[invoices.vicente.fyi](https://invoices.vicente.fyi/) exports, and writes the PDF with the same code the web app uses.

```sh
npx invoices-cli sample -o invoice.json    # a made-up invoice to start from
npx invoices-cli render invoice.json       # writes invoice-<number>.pdf
npx invoices-cli render invoice.json -o out.pdf --page-size Letter
```

Installed globally, the command is `invoice`.

`render` validates the file and says what is wrong when it doesn't pass. `sample --seed <n>` gives the same invoice for
the same seed. Run `invoice --help` for every flag.

Text in the PDF is set in Inter, embedded with a ToUnicode map, so every string copies out exactly. Identifiers such as
IBANs, SWIFT codes and tax IDs are never broken across lines.

Requires Node.js 22 or newer.

## License

MIT. Inter is distributed under the SIL Open Font License, included as `dist/fonts/OFL.txt`.
