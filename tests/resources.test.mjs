import test from 'node:test';
import assert from 'node:assert/strict';
import { BundledCMapReaderFactory, BundledFontDataFactory, BundledWasmFactory, pdfResourceOptions } from '../src/resources.mjs';
import { bundledResources } from '../src/bundled-resources.mjs';
test('CMap API matches PDF.js 5.4 compressed-map contract', async()=>{
 const factory=new BundledCMapReaderFactory();
 const map=await factory.fetch({name:'Adobe-Japan1-UCS2'});
 assert.equal(map.isCompressed,true);
 assert.ok(map.cMapData instanceof Uint8Array);
 assert.ok(map.cMapData.length>10000);
 const value=map.cMapData[0];map.cMapData[0]^=255;
 assert.equal((await factory.fetch({name:'Adobe-Japan1-UCS2'})).cMapData[0],value);
});
test('all bundled CMaps are readable, and missing resources fail closed',async()=>{
 const f=new BundledCMapReaderFactory();
 assert.equal(Object.keys(bundledResources.cmaps).length,168);
 for(const key of Object.keys(bundledResources.cmaps))assert.ok((await f.fetch({name:key.replace(/\.bcmap$/,'')})).cMapData.length>0);
 await assert.rejects(()=>f.fetch({name:'../../private-file'}),/Missing bundled PDF resource/);
 const options=pdfResourceOptions();assert.equal(options.useWorkerFetch,false);assert.equal(options.isEvalSupported,false);
});
test('standard font and WebAssembly resources are bundled',async()=>{
 const f=new BundledFontDataFactory();for(const filename of Object.keys(bundledResources.fonts))assert.ok((await f.fetch({filename})).length>0);
 const w=new BundledWasmFactory();for(const filename of Object.keys(bundledResources.wasm))assert.deepEqual(Array.from((await w.fetch({filename})).slice(0,4)),[0,97,115,109]);
});
