// CRUD is the stable boundary between the app and each persistence backend.
// Resolve on every call: login and explicit self-host settings may change the
// active backend without a page reload. Errors must never fall back to another.
export function createStorageRouter(resolveMode, adapters) {
  const active = async operation => {
    const mode = await resolveMode();
    const adapter = adapters[mode];
    if (typeof adapter?.[operation] !== 'function') {
      throw Error(`数据源 ${mode} 不支持 ${operation}`);
    }
    return adapter;
  };
  return {
    mode:resolveMode,
    all:async name => (await active('all')).all(name),
    get:async (name, id) => (await active('get')).get(name, id),
    transaction:async (names, callback) => (await active('transaction')).transaction(names, callback)
  };
}
