# InsightClips  
An AI-Powered Podcast Clip Generation Platform  

Transform long-form audio and video podcasts into viral, social-media-ready short clips with a single click.

---

## Project Status  
Completed

---

## Team Members  
Pënar Kera  
Rinesa Merovci  
Rinesa Bislim  

---

## Overview  
InsightClips is an advanced AI-driven web platform designed to automate the extraction and generation of short-form content from long-form media.

By synthesizing cutting-edge Natural Language Processing (NLP), Whisper-based speech-to-text, and automated FFmpeg media rendering, InsightClips detects high-potential "viral" moments within a recording. It transforms these selections into engaging clips enhanced with dynamic burned-in subtitles, intelligent cropping, smart hooks, and social-media metadata.

---

## Core Features  

Smart Ingestion: Upload large video files directly or paste a YouTube URL (powered by yt-dlp).  
AI Transcription & NLP: High-speed speech-to-text using the Groq Whisper model. Evaluates virality potential and detects highlights using spaCy sentiment analysis.  
Smart Hooks & Metadata: Automatically generates titles, hooks, and trending hashtags using Large Language Models (LLMs).  
Dynamic Subtitles & Templates: Users can customize subtitle fonts, colors, and layout configurations via an interactive UI.  
Automated Video Generation: FFmpeg pipeline cuts clips, applies 9:16 portrait cropping, normalizes audio, and hardcodes ASS subtitles.  
Analytics Dashboard: Tracks processing states, historical clip generation, and engagement metrics.  
SaaS Monetization: Stripe checkout sessions and secure webhooks for premium user tiers.  
Secure Architecture: Multi-tenant isolation using Supabase Auth and PostgreSQL Row-Level Security (RLS).

---

## Technology Stack  

Frontend (Client):  
Next.js (App Router), React, TypeScript, Tailwind CSS, React Context & Hooks, Stripe.js  

Backend (Server):  
Python, FastAPI, Groq API (Whisper + LLM), spaCy, FFmpeg, yt-dlp, Resend API  

Database & Cloud:  
Supabase (Auth, PostgreSQL, Cloud Storage)  
Local fallback: DigitalOcean NVMe storage  

---

## Installation & Local Development  

### Prerequisites  
Python 3.10+  
Node.js (v18+)  
FFmpeg  
yt-dlp  

---

### Environment Variables (.env)  

Create `.env` files in `/frontend` and `/backend`:

Supabase: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY  
Groq AI: GROQ_API_KEY  
Stripe: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET  
Resend: RESEND_API_KEY  

---

### Backend Setup (FastAPI)

cd backend  
python -m venv venv  
source venv/bin/activate  

pip install -r requirements.txt  

uvicorn app.main:app --reload  

Backend runs on: http://localhost:8000  

---

### Frontend Setup (Next.js)

cd frontend  
npm install  
npm run dev  

Frontend runs on: http://localhost:3000  

---

## Testing the Application  

Open http://localhost:3000  

Create a test user account (Supabase Auth)  
Upload video or paste YouTube URL  
Test Stripe payments using Stripe CLI  
Monitor FFmpeg processing in backend logs  
View generated clips in dashboard  

### Stripe Webhook Test  

stripe login  
stripe listen --forward-to localhost:8000/api/webhooks/stripe  

---

## About  
InsightClips was developed as a comprehensive university software engineering project.

© 2026
