import type { Html } from "@effect/ui/html"

const Icon = <M>(h: Html.H<M>, path: string) =>
  h.svg
    .attrs({
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "2",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "aria-hidden": "true"
    })
    .class("size-4 shrink-0")
    .children(h.path.attr("d", path))

export const ChevronDownIcon = <M>(h: Html.H<M>) => Icon(h, "m6 9 6 6 6-6")
export const ChevronLeftIcon = <M>(h: Html.H<M>) => Icon(h, "m15 18-6-6 6-6")
export const ChevronRightIcon = <M>(h: Html.H<M>) => Icon(h, "m9 18 6-6-6-6")
export const ChevronUpIcon = <M>(h: Html.H<M>) => Icon(h, "m18 15-6-6-6 6")
export const CheckIcon = <M>(h: Html.H<M>) => Icon(h, "M20 6 9 17l-5-5")
export const CloseIcon = <M>(h: Html.H<M>) => Icon(h, "M18 6 6 18M6 6l12 12")
export const PlusIcon = <M>(h: Html.H<M>) => Icon(h, "M5 12h14M12 5v14")

export const CalendarIcon = <M>(h: Html.H<M>) =>
  Icon(h, "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z")
