import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {reconcileKeyedChildren,reconcileLayerBranches} from '../src/ui-keyed-dom.js';
import {syncBusyControls} from '../src/ui-disabled-state.js';

function fixture(markup,run){
  const previous=globalThis.document,window=new Window({url:'http://localhost/'});
  globalThis.document=window.document;
  window.document.body.innerHTML=markup;
  try{return run(window.document,window);}
  finally{globalThis.document=previous;window.happyDOM.abort();}
}
test('reordering a keyed list retains DOM node identity and click listeners',()=>{
  fixture('<div id="old"><button data-id="a">A</button><button data-id="b">B</button></div>'+
    '<div id="fresh"><button data-id="b">B</button><button data-id="a">A</button></div>',doc=>{
    const old=doc.querySelector('#old'),a=old.firstElementChild,b=a.nextElementSibling;
    let clicks=0;a.onclick=()=>clicks++;
    const stats=reconcileKeyedChildren(old,doc.querySelector('#fresh'),el=>el.dataset.id);
    assert.equal(stats.reused,2);
    assert.equal(old.firstElementChild,b);
    assert.equal(old.lastElementChild,a);
    a.click();assert.equal(clicks,1);
  });
});
test('layer tree patch retains unchanged sibling/child even when one lock icon changes',()=>{
  fixture('<div id="tree"><div class="scene-layer-branch"><div class="scene-layer-node" data-scene-node="group">G</div>'+
    '<div class="scene-layer-children"><div class="scene-layer-branch"><div data-scene-node="a">A unlocked</div></div>'+
    '<div class="scene-layer-branch"><div data-scene-node="b">B</div></div></div></div></div>'+
    '<div id="next"><div class="scene-layer-branch"><div class="scene-layer-node" data-scene-node="group">G</div>'+
    '<div class="scene-layer-children"><div class="scene-layer-branch"><div data-scene-node="a">A locked</div></div>'+
    '<div class="scene-layer-branch"><div data-scene-node="b">B</div></div></div></div></div>',doc=>{
    const root=doc.querySelector('#tree'),group=root.firstElementChild,
      children=group.querySelector('.scene-layer-children'),keep=children.lastElementChild;
    const objG={},objA={},objB={};
    const refs=new Map([['group',objG],['a',objA],['b',objB]]);
    reconcileLayerBranches(root,doc.querySelector('#next'),refs,refs);
    assert.equal(root.firstElementChild,group);
    assert.equal(group.querySelector('.scene-layer-children'),children);
    assert.equal(children.lastElementChild,keep);
    assert.equal(children.firstElementChild.textContent,'A locked');
    // New model instances on Undo must *not* retain stale event closures.
    const replacement=doc.createElement('div');
    replacement.innerHTML='<div class="scene-layer-branch"><div data-scene-node="b">B</div></div>';
    reconcileLayerBranches(children,replacement,refs,new Map([['b',{}]]));
    assert.notEqual(children.lastElementChild,keep);
  });
});
test('empty-state placeholder disappears when the first keyed proposal arrives',()=>{
  fixture('<div id="list"><p>尚未生成方案</p></div><div id="next">'+
    '<article data-variant="run1">方案 1</article></div>',doc=>{
    const list=doc.querySelector('#list'),next=doc.querySelector('#next');
    reconcileKeyedChildren(list,next,el=>el.dataset.variant||null);
    assert.equal(list.children.length,1);
    assert.equal(list.firstElementChild.dataset.variant,'run1');
  });
});
test('busy controls re-enable without overriding permanently disabled controls',()=>{
  fixture('<div id="root"><button id="a">可执行</button><button id="b" disabled>受限</button></div>',doc=>{
    const root=doc.querySelector('#root'),a=doc.querySelector('#a'),b=doc.querySelector('#b');
    syncBusyControls(root,'button',true);
    assert.equal(a.disabled,true);assert.equal(b.disabled,true);
    syncBusyControls(root,'button',false);
    assert.equal(a.disabled,false);assert.equal(b.disabled,true);
    assert.equal(a.hasAttribute('data-ui-busy-disabled'),false);
  });
});
