import test from 'node:test';
import assert from 'node:assert/strict';
import {creationCompositionPriority} from '../src/creation-composition-feedback.js';

test('structural gaps are repaired before decorative marks',()=>{
 const advisory={estimatedGraphicPaintFraction:0,layers:{material:4},clusterAlignment:[{page:'page.left',verticalGapFraction:.14,leftEdgeOffsetFraction:.12}]};
 const balanced={pages:[{page:'page.left',share:.49,quadrants:[.4,.2,.25,.15]},{page:'page.right',share:.51,quadrants:[.56,.25,.16,.03]}]};
 assert.match(creationCompositionPriority(balanced,advisory),/右下/);
 assert.match(creationCompositionPriority({pages:[{page:'page.left',share:.5,quadrants:[.25,.25,.25,.25]},{page:'page.right',share:.5,quadrants:[.25,.25,.25,.25]}]},advisory),/正文与主素材相隔/);
 assert.match(creationCompositionPriority({pages:[{page:'page.left',share:.2},{page:'page.right',share:.8}]},advisory),/重分两页承重/);
});
