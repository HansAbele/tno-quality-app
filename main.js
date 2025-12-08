// 1. IMPORTANTE: Agregamos 'screen' aquí para medir la pantalla
const { app, BrowserWindow, ipcMain, screen } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");

function createWindow() {
  // 2. OBTENER DIMENSIONES DE LA PANTALLA
  // Esto detecta tu monitor principal y su área de trabajo (descontando barra de tareas)
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height, x, y } = primaryDisplay.workArea;

  // Definimos el ancho fijo que queremos para la app (480px es un buen tamaño lateral)
  const appWidth = 480;

  const win = new BrowserWindow({
    width: appWidth,
    height: height, // Ocupa toda la altura disponible
    x: x + width - appWidth, // Posición X: Se mueve a la derecha del todo
    y: y, // Posición Y: Arriba del todo

    // Configuración visual
    icon: path.join(__dirname, "logo.png"),
    frame: true, // Mantiene los bordes y botones de cerrar
    alwaysOnTop: true, // Mantiene la app encima de otras ventanas (Opcional: cambia a false si molesta)

    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Borrar el menú de opciones superior
  win.setMenu(null);

  win.loadFile("index.html");
}

// === LÓGICA DE GUARDADO (Backend) - ESTO SIGUE IGUAL ===
ipcMain.handle("save-call-data", async (event, data) => {
  try {
    const today = new Date().toISOString().split("T")[0];
    const fileName = `calls_log_${today}.json`;
    const documentsPath = path.join(os.homedir(), "Documents", "TNO_Logs");

    if (!fs.existsSync(documentsPath)) {
      fs.mkdirSync(documentsPath, { recursive: true });
    }

    const filePath = path.join(documentsPath, fileName);
    let fileContent = [];
    if (fs.existsSync(filePath)) {
      const rawData = fs.readFileSync(filePath);
      try {
        fileContent = JSON.parse(rawData);
      } catch (e) {
        fileContent = [];
      }
    }

    fileContent.push(data);
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
