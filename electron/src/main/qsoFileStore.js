function createQsoStore(Store, legacyStore) {
  const qsoStore = new Store({
    name: 'qsolog',
    defaults: {
      qsos: [],
    },
  });

  const legacyQsos = legacyStore.get('qsos', []);
  const storedQsos = qsoStore.get('qsos', []);
  if (
    Array.isArray(legacyQsos) &&
    legacyQsos.length > 0 &&
    (!Array.isArray(storedQsos) || storedQsos.length === 0)
  ) {
    qsoStore.set('qsos', legacyQsos);
    legacyStore.delete('qsos');
  }

  return qsoStore;
}

module.exports = {
  createQsoStore,
};
