import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {journalBundledFonts} from '../src/journal-font-catalog.js';
import {journalFontFamily,configureJournalFontLoader,prepareJournalFont} from '../src/journal-fonts.js';
import {offlineBundledFonts} from '../src/offline-bundled-fonts.mjs';
import {loadOfflineCanvas} from '../src/offline-node-preview.mjs';
import {localGlyphOutline} from '../src/creation-font-resolver.mjs';
import {geometryArea} from '../src/craft-topology.js';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
test('font discovery and renderer identity do not depend on the launch directory',()=>{
 const fonts=new URL('../src/offline-bundled-fonts.mjs',import.meta.url).href,renderer=new URL('../src/offline-node-preview.mjs',import.meta.url).href;
 const script=`const {offlineBundledFonts}=await import(${JSON.stringify(fonts)});const {loadOfflineCanvas}=await import(${JSON.stringify(renderer)});const c=await loadOfflineCanvas();console.log(JSON.stringify({count:offlineBundledFonts().length,backend:c.rendererBackend}));`;
 const result=JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',script],{cwd:tmpdir(),encoding:'utf8'}));
 assert.equal(result.count,journalBundledFonts.length);assert.equal(result.backend,'node-canvas@3.2.3');
 assert.throws(()=>offlineBundledFonts('/missing-shiye-font-root'),/预装字体缺失/);
});
test('handwriting assets have pinned checksums and redistribution notices',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../src/assets/fonts/manifest.json',import.meta.url),'utf8'));
 for(const font of manifest.fonts){
  assert.ok((await readFile(new URL('../src/assets/fonts/'+font.license,import.meta.url))).length>100);
  for(const file of font.files)assert.equal(createHash('sha256').update(await readFile(new URL('../src/assets/fonts/'+file.file,import.meta.url))).digest('hex'),file.sha256);
 }
 assert.equal(offlineBundledFonts().length,journalBundledFonts.length);
});
test('font loading is lazy, coalesced per family, and loads Chinese handwriting for missing Japanese glyphs',async()=>{
 const calls=[];configureJournalFontLoader(async family=>{calls.push(family);});
 await prepareJournalFont({style:'sans'});assert.deepEqual(calls,[]);
 await Promise.all([prepareJournalFont({fontName:'Sophora'}),prepareJournalFont({fontName:'Sophora'})]);
 assert.deepEqual(calls.sort(),['Sophora','Xiaolai']);
 assert.match(journalFontFamily({fontName:'Sophora'}),/^"Sophora","Xiaolai"/);
 await prepareJournalFont({fontName:'Otsutome'});assert.equal(calls.filter(f=>f==='Xiaolai').length,1);
 configureJournalFontLoader(undefined);
});
test('server renders distinct real fonts and resolves bundled glyphs without system font installation',async()=>{
 const canvas=await loadOfflineCanvas();assert.equal(canvas.bundledFonts.length,journalBundledFonts.length);
 const results=new Set();
 for(const font of journalBundledFonts){
  const c=canvas.createCanvas(640,100),ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,640,100);
  ctx.fillStyle='#223344';ctx.font='36px '+journalFontFamily({fontName:font.family});ctx.fillText('春日手帐 Journal 2026',10,60);
  results.add(createHash('sha256').update(c.toBuffer('image/png')).digest('hex'));
 }
 assert.equal(results.size,journalBundledFonts.length);
 assert.ok(geometryArea(localGlyphOutline('DAY',{fontFamily:'Xiaolai',fontSizePt:20}))>0);
});
