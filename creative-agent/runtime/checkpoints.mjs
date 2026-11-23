import {MemorySaver} from '@langchain/langgraph';
import {mkdir,open} from 'node:fs/promises';
import {dirname} from 'node:path';

const cleanConfig=config=>({configurable:Object.fromEntries(['thread_id','checkpoint_ns','checkpoint_id'].filter(k=>config.configurable?.[k]!==undefined).map(k=>[k,config.configurable[k]]))});

// Replay the public saver operations; the storage provider owns durability and
// account isolation. No dependency on MemorySaver's internal object layout.
export class JournalCheckpointSaver extends MemorySaver {
  constructor(journal){super();this.journal=journal;this.tail=Promise.resolve();}
  async restore(){
    for await(const entry of await this.journal.read()){
      if(!['put','putWrites'].includes(entry.method))throw Error('无效的创作检查点操作');
      const args=await this.serde.loadsTyped(entry.type,Buffer.from(entry.data,'base64'));
      await super[entry.method](...args);
    }
    return this;
  }
  async record(method,args){
    const operation=this.tail.then(async()=>{
      const [type,bytes]=await this.serde.dumpsTyped(args);
      await this.journal.append({method,type,data:Buffer.from(bytes).toString('base64')});
      return super[method](...args);
    });
    this.tail=operation;
    return operation;
  }
  put(config,checkpoint,metadata,versions){return this.record('put',[cleanConfig(config),checkpoint,metadata,versions]);}
  putWrites(config,writes,taskId,taskPath){return this.record('putWrites',[cleanConfig(config),writes,taskId,taskPath]);}
  async deleteThread(){throw Error('创作检查点由任务保留策略回收');}
}

// Local acceptance runner only; production supplies a CloudBase journal.
export function fileCheckpointJournal(path){
  return {
    async *read(){
      let file;try{file=await open(path,'r');}catch(error){if(error.code==='ENOENT')return;throw error;}
      try{
        let pending='';
        for await(const chunk of file.createReadStream({encoding:'utf8',autoClose:false})){
          pending+=chunk;
          let end;
          while((end=pending.indexOf('\n'))>=0){const line=pending.slice(0,end);pending=pending.slice(end+1);if(line)yield JSON.parse(line);}
        }
        if(pending)throw Error('创作检查点末尾不完整，需恢复原始日志');
      }finally{await file.close();}
    },
    async append(entry){
      await mkdir(dirname(path),{recursive:true,mode:0o700});
      const file=await open(path,'a',0o600);
      try{await file.writeFile(JSON.stringify(entry)+'\n');await file.sync();}finally{await file.close();}
    }
  };
}
