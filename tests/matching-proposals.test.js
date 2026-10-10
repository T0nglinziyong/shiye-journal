import test from 'node:test';
import assert from 'node:assert/strict';
import {generateMaterialProposals,matchingProposalContextKey,materialSetScore} from '../src/matching-proposals.js';

const material=(n,kind='paper',options={})=>({
 id:'a'+n,title:n===8?'猫咪饼干贴纸':'素材 '+n,kind,
 role:kind==='sticker'?'focal':'support',
 reviewStatus:'ready',physicalWidthMM:kind==='paper'?90:30,
 physicalHeightMM:kind==='paper'?80:28,tags:n<8?['灰绿','文具']:['日常'],
 semanticColorNames:n<13?['绿色']:['蓝色'],
 supply:{quantity:1},...options
});
const assets=[
 ...Array.from({length:8},(_,n)=>material(n)),
 ...Array.from({length:4},(_,n)=>material(n+8,'sticker')),
 ...[material(12,'tape'),material(13,'tape')],
 ...[material(14,'photo'),material(15,'photo')]
];
const baseline={
 assets,basket:assets.map(a=>a.id),coreIDs:['a8'],
 recommendations:assets.map(asset=>({asset})),
 styles:['韩系清新'],purposes:['日常记录'],pageRatio:'a4',pageMode:'single'
};

test('local matching offers four different material sets with explicitly required focal',()=>{
 const result=generateMaterialProposals(baseline);
 assert.equal(result.length,4);
 assert.ok(result.every(p=>p.selectedAssetIDs.includes('a8')));
 assert.ok(result.every(p=>p.selectedAssetIDs.length<assets.length));
 assert.equal(new Set(result.map(p=>p.layout)).size,4);
 assert.ok(result.every(p=>p.requiredAssetIDs.length===1&&p.requiredAssetIDs[0]==='a8'));
});

test('every excluded, unavailable and project-internal item is kept out',()=>{
 const changed=assets.map(a=>a.id==='a7'?{...a,isProjectInternal:true}:a.id==='a12'?{...a,supply:{quantity:0}}:a);
 const props=generateMaterialProposals({...baseline,assets:changed,excluded:['a13']});
 for(const p of props){
  assert.ok(!p.selectedAssetIDs.includes('a7'));
  assert.ok(!p.selectedAssetIDs.includes('a12'));
  assert.ok(!p.selectedAssetIDs.includes('a13'));
  assert.ok(p.selectedAssetIDs.includes('a8'));
 }
});

test('already completed batch changes new suggestions rather than repeating exact same sets',()=>{
 const first=generateMaterialProposals(baseline);
 const more=generateMaterialProposals({...baseline,history:first,batch:1});
 assert.ok(more.length>0);
 const signature=p=>p.layout+'/'+p.selectedAssetIDs.slice().sort().join(',');
 const before=new Set(first.map(signature));
 assert.ok(more.every(row=>!before.has(signature(row))));
});

test('multiple oversized papers incur a physical layering penalty, not a hard packing ban',()=>{
 const small=[material(20,'sticker'),material(21,'paper',{physicalWidthMM:45,physicalHeightMM:45})];
 const giant=[material(20,'sticker'),material(21,'paper',{physicalWidthMM:200,physicalHeightMM:270}),
   material(22,'paper',{physicalWidthMM:200,physicalHeightMM:270})];
 assert.ok(materialSetScore(small)>materialSetScore(giant));
 assert.ok(Number.isFinite(materialSetScore(giant)),
  'Overlap is permitted: size controls preference, not a hard total-area rejection');
});

test('recommendation does not require cloud, API keys or a material-use quota',()=>{
 assert.ok(generateMaterialProposals({...baseline,basket:['a8'],coreIDs:[],count:4}).length);
 assert.equal(generateMaterialProposals({...baseline,basket:['a8'],coreIDs:['a8'],excluded:['a8']}).length,0);
 const key=matchingProposalContextKey({...baseline,excluded:[]});
 assert.notEqual(key,matchingProposalContextKey({...baseline,excluded:['a1']}));
});
