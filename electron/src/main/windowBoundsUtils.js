function attachPersistBoundsOnClose(targetWindow, store, boundsStoreKey) {
  if (!targetWindow || !store || !boundsStoreKey) {
    return;
  }

  targetWindow.on('close', () => {
    const bounds = targetWindow.getBounds();
    store.set(boundsStoreKey, bounds);
  });
}

module.exports = {
  attachPersistBoundsOnClose,
};
