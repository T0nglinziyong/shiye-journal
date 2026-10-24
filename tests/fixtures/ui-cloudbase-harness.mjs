import assert from 'node:assert/strict';

export function installUiCloudBase(window,{assets=[],series=[],projects=[],meta=[],trash=[],blobs=[]}={}){
  const user={id:'ui-test-user'},account={user_id:user.id,username:'ui-test',is_admin:false};
  const state={revision:0,epoch:'00000000-0000-4000-8000-000000000001',
    records:new Map(),changes:[],receipts:new Map(),objects:new Map()};
  for(const [store,rows] of Object.entries({assets,series,projects,meta,trash,blobs}))
    for(const record of rows)state.records.set(store+':'+record.id,structuredClone(record));
  const selectRows=(table,filters,columns)=>{
    let rows;
    if(table==='shiye_accounts')rows=[account];
    else if(table==='shiye_revisions')rows=[{user_id:user.id,revision:state.revision,account_epoch:state.epoch}];
    else if(table==='shiye_records')rows=[...state.records].map(([key,record])=>({
      user_id:user.id,store:key.slice(0,key.indexOf(':')),id:key.slice(key.indexOf(':')+1),record:structuredClone(record)
    }));
    else if(table==='shiye_changes')rows=state.changes;
    else if(table==='shiye_commit_receipts_v3')rows=[...state.receipts].map(([operation_id,result])=>({operation_id,result}));
    else if(table==='shiye_commits')rows=[];
    else throw Error('UI fixture table not registered: '+table);
    rows=rows.filter(row=>filters.every(([op,key,value])=>{
      if(op==='eq')return row[key]===value;
      if(op==='in')return value.includes(row[key]);
      if(op==='gt')return row[key]>value;
      if(op==='lte')return row[key]<=value;
      throw Error('UI fixture filter not registered: '+op);
    }));
    if(columns&&columns!=='*'){
      const names=columns.split(',').map(item=>item.trim());
      rows=rows.map(row=>Object.fromEntries(names.filter(name=>name in row).map(name=>[name,row[name]])));
    }
    return rows;
  };
  const client={
    auth:{
      getSession:async()=>({data:{session:{access_token:'a'.repeat(40)}},error:null}),
      getUser:async()=>({data:{user},error:null}),
      onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),
      signOut:async()=>({error:null}),
      signInWithPassword:async()=>({error:null})
    },
    from(table){
      const filters=[];let columns='*',ordered=null,maximum=Infinity;
      const rows=()=>{let result=selectRows(table,filters,columns);
        if(ordered)result.sort((a,b)=>String(a[ordered]).localeCompare(String(b[ordered])));
        return result.slice(0,maximum);};
      const query={
        select(value){columns=value;return query;},eq(key,value){filters.push(['eq',key,value]);return query;},
        in(key,value){filters.push(['in',key,value]);return query;},
        gt(key,value){filters.push(['gt',key,value]);return query;},
        lte(key,value){filters.push(['lte',key,value]);return query;},
        order(key){ordered=key;return query;},limit(value){maximum=value;return query;},
        abortSignal(){return query;},
        async range(start,end){return {data:rows().slice(start,end+1),error:null};},
        async single(){return {data:rows()[0]||null,error:rows().length===1?null:{message:'row missing'}};},
        async maybeSingle(){return {data:rows()[0]||null,error:null};},
        then(resolve,reject){return Promise.resolve({data:rows(),error:null}).then(resolve,reject);}
      };
      return query;
    },
    async rpc(name,args){
      assert.equal(name,'shiye_commit_v3_guarded');
      if(state.receipts.has(args.operation_id))return {data:state.receipts.get(args.operation_id),error:null};
      if(args.base_revision>state.revision||args.expected_epoch!==state.epoch)
        return {data:null,error:{code:'PT409',message:'fixture revision changed'},status:409};
      for(const op of args.operations){
        const key=op.store+':'+(op.item?.id||op.id);
        if(op.action==='put')state.records.set(key,structuredClone(op.item));
        else if(op.action==='delete')state.records.delete(key);
        else if(op.action==='clear')for(const id of [...state.records.keys()])if(id.startsWith(op.store+':'))state.records.delete(id);
      }
      state.revision++;
      state.changes.push({revision:state.revision,keys:args.operations.map(op=>({store:op.store,id:op.item?.id||op.id,action:op.action}))});
      const result={status:'applied',revision:state.revision,accountEpoch:state.epoch,syncProtocolVersion:3};
      state.receipts.set(args.operation_id,result);
      return {data:result,error:null};
    }
  };
  const invoke=async({data})=>{
    if(data.route==='/api/cos')return {code:0,result:{version:1,status:200,body:{tickets:data.body.objects.map(row=>({
      ...row,url:'https://cos.ui-test/'+encodeURIComponent(row.path),headers:row.method==='PUT'?{'content-type':row.type}:{}
    }))}}};
    if(data.route==='/api/platform-health')return {code:0,result:{version:1,status:200,body:{platform:'cloudbase',apiVersion:1,authentication:'verified',cos:{configured:true},capabilities:{schema:true,keyword:false,vector:false}}}};
    return {code:0,result:{version:1,status:200,body:{}}};
  };
  const storage={from:()=>({
    upload:async(path,data)=>{if(state.objects.has(path))return {data:null,error:{statusCode:409,message:'exists'}};state.objects.set(path,data);return {data:{path},error:null};},
    download:async path=>state.objects.has(path)?{data:state.objects.get(path),error:null}:{data:null,error:{statusCode:404,message:'missing'}},
    exists:async path=>({data:state.objects.has(path),error:null})
  })};
  window.__SHIYE_UI_CLOUD__={user,account,client,storage,invoke,state};
  // COS is a signed, direct transfer in production. No network leaves tests.
  window.XMLHttpRequest=undefined;
  window.fetch=async(input,init={})=>{
    const url=String(input);
    if(url.startsWith('https://cos.ui-test/')){
      const path=decodeURIComponent(url.slice('https://cos.ui-test/'.length));
      if(init.method==='PUT'){state.objects.set(path,init.body);return new Response(null,{status:200});}
      return new Response(state.objects.get(path)||new Blob(['fixture image'],{type:'image/png'}),{status:200});
    }
    return new Response(JSON.stringify({}),{status:200,headers:{'content-type':'application/json'}});
  };
  return state;
}
