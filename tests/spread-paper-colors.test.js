import assert from 'node:assert/strict';
import test from 'node:test';
import {createCanvas} from 'canvas';
import {project} from '../src/domain.js';
import {applyScenePagePatch} from '../src/scene-edit-kernel.js';
import {USER_SCENE_POLICY} from '../src/scene-edit-policy.js';
import {paperColorFor} from '../src/paper-colors.js';
import {drawPaper} from '../src/paper-rendering.js';
import {craftSceneHash} from '../src/craft-fingerprint.js';

test('editing one spread background preserves the other and changes the rendered page',()=>{
 const draft=project('双色页',{mode:'spread',ratio:'a4'}).drafts[0];
 applyScenePagePatch(draft,{paperColors:{left:'#D84B68',right:'#F4E7B2'}},{policy:USER_SCENE_POLICY});
 const before=craftSceneHash(draft);
 applyScenePagePatch(draft,{paperColors:{left:'#A9D7E7',right:paperColorFor(draft,'right')}},{policy:USER_SCENE_POLICY});
 assert.equal(paperColorFor(draft,'left'),'#A9D7E7');
 assert.equal(paperColorFor(draft,'right'),'#F4E7B2');
 assert.notEqual(craftSceneHash(draft),before);
 const canvas=createCanvas(draft.canvas.width,draft.canvas.height);
 drawPaper(canvas.getContext('2d'),draft);
 const ctx=canvas.getContext('2d'),read=x=>[...ctx.getImageData(x,2,1,1).data].slice(0,3);
 assert.deepEqual(read(2),[169,215,231]);
 assert.deepEqual(read(canvas.width-2),[244,231,178]);
});
