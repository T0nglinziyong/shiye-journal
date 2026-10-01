import test from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync,strFromU8} from 'fflate';
import {project} from '../src/domain.js';
import {creativePageBrief} from '../src/creative-page-brief.js';
import {buildCreativeMessages} from '../src/creative-runner.js';
import {imagePrompt,generatePageImage} from '../src/ai-image-generation.js';
import {createOfflineHandoff} from '../src/offline-creation.js';

const asset={id:'asset-1',title:'浅绿便签',kind:'sticker',physicalWidthMM:40,physicalHeightMM:50,supply:{quantity:1},tags:['可写文字']};
const task=()=>{const p=project('日常记录');p.styles=['手作便签'];p.purposes=['日常记录'];p.intent='窗边的一杯茶';return p;};

test('art direction encourages connected text, materials and graphics without fill quotas',()=>{
  const brief=creativePageBrief({styles:['手作便签'],purposes:['日常记录'],theme:'窗边的一杯茶'});
  assert.match(brief,/连贯的多行正文/);
  assert.match(brief,/相关文字靠近对应图像/);
  assert.match(brief,/线条、荧光笔色带、手绘笔触或小图形/);
  assert.match(brief,/避免所有内容挤在一角/);
  assert.match(brief,/不为填满纸张而堆砌/);
  assert.doesNotMatch(brief,/至少\d|填充率.{0,4}\d|最低图层/);
  const visual=creativePageBrief({contentPolicy:'visual'});
  assert.match(visual,/不生成标题、正文或图注/);
  assert.doesNotMatch(visual,/连贯的多行正文/);
  const cover=creativePageBrief({styles:['极简留白'],purposes:['主题封面']});
  assert.match(cover,/可以保留显著留白/);
  assert.match(cover,/不强塞长正文/);
});

test('API editable, web editable and API/web image handoffs share the same composition intent',async()=>{
  const p=task();
  const api=buildCreativeMessages({draft:p.drafts[0],assets:[asset],aliases:{m1:asset.id},prompt:p.intent,styles:p.styles,pagePurposes:p.purposes,textMode:'rich'});
  assert.match(api[1].content[0].text,/连贯的多行正文/);
  assert.match(api[1].content[0].text,/避免所有内容挤在一角/);
  const web=await createOfflineHandoff({project:p,assets:[asset],aliases:{m1:asset.id},settings:{includeThumbnails:false,textMode:'rich'}});
  const webFiles=unzipSync(new Uint8Array(await web.blob.arrayBuffer()));
  assert.match(strFromU8(webFiles['CREATIVE_GUIDE.txt']),/连贯的多行正文/);
  assert.match(strFromU8(webFiles['CREATIVE_GUIDE.txt']),/避免所有内容挤在一角/);
  const image=imagePrompt({project:p,draft:p.drafts[0],assets:[asset],ids:[asset.id],theme:p.intent,includeImages:false,textMode:'rich'});
  assert.match(image,/自然换行的短段/);
  assert.match(image,/不绘制反斜杠、转义序列/);
  assert.match(image,/不把整段话或清单挤成一条横线/);
  assert.match(image,/不要把配色分析、素材介绍或排版说明印成正文/);
  assert.doesNotMatch(image,/充分展开连贯的多行正文/);
  const webImage=await createOfflineHandoff({project:p,assets:[asset],aliases:{m1:asset.id},settings:{deliveryMode:'image',includeThumbnails:false,textMode:'rich'}});
  const imageFiles=unzipSync(new Uint8Array(await webImage.blob.arrayBuffer()));
  assert.ok(strFromU8(imageFiles['START_HERE.txt']).includes(image));
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
