import regular from "../../assets/fonts/Inter-Regular.ttf"
import semiBold from "../../assets/fonts/Inter-SemiBold.ttf"
import { InvoiceFonts } from "./InvoiceFonts.ts"

/** Inter as shipped with the app, fetched from the app's own origin. */
export const layer = InvoiceFonts.layerFetch({ regular, semiBold })
