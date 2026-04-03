require("dotenv").config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

async function checkDims() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  
  try {
    const model1 = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
    const res1 = await model1.embedContent("Test string 123");
    console.log("gemini-embedding-001 works. Dimensions:", res1.embedding.values.length);
  } catch(e) { console.log("gemini-embedding-001 failed", e.message); }

  try {
    const model2 = genAI.getGenerativeModel({ model: "gemini-embedding-2-preview" });
    const res2 = await model2.embedContent("Test string 123");
    console.log("gemini-embedding-2-preview works. Dimensions:", res2.embedding.values.length);
  } catch(e) { console.log("gemini-embedding-2-preview failed", e.message); }
}

checkDims();
