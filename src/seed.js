import * as db from './store.js';
// The Swift 2.0.10 baseline starts with its own bundled material sets and CeCe pages.
// Earlier generic demo records remain untouched in existing browsers.
export async function seedIfEmpty(){if(!await db.get('meta','seed-v1'))await db.put('meta',{id:'seed-v1',createdAt:new Date().toISOString(),skipped:true});}
