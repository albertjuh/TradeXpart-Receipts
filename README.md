# tradexparts - Receipt Management

A high-performance receipt management system for trade and parts logistics, powered by AI OCR.

## Features

- **AI OCR**: Automatically extracts store name, total amount, date, and category from receipt images using Gemini 1.5 Flash.
- **Google Drive Integration**: Syncs receipts directly from a `tradexparts` folder in your Google Drive.
- **n8n Webhook**: Support for automated data ingestion via webhooks.
- **Real-time Updates**: Frontend automatically reflects changes in your receipt collection.

## Setup Instructions

### 1. Project Configuration
Ensure the following environment variables are set (you can use AI Studio Secrets for development):

- `GEMINI_API_KEY`: Your Google AI SDK key.
- `GOOGLE_CLIENT_ID`: Google OAuth 2.0 Client ID.
- `GOOGLE_CLIENT_SECRET`: Google OAuth 2.0 Client Secret.
- `APP_URL`: The base URL of your deployed application (required for OAuth redirect).

### 2. Google OAuth Setup
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create or select a project.
3. Enable the **Google Drive API**.
4. Configure the OAuth Consent Screen (Internal or External).
5. Create OAuth 2.0 Client IDs (Web application).
6. Add the following Authorized Redirect URI:
   - `${APP_URL}/api/auth/google/callback`

### 3. Google Drive Sync
1. Connect your Google account via the "Connect Google Drive" button in the app.
2. In your Google Drive, create a folder named `Receipt`.
3. Drag and drop receipt images (JPG/PNG) into that folder.
4. Click "Sync Drive" in the app to process new receipts.

### 4. n8n Integration
You can send receipt data to the app via POST requests to:
`${APP_URL}/api/webhook/n8n`

Payload format:
```json
{
  "storeName": "Starbucks",
  "amount": 15000,
  "date": "2024-04-20",
  "category": "Food",
  "notes": "Afternoon coffee",
  "imageUrl": "https://example.com/receipt.jpg"
}
```

## Local Development

```bash
npm install
npm run dev
```

The app will be available at `http://localhost:3000`.

## Deployment

This app is ready for deployment to Cloud Run (automatically handled by AI Studio) or Vercel.
For Vercel, use the provided `vercel.json` and ensure environment variables are configured in the Vercel Dashboard.
