function createAppState() {
  let mainWindow = null;
  let settingsWindow = null;
  let qsoEditorWindow = null;
  let examplesWindow = null;
  let potaSpotsWindow = null;
  let dxSummitSpotsWindow = null;
  let relay = null;
  let updateController = null;

  return {
    getMainWindow: () => mainWindow,
    setMainWindow: (value) => {
      mainWindow = value;
    },
    getSettingsWindow: () => settingsWindow,
    setSettingsWindow: (value) => {
      settingsWindow = value;
    },
    getQsoEditorWindow: () => qsoEditorWindow,
    setQsoEditorWindow: (value) => {
      qsoEditorWindow = value;
    },
    getExamplesWindow: () => examplesWindow,
    setExamplesWindow: (value) => {
      examplesWindow = value;
    },
    getPotaSpotsWindow: () => potaSpotsWindow,
    setPotaSpotsWindow: (value) => {
      potaSpotsWindow = value;
    },
    getDxSummitSpotsWindow: () => dxSummitSpotsWindow,
    setDxSummitSpotsWindow: (value) => {
      dxSummitSpotsWindow = value;
    },
    getRelay: () => relay,
    setRelay: (value) => {
      relay = value;
    },
    getUpdateController: () => updateController,
    setUpdateController: (value) => {
      updateController = value;
    },
    getWindowRefs: () => [
      mainWindow,
      settingsWindow,
      qsoEditorWindow,
      examplesWindow,
      potaSpotsWindow,
      dxSummitSpotsWindow,
    ],
  };
}

module.exports = {
  createAppState,
};
