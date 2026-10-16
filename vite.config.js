import {defineConfig} from 'vite';

export default defineConfig({
  build:{sourcemap:'hidden'},
  worker:{
    // The vision worker is intentionally a classic worker so official
    // OpenCV.js can be loaded with importScripts(), while our own recognition
    // modules are lazy-loaded with dynamic import(). Dynamic imports require
    // an ES chunk format even though the worker entry itself stays classic.
    format:'es'
  }
});
