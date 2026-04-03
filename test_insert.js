require("dotenv").config();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { createClient } = require("@supabase/supabase-js");

async function run() {
  try {
    console.log("Testing Gemini...");
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const embeddingModel = genAI.getGenerativeModel({ model: "text-embedding-004" });
    const result = await embeddingModel.embedContent("Hello world");
    const embedding = result.embedding.values;
    console.log("Gemini success. Vector size:", embedding.length);

    console.log("Testing Supabase...");
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await supabase.from("knowledge_chunks").insert({
      content: "Hello", source: "test", embedding
    }).select();
    
    if (error) {
      console.error("Supabase error:", JSON.stringify(error, null, 2));
    } else {
      console.log("Supabase insertion success! Data:", data);
    }
  } catch (e) { 
    console.error("Fatal error:", e); 
  }
}
run();
