import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('offline shell includes only the HTML entry and its direct assets',()=>{
 const file=readFileSync(new URL('../scripts/precache.mjs',import.meta.url),'utf8');
 assert.match(file,/readFile\(join\(root,'index\.html'\)/);
 assert.match(file,/entryAssets/);
 assert.doesNotMatch(file,/files\(root\)\)\.filter/);
});
