import test from 'node:test';
import assert from 'node:assert/strict';
import {inkBackingSize,configureInkBacking} from '../src/ink-raster-scale.js';
import {smoothInkSVG,traceSmoothInk} from '../src/ink-path-geometry.js';
import {createActionStore} from '../src/ui-action-store.js';
import {registerMatchingActions,createMatchingController} from '../src/page-controllers/matching-controller.js';

test('retina live pen uses actual visible pixel area and respects memory cap',()=>{
 const low=inkBackingSize({logicalWidth:700,logicalHeight:1000,
   cssWidth:500,cssHeight:715,pixelRatio:1});
 const retina=inkBackingSize({logicalWidth:700,logicalHeight:1000,
   cssWidth:500,cssHeight:715,pixelRatio:3});
 assert.ok(retina.width>low.width&&retina.height>low.height);
 assert.ok(retina.width*retina.height<=9_000_000);
 const giant=inkBackingSize({logicalWidth:5500,logicalHeight:5500,
   cssWidth:5500,cssHeight:5500,pixelRatio:3});
 assert.ok(giant.width*giant.height<=9_100_000);
});
test('live canvas changes resolution but never mutates Scene coordinates',()=>{
 let width=100,height=100;const fakeCtx={setTransform(...values){this.transform=values;},
   imageSmoothingEnabled:false};
 const canvas={get width(){return width},set width(v){width=v},
   get height(){return height},set height(v){height=v},
   getBoundingClientRect:()=>({width:600,height:800}),
   getContext:()=>fakeCtx};
 const first=configureInkBacking(canvas,800,1000,{pixelRatio:2});
 assert.ok(first.changed);
 assert.equal(canvas.width,1200);
 assert.equal(canvas.height,1600);
 assert.deepEqual(fakeCtx.transform,[1.5,0,0,1.6,0,0]);
 assert.equal(configureInkBacking(canvas,800,1000,{pixelRatio:2}).changed,false);
});
test('SVG and live Canvas share one quadratic centreline with real endpoints',()=>{
 const pts=[{x:0,y:0},{x:10,y:20},{x:25,y:40},{x:40,y:50}];
 const path=smoothInkSVG(pts,v=>v);
 assert.match(path,/^M0 0 Q10 20 17\.5 30 Q25 40 32\.5 45 L40 50$/);
 const calls=[],ctx={moveTo:(...args)=>calls.push(['move',...args]),
   lineTo:(...args)=>calls.push(['line',...args]),
   quadraticCurveTo:(...args)=>calls.push(['quad',...args])};
 traceSmoothInk(ctx,pts);
 assert.equal(calls[0][0],'move');
 assert.equal(calls.filter(row=>row[0]==='quad').length,2);
 assert.deepEqual(calls.at(-1),['line',40,50]);
 assert.deepEqual(pts[2],{x:25,y:40});
});
test('matching commands update scoped state without DOM or duplicated subscribers',async()=>{
 const state={recommendFilter:'全部',excludedAssetIDs:[],
   coreIDs:[],basket:['a'],matchCore:'a'},store=createActionStore(state);
 registerMatchingActions(store,{addMatchingFromRecommendation:(state,id)=>state.basket.push(id)});
 const notices=[],regions=[],saved=[];
 const controller=createMatchingController({renderHTML:()=>'',actions:store,
   updateMatchingRegions:items=>regions.push(items),
   queueDefaults:()=>saved.push('yes')});
 const cleanups=[];
 controller.mount({use(fn){cleanups.push(fn)}});
 store.subscribe(event=>notices.push(event));
 await store.dispatch({type:'matching/filter',payload:{value:'已收藏'}});
 await store.dispatch({type:'matching/exclude',payload:{id:'b'}});
 await store.dispatch({type:'matching/priority',payload:{id:'a'}});
 await store.dispatch({type:'matching/basket',payload:{id:'b'}});
 assert.equal(state.recommendFilter,'已收藏');
 assert.deepEqual(state.excludedAssetIDs,['b']);
 assert.deepEqual(state.coreIDs,[]);
 assert.deepEqual(state.basket,['a','b']);
 assert.equal(notices.length,4);
 assert.equal(regions.length,4);
 assert.equal(saved.length,1);
 assert.ok(regions[0].includes('.match-chips'));
 cleanups.forEach(fn=>fn());
 await store.dispatch({type:'matching/include',payload:{id:'b'}});
 assert.equal(regions.length,4);
});
