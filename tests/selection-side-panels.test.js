import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {openPopover,closePopover} from '../src/swift-popover.js';
import {createSelectionSidePanels,selectionSideGeometry,selectionMenuWidth,reserveSelectionMenuSpace,selectionMorePopoverOptions} from '../src/selection-side-panels.js';

const rect=(left,top,width,height)=>({left,top,width,height,right:left+width,bottom:top+height});
test('More initially reserves adequate room; parent geometry never changes on child toggles',()=>{
 for(const width of [320,390,480,600,768,1024,1440]){
   const parentWidth=selectionMenuWidth(width);
   for(const naturalLeft of [12,Math.round(width/2-parentWidth/2),width-12-parentWidth]){
     const reserved=reserveSelectionMenuSpace({
       viewportWidth:width,width:parentWidth,left:naturalLeft
     });
     const menu=rect(reserved.left,400,parentWidth,225);
     const values=selectionSideGeometry({viewportWidth:width,viewportHeight:844,
       menu,panelHeight:520});
     assert.equal(values.parentLeft,reserved.left);
     assert.equal(values.parentWidth,parentWidth);
     assert.ok(values.panelLeft>=11&&values.panelLeft+values.panelWidth<=width-11,
       JSON.stringify({width,naturalLeft,reserved,values}));
     assert.ok(values.panelWidth>=130,'A readable side drawer must fit without touching More');
     if(values.side==='right')assert.ok(values.panelLeft>=menu.right+7);
     else assert.ok(values.panelLeft+values.panelWidth<=menu.left-7);
   }
 }
});
test('position preference: right first, then left, shift parent left only at initial open',()=>{
 const w=1440,parent=245;
 let initial=reserveSelectionMenuSpace({viewportWidth:w,width:parent,left:300});
 assert.equal(initial.left,300);
 assert.equal(selectionSideGeometry({viewportWidth:w,viewportHeight:900,
   menu:rect(initial.left,350,parent,225)}).side,'right');
 initial=reserveSelectionMenuSpace({viewportWidth:w,width:parent,left:1050});
 assert.equal(initial.left,1050);
 assert.equal(selectionSideGeometry({viewportWidth:w,viewportHeight:900,
   menu:rect(initial.left,350,parent,225)}).side,'left');
 initial=reserveSelectionMenuSpace({viewportWidth:600,width:245,left:210});
 assert.equal(initial.left,12);
 assert.equal(initial.shifted,true);
 assert.equal(selectionSideGeometry({viewportWidth:600,viewportHeight:844,
   menu:rect(initial.left,400,245,225)}).side,'right');
});

function setup(width=390){
 const win=new Window(),old=new Map();
 for(const [key,value] of Object.entries({
   window:win,document:win.document,innerWidth:width,innerHeight:844,
   ResizeObserver:class{observe(){}unobserve(){}disconnect(){}}
 })){
   old.set(key,Object.getOwnPropertyDescriptor(globalThis,key));
   Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
 }
 const anchor=win.document.createElement('button');
 anchor.textContent='更多操作';win.document.body.append(anchor);
 anchor.getBoundingClientRect=()=>rect(width-115,720,90,36);
 const menu=openPopover(anchor,selectionMorePopoverOptions());
 // Happy DOM does not measure layout. Supply predictable dimensions for
 // the real popover geometry while retaining its real lifecycle listeners.
 Object.defineProperty(menu.surface,'offsetWidth',{configurable:true,get:()=>parseFloat(menu.surface.style.width)||selectionMenuWidth(width)});
 menu.surface.getBoundingClientRect=()=>{
   const left=parseFloat(menu.surface.style.left)||width-selectionMenuWidth(width)-12;
   const top=parseFloat(menu.surface.style.top)||450;
   const w=parseFloat(menu.surface.style.width)||selectionMenuWidth(width);
   return rect(left,top,w,200);
 };
 menu.position(); // Both width and reserve-left are fixed before any child appears.
 const makeAction=(label,handler)=>{
   const button=win.document.createElement('button');
   button.textContent=label;button.onclick=handler;return button;
 };
 return {win,menu,anchor,makeAction,close(){
   closePopover();win.close();
   for(const [key,descriptor] of old){
     if(descriptor)Object.defineProperty(globalThis,key,descriptor);
     else delete globalThis[key];
   }
 }};
}

