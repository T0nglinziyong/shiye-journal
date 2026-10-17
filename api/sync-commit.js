import {createSyncCommitRelay} from '../server/sync-commit-relay.mjs';

export const config={maxDuration:30};
export default createSyncCommitRelay();
