import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {transformSync} from 'esbuild';

const source=readFileSync(new URL('../src/scene-cover.jsx',import.meta.url),'utf8');
const code=transformSync(source,{loader:'jsx',format:'cjs'}).code;
const module={exports:{}};
vm.runInThisContext(`(function(require,module,exports){${code}\n})`)(
  createRequire(import.meta.url),module,module.exports);
const {SceneCover}=module.exports;

test('cloud work cover mounts a private image while its preview is pending',()=>{
  const placeholder='data:image/svg+xml,%3Csvg%2F%3E#shiye-image=project-cover%3Acloudbase%3Aa';
  const html=renderToStaticMarkup(React.createElement(SceneCover,{
    draft:{coverImageID:'project-cover:cloudbase:a'},source:()=>placeholder,projectID:'work-a'
  }));
  assert.match(html,/<img[^>]+class="work-reference"[^>]+src="data:image\/svg\+xml/);
  assert.match(html,/正在准备预览/);
});
