import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { layerFiles } from "./Fonts.ts"

/**
 * Where a font file is. The published build is one bundled file with the
 * fonts in a `fonts` folder beside it. Run from source there is no such
 * folder, and the files are still inside the shared package.
 */
const locate = (name: string): string => {
  const beside = fileURLToPath(new URL(`./fonts/${name}`, import.meta.url))

  return existsSync(beside) ? beside : fileURLToPath(import.meta.resolve(`@invoice/shared/fonts/${name}`))
}

/** Inter as shipped with the CLI. */
export const layer = layerFiles({ regular: locate("Inter-Regular.ttf"), semiBold: locate("Inter-SemiBold.ttf") })
