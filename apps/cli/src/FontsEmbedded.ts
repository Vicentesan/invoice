// A `file` import gives the path of the file. When Bun compiles the CLI into
// a binary it embeds these two files and the paths point inside the binary.
import regular from "@invoice/shared/fonts/Inter-Regular.ttf" with { type: "file" }
import semiBold from "@invoice/shared/fonts/Inter-SemiBold.ttf" with { type: "file" }
import { layerFiles } from "./Fonts.ts"

/** Inter as built into the CLI. */
export const layer = layerFiles({ regular, semiBold })
