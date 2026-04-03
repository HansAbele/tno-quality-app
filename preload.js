const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  saveCallData: (data) => ipcRenderer.invoke("save-call-data", data),
  getHistory: () => ipcRenderer.invoke("get-history"),
  askCopilot: (question) => ipcRenderer.invoke("ask-copilot", question)
});