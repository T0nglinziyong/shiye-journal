// A display-only bridge to the active image loader. It owns no bytes and never
// performs reads or authorizes access. Loader invalidation owns URL lifetimes.
let active = null;
const invalidators = new Set();
export function bindImageResources(reader) {
  const token = {reader}; active = token;
  notifyImageInvalidation(null);
  return () => { if (active === token) { active = null; notifyImageInvalidation(null); } };
}
export function cachedImageSource(id) { return active?.reader.source(id) || ''; }
export function cachedImageIdentity(source) { return active?.reader.identity(source) || null; }
export function onImageInvalidation(fn) { invalidators.add(fn); return () => invalidators.delete(fn); }
export function notifyImageInvalidation(ids) {
  const values = ids == null ? null : new Set(ids);
  for (const callback of invalidators) callback(values);
}
