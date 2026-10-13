// Other screens retain the established render/mount implementation until
// their own business controllers are extracted; all follow the same contract.
export const createStandardController=render=>({render});
