const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");

function createWindow() {
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    // Aquí configuramos el icono de la ventana
    icon: path.join(__dirname, "logo.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // --- ESTA ES LA LÍNEA NUEVA PARA BORRAR EL MENÚ ---
  win.setMenu(null);
  // --------------------------------------------------

  win.loadFile("index.html");
}

// === LÓGICA DE GUARDADO (Backend) ===
ipcMain.handle("save-call-data", async (event, data) => {
  try {
    // 1. Obtener fecha de hoy para el nombre del archivo
    const today = new Date().toISOString().split("T")[0];
    const fileName = `calls_log_${today}.json`;

    // 2. Definir dónde guardar (En Documentos -> TNO_Logs)
    const documentsPath = path.join(os.homedir(), "Documents", "TNO_Logs");

    // Si la carpeta no existe, crearla
    if (!fs.existsSync(documentsPath)) {
      fs.mkdirSync(documentsPath, { recursive: true });
    }

    const filePath = path.join(documentsPath, fileName);

    // 3. Leer archivo existente o iniciar array vacío
    let fileContent = [];
    if (fs.existsSync(filePath)) {
      const rawData = fs.readFileSync(filePath);
      try {
        fileContent = JSON.parse(rawData);
      } catch (e) {
        fileContent = [];
      }
    }

    // 4. Agregar la nueva llamada
    fileContent.push(data);

    // 5. Guardar el archivo actualizado
    fs.writeFileSync(filePath, JSON.stringify(fileContent, null, 2));

    return { success: true, path: filePath };
  } catch (error) {
    console.error("Error guardando:", error);
    return { success: false, error: error.message };
  }
});

// === CICLO DE VIDA DE LA APP ===
app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
