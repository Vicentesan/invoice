import { Context, Effect, Layer, Option, Schema } from "effect"

export class StorageError extends Schema.TaggedError<StorageError>()("StorageError", {
  key: Schema.String,
  reason: Schema.String
}) {}

/**
 * A string key-value store. Everything the app persists goes through it, so
 * `localStorage` can be swapped for memory in tests or for another backend.
 */
export class Storage extends Context.Service<Storage, {
  get(key: string): Effect.Effect<Option.Option<string>, StorageError>
  set(key: string, value: string): Effect.Effect<void, StorageError>
}>()("app/Storage") {
  /** The browser's `localStorage`. Reads and writes fail when it is blocked or full. */
  static readonly layerLocalStorage = Layer.succeed(
    Storage,
    Storage.of({
      get: (key) =>
        Effect.try({
          try: () => Option.fromNullishOr(globalThis.localStorage.getItem(key)),
          catch: (cause) => new StorageError({ key, reason: String(cause) })
        }),
      set: (key, value) =>
        Effect.try({
          try: () => globalThis.localStorage.setItem(key, value),
          catch: (cause) => new StorageError({ key, reason: String(cause) })
        })
    })
  )

  /** An in-memory store, for tests. */
  static readonly layerMemory = (seed: ReadonlyMap<string, string> = new Map()) =>
    Layer.sync(Storage, () => {
      const entries = new Map(seed)

      return Storage.of({
        get: (key) => Effect.sync(() => Option.fromNullishOr(entries.get(key))),
        set: (key, value) => Effect.sync(() => void entries.set(key, value))
      })
    })
}
