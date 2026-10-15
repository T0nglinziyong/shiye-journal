import assert from 'node:assert/strict';
import {browserHarness} from './browser-harness.mjs';

// Hold the application bundle after HTML arrives. A logged-out visitor must
// never see the old app shell while the browser downloads or evaluates JS.
const browser=await browserHarness('shiye-login-first-paint',
  process.env.SHIYE_TEST_URL||'http://127.0.0.1:5173',async({command})=>{
    await command('Network.enable');
    await command('Network.setBlockedURLs',{urls:['*src/app.js*']});
  });
try{
  await browser.wait('#app');
  assert.equal(await browser.evaluate('document.querySelector("#app").hidden'),true);
  await browser.command('Network.setBlockedURLs',{urls:[]});
  await browser.command('Page.reload');
  await browser.wait('.series-grid');
  assert.equal(await browser.evaluate('document.querySelector("#app").hidden'),false);
  assert.deepEqual(browser.errors,[]);
  console.log('First paint stays hidden until app startup, then reveals the authenticated shell.');
}finally{await browser.close();}
