import { GoogleGenAI } from "@google/genai";

export default async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,PATCH,DELETE,POST,PUT");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization"
  );

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  const geminiApiKey = process.env.GEMINI_API_KEY?.trim();
  if (!geminiApiKey) {
    return res.status(503).json({
      error: "Missing GEMINI_API_KEY in Vercel environment. Please configure GEMINI_API_KEY under Project Settings -> Environment Variables in your Vercel Dashboard."
    });
  }

  try {
    const ai = new GoogleGenAI({ apiKey: geminiApiKey });
    const expireTime = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const newSessionExpireTime = new Date(Date.now() + 60 * 1000).toISOString();

    const token = await ai.authTokens.create({
      config: {
        uses: 1,
        expireTime,
        newSessionExpireTime,
        liveConnectConstraints: {
          model: "gemini-3.8-live",
          config: {
            responseModalities: ["AUDIO"],
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            sessionResumption: {}
          }
        }
      }
    });

    return res.status(200).json({
      token: token.name,
      expiresAt: expireTime
    });
  } catch (error) {
    console.error("Vercel Live token creation error:", error?.message || error);
    return res.status(500).json({
      error: "Could not create a Live API token. Please check your Gemini API key, model quota, and account permissions."
    });
  }
}
