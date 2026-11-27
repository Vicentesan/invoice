// Bun resolves a `file` import of a font to the path of that file.
declare module "*.ttf" {
  const path: string
  export default path
}
