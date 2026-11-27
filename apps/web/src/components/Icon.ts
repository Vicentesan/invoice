import type { Html } from "@effect/ui/html"
import {
  Add01Icon,
  ArrowDown01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  ArrowUp01Icon,
  Calendar03Icon,
  CalendarAdd01Icon,
  Cancel01Icon,
  CenterFocusIcon,
  Copy01Icon,
  DiceIcon as Dice,
  Download04Icon,
  File01Icon,
  FileExportIcon,
  FileImportIcon,
  MinusSignIcon,
  PlusSignIcon,
  Tick02Icon,
  Upload04Icon,
  ViewIcon
} from "@hugeicons/core-free-icons"

type IconData = typeof Add01Icon

/**
 * A decorative Hugeicons icon in the text colour. The icons used here are all
 * stroked paths, so only each path's outline is read from the icon's data and
 * the stroke is set once on the `<svg>`.
 */
const Icon = <M>(h: Html.H<M>, icon: IconData, size: number) =>
  h.svg
    .attrs({
      width: String(size),
      height: String(size),
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.6",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "aria-hidden": "true"
    })
    .class("shrink-0")
    .children(
      icon.flatMap(([tag, attributes], order) =>
        tag === "path" ? [h.path.key(String(order)).attr("d", String(attributes["d"] ?? ""))] : []
      )
    )

/** Binds one icon. `size` is its width and height in pixels, 16 unless given. */
const icon = (data: IconData) => <M>(h: Html.H<M>, size = 16) => Icon(h, data, size)

export const ChevronDownIcon = icon(ArrowDown01Icon)
export const ChevronLeftIcon = icon(ArrowLeft01Icon)
export const ChevronRightIcon = icon(ArrowRight01Icon)
export const ChevronUpIcon = icon(ArrowUp01Icon)
export const CheckIcon = icon(Tick02Icon)
export const CloseIcon = icon(Cancel01Icon)
export const PlusIcon = icon(Add01Icon)
export const CalendarIcon = icon(Calendar03Icon)
export const UploadIcon = icon(Upload04Icon)
export const CopyIcon = icon(Copy01Icon)
export const EyeIcon = icon(ViewIcon)
export const DiceIcon = icon(Dice)
export const CalendarPlusIcon = icon(CalendarAdd01Icon)
export const ImportIcon = icon(FileImportIcon)
export const ExportIcon = icon(FileExportIcon)
export const DownloadIcon = icon(Download04Icon)
export const PageIcon = icon(File01Icon)
export const ZoomOutIcon = icon(MinusSignIcon)
export const ZoomInIcon = icon(PlusSignIcon)
export const RecenterIcon = icon(CenterFocusIcon)
