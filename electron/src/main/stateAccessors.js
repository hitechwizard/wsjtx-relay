function createMutableState(initialValue = null) {
  let value = initialValue;

  return {
    get: () => value,
    set: (nextValue) => {
      value = nextValue;
    },
  };
}

module.exports = {
  createMutableState,
};
