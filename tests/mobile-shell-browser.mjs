import assert from 'node:assert/strict';
import {browserHarness} from './browser-harness.mjs';
const b=await browserHarness('shiye-mobile-shell',(process.env.SHIYE_TEST_URL||'http://127.0.0.1:5173')+'/',
 async({command})=>command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true}));
try{
 await b.wait('.series-grid');
 await b.click('#top-settings','.settings-page');
 const check=async label=>{
   await b.sleep(60);
   const rect=await b.evaluate(`(()=>{const header=document.querySelector('.topbar'),
     h=header.getBoundingClientRect(),n=document.querySelector('.main-nav').getBoundingClientRect(),v=visualViewport;
     return {head:h.top,nav:n.bottom,top:v.offsetTop,bottom:v.offsetTop+v.height,
       scrollY,appTop:document.querySelector('#app').getBoundingClientRect().top,
       appHeight:document.querySelector('#app').getBoundingClientRect().height,
       appHidden:document.querySelector('#app').hidden,
       headerPosition:getComputedStyle(header).position,
       navigationPosition:getComputedStyle(document.querySelector('.main-nav')).position,
       appPadding:getComputedStyle(document.querySelector('#app')).paddingTop,
       topmost:document.elementFromPoint(innerWidth/2,Math.max(1,h.top+2))?.closest('.topbar')===header,
       outside:document.querySelector('.main-nav').parentElement===document.body};})()`);
   assert.equal(rect.outside,true,label);
   assert.equal(rect.headerPosition,'sticky',label);
   assert.equal(rect.navigationPosition,'fixed',label);
   assert.equal(rect.appPadding,'0px',label);
   assert.equal(rect.topmost,true,label+' page content must stay beneath the header '+JSON.stringify(rect));
   assert.ok(Math.abs(rect.head-rect.top)<2&&Math.abs(rect.nav-rect.bottom)<2,label+JSON.stringify(rect));
 };
 await check('initial');
 await b.evaluate('window.scrollTo(0,400)');await check('scrolled');
 await b.command('Emulation.setDeviceMetricsOverride',{width:390,height:420,deviceScaleFactor:1,mobile:true});
 await check('short viewport');
 await b.command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await check('restored viewport');
 await b.click('[data-route="works"]','.works-grid');await check('route after restore');
 await b.command('Emulation.setDeviceMetricsOverride',{width:1180,height:820,deviceScaleFactor:1,mobile:false});
 await b.sleep(80);
 assert.equal(await b.evaluate('document.querySelector(".main-nav").parentElement.classList.contains("topbar")'),true,'desktop layout remains in the header');
 assert.deepEqual(b.errors,[]);console.log('Mobile shell stays at viewport edges across scrolling, resize, route changes and desktop restoration');
}finally{await b.close();}
