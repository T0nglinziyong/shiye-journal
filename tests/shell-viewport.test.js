import test from 'node:test';
import assert from 'node:assert/strict';
import {shellViewportRect,observeShellViewport} from '../src/shell-viewport.js';
test('mobile shell follows visual viewport through keyboard, scrolling and restoration',()=>{
 const win={scrollY:300,innerHeight:844};
 assert.deepEqual(shellViewportRect({pageTop:340,height:400},win),{top:340,bottom:740});
 assert.deepEqual(shellViewportRect({pageTop:300,height:844},win),{top:300,bottom:1144});
 assert.deepEqual(shellViewportRect({pageTop:0,height:844},win),{top:0,bottom:844});
 assert.deepEqual(shellViewportRect(null,win),{top:300,bottom:1144});
});
test('viewport observer batches events and releases listeners without route rendering',()=>{
 const viewport=Object.assign(new EventTarget(),{pageTop:10,height:600});
 const win=Object.assign(new EventTarget(),{visualViewport:viewport,scrollY:0,innerHeight:800});
 let scheduled,requests=0;win.requestAnimationFrame=fn=>{scheduled=fn;requests++;return 1;};
 win.cancelAnimationFrame=()=>{scheduled=null;};
 const values=new Map(),root={style:{setProperty:(k,v)=>values.set(k,v),removeProperty:k=>values.delete(k)}};
 const dispose=observeShellViewport(win,root);
 viewport.pageTop=200;viewport.height=400;
 for(let n=0;n<20;n++)viewport.dispatchEvent(new Event('resize'));
 assert.equal(requests,1);scheduled();
 assert.equal(values.get('--shell-visible-bottom'),'600px');
 dispose();win.dispatchEvent(new Event('scroll'));assert.equal(requests,1);assert.equal(values.size,0);
});
