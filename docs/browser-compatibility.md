# Browser and device compatibility

Verification date: November 9, 2026. This is a record of observed checks, not a claim that all browsers or devices work.

## Current access boundary

The preview binds only to `127.0.0.1` on its host. Its localhost URL works on that same computer. A phone's `127.0.0.1` addresses the phone itself, so the current preview is **not available across devices**. No network binding, firewall, authentication, sharing or access permissions were changed for these tests. Cross-device access needs a separately authorized deployment and access design.

## Observed test matrix

| Browser | Test surface | Reading and search | Kitchen and planner | PDFs and lessons |
| --- | --- | --- | --- | --- |
| Chrome 156.0.8078.81 on macOS | Desktop browser; measured CSS viewport 1440 × 900 | Catalog word search, plain source, BBE chapter/reference search | Recipe detail, plan save, pantry entry, shopping view | Canvas page image, zoom, next page, PDF word search, lesson source link and return |
| Chrome 156.0.8078.81 on macOS | Desktop browser with measured CSS viewport 390 × 844 | Catalog search, plain source, Bible chapter/reference result | Recipe search, linked guide and return, plan save, missing-ingredient shopping, partial purchase, stock confirmation, cooking confirmation, actual leftovers and reload persistence | PDF image, zoom, paging/search, mobile lesson selector and diagram |
| Chrome 156.0.8078.81 on macOS | Additional measured CSS viewport 312 × 675 and 320 × 600 | Catalog and plain reading checked at 312 pixels | Not a complete planner run at this width | Lesson layout and PDF fit-width checked at 312 pixels; final PDF resize checked at 320 pixels; initial PDF overflow fixed |
| Safari 26.6.2 on macOS | Native desktop window | Catalog search, plain source, BBE reference search and chapter | Recipe search/detail, guide and return, plan save, shopping generation, purchase confirmation and pantry stock | Lesson navigation and answers; PDF text/search and original in Safari's native PDF reader |
| Safari 26.6.2 on macOS | Responsive Design Mode, reported viewport 390 × 844, default desktop user agent | Catalog search, plain source, BBE reference search and chapter | Recipe detail, linked guide and return, plan save, shopping generation and pantry views | Lesson selector and contour diagram; canvas drawing limitation below |

All planner writes used a temporary, separate synthetic household on a separate loopback test port. Reading used nine source files whose original bytes and attachments were verified by SHA-256. The real household was not used for test writes. The regular preview retained its own source, index and household configuration.

Chrome layout checks found no document-wide horizontal overflow in the listed final views. Enlarged PDF pages intentionally scroll inside the PDF pane. Safari phone layouts were inspected through its native accessibility tree and responsive viewport; they did not receive the same DOM geometry assertions as Chrome.

## Safari PDF drawing limitation

In this automation session Safari reported the test document as `hidden`. PDF.js parsed the original, extracted page text, and returned eight page matches for `contour interval`, but normal canvas drawing waited on the background window's animation-frame scheduling. A diagnostic print-intent render completed; that diagnostic configuration was removed and is **not shipped**. Renderer/font/decoder experiments were also removed.

Normal canvas painting in a visible Safari window therefore remains **unverified in this compatibility pass**. The reader now explains when the window needs bringing forward and exposes **Open PDF in browser reader** as a direct fallback. That link opened the complete 172-page original in Safari's native PDF reader, including page text and illustrations. Native PDF fallback was checked in a desktop tab, not on a real phone.

## Responsive changes verified

- Phone lesson dropdown replaces the long desktop lesson navigation.
- PDF fit-width uses the available width instead of a fixed minimum; it redraws after window resizing.
- Small-screen inputs use 16-pixel text and primary form/navigation controls have at least 44-pixel height. Browser zoom stays available.
- Reader arrival scrolls to the selected content. Opening and verification states replace stale content while source reads are pending.
- PDF zoom remains explicit and source bytes remain unmodified.

## Unverified combinations and limits

No physical iPhone, iPad, Android phone, or Android tablet was connected or tested. Responsive viewports do not exercise iOS/Android WebKit or Chromium builds, touch gestures, virtual keyboards, safe areas, downloads, memory limits, or OS-specific file handling. No iOS simulator, Android emulator, Firefox, Edge or older-browser validation was performed. Do not label these combinations as supported on the strength of this matrix.

The application uses modern JavaScript modules and PDF.js. Installed dependencies are needed before offline use. PDF search uses embedded text rather than OCR; image-only pages may not be found. Lesson completion is not persisted. Long source reads over a slow share still require patience; the loading indicator does not remove that storage latency.

The Node test suite passed all 39 tests after these changes. Those are parser, integrity, copy/rebuild, household, API and preview tests; they are separate from the browser interactions above.
