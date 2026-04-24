console.log("[Server] Initializing...");
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { google } from "googleapis";
import cookieParser from "cookie-parser";
import { randomUUID } from "node:crypto";
import "dotenv/config";
import { GoogleGenAI, Type } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

async function extractReceiptData(base64Image: string, mimeType: string) {
  const model = "gemini-1.5-flash";
  const prompt = "Extract the store name, total amount (in Tanzanian Shillings), date, and suggest a category (Food, Transport, Business, Shopping, Utilities, Other) from this receipt. Return the data in JSON format. Ensure the amount is a number representing TZS.";

  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inlineData: {
              data: base64Image,
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

  return JSON.parse(response.text || "{}");
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  app.use(cookieParser());

  // Google OAuth Configuration
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.APP_URL || "http://localhost:3000"}/api/auth/google/callback`
  );

  const SCOPES = ["https://www.googleapis.com/auth/drive.readonly"];

  // In-memory store for receipts
  let receipts: any[] = [];

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.get("/api/receipts", (req, res) => {
    res.json(receipts);
  });

  app.post("/api/receipts/analyze", async (req, res) => {
    const { image, mimeType } = req.body;
    if (!image) return res.status(400).json({ error: "Missing image data" });

    try {
      const base64 = image.split(",")[1] || image;
      const extractedData = await extractReceiptData(base64, mimeType || "image/jpeg");
      res.json(extractedData);
    } catch (error) {
      console.error("Analysis error:", error);
      res.status(500).json({ error: "Failed to analyze receipt" });
    }
  });

  app.post("/api/receipts", (req, res) => {
    try {
      const newReceipt = {
        id: randomUUID(),
        ...req.body,
        createdAt: new Date().toISOString()
      };
      receipts.push(newReceipt);
      res.status(201).json(newReceipt);
    } catch (error) {
      console.error("Error creating receipt:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // Google Auth Endpoints
  app.get("/api/auth/google", (req, res) => {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return res.status(400).json({ error: "Google OAuth credentials not configured." });
    }
    const url = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: SCOPES,
    });
    res.redirect(url);
  });

  app.get("/api/auth/google/callback", async (req, res) => {
    const { code } = req.query;
    try {
      const { tokens } = await oauth2Client.getToken(code as string);
      res.cookie("google_tokens", JSON.stringify(tokens), { httpOnly: true });
      res.redirect("/");
    } catch (error) {
      console.error("Error getting tokens", error);
      res.redirect("/?error=auth_failed");
    }
  });

  app.get("/api/auth/status", (req, res) => {
    const tokens = req.cookies.google_tokens;
    res.json({ connected: !!tokens });
  });

  // Drive Scanning Endpoint
  app.post("/api/drive/scan", async (req, res) => {
    const tokensStr = req.cookies.google_tokens;
    if (!tokensStr) return res.status(401).json({ error: "Not connected to Google Drive" });

    const tokens = JSON.parse(tokensStr);
    oauth2Client.setCredentials(tokens);

    const drive = google.drive({ version: "v3", auth: oauth2Client });

    try {
      // 1. Find or create "tradexparts" folder
      const folderResponse = await drive.files.list({
        q: "name = 'tradexparts' and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
        fields: "files(id, name)",
      });

      let folderId = folderResponse.data.files?.[0]?.id;

      if (!folderId) {
        return res.json({ message: "No 'tradexparts' folder found. Please create one in your Drive and add receipts." });
      }

      // 2. List images in that folder
      const filesResponse = await drive.files.list({
        q: `'${folderId}' in parents and (mimeType = 'image/jpeg' or mimeType = 'image/png') and trashed = false`,
        fields: "files(id, name, mimeType, webContentLink, thumbnailLink)",
      });

      const files = filesResponse.data.files || [];
      
      // Process files in parallel for better performance
      const newFiles = files.filter(file => !receipts.some(r => r.driveFileId === file.id));
      
      const processedReceipts = await Promise.all(newFiles.map(async (file) => {
        try {
          // Fetch file content
          const response = await drive.files.get(
            { fileId: file.id!, alt: 'media' },
            { responseType: 'arraybuffer' }
          );

          const buffer = Buffer.from(response.data as ArrayBuffer);
          const base64 = buffer.toString('base64');
          const mimeType = file.mimeType || 'image/jpeg';

          // Process with Gemini
          const extractedData = await extractReceiptData(base64, mimeType);

          return {
            id: randomUUID(),
            ...extractedData,
            driveFileId: file.id,
            imageUrl: `data:${mimeType};base64,${base64}`,
            createdAt: new Date().toISOString(),
            source: "Google Drive"
          };
        } catch (fileError) {
          console.error(`[AI] Error processing file ${file.name}:`, fileError);
          return null;
        }
      }));

      // Filter out failures and add to store
      const successfulReceipts = processedReceipts.filter(r => r !== null) as any[];
      receipts.push(...successfulReceipts);
      
      res.json({ 
        message: successfulReceipts.length > 0 
          ? `Successfully processed ${successfulReceipts.length} new receipts from Drive.` 
          : "No new receipts found to process.",
        processedCount: successfulReceipts.length
      });

    } catch (error) {
      console.error("Drive scan error", error);
      res.status(500).json({ error: "Failed to scan Drive" });
    }
  });

  // n8n Webhook Endpoint
  app.post("/api/webhook/n8n", (req, res) => {
    try {
      const newReceipt = {
        id: randomUUID(),
        storeName: req.body.storeName || "n8n Receipt",
        amount: Number(req.body.amount) || 0,
        date: req.body.date || new Date().toISOString(),
        category: req.body.category || "Other",
        notes: req.body.notes || "Imported from n8n",
        imageUrl: req.body.imageUrl || "",
        createdAt: new Date().toISOString(),
        source: "n8n"
      };
      receipts.push(newReceipt);
      res.status(200).json({ status: "success", received: newReceipt });
    } catch (error) {
      console.error("Webhook error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  app.delete("/api/receipts/:id", (req, res) => {
    const { id } = req.params;
    receipts = receipts.filter(r => r.id !== id);
    res.status(204).send();
  });

  // 404 handler for API routes
  app.all("/api/*", (req, res) => {
    res.status(404).json({ error: "API Route Not Found" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] Listening on http://0.0.0.0:${PORT}`);
    console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`[Server] App URL: ${process.env.APP_URL || 'not set'}`);
  });
}

startServer().catch(err => {
  console.error("[Server] Critical startup error:", err);
  process.exit(1);
});
