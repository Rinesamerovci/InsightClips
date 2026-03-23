<div align="center">

<img src="https://img.shields.io/badge/AI--Powered-Podcast%20Highlighter-8fbc8f?style=for-the-badge&logo=openai&logoColor=white" />

# 🎙️ InsightClips

### *Turn long podcasts into viral short-form content — automatically.*

[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=flat-square&logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Next.js](https://img.shields.io/badge/Next.js-14+-000000?style=flat-square&logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?style=flat-square&logo=supabase&logoColor=white)](https://supabase.com)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)

</div>

---

## 📌 Overview

**InsightClips** is an AI-powered platform that analyzes long-form podcast content and automatically extracts the most engaging moments as short clips (30–60 seconds) — ready for TikTok, Instagram Reels, and YouTube Shorts.

No manual editing. No timeline scrubbing. Just upload, and let the AI do the work.

> **Definition of Done (MVP):** The system successfully generates at least **3 functional clips** from a long-form video with zero manual intervention.

---

## ✨ Features

| Feature | Description |
|---|---|
| 🎬 **Video Upload** | Upload podcast video or audio directly to cloud storage |
| 🤖 **AI Transcription** | Convert speech to text with timestamps via OpenAI Whisper |
| 🧠 **Moment Analysis** | Automatically detect "viral" segments using NLP semantic scoring |
| ✂️ **Auto-Clipping** | Precisely cut clips using FFmpeg based on AI-identified timestamps |
| 💬 **Subtitle Generation** | Auto-generate captions for every clip |

---

## 🏗️ Architecture

```
User Upload (long video)
        │
        ▼
┌──────────────────┐
│   FastAPI Backend │
│  ┌─────────────┐ │
│  │ Audio Extract│ │
│  └──────┬──────┘ │
│         ▼        │
│  ┌─────────────┐ │
│  │  Whisper AI │ │  ← Transcription with timestamps
│  └──────┬──────┘ │
│         ▼        │
│  ┌─────────────┐ │
│  │  NLP Model  │ │  ← Viral moment detection
│  └──────┬──────┘ │
│         ▼        │
│  ┌─────────────┐ │
│  │   FFmpeg    │ │  ← Precise video clipping
│  └──────┬──────┘ │
└─────────┼────────┘
          ▼
   Supabase Storage
          │
          ▼
   Dashboard (Next.js)  →  User downloads clips
```

---

## 🛠️ Tech Stack

### Frontend
- **Next.js / React** — Interactive web dashboard
- **React Native / Expo** — Cross-platform mobile access
- **Tailwind CSS** — Modern UI with pistachio-themed aesthetics

### Backend & AI
- **Python + FastAPI** — Core server logic and AI pipeline
- **OpenAI Whisper** — High-accuracy speech-to-text with timestamps
- **NLP (spaCy / Transformers)** — Semantic analysis for key moment detection
- **FFmpeg** — Automated, frame-accurate video clipping

### Infrastructure
- **Supabase** — PostgreSQL database + file storage for video/clip assets

---

## 📊 Database Schema

```sql
Users       → id, name, email, password_hash
Podcasts    → id, userId, title, videoUrl, transcript, createdAt
Clips       → id, podcastId, startTime, endTime, clipUrl, rankScore
```

---

## 🚀 Local Setup

### Prerequisites
- Python 3.11+
- Node.js 18+
- FFmpeg installed and in PATH
- A Supabase project (free tier works)

### Backend

```bash
cd backend
python -m venv venv
.\venv\Scripts\activate        # Windows
# source venv/bin/activate     # macOS/Linux
pip install -r requirements.txt
cp .env.example .env           # Add your API keys
uvicorn main:app --reload
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env.local     # Add Supabase URL + anon key
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🔑 Environment Variables

```env
# backend/.env
OPENAI_API_KEY=your_key_here
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_anon_key

# frontend/.env.local
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

---

## 👥 Team

| Name | Role |
|---|---|
| **Rinesa Merovci** | Lead Developer · Backend, AI Logic & Video Processing |
| **Pënar Kera** | Full-stack Developer · Frontend, Mobile UI/UX & Design |
| **Rinesa Bislimi** | Backend Developer · Database Architecture & API Integration |

---

## 🗺️ Roadmap

- [x] Project setup & repo structure
- [ ] Whisper AI transcription pipeline
- [ ] NLP scoring model for moment detection
- [ ] FFmpeg auto-clipping integration
- [ ] Supabase storage + DB integration
- [ ] Next.js dashboard with clip preview
- [ ] Subtitle overlay generation
- [ ] Mobile app (React Native)

---

<div align="center">
  <sub>Built with ❤️ by the InsightClips team</sub>
</div>
