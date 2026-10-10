import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {patchMatchingView} from '../src/matching-incremental.js';

function page({star=false,removed=false,excluded=false,proposal=false}={}){
  const basketCard=(id,label)=>`<div class="match-basket-item" data-match-asset="${id}">
    <img src="blob:${id}" alt="${label}"><div><strong>${label}</strong>
    <small class="match-priority ${star&&id==='cat'?'required':'preferred'}">${star&&id==='cat'?'必须使用':'优先使用'}</small>
    <div><button data-act="match-core" data-id="${id}" aria-pressed="${star&&id==='cat'}">${star&&id==='cat'?'★':'☆'}</button>
    <button data-act="basket" data-id="${id}">移除</button></div></div></div>`;
  const candidate=(id,label)=>`<div class="match-rec" data-match-asset="${id}">
    <img src="blob:${id}"><div><strong>${label}</strong>
    <small class="match-type">贴纸</small><small class="match-priority">${excluded?'不可使用':'备选'}</small>
    <button data-act="basket" data-id="${id}">加入素材篮</button>
    <button data-act="${excluded?'match-allow':'match-skip'}" data-id="${id}">${excluded?'恢复':'不使用'}</button></div></div>`;
  return `<div class="matching-page">
   <div class="view-head unified-page-heading"><h1>素材搭配</h1></div>
   <section class="match-direction"><textarea id="match-intent">自由构图</textarea></section>
   <div class="matching-layout"><aside class="basket">
   <div data-match-scroll="basket" class="match-basket-scroll">${basketCard('cat','猫咪')}${removed?'':basketCard('tape','胶带')}</div>
   <p class="muted">必须 ${star?1:0} 件</p></aside>
   <section class="match-recommendations"><div class="match-panel-head"><small>${excluded?'有排除':'正常推荐'}</small></div>
   <div class="match-chips"><button data-act="match-filter" data-val="全部" class="active">全部</button></div>
   <div data-match-scroll="recommendations" class="match-rec-grid">${candidate('flower','花朵')}</div>
   </section></div>
   <section class="match-proposals"><div class="match-proposal-grid" data-match-scroll="proposals">${proposal?'<button data-act="match-propose-apply" data-id="new">新的创意</button>':'旧创意'}</div></section>
   <section class="match-action"><p>标星必用</p><button data-act="match-generate">进行AI创作</button></section>
   <section class="match-previews"><div data-match-scroll="variants">已生成作品</div></section>
  </div>`;
}

function fixture(){
  const win=new Window({url:'http://localhost:5180'}),old=new Map();
  for(const [name,value] of [['document',win.document],['window',win]]){
    old.set(name,Object.getOwnPropertyDescriptor(globalThis,name));
    Object.defineProperty(globalThis,name,{configurable:true,writable:true,value});
  }
  const view=win.document.createElement('main');win.document.body.append(view);
  view.innerHTML=page();
  return {win,view,close(){win.close();for(const [name,descriptor] of old){
    if(descriptor)Object.defineProperty(globalThis,name,descriptor);
    else delete globalThis[name];
  }}};
}

test('star action preserves title, inputs, all unchanged images and independent scroll positions',()=>{
 const f=fixture();
 try{
   const {view}=f,title=view.querySelector('.view-head'),
     textarea=view.querySelector('#match-intent'),
     cat=view.querySelector('[data-match-asset="cat"]'),
     catImg=cat.querySelector('img'),
     tape=view.querySelector('[data-match-asset="tape"]'),
     rec=view.querySelector('.match-rec'),
     recImg=rec.querySelector('img'),
     variants=view.querySelector('.match-previews');
   view.querySelector('[data-match-scroll="basket"]').scrollTop=160;
   view.querySelector('[data-match-scroll="recommendations"]').scrollTop=260;
   textarea.value='未提交的文字不得丢失';
   const result=patchMatchingView({
     view,renderHTML:()=>page({star:true}),
     regions:['.match-basket-scroll','.basket>.muted','.match-action'],
     onAction:()=>{}
   });
   assert.equal(result,true);
   assert.equal(view.querySelector('.view-head'),title);
   assert.equal(view.querySelector('#match-intent'),textarea);
   assert.equal(textarea.value,'未提交的文字不得丢失');
   assert.equal(view.querySelector('[data-match-asset="cat"]'),cat);
   assert.equal(cat.querySelector('img'),catImg);
   assert.equal(view.querySelector('[data-match-asset="tape"]'),tape);
   assert.equal(view.querySelector('.match-rec'),rec);
   assert.equal(rec.querySelector('img'),recImg);
   assert.equal(view.querySelector('.match-previews'),variants);
   assert.equal(view.querySelector('[data-act="match-core"][data-id="cat"]').getAttribute('aria-pressed'),'true');
   assert.equal(view.querySelector('[data-match-scroll="basket"]').scrollTop,160);
   assert.equal(view.querySelector('[data-match-scroll="recommendations"]').scrollTop,260);
 }finally{f.close();}
});

