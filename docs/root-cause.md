# Why Japanese text disappeared

## Observed failure

The investigation reproduced missing Japanese labels in the desktop PDF preview
on macOS, with app version `26.1021.31345` (build `21828`). The source PDF used
embedded HaranoAji Japanese CID fonts, an Adobe/Japan1 character collection, and
Identity-H encoding, without an explicit ToUnicode map for the affected fonts.
The font was present. Replacing it or turning the page into an image was not
necessary.

Read-only inspection of the shipped application identified PDF.js `5.4.296` in
the preview route. The loader passed PDF bytes and a worker to `getDocument`,
without configuring external CMap or standard-font data. No `.bcmap` files were
present in the inspected application package inventory. Static inspection alone
does not prove a particular UI action executed that code.

## Controlled reproduction

To establish the rendering cause, the same PDF bytes were loaded in a browser
with upstream `pdfjs-dist@5.4.296`:

1. With the loader's byte/worker-only configuration, Japanese labels disappeared.
2. PDF.js logged:

   ```text
   Error during font loading: Ensure that the `cMapUrl` and `cMapPacked`
   API parameters are provided.
   ```

3. Supplying the package's CMaps and font resources restored Japanese rendering
   and the corresponding selectable/searchable text.

This comparison changed resource configuration, not the source PDF, font data,
page content, or viewer version. It therefore establishes the resource-loading
cause in the controlled replay. The repository does not include the private
source PDFs or extracted proprietary application code.

## Fix in this plugin

The viewer supplies all **168 compressed CMaps**, **14 standard-font files**, and
**2 WebAssembly resources** from the pinned PDF.js package. They are embedded in
`dist/viewer.html` and read through PDF.js's resource-factory API. The reader
returns the exact PDF.js 5.4 compressed-map contract, including `isCompressed`.
`useWorkerFetch: false` makes these factories the source of resource bytes.

The source PDF remains unchanged. Canvas rendering is the normal screen paint
operation; it is not a conversion of the source to an image-only PDF. PDF.js's
text layer provides selection, copy, and search.

## Separate Poppler issue

An earlier local conversion pipeline used a bundled Poppler build whose
Adobe-Japan1 language-pack lookup also failed. That is a separate renderer and
is not evidence of which renderer the native desktop preview uses. Merely
switching the agent's image converter to PDFium does not fix the desktop tab.

A metadata-only PDF repair was separately validated in private diagnostic work:
adding a standard ToUnicode map restored rendering in that Poppler build while
leaving drawing streams and PDFium pixels unchanged. This plugin does not apply
that repair; it reads original files instead.

## Integration and validation boundary

The plugin uses the documented OpenAI `.pdf` file entrypoint and opaque
host-resource API. An actual SDK `AppBridge` replay verifies initialization,
file input, blob resource read, subscription, file replacement, and update
notifications. Browser tests verify Japanese rendering, search, selection/copy,
page changes, and zoom.

A successful SDK replay or stdio test is not the same as an end-to-end test in
an installed desktop app. Native desktop installation and handler selection must
be checked separately; see [installation](installation.md).

## References

- [OpenAI file viewers and editors](https://developers.openai.com/plugins/build/extensions)
- [OpenAI file-extension entrypoint specification](https://github.com/openai/mcp-extensions/blob/main/docs/spec.md#file-extension-entrypoint)
- [PDF.js document initialization options](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib.html)
- [Pinned PDF.js source release](https://github.com/mozilla/pdf.js/releases/tag/v5.4.296)

## Desktop startup issue fixed in 0.1.1

After installing 0.1.0, desktop application logs showed that this plugin failed
to start with `MCP startup failed: No such file or directory (os error 2)`. The
CLI's resolved MCP configuration confirmed that the plugin-root placeholders
expanded correctly and the installed server file existed. Its command was bare
`node`; the GUI process did not have that executable on its PATH. As a result,
the custom file handler was unavailable and the normal PDF preview remained.

The 0.1.1 Unix launcher resolves Node.js 22+ from conventional installed locations
and NVM. A test using the actual manifest, a minimal GUI-like PATH, a relocated
clean package, and no node_modules reproduces the old ENOENT and successfully
initializes the new launcher. No application binary or global environment setting
is changed. These startup checks complement, rather than replace, real PDF-tab
acceptance testing.
