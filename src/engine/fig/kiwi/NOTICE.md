# Third-party notice: fig-kiwi

`index.ts`, `blob-parser.ts` and `schema.ts` in this folder are derived from
the `fig-kiwi` module of Grida (`packages/grida-canvas-io-figma/fig-kiwi`),
https://github.com/gridaco/grida, licensed under the Apache License 2.0
(full text in `LICENSE-APACHE-2.0.txt`).

Copyright Grida, Inc. and contributors.

Modifications by Figflow:

- `index.ts`: rewritten entry point. Both archive chunks accept zstd or raw
  DEFLATE. Rejections carry a stable `FigFormatError.code`. FigJam and Slides
  archives are refused. The `base64-js` dependency is replaced with platform
  base64. Blob lookups are bounds-checked.
- `blob-parser.ts`: float reads reuse one scratch `DataView` instead of
  allocating an `ArrayBuffer` per value.
- `schema.ts`: unchanged (generated from Figma's embedded Kiwi schema,
  version 101).
