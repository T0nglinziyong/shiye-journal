import test from 'node:test';
import assert from 'node:assert/strict';
import {selectionSideGeometry,selectionMenuWidth,reserveSelectionMenuSpace} from '../src/selection-side-panels.js';

const rect=(left,top,width,height)=>({left,top,width,height,right:left+width,bottom:top+height});
test('More initially reserves adequate room; parent geometry never changes on child toggles',()=>{
 for(const width of [320,390,480,600,768,1024,1440]){
   const parentWidth=selectionMenuWidth(width);
   for(const naturalLeft of [12,Math.round(width/2-parentWidth/2),width-12-parentWidth]){
     const reserved=reserveSelectionMenuSpace({
       viewportWidth:width,width:parentWidth,left:naturalLeft
     });
     const menu=rect(reserved.left,400,parentWidth,225);
     const values=selectionSideGeometry({viewportWidth:width,viewportHeight:844,
       menu,panelHeight:520});
     assert.equal(values.parentLeft,reserved.left);
     assert.equal(values.parentWidth,parentWidth);
     assert.ok(values.panelLeft>=11&&values.panelLeft+values.panelWidth<=width-11,
       JSON.stringify({width,naturalLeft,reserved,values}));
     assert.ok(values.panelWidth>=130,'A readable side drawer must fit without touching More');
     if(values.side==='right')assert.ok(values.panelLeft>=menu.right+7);
     else assert.ok(values.panelLeft+values.panelWidth<=menu.left-7);
   }
 }
});
test('position preference: right first, then left, shift parent left only at initial open',()=>{
 const w=1440,parent=245;
 let initial=reserveSelectionMenuSpace({viewportWidth:w,width:parent,left:300});
 assert.equal(initial.left,300);
 assert.equal(selectionSideGeometry({viewportWidth:w,viewportHeight:900,
   menu:rect(initial.left,350,parent,225)}).side,'right');
 initial=reserveSelectionMenuSpace({viewportWidth:w,width:parent,left:1050});
 assert.equal(initial.left,1050);
 assert.equal(selectionSideGeometry({viewportWidth:w,viewportHeight:900,
   menu:rect(initial.left,350,parent,225)}).side,'left');
 initial=reserveSelectionMenuSpace({viewportWidth:600,width:245,left:210});
 assert.equal(initial.left,12);
 assert.equal(initial.shifted,true);
 assert.equal(selectionSideGeometry({viewportWidth:600,viewportHeight:844,
   menu:rect(initial.left,400,245,225)}).side,'right');
});
