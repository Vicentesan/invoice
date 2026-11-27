import { BrowserHost } from "@effect/ui/html"
import { Effect, Layer } from "effect"
import { App } from "./App.ts"

const Main = BrowserHost.mount(App, {}, document.getElementById("root")!)

Layer.launch(Main).pipe(Effect.runFork)