test('opening a category creates a sibling pane, switches categories, and closes on same trigger',()=>{
 const context=setup(390);
 try{
   const {win,menu,anchor,makeAction}=context;
   const control=createSelectionSidePanels(menu,{anchor,makeAction});
   const first=win.document.createElement('button');
   first.textContent='加入系列';menu.content.append(first);
   const second=win.document.createElement('button');
   second.textContent='设置状态';menu.content.append(second);
   let ran=0;
   const original={left:menu.surface.style.left,top:menu.surface.style.top,width:menu.surface.style.width};
   const initial=control.open(first,'加入系列',[
     ['新建系列…',()=>{ran++;}],['不归入系列',()=>{}],['选项一',()=>{}]
   ],{pinned:2});
   assert.ok(initial.isConnected);
   assert.deepEqual({left:menu.surface.style.left,top:menu.surface.style.top,width:menu.surface.style.width},original);
   assert.ok(!menu.surface.contains(initial),'Child must not be embedded in More');
   assert.equal(first.getAttribute('aria-expanded'),'true');
   assert.equal(initial.querySelectorAll('.selection-side-pinned button').length,2);
   initial.querySelector('button').click();assert.equal(ran,1);
   control.open(second,'设置状态',[['已使用',()=>{}],['未使用',()=>{}]]);
   assert.equal(initial.isConnected,false);
   assert.equal(first.getAttribute('aria-expanded'),'false');
   assert.equal(win.document.querySelectorAll('.selection-side-panel').length,1);
   assert.equal(second.getAttribute('aria-expanded'),'true');
   assert.deepEqual({left:menu.surface.style.left,top:menu.surface.style.top,width:menu.surface.style.width},original);
   control.open(second,'设置状态',[['已使用',()=>{}]]);
   assert.equal(win.document.querySelectorAll('.selection-side-panel').length,0);
   assert.equal(menu.surface.isConnected,true);
   assert.deepEqual({left:menu.surface.style.left,top:menu.surface.style.top,width:menu.surface.style.width},original);
 }finally{context.close();}
});

test('outside pointer and Escape remove BOTH panes while parent trigger stays available',()=>{
 const context=setup(768);
 try{
   const {win,menu,anchor,makeAction}=context;
   const control=createSelectionSidePanels(menu,{anchor,makeAction});
   const trigger=win.document.createElement('button');menu.content.append(trigger);
   control.open(trigger,'导出作品',[['ZIP',()=>{}]]);
   assert.equal(win.document.querySelectorAll('.selection-side-panel').length,1);
   win.document.dispatchEvent(new win.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
   assert.equal(win.document.querySelectorAll('.selection-side-panel').length,0);
   assert.equal(menu.surface.isConnected,false);
   assert.equal(anchor.getAttribute('aria-expanded'),'false');
 }finally{context.close();}
});

test('Works and all catalog tabs have the same header-to-cover spacing',async()=>{
 const {readFile}=await import('node:fs/promises');
 const styles=await readFile(new URL('../src/overrides.css',import.meta.url),'utf8');
 assert.match(styles,/#view > \.works-page > \.catalog-toolbar ~ \.works-grid/);
 assert.match(styles,/#view > \.works-page > \.catalog-toolbar ~ \.journal-template-grid/);
 assert.match(styles,/#view > \.works-page \+ \.recently-deleted-grid/);
 assert.match(styles,/margin-top:12px/);
 assert.match(styles,/@media\(max-width:699px\)[\s\S]*margin-top:10px/);
});

test('Works uses side-drawer used/unused choices rather than a binary confirm',async()=>{
 const {readFile}=await import('node:fs/promises');
 const code=await readFile(new URL('../src/workflow-ui.js',import.meta.url),'utf8');
 assert.match(code,/\['设置状态',\[/);
 assert.match(code,/\['已使用',\(\)=>setSelectedWorkUsage\(c,true\)\]/);
 assert.match(code,/\['未使用',\(\)=>setSelectedWorkUsage\(c,false\)\]/);
 assert.doesNotMatch(code,/取消则标记为“未使用”/);
});
