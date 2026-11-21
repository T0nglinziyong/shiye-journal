import {readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {summarizeCreativeEvaluation} from '../compute-server/harness/quality-evaluation.mjs';

const [runPath,reviewPath]=process.argv.slice(2);
if(!runPath||!reviewPath)throw Error('用法：node scripts/score-creative-harness.mjs <验收目录> <人工审阅 JSON>');
const run=resolve(runPath),frames=JSON.parse(await readFile(join(run,'evaluation.json'),'utf8')).frames;
const humanReviews=JSON.parse(await readFile(resolve(reviewPath),'utf8'));
if(!Array.isArray(humanReviews))throw Error('人工审阅文件须为数组');
const evaluation=summarizeCreativeEvaluation(frames,{humanReviews});
await writeFile(join(run,'evaluation.json'),JSON.stringify(evaluation,null,2),{mode:0o600});
console.log(JSON.stringify({frames:evaluation.comparison?.revisions||0,humanReviewed:evaluation.comparison?.humanReviewed||0}));
