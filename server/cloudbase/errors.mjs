export class ServiceError extends Error{
  constructor(status,code,message){super(message);this.name='ServiceError';this.status=status;this.code=code;}
}
export const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
export function requireObject(value){if(!object(value))throw new ServiceError(400,'INVALID_BODY','请求必须是 JSON 对象');return value;}
export function boundedInteger(value,fallback,min,max){
  if(value==null)return fallback;
  if(!Number.isInteger(value)||value<min||value>max)throw new ServiceError(400,'INVALID_NUMBER','数值参数超出允许范围');
  return value;
}
