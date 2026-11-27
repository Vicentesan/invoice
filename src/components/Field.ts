import type { View } from "@effect/ui"
import type { Html } from "@effect/ui/html"

/** The look of a control inside a `Field`: borderless, right-aligned, on the row's baseline. */
export const CONTROL =
  "min-w-0 flex-1 bg-transparent text-right text-[14px] text-primary outline-none placeholder:text-placeholder"

/** A row of the form: a hairline below that darkens while something inside has focus. */
export const ROW = "flex items-baseline justify-between gap-6 border-b py-4"

const rowBorder = (invalid: boolean) => invalid ? "border-danger" : "border-line focus-within:border-primary"

const caption = (invalid: boolean) => ["shrink-0 text-[14px] font-medium", invalid ? "text-danger" : "text-primary"]

/** A form row: the label on the left and the control on the right. */
export const Field = <M, C extends View.Children<M>>(h: Html.H<M>, options: {
  readonly label: string
  readonly invalid?: boolean
  readonly children: C
}) =>
  h.label.class(ROW, rowBorder(options.invalid === true)).children(
    h.span.class(...caption(options.invalid === true)).children(options.label),
    options.children
  )

/**
 * A form row for a control made of several elements, such as a select and
 * its popup. It isn't a `<label>`, so a press inside the popup doesn't reach
 * the control: the control names itself.
 */
export const FieldGroup = <M, C extends View.Children<M>>(h: Html.H<M>, options: {
  readonly label: string
  readonly children: C
}) =>
  h.div.class(ROW, rowBorder(false)).children(
    h.span.class(...caption(false)).attr("aria-hidden", "true").children(options.label),
    options.children
  )

/** A titled group of fields. The caller adds the fields as children. */
export const Section = <M>(h: Html.H<M>, title: string) =>
  h.section.class("flex flex-col").attr("aria-label", title).children(
    h.h2.class("mb-2 text-[22px] font-semibold tracking-tight text-primary").children(title)
  )
