import test from 'node:test';
import assert from 'node:assert/strict';
import {renderLibraryHTML} from '../src/page-controllers/library-view.js';
import {renderWorksHTML} from '../src/page-controllers/works-view.js';
import {renderImportHTML} from '../src/page-controllers/import-view.js';
import {renderSettingsHTML} from '../src/page-controllers/settings-view.js';

const esc=x=>String(x??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const head=title=>'<h1>'+title+'</h1>';

test('library view is a pure projection and does not mutate the source state',()=>{
  const state={series:[],seriesID:'all',assets:[{id:'a',title:'樱花',createdAt:'2026-10-13'}],
    preferences:{display:'grid'},query:'',kind:'all',status:'all',sort:'newest'};
  const before=JSON.stringify(state);
  const html=renderLibraryHTML({state,esc,head,kindName:k=>k,
    imgTag:()=>'',assetCard:a=>'<button data-id="'+a.id+'">'+a.title+'</button>',
    renderSeriesContents:()=>''});
  assert.match(html,/data-id="a"/);
  assert.match(html,/asset-grid/);
  assert.equal(JSON.stringify(state),before);
});
test('works view is projection-only and keeps stable project identifiers',()=>{
  const d={id:'d',paperColor:'#fff',canvas:{width:800,height:600}};
  const p={id:'p',title:'周末记录',updatedAt:'2026-10-13T06:00:00Z',
    drafts:[d],activeDraftID:'d',isDraft:true};
  const state={projects:[p]};
  const before=JSON.stringify(state);
  const html=renderWorksHTML({state,esc,head,isUntouchedLegacyExample:()=>false,
    workCover:()=>'<div class="cover"></div>',image:()=>'/cover.png'});
  assert.match(html,/data-id="p"/);
  assert.match(html,/data-work-revision=/);
  assert.equal(JSON.stringify(state),before);
});
test('import view returns the requested stage while maintaining workflow state',()=>{
  const state={importStep:'review',importMode:'material',importRecords:[],importIndex:0};
  const html=renderImportHTML({state,esc,fmt:String,importSteps:()=>'<nav>stage</nav>',
    importSourceButtons:()=>'',renderImportReview:()=>'<section class="review">Check</section>',
    renderImportInspection:()=>'<section class="inspect">Inspect</section>'});
  assert.match(html,/class="review"/);
  assert.doesNotMatch(html,/class="inspect"/);
  assert.equal(state.importStep,'review');
});
test('settings page is a pure root projection independent of document/DOM',()=>{
  const state={settingsSection:null};
  const html=renderSettingsHTML({state,esc});
  assert.match(html,/settings-list/);
  assert.equal(state.settingsSection,null);
});
