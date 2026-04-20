const path = require("path");
const fs = require("fs");

// Load .env from multiple possible locations (dev vs packaged)
const envPaths = [
  path.join(__dirname, ".env"),
  path.join(process.resourcesPath || __dirname, ".env")
];
for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    require("dotenv").config({ path: envPath });
    break;
  }
}

const { app, BrowserWindow, ipcMain, screen, safeStorage, globalShortcut } = require("electron");
const { spawn } = require("child_process");
const os = require("os");

let mainWindow = null;

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
  mainWindow = win;
}

// === LOGIN (Backend - credentials encrypted with OS Credential Manager) ===
// Default password for first-time enrollment. Can be rotated via TNO_DEFAULT_PASSWORD env var.
const DEFAULT_PASSWORD = process.env.TNO_DEFAULT_PASSWORD || "TNO2026!";

const VALID_USERS = [
  { user: "jcarrasco", name: "Juan Carrasco" },
  { user: "aeugene", name: "Antonia Eugene" },
  { user: "aperalta", name: "Audrey Luz Peralta Gonzalez" },
  { user: "bgomez", name: "Bryan de Jesus Gomez Martinez" },
  { user: "cgarcia", name: "Carolina Rosali Garcia Nunez" },
  { user: "ccabral", name: "Clary Sol Cabral Núñez" },
  { user: "fliriano", name: "Felix Oscar Liriano Martinez" },
  { user: "jjean", name: "Jacques Jean Elie" },
  { user: "jlamy", name: "Jacquise Lamy" },
  { user: "jline", name: "Jean Line" },
  { user: "jrony", name: "Jean Rony Alysiee" },
  { user: "jcapellan", name: "Jeremías Capellán Ramos" },
  { user: "jsantos", name: "Jose Andres Santos Castillo" },
  { user: "jchavez", name: "Julio Armando Yoy Chavez" },
  { user: "kwhaley", name: "Kayla Whaley" },
  { user: "mdelance", name: "Miguel Alberto Delance Mendoza" },
  { user: "ocruz", name: "Osiris Anael Cruz Ceballo" },
  { user: "ojacques", name: "Osse Jean Jacques" },
  { user: "sbaptiste", name: "Sabline Jean Baptiste" },
  { user: "sromelus", name: "Stanley Antoine Romelus" },
  { user: "sfrederic", name: "Stherlyne Ketty Nisha Frederic" },
  { user: "uevariste", name: "Ulrick Evariste" }
];

const CRED_FILE = path.join(os.homedir(), "Documents", "TNO_Vault", "credentials.enc");
const REMEMBER_FILE = path.join(os.homedir(), "Documents", "TNO_Vault", "session.enc");

function loadCredentials() {
  try {
    if (!fs.existsSync(CRED_FILE)) return {};
    const encrypted = fs.readFileSync(CRED_FILE);
    return JSON.parse(safeStorage.decryptString(encrypted));
  } catch (e) {
    console.error("Credential load error:", e);
    return {};
  }
}

function saveCredentials(creds) {
  const dir = path.dirname(CRED_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CRED_FILE, safeStorage.encryptString(JSON.stringify(creds)));
}

ipcMain.handle("check-user", async (event, username) => {
  const match = VALID_USERS.find(u => u.user === username.trim().toLowerCase());
  if (!match) return { exists: false };
  return { exists: true, name: match.name };
});

ipcMain.handle("setup-password", async (event, username, defaultPass, newPass) => {
  const match = VALID_USERS.find(u => u.user === username.trim().toLowerCase());
  if (!match) return { success: false, error: "User not found." };
  const creds = loadCredentials();
  if (creds[match.user]) {
    return { success: false, error: "Account already set up. Please sign in." };
  }
  if (defaultPass !== DEFAULT_PASSWORD) {
    return { success: false, error: "Invalid default password." };
  }
  creds[match.user] = newPass;
  saveCredentials(creds);
  return { success: true, name: match.name, username: match.user };
});

ipcMain.handle("login", async (event, user, pass) => {
  const username = user.trim().toLowerCase();
  const match = VALID_USERS.find(u => u.user === username);
  if (!match) return { success: false };
  const creds = loadCredentials();

  // Returning user with stored password
  if (creds[username]) {
    if (creds[username] === pass) return { success: true, name: match.name, username: match.user };
    return { success: false };
  }

  // First-time user: require default password to unlock setup
  if (pass === DEFAULT_PASSWORD) {
    return { success: false, requiresSetup: true, name: match.name, username: match.user };
  }
  return { success: false };
});

