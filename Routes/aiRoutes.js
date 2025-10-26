const express = require("express");
const router = express.Router();
const { GoogleGenAI } = require("@google/genai"); 


const ai = new GoogleGenAI({});

// 🧩 POST /api/ai/chat
router.post("/chat", async (req, res) => {
    const { prompt } = req.body;

    console.log("Received prompt:", prompt);

    if (!prompt) {
        return res.status(400).send({ error: "Prompt is required" });
    }

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash", 
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: {
            }
        });
        const textResponse = response.text;
        
        res.send({
            success: true,
            data: textResponse,
        });

    } catch (err) {
        console.error("Gemini API error:", err);
        // 🚨 Other errors
        res.status(500).send({
            success: false,
            error: "Failed to fetch AI response from Gemini",
            details: err.message,
        });
    }
});

module.exports = router;