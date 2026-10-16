import assert from 'node:assert/strict';
import {browserHarness} from './browser-harness.mjs';

const url=process.env.SHIYE_TEST_URL||'http://127.0.0.1:5173';
if(!['127.0.0.1','localhost'].includes(new URL(url).hostname))
  throw Error('草稿删除验收只允许本机隔离站');
const b=await browserHarness('shiye-work-delete',url);
try{
  await b.wait('.series-grid');
  await b.evaluate(`(async()=>{
    const store=await import('/src/store.js');
    const now=new Date().toISOString();
    for(const [id,title,flags] of [
      ['snapshot-delete-test','快照删除验收',{isSnapshot:true,isDraft:false}],
      ['editable-delete-test','可编辑删除验收',{isDraft:false}],
      ['draft-delete-test','草稿删除验收',{isDraft:true}]]){
      await store.put('projects',{id,title,...flags,createdAt:now,updatedAt:now,
        activeDraftID:'draft',drafts:[{id:'draft',sceneVersion:2,
          canvas:{width:700,height:1000},physicalPageHeightMM:297,layers:[]}]});
    }
  })()`);
  await b.command('Page.reload');
  await b.wait('.series-grid');
  await b.click('[data-route="works"]','.works-grid');
  await b.evaluate(`window.confirm=()=>true`);
  for(const [tab,id,title] of [
    [1,'snapshot-delete-test','快照删除验收'],
    [2,'editable-delete-test','可编辑删除验收'],
    [3,'draft-delete-test','草稿删除验收']]){
    await b.click(`.swift-tabs button:nth-child(${tab})`);
    const card=`[data-act="open-project"][data-id="${id}"]`;
    await b.wait(card);
    await b.evaluate(`document.querySelector('.view-head .library-select-toggle').click()`);
    await b.click(card);
    await b.evaluate(`(()=>{
      const button=[...document.querySelectorAll('.library-management-tray button')]
        .find(node=>node.textContent.includes('删除'));
      if(!button)throw Error('删除按钮缺失');
      button.click();
    })()`);
    for(let i=0;i<100;i++){
      if(!await b.evaluate(`!!document.querySelector(${JSON.stringify(card)})`))break;
      await b.sleep(20);
    }
    const immediate=await b.evaluate(`(async()=>{
      const store=await import('/src/store.js');
      return {card:!!document.querySelector(${JSON.stringify(card)}),
        projects:(await store.all('projects')).map(row=>row.id),
        trash:(await store.all('trash')).map(row=>row.item?.id),
        toast:document.querySelector('#toast')?.textContent,
        tray:document.querySelector('.library-management-tray')?.textContent};
    })()`);
    assert.equal(immediate.card,false,`${title}删除后必须立即从列表消失：`+JSON.stringify({
      ...immediate,errors:b.errors,console:b.consoleMessages.slice(-8)}));
    assert.ok(immediate.trash.includes(id),`${title}应已移入最近删除`);
    await b.click('.swift-tabs button:nth-child(5)','.recently-deleted-grid');
    assert.ok(await b.evaluate(`document.body.textContent.includes(${JSON.stringify(title)})`),
      `${title}应立即在最近删除出现`);
  }
  assert.deepEqual(b.errors,[]);
  console.log('Snapshot, editable and draft deletion update lists without a reload');
}finally{await b.close();}
