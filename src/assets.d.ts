/// <reference types="vite/client" />

// pdf.js parses on the main thread when its worker module is already loaded.
declare module "pdfjs-dist/build/pdf.worker.mjs" {
  export const WorkerMessageHandler: object
}
