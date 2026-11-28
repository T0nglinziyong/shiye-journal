// Recognition of records created by older releases only. New accounts are
// never seeded with materials, series, or sample works.
const LEGACY_EXAMPLE_IDS=new Set([
  'cece-p1-project','cece-p2-project','cece-p3-project','cece-p4-project',
  'shiye-example-handmade','shiye-example-journal','shiye-example-travel'
]);

export const isCurrentBuiltinMaterial=asset=>!!asset&&(
  asset.isBuiltinMaterial===true||asset.sourceIdentifier==='shiye-current-builtin'
);
export const isCurrentExampleProject=record=>LEGACY_EXAMPLE_IDS.has(record?.id);
export const isUntouchedLegacyExample=record=>
  record?.sourceIdentifier==='shiye-current-example-cece'
  &&isCurrentExampleProject(record)
  &&record.updatedAt===record.coverBaselineUpdatedAt;
