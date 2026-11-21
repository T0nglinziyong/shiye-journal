import test from 'node:test';
import assert from 'node:assert/strict';
import {tearRegionGeometry} from '../src/creation-tear.js';
import {geometryArea,geometryIntersection,geometryBounds} from '../src/craft-topology.js';
import {createCreationAgentSession} from '../src/creation-agent-session.js';
import {draft} from '../src/domain.js';
import {itemSourceGeometry} from '../src/craft-region-ops.js';
const path={points:[[0,.35],[.3,.42],[.65,.3],[1,.45]],unit:'ratio'};
const options={width:100,height:80,keep:'left',seed:42,depthMm:.6,periodMm:3};
test('a trajectory tears complementary deterministic pieces with physical roughness',()=>{
 const left=tearRegionGeometry(path,options),right=tearRegionGeometry(path,{...options,keep:'right'});
 assert.ok(left[0][0].length>100);assert.equal(geometryArea(geometryIntersection(left,right)),0);
 assert.ok(Math.abs(geometryArea(left)+geometryArea(right)-8000)<1e-6);
 assert.deepEqual(left,tearRegionGeometry(path,options));
 assert.notDeepEqual(left,tearRegionGeometry(path,{...options,seed:43}));
 assert.notDeepEqual(left,tearRegionGeometry(path,{...options,depthMm:0}));
 assert.deepEqual(geometryBounds(left),{x:0,y:24,width:100,height:56});
});
test('closed tears and reversed open trajectories conserve the same area',()=>{
 const shape={points:[[.2,.2],[.7,.15],[.8,.75],[.25,.7]],unit:'ratio',closed:true};
 const inside=tearRegionGeometry(shape,{...options,keep:'inside'}),outside=tearRegionGeometry(shape,{...options,keep:'outside'});
 assert.ok(Math.abs(geometryArea(inside)+geometryArea(outside)-8000)<1e-6);
 assert.equal(geometryArea(geometryIntersection(inside,outside)),0);
 const horizontal={points:[[0,40],[100,40]],unit:'mm'};
 assert.equal(geometryArea(tearRegionGeometry(horizontal,{...options,depthMm:0})),4000);
 assert.equal(geometryArea(tearRegionGeometry({...horizontal,points:[...horizontal.points].reverse()},{...options,depthMm:0})),4000);
});
test('invalid trajectories fail instead of silently changing the intended cut',()=>{
 for(const p of [
  {points:[[.1,.2],[.8,.7]],unit:'ratio'},
  {points:[[0,.4],[.8,.8],[.2,.8],[1,.4]],unit:'ratio'},
  {points:[[0,.4],[.5,.5],[.5,.5],[1,.4]],unit:'ratio'},
  {points:[[0,.4],[1.2,.7],[1,.4]],unit:'ratio'}
 ])assert.throws(()=>tearRegionGeometry(p,{...options,depthMm:0}));
 assert.throws(()=>tearRegionGeometry(path,{...options,depthMm:9}),/10%/);
 assert.throws(()=>tearRegionGeometry(path,{...options,periodMm:.1}),/0.5/);
 assert.throws(()=>tearRegionGeometry(path,{...options,keep:'inside'}),/开放/);
});
test('real command consumes the original, retains source and remainder, survives JSON and rejects locked edits',async()=>{
 const asset={id:'paper',title:'纸',kind:'paper',physicalWidthMM:100,physicalHeightMM:80,supply:{quantity:1}};
 const session=await createCreationAgentSession({draft:draft(),assets:[asset],aliases:{m1:'paper'}});
 let serial=0;
 const execute=async operations=>session.execute([{name:'creation_apply',arguments:{protocolVersion:2,transactionId:'tear-'+serial++,baseSceneRevision:session.revision,operations}}]);
 let response=await execute([{op:'material.add',id:'paper',asset:'m1',place:{reference:'page',at:[70,70],unit:'mm',rotationDeg:23}}]);
 assert.equal(response.results[0].ok,true,JSON.stringify(response));
 const operation={op:'material.tear',target:'paper',resultId:'torn',path,keep:'left',depthMm:.6,periodMm:3,seed:42};
 response=await execute([operation]);assert.equal(response.results[0].ok,true,JSON.stringify(response));
 const pieces=session.draft.items.filter(n=>n.assetID==='paper');
 assert.ok(pieces.some(n=>n.creativePieceID==='torn'));assert.ok(pieces.some(n=>n.isParked));
 const shapes=pieces.map(n=>itemSourceGeometry(n,asset));
 assert.ok(Math.abs(shapes.reduce((sum,g)=>sum+geometryArea(g),0)-8000)<1e-5);
 assert.equal(geometryArea(geometryIntersection(shapes[0],shapes[1])),0);
 assert.deepEqual(JSON.parse(JSON.stringify(shapes)),shapes);
 assert.equal(pieces.find(n=>n.creativePieceID==='torn').rotation,23);
 await execute([{op:'layer.update',target:'torn',locked:true}]);const before=session.revision;
 response=await execute([{...operation,target:'torn',resultId:'another'}]);assert.equal(response.results[0].ok,false);assert.equal(session.revision,before);
});
