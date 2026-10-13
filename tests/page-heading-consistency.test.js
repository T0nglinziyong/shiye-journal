import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const load=name=>readFile(new URL('../src/'+name,import.meta.url),'utf8');

test('Materials, Matching and Works share identical top-left three-line header structure',async()=>{
 const [app,react,matching,css]=await Promise.all([
   load('app.js'),load('react-routes.jsx'),load('matching-view.js'),load('page-heading.css')
 ]);
 assert.match(app,/function head\(title,subtitle,actions/);
 assert.match(app,/view-head unified-page-heading/);
 assert.match(app,/unified-heading-copy/);
 assert.match(app,/FROM YOUR DESK TO YOUR PAGES/);
 assert.match(react,/<PageHeading title="我的素材"\/>/);
 assert.match(react,/<PageHeading title="我的作品"\/>/);
 assert.match(matching,/head\('素材搭配'/);
 assert.match(css,/\.unified-page-heading \.unified-heading-copy h1/);
 assert.match(css,/--shiye-heading-title-size:32px/);
 assert.match(css,/@media \(max-width:699px\)/);
 assert.match(css,/--shiye-heading-title-size:27px/);
});
test('series detail, import and settings share typography without replacing mobile layout',async()=>{
 const [series,css,responsive]=await Promise.all([
   load('series-contents.js'),load('page-heading.css'),load('responsive.css')
 ]);
 assert.match(series,/class="view-head series-heading"/);
 assert.match(css,/\.series-heading \.series-copy h1/);
 assert.match(css,/\.import-review > h1/);
 assert.match(css,/\.settings-page > h1/);
 assert.match(responsive,/@media\s*\(max-width:699px\)/);
});
