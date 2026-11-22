const tokens=value=>Number.isSafeInteger(value)&&value>=0?value:0;

export function creativeUsageSummary(state){
  const calls=[...(state.usage||[]),...(state.compactions||[]).map(row=>row.usage),...(state.auxiliaryUsage||[])];
  return {
    turns:tokens(state.turns),
    inputTokens:calls.reduce((sum,row)=>sum+tokens(row?.prompt_tokens),0),
    outputTokens:calls.reduce((sum,row)=>sum+tokens(row?.completion_tokens),0)
  };
}
