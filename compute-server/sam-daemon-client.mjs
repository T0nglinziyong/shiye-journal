import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {createInterface} from 'node:readline';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const script=fileURLToPath(new URL('./sam-fast-daemon.py',import.meta.url));

export class SamDaemonClient{
  constructor(samRoot){this.samRoot=samRoot;this.child=null;this.pending=new Map();this.ready=null;}
  start(){
    if(this.child)return this.ready;
    let resolveReady,rejectReady;
    this.ready=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});
    const child=spawn(path.join(this.samRoot,'.venv/bin/python'),
      [script,'--sam-root',this.samRoot],{cwd:this.samRoot,stdio:['pipe','pipe','pipe']});
    this.child=child;child.stderr.resume();
    const lines=createInterface({input:child.stdout});
    lines.on('line',line=>{
      let message;try{message=JSON.parse(line);}catch{return;}
      if(message.ready){resolveReady();return;}
      const pending=this.pending.get(message.id);
      if(!pending)return;
      this.pending.delete(message.id);clearTimeout(pending.timer);
      message.ok?pending.resolve(message):pending.reject(Error(message.error||'SAM 服务处理失败'));
    });
    const fail=error=>{
      if(this.child!==child)return;
      this.child=null;rejectReady(error);
      for(const pending of this.pending.values()){clearTimeout(pending.timer);pending.reject(error);}
      this.pending.clear();lines.close();
    };
    child.on('error',fail);
    child.on('close',code=>fail(Error('SAM 服务退出：'+code)));
    return this.ready;
  }
  async run(job){
    await this.start();
    const id=randomUUID();
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.child?.kill('SIGKILL');reject(Error('SAM 服务超时'));},12*60_000);
      this.pending.set(id,{resolve,reject,timer});
      this.child.stdin.write(JSON.stringify({id,...job})+'\n',error=>{
        if(!error)return;
        clearTimeout(timer);this.pending.delete(id);reject(error);
      });
    });
  }
  stop(){this.child?.kill('SIGTERM');}
}
