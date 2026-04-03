require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const mammoth = require("mammoth");
const xlsx = require("xlsx");

// Inicializar clientes
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const embeddingModel = genAI.getGenerativeModel({ model: "gemini-embedding-001" });

const KNOWLEDGE_DIR = path.join(__dirname, "knowledge_base");
const CHUNK_SIZE = 500; // palabras por extracto
const OVERLAP = 50; // palabras de superposición

// --- 1. LECTURA DE ARCHIVOS ---

const pdfParse = require("pdf-parse-new");

async function readPdf(filePath) {
  const dataBuffer = fs.readFileSync(filePath);
  const data = await pdfParse(dataBuffer);
  return data.text;
}

async function readWord(filePath) {
  const result = await mammoth.extractRawText({ path: filePath });
  return result.value;
}

function readExcel(filePath) {
  const workbook = xlsx.readFile(filePath);
  let text = "";
  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet);
    data.forEach((row) => {
      text += JSON.stringify(row) + "\n";
    });
  });
  return text;
}

function readTextDocument(filePath) {
  return fs.readFileSync(filePath, "utf-8");
}

async function extractTextFromFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  try {
    if (ext === ".pdf") return await readPdf(filePath);
    if (ext === ".docx") return await readWord(filePath);
    if (ext === ".xlsx" || ext === ".xls") return readExcel(filePath);
    if (ext === ".txt" || ext === ".md" || ext === ".csv") return readTextDocument(filePath);
    console.warn(`Formato no soportado: ${ext}. Omitiendo ${filePath}`);
    return "";
  } catch (error) {
    console.error(`Error leyendo ${filePath}:`, error.message);
    return "";
  }
}

// --- 2. FRAGMENTACIÓN (CHUNKING) ---

function chunkText(text, source) {
  const words = text.replace(/\s+/g, ' ').split(" ");
  const chunks = [];
  
  for (let i = 0; i < words.length; i += (CHUNK_SIZE - OVERLAP)) {
    const chunkWords = words.slice(i, i + CHUNK_SIZE);
    if (chunkWords.length > 50) { // Ignorar fragmentos muy pequeños
      chunks.push({
        content: chunkWords.join(" "),
        source: source
      });
    }
  }
  return chunks;
}

// --- 3. VECTORIZACIÓN (EMBEDDINGS) Y SUBIDA ---

async function processAndUploadChunks(chunks) {
  console.log(`Procesando ${chunks.length} fragmentos...`);
  
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    console.log(`Generando embedding ${i + 1}/${chunks.length} (${chunk.source})...`);
    
    try {
      // Evitar Rate Limits reduciendo la velocidad si es super necesario, pero Gemini ofrece 1500 RPD
      await new Promise(r => setTimeout(r, 1500));
      
      // Usar modelo Gemini text-embedding-004
      const result = await embeddingModel.embedContent(chunk.content);
      const embedding = result.embedding.values;

      // Subir a Supabase
      const { error } = await supabase
        .from("knowledge_chunks")
        .insert({
          content: chunk.content,
          source: chunk.source,
          embedding: embedding
        });

      if (error) {
        console.error(`Error guardando fragmento ${i} en DB:`, error.message);
      }
    } catch (error) {
       console.error(`Error generando embedding para fragmento ${i}:`, error.message);
    }
  }
}

// --- SCRIPT PRINCIPAL ---

async function runIngestion() {
  console.log("=== INICIANDO INGESTA DE CONOCIMIENTO ===");
  
  if (!fs.existsSync(KNOWLEDGE_DIR)) {
    console.log("Creando carpeta knowledge_base...");
    fs.mkdirSync(KNOWLEDGE_DIR);
  }

  const files = fs.readdirSync(KNOWLEDGE_DIR);
  if (files.length === 0) {
    console.log("❌ No hay archivos en la carpeta knowledge_base.");
    console.log("Por favor, coloca tus PDFs, Excels y Words ahí y vuelve a correr el script.");
    return;
  }

  let allChunks = [];

  for (const file of files) {
    const filePath = path.join(KNOWLEDGE_DIR, file);
    if (fs.statSync(filePath).isDirectory()) continue;
    
    console.log(`📄 Leyendo ${file}...`);
    const text = await extractTextFromFile(filePath);
    
    if (text.trim().length > 0) {
      const chunks = chunkText(text, file);
      console.log(`✅ Extraídos ${chunks.length} fragmentos de ${file}`);
      allChunks = allChunks.concat(chunks);
    }
  }

  console.log(`\n🚀 Subiendo ${allChunks.length} fragmentos totales a Supabase/VoyageAI...`);
  await processAndUploadChunks(allChunks);
  console.log("🎉 ¡Proceso completado con éxito!");
}

runIngestion();
