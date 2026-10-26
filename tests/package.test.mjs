import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat, realpath } from "node:fs/promises";
import { resolve, relative, isAbsolute, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const json = async (path) => JSON.parse(await readFile(resolve(ROOT, path), "utf8"));

test("portable and compatibility packages launch the same self-contained build", async () => {
  const portable = await json("plugin.json");
  const compatibility = await json(".codex-plugin/plugin.json");
  const pkg = await json("package.json");
  assert.equal(portable.name, pkg.name);
  assert.equal(portable.name, compatibility.name);
  assert.equal(portable.version, pkg.version);
  assert.equal(portable.version, compatibility.version);
  assert.equal(portable.extensions["com.openai"].requires_local_executor, true);
  assert.equal(compatibility.requires_local_executor, true);
  assert.equal(compatibility.mcpServers, "./.mcp.json");
  assert.deepEqual(portable.extensions["com.openai"].interface, compatibility.interface);

  const current = (await json("mcp.json")).mcpServers;
  const old = (await json(".mcp.json")).mcpServers;
  assert.deepEqual(current, old);
  assert.deepEqual(Object.keys(current), ["cjk-pdf-viewer"]);
  const server = current["cjk-pdf-viewer"];
  assert.equal(server.type, "stdio");
  assert.equal(server.command, "sh");
  assert.deepEqual(server.args, ["${PLUGIN_ROOT}/bin/launch.sh"]);
  assert.equal(server.cwd, "${PLUGIN_ROOT}");
  assert.equal(server.env, undefined, "no credentials or machine-specific env required");
  for (const filename of ["bin/launch.sh", "dist/server.mjs", "dist/viewer.html", "LICENSE"]) {
    assert.ok((await stat(resolve(ROOT, filename))).size > 0, filename);
  }
});

test("marketplace resolves its plugin within the repository root", async () => {
  const marketplace = await json(".agents/plugins/marketplace.json");
  assert.equal(marketplace.plugins.length, 1);
  const plugin = marketplace.plugins[0];
  assert.equal(plugin.name, (await json("plugin.json")).name);
  assert.equal(plugin.source.source, "local");
  assert.ok(plugin.source.path.startsWith("./"));
  const pluginRoot = await realpath(resolve(ROOT, plugin.source.path));
  const within = relative(ROOT, pluginRoot);
  assert.ok(within !== ".." && !within.startsWith(`..${sep}`) && !isAbsolute(within));
  assert.equal(pluginRoot, await realpath(ROOT));
  assert.equal(plugin.policy.installation, "AVAILABLE");
  assert.equal(plugin.policy.authentication, "ON_INSTALL");
  assert.equal(plugin.category, "Productivity");
});

test("portable stdio command is a bare executable or a contained relative path", async () => {
  const config = await json("mcp.json");
  const command = config.mcpServers["cjk-pdf-viewer"].command;
  assert.ok(/^[^/\\]+$/.test(command) || /^\.\/[^.]/.test(command));
});
