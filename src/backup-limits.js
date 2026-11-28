// Large backups are read in bounded chunks; metadata still has a fixed budget.
export const BACKUP_BYTES_LIMIT=2*1024*1024*1024;
export const BACKUP_METADATA_LIMIT=64*1024*1024;
export const BACKUP_ENTRY_LIMIT=20000;
