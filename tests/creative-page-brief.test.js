import {tinyPNG} from './offline-canvas-test-support.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync,strFromU8} from 'fflate';
import {project} from '../src/domain.js';
import {creativePageBrief} from '../src/creative-page-brief.js';
import {buildCreativeMessages} from '../src/creative-runner.js';
import {imagePrompt,generatePageImage} from '../src/ai-image-generation.js';
import {createOfflineHandoff} from './v3-test-handoff.mjs';

const asset={id:'asset-1',title:'浅绿便签',kind:'sticker',physicalWidthMM:40,physicalHeightMM:50,supply:{quantity:1},tags:['可写文字']};
const task=()=>{const p=project('日常记录');p.styles=['手作便签'];p.purposes=['日常记录'];p.intent='窗边的一杯茶';return p;};

test('art direction encourages connected text, materials and graphics without fill quotas',()=>{
  const brief=creativePageBrief({textMode:'rich',styles:['手作便签'],purposes:['日常记录'],theme:'窗边的一杯茶'});
  assert.match(brief,/连贯的多行正文/);
  assert.match(brief,/文字贴近相关素材/);
  assert.match(brief,/手写、线条和荧光笔/);
  assert.match(brief,/先在真实可写纸面安排一处能读下去的记录/);
  assert.match(brief,/不要把全部新增文字排成同一种整齐的无衬线段落/);
  assert.match(brief,/无意空洞/);
  assert.match(brief,/避免为填满纸张而堆砌/);
  assert.doesNotMatch(brief,/至少\d|填充率.{0,4}\d|最低图层/);
  const visual=creativePageBrief({contentPolicy:'visual'});
  assert.match(visual,/不生成标题、正文或图注/);
  assert.doesNotMatch(visual,/连贯的多行正文/);
  assert.doesNotMatch(visual,/手作便签要保留/);
  const cover=creativePageBrief({styles:['极简留白'],purposes:['主题封面']});
  assert.match(cover,/有意留白/);
  assert.match(cover,/不强塞长正文/);
});

test('composition density choice changes the shared creative direction',()=>{
  const sparse=creativePageBrief({styles:['随材而定','疏朗留白']});
  const layered=creativePageBrief({styles:['随材而定','丰富层叠']});
  const automatic=creativePageBrief({styles:['随材而定','自动安排']});
  assert.match(sparse,/本次选择疏朗留白/);
  assert.match(layered,/本次选择丰富层叠/);
  assert.match(layered,/先比较两种主块比例或素材职责真正不同的试摆/);
  assert.match(layered,/首次试摆就从实际素材中找一个可延伸的形状、颜色或动作/);
  assert.match(layered,/预览后在另一处试不同尺度与作用的手绘回应/);
  assert.match(layered,/具体交界处相互回应/);
  assert.match(automatic,/默认疏密随素材而定/);
  assert.doesNotMatch(sparse,/本次选择丰富层叠/);
});

test('spread direction balances both pages and keeps the gutter readable without forbidding intentional bleed',()=>{
  const spread=creativePageBrief({pageMode:'spread',styles:['手作便签'],purposes:['日常记录']});
  assert.match(spread,/两张相互呼应的独立页面/);
  assert.match(spread,/各自有清楚焦点/);
  assert.match(spread,/不让标题、正文、主体素材无意跨页/);
  assert.match(spread,/允许疏密不同/);
  assert.match(spread,/有意跨页须仍完整可读/);
  assert.doesNotMatch(spread,/填充率.{0,4}\d|至少\d|所有对象不得跨页/);
  const single=creativePageBrief({pageMode:'single'});
  assert.doesNotMatch(single,/装订中缝/);
});

test('API editable, web editable and API/web image handoffs share the same composition intent',async()=>{
  const p=task();
  const api=buildCreativeMessages({draft:p.drafts[0],assets:[asset],aliases:{m1:asset.id},prompt:p.intent,styles:p.styles,pagePurposes:p.purposes,textMode:'rich'});
  assert.match(api[1].content[0].text,/连贯的多行正文/);
  assert.match(api[1].content[0].text,/无意空洞/);
  assert.match(api[1].content[0].text,/纸片错层/);
  assert.match(api[1].content[0].text,/图文职责/);
  const web=await createOfflineHandoff({project:p,assets:[asset],aliases:{m1:asset.id},settings:{includeThumbnails:false,textMode:'rich'}});
  const webFiles=unzipSync(new Uint8Array(await web.blob.arrayBuffer()));
  assert.match(strFromU8(webFiles['design/GUIDE.md']),/连贯的多行正文/);
  assert.match(strFromU8(webFiles['design/GUIDE.md']),/无意空洞/);
  assert.match(strFromU8(webFiles['design/GUIDE.md']),/纸片错层/);
  assert.match(strFromU8(webFiles['design/GUIDE.md']),/主图与旁注、错层图文/);
  assert.match(api[0].content,/主图与旁注、错层图文/);
  assert.ok(JSON.parse(strFromU8(webFiles['TASK.json'])).materials[0].journalRoles.includes('writing'));
  assert.equal(webFiles['task/knowledge.json'],undefined);
  const image=imagePrompt({project:p,draft:p.drafts[0],assets:[asset],ids:[asset.id],theme:p.intent,includeImages:false,textMode:'rich'});
  assert.match(image,/自然换行的短段/);
  assert.match(image,/不绘制反斜杠、转义序列/);
  assert.match(image,/不把整段话或清单挤成一条横线/);
  assert.match(image,/不要把配色分析、素材介绍或排版说明印成正文/);
  assert.match(image,/纸片错层/);
  assert.match(image,/图文职责/);
  assert.doesNotMatch(image,/充分展开连贯的多行正文/);
  const webImage=await createOfflineHandoff({project:p,assets:[asset],aliases:{m1:asset.id},settings:{creationMode:'draw',includeThumbnails:true,textMode:'rich'},previews:[{alias:'m1',bytes:tinyPNG}]});
  const imageFiles=unzipSync(new Uint8Array(await webImage.blob.arrayBuffer()));
  assert.ok(strFromU8(imageFiles['design/IMAGE_MODE.md']).includes(imagePrompt({project:p,draft:p.drafts[0],assets:[asset],ids:[asset.id],theme:p.intent,includeImages:true,textMode:'rich'})));
  assert.equal(imageFiles['task/knowledge.json'],undefined);
});

