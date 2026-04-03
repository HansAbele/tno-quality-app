require("dotenv").config();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { createClient } = require("@supabase/supabase-js");
const Anthropic = require("@anthropic-ai/sdk");

async function testCopilot(question) {
  try {
    console.log("1. Vectorizing question with Gemini...");
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const embeddingModel = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
    const result = await embeddingModel.embedContent(question);
    const queryEmbedding = result.embedding.values;
    console.log("   Done. Dimensions:", queryEmbedding.length);

    console.log("2. Searching Supabase...");
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data: documents, error } = await supabase.rpc("match_chunks", {
      query_embedding: queryEmbedding,
      match_threshold: 0.5,
      match_count: 3
    });

    if (error) throw error;
    console.log("   Done. Found chunks:", documents ? documents.length : 0);

    let contextText = "No direct company rules found in the manual for this specific query. Answer generally or ask the user for more clarification.";
    if (documents && documents.length > 0) {
      contextText = documents.map(doc => `DOCUMENT SNIPPET (Source: ${doc.source}):\n${doc.content}`).join("\n\n---\n\n");
    }

    console.log("3. Asking Google Gemini...");
    const aiModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const prompt = `You are the TNO Quality Companion Copilot. You assist call center billing agents with medical billing procedures, protocols, and company rules. Answer the agent's question STRICTLY based on the provided DOCUMENT SNIPPET(s). Do not invent rules. If the answer is not in the context, say you don't know based on the manuals. Keep responses highly professional, concise, and focused on operational instructions.\n\nHere is your knowledge context:\n${contextText}\n\nAgent's Question: ${question}`;
    
    const resultResponse = await aiModel.generateContent(prompt);
    console.log("   Done! Gemini answered:");
    console.log(resultResponse.response.text());

  } catch (error) {
    console.error("DEBUG ERROR: Error saved to error.json");
    require("fs").writeFileSync("error.json", JSON.stringify(error, null, 2));
  }
}

testCopilot("El paciente me llamo y me dijo que el claim tiene un denial code co45");
