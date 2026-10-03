import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {openPopover,togglePopover,closePopover,closePopoverFor} from '../src/swift-popover.js';
function setup(){
 const w=new Window(),values={window:w,document:w.document,innerWidth:390,innerHeight:844,ResizeObserver:class{observe(){}unobserve(){}disconnect(){}}};
 const old=new Map(Object.keys(values).map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const [key,value] of Object.entries(values))Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
 const anchor=w.document.createElement('button');anchor.textContent='更多操作';w.document.body.append(anchor);
 return {w,anchor,close(){closePopover();w.close();for(const [key,value] of old){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}}};
}
test('clicking the same more trigger closes both parent and child without reopening',()=>{
 const e=setup();try{
  const menu=togglePopover(e.anchor,{menu:true});assert.ok(menu);assert.equal(e.anchor.getAttribute('aria-expanded'),'true');
  const child=document.createElement('section');menu.addSurface(child);assert.equal(child.isConnected,true);
  assert.equal(togglePopover(e.anchor,{menu:true}),null);assert.equal(child.isConnected,false);assert.equal(menu.surface.isConnected,false);assert.equal(e.anchor.getAttribute('aria-expanded'),'false');
  assert.ok(togglePopover(e.anchor,{menu:true}));assert.equal(document.querySelectorAll('.swift-popover').length,1);
 }finally{e.close();}
});
test('normal open callers keep receiving handles and another trigger replaces the active one',()=>{
 const e=setup();try{
  const a=openPopover(e.anchor);const other=document.createElement('button');document.body.append(other);
  const b=togglePopover(other);assert.ok(b);assert.equal(a.surface.isConnected,false);assert.equal(closePopoverFor(e.anchor),false);assert.equal(b.surface.isConnected,true);
  const c=openPopover(other);assert.ok(c);assert.equal(b.surface.isConnected,false);
 }finally{e.close();}
});
test('Escape closes descendants and restores the original trigger focus',()=>{
 const e=setup();try{
  const menu=openPopover(e.anchor,{menu:true});menu.content.append(document.createElement('button'));
  document.dispatchEvent(new e.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(menu.surface.isConnected,false);assert.equal(document.activeElement,e.anchor);
 }finally{e.close();}
});
test('a dismissed popover cannot steal focus in its queued microtask',async()=>{
 const e=setup();try{
  const menu=openPopover(e.anchor);const input=document.createElement('input');document.body.append(input);
  menu.close();input.focus();await Promise.resolve();assert.equal(document.activeElement,input);
  menu.close();assert.equal(e.anchor.getAttribute('aria-expanded'),'false');
 }finally{e.close();}
});
test('outside pointers dismiss but pointers on the trigger do not race the click toggle',()=>{
 const e=setup();try{
  const menu=togglePopover(e.anchor);e.anchor.dispatchEvent(new e.w.PointerEvent('pointerdown',{bubbles:true}));assert.equal(menu.surface.isConnected,true);
  assert.equal(togglePopover(e.anchor),null);
  const another=togglePopover(e.anchor);document.body.dispatchEvent(new e.w.PointerEvent('pointerdown',{bubbles:true}));assert.equal(another.surface.isConnected,false);
 }finally{e.close();}
});
test('a disconnected owner closes its surface instead of leaving a floating menu',()=>{
 const e=setup();try{const menu=openPopover(e.anchor);e.anchor.remove();menu.position();assert.equal(menu.surface.isConnected,false);}finally{e.close();}
});
