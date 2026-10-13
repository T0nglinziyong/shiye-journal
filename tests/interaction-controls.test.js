import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {bindLongPress} from '../src/long-press.js';
import {mountFilterControl} from '../src/filter-controls.js';

test('touch hold tolerates finger jitter and pointerup detects a delayed timer',()=>{
  const win=new Window(),node=win.document.createElement('button'),oldSet=globalThis.setTimeout,oldClear=globalThis.clearTimeout,oldPerformance=globalThis.performance;let clock=0,pending=null,held=0,clicked=0;
  globalThis.performance={now:()=>clock};globalThis.setTimeout=fn=>{pending=fn;return 1;};globalThis.clearTimeout=()=>pending=null;
  const emit=(type,x=10)=>node.dispatchEvent(new win.PointerEvent(type,{bubbles:true,cancelable:true,clientX:x,clientY:10,pointerType:'touch',pointerId:1,button:0,isPrimary:true}));
  try{bindLongPress(node,()=>held++);node.addEventListener('click',()=>clicked++);emit('pointerdown');emit('pointermove',24);assert.ok(pending);clock=530;emit('pointerup');node.click();assert.equal(held,1);assert.equal(clicked,0);emit('pointerdown');emit('pointermove',40);clock=1200;emit('pointerup');assert.equal(held,1);emit('pointerdown');emit('pointercancel');assert.equal(pending,null);}finally{globalThis.performance=oldPerformance;globalThis.setTimeout=oldSet;globalThis.clearTimeout=oldClear;win.happyDOM.abort();}
});

test('filter reserves the longest option independently of the selected label',()=>{
  const win=new Window(),oldDocument=globalThis.document;globalThis.document=win.document;
  try{const select=win.document.createElement('select'),bar=win.document.createElement('div');select.innerHTML='<option value="name">名称</option><option value="updated">最近修改</option>';const button=mountFilterControl(select,bar,'排序依据','≡');const reserve=button.querySelector('.filter-width-reserve');assert.equal(reserve.textContent,'最近修改');assert.equal(reserve.getAttribute('aria-hidden'),'true');select.value='updated';select.dispatchEvent(new win.Event('change'));assert.equal(button.querySelector('span').textContent,'最近修改');select.value='name';select.dispatchEvent(new win.Event('change'));assert.equal(reserve.textContent,'最近修改');assert.equal(button.querySelector('span').textContent,'名称');}finally{globalThis.document=oldDocument;win.happyDOM.abort();}
});

test('long press cancels on movement/release and consumes only its own click',()=>{
  const win=new Window(),node=win.document.createElement('button'),oldSet=globalThis.setTimeout,oldClear=globalThis.clearTimeout;let pending=null,held=0,clicked=0,enabled=true;
  globalThis.setTimeout=fn=>{pending=fn;return 1;};globalThis.clearTimeout=()=>pending=null;
  const emit=(type,x=10,y=10)=>node.dispatchEvent(new win.PointerEvent(type,{bubbles:true,cancelable:true,clientX:x,clientY:y,button:0,isPrimary:true}));
  try{bindLongPress(node,()=>held++,()=>enabled);node.addEventListener('click',()=>clicked++);emit('pointerdown');assert.ok(pending);emit('pointermove',30,10);assert.equal(pending,null);node.click();assert.equal(clicked,1,'a moving tap must still open the card');emit('pointerdown');emit('pointerup');assert.equal(pending,null);node.click();assert.equal(clicked,2);emit('pointerdown');pending();emit('pointerup');node.click();assert.equal(held,1);assert.equal(clicked,2);emit('pointerdown');emit('pointerup');node.click();assert.equal(clicked,3);enabled=false;emit('pointerdown');assert.equal(pending,null);node.dispatchEvent(new win.KeyboardEvent('keydown',{key:'ContextMenu'}));assert.equal(held,1);}finally{globalThis.setTimeout=oldSet;globalThis.clearTimeout=oldClear;win.happyDOM.abort();}
});
test('only a short touch opens details; a modest hold opens edit',()=>{
  const win=new Window(),node=win.document.createElement('button'),oldSet=globalThis.setTimeout,oldClear=globalThis.clearTimeout,oldPerformance=globalThis.performance;let now=0,pending,edit=0,details=0;
  globalThis.performance={now:()=>now};globalThis.setTimeout=fn=>{pending=fn;return 1;};globalThis.clearTimeout=()=>pending=null;
  const emit=type=>node.dispatchEvent(new win.PointerEvent(type,{bubbles:true,cancelable:true,clientX:1,clientY:1,pointerType:'touch',pointerId:1,button:0,isPrimary:true}));
  try{bindLongPress(node,()=>edit++);node.addEventListener('click',()=>details++);emit('pointerdown');now=150;emit('pointerup');node.click();assert.deepEqual([edit,details],[0,1]);emit('pointerdown');now=650;emit('pointerup');node.click();assert.deepEqual([edit,details],[1,1]);}finally{globalThis.setTimeout=oldSet;globalThis.clearTimeout=oldClear;globalThis.performance=oldPerformance;win.happyDOM.abort();}
});
