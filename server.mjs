import { readFile } from "node:fs/promises";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// The build bundles this entry point into dist/server.mjs. Keep the HTML next to
// the bundled server so installed plugin packages are relocatable.
const VIEWER_HTML = new URL("./viewer.html", import.meta.url);
const UI_URI = "ui://codex-cjk-pdf-viewer/viewer-v1.html";
const VERSION = "0.1.1";

async function main() {
  // Fail before initialization if a release does not contain its built viewer.
  // No user-selected filesystem path is accepted by this server.
  const html = await readFile(VIEWER_HTML, "utf8");
  const server = new McpServer({
    name: "codex-cjk-pdf-viewer",
    version: VERSION,
  });

  server.registerResource(
    "pdf-viewer",
    UI_URI,
    { mimeType: "text/html;profile=mcp-app" },
    async () => ({
      contents: [
        {
          uri: UI_URI,
          mimeType: "text/html;profile=mcp-app",
          text: html,
          _meta: {
            ui: {
              prefersBorder: false,
              csp: { connectDomains: [], resourceDomains: [] },
            },
            "openai/ui": {
              availableDisplayModes: ["inline", "fullscreen"],
              preferredDisplayMode: "fullscreen",
            },
          },
        },
      ],
    }),
  );

  server.registerTool(
    "open_pdf",
    {
      title: "Open PDF with CJK support",
      description:
        "Display an opened PDF using packaged CMaps and fonts. Receives host-managed file entrypoint input. Does not modify the PDF or upload it to another service.",
      inputSchema: {
        file: z.object({
          name: z.string().min(1),
          resourceUri: z.string().trim().min(1),
        }),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: {
        ui: { resourceUri: UI_URI, visibility: ["app"] },
        "openai/ui": {
          entrypoints: [{ type: "file", extensions: [".pdf"] }],
        },
      },
    },
    async ({ file }) => {
      if (!/\.pdf$/i.test(file.name)) {
        return {
          isError: true,
          content: [{ type: "text", text: "This viewer supports PDF files only." }],
        };
      }
      // The host forwards the same input to the app. The app reads file bytes
      // through the host's opaque resource URI, never through a server file API.
      return { content: [] };
    },
  );

  await server.connect(new StdioServerTransport());
}

main().catch((error) => {
  // Keep stdout exclusively for MCP messages and do not log input/file bytes.
  console.error(`CJK PDF Viewer could not start: ${error.message}`);
  process.exitCode = 1;
});
