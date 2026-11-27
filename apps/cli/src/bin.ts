#!/usr/bin/env bun
import { BunRuntime, BunServices } from "@effect/platform-bun"
import { PdfRenderer } from "@invoice/shared/services/PdfRenderer"
import { Console, Effect, Layer } from "effect"
import { Command } from "effect/cli"
import { cli, version } from "./Cli.ts"
import { layer as fonts } from "./FontsEmbedded.ts"

const services = PdfRenderer.layer.pipe(Layer.provide(fonts), Layer.provideMerge(BunServices.layer))

cli.pipe(
  Command.run({ version }),
  // A failure the user can act on is one line on stderr and a non-zero exit, not a stack trace.
  Effect.catchTag("InvoiceCliError", (error) =>
    Console.error(`error: ${error.message}`).pipe(
      Effect.andThen(Effect.sync(() => {
        process.exitCode = 1
      }))
    )),
  Effect.provide(services),
  BunRuntime.runMain
)