test('basket removal moves surviving card nodes without remounting the whole page',()=>{
 const f=fixture();try{
  const {view}=f,tape=view.querySelector('[data-match-asset="tape"]'),
    title=view.querySelector('.view-head'),
    scope=view.querySelector('.match-direction');
  patchMatchingView({view,renderHTML:()=>page({removed:true}),
    regions:['.match-basket-scroll','.basket>.muted','.match-rec-grid','.match-action'],
    onAction:()=>{}});
  assert.equal(view.querySelector('[data-match-asset="tape"]'),null);
  assert.equal(view.querySelector('.view-head'),title);
  assert.equal(view.querySelector('.match-direction'),scope);
  assert.equal(tape.isConnected,false);
 }finally{f.close();}
});

test('new cards receive only their own click bindings; unchanged proposal and title stay intact',()=>{
 const f=fixture();try{
  const {view}=f,header=view.querySelector('.view-head'),
    recImage=view.querySelector('.match-rec img'),events=[];
  patchMatchingView({view,renderHTML:()=>page({excluded:true}),
    regions:['.match-rec-grid','.match-recommendations .match-panel-head small'],
    onAction:(...args)=>events.push(args)});
  assert.equal(view.querySelector('.view-head'),header);
  assert.equal(view.querySelector('.match-rec img'),recImage);
  assert.equal(view.querySelector('[data-act="match-allow"]').textContent,'恢复');
  view.querySelector('[data-act="match-allow"]').click();
  assert.deepEqual(events,[['match-allow','flower',undefined]]);
  patchMatchingView({view,renderHTML:()=>page({proposal:true}),
    regions:['.match-proposals'],onAction:(...args)=>events.push(args)});
  view.querySelector('[data-act="match-propose-apply"]').click();
  assert.deepEqual(events[1],['match-propose-apply','new',undefined]);
 }finally{f.close();}
});

test('matching action handlers do not call full render on common operations',async()=>{
 const {readFile}=await import('node:fs/promises');
 const text=await readFile(new URL('../src/app.js',import.meta.url),'utf8');
 assert.match(text,/case 'match-core':[\s\S]*?updateMatchingRegions/);
 assert.match(text,/case 'basket':\{[\s\S]*?updateMatchingRegions/);
 assert.match(text,/case 'match-filter':[\s\S]*?updateMatchingRegions/);
 assert.doesNotMatch(text,/case 'match-propose-history-toggle'/,'PR87 proposals are deliberately excluded from the rebuilt baseline');
});


test('starring does not remove or reinsert any basket card, even momentarily',()=>{
 const f=fixture();
 try{
   const {view,win}=f,container=view.querySelector('.match-basket-scroll');
   const observer=new win.MutationObserver(()=>{});
   observer.observe(container,{childList:true});
   patchMatchingView({
     view,renderHTML:()=>page({star:true}),
     regions:['.match-basket-scroll','.basket>.muted'],
     onAction:()=>{}
   });
   assert.deepEqual(observer.takeRecords(),[],
     'No childList mutation on unchanged basket container is allowed');
   observer.disconnect();
 }finally{f.close();}
});
