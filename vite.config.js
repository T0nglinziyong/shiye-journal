import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';

export default defineConfig(({mode})=>({
  plugins:['ui-test','browser-test'].includes(mode)?[{
    name:'cloudbase-ui-fixture',enforce:'pre',
    resolveId(source,importer){
      if(source==='./cloud-session.js'&&importer?.includes('/src/'))
        return fileURLToPath(new URL(mode==='ui-test'?'./tests/fixtures/ui-cloud-session.js':'./tests/fixtures/browser-cloud-session.js',import.meta.url));
      if(mode==='browser-test'&&source==='./cloud-auth-ui.js'&&importer?.includes('/src/'))
        return fileURLToPath(new URL('./tests/fixtures/browser-cloud-auth.js',import.meta.url));
    }
  }]:[],
  // ZIP is loaded by a dynamic import during backup/storage browser checks.
  // Pre-bundle it before Vite serves the page; otherwise first use triggers a
  // full dev-page reload in fresh CI, detaching the browser's CDP target.
  optimizeDeps:mode==='browser-test'?{include:['@zip.js/zip.js']}:undefined,
  build:{sourcemap:'hidden'},
  worker:{
    // The vision worker is intentionally a classic worker so official
    // OpenCV.js can be loaded with importScripts(), while our own recognition
    // modules are lazy-loaded with dynamic import(). Dynamic imports require
    // an ES chunk format even though the worker entry itself stays classic.
    format:'es'
  }
}));
