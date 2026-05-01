const { AdiWriter } = require('../../adif/AdiWriter');
const AdiReader = require('../../adif/AdiReader');

function registerAdifHandlers({ ipcMain, qsoStore, dialog, getQsoEditorWindow, fsPromises }) {
  ipcMain.handle('export-qsos-adif', async () => {
    const qsos = qsoStore.get('qsos', []);

    const { filePath } = await dialog.showSaveDialog(getQsoEditorWindow(), {
      title: 'Export QSOs to ADIF',
      defaultPath: `qsos-${new Date().toISOString().split('T')[0]}.adi`,
      filters: [
        { name: 'ADIF Files', extensions: ['adi', 'adif'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });

    if (filePath) {
      try {
        const writer = new AdiWriter('wsjtx-relay', '1.0');
        const adifData = writer.writeAll(qsos);
        await fsPromises.writeFile(filePath, adifData, 'utf-8');
        return { success: true, filePath };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }

    return { success: false, error: 'Export cancelled' };
  });

  ipcMain.handle('import-qsos-adif', async () => {
    const { filePaths } = await dialog.showOpenDialog(getQsoEditorWindow(), {
      title: 'Import QSOs from ADIF',
      filters: [
        { name: 'ADIF Files', extensions: ['adi', 'adif'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      properties: ['openFile'],
    });

    if (filePaths && filePaths.length > 0) {
      try {
        const fileContent = await fsPromises.readFile(filePaths[0], 'utf-8');
        const reader = new AdiReader(fileContent);
        const importedQsos = reader.readAll();
        return { success: true, qsos: importedQsos, filePath: filePaths[0] };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }

    return { success: false, error: 'Import cancelled' };
  });
}

module.exports = {
  registerAdifHandlers,
};
