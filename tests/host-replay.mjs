import { AppBridge, PostMessageTransport } from "@modelcontextprotocol/ext-apps/app-bridge";
import { SubscribeRequestSchema, UnsubscribeRequestSchema } from "@modelcontextprotocol/sdk/types.js";

// These constants are populated only by the test build. No private document is
// read or distributed by this harness.
const html = __VIEWER_HTML__;
const fixtureBlob = __FIXTURE_B64__;
const fixtureSha = __FIXTURE_SHA256__;
const URI_ONE = "host-resource://synthetic-japanese-pdf";
const URI_TWO = "host-resource://synthetic-japanese-pdf-copy";
const names = new Map([
  [URI_ONE, "japanese-cid-multipage.pdf"],
  [URI_TWO, "japanese-cid-multipage-copy.pdf"],
]);
const state = {
  initialized: false,
  readCount: 0,
  subscribeCount: 0,
  unsubscribeCount: 0,
  updateCount: 0,
  inputsSent: 0,
  representation: "",
  activeUri: URI_ONE,
  subscriptions: new Set(),
  requests: [],
};
const $ = (id) => document.getElementById(id);
$("fixture-sha").textContent = fixtureSha;
function trace(method, details = {}) {
  state.requests.push({ method, ...details });
  const row = document.createElement("li");
  row.textContent = `${method} ${JSON.stringify(details)}`;
  $("replay-log").append(row);
  $("read-count").textContent = String(state.readCount);
  $("subscribe-count").textContent = String(state.subscribeCount);
  $("unsubscribe-count").textContent = String(state.unsubscribeCount);
  $("representation").textContent = state.representation || "—";
  document.body.dataset.readCount = String(state.readCount);
  document.body.dataset.subscribeCount = String(state.subscribeCount);
  document.body.dataset.unsubscribeCount = String(state.unsubscribeCount);
}
function authorized(uri) {
  if (!names.has(uri)) throw new Error("This host replay authorizes only its synthetic fixture.");
}
const bridge = new AppBridge(
  null,
  { name: "CJK PDF synthetic host replay", version: "1.0.0" },
  {
    serverResources: {},
    logging: {},
    experimental: { "openai/resource": {} },
  },
  { hostContext: { theme: "light", displayMode: "fullscreen" } },
);

bridge.onreadresource = async (params) => {
  authorized(params.uri);
  const representation = params._meta?.["openai/resource"]?.representation;
  if (representation !== "blob") throw new Error("PDF requests must ask for blob representation.");
  state.readCount += 1;
  state.representation = representation;
  trace("resources/read", { uri: params.uri, representation });
  return {
    contents: [{
      uri: params.uri,
      mimeType: "application/pdf",
      blob: fixtureBlob,
      _meta: { "openai/resource": { writable: false, etag: `${fixtureSha}-${state.updateCount}` } },
    }],
  };
};
bridge.setRequestHandler(SubscribeRequestSchema, async ({ params }) => {
  authorized(params.uri);
  state.subscribeCount += 1;
  state.subscriptions.add(params.uri);
  trace("resources/subscribe", { uri: params.uri });
  return {};
});
bridge.setRequestHandler(UnsubscribeRequestSchema, async ({ params }) => {
  authorized(params.uri);
  state.unsubscribeCount += 1;
  state.subscriptions.delete(params.uri);
  trace("resources/unsubscribe", { uri: params.uri });
  return {};
});
bridge.onloggingmessage = ({ level, data }) => trace("app/log", { level, data });
bridge.onerror = (error) => {
  $("bridge-status").textContent = "error";
  trace("bridge/error", { message: error.message });
};

async function sendFile(uri) {
  authorized(uri);
  state.activeUri = uri;
  state.inputsSent += 1;
  await bridge.sendToolInput({ arguments: { file: { name: names.get(uri), resourceUri: uri } } });
  trace("ui/notifications/tool-input", { name: names.get(uri), uri });
}
bridge.oninitialized = async () => {
  state.initialized = true;
  document.body.dataset.bridgeInitialized = "true";
  $("bridge-status").textContent = "initialized";
  for (const id of ["reopen", "switch-file", "notify-update"]) $(id).disabled = false;
  trace("ui/notifications/initialized");
  // Deliver the real file-entrypoint contract, not a DOM file-input shortcut.
  await sendFile(URI_ONE);
};
$("reopen").addEventListener("click", () => sendFile(state.activeUri));
$("switch-file").addEventListener("click", () => sendFile(state.activeUri === URI_ONE ? URI_TWO : URI_ONE));
$("notify-update").addEventListener("click", async () => {
  state.updateCount += 1;
  await bridge.notification({
    method: "notifications/resources/updated",
    params: { uri: state.activeUri },
  });
  trace("notifications/resources/updated", { uri: state.activeUri });
});

// Exposes read-only observations for test automation; state changes go through
// the visible buttons and the normal AppBridge APIs.
window.__hostReplay = {
  snapshot: () => ({
    ...state,
    subscriptions: [...state.subscriptions],
    requests: [...state.requests],
    fixtureSha,
  }),
};
const iframe = $("viewer");
const transport = new PostMessageTransport(iframe.contentWindow, iframe.contentWindow);
await bridge.connect(transport);
$("bridge-status").textContent = "waiting for app initialization";
trace("transport/connected");
iframe.srcdoc = html;
