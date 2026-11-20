import assert from 'node:assert/strict';
import test from 'node:test';
import {createCanvas} from 'canvas';
import {pageContentBounds} from '../src/journal-preset-images.js';

test('a distinct finished page is cropped away from a uniform noisy surround',()=>{
  const oldDocument=globalThis.document;
  globalThis.document={createElement:()=>createCanvas(1,1)};
  try{
    const canvas=createCanvas(600,500),context=canvas.getContext('2d');
    context.fillStyle='#777';context.fillRect(0,0,600,500);
    context.fillStyle='#fff';context.fillRect(150,40,300,400);
    context.fillStyle='#43515a';context.fillRect(215,120,90,100);
    const bounds=pageContentBounds(canvas);
    assert.ok(bounds);
    assert.ok(Math.abs(bounds.x-.25)<.05,JSON.stringify(bounds));
    assert.ok(Math.abs(bounds.y-.08)<.05,JSON.stringify(bounds));
    assert.ok(bounds.width<.6&&bounds.height>.7);
  }finally{globalThis.document=oldDocument;}
});

test('mixed image borders do not trigger an unsafe automatic crop',()=>{
  const oldDocument=globalThis.document;
  globalThis.document={createElement:()=>createCanvas(1,1)};
  try{
    const canvas=createCanvas(400,300),context=canvas.getContext('2d');
    context.fillStyle='#222';context.fillRect(0,0,200,300);
    context.fillStyle='#eee';context.fillRect(200,0,200,300);
    assert.equal(pageContentBounds(canvas),null);
  }finally{globalThis.document=oldDocument;}
});
