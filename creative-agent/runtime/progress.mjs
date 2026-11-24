// The model owns aesthetic judgments; the runtime owns revision evidence.
export const creativeDimensions=['composition','lettering','accents','spread'];
export function updateCreativeProgress(previous,args,{sceneRevision,preview,needsRender,turn}){
  const next=structuredClone(previous||{focus:'尚未记录当前关注点',issues:[],checks:{}});
  const judgments=(args.issues||[]).some(issue=>issue.status==='verified')||(args.checks||[]).length>0;
  if(judgments&&(needsRender||!preview||preview.sceneRevision!==sceneRevision))throw Error('请先查看修改后的当前预览，再验证问题或记录画面检查；编辑成功不等于验证通过');
  if(args.focus)next.focus=args.focus;
  for(const issue of args.issues||[]){
    const entry={...issue,sceneRevision,turn};
    const index=next.issues.findIndex(item=>item.id===issue.id);
    if(index<0)next.issues.push(entry);else next.issues[index]=entry;
  }
  // Keep every unresolved issue; older resolved evidence remains in tool history.
  const active=next.issues.filter(issue=>issue.status==='open');
  if(active.length>8)throw Error('待解决问题最多保留 8 项，请合并重复问题或验证已解决的问题');
  next.issues=[...active,...next.issues.filter(issue=>issue.status!=='open').slice(-4)];
  for(const check of args.checks||[])next.checks[check.dimension]={...check,sceneRevision,turn};
  return next;
}
export function creativeProgressSnapshot(state,sceneRevision){
  const progress=state.creativeProgress||{focus:'尚未记录当前关注点',issues:[],checks:{}};
  const dimensions=creativeDimensions.filter(key=>!(key==='spread'&&state.document.page.pageMode!=='spread')&&!(key==='lettering'&&state.document.source.textMode==='none'));
  const checks=Object.fromEntries(dimensions.map(key=>{
    const check=progress.checks[key];
    return [key,check?{...check,current:check.sceneRevision===sceneRevision}:{status:'unchecked'}];
  }));
  const unchecked=dimensions.filter(key=>!checks[key].current);
  const work=dimensions.filter(key=>checks[key].status==='needs_work');
  const open=progress.issues.filter(issue=>issue.status==='open');
  const nextFocus=open.length?'先看最新画面核对待解决问题：'+open.map(issue=>issue.id).join('、')+'；确实解决后用 creation_progress 按 id 标 verified，仍需修改则保持 open。':work.length?'当前记录仍需处理：'+work.join('、')+'。根据最新图处理具体问题，再更新 creation_progress.checks；不能把已检查等同于已通过。':unchecked.length?'完成前仍需看图检查：'+unchecked.join('、')+'。用 creation_progress.checks 记录每项的状态和具体画面依据，可与 creation_finish 同轮调用，不需要额外一轮汇报。':'已记录当前画面的分项检查；若无待修缺陷可以交付，不为凑步骤继续修改。';
  return {...progress,checks,issues:progress.issues.map(issue=>({...issue,current:issue.sceneRevision===sceneRevision,
    verification:issue.status==='open'&&issue.sceneRevision!==sceneRevision?'画面已变化，需看图判断是否解决':issue.status==='verified'&&issue.sceneRevision!==sceneRevision?'此前已验证；后续修改可能影响结论':issue.status})),
    recentExecution:(state.results||[]).map(result=>({tool:result.name,ok:result.ok,...(!result.ok?{error:result.detail}:{})})),
    nextFocus:nextFocus+' 编辑后的效果下一轮再验证；检查不等于必须新增对象。可合批编辑与加载多个 Skill。'};
}
