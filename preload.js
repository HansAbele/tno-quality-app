const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  login: (user, pass) => ipcRenderer.invoke("login", user, pass),
  saveCallData: (data) => ipcRenderer.invoke("save-call-data", data),
  getHistory: (opts) => ipcRenderer.invoke("get-history", opts),
  askCopilot: (question) => ipcRenderer.invoke("ask-copilot", question),
  transcribeAudio: (audioBase64) => ipcRenderer.invoke("transcribe-audio", audioBase64)
});