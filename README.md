# 🎙️ InsightClips: AI-Based Podcast Highlighter

**InsightClips** është një platformë inteligjente që përdor teknologji të Inteligjencës Artificiale (AI) për të analizuar podcast-e me kohëzgjatje të gjatë dhe për t’i ndarë ato automatikisht në klipe të shkurtra (short-form content). Sistemi bazohet në transkriptimin e audios dhe analizën semantike për të identifikuar segmentet më relevante për rrjetet sociale si TikTok, Instagram Reels dhe YouTube Shorts.

---

## 👥 Ekipi i Projektit (Project Team)
Sipas hierarkisë së përcaktuar për realizimin e projektit:

1. **Rinesa Merovci** — Lead Developer & Project Management (Backend, AI Logic & Video Processing)
2. **Pënar Kera** — Full-stack Developer (Frontend, Mobile UI/UX & Design)
3. **Rinesa Bislimi** — Backend Developer (Database Architecture & API Integration)

---

## 🛠️ Teknologjitë e Përdorura (Tech Stack)

### Frontend
* **Next.js / React**: Për dashboard-in ndërveprues në web.
* **React Native / Expo**: Për qasjen nga pajisjet mobile.
* **Tailwind CSS**: Për dizajnin modern (me fokus në estetikën "pistachio").

### Backend & AI
* **Python (FastAPI)**: Logjika kryesore e serverit dhe integrimi i AI.
* **OpenAI Whisper**: Transkriptimi i audios në tekst me saktësi të lartë.
* **NLP (Natural Language Processing)**: Analiza semantike për identifikimin e momenteve kyçe.
* **FFmpeg**: Mjeti kryesor për prerjen (clipping) automatike të videove.

### Infrastructure
* **Supabase (PostgreSQL & Storage)**: Ruajtja e të dhënave të përdoruesve dhe skedarëve video.

---

## 🚀 Funksionalitetet Kryesore (Core Features)

| Feature | Përshkrimi |
| :--- | :--- |
| **Video Upload** | Ngarkimi i podcast-it (video/audio) direkt në cloud storage. |
| **AI Transcription** | Kthimi i fjalimit në tekst përmes Whisper AI me timestamps. |
| **Moment Analysis** | Identifikimi automatik i momenteve "virale" përmes analizës së tekstit. |
| **Auto-Clipping** | Prerja automatike e videos në segmente 30-60 sekonda përmes FFmpeg. |
| **Subtitle Generation** | Gjenerimi i titrave automatikë për çdo klip të krijuar. |

---

## 🏗️ Arkitektura e Sistemit (Workflow)



1. **Input**: Përdoruesi ngarkon një video të gjatë (p.sh. 60 min).
2. **Processing**: Backend-i nxjerr audion dhe ekzekuton Whisper AI për transkriptim.
3. **Analysis**: Modeli NLP analizon transkriptin për të gjetur pikat e larta të bisedës.
4. **Cutting**: FFmpeg ekzekuton prerjen e saktë bazuar në kornizat kohore të gjetura.
5. **Output**: Klipet ruhen në Supabase dhe shfaqen në Dashboard për përdoruesin.

---

## 📊 Struktura e Databazës (Database Schema)

* **Users**: `id, name, email, password`
* **Podcasts**: `id, userId, title, videoUrl, transcript`
* **Clips**: `id, podcastId, startTime, endTime, clipUrl, rankScore`

---

## 📝 Definition of Done (MVP)
Projekti quhet i përfunduar kur sistemi arrin të gjenerojë automatikisht të paktën **3 klipe** funksionale nga një video e gjatë, pa ndërhyrje manuale nga përdoruesi.

---

## 💻 Instalimi Lokal (Setup)

### Backend
1. Navigo te dosja: `cd backend`
2. Krijo mjedisin virtual: `python -m venv venv`
3. Aktivizo mjedisin: `.\venv\Scripts\activate` (Windows)
4. Instalo libraritë: `pip install -r requirements.txt`

### Frontend
1. Navigo te dosja: `cd frontend`
2. Instalo varësitë: `npm install`
3. Starto serverin: `npm run dev`
