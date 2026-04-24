import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface ReceiptData {
  storeName: string;
  amount: number;
  date: string;
  category: string;
  notes: string;
}

export async function extractReceiptData(base64Image: string, mimeType: string): Promise<ReceiptData> {
  const model = "gemini-3-flash-preview";
  
  const prompt = "Extract the store name, total amount (in Tanzanian Shillings), date, and suggest a category (Food, Transport, Business, Shopping, Utilities, Other) from this receipt. Return the data in JSON format. Ensure the amount is a number representing TZS.";

  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inlineData: {
              data: base64Image.split(",")[1] || base64Image,
              mimeType
            }
          }
        ]
      }
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          storeName: { type: Type.STRING },
          amount: { type: Type.NUMBER },
          date: { type: Type.STRING, description: "ISO 8601 format" },
          category: { type: Type.STRING },
          notes: { type: Type.STRING }
        },
        required: ["storeName", "amount", "date", "category"]
      }
    }
  });

  try {
    return JSON.parse(response.text || "{}") as ReceiptData;
  } catch (e) {
    console.error("Failed to parse Gemini response", e);
    throw new Error("Failed to extract data from receipt");
  }
}
