import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';

const script=fileURLToPath(new URL('./orientation-daemon.py',import.meta.url));

export class OrientationDaemonClient{
  constructor(python){this.python=python;this.child=null;this.pending=new Map();this.ready=null;}
  start(){
    if(this.child)return this.ready;
    let resolveReady,rejectReady;
    this.ready=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});
    const child=spawn(this.python,[script],{stdio:['pipe','pipe','pipe']});
    this.child=child;child.stderr.resume();
    const lines=createInterface({input:child.stdout});
    lines.on('line',line=>{
      let message;try{message=JSON.parse(line);}catch{return;}
      if(message.ready){resolveReady();return;}
      const pending=this.pending.get(message.id);
      if(!pending)return;
      this.pending.delete(message.id);clearTimeout(pending.timer);
      message.ok?pending.resolve(message):pending.reject(Error(message.error||'方向识别失败'));
    });
    const fail=error=>{
      if(this.child!==child)return;
      this.child=null;rejectReady(error);
      for(const pending of this.pending.values()){clearTimeout(pending.timer);pending.reject(error);}
      this.pending.clear();lines.close();
    };
    child.on('error',fail);
    child.on('close',code=>fail(Error('方向服务退出：'+code)));
    return this.ready;
  }
  async request(payload){
    await this.start();
    const id=randomUUID();
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.child?.kill('SIGKILL');reject(Error('方向服务超时'));},30000);
      this.pending.set(id,{resolve,reject,timer});
      this.child.stdin.write(JSON.stringify({id,...payload})+'\n',error=>{
        if(!error)return;
        clearTimeout(timer);this.pending.delete(id);reject(error);
      });
    });
  }
  async prepare(input){return (await this.request({stage:'prepare',input})).locations;}
  run(input,manifest,locations=null){return this.request({stage:'complete',input,manifest,locations});}
  stop(){this.child?.kill('SIGTERM');}
}
