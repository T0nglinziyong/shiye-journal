export const LARGE_PROJECT_BYTES=128*1024;
export function projectSummary(project,path,encoding){
  const {editHistory,manualArchives,initialEditorSnapshot,manualEditorSnapshot,draftHistorySnapshots,...summary}=project;
  return {...summary,projectDocumentPath:path,...(encoding?{projectDocumentEncoding:encoding}:{}),drafts:project.drafts.map(d=>{const {layers,makingSteps,...meta}=d;return {...meta,layers:[],makingSteps:[]};})};
}
export function mergeProjectSummary(document,summary){
  const {projectDocumentPath,projectDocumentEncoding,projectDocumentProvider,drafts,...metadata}=summary;
  return {...document,...metadata,drafts:document.drafts.map(d=>{const latest=drafts.find(row=>row.id===d.id);if(!latest)return d;const {layers,makingSteps,...meta}=latest;return {...d,...meta};})};
}
export async function projectBlobText(blob,encoding){
  if(!encoding)return blob.text();
  if(encoding!=='gzip'||typeof DecompressionStream!=='function')throw Error('此浏览器不支持作品解压，请更新浏览器；云端作品未被改写');
  return new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).text();
}
