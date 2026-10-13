// EN1: the English pages import the shared tool modules with a `?en` query, so Vite bundles a second instance for them.
// Without it, a module both a Korean and an English page script import becomes its own shared chunk, and the Korean page
// loads that chunk and, one round trip later, its imports (no transitive-import hoisting in Rolldown): /pdf-merge/ LCP
// went from 1,819 to 1,967 ms locally. With it, the Korean pages keep their pre-EN1 chunk graph. Types: the same module.
declare module '*/tools/pdf-merge/controller.ts?en' {
  export const initMergeTool: typeof import('../../tools/pdf-merge/controller').initMergeTool;
}
declare module '*/tools/pdf-compress/controller.ts?en' {
  export const initCompressTool: typeof import('../../tools/pdf-compress/controller').initCompressTool;
}
declare module '*/tools/image-to-jpg/entry.ts?en' {
  export const startImageToJpg: typeof import('../../tools/image-to-jpg/entry').startImageToJpg;
}
declare module '*/tools/image-to-jpg/controller.ts?en' {
  export const initImageToJpg: typeof import('../../tools/image-to-jpg/controller').initImageToJpg;
}
