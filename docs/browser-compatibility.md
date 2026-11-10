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
| Safari 26.6.2 on macOS | Native desktop window | Catalog search, plain source, BBE reference search and chapter | Recipe search/detail, guide and return, plan save, shopping generation, purchase confirmation and pantry stock | Lesson navigation and answers; normal PDF canvas rendering (USGS page 2 and NWCG page 83), text/search and native PDF reader |
| Safari 26.6.2 on macOS | Responsive Design Mode, reported viewport 390 × 844, default desktop user agent | Catalog search, plain source, BBE reference search and chapter | Recipe detail, linked guide and return, plan save, shopping generation and pantry views | Lesson selector, contour/compass diagrams; normal NWCG page 83/84 canvas rendering, 150% zoom, next page and text search |

All planner writes used a temporary, separate synthetic household on a separate loopback test port. Reading used nine source files whose original bytes and attachments were verified by SHA-256. The real household was not used for test writes. The regular preview retained its own source, index and household configuration.

Chrome layout checks found no document-wide horizontal overflow in the listed final views. Enlarged PDF pages intentionally scroll inside the PDF pane. Safari phone layouts were inspected through its native accessibility tree and responsive viewport; they did not receive the same DOM geometry assertions as Chrome.

## Safari PDF drawing verification

A subsequent bounded retest on November 9 verified ordinary PDF.js display rendering in Safari 26.6.2: USGS physical page 2 and NWCG physical page 83 in the desktop window. At a reported 390 × 844 responsive viewport, NWCG pages 83 and 84 rendered, 150% zoom worked, next-page navigation worked, and `contour interval` returned eight matching pages. Original page images were visually inspected. These checks used verified local source copies to separate browser behavior from share latency.

The earlier automated window reported its document as `hidden`, which paused animation-frame drawing. Diagnostic print/font/decoder configurations were removed and are not shipped. The normal renderer now passed without changing browser security or automation permissions. Drawing can still pause in a background window; the foreground message and native PDF-reader link remain available. This retest does not establish real iPhone/Android behavior.

The new four-lesson compass stage was also checked in Chrome's desktop window and measured 390 × 844 viewport: all four lessons, numbering 9–12, diagrams, answer controls, prerequisite link, source-page link and return. Chrome had no document-wide horizontal overflow. Safari's 390 × 844 responsive viewport displayed lessons 9 and 12 with the correct four-option lesson selector and original diagrams.

## Recipe search follow-up

The catalog-to-kitchen query loss was reproduced: a library search for `venison` opened the bare collection and displayed the 20 default simple homestead recipes. The corrected route carries the query and explicit filters; catalog and kitchen now use the same per-record matching rules. The installed collection returns 12 venison matches, including a beef recipe whose retained source explicitly offers venison as a substitute. Search excerpts make that reason visible.

Chrome desktop and measured 390 × 844 checks covered library search, match counts, detail/guide navigation, Back/Forward, direct links, reload, repeated `rice`/`venison` searches, empty/no-result queries and clearing words while retaining filters. Safari 26.6.2 desktop checks covered catalog-to-kitchen search, all-area/all-level reset, skill filtering, detail/guide navigation, Back/Forward, no results and clearing. Safari Responsive Design Mode at 390 × 844 additionally checked repeated searches, no-result recovery, detail reload and Back to matching results. Safari used its default desktop user agent; no real phone was tested. These resumed checks used the live GrainBins preview and performed no household writes.

The search regression tests exercise the browser controller and real kitchen renderer with synthetic data, HTTP result counts, per-record matching, route encoding/defaults, history, clearing and out-of-order responses. All 47 Node tests passed at this milestone.

## Responsive changes verified

Guided field navigation was checked in Chrome desktop and a measured 390 × 844 viewport on verified local source copies: lesson numbering 13–16, all four lesson views, four checks per lesson, diagrams, phone selector, pace example, feet calculation and PDF page 133 link/return. No document-wide horizontal overflow was observed. The live GrainBins build then passed the pace example and prerequisite/Back checks. Safari 26.6.2 on the live build passed the pace example in desktop and 390 × 844 Responsive Design Mode, displayed the four-option lesson selector and lesson 16 diagram, and opened its answer disclosure. The phone calculator layout was visually inspected; these are desktop responsive checks, not physical-device tests.

- Phone lesson dropdown replaces the long desktop lesson navigation.
- PDF fit-width uses the available width instead of a fixed minimum; it redraws after window resizing.
- Small-screen inputs use 16-pixel text and primary form/navigation controls have at least 44-pixel height. Browser zoom stays available.
- Reader arrival scrolls to the selected content. Opening and verification states replace stale content while source reads are pending.
- PDF zoom remains explicit and source bytes remain unmodified.

## Unverified combinations and limits

No physical iPhone, iPad, Android phone, or Android tablet was connected or tested. Responsive viewports do not exercise iOS/Android WebKit or Chromium builds, touch gestures, virtual keyboards, safe areas, downloads, memory limits, or OS-specific file handling. No iOS simulator, Android emulator, Firefox, Edge or older-browser validation was performed. Do not label these combinations as supported on the strength of this matrix.

The application uses modern JavaScript modules and PDF.js. Installed dependencies are needed before offline use. PDF search uses embedded text rather than OCR; image-only pages may not be found. Lesson completion is not persisted. Long source reads over a slow share still require patience; the loading indicator does not remove that storage latency.

The Node test suite passed all 49 tests at the guided field navigation milestone. Those are parser, integrity, copy/rebuild, household, API, preview, recipe-navigation and pace-calculation tests; they are separate from the browser interactions above.
