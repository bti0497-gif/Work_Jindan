# Local Node PDF picture adapter66

`src/Jindan.Report.Worker/node-pictures.mjs` exports `extractNodePdfPictures(bytes, analysis, pages, options)`, directly compatible with `createReportEngine({extractPictures: extractNodePdfPictures})`. It changes neither the selected fixed engine sources nor production28 candidates.

The adapter loads the pinned local `pdfjs-dist/legacy/build/pdf.mjs` with file-URL worker and package-resolved cmaps/standard-font/wasm paths. It uses `@napi-rs/canvas` only to encode decoded original image objects and their observed transform. It never calls PDF page render, OCR, network, system font installation, cloud, or a native desktop app. The Node native canvas package is a local runtime dependency and must be available in the worker's deployed package; missing/unsupported backend throws rather than returning an empty success.

Source SHA256 must match analysis. Every selected page's dimensions/rotation, image count, canonical ID, operator, kind, bbox and transform are compared to a fresh operator list. Positions are checked within1e-6 point against the same parser, rather than the browser reference's1-point tolerance. The source and analysis remain immutable. Text-raster images are included by default because they are source content; callers may explicitly select figure-only extraction. Returned pictures include PNG bytes/dimensions plus original dimensions, source SHA, page/operator/bbox/transform and PNG SHA. They retain method `pdf-image-object`, accepted by the existing builder.

Limits:160MB input;300 unique selected pages;16,000,000 pixels per original/transformed picture;64MiB PNG;80MiB aggregate. Optional budget overrides can only lower limits. The original browser algorithm's resolution-from-transform and rectangular bbox crop is retained; no full-page screenshot is substituted. Repeat/group/mask operators are fail-closed as `UNSUPPORTED_PDF_IMAGE`, including image-mask pages the legacy analysis does not list as pictures. Unreadable native bitmap is `UNSUPPORTED_BITMAP`. General PDF transparency/complex clipping fidelity beyond that existing geometry algorithm remains a native-review limit, not a company-document approval.

Cancellation checks occur before load, each page/image, decoding/encoding boundaries and return. Task destroy is requested on abort, listeners and document/page/canvas resources are released in finally. Canvas encode/decode themselves are synchronous native sections and are cooperatively interruptible only at their boundaries. The outer owned-worker cancellation/timeout boundary is responsible for actual process termination when cooperative cancellation cannot respond; this adapter alone does not claim to preempt synchronous native work.

Verify locally from the new root:

```powershell
node --test tests/NodePictures/*.test.cjs
```

Six tests use generated synthetic real PDFs and the actual analysis+pdfjs decode path:16x12 red/blue image content/dimensions/SHA/immutability;90-degree transform; stale SHA/page/operator/bbox/transform/list rejection; cancellation; pixel/PNG/total budget failures; explicit real image-mask rejection. No company report or new current measurements are fabricated. `reportReady=false` and `supervisorAccepted=false` remain host policy.
