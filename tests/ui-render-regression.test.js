import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {reconcileKeyedChildren,reconcileLayerBranches} from '../src/ui-keyed-dom.js';
import {patchImportInspection} from '../src/import-incremental.js';
import {patchMaterialCatalog} from '../src/catalog-incremental.js';
import {patchAISettingsModel} from '../src/settings-incremental.js';

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
    assert.notEqual(children.firstElementChild,keep);
  });
});
test('import recognition status updates do not detach photo, quadrilateral or queue image',()=>{
  const html=(progress,candidate)=>'<div class="import-nav"><button data-act="import-back">Back</button></div>'+
    '<section class="import-inspect" aria-busy="'+Boolean(progress)+'">'+
    '<p class="import-processing">'+progress+'</p>'+
    '<div class="import-queue"><div><strong>1 张照片</strong></div><button data-act="select-file">Add</button></div>'+
    '<div class="queue-strip"><button data-id="0" class="queue-item active"><img src="blob:one"><span>照片1</span></button></div>'+
    '<section class="import-preparation"><h2>照片 1</h2><div class="photo-preparation-content"><h3>选择画面范围</h3>'+
    '<div class="photo-preview"><img src="blob:one"></div><div class="import-photo-tools"><button>预览校正</button></div></div></section>'+
    '<section class="import-inspector"><h2>识别结果</h2><div class="inspector-scroll">'+
    '<div class="inspector-settings"><label>纸张<select><option>A4</option></select></label></div>'+
    '<h3>候选素材 · '+(candidate?'1':'0')+'</h3><div class="import-candidate-grid">'+
    (candidate?'<div class="candidate-choice"><button data-act="import-toggle-candidate" data-id="0">'+
      '<span class="candidate-thumb"><img src="blob:piece"></span><span>素材 1 ○</span>'+
      '<small>20 × 30 mm</small></button><button data-import-check="0">检查边缘</button></div>':'')+
    '</div></div><button class="confirm-photo">确认</button></section></section>';
  fixture('<div id="view">'+html('准备中',false)+'</div>',doc=>{
    const view=doc.querySelector('#view'),image=view.querySelector('.photo-preview img'),
      queue=view.querySelector('.queue-item'),parent=image.parentElement;
    const handle=doc.createElement('div');handle.className='paper-corner-overlay';parent.append(handle);
    const report=patchImportInspection(view,html('完成',true));
    assert.ok(report&&report.patched&&!report.photoReplaced);
    assert.equal(view.querySelector('.photo-preview img'),image);
    assert.equal(view.querySelector('.paper-corner-overlay'),handle);
    assert.equal(view.querySelector('.queue-item'),queue);
    assert.equal(view.querySelector('.import-processing').textContent,'完成');
    assert.equal(view.querySelectorAll('.candidate-choice').length,1);
    assert.equal(view.querySelector('.import-inspect').getAttribute('aria-busy'),'true');
    assert.equal(patchImportInspection(view,'<div class="import-review"></div>'),null);
  });
});
test('material catalog patches only changed item and preserves unaffected thumbnail',()=>{
  const card=(id,title,signature)=>'<button class="card" data-act="detail" data-id="'+id+
    '" data-card-revision="'+signature+'"><img src="blob:'+id+'"><strong>'+title+'</strong></button>';
  const shell=cards=>'<div class="view-head">Head</div><div class="filters">Filter</div>'+
    '<div class="asset-grid"><button class="card action-card">Add</button>'+cards+'</div>';
  fixture('<main id="view">'+shell(card('a','A','1')+card('b','B','1'))+'</main>',doc=>{
    const root=doc.querySelector('#view'),a=root.querySelector('[data-id="a"]'),
      b=root.querySelector('[data-id="b"]'),img=a.querySelector('img');
    const result=patchMaterialCatalog(root,shell(card('a','A','1')+card('b','B2','2')));
    assert.ok(result);
    assert.equal(root.querySelector('[data-id="a"]'),a);
    assert.equal(root.querySelector('[data-id="a"] img'),img);
    assert.notEqual(root.querySelector('[data-id="b"]'),b);
    assert.equal(root.querySelector('[data-id="b"] strong').textContent,'B2');
  });
});
test('model provider updates only connector subtree and keeps details node expanded',()=>{
  const current='<div class="settings-page"><section class="settings-detail"><details id="ai-model-group" open>'+
    '<summary>模型与连接</summary><div><input id="setting-ai-provider" value="a"></div></details></section></div>';
  const updated=current.replace('value="a"','value="b"');
  fixture('<main id="view">'+current+'</main>',doc=>{
    const root=doc.querySelector('#view'),node=root.querySelector('#ai-model-group');
    assert.equal(patchAISettingsModel(root,updated),true);
    assert.equal(root.querySelector('#ai-model-group'),node);
    assert.equal(node.open,true);
    assert.equal(node.querySelector('input').getAttribute('value'),'b');
  });
});
