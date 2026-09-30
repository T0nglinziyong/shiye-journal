import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {browserHarness} from './browser-harness.mjs';

const directory=process.env.SHIYE_OFFLINE_SCREENSHOTS||'/tmp/shiye-offline-handoff';
await mkdir(directory,{recursive:true});
const b=await browserHarness('shiye-offline-handoff',process.env.SHIYE_TEST_URL||'http://localhost:5175');
const {command,evaluate,wait,click,sleep}=b;
try{
  await wait('.series-grid');
  for(const [width,height] of [[390,844],[768,1024],[1024,768],[1440,900]]){
    await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<700});
    await click('[data-route="library"]','.series-grid');await click('.swift-tabs button:nth-child(2)','.asset-grid');
    await click('.asset-grid [data-act="detail"]','.detail-columns');await click('[data-act="detail-add"]');
    await click('[data-route="matching"]','[data-act="match-export-gpt"]');
    await click('[data-act="match-export-gpt"]','#offline-gpt-prompt');
    assert.ok(await evaluate('document.querySelector("#offline-gpt-prompt").value.includes("START_HERE.txt")'));
    assert.ok(await evaluate('document.querySelector("#offline-gpt-prompt").value.length<130'));
    assert.ok(await evaluate('document.querySelector("#modal-body").textContent.includes(".zip")'));
    assert.ok(await evaluate('document.querySelector("#modal-body").textContent.includes("验证并导入参数")'));
    const shot=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(`${directory}/${width}x${height}-handoff.png`,Buffer.from(shot.data,'base64'));
    await click('.modal-close');
    await click('[data-act="match-import-gpt"]','#offline-gpt-result');
    assert.ok(await evaluate('document.querySelector("#modal-body").textContent.includes("验证并导入")'));
    await click('.modal-close');
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
  }
  assert.deepEqual(b.errors,[]);console.log('Offline GPT handoff verified in four viewports:',directory);
}finally{await b.close();}
