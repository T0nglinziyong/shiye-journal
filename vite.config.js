import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';

export default defineConfig(({mode})=>({
  plugins:mode==='ui-test'?[{
    name:'cloudbase-ui-fixture',enforce:'pre',
    resolveId(source,importer){
      if(source==='./cloud-session.js'&&importer?.includes('/src/'))
        return fileURLToPath(new URL('./tests/fixtures/ui-cloud-session.js',import.meta.url));
    }
  }]:[],
  build:{sourcemap:'hidden'},
  worker:{
    // The vision worker is intentionally a classic worker so official
    // OpenCV.js can be loaded with importScripts(), while our own recognition
    // modules are lazy-loaded with dynamic import(). Dynamic imports require
    // an ES chunk format even though the worker entry itself stays classic.
    format:'es'
  }
}));
