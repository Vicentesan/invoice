#!/usr/bin/env node
import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { PdfRenderer } from "@invoice/shared/services/PdfRenderer"
import { Console, Effect, Layer } from "effect"
import { Command } from "effect/cli"
import { cli, version } from "./Cli.ts"
import { layer as fonts } from "./FontsOnDisk.ts"

const services = PdfRenderer.layer.pipe(Layer.provide(fonts), Layer.provideMerge(NodeServices.layer))

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
  NodeRuntime.runMain
)
