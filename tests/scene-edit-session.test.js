import test from 'node:test';
import assert from 'node:assert/strict';
import {project} from '../src/domain.js';
import {beginSceneEditSession,acceptSceneEditStep,stepSceneEditSession,
  sceneEditSessionChanged} from '../src/scene-edit-session.js';

test('cut session stages edits, supports step undo/redo, and leaves saved draft untouched',()=>{
  const saved=project('剪刀').drafts[0],initial=structuredClone(saved);
  const session=beginSceneEditSession(saved,{projectID:'work',saveRevision:3,selectedID:'a'});
  const next=structuredClone(session.working);
  next.layers.push({id:'shape',type:'shape',kind:'rectangle',x:10,y:10,width:20,
    height:20,fill:'#ffffff',stroke:'#000000',zIndex:1});
  acceptSceneEditStep(session,next,'shape');
  assert.equal(sceneEditSessionChanged(session),true);
  assert.deepEqual(saved,initial);
  assert.equal(stepSceneEditSession(session,'undo'),'a');
  assert.equal(sceneEditSessionChanged(session),false);
  assert.equal(stepSceneEditSession(session,'redo'),'shape');
  assert.equal(session.working.layers.length,1);
});