ipcMain.handle("change-password", async (event, username, currentPass, newPass) => {
  const creds = loadCredentials();
  if (creds[username] !== currentPass) return { success: false, error: "Current password is incorrect." };
  creds[username] = newPass;
  saveCredentials(creds);
  return { success: true };
});

ipcMain.handle("save-session", async (event, username, pass) => {
  try {
    const dir = path.dirname(REMEMBER_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(REMEMBER_FILE, safeStorage.encryptString(JSON.stringify({ username, pass })));
    return { success: true };
  } catch (e) { return { success: false }; }
});

ipcMain.handle("load-session", async () => {
  try {
    if (!fs.existsSync(REMEMBER_FILE)) return { exists: false };
    const data = JSON.parse(safeStorage.decryptString(fs.readFileSync(REMEMBER_FILE)));
    const match = VALID_USERS.find(u => u.user === data.username);
    if (!match) return { exists: false };
    const creds = loadCredentials();
    if (creds[data.username] === data.pass) {
      return { exists: true, name: match.name, username: match.user };
    }
    return { exists: false };
  } catch (e) { return { exists: false }; }
});

ipcMain.handle("clear-session", async () => {
  try { if (fs.existsSync(REMEMBER_FILE)) fs.unlinkSync(REMEMBER_FILE); } catch (e) {}
  return { success: true };
});

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

// === PASSWORD VAULT (Encrypted with OS Credential Manager) ===
const VAULT_DIR = path.join(os.homedir(), "Documents", "TNO_Vault");
const VAULT_FILE = path.join(VAULT_DIR, "vault.enc");

ipcMain.handle("vault-load", async () => {
  try {
    if (!fs.existsSync(VAULT_FILE)) return { success: true, entries: [] };
    const encrypted = fs.readFileSync(VAULT_FILE);
    const decrypted = safeStorage.decryptString(encrypted);
    return { success: true, entries: JSON.parse(decrypted) };
  } catch (error) {
    console.error("Vault load error:", error);
    return { success: true, entries: [] };
  }
});

ipcMain.handle("vault-save", async (event, entries) => {
  try {
    if (!fs.existsSync(VAULT_DIR)) fs.mkdirSync(VAULT_DIR, { recursive: true });
    const encrypted = safeStorage.encryptString(JSON.stringify(entries));
    fs.writeFileSync(VAULT_FILE, encrypted);
    return { success: true };
  } catch (error) {
    console.error("Vault save error:", error);
    return { success: false, error: error.message };
  }
});

// === OBTENER HISTORIAL CON PAGINACIÓN (Backend, async I/O) ===
ipcMain.handle("get-history", async (event, { page = 1, limit = 50 } = {}) => {
  try {
    const documentsPath = path.join(os.homedir(), "Documents", "TNO_Logs");

    try {
      await fs.promises.access(documentsPath);
    } catch {
      return { calls: [], total: 0, page, limit };
    }

    const files = (await fs.promises.readdir(documentsPath)).filter(f => f.endsWith('.json'));
    files.sort().reverse();

    let allCalls = [];
    for (const file of files) {
      try {
        const raw = await fs.promises.readFile(path.join(documentsPath, file), 'utf-8');
        const json = JSON.parse(raw);
        if (Array.isArray(json)) allCalls = allCalls.concat(json);
      } catch (err) {
        console.error("Error leyendo archivo:", file, err);
      }
      if (allCalls.length >= page * limit) break;
    }

    const total = allCalls.length;
    const start = (page - 1) * limit;
    return { calls: allCalls.slice(start, start + limit), total, page, limit };
  } catch (error) {
    console.error("Error obteniendo historial:", error);
    return { calls: [], total: 0, page, limit };
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

// Singleton clients — created once, reused across all requests
const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;
const supabase = (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null;

ipcMain.handle("ask-copilot", async (event, question) => {
  try {
    if (!genAI) return { content: "AI is not configured. Please check your .env file (GEMINI_API_KEY missing)." };

    // 1. Convert question to vector using Gemini
    const embeddingModel = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
    const result = await embeddingModel.embedContent(question);
    const queryEmbedding = result.embedding.values;

    // 2. Search Supabase database
    let contextText = "No direct company rules found in the manual for this specific query. Answer generally or ask the user for more clarification.";
    if (supabase) {
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
  if (!genAI) return { error: "AI is not configured." };

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
      continue;
    }
  }

  return { error: "Transcription unavailable. All models are busy, please try again in a moment." };
});

// === CALL NOTES (Encrypted storage + F9 arm/type via PowerShell SendKeys) ===
const NOTES_FILE = path.join(VAULT_DIR, "notes.enc");

ipcMain.handle("notes-load-custom", async () => {
  try {
    if (!fs.existsSync(NOTES_FILE)) return { success: true, data: { custom: [], overrides: {} } };
    const decrypted = safeStorage.decryptString(fs.readFileSync(NOTES_FILE));
    const parsed = JSON.parse(decrypted);
    if (!parsed.custom) parsed.custom = [];
    if (!parsed.overrides) parsed.overrides = {};
    return { success: true, data: parsed };
  } catch (error) {
    console.error("Notes load error:", error);
    return { success: true, data: { custom: [], overrides: {} } };
  }
});

ipcMain.handle("notes-save-custom", async (event, data) => {
  try {
    if (!fs.existsSync(VAULT_DIR)) fs.mkdirSync(VAULT_DIR, { recursive: true });
    fs.writeFileSync(NOTES_FILE, safeStorage.encryptString(JSON.stringify(data)));
    return { success: true };
  } catch (error) {
    console.error("Notes save error:", error);
    return { success: false, error: error.message };
  }
});

// Persistent PowerShell typer — spawned once at app start, keeps C# SendInput type
// loaded, and accepts JSON line-protocol requests over stdin. This eliminates the
// ~300-500ms cold-start + Add-Type compilation cost that happened on every keypress.
const PERSISTENT_TYPER_SCRIPT = `$src = @"
using System;
using System.Runtime.InteropServices;
using System.Collections.Generic;
public static class KS {
  [StructLayout(LayoutKind.Sequential)]
  public struct INPUT { public uint type; public IU u; }
  [StructLayout(LayoutKind.Explicit)]
  public struct IU {
    [FieldOffset(0)] public MI mi;
    [FieldOffset(0)] public KI ki;
    [FieldOffset(0)] public HI hi;
  }
  [StructLayout(LayoutKind.Sequential)]
  public struct KI { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Sequential)]
  public struct MI { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Sequential)]
  public struct HI { public uint uMsg; public ushort wParamL; public ushort wParamH; }
  [DllImport("user32.dll", SetLastError=true)]
  public static extern uint SendInput(uint n, INPUT[] p, int cb);
  public static void Type(string s) {
    var list = new List<INPUT>();
    foreach (char c in s) {
      if (c == '\\r') continue;
      if (c == '\\n') {
        list.Add(new INPUT { type = 1, u = new IU { ki = new KI { wVk = 0x0D } } });
        list.Add(new INPUT { type = 1, u = new IU { ki = new KI { wVk = 0x0D, dwFlags = 0x0002 } } });
      } else {
        list.Add(new INPUT { type = 1, u = new IU { ki = new KI { wScan = (ushort)c, dwFlags = 0x0004 } } });
        list.Add(new INPUT { type = 1, u = new IU { ki = new KI { wScan = (ushort)c, dwFlags = 0x0004 | 0x0002 } } });
      }
    }
    if (list.Count > 0) SendInput((uint)list.Count, list.ToArray(), Marshal.SizeOf(typeof(INPUT)));
  }
}
"@
Add-Type -TypeDefinition $src -Language CSharp
$stdin = [Console]::OpenStandardInput()
$reader = New-Object System.IO.StreamReader($stdin, [System.Text.Encoding]::UTF8)
[Console]::Out.WriteLine('{"ready":true}')
[Console]::Out.Flush()
while ($true) {
  $line = $reader.ReadLine()
  if ($null -eq $line) { break }
  if ([string]::IsNullOrWhiteSpace($line)) { continue }
  try {
    $req = $line | ConvertFrom-Json
    if ($req.text -ne $null) {
      Start-Sleep -Milliseconds 30
      [KS]::Type([string]$req.text)
      [Console]::Out.WriteLine('{"ok":true}')
    } else {
      [Console]::Out.WriteLine('{"ok":false,"error":"missing text"}')
    }
  } catch {
    [Console]::Out.WriteLine('{"ok":false,"error":"Type failed"}')
  }
  [Console]::Out.Flush()
}`;

let psTyper = null;
let psTyperReady = false;
let psTyperQueue = [];  // pending { resolve, reject }
let psStdoutBuf = "";

function startPsTyper() {
  if (psTyper) return;
  try {
    const encoded = Buffer.from(PERSISTENT_TYPER_SCRIPT, "utf16le").toString("base64");
    psTyper = spawn("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true
    });
    psTyper.stdout.setEncoding("utf8");
    psTyper.stdout.on("data", (chunk) => {
      psStdoutBuf += chunk;
      let idx;
      while ((idx = psStdoutBuf.indexOf("\n")) >= 0) {
        const line = psStdoutBuf.substring(0, idx).trim();
        psStdoutBuf = psStdoutBuf.substring(idx + 1);
        if (!line) continue;
        if (line.indexOf('"ready"') >= 0) { psTyperReady = true; continue; }
        const cb = psTyperQueue.shift();
        if (!cb) continue;
        try {
          const res = JSON.parse(line);
          if (res.ok) cb.resolve();
          else cb.reject(new Error(res.error || "Type failed"));
        } catch (e) {
          cb.reject(new Error("Bad typer response: " + line));
        }
      }
    });
    psTyper.stderr.on("data", (d) => console.error("PS typer stderr:", d.toString()));
    psTyper.on("close", (code) => {
      console.warn("PS typer exited with code", code);
      psTyper = null;
      psTyperReady = false;
      while (psTyperQueue.length) {
        const cb = psTyperQueue.shift();
        cb.reject(new Error("PowerShell typer closed"));
      }
      psStdoutBuf = "";
    });
    psTyper.on("error", (err) => {
      console.error("PS typer error:", err);
      psTyper = null;
      psTyperReady = false;
    });
  } catch (err) {
    console.error("Failed to start PS typer:", err);
    psTyper = null;
    psTyperReady = false;
  }
}

function stopPsTyper() {
  if (!psTyper) return;
  try { psTyper.stdin.end(); } catch (e) {}
  try { psTyper.kill(); } catch (e) {}
  psTyper = null;
  psTyperReady = false;
  psStdoutBuf = "";
}

function typeViaPowerShell(text) {
  return new Promise((resolve, reject) => {
    if (!psTyper) startPsTyper();
    if (!psTyper) return reject(new Error("Typer unavailable"));
    const enqueue = () => {
      psTyperQueue.push({ resolve, reject });
      try {
        psTyper.stdin.write(JSON.stringify({ text }) + "\n");
      } catch (err) {
        psTyperQueue.pop();
        reject(err);
      }
    };
    if (psTyperReady) {
      enqueue();
    } else {
      // Wait up to 3s for typer to become ready
      const deadline = Date.now() + 3000;
      const poll = () => {
        if (psTyperReady) return enqueue();
        if (!psTyper) return reject(new Error("Typer died before ready"));
        if (Date.now() > deadline) return reject(new Error("Typer init timeout"));
        setTimeout(poll, 30);
      };
      poll();
    }
  });
}

let armedNoteText = null;
let armedShortcut = null;

function disarmInternal() {
  if (armedShortcut) {
    try { globalShortcut.unregister(armedShortcut); } catch (e) {}
  }
  armedShortcut = null;
  armedNoteText = null;
}

ipcMain.handle("notes-arm", async (event, { text, shortcut }) => {
  try {
    disarmInternal();
    const key = shortcut || "F9";
    armedNoteText = text;
    armedShortcut = key;

    const ok = globalShortcut.register(key, async () => {
      if (!armedNoteText) return;
      // Prevent typing into our own app if it's focused
      const focused = BrowserWindow.getFocusedWindow();
      if (focused && focused === mainWindow) {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("note-type-skipped");
        }
        return;
      }
      const textToType = armedNoteText;
      try {
        await typeViaPowerShell(textToType);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("note-typed");
        }
      } catch (err) {
        console.error("SendKeys error:", err);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("note-type-error", err.message);
        }
      }
      disarmInternal();
    });

    if (!ok) {
      disarmInternal();
      return { success: false, error: `Shortcut ${key} is already in use by another application.` };
    }
    return { success: true };
  } catch (error) {
    console.error("Arm note error:", error);
    disarmInternal();
    return { success: false, error: error.message };
  }
});

ipcMain.handle("notes-disarm", async () => {
  disarmInternal();
  return { success: true };
});

// Periodic memory log — cheap leak detector. Runs every 10 min, appends rss/heap to a log.
let memoryLogInterval = null;
function startMemoryLog() {
  if (memoryLogInterval) return;
  memoryLogInterval = setInterval(() => {
    try {
      const mem = process.memoryUsage();
      const line = `${new Date().toISOString()} rss=${Math.round(mem.rss/1048576)}MB heap=${Math.round(mem.heapUsed/1048576)}MB ext=${Math.round(mem.external/1048576)}MB\n`;
      const dir = path.join(os.homedir(), "Documents", "TNO_Logs");
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(path.join(dir, "memory.log"), line);
    } catch (e) { /* swallow */ }
  }, 10 * 60 * 1000);
}

// === CICLO DE VIDA DE LA APP ===
app.whenReady().then(() => {
  createWindow();
  startPsTyper();       // keep PS loaded so first type is fast
  startMemoryLog();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  stopPsTyper();
  if (memoryLogInterval) { clearInterval(memoryLogInterval); memoryLogInterval = null; }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});