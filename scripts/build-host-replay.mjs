import { build } from "esbuild";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const outputDirectory = path.resolve(process.argv[2] || "/tmp/codex-pdf-replay-20261026");
const viewerHtml = await readFile(path.join(root, "dist/viewer.html"), "utf8");
const fixturePath = path.join(root, "tests/fixtures/japanese-cid-multipage.pdf");
const fixture = await readFile(fixturePath);
const fixtureSha = createHash("sha256").update(fixture).digest("hex");
const expected = JSON.parse(await readFile(path.join(root, "tests/fixtures/expected.json"), "utf8"));
if (fixtureSha !== expected.sha256) throw new Error("Synthetic fixture digest does not match expected.json");
const built = await build({
  entryPoints: [path.join(root, "tests/host-replay.mjs")],
  bundle: true,
  platform: "browser",
  format: "esm",
  target: "es2022",
  minify: true,
  write: false,
  legalComments: "inline",
  define: {
    __VIEWER_HTML__: JSON.stringify(viewerHtml),
    __FIXTURE_B64__: JSON.stringify(fixture.toString("base64")),
    __FIXTURE_SHA256__: JSON.stringify(fixtureSha),
  },
});
const template = await readFile(path.join(root, "tests/host-replay.html"), "utf8");
const html = template.replace("/* HOST_BUNDLE */", () => built.outputFiles[0].text.replaceAll("</script", "<\\/script"));
await mkdir(outputDirectory, { recursive: true });
const outputPath = path.join(outputDirectory, "host-replay.html");
await writeFile(outputPath, html);
console.log(JSON.stringify({ outputPath, fixtureSha, bytes: Buffer.byteLength(html) }));
