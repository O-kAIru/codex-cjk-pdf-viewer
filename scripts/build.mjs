import { build } from 'esbuild';
import { readdir, readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const pdfRoot = path.join(root, 'node_modules/pdfjs-dist');
const resources = {};
for (const [group, folder, filter] of [['cmaps','cmaps',n=>n.endsWith('.bcmap')],['fonts','standard_fonts',n=>/\.(pfb|ttf|otf)$/.test(n)],['wasm','wasm',n=>n.endsWith('.wasm')]]) {
  resources[group] = {};
  for (const name of (await readdir(path.join(pdfRoot, folder))).filter(filter).sort()) {
    resources[group][name] = (await readFile(path.join(pdfRoot, folder, name))).toString('base64');
  }
}
if (!resources.cmaps['Adobe-Japan1-UCS2.bcmap']) throw new Error('Required Japanese CMap missing');
await writeFile(path.join(root, 'src/bundled-resources.mjs'), `export const bundledResources = ${JSON.stringify(resources)};\n`);
await mkdir(path.join(root,'dist'),{recursive:true});
const built = await build({entryPoints:[path.join(root,'src/viewer.mjs')],bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,write:false,legalComments:'inline'});
const template = await readFile(path.join(root,'src/viewer.html'),'utf8');
await writeFile(path.join(root,'dist/viewer.html'),template.replace('/* BUNDLE */',()=>built.outputFiles[0].text.replaceAll('</script','<\\/script')));
await build({entryPoints:[path.join(root,'server.mjs')],outfile:path.join(root,'dist/server.mjs'),bundle:true,format:'esm',platform:'node',target:'node22',minify:false,legalComments:'inline'});
await mkdir(path.join(root,'dist/licenses'),{recursive:true});
for(const folder of ['','cmaps','standard_fonts','wasm']) for(const name of await readdir(path.join(pdfRoot,folder))) {
 if(name.startsWith('LICENSE')||name==='COPYING')await cp(path.join(pdfRoot,folder,name),path.join(root,'dist/licenses',`${folder||'pdfjs'}-${name}`));
}
await writeFile(path.join(root,'dist/resource-manifest.json'),JSON.stringify({pdfjs:'5.4.296',counts:Object.fromEntries(Object.entries(resources).map(([k,v])=>[k,Object.keys(v).length]))},null,2)+'\n');
console.log('Built self-contained PDF viewer',Object.fromEntries(Object.entries(resources).map(([k,v])=>[k,Object.keys(v).length])));

// Preserve dependency notices with the self-contained release.
const names=[];
for (const d of await readdir(path.join(root,'node_modules'),{withFileTypes:true})) {
 if (!d.isDirectory()||d.name.startsWith('.')) continue;
 if(d.name.startsWith('@'))for(const e of await readdir(path.join(root,'node_modules',d.name),{withFileTypes:true})){if(e.isDirectory())names.push(d.name+'/'+e.name);}
 else names.push(d.name);
}
const notices=[];
for(const name of names.sort()){
 const folder=path.join(root,'node_modules',name);
 let info;try{info=JSON.parse(await readFile(path.join(folder,'package.json'),'utf8'));}catch{continue;}
 const files=(await readdir(folder,{withFileTypes:true})).filter(e=>e.isFile()&&/^(licen[cs]e|copying|notice)([._-].*)?$/i.test(e.name));
 for(const f of files)await cp(path.join(folder,f.name),path.join(root,'dist/licenses',name.replaceAll('/','_')+'-'+f.name));
 notices.push(`${info.name}@${info.version}: ${typeof info.license==='string'?info.license:'see package notice'}`);
}
await writeFile(path.join(root,'dist/licenses/DEPENDENCIES.txt'),notices.join('\n')+'\n');
