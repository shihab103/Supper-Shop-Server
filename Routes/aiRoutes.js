const express = require("express");
const router = express.Router();
const { GoogleGenAI } = require("@google/genai"); 
const axios = require("axios");

const SHOP_API_BASE_URL = "https://supper-shop-plum.vercel.app/all-products";

const ai = new GoogleGenAI({}); 

async function fetchShopData(query) {
    console.log(`🔍 Searching external shop database for: ${query}`);
    try {
        const response = await axios.get(SHOP_API_BASE_URL);

        const products = Array.isArray(response.data) ? response.data : [];

        if (!products || products.length === 0) {
            return "NO_PRODUCTS_FOUND_INVENTORY_EMPTY"; 
        }

        const filtered = products.filter((p) =>
            JSON.stringify(p).toLowerCase().includes(query.toLowerCase())
        );

        const dataToReturn = filtered.length > 0 ? filtered : products;
        
        return JSON.stringify(dataToReturn);

    } catch (error) {
        console.error("❌ Error fetching data:", error.message);
        return "DATABASE_SYSTEM_OFFLINE_ERROR";
    }
}

router.post("/chat", async (req, res) => {
    const { prompt, history = [] } = req.body; 

    if (!prompt) {
        return res.status(400).send({ error: "Prompt is required" });
    }

    let productData = "";

    const keywords = ["আছে", "কি কি", "দাম", "স্টক", "available", "মূল্য", "products"];
    const needsData = keywords.some((kw) => prompt.toLowerCase().includes(kw));

    if (needsData) {
        productData = await fetchShopData(prompt);
    }
    
    let ragContext = "";
    
    if (productData === "DATABASE_SYSTEM_OFFLINE_ERROR") {
        ragContext = "ERROR: সার্ভার সমস্যার কারণে এই মুহূর্তে স্টকের তথ্য সংগ্রহ করা যাচ্ছে না। অনুগ্রহ করে পরে আবার চেষ্টা করুন।";
    } else if (productData === "NO_PRODUCTS_FOUND_INVENTORY_EMPTY") {
        ragContext = "WARNING: দুঃখিত, আমাদের ইনভেন্টরি বর্তমানে খালি অথবা এই কোয়েরির সাথে মেলে এমন কোনো পণ্য পাওয়া যায়নি।";
    } else {
        ragContext = productData;
    }
    
    const initialGreeting = history.length === 0 
        ? "আসসালামু আলাইকুম! আমি আপনার সুপার শপের গ্রাহক সহায়ক AI। "
        : "";

    const systemInstruction = `
        তুমি একটি সুপার শপের গ্রাহক সহায়ক AI এজেন্ট। তুমি শুধুমাত্র বাংলাতে উত্তর দেবে। 
        তুমি অবশ্যই বিনয়ী, ইসলামী সংস্কৃতি সম্মানকারী এবং সহায়ক হবে। 
        
        ${initialGreeting} তোমার প্রধান কাজ হলো গ্রাহককে কেনাকাটায় সাহায্য করা।
        
        তোমার কাছে নিম্নলিখিত ডেটাবেস তথ্য (Product Database Data) আছে:
        ---
        ${ragContext}
        ---
        
        এই তথ্যের উপর ভিত্তি করে ব্যবহারকারীর প্রশ্নের উত্তর দাও। 
        
        * তোমার প্রথম উত্তরটি যদি "${initialGreeting}" দিয়ে শুরু হয়, তবে **পরবর্তী কোনো উত্তরে এই বা অন্য কোনো শুভেচ্ছা বাক্য আর ব্যবহার করবে না**। (অর্থাৎ, দ্বিতীয় উত্তর থেকে কেবল প্রয়োজনীয় তথ্য দেবে)
        * যদি ডেটাবেস তথ্যে কোনো ERROR বা WARNING থাকে, তবে অবশ্যই সেই বার্তাটির উপর ভিত্তি করে গ্রাহককে বিনয়ের সাথে উত্তর দাও। কোনো JSON ডেটা দেখাবে না।
        * যদি তথ্যটি JSON ফরম্যাটে থাকে, তবে সেই তথ্যের উপর ভিত্তি করে স্পষ্ট এবং সহজবোধ্য ভাষায় পণ্য বা মূল্য সম্পর্কে ব্যাখ্যা করো।
        * যদি তথ্যের প্রয়োজন না হয় বা কোনো পণ্য খুঁজে না পাও, তবে বিনয়ের সাথে বলো যে তুমি সেই তথ্য এই মুহূর্তে দিতে পারছ না।
    `;

    const contents = [
        ...history, 
        {
            role: "user",
            parts: [{ text: prompt }],
        },
    ];

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            config: {
                systemInstruction: systemInstruction,
            },
            contents: contents, 
        });

        const modelResponseText = response.text;

        res.send({
            success: true,
            data: modelResponseText, 
            newHistory: [...contents, { role: "model", parts: [{ text: modelResponseText }] }]
        });
    } catch (err) {
        console.error("Gemini API error:", err);
        res.status(500).send({
            success: false,
            error: "Failed to fetch AI response from Gemini. Check API Key and server logs.",
            details: err.message,
        });
    }
});

module.exports = router;