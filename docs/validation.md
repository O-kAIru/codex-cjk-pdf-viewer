# Validation record — 2026-10-26

## Passed

- Twelve automated tests (including GUI-path launcher tests): stdio MCP initialization and tool/resource contract;
  clean bundled execution without node_modules; manifest/marketplace parity;
  compressed CMap API contract; all 168 CMaps; standard font and WASM resources.
- Bundled server tested under Node.js 22.22.2 and 24.11.1.
- Original-byte browser rendering for three private Japanese PDFs affected by
  the missing-CMap symptom. Their Japanese headings and choice text rendered,
  and Japanese searches found those words. The private PDFs are not distributed.
- Actual selection and clipboard copy of Japanese text in the browser viewer.
- Public two-page synthetic fixture: expected Japanese and Latin text, vector
  shapes, embedded raster image, page movement, zoom, cross-page Japanese search.
- Official SDK AppBridge replay: initialization, .pdf tool input, host-authorized
  opaque URI, resources/read with blob representation, subscribe/unsubscribe,
  file switching, and notifications/resources/updated-triggered reread.
- CLI installation into the developer's local desktop plugin configuration;
  reported installed=true and enabled=true. Installed runtime hashes match build.

## Not claimed

- An observed native Codex desktop PDF tab using the installed handler. The
  desktop app surface was unavailable to the automation tool used for validation.
- OpenAI public-directory approval or listing.
- Compatibility with every PDF producer, embedded script, form, or complex font.

The source PDF remains unchanged. The plugin is a viewer, not a PDF repair or
editing tool. The SDK replay is explicitly labeled as a simulation in its UI.

## 0.1.1 launcher regression check

- Old bare-node launch reproduced ENOENT with PATH=/usr/bin:/bin.
- Actual manifest launcher initialized MCP and served the viewer resource with
  minimal PATH, isolated NVM_DIR, unchanged HOME/CODEX_HOME, a clean relocated
  package whose path contains spaces/Japanese characters, and no node_modules.
- Node 22.22.2 and 24.11.1 passed all twelve automated tests.

The installed 0.1.1 package was also discovered through the actual Codex
app-server protocol with PATH=/usr/bin:/bin. The targeted mcpServerStatus/list
returned serverInfo version 0.1.1, tool open_pdf, and the viewer UI resource. This
is runtime startup/discovery evidence; it is not a screenshot of the native tab.
