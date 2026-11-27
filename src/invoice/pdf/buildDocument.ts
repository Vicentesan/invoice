import type { Invoice } from "#domain/Invoice"
import fontkit from "@pdf-lib/fontkit"
import { PDFDocument } from "pdf-lib"
import type { FontFiles } from "../services/InvoiceFonts.ts"
import { drawInvoice } from "./drawInvoice.ts"

/**
 * Ligatures and contextual alternates swap glyphs in ways that can change the
 * text a reader copies, so they are off. Each glyph maps to the characters
 * typed, which is what the font's ToUnicode map records.
 */
const FEATURES = { liga: false, clig: false, calt: false, dlig: false }

/** Builds the PDF and reports the characters the embedded font couldn't draw. */
export const buildDocument = async (files: FontFiles, invoice: Invoice) => {
  const document = await PDFDocument.create()

  document.registerFontkit(fontkit)

  const regular = await document.embedFont(files.regular, { subset: true, features: FEATURES })
  const semiBold = await document.embedFont(files.semiBold, { subset: true, features: FEATURES })
  const unsupported = drawInvoice(document, { regular, semiBold }, invoice)

  document.setTitle(`Invoice ${invoice.number}`.trim())
  document.setAuthor(invoice.from.name)
  document.setCreator("invoice")

  return { unsupported, bytes: await document.save() }
}
