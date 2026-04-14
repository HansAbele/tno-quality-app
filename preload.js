const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  checkUser: (username) => ipcRenderer.invoke("check-user", username),
  setupPassword: (username, pass) => ipcRenderer.invoke("setup-password", username, pass),
  login: (user, pass) => ipcRenderer.invoke("login", user, pass),
  saveCallData: (data) => ipcRenderer.invoke("save-call-data", data),
  getHistory: (opts) => ipcRenderer.invoke("get-history", opts),
  askCopilot: (question) => ipcRenderer.invoke("ask-copilot", question),
  transcribeAudio: (audioBase64) => ipcRenderer.invoke("transcribe-audio", audioBase64),
  vaultLoad: () => ipcRenderer.invoke("vault-load"),
  vaultSave: (entries) => ipcRenderer.invoke("vault-save", entries),
  changePassword: (username, currentPass, newPass) => ipcRenderer.invoke("change-password", username, currentPass, newPass),
  saveSession: (username, pass) => ipcRenderer.invoke("save-session", username, pass),
  loadSession: () => ipcRenderer.invoke("load-session"),
  clearSession: () => ipcRenderer.invoke("clear-session")
});