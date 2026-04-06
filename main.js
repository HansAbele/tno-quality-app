const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const { app, BrowserWindow, ipcMain, screen } = require("electron");
const fs = require("fs");
const os = require("os");

function createWindow() {
  // 2. OBTENER DIMENSIONES DE LA PANTALLA
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height, x, y } = primaryDisplay.workArea;

  // Definimos el ancho fijo que queremos para la app
  const appWidth = 480;

  const win = new BrowserWindow({
    width: appWidth,
    height: height, // Ocupa toda la altura disponible
    x: x + width - appWidth, // Posición X: Se mueve a la derecha del todo
    y: y, // Posición Y: Arriba del todo

    // Configuración visual
    icon: path.join(__dirname, "logo.png"),
    frame: true,
    alwaysOnTop: true,

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

// === LÓGICA DE GUARDADO (Backend) ===
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

// === NUEVA LÓGICA: OBTENER HISTORIAL (Backend) ===
// Esta es la parte nueva que permite leer los archivos guardados
ipcMain.handle("get-history", async () => {
  try {
    const documentsPath = path.join(os.homedir(), "Documents", "TNO_Logs");

    // Si la carpeta no existe, devolvemos una lista vacía
    if (!fs.existsSync(documentsPath)) return [];

    // Leemos los archivos de la carpeta que terminen en .json
    const files = fs.readdirSync(documentsPath).filter(file => file.endsWith('.json'));

    let allCalls = [];

    // Recorremos los archivos en orden inverso (más recientes primero)
    files.sort().reverse().forEach(file => {
      const filePath = path.join(documentsPath, file);
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      try {
        const json = JSON.parse(fileContent);
        // Unimos los datos de este archivo al total
        if (Array.isArray(json)) {
          allCalls = allCalls.concat(json);
        }
      } catch (err) {
        console.error("Error leyendo archivo:", file, err);
      }
    });

    return allCalls;
  } catch (error) {
    console.error("Error obteniendo historial:", error);
    return [];
  }
});

// === AI COPILOT LOGIC (Backend) ===
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { createClient } = require("@supabase/supabase-js");

// Pre-load system prompt once at startup
let systemRules = "";
try {
  systemRules = fs.readFileSync(path.join(__dirname, "system_prompt.txt"), "utf-8");
} catch (e) {
  console.error("WARNING: system_prompt.txt not found. Copilot will work without system rules.");
}

// Validate required env vars
const REQUIRED_ENV = ["GEMINI_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const missingEnv = REQUIRED_ENV.filter(k => !process.env[k]);
if (missingEnv.length > 0) {
  console.error(`WARNING: Missing environment variables: ${missingEnv.join(", ")}. AI features will not work.`);
}

ipcMain.handle("ask-copilot", async (event, question) => {
  try {
    if (!process.env.GEMINI_API_KEY) return { content: "AI is not configured. Please check your .env file (GEMINI_API_KEY missing)." };

    // 1. Convert question to vector using Gemini
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const embeddingModel = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
    const result = await embeddingModel.embedContent(question);
    const queryEmbedding = result.embedding.values;

    // 2. Search Supabase database
    let contextText = "No direct company rules found in the manual for this specific query. Answer generally or ask the user for more clarification.";
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
      const { data: documents, error } = await supabase.rpc("match_chunks", {
        query_embedding: queryEmbedding,
        match_threshold: 0.5,
        match_count: 3
      });

      if (error) console.error("Supabase search error:", error.message);

      if (documents && documents.length > 0) {
        contextText = documents.map(doc => `DOCUMENT SNIPPET (Source: ${doc.source}):\n${doc.content}`).join("\n\n---\n\n");
      }
    }

    // 3. Ask Google Gemini to generate the final response
    const aiModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

    const prompt = `${systemRules}

    --- KNOWLEDGE BASE CONTEXT ---
    Here is the knowledge context retrieved from the database:
    ${contextText}

    --- CURRENT INQUIRY ---
    Agent's Question: ${question}`;

    const resultResponse = await aiModel.generateContent(prompt);
    return { content: resultResponse.response.text() };

  } catch (error) {
    console.error("Error en ask-copilot:", error);
    return { content: "I'm having trouble connecting right now. Please try again in a moment." };
  }
});

// === AUDIO TRANSCRIPTION (Voice Dictation) ===
const TRANSCRIPTION_MODELS = ["gemini-2.5-flash-lite", "gemini-2.0-flash"];

ipcMain.handle("transcribe-audio", async (event, audioBase64) => {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

  for (const modelName of TRANSCRIPTION_MODELS) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });

      const result = await model.generateContent([
        {
          inlineData: {
            mimeType: "audio/webm",
            data: audioBase64,
          },
        },
        { text: "Transcribe the spoken words in this audio. Output ONLY the exact words spoken, nothing else. Do not add labels, prefixes, quotes, or commentary." },
      ]);

      let text = result.response.text().trim();
      // Strip any prefix Gemini might add despite instructions
      text = text.replace(/^(here'?s?\s*(the)?\s*transcription\s*:\s*)/i, "");
      text = text.replace(/^["']|["']$/g, "");
      return { text };
    } catch (error) {
      console.error(`Transcription failed with ${modelName}:`, error.message);
      // Try next model
      continue;
    }
  }

  return { error: "Transcription unavailable. All models are busy, please try again in a moment." };
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