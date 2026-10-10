import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {TOAST_MAX_DURATION_MS,showToast} from '../src/toast.js';

function fixture(){
  let now=0,sequence=0;
  const timers=new Map(),classes=new Set(),events=[];
  const element={
    textContent:'',
    offsetWidth:200,
    classList:{
      add(value){classes.add(value);events.push({now,event:'add:'+value});},
      remove(value){classes.delete(value);events.push({now,event:'remove:'+value});},
      contains(value){return classes.has(value);}
    }
  };
  const schedule=(fn,delay)=>{const id=++sequence;timers.set(id,{deadline:now+delay,fn});return id;};
  const cancel=id=>timers.delete(id);
  function tick(delta){
    const end=now+delta;
    while(true){
      const next=[...timers].filter(([,entry])=>entry.deadline<=end)
        .sort((a,b)=>a[1].deadline-b[1].deadline)[0];
      if(!next)break;
      now=next[1].deadline;timers.delete(next[0]);next[1].fn();
    }
    now=end;
  }
  const show=message=>showToast(message,{element,schedule,cancel});
  return {element,events,show,tick,classes,timers,time:()=>now};
}

test('all transient errors and tips disappear within 1000 ms',()=>{
  const f=fixture();
  assert.equal(TOAST_MAX_DURATION_MS,1000);
  for(const message of ['请先在设置中填写 API 密钥','素材已保存','图片识别失败']){
    f.show(message);
    assert.equal(f.element.textContent,message);
    assert.equal(f.element.classList.contains('show'),true);
    f.tick(999);
    assert.equal(f.element.classList.contains('show'),true);
    f.tick(1);
    assert.equal(f.element.classList.contains('show'),false);
  }
});

test('a new message cancels the old dismissal without leaving stale timers',()=>{
  const f=fixture();
  f.show('首次错误');f.tick(400);
  f.show('后续提醒');f.tick(600);
  assert.equal(f.element.textContent,'后续提醒');
  assert.equal(f.element.classList.contains('show'),true);
  assert.equal(f.timers.size,1);
  f.tick(399);assert.equal(f.element.classList.contains('show'),true);
  f.tick(1);assert.equal(f.element.classList.contains('show'),false);
  assert.equal(f.timers.size,0);
});

test('rapid duplicate warnings do not extend their original one-second deadline',()=>{
  const f=fixture();
  f.show('请先配置 API 密钥');f.tick(400);
  f.show('请先配置 API 密钥');f.tick(400);
  f.show('请先配置 API 密钥');f.tick(200);
  assert.equal(f.element.classList.contains('show'),false);
  assert.equal(f.events.filter(x=>x.event==='add:show').length,1);
});

test('missing toast host is nonfatal and no global alert is opened',()=>{
  assert.equal(showToast('无需显示',{element:null}),false);
});

test('CSS forces full fade-out by 1000ms even when timers are throttled',async()=>{
  const css=await readFile(new URL('../src/styles.css',import.meta.url),'utf8');
  assert.match(css,/#toast\.show\{animation:shiye-toast-one-second 1000ms/);
  assert.match(css,/@keyframes shiye-toast-one-second\{[^}]*0%\{opacity:0\}/);
  assert.match(css,/100%\{opacity:0\}/);
  assert.doesNotMatch(css,/#toast\{[^}]*transition:opacity/);
});

test('every catalogue catch handler routes into the same short-lived notice manager',async()=>{
  const files=['app.js','workflow-ui.js','library-selection-ui.js','series-contents.js'];
  for(const file of files){
    const text=await readFile(new URL('../src/'+file,import.meta.url),'utf8');
    assert.match(text,/import \{showToast\} from '\.\/toast\.js';/,file);
    assert.doesNotMatch(text,/querySelector\('#toast'\).*?classList\.add\('show'\)/s,file);
    assert.doesNotMatch(text,/setTimeout\([^\n]{0,120}classList\.remove\('show'\)/,file);
  }
});
