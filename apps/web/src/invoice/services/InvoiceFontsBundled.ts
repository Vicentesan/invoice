import regular from "@invoice/shared/fonts/Inter-Regular.ttf"
import semiBold from "@invoice/shared/fonts/Inter-SemiBold.ttf"
import { InvoiceFonts } from "@invoice/shared/services/InvoiceFonts"

/** Inter as shipped with the app, fetched from the app's own origin. */
export const layer = InvoiceFonts.layerFetch({ regular, semiBold })
