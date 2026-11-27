import * as Invoice from "@invoice/shared/domain/Invoice"
import * as IsoDate from "@invoice/shared/domain/IsoDate"
import * as SampleInvoice from "@invoice/shared/domain/SampleInvoice"
import { PdfRenderer } from "@invoice/shared/services/PdfRenderer"
import { Clock, Console, Effect, FileSystem, Option, Random, Schema } from "effect"
import { Argument, Command, Flag } from "effect/cli"
import manifest from "../package.json" with { type: "json" }

/** The version `invoice --version` prints: the one in this package's `package.json`. */
export const version: string = manifest.version

/** A failure the person running the command can act on, said in one sentence. */
export class InvoiceCliError extends Schema.TaggedError<InvoiceCliError>()("InvoiceCliError", {
  message: Schema.String
}) {}

const render = Command.make(
  "render",
  {
    input: Argument.String("input").pipe(
      Argument.withDescription("An invoice JSON file, as exported from the web app or printed by `invoice sample`")
    ),
    output: Flag.String("output").pipe(
      Flag.withAlias("o"),
      Flag.withDescription("Where to write the PDF. Defaults to invoice-<number>.pdf in the current directory"),
      Flag.optional
    ),
    pageSize: Flag.Literals("page-size", Invoice.PageSize.literals).pipe(
      Flag.withDescription("Render on this page size instead of the one in the file"),
      Flag.optional
    )
  },
  Effect.fn(function*({ input, output, pageSize }) {
    const fs = yield* FileSystem.FileSystem
    const renderer = yield* PdfRenderer

    const json = yield* fs.readFileString(input).pipe(
      Effect.mapError((error) => new InvoiceCliError({ message: `Couldn't read ${input}: ${error.message}` }))
    )

    const parsed = yield* Invoice.fromJson(json).pipe(
      Effect.mapError((error) => new InvoiceCliError({ message: `${input} isn't a valid invoice. ${error.reason}` }))
    )

    const invoice = Option.match(pageSize, {
      onNone: () => parsed,
      onSome: (size) => ({ ...parsed, pageSize: size })
    })

    const pdf = yield* renderer.render(invoice).pipe(
      Effect.mapError((error) => new InvoiceCliError({ message: error.explanation }))
    )

    const target = Option.getOrElse(output, () => Invoice.fileName(invoice, "pdf"))

    yield* fs.writeFile(target, pdf).pipe(
      Effect.mapError((error) => new InvoiceCliError({ message: `Couldn't write ${target}: ${error.message}` }))
    )
    yield* Console.log(`Wrote ${target}`)
  })
).pipe(
  Command.withDescription("Render an invoice JSON file to a PDF"),
  Command.withExamples([
    { command: "invoice render invoice.json", description: "Write invoice-<number>.pdf next to where you are" },
    {
      command: "invoice render invoice.json -o out.pdf --page-size Letter",
      description: "Choose the file and the page size"
    }
  ])
)

const sample = Command.make(
  "sample",
  {
    output: Flag.String("output").pipe(
      Flag.withAlias("o"),
      Flag.withDescription("Write the JSON to this file instead of printing it"),
      Flag.optional
    ),
    seed: Flag.Int("seed").pipe(
      Flag.withDescription("Pick the sample: the same seed always gives the same invoice"),
      Flag.optional
    )
  },
  Effect.fn(function*({ output, seed }) {
    const fs = yield* FileSystem.FileSystem
    const today = IsoDate.fromLocalDate(new Date(yield* Clock.currentTimeMillis))

    const chosen = yield* Option.match(seed, {
      onNone: () => Random.nextIntBetween(1, 2_000_000_000),
      onSome: (value) => Effect.succeed(value)
    })

    const json = yield* Invoice.toJson(SampleInvoice.make(today, chosen)).pipe(
      Effect.mapError((error) => new InvoiceCliError({ message: error.reason }))
    )

    yield* Option.match(output, {
      onNone: () => Console.log(json),
      onSome: (target) =>
        fs.writeFileString(target, `${json}\n`).pipe(
          Effect.mapError((error) => new InvoiceCliError({ message: `Couldn't write ${target}: ${error.message}` })),
          Effect.andThen(Console.log(`Wrote ${target}`))
        )
    })
  })
).pipe(
  Command.withDescription("Print a made-up invoice as JSON, to edit or to try `render` with"),
  Command.withExamples([
    { command: "invoice sample -o invoice.json", description: "Start a file from sample data" }
  ])
)

/** The `invoice` command: renders invoice JSON to PDF with the same code as the web app. */
export const cli = Command.make("invoice").pipe(
  Command.withDescription("Generate invoice PDFs from JSON"),
  Command.withSubcommands([render, sample])
)