test('API and web task honor the same optional structure guidance',async()=>{
  const p=task(),options={draft:p.drafts[0],assets:[asset],aliases:{m1:asset.id},
    prompt:p.intent,styles:p.styles,pagePurposes:p.purposes,includeStructureReference:false};
  const api=buildCreativeMessages(options);
  const web=await createOfflineHandoff({project:p,assets:[asset],aliases:{m1:asset.id},
    settings:{includeThumbnails:false,includeStructureReference:false}});
  const files=unzipSync(new Uint8Array(await web.blob.arrayBuffer()));
  assert.doesNotMatch(api[0].content,/主图与旁注、错层图文/);
  assert.doesNotMatch(strFromU8(files['design/GUIDE.md']),/主图与旁注、错层图文/);
});

test('both editable and image transports receive the same spread-specific page balance direction',async()=>{
  const p=project('双页茶记',{mode:'spread',ratio:'a5'});p.styles=['手作便签'];p.purposes=['日常记录'];
  const draft=p.drafts[0],marker=/不让标题、正文、主体素材无意跨页/;
  const api=buildCreativeMessages({draft,assets:[asset],aliases:{m1:asset.id},styles:p.styles,pagePurposes:p.purposes});
  assert.match(api[1].content[0].text,marker);
  const web=await createOfflineHandoff({project:p,assets:[asset],aliases:{m1:asset.id},settings:{includeThumbnails:false}});
  const webFiles=unzipSync(new Uint8Array(await web.blob.arrayBuffer()));
  assert.match(strFromU8(webFiles['design/GUIDE.md']),marker);
  const image=imagePrompt({project:p,draft,assets:[asset],ids:[asset.id],includeImages:false});
  assert.match(image,marker);
  const webImage=await createOfflineHandoff({project:p,assets:[asset],aliases:{m1:asset.id},settings:{creationMode:'draw',includeThumbnails:true},previews:[{alias:'m1',bytes:tinyPNG}]});
  const imageFiles=unzipSync(new Uint8Array(await webImage.blob.arrayBuffer()));
  assert.match(strFromU8(imageFiles['design/IMAGE_MODE.md']),marker);
});

test('image API forwards no-text setting and does not quietly request copy',async()=>{
  const p=task(),png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/5uoAAAAASUVORK5CYII=','base64');
  let sent='';
  const request=async (_url,init)=>{sent=init.body.get('prompt');return {ok:true,json:async()=>({data:[{b64_json:png.toString('base64')}]})};};
  const result=await generatePageImage({settings:{keys:{openai:'test-only'},includeThumbnails:false,textMode:'none'},project:p,draft:p.drafts[0],assets:[asset],ids:[asset.id],createImage:async()=>null,request});
  assert.equal(result.type,'image/png');
  assert.match(sent,/不生成标题、正文或图注/);
  assert.doesNotMatch(sent,/最终图像中的印刷文字/);
});

test('image API sends only selected material previews',async()=>{
  const p=task(),png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/5uoAAAAASUVORK5CYII=','base64');
  let names=[],sent='',endpoint='';
  const request=async (url,init)=>{endpoint=url;names=init.body.getAll('image[]').map(file=>file.name);sent=init.body.get('prompt');return {ok:true,json:async()=>({data:[{b64_json:png.toString('base64')}]})};};
  await generatePageImage({settings:{keys:{openai:'test-only'},includeThumbnails:true},project:p,draft:p.drafts[0],assets:[asset],ids:[asset.id],createImage:async()=>`data:image/png;base64,${png.toString('base64')}`,request:async(url,init)=>url.startsWith('data:')?{blob:async()=>new Blob([png],{type:'image/png'})}:request(url,init)});
  assert.match(endpoint,/\/images\/edits$/);
  assert.deepEqual(names,['material-1.png']);
  assert.doesNotMatch(sent,/抽象模板与真实案例/);
});
