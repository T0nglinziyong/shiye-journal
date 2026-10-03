export function craftError(code,message,details={}) { return Object.assign(new Error(message),{name:'CraftError',code,recoverable:true,...details}); }
export function craftAssert(condition,code,message,details={}) { if(!condition)throw craftError(code,message,details); }
export function craftDiagnostic(error) {
  return Object.fromEntries(['code','path','pieceId','assetId','constraint','recoverable','suggestions'].filter(key=>error?.[key]!==undefined).map(key=>[key,error[key]]));
}
