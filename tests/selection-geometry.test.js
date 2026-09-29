import test from 'node:test';import assert from 'node:assert/strict';import {Window} from 'happy-dom';
import {syncSelectionGeometry} from '../src/selection-geometry.js';
test('selection follows the object, never writes stale frame coordinates into artwork',()=>{
  const w=new Window(),page=w.document.createElement('div');page.innerHTML='<div data-object="one" style="left:80px;top:90px;width:120px;height:150px;transform:rotate(20deg)"></div><div data-selection-for="one" style="left:0px;top:0px"></div>';
  syncSelectionGeometry(page,'one');const [object,overlay]=page.children;
  assert.equal(overlay.style.left,'80px');assert.equal(object.style.left,'80px');object.style.left='100px';syncSelectionGeometry(page,'one');assert.equal(overlay.style.left,'100px');assert.equal(overlay.style.transform,'rotate(20deg)');
  syncSelectionGeometry(page,'missing');assert.equal(object.style.top,'90px');w.happyDOM.abort();
});
