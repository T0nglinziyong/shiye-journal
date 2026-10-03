import test from 'node:test';import assert from 'node:assert/strict';import {Window} from 'happy-dom';
import {syncSelectionGeometry} from '../src/selection-geometry.js';
test('selection follows the object, never writes stale frame coordinates into artwork',()=>{
  const w=new Window(),page=w.document.createElement('div');page.innerHTML='<div data-object="one" style="left:80px;top:90px;width:120px;height:150px;transform:rotate(20deg)"></div><div data-selection-for="one" style="left:0px;top:0px"></div>';
  syncSelectionGeometry(page,'one');const [object,overlay]=page.children;
  assert.equal(overlay.style.left,'80px');assert.equal(object.style.left,'80px');object.style.left='100px';syncSelectionGeometry(page,'one');assert.equal(overlay.style.left,'100px');assert.equal(overlay.style.transform,'rotate(20deg)');
  syncSelectionGeometry(page,'missing');assert.equal(object.style.top,'90px');w.happyDOM.abort();
});

test('all woven projections follow owner geometry without altering masks or layer order',()=>{
  const w=new Window(),page=w.document.createElement('div');
  page.innerHTML='<div data-object="strip" data-render-key="strip:front" style="left:80px;top:90px;width:120px;height:15px;transform:rotate(20deg);z-index:11;clip-path:inset(0 30%)"></div><div data-object="strip" data-render-key="strip:back" style="left:60px;top:70px;z-index:9;clip-path:inset(0 70% 0 0)"></div><div data-object="other" style="left:4px"></div>';
  const [owner,back,other]=page.children;
  syncSelectionGeometry(page,'strip');
  assert.equal(back.style.left,'80px');assert.equal(back.style.transform,'rotate(20deg)');assert.equal(back.style.zIndex,'9');assert.equal(back.style.clipPath,'inset(0 70% 0 0)');assert.equal(other.style.left,'4px');
  const overlay=w.document.createElement('div');overlay.dataset.selectionFor='strip';overlay.style.left='0px';page.append(overlay);
  owner.style.left='100px';owner.style.transform='rotate(42deg)';syncSelectionGeometry(page,'strip');
  assert.equal(back.style.left,'100px');assert.equal(overlay.style.left,'100px');assert.equal(owner.style.left,'100px');assert.equal(back.dataset.renderKey,'strip:back');
  w.happyDOM.abort();
});
