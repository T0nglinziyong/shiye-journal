import test from 'node:test';
import assert from 'node:assert/strict';
import {presetJournalTemplates} from '../src/journal-template-catalog.js';
import {journalSourceAudit} from '../src/journal-source-audit.js';
import {journalTemplatePanel,validateJournalPanel} from '../src/journal-source-panels.js';
import {journalPanelPixels} from '../src/journal-preset-images.js';

const templates=presetJournalTemplates();
const byId=new Map(templates.map(item=>[item.id,item]));

test('each multi-panel source is separated into its own centered template/case reference',()=>{
  const examples={
    1:['centered-writing-sheet','four-corner-notes'],
    2:['food-main-and-details','food-main-and-details-variant'],
    4:['editorial-main-column','editorial-main-column-b','editorial-main-column-c'],
    13:['editorial-offset-cards','editorial-offset-cards-b','editorial-offset-cards-c'],
    23:['editorial-paper-blocks','editorial-paper-blocks-b','editorial-paper-blocks-c'],
    29:['dark-five-stops','dark-s-spine'],
    30:['quiet-diagonal-photo-groups','quiet-offset-photo-groups'],
    49:['editorial-asymmetric-blocks-b','editorial-asymmetric-blocks'],
    51:['food-green-blocks','food-brown-blocks'],
    52:['editorial-triptych-variants','editorial-triptych-variants-b','editorial-triptych-variants-c','editorial-triptych-variants-g','editorial-triptych-variants-h','editorial-triptych-variants-i'],
    53:['editorial-triptych-variants-d','editorial-triptych-variants-j'],
    54:['editorial-triptych-variants-e','editorial-triptych-variants-f']
  };
  for(const [source,ids] of Object.entries(examples)){
    const regions=new Set();
    for(const id of ids){
      const item=byId.get(id);assert.ok(item,id);
      for(const kind of ['template','case']){
        const panel=journalTemplatePanel(item,kind);
        assert.equal(panel.number,Number(source),`${id} ${kind}`);
        validateJournalPanel(panel);
        assert.ok(panel.rect[2]<.6&&panel.rect[3]<.6,`${id} ${kind} should not show whole tutorial`);
        const key=kind+JSON.stringify(panel.rect);assert.ok(!regions.has(key),`${id} ${kind} duplicated a panel`);regions.add(key);
      }
    }
  }
});

test('all referenced template and case panels stay inside their source image',()=>{
  for(const item of templates){
    for(const kind of ['template','case']){
      const panel=journalTemplatePanel(item,kind);
      if(!panel)continue;
      validateJournalPanel(panel);
      const pixels=journalPanelPixels(panel,1440,1920);
      assert.ok(pixels.width>0&&pixels.height>0&&pixels.x>=0&&pixels.y>=0);
      assert.ok(pixels.x+pixels.width<=1440&&pixels.y+pixels.height<=1920,item.id);
      if(journalSourceAudit[panel.number-1].kind==='mixed')assert.notDeepEqual(panel.rect,[0,0,1,1],item.id+' accidentally includes multiple views');
    }
  }
  assert.throws(()=>validateJournalPanel({number:30,rect:[.8,.8,.4,.4]}),/区域无效/);
});

test('paired panels select the matching upper and lower row, not the whole photo',()=>{
  const upper=byId.get('quiet-diagonal-photo-groups');
  const lower=byId.get('quiet-offset-photo-groups');
  assert.ok(journalTemplatePanel(upper,'template').rect[1]<.5);
  assert.ok(journalTemplatePanel(lower,'template').rect[1]>.5);
  assert.ok(journalTemplatePanel(upper,'case').rect[1]<.5);
  assert.ok(journalTemplatePanel(lower,'case').rect[1]>.5);
});
