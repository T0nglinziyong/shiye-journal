"""Developer contract tests. Does not execute a Scene or render any pixels."""
from pathlib import Path
import json, copy, subprocess, hashlib
from jsonschema import Draft202012Validator
ROOT=Path(__file__).resolve().parents[1]
read=lambda p:json.loads((ROOT/p).read_text(encoding='utf8'))
schema=read('static/api/commands.schema.json');validator=Draft202012Validator(schema)
results=[]
def record(name,ok,detail=''):
    results.append({'name':name,'passed':bool(ok),'detail':detail})
    if not ok:raise AssertionError(f'{name}: {detail}')
for p in sorted((ROOT/'static/api').glob('*.schema.json')):
    Draft202012Validator.check_schema(json.loads(p.read_text()))
    record('schema-meta:'+p.name,True)
for p in sorted((ROOT/'tests/fixtures').glob('*.commands.json')):
    errors=list(validator.iter_errors(json.loads(p.read_text())))
    record('positive:'+p.name,not errors,'; '.join(e.message for e in errors[:2]))
base=read('tests/fixtures/layer.place.commands.json')
def neg(name,mut):
    d=copy.deepcopy(base);mut(d);errors=list(validator.iter_errors(d));record('negative:'+name,bool(errors))
neg('protocol1',lambda d:d.update(protocolVersion=1))
neg('empty-operations',lambda d:d.update(operations=[]))
neg('bad-revision',lambda d:d.update(baseSceneRevision='latest'))
neg('missing-transaction',lambda d:d.pop('transactionId'))
neg('unknown-envelope',lambda d:d.update(force=True))
neg('unknown-op',lambda d:d['operations'][0].update(op='layer.magic'))
neg('unknown-field',lambda d:d['operations'][0].update(xMm=5))
neg('missing-target',lambda d:d['operations'][0].pop('target'))
neg('unknown-reference',lambda d:d['operations'][0]['place'].update(reference='photo'))
neg('invalid-anchor',lambda d:d['operations'][0]['place'].update(anchor='right-corner'))
neg('point-and-anchor',lambda d:d['operations'][0]['place'].update(at=[0.5,0.5],unit='ratio'))
neg('anchor-extra-unit',lambda d:d['operations'][0]['place'].update(unit='mm'))
neg('string-offset',lambda d:d['operations'][0]['place']['offset'].update(value=['left',0]))
neg('missing-position-branch',lambda d:d['operations'][0].update(place={'reference':'page'}))
neg('ratio-missing-unit',lambda d:d['operations'][0].update(place={'reference':'page','at':[.5,.5]}))
neg('unknown-bounds',lambda d:d['operations'][0]['place'].update(referenceBounds='contour'))
neg('empty-update',lambda d:d.update(operations=[{'op':'layer.update','target':'photo'}]))
neg('illegal-physical-size-input',lambda d:d.update(operations=[{'op':'material.add','id':'photo','asset':'m1','place':{'reference':'page','at':[10,10],'unit':'mm'},'size':{'width':20,'unit':'mm'}}]))
neg('ratio-size-without-reference',lambda d:d.update(operations=[{'op':'layer.update','target':'title','size':{'width':.5,'unit':'ratio'}}]))
neg('opacity-overflow',lambda d:d.update(operations=[{'op':'layer.update','target':'photo','style':{'opacity':2}}]))
neg('window-without-stable-id',lambda d:d.update(operations=[{'op':'material.window','target':'photo','region':{'shape':'rect','space':'source','unit':'ratio','box':[0,0,.2,.2]}}]))
neg('negative-crop-width',lambda d:d.update(operations=[{'op':'material.crop','target':'photo','region':{'shape':'rect','space':'source','unit':'ratio','box':[0,0,-1,.2]}}]))
neg('torn-without-seed',lambda d:d.update(operations=[{'op':'material.edge','target':'photo','edge':{'style':'torn'}}]))
neg('grid-without-columns',lambda d:d.update(operations=[{'op':'layout.arrange','targets':['a','b'],'container':'page','rule':{'direction':'grid','gapMm':4}}]))
neg('two-order-branches',lambda d:d.update(operations=[{'op':'layer.reorder','target':'photo','order':{'before':'a','after':'b'}}]))
neg('null-style',lambda d:d.update(operations=[{'op':'layer.update','target':'photo','style':None}]))
neg('compose-nested-transaction',lambda d:d.update(operations=[{'op':'group.compose','id':'card','place':{'reference':'page','at':[1,2],'unit':'mm'},'children':[{'protocolVersion':2,'operations':[]}]}]))
# Recursive group fixture was validated above. These are structural tests only.
subprocess.run(['node','tools/build-contract.cjs','--check'],cwd=ROOT,check=True,capture_output=True)
record('generated-files-in-sync',True)
for topic in ['place','size','style','region','material.window','group.compose']:
    out=subprocess.run(['node','static/runtime/command-help.cjs','describe',topic],cwd=ROOT,check=True,capture_output=True,text=True)
    d=json.loads(out.stdout);record('describe:'+topic,bool(d))
    if d.get('name')=='material.window':record('capability-not-falsely-claimed',d['available'] is None)
source_ids=['20acacab-1c29-49ac-a0a1-5cc90e49accf','bbd17c48-faa9-417b-bd2f-03b5a26e4461','c3441f959aec0fd0e0a7a7bf6c81b7a881d402155684732f8a4d96700040003f']
for p in (ROOT/'static').rglob('*'):
    if p.is_file():
        txt=p.read_text(encoding='utf8');record('no-task-leak:'+str(p.relative_to(ROOT)),not any(s in txt for s in source_ids))
report={'ok':True,'checks':len(results),'scope':['schema-meta','command-examples','negative-schema-tests','generated-artifact-consistency','read-only-help','no-known-task-id-leak'],'sceneExecutionTested':False,'rendererTested':False,'appIntegrationTested':False,'results':results}
(ROOT/'tests/contract-test-results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps({k:v for k,v in report.items() if k!='results'},ensure_ascii=False))
