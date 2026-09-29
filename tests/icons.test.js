import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {iconMarkup,mountIcons,swiftIconSymbols} from '../src/icons.js';
import {readFileSync} from 'node:fs';

test('icon integration imports named Lucide icons without bundling the complete catalog',()=>{
  const source=readFileSync(new URL('../src/icons.js',import.meta.url),'utf8');
  assert.match(source,/createElement, Leaf, Folder/);
  assert.doesNotMatch(source,/import\s+\*|\{\s*icons\s*[,}]|const drawings=|<path d=/);
});

test('Lucide line icons use currentColor and no fonts, scripts or external resources',()=>{
  const window=new Window();globalThis.document=window.document;
  for(const name of Object.keys(swiftIconSymbols)){
    const svg=iconMarkup(name);assert.match(svg,/viewBox="0 0 24 24"/);assert.match(svg,/stroke="currentColor"/);assert.match(svg,/stroke-width="1.7"/);assert.match(svg,/aria-hidden="true"/);assert.doesNotMatch(svg,/<(?:text|image|script|foreignObject)|href=|url\(/);
  }
  assert.equal(iconMarkup('unrecognized'),'');
  delete globalThis.document;
});

test('mount replaces glyphs, preserves visible labels, handlers, input and counts',async()=>{
  const window=new Window(),doc=window.document;
  globalThis.document=doc;
  doc.body.innerHTML='<div class="brand"><b>♧</b></div><button data-route="library"><span aria-hidden="true">▣</span> 素材</button><button id="top-basket">本次创作 <span id="basket-count">3</span></button><button data-act="tool" data-val="pen">♧</button><button data-act="match-context">▤　上下文</button><button id="plain">完成</button><div class="filters"><input type="search" value="草木"></div>';
  const pen=doc.querySelector('[data-val="pen"]'),input=doc.querySelector('input');let clicked=0;pen.onclick=()=>clicked++;
  const stop=mountIcons(doc);assert.equal(mountIcons(doc),stop);
  assert.equal(doc.querySelector('.brand svg').dataset.shiyeIcon,'leaf');
  assert.equal(pen.getAttribute('aria-label'),'钢笔');pen.click();assert.equal(clicked,1);
  assert.equal(doc.querySelector('[data-route]').textContent.trim(),'素材');
  assert.equal(doc.querySelector('[data-act="match-context"]').textContent,'上下文');
  assert.equal(doc.querySelector('#basket-count').textContent,'3');assert.equal(doc.querySelector('#plain svg'),null);
  assert.equal(doc.querySelector('input'),input);assert.equal(input.value,'草木');
  const eraser=doc.createElement('button');eraser.dataset.act='tool';eraser.dataset.val='eraser';eraser.textContent='◇';doc.body.append(eraser);
  await window.happyDOM.waitUntilComplete();assert.equal(eraser.querySelector('svg').dataset.shiyeIcon,'eraser');
  stop();await window.happyDOM.abort();delete globalThis.document;
});

test('observer updates sorting and selection glyphs without duplicate SVGs',async()=>{
  const window=new Window(),doc=window.document;
  globalThis.document=doc;
  doc.body.innerHTML='<button data-filter-heading="排序顺序" aria-label="排序顺序：降序"><i>↓</i><span>降序</span></button><button aria-pressed="false"><span class="batch-check">□</span></button>';
  const stop=mountIcons(doc),filter=doc.querySelector('[data-filter-heading]'),card=doc.querySelector('[aria-pressed]');
  filter.setAttribute('aria-label','排序顺序：升序');filter.querySelector('i').textContent='↑';filter.querySelector('span').textContent='升序';card.setAttribute('aria-pressed','true');
  await window.happyDOM.waitUntilComplete();
  assert.equal(filter.querySelector('svg').dataset.shiyeIcon,'up');assert.equal(card.querySelector('svg').dataset.shiyeIcon,'checkSquare');
  assert.equal(filter.querySelectorAll('svg').length,1);assert.equal(card.querySelectorAll('svg').length,1);assert.equal(filter.querySelector('span').textContent,'升序');
  stop();await window.happyDOM.abort();delete globalThis.document;
});
