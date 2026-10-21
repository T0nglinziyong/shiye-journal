import Ajv2020 from 'ajv/dist/2020.js';
import {webSceneContract} from './web-scene-contract.js';
const { $defs, ...page }=webSceneContract;
export const v3SceneSchema={
 $schema:'https://json-schema.org/draft/2020-12/schema',
 $defs,
 type:'object',additionalProperties:false,
 required:['format','version','source','title','materialDecisions','page'],
 properties:{
  format:{const:'shiye-editable-project'},version:{const:1},
  source:{type:'object',required:['bundleId','taskHash','taskBinding','packageLayout','materials','sourceSnapshots'],additionalProperties:true,
   properties:{bundleId:{type:'string'},taskHash:{type:'string'},taskBinding:{const:'local'},packageLayout:{const:'v3'},materials:{type:'array'},sourceSnapshots:{type:'array'}}},
  title:{type:'string',maxLength:80},
  materialDecisions:{type:'array',maxItems:100,items:{type:'object',required:['asset','choice','reason'],additionalProperties:false,properties:{asset:{type:'string'},choice:{enum:['intact','crafted','omitted']},reason:{type:'string'}}}},
  page,
  v3Transactions:{type:'object',additionalProperties:{type:'object',required:['transactionId','commandHash','baseSceneRevision','sceneRevision','operations','appliedAt'],additionalProperties:false,properties:{transactionId:{type:'string'},commandHash:{type:'string'},baseSceneRevision:{type:'string'},sceneRevision:{type:'string'},operations:{type:'integer'},appliedAt:{type:'string'}}}}
 }
};
const check=new Ajv2020({strict:false}).compile(v3SceneSchema);
export function validateV3SceneDocument(value){
 if(check(value))return value;
 const error=check.errors[0],field=error.params.missingProperty||error.params.additionalProperty||'',path=error.instancePath+(field?'/'+field:'');
 throw Object.assign(Error('scene'+path+' '+error.message),{code:'SCENE_SCHEMA_INVALID',path});
}
