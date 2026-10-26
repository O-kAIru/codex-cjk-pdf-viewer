import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, copyFile, mkdir, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const UI_URI = "ui://codex-cjk-pdf-viewer/viewer-v1.html";

async function cleanClient(t) {
  const directory = await mkdtemp(join(tmpdir(), "cjk-pdf-mcp-"));
  await mkdir(join(directory, "dist"));
  for (const file of ["server.mjs", "viewer.html"]) {
    await copyFile(join(ROOT, "dist", file), join(directory, "dist", file));
  }
  assert.deepEqual(await readdir(directory), ["dist"]);
  const child = spawn(process.execPath, [join(directory, "dist", "server.mjs")], {
    cwd: directory,
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, NODE_PATH: "", NODE_OPTIONS: "" },
  });
  let nextId = 0;
  let buffer = "";
  let stderr = "";
  const pending = new Map();
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-8000); });
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    let end;
    while ((end = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 1);
      if (!line.trim()) continue;
      let response;
      try { response = JSON.parse(line); }
      catch (error) {
        for (const entry of pending.values()) entry.reject(error);
        pending.clear();
        continue;
      }
      const entry = pending.get(response.id);
      if (!entry) continue;
      pending.delete(response.id);
      clearTimeout(entry.timer);
      entry.resolve(response);
    }
  });
  child.on("error", (error) => {
    for (const entry of pending.values()) entry.reject(error);
    pending.clear();
  });
  child.on("exit", (code, signal) => {
    for (const entry of pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(new Error(`MCP process exited (${code ?? signal}): ${stderr}`));
    }
    pending.clear();
  });
  t.after(async () => {
    for (const entry of pending.values()) clearTimeout(entry.timer);
    pending.clear();
    child.stdin.end();
    if (child.exitCode == null) child.kill("SIGTERM");
    await new Promise((resolve) => {
      if (child.exitCode != null || child.signalCode != null) resolve();
      else child.once("exit", resolve);
    });
    await rm(directory, { recursive: true, force: true });
  });
  function request(method, params = {}) {
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Timed out on ${method}: ${stderr}`));
      }, 15_000);
      pending.set(id, { resolve, reject, timer });
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  }
  const initialized = await request("initialize", {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "clean-install-test", version: "1.0.0" },
  });
  assert.equal(initialized.error, undefined);
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
  return { request, initialized, getStderr: () => stderr };
}

test("clean bundled release serves the PDF file entrypoint over stdio", async (t) => {
  const client = await cleanClient(t);
  assert.equal(client.initialized.result.serverInfo.name, "codex-cjk-pdf-viewer");

  const tools = await client.request("tools/list");
  assert.equal(tools.error, undefined);
  assert.equal(tools.result.tools.length, 1, "no unrelated file or network tools");
  const tool = tools.result.tools[0];
  assert.equal(tool.name, "open_pdf");
  assert.deepEqual(tool._meta["openai/ui"].entrypoints, [
    { type: "file", extensions: [".pdf"] },
  ]);
  assert.equal(tool._meta.ui.resourceUri, UI_URI);
  assert.deepEqual(tool._meta.ui.visibility, ["app"]);
  assert.equal(tool.annotations.readOnlyHint, true);
  assert.equal(tool.annotations.destructiveHint, false);
  assert.equal(tool.annotations.openWorldHint, false);
  assert.deepEqual(tool.inputSchema.required, ["file"]);
  assert.deepEqual(tool.inputSchema.properties.file.required.sort(), ["name", "resourceUri"]);

  const resources = await client.request("resources/list");
  assert.equal(resources.error, undefined);
  assert.deepEqual(resources.result.resources.map((item) => item.uri), [UI_URI]);
  const resource = await client.request("resources/read", { uri: UI_URI });
  assert.equal(resource.error, undefined);
  const html = resource.result.contents[0];
  assert.equal(html.uri, UI_URI);
  assert.equal(html.mimeType, "text/html;profile=mcp-app");
  assert.ok(html.text.length > 100_000, "the release must include the built renderer");
  assert.deepEqual(html._meta.ui.csp, { connectDomains: [], resourceDomains: [] });

  const opened = await client.request("tools/call", {
    name: "open_pdf",
    arguments: { file: { name: "synthetic.PDF", resourceUri: "host-resource://synthetic" } },
  });
  assert.equal(opened.error, undefined);
  assert.notEqual(opened.result.isError, true);
  assert.deepEqual(opened.result.content, []);

  const unsupported = await client.request("tools/call", {
    name: "open_pdf",
    arguments: { file: { name: "not-a-pdf.txt", resourceUri: "host-resource://synthetic" } },
  });
  assert.equal(unsupported.result.isError, true);
  const invalid = await client.request("tools/call", {
    name: "open_pdf",
    arguments: { file: { name: "example.pdf" } },
  });
  assert.ok(invalid.error || invalid.result?.isError, "opaque resource input is required");
  const unknown = await client.request("resources/read", { uri: "file:///unregistered.pdf" });
  assert.ok(unknown.error, "arbitrary resource paths must not be served");
  assert.equal(client.getStderr(), "");
});
