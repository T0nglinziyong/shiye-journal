import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('automatic A4 corner detection uses the selected physical width/height ratio',()=>{
  const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
  assert.match(app,/suggestPaperCorners\(bitmap,\(\(\)=>\{const \[pw,ph\]=paperDimensions\(\);return pw\/ph;\}\)\(\)\)/);
  assert.doesNotMatch(app,/suggestPaperCorners\(bitmap\)\.catch/);
});

test('edited A4 corners cannot silently reuse material cutouts from old rectification',()=>{
  const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
  assert.match(app,/record\?\.appliedCorners!==JSON\.stringify\(state\.paperCorners\)/);
  assert.match(app,/纸张四角已调整/);
});
