// Real Chromium regression for persistent DOM, pointer/Canvas identity,
// and partial re-render semantics. Synthetic fixtures use no private account.
import assert from 'node:assert/strict';
import {browserHarness} from './browser-harness.mjs';

const b=await browserHarness('shiye-ui-incremental',
  process.env.SHIYE_TEST_URL||'http://127.0.0.1:5173');
try{
  await b.wait('.series-grid');
  for(const [width,height] of [[390,844],[768,1024],[1440,900]]){
    await b.command('Emulation.setDeviceMetricsOverride',
      {width,height,deviceScaleFactor:width===390?2:1,mobile:width<700});
    const result=await b.evaluate(`(async()=>{
      const {patchImportInspection}=await import('/src/import-incremental.js');
      const {reconcileLayerBranches}=await import('/src/ui-keyed-dom.js');
      const wrap=document.createElement('div');
      wrap.style.cssText='position:fixed;inset:0;z-index:9999;pointer-events:none';
      const html=(progress)=>'<nav class="import-nav">步骤</nav><section class="import-inspect" aria-busy="false">'+
        '<p class="import-processing">'+progress+'</p><div class="import-queue"><div>1张</div>'+
        '<button data-act="select-file">Add</button></div>'+
        '<div class="queue-strip"><button class="queue-item active" data-id="0"><img src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs="><span>照片1</span></button></div>'+
        '<section class="import-preparation"><h2>照片1</h2><div class="photo-preparation-content"><h3>选择画面范围</h3>'+
        '<div class="photo-preview"><img src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs="></div>'+
        '<div class="import-photo-tools"><button>预览校正</button></div></div></section>'+
        '<section class="import-inspector"><h2>检查识别结果</h2><div class="inspector-scroll">'+
        '<div class="inspector-settings"><label>宽<select><option>A4</option></select></label></div>'+
        '<h3>候选素材 · 0</h3><div class="import-candidate-grid"></div></div>'+
        '<button class="confirm-photo">确认</button></section></section>';
      wrap.innerHTML=html('处理中');
      document.body.append(wrap);
      const image=wrap.querySelector('.photo-preview img'),queue=wrap.querySelector('.queue-item');
      const canvas=document.createElement('canvas');canvas.width=8;canvas.height=8;
      const ctx=canvas.getContext('2d');ctx.fillStyle='#c00';ctx.fillRect(0,0,8,8);
      image.after(canvas);
      const result=patchImportInspection(wrap,html('已完成'));
      const preserved=result?.patched&&image===wrap.querySelector('.photo-preview img')&&
        queue===wrap.querySelector('.queue-item')&&canvas.isConnected&&
        canvas.getContext('2d').getImageData(4,4,1,1).data[0]===204;
      const first=document.createElement('div');first.innerHTML=
        '<div class="scene-layer-branch"><div data-scene-node="g">G</div>'+
        '<div class="scene-layer-children"><div class="scene-layer-branch">'+
        '<div data-scene-node="a">A</div></div></div></div>';
      const second=document.createElement('div');second.innerHTML=
        '<div class="scene-layer-branch"><div data-scene-node="g">G</div>'+
        '<div class="scene-layer-children"><div class="scene-layer-branch">'+
        '<div data-scene-node="a">A</div></div></div></div>';
      const node=first.firstElementChild,child=node.querySelector('[data-scene-node="a"]');
      const refs=new Map([['g',{}],['a',{}]]);
      reconcileLayerBranches(first,second,refs,refs);
      const stable=first.firstElementChild===node&&
        first.querySelector('[data-scene-node="a"]')===child;
      wrap.remove();
      return {preserved,stable,previewPixels:[canvas.width,canvas.height],frame:[innerWidth,innerHeight]};
    })()`);
    assert.ok(result.preserved,'Photo/Canvas DOM replaced at '+width+': '+JSON.stringify(result));
    assert.ok(result.stable,'Layer tree remounted at '+width+': '+JSON.stringify(result));
  }
}finally{await b.close();}
