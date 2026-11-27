/**
 * Builds what gets published to npm, the way Biome ships its CLI: one small
 * `invoices-cli` package holding a launcher, and one package per platform
 * holding a self-contained binary. The launcher package lists the platform
 * packages as optional dependencies with `os` and `cpu` set, so an install
 * downloads only the binary that fits the machine.
 *
 *   bun scripts/build.ts          every platform, into dist/npm
 *   bun scripts/build.ts --host   only the platform this machine runs
 */
import { $ } from "bun"
import { cp, mkdir, rm } from "node:fs/promises"
import manifest from "../package.json" with { type: "json" }

interface Platform {
  /** The npm package that carries this binary. */
  readonly name: string
  /** What Bun calls the target. */
  readonly target: string
  readonly os: string
  readonly cpu: string
  readonly libc?: string
  readonly binary: string
}

const PLATFORMS: ReadonlyArray<Platform> = [
  { name: "invoices-cli-darwin-arm64", target: "bun-darwin-arm64", os: "darwin", cpu: "arm64", binary: "invoice" },
  { name: "invoices-cli-darwin-x64", target: "bun-darwin-x64", os: "darwin", cpu: "x64", binary: "invoice" },
  {
    name: "invoices-cli-linux-arm64",
    target: "bun-linux-arm64",
    os: "linux",
    cpu: "arm64",
    libc: "glibc",
    binary: "invoice"
  },
  {
    name: "invoices-cli-linux-x64",
    target: "bun-linux-x64",
    os: "linux",
    cpu: "x64",
    libc: "glibc",
    binary: "invoice"
  },
  {
    name: "invoices-cli-linux-arm64-musl",
    target: "bun-linux-arm64-musl",
    os: "linux",
    cpu: "arm64",
    libc: "musl",
    binary: "invoice"
  },
  {
    name: "invoices-cli-linux-x64-musl",
    target: "bun-linux-x64-musl",
    os: "linux",
    cpu: "x64",
    libc: "musl",
    binary: "invoice"
  },
  { name: "invoices-cli-win32-x64", target: "bun-windows-x64", os: "win32", cpu: "x64", binary: "invoice.exe" }
]

const root = new URL("..", import.meta.url).pathname
const repository = new URL("../../..", import.meta.url).pathname
const out = `${root}dist/npm`
const fonts = `${repository}packages/shared/src/assets/fonts`

/** The fields every published package shares. */
const common = {
  repository: { type: "git", url: "git+https://github.com/Vicentesan/invoice.git", directory: "apps/cli" },
  homepage: "https://invoices.vicente.fyi/"
}

/** The `package.json` of a published package: the launcher's or a platform's. */
interface PublishedManifest {
  readonly name: string
  readonly version: string
  readonly license: string
  readonly description: string
  readonly os?: ReadonlyArray<string>
  readonly cpu?: ReadonlyArray<string>
  readonly libc?: ReadonlyArray<string>
  readonly keywords?: ReadonlyArray<string>
  readonly bin?: Readonly<Record<"invoice", string>>
  readonly files?: ReadonlyArray<string>
  readonly engines?: Readonly<Record<"node", string>>
  readonly optionalDependencies?: Readonly<Record<string, string>>
}

const writeManifest = (path: string, published: PublishedManifest) =>
  Bun.write(path, `${JSON.stringify({ ...published, ...common }, null, 2)}\n`)

const hostOnly = process.argv.includes("--host")
const host = `${process.platform}-${process.arch}`

const selected = hostOnly
  ? PLATFORMS.filter((platform) => `${platform.os}-${platform.cpu}` === host && platform.libc !== "musl")
  : PLATFORMS

const buildPlatform = async (platform: Platform): Promise<void> => {
  const directory = `${out}/${platform.name}`

  const identity = {
    name: platform.name,
    version: manifest.version,
    license: manifest.license,
    description: `The invoices-cli binary for ${platform.os} ${platform.cpu}${
      platform.libc === "musl" ? " (musl)" : ""
    }.`,
    os: [platform.os],
    cpu: [platform.cpu]
  }

  await mkdir(directory, { recursive: true })
  // The fonts are imported by the entry point, so the compiler embeds them in the binary.
  await $`bun build --compile --minify --target=${platform.target} ${root}src/bin.ts --outfile ${directory}/${platform.binary}`
    .quiet()
  await cp(`${repository}LICENSE`, `${directory}/LICENSE`)
  await cp(`${fonts}/OFL.txt`, `${directory}/OFL.txt`)
  await writeManifest(
    `${directory}/package.json`,
    platform.libc === undefined ? identity : { ...identity, libc: [platform.libc] }
  )
  await Bun.write(Bun.stdout, `built ${platform.name}\n`)
}

await rm(out, { recursive: true, force: true })

await Promise.all(selected.map(buildPlatform))

const launcher = `${out}/invoices-cli`

await mkdir(`${launcher}/bin`, { recursive: true })

await cp(`${root}npm/invoice`, `${launcher}/bin/invoice`)

await cp(`${root}README.md`, `${launcher}/README.md`)

await cp(`${repository}LICENSE`, `${launcher}/LICENSE`)

await writeManifest(`${launcher}/package.json`, {
  name: "invoices-cli",
  version: manifest.version,
  license: manifest.license,
  description: manifest.description,
  keywords: ["invoice", "pdf", "cli"],
  bin: { invoice: "bin/invoice" },
  files: ["bin/invoice", "README.md", "LICENSE"],
  engines: { node: ">=18" },
  // Every platform is listed whichever ones were built, so the launcher package is always the same.
  optionalDependencies: Object.fromEntries(PLATFORMS.map((platform) => [platform.name, manifest.version]))
})

await Bun.write(Bun.stdout, "built invoices-cli\n")
