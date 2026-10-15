import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {captureMatchingScroll,restoreMatchingScroll} from '../src/matching-scroll.js';

const html=(changed=false)=>`<div class="matching-page">
  <section class="match-direction"><label>创作主题<textarea data-match-scroll="intent"></textarea></label>
    <details class="match-content-details" data-match-expand="notes"${changed?'':' open'}>
      <summary>事实与原文</summary>
      <textarea data-match-scroll="user-text"></textarea>
      <textarea data-match-scroll="facts"></textarea>
    </details>
  </section>
  <div class="matching-layout">
    <aside class="basket">
      <div class="match-basket-scroll" data-match-scroll="basket">${changed?'<p>new card</p>':''}<p>material</p></div>
    </aside>
    <section class="panel match-recommendations">
      <div class="match-chips" data-match-scroll="chips">many filters</div>
      <div class="match-rec-grid" data-match-scroll="recommendations">many materials</div>
    </section>
  </div>
  <section class="match-proposals"><div class="match-proposal-grid" data-match-scroll="proposals">new variants</div></section>
  <section class="match-action">actions</section>
  <section class="match-previews" data-match-scroll="previews">
    <div class="match-variant-grid" data-match-scroll="variants">completed artworks</div>
  </section>
</div>`;

function setup(){
  const browser=new Window({url:'https://example.test'}),root=browser.document.createElement('div');
  browser.document.body.append(root);
  let left=12,top=550;
  const viewport={
    get scrollX(){return left},get scrollY(){return top},
    scrollTo(x,y){left=x;top=y;}
  };
  const find=key=>root.querySelector('[data-match-scroll="'+key+'"]');
  return {browser,root,viewport,find,close(){browser.close();}};
}

test('adding, starring, excluding, filtering and proposing keep EVERY matching scroll pane',()=>{
  const env=setup();
  try{
    const keys=['basket','chips','recommendations','proposals','previews','variants',
      'intent','user-text','facts'];
    env.root.innerHTML=html();
    const scrollPositions=new Map(keys.map((key,i)=>[key,{left:i*11,top:(i+1)*83}]));
    for(const [key,position] of scrollPositions){
      env.find(key).scrollTop=position.top;
      env.find(key).scrollLeft=position.left;
    }
    env.root.querySelector('.match-direction').scrollTop=277;
    const snapshot=captureMatchingScroll(env.root,env.viewport);
    assert.equal(snapshot.viewport.top,550);
    assert.ok(snapshot.entries.length>=keys.length);
    // This simulates the full #view innerHTML replacement on all matching
    // operations, including adding a set to a new proposal generation.
    env.root.innerHTML=html(true);
    env.viewport.scrollTo(0,0);
    assert.equal(env.root.querySelector('details').open,false);
    assert.equal(restoreMatchingScroll(env.root,snapshot,env.viewport),true);
    assert.equal(env.root.querySelector('details').open,true);
    for(const [key,position] of scrollPositions){
      assert.equal(env.find(key).scrollTop,position.top,key+' vertical');
      assert.equal(env.find(key).scrollLeft,position.left,key+' horizontal');
    }
    assert.equal(env.root.querySelector('.match-direction').scrollTop,277);
    assert.equal(env.viewport.scrollY,550);
    assert.equal(env.viewport.scrollX,12);
  }finally{env.close();}
});

test('replacing only the recommendation panel does not move page or basket',()=>{
  const env=setup();
  try{
    env.root.innerHTML=html();
    env.find('recommendations').scrollTop=210;
    env.find('chips').scrollLeft=105;
    env.find('basket').scrollTop=125;
    const before=captureMatchingScroll(env.root,env.viewport);
    const replaced=env.root.querySelector('.match-recommendations');
    replaced.outerHTML='<section class="panel match-recommendations">'+
      '<div class="match-chips" data-match-scroll="chips">alternate filters</div>'+
      '<div class="match-rec-grid" data-match-scroll="recommendations">updated rows</div></section>';
    env.viewport.scrollTo(27,810);
    assert.equal(restoreMatchingScroll(env.root,before,env.viewport,{restoreViewport:false}),true);
    assert.equal(env.find('recommendations').scrollTop,210);
    assert.equal(env.find('chips').scrollLeft,105);
    assert.equal(env.find('basket').scrollTop,125);
    assert.equal(env.viewport.scrollY,810,'partial panel refresh must not scroll the browser');
  }finally{env.close();}
});

test('capturing outside matching has no effect; empty or missing states are harmless',()=>{
  const env=setup();
  try{
    env.root.innerHTML='<div class="works-grid">works</div>';
    assert.equal(captureMatchingScroll(env.root,env.viewport),null);
    assert.equal(restoreMatchingScroll(env.root,null,env.viewport),false);
    assert.equal(restoreMatchingScroll(env.root,{viewport:{top:10,left:0},entries:[]},env.viewport),false);
  }finally{env.close();}
});

test('full render and React matching refresh preserve scroll state',async()=>{
  const {readFile}=await import('node:fs/promises');
  const app=await readFile(new URL('../src/app.js',import.meta.url),'utf8');
  const session=await readFile(new URL('../src/matching-session.js',import.meta.url),'utf8');
  const markup=await readFile(new URL('../src/react-routes.jsx',import.meta.url),'utf8');
  assert.match(app,/previousMatchingScroll=captureMatchingScroll\(view,window\)/);
  assert.match(app,/restoreMatchingScroll\(view,matchingScrollMemory.scroll,window\)/);
  assert.match(app,/window\.dispatchEvent\(new Event\('shiye-matching-refresh'\)\)/);
  assert.match(markup,/addEventListener\('shiye-matching-refresh',update\)/);
  assert.match(session,/captureMatchingScroll\(root,globalThis.window\)/);
  assert.match(session,/restoreMatchingScroll\(root,scroll,globalThis.window\)/);
  for(const key of ['basket','recommendations','chips','intent'])
    assert.ok(markup.includes('data-match-scroll="'+key+'"'),key+' must have a stable scroll identity');
});
