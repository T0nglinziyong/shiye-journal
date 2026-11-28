import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {loadCreationSkills} from '../creative-agent/runtime/skills.mjs';
import {createCreativeHarness,initialHarnessState} from '../creative-agent/runtime/agent.mjs';
import {createCreationDocument} from '../src/creation-document.js';
import {draft} from '../src/domain.js';

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=','base64');
const hash=b=>createHash('sha256').update(b).digest('hex');
async function fixture(t){
  const root=await mkdtemp(join(tmpdir(),'shiye-skill-images-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const skills=join(root,'skills'),images=join(root,'images');await mkdir(skills);await mkdir(images);
  const record={id:'sample',file:'sample.png',sha256:hash(png),reviewed:true,caption:'构图示意',title:'测试教程',author:'测试作者',sourceURL:'https://example.com/tutorial',observation:'测试合成图'};
  for(const name of ['journal-composition','optional-skill']){
    await mkdir(join(skills,name));
    await writeFile(join(skills,name,'SKILL.md'),`---\nname: ${name}\ndescription: 测试方法\n---\n# 测试\n仅用于合成测试。`);
    await writeFile(join(skills,name,'illustrations.json'),JSON.stringify({version:1,illustrations:[record]}));
  }
  await writeFile(join(images,'sample.png'),png);
  return {root,skills,images,record};
}

test('text-only installations report unavailable illustrations; installed bytes are verified and excluded from catalog/text',async t=>{
  const f=await fixture(t),textOnly=await loadCreationSkills(f.skills,{illustrationRoot:null});
  assert.equal(textOnly.read('optional-skill').illustrations[0].available,false);assert.deepEqual(textOnly.imageParts('optional-skill'),[]);
  const full=await loadCreationSkills(f.skills,{illustrationRoot:f.images});
  assert.equal(full.catalog()[0].illustrationCount,1);assert.equal(full.imageParts('optional-skill')[1].image_url.url,'data:image/png;base64,'+png.toString('base64'));
  assert.deepEqual(full.read('optional-skill').illustrations,[{id:'sample',caption:'构图示意',available:true}]);
  assert.doesNotMatch(full.imageParts('optional-skill')[0].text,/sha256|sourceURL|observation/);
  assert.doesNotMatch(JSON.stringify(full.catalog())+JSON.stringify(full.read('optional-skill')),/data:image/);
  assert.notEqual(full.read('optional-skill').version,textOnly.read('optional-skill').version);
  assert.throws(()=>full.imageParts('../secret'),/未知/);
  await writeFile(join(f.images,'sample.png'),Buffer.concat([png,Buffer.from('tampered')]));
  await assert.rejects(loadCreationSkills(f.skills,{illustrationRoot:f.images}),/校验失败/);
});

test('illustration paths cannot escape the configured pack through metadata or symlinks',async t=>{
  const f=await fixture(t),path=join(f.skills,'optional-skill','illustrations.json');
  await writeFile(path,JSON.stringify({version:1,illustrations:[{...f.record,file:'../outside.png'}]}));
  await assert.rejects(loadCreationSkills(f.skills,{illustrationRoot:f.images}),/元数据无效/);
  await writeFile(path,JSON.stringify({version:1,illustrations:[f.record]}));
  await writeFile(join(f.root,'outside.png'),png);await rm(join(f.images,'sample.png'));
  await symlink(join(f.root,'outside.png'),join(f.images,'sample.png'));
  await assert.rejects(loadCreationSkills(f.skills,{illustrationRoot:f.images}),/路径越界/);
});

test('unreviewed and non-PNG illustrations never enter model messages',async t=>{
  const f=await fixture(t),path=join(f.skills,'optional-skill','illustrations.json');
  await writeFile(path,JSON.stringify({version:1,illustrations:[{...f.record,reviewed:false}]}));
  await assert.rejects(loadCreationSkills(f.skills,{illustrationRoot:f.images}),/元数据无效/);
  const invalid=Buffer.from('<svg>not a PNG</svg>');await writeFile(join(f.images,'sample.png'),invalid);
  for(const name of ['journal-composition','optional-skill'])await writeFile(join(f.skills,name,'illustrations.json'),JSON.stringify({version:1,illustrations:[{...f.record,sha256:hash(invalid)}]}));
  await assert.rejects(loadCreationSkills(f.skills,{illustrationRoot:f.images}),/PNG/);
});

test('requested skills retain one attributed reference without duplicating it on repeated reads',async t=>{
  const f=await fixture(t),skills=await loadCreationSkills(f.skills,{illustrationRoot:f.images});
  const document=await createCreationDocument({draft:draft(),assets:[]});
  const state=initialHarnessState({document,skills,brief:{title:'测试'}});let turns=0;
  const count=messages=>messages.flatMap(m=>Array.isArray(m.content)?m.content:[]).filter(p=>p.type==='image_url').length;
  assert.equal(count(state.messages),0);
  const harness=createCreativeHarness({skills,model:async({messages})=>{
    turns++;
    assert.equal(count(messages),turns>=2?1:0);
    if(turns===2)assert.match(JSON.stringify(messages),/教程示意（仅供方法参考/);
    if(turns===3){const receipt=messages.findLast(message=>message.role==='tool');assert.equal(JSON.parse(receipt.content).data.alreadyLoaded,true);throw Error('image delivery verified');}
    return {message:{role:'assistant',content:null,tool_calls:[{id:'read-'+turns,type:'function',function:{name:'knowledge',arguments:JSON.stringify({action:'skill',name:'optional-skill'})}}]}};
  }});
  await assert.rejects(harness.run({id:'images',state}),/image delivery verified/);assert.equal(turns,3);
});

test('method details load only their matching image',async()=>{
  const skills=await loadCreationSkills(undefined,{illustrationRoot:null});
  const detail=skills.read('paper-layering',{level:'detail',methodId:'paper-window'});
  assert.equal(detail.methods[0].id,'paper-window');
  assert.deepEqual(await skills.methodImageParts('paper-layering',{level:'detail',methodId:'paper-window'}),[]);
  assert.equal((await skills.methodImageParts('photo-story',{level:'detail',methodId:'photo-film'})).length,2);
});
test('paged lettering methods offer the shared font catalog only once',async()=>{
  const skills=await loadCreationSkills(undefined,{illustrationRoot:null});
  const page=skills.read('journal-lettering',{level:'methods',page:0});
  assert.equal(page.methods.length,1);
  assert.ok(page.suggestedFonts.some(font=>font.family==='FontQu Smile'));
  assert.ok(page.methods.every(method=>method.readWith.level==='detail'&&!('tool' in method)));
  assert.deepEqual(await skills.methodImageParts('journal-lettering',{level:'methods',page:0}),[]);
  const detail=skills.read('journal-lettering',{level:'detail',methodId:'title-art',variant:'phrases'});
  assert.ok(detail.methods[0].parameters.captionFontFamily.suggestedFonts.some(font=>font.family==='Xiaolai'));
});
