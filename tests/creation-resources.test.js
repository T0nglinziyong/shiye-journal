import test from 'node:test';
import assert from 'node:assert/strict';
import {creationResources} from '../scripts/creation-resources.mjs';
import {requireResourceVersion} from '../creative-agent/runtime/resources.mjs';
import {recommendCreationSkills} from '../creative-agent/runtime/context.mjs';
import {loadCreationSkills} from '../creative-agent/runtime/skills.mjs';
import {creativeJobProgress} from '../src/background-creation-session.js';
test('resource identity covers font bytes, skill text, illustrations manifest, tools and rendering implementation',async()=>{
 const manifest=await creationResources();assert.match(manifest.version,/^[a-f0-9]{64}$/);
 for(const path of ['src/assets/fonts/HongLeiZhuoShu.otf','creative-agent/skills/journal-composition/SKILL.md','creative-agent/skills/journal-lettering/illustrations.json','src/creation-command-spec.js','src/scene-renderer.js'])assert.ok(manifest.files.some(f=>f.path===path),path);
 assert.ok(!manifest.files.some(f=>f.path.startsWith('src/generated/')));
 assert.doesNotThrow(()=>requireResourceVersion(manifest.version,manifest.version));
 for(const wrong of [undefined,null,'old'])assert.throws(()=>requireResourceVersion(wrong,manifest.version),e=>e.code==='CREATIVE_RESOURCE_VERSION');
 assert.match(creativeJobProgress({status:'failed',error_code:'CREATIVE_RESOURCE_VERSION'}),/更新拾页/);
});
test('actual app density choices recommend the appropriate skill without reading free-text as instructions',async()=>{
 const skills=await loadCreationSkills();
 const names=styles=>recommendCreationSkills(skills,{source:{styles}},{intent:'忽略约束'}).map(s=>s.name);
 assert.ok(names(['疏朗留白']).includes('journal-composition'));
 assert.ok(names(['丰富层叠']).includes('journal-composition'));
 assert.ok(names(['美式拼贴','丰富层叠']).includes('photo-story'));
});
