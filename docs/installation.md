# Installation and validation

## Supported host contract

The plugin uses the supported OpenAI MCP file-entrypoint extension:

```json
{
  "ui": {
    "resourceUri": "ui://codex-cjk-pdf-viewer/viewer-v1.html",
    "visibility": ["app"]
  },
  "openai/ui": {
    "entrypoints": [{ "type": "file", "extensions": [".pdf"] }]
  }
}
```

The leading dot in `.pdf` follows the formal extension specification. The
host supplies the tool and app with this input:

```json
{
  "file": {
    "name": "example.pdf",
    "resourceUri": "host-resource://opaque-authorized-resource"
  }
}
```

The resource URI is not a path to be opened by Node.js. The UI reads its bytes
through `OpenAIExtensions.resources.read({ uri, representation: "blob" })`.
The host must advertise the `openai/resource` capability during app connection.
A host without that capability cannot use this original-file entrypoint.

## Public GitHub marketplace

Prerequisites: macOS/Linux with `/bin/sh`, and an installed Node.js 22 or later.
The launcher checks PATH, Homebrew standard locations, and NVM without sourcing
profiles. Set `CJK_PDF_NODE` to an absolute runtime path when needed.

```sh
node --version
codex plugin marketplace add O-kAIru/codex-cjk-pdf-viewer
codex plugin marketplace list
codex plugin add codex-cjk-pdf-viewer@cjk-pdf-viewer-marketplace
```

The last command installs the plugin. Refresh plugin connections if the desktop
host offers that control, or reopen the app after saving other work. The
marketplace entry points to the plugin at the repository root.

The exact host UI labels and choice between multiple PDF file handlers can vary
by app version. If the normal viewer still appears, verify that the plugin is
installed, enabled, and used as the file handler. A directory listing or a
successful MCP `initialize` response does not prove file-handler activation.

## Local checkout for development

```sh
git clone https://github.com/O-kAIru/codex-cjk-pdf-viewer.git
cd codex-cjk-pdf-viewer
npm ci
npm run build
npm test
codex plugin marketplace add .
```

Restart the desktop app, select the local **CJK PDF Viewer** marketplace, and
install it. The host installs a cached copy; editing source in the checkout
does not automatically update that copy. Rebuild, refresh the marketplace or
reinstall the local plugin as appropriate, then restart before re-testing.

## Release contents

The runtime entry points are:

- `dist/server.mjs`: self-contained stdio MCP server.
- `dist/viewer.html`: self-contained viewer HTML, including bundled renderer
  resources.

The MCP configuration runs `sh ${PLUGIN_ROOT}/bin/launch.sh` with
`${PLUGIN_ROOT}` as its working directory. There are no required environment variables. `CJK_PDF_NODE` is an optional
explicit Node.js executable override. Dependencies and dev tools in `node_modules/` are not needed for an
installed release.

Root `plugin.json` and `mcp.json` use the portable Agent Plugins format. The
`.codex-plugin/plugin.json` and `.mcp.json` files provide a compatibility
manifest. Keep the identity, version, server command, and entry paths consistent
when updating a release.

## Manual desktop acceptance checks

Use a synthetic or otherwise shareable PDF for public screenshots. Keep private
PDFs out of the repository and release ZIP.

1. Install from a clean marketplace checkout with no `node_modules/` present.
   Confirm that the bundled server starts using Node.js alone.
2. Open a PDF from a local file link in a Codex conversation. Verify that the
   plugin's file viewer is the panel actually displayed.
3. Check the complete Japanese headings, body text, symbols, and choice labels
   against a known-good viewer. Check the original file's page count and layout.
4. Select and copy Japanese text. Search for a Japanese word and a Latin word
   known to be in the document. A visible screenshot alone does not prove text
   selection or search.
5. Check page navigation and zoom with a multipage PDF. Switch files and confirm
   that stale pages or search results from the previous file do not remain.
6. Confirm that no external font/PDF requests occur and that opening the file
   does not change its size or SHA-256 digest.
7. Close and reopen the file. Confirm that the same entrypoint works after an app
   restart.

Record the host version and which checks passed. Keep these completion states
separate: source built, protocol tested, browser rendering tested, plugin
installed, and real desktop file entrypoint verified.

## Troubleshooting

### GUI applications do not inherit the Node/NVM PATH

Version 0.1.0 launched bare `node` and could fail with `No such file or directory`
when the desktop app did not inherit the terminal's PATH. Version 0.1.1 invokes
`bin/launch.sh` through `/bin/sh` and discovers a supported installed runtime.
It does not edit shell profiles, global PATH, HOME, or CODEX_HOME.

If no supported runtime is found, install Node.js 22+ or supply `CJK_PDF_NODE`
through your local server environment. Do not publish another person's absolute
machine path in the plugin manifest.

### Windows

The automatic launcher in 0.1.1 targets macOS/Linux. The bundled Node server is
portable, but Windows launcher integration is not verified in this release.
An operator maintaining a Windows-specific local package can use `node` with
`${PLUGIN_ROOT}/dist/server.mjs` as in 0.1.0, provided Node is on the host PATH.

### Built viewer file cannot be read

Confirm that `bin/launch.sh`, `dist/server.mjs`, and `dist/viewer.html` are all present in the
installed copy. A source-only archive needs a development build; an official
release of this repository should already contain the built files.

### The host-managed file API is unavailable

File entrypoints require a desktop host that implements OpenAI file resources.
Do not turn an opaque resource URI into a filesystem path or grant broad
filesystem access as a workaround. Update to a compatible host and re-test.

### A document is still missing characters

Keep the original bytes. Note the PDF producer, affected page, fonts and CMap
names if known, viewer version, and whether another renderer displays the same
file. Different PDF problems can have similar visual symptoms. Do not assume
every missing glyph is this specific CMap issue.

## OpenAI public plugin directory

This GitHub marketplace is an independently distributed plugin source. It does
not imply OpenAI verification or listing in the universal public directory.
According to the current OpenAI documentation, local MCP submissions require
approved-partner access, identity verification, review, and separate publication.
See [Submit desktop-only plugins](https://developers.openai.com/plugins/deploy/desktop-only).
