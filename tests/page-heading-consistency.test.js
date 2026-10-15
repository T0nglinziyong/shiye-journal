import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const load=name=>readFile(new URL('../src/'+name,import.meta.url),'utf8');

test('Materials, Matching and Works share identical top-left three-line header structure',async()=>{
 const [react,matching,css]=await Promise.all([
   load('react-routes.jsx'),load('matching-view.js'),load('page-heading.css')
 ]);
 assert.match(react,/view-head unified-page-heading/);
 assert.match(react,/unified-heading-copy/);
 assert.match(react,/FROM YOUR DESK TO YOUR PAGES/);
 assert.match(react,/<PageHeading title="我的素材"\/>/);
 assert.match(react,/<PageHeading title="我的作品"\/>/);
 assert.match(matching,/head\('素材搭配'/);
 assert.match(css,/\.unified-page-heading \.unified-heading-copy h1/);
 assert.match(css,/--shiye-heading-title-size:32px/);
 assert.match(css,/@media \(max-width:699px\)/);
 assert.match(css,/--shiye-heading-title-size:27px/);
});
test('series detail, import and settings share typography without replacing mobile layout',async()=>{
 const [react,css,responsive]=await Promise.all([
   load('react-routes.jsx'),load('page-heading.css'),load('responsive.css')
 ]);
 assert.match(react,/className="view-head series-heading"/);
 assert.match(css,/\.series-heading \.series-copy h1/);
 assert.match(css,/\.import-review > h1/);
 assert.match(css,/\.settings-page > h1/);
 assert.match(responsive,/@media\s*\(max-width:699px\)/);
});
