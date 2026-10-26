import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, copyFile, readFile, writeFile, symlink, rm, readdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const MINIMAL_PATH = "/usr/bin:/bin";
const UNIX_ONLY = { skip: process.platform === "win32" };

async function fixture(t) {
  const base = await mkdtemp(join(tmpdir(), "cjk-pdf-launcher-"));
  const directory = join(base, "relocated plugin 日本語");
  const nvm = join(base, "isolated-nvm");
  const override = join(base, "runtime 日本語", "node");
  await mkdir(join(directory, "bin"), { recursive: true });
  await mkdir(join(directory, "dist"));
  await mkdir(join(nvm, "versions", "node", "v22-fixture", "bin"), { recursive: true });
  await mkdir(join(base, "runtime 日本語"));
  await symlink(process.execPath, join(nvm, "versions", "node", "v22-fixture", "bin", "node"));
  await symlink(process.execPath, override);
  for (const name of ["server.mjs", "viewer.html"]) {
    await copyFile(join(ROOT, "dist", name), join(directory, "dist", name));
  }
  await copyFile(join(ROOT, "bin", "launch.sh"), join(directory, "bin", "launch.sh"));
  assert.deepEqual((await readdir(directory)).sort(), ["bin", "dist"]);
  const config = JSON.parse(await readFile(join(ROOT, "mcp.json"), "utf8")).mcpServers["cjk-pdf-viewer"];
  const args = config.args.map((value) => value.replaceAll("${PLUGIN_ROOT}", directory));
  const cwd = config.cwd.replaceAll("${PLUGIN_ROOT}", directory);
  const env = {
    ...process.env,
    PATH: MINIMAL_PATH,
    NVM_DIR: nvm,
    CJK_PDF_NODE: "",
    NODE_PATH: "",
    NODE_OPTIONS: "",
  };
  // Only the child process's PATH/NVM_DIR are isolated. Never change HOME or
  // CODEX_HOME in this process or in its launched test environment.
  assert.equal(env.HOME, process.env.HOME);
  assert.equal(env.CODEX_HOME, process.env.CODEX_HOME);
  t.after(() => rm(base, { recursive: true, force: true }));
  return { base, directory, nvm, override, config, args, cwd, env };
}

async function client(t, f, extraEnv = {}) {
  const child = spawn(f.config.command, f.args, {
    cwd: f.cwd,
    env: { ...f.env, ...extraEnv },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let buffer = "";
  let stderr = "";
  let id = 0;
  const pending = new Map();
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    let end;
    while ((end = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 1);
      if (!line.trim()) continue;
      let response;
      try { response = JSON.parse(line); }
      catch (error) {
        for (const entry of pending.values()) entry.reject(error);
        pending.clear();
        return;
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
      entry.reject(new Error(`Launcher exited (${code ?? signal}): ${stderr}`));
    }
    pending.clear();
  });
  t.after(async () => {
    for (const entry of pending.values()) clearTimeout(entry.timer);
    pending.clear();
    child.stdin.end();
    if (child.exitCode == null && child.signalCode == null) child.kill("SIGTERM");
    if (child.exitCode == null && child.signalCode == null) {
      await new Promise((resolve) => child.once("exit", resolve));
    }
  });
  function request(method, params = {}) {
    const requestId = ++id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error(`Launcher request timed out on ${method}: ${stderr}`));
      }, 15_000);
      pending.set(requestId, { resolve, reject, timer });
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params }) + "\n");
    });
  }
  const initialization = await request("initialize", {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "minimal-gui-path-test", version: "1.0.0" },
  });
  assert.equal(initialization.error, undefined);
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
  return { request, initialization, stderr: () => stderr };
}

async function assertViewerContract(c) {
  const expectedVersion = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8")).version;
  assert.equal(c.initialization.result.serverInfo.version, expectedVersion);
  const tools = await c.request("tools/list");
  assert.deepEqual(tools.result.tools.map((tool) => tool.name), ["open_pdf"]);
  assert.deepEqual(tools.result.tools[0]._meta["openai/ui"].entrypoints, [
    { type: "file", extensions: [".pdf"] },
  ]);
  const resource = await c.request("resources/read", {
    uri: "ui://codex-cjk-pdf-viewer/viewer-v1.html",
  });
  assert.equal(resource.error, undefined);
  assert.equal(resource.result.contents[0].mimeType, "text/html;profile=mcp-app");
  assert.ok(resource.result.contents[0].text.length > 100_000);
  assert.match(c.stderr(), /CJK PDF Viewer: starting with Node\.js (?:2[2-9]|[3-9][0-9])/);
}

test("manifest launcher starts with a minimal GUI PATH and isolated NVM directory", UNIX_ONLY, async (t) => {
  const f = await fixture(t);
  const c = await client(t, f);
  await assertViewerContract(c);
});

test("explicit CJK_PDF_NODE works in relocated paths containing spaces and Japanese", UNIX_ONLY, async (t) => {
  const f = await fixture(t);
  const c = await client(t, f, { CJK_PDF_NODE: f.override });
  await assertViewerContract(c);
  assert.ok(c.stderr().includes(f.override), "the explicit runtime must be honored");
});

test("an unsupported node on PATH is skipped without corrupting MCP stdout", UNIX_ONLY, async (t) => {
  const f = await fixture(t);
  const fakeBin = join(f.base, "old-node-bin");
  await mkdir(fakeBin);
  await writeFile(join(fakeBin, "node"), '#!/bin/sh\nif [ "$1" = "-p" ]; then printf "20\\n"; exit 0; fi\nprintf "OLD_RUNTIME_EXECUTED\\n" >&2\nexit 99\n', { mode: 0o755 });
  const c = await client(t, f, { PATH: `${fakeBin}:${MINIMAL_PATH}` });
  await assertViewerContract(c);
  assert.doesNotMatch(c.stderr(), /OLD_RUNTIME_EXECUTED/);
});

test("an invalid explicit runtime fails clearly on stderr with no stdout", UNIX_ONLY, async (t) => {
  const f = await fixture(t);
  const oldNode = join(f.base, "old-node");
  await writeFile(oldNode, '#!/bin/sh\nprintf "20\\n"\n', { mode: 0o755 });
  const result = spawnSync(f.config.command, f.args, {
    cwd: f.cwd,
    env: { ...f.env, CJK_PDF_NODE: oldNode },
    encoding: "utf8",
    timeout: 5000,
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /CJK_PDF_NODE must point to an executable Node\.js 22 or later/);
});

test("the old bare-node command reproduces ENOENT when GUI PATH contains no node", UNIX_ONLY, async (t) => {
  const f = await fixture(t);
  const check = spawnSync("sh", ["-c", "command -v node"], {
    env: { ...f.env, PATH: MINIMAL_PATH },
    encoding: "utf8",
  });
  if (check.status === 0) {
    t.skip("this machine has node in /usr/bin or /bin");
    return;
  }
  const result = spawnSync("node", [join(f.directory, "dist", "server.mjs")], {
    cwd: f.directory,
    env: f.env,
    encoding: "utf8",
    timeout: 5000,
  });
  assert.equal(result.error?.code, "ENOENT");
});
