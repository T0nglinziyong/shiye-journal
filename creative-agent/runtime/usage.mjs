const tokens=value=>Number.isSafeInteger(value)&&value>=0?value:0;

export function creativeUsageSummary(state){
  const calls=[...(state.usage||[]),...(state.compactions||[]).map(row=>row.usage),...(state.auxiliaryUsage||[])];
  return {
    turns:tokens(state.turns),
    inputTokens:calls.reduce((sum,row)=>sum+tokens(row?.prompt_tokens),0),
    reusedTokens:calls.reduce((sum,row)=>sum+Math.min(tokens(row?.prompt_tokens),tokens(row?.prompt_cache_hit_tokens??row?.prompt_tokens_details?.cached_tokens)),0),
    outputTokens:calls.reduce((sum,row)=>sum+tokens(row?.completion_tokens),0)
  };
}
