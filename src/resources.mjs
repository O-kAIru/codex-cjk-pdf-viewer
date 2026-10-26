import { bundledResources } from './bundled-resources.mjs';
const cache = new Map();
export function decodeBase64(value) {
  const raw = atob(value);
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}
export function getResource(group, name) {
  const key = `${group}/${name}`;
  if (cache.has(key)) return cache.get(key);
  const raw = bundledResources[group]?.[name];
  if (typeof raw !== 'string') throw new Error(`Missing bundled PDF resource: ${key}`);
  const bytes = decodeBase64(raw);
  cache.set(key, bytes);
  return bytes;
}
export class BundledCMapReaderFactory {
  async fetch({ name }) { return { cMapData: getResource('cmaps', `${name}.bcmap`).slice(), isCompressed: true }; }
}
export class BundledFontDataFactory {
  async fetch({ filename }) { return getResource('fonts', filename).slice(); }
}
export class BundledWasmFactory {
  async fetch({ filename }) { return getResource('wasm', filename).slice(); }
}
export function pdfResourceOptions() {
  return {
    CMapReaderFactory: BundledCMapReaderFactory,
    StandardFontDataFactory: BundledFontDataFactory,
    WasmFactory: BundledWasmFactory,
    cMapPacked: true,
    useWorkerFetch: false,
    useSystemFonts: false,
    isEvalSupported: false,
    enableXfa: false,
  };
}
