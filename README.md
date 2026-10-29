# GlobalTalk AI — Multilingual Voice Coach

A premium, voice-first AI language-learning and business conversation platform powered by the **Google Gemini Live API** (`gemini-3.8-live`). Designed for professionals, entrepreneurs, and global learners to build real conversational fluency and client acquisition confidence.

---

## 🌟 Key Features

- **15 Global Language & Market Profiles**:
  - US, UK, Australian, Canadian, and New Zealand English
  - Singapore International Business English
  - German, French, Spanish, Italian, and Brazilian Portuguese
  - Japanese, Mandarin Chinese, Russian, and Gulf Arabic
- **Real-Time Bidirectional Voice**: Ultra-low-latency conversational audio streaming using the Gemini Live API (`@google/genai`) with live transcription and audio playback.
- **Adaptive AI Tutor**: Dynamic CEFR level calibration (A0 Absolute Beginner through C2 Mastery), proactive questioning, contextual role-playing, and real-time grammar modeling.
- **Practice Scenarios**:
  - *Daily conversation*: Relaxed fluency and everyday idioms
  - *Win a client*: Discovery calls, pitching Askus Studio agency services, handling budget objections, and contract negotiation
  - *Job interview*: Behavioral questions and technical articulation
  - *Travel & culture*: Navigating transit, hospitality, and local etiquette
  - *Level assessment*: Structured multi-turn CEFR level assessment
- **Analytics & Milestone Tracking**: Practice minutes, session turn count, consistency streak, and 12-month strategic roadmap.
- **Dual-Mode Persistence**:
  - **Local Mode (Default)**: Fully functional without cloud dependencies; sessions are safely preserved in browser `localStorage`.
  - **Cloud Sync (Optional)**: Google Authentication + Cloud Firestore multi-device synchronization when Firebase credentials are provided.
- **Production-Ready Single Service Architecture**:
  - Express.js backend provides secure short-lived ephemeral token minting (GEMINI_API_KEY never leaks to the client).
  - In production, Express automatically serves the built Vite frontend with client-side SPA fallback.

---

## 🏗️ Architecture & Security

```
┌────────────────────────────────────────────────────────┐
│                   Client Browser                       │
│    React 19 + Vite + Modern Inter UI Design System     │
└───────────┬────────────────────────────────────────────┘
            │ 1. POST /api/live-token
            ▼
┌────────────────────────────────────────────────────────┐
│               Express Production Server                │
│  - Mint short-lived ephemeral Live API tokens         │
│  - Rate limiting & security headers                    │
│  - Static asset serving (dist/)                        │
│  - GEMINI_API_KEY kept strictly server-side            │
└───────────┬────────────────────────────────────────────┘
            │ 2. Authenticates with Gemini API
            ▼
┌────────────────────────────────────────────────────────┐
│               Google Gemini Live API                   │
│  - Model: gemini-3.8-live                              │
│  - Bi-directional 16kHz PCM audio streaming           │
└────────────────────────────────────────────────────────┘
```

---

## ⚙️ Prerequisites

- **Node.js**: Version 20.x or 22.x+ recommended.
- **Gemini API Key**: Obtainable from [Google AI Studio](https://aistudio.google.com/).
- **(Optional) Firebase Project**: For Google sign-in and Cloud Firestore sync.

---

## 🚀 Local Development Setup

### 1. Clone or Open the Repository
```bash
git clone https://github.com/<your-username>/globaltalk-ai.git
cd globaltalk-ai
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Open `.env` and fill in your Gemini API Key:
```env
GEMINI_API_KEY=your_actual_gemini_api_key_here
PORT=8787
NODE_ENV=development
```
*(Firebase variables are completely optional; leave them blank to use local storage mode).*

### 3. Install Dependencies
```bash
npm install
```

### 4. Start the Development Servers

**Option A — Running both servers in separate terminals (recommended for active development):**

*Terminal 1 (Token Server):*
```bash
npm run server
```

*Terminal 2 (Vite Frontend with Hot Reload):*
```bash
npm run dev
```
Open `http://localhost:5173` in your browser.

**Option B — Running Full Production Build Locally:**
```bash
npm run build
npm start
```
Open `http://localhost:8787` in your browser.

---

## 🔑 Environment Variables Reference

| Variable | Scope | Required | Description |
| :--- | :--- | :--- | :--- |
| `GEMINI_API_KEY` | Server | **Yes** | Secret Gemini API key used to mint ephemeral Live API tokens. |
| `PORT` | Server | No (Default: `8787`) | Port on which the Express server listens. |
| `NODE_ENV` | Server | No | Set to `production` in production environments. |
| `CLIENT_URL` | Server | No | Optional comma-separated CORS allowed origins if hosting separately. |
| `VITE_API_URL` | Client | No | Optional API URL if client and backend are on different domains. |
| `VITE_FIREBASE_API_KEY` | Client | No | Firebase Web API Key for cloud sync. |
| `VITE_FIREBASE_AUTH_DOMAIN` | Client | No | Firebase Auth Domain. |
| `VITE_FIREBASE_PROJECT_ID` | Client | No | Firebase Project ID. |
| `VITE_FIREBASE_APP_ID` | Client | No | Firebase App ID. |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Client | No | Firebase Messaging Sender ID. |

---

## 🌐 Deploying to Render

This project is pre-configured with a `render.yaml` Blueprint to run as a unified Web Service on Render (building the React app and serving it through Express).

### Step-by-Step Render Deployment:
1. **Push your code to GitHub** (see GitHub section below).
2. Log in to your [Render Dashboard](https://dashboard.render.com/).
3. Click **New +** → **Web Service**.
4. Connect your GitHub repository.
5. Configure the following fields:
   - **Name**: `globaltalk-ai`
   - **Runtime**: `Node`
   - **Branch**: `main`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Plan**: `Free`
6. In **Environment Variables**, add:
   - `GEMINI_API_KEY`: *(paste your Google Gemini API key)*
   - `NODE_ENV`: `production`
7. Click **Create Web Service**.
8. Once built, Render will supply an HTTPS URL (e.g. `https://globaltalk-ai.onrender.com`). Microphone permissions require HTTPS, which Render provisions automatically.

---

## 📦 Publishing to GitHub

Follow these steps to initialize and push this project to your GitHub account:

```bash
# 1. Initialize git (if not already done)
git init -b main

# 2. Check that .env is ignored
git status

# 3. Stage the project files
git add .

# 4. Create initial commit
git commit -m "feat: complete UI/UX redesign and production readiness for GlobalTalk AI"

# 5. Link your GitHub remote repository
git remote add origin https://github.com/<your-username>/<your-repo-name>.git

# 6. Push to GitHub
git push -u origin main
```

---

## 🛡️ Security Best Practices

- **Zero Client-Side Secret Leakage**: The long-lived `GEMINI_API_KEY` is strictly confined to the backend server. The client browser only receives 30-minute scoped ephemeral session tokens.
- **Rate-Limited Token Generation**: In-memory rate limiting prevents token generation abuse.
- **Safe Fallbacks**: If Firebase is unconfigured, the app falls back to local storage without throwing unhandled exceptions.
- **Content Security & Headers**: Configured with `nosniff`, `DENY` frame-options, and strict origin policies.
