import base64, hashlib, json, lzma, os, pathlib, shutil, subprocess
branch='refactor/shared-editor-kernel-20261022'
assert os.environ['GITHUB_REF_NAME']==branch
subprocess.run(['git','merge-base','--is-ancestor','af738ce9f1195f92f2e22d5a7d364fdd895d3ae1','HEAD'],check=True)
payload=base64.b64decode(''.join(pathlib.Path(f'.editor-transfer/chunk-{i}.b64').read_text() for i in range(4)),validate=True)
assert hashlib.sha256(payload).hexdigest()=='b9f0dbb606c7c9a92f8a82971a326a8da3e56a0a61e71207f8c4ae6ab25d42e6'
rows=json.loads(lzma.decompress(payload));writes=[]
for row in rows:
 p=pathlib.Path(row['path']);assert not p.is_absolute() and '..' not in p.parts
 old='' if row['status']=='A' else p.read_text()
 if row['status']=='A': assert not p.exists()
 assert hashlib.sha256(old.encode()).hexdigest()==row['before'],str(p)
 value=old
 for a,b,text in reversed(row['edits']):
  assert 0<=a<=b<=len(old)
  value=value[:a]+text+value[b:]
 assert hashlib.sha256(value.encode()).hexdigest()==row['after'],str(p)
 writes.append((p,row['status'],value))
for p,status,value in writes:
 if status=='D':p.unlink()
 else:p.parent.mkdir(parents=True,exist_ok=True);p.write_text(value)
shutil.rmtree('.editor-transfer')
pathlib.Path('.github/workflows/editor-materialize.yml').unlink()
subprocess.run(['git','add','-A'],check=True)
tree=subprocess.check_output(['git','write-tree'],text=True).strip()
assert tree=='adb8e4810624279e93486719782da2b3511dc433',tree
subprocess.run(['git','-c','user.name=github-actions[bot]','-c','user.email=41898282+github-actions[bot]@users.noreply.github.com','commit','-m','refactor: share manual and AI Scene edits with explicit permission policy'],check=True)
subprocess.run(['git','push','origin','HEAD:refs/heads/'+branch],check=True)
print('Verified final source tree:',tree)
