import test from 'node:test';
import assert from 'node:assert/strict';
import {createMainNavigation,mainSection} from '../src/main-navigation.js';

test('nested library Back stays in library after visiting Matching',()=>{
  const nav=createMainNavigation();
  const series={route:'series',seriesID:'all',scrollY:320};
  const detail={route:'library',seriesID:'s1',scrollY:80};
  nav.record(series);
  nav.visit(series,'library');nav.record(detail);
  nav.visit(detail,'matching');nav.record({route:'matching'});
  assert.deepEqual(nav.last('library'),detail);
  assert.deepEqual(nav.back('library'),series);
  assert.equal(nav.back('library'),null);
});

test('asset detail returns to its series detail while other main tabs retain positions',()=>{
  const nav=createMainNavigation();
  const series={route:'library',seriesID:'s1'};
  nav.visit(series,'assetDetail');
  nav.record({route:'assetDetail',seriesID:'s1',detailAssetID:'a1'});
  nav.visit({route:'assetDetail',seriesID:'s1',detailAssetID:'a1'},'works');
  assert.deepEqual(nav.back('library'),series);
  assert.equal(mainSection('import','work'),'works');
  assert.equal(mainSection('import','material'),'library');
});
