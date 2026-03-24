<div align="center">

<img src="https://img.shields.io/badge/AI--Powered-Podcast%20Highlighter-8fbc8f?style=for-the-badge&logo=openai&logoColor=white" />

# InsightClips
### *AI-Based System for Extracting Key Moments from Podcasts*

[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=flat-square&logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Next.js](https://img.shields.io/badge/Next.js-14+-000000?style=flat-square&logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?style=flat-square&logo=supabase&logoColor=white)](https://supabase.com)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)

</div>

---

## 1. Project Description
**InsightClips** is an AI-powered web platform that automatically extracts the most important and engaging moments from long podcast videos and converts them into short, social-media-ready clips. The system processes long-form content using transcription, semantic analysis, and automated video editing — allowing creators to generate highlight clips without manual video editing.

## 2. Problem Statement
Content creators face several challenges when working with long podcasts:
- Podcasts can last **1–2 hours**.
- Finding highlight moments requires **manual timeline review**.
- Video editing takes **several hours** per episode.
- Many creators lack professional editing tools.

InsightClips aims to significantly reduce this time and effort by completely automating the post-production workflow.

## 3. Project Goal & Definition of Done (MVP)
The main objective of this project is to build a **fully functional AI-powered web application**.

> **Definition of Done (MVP):** 
> The project is considered complete when a user can register, log into the platform, and upload a podcast video. The system automatically processes the video and the AI extracts at least **3 highlight clips**. Each clip must be between **30–60 seconds**, contain perfectly synchronized subtitles, and be ready for download without any manual editing required.

## 4. Target Audience
The platform is designed exclusively for:
- **Content Creators / Podcasters:** Creators who want to quickly generate shorts.
- **Social Media Managers:** Professionals managing multiple content accounts.
- **Marketing Agencies:** Agencies that produce short-form content for brands.

---

## 5. Functional & Non-Functional Requirements

### Core Features (Functional Requirements)
| Feature | Description |
|---|---|
| **Video Upload** | Upload podcast video or audio directly to cloud storage via a modern dashboard. |
| **AI Transcription** | Convert speech to text natively with timestamps via OpenAI Whisper. |
| **Moment Analysis** | Automatically detect "viral" segments using NLP semantic scoring. |
| **Auto-Clipping** | Precisely cut clips using FFmpeg based on AI-identified timestamps. |
| **Subtitle Generation** | Auto-generate subtitles/captions natively onto every cut clip. |
| **User Authentication**| Secure login, registration, and isolated user account dashboards. |

### System Standards (Non-Functional Requirements)
- **Performance:** System must process a 60-minute video under 20 minutes.
- **Scalability:** Designed to handle multiple users simultaneously via Supabase.
- **Usability:** Clean and intuitive desktop/mobile web user interface.
- **Security:** Secure authentication layers using Supabase Row-Level Security.
- **Code Quality:** Modular architecture with strict Git-based development workflows.

---

## 6. How the AI Extraction Logic Works
The core intelligence of **InsightClips** relies on a 3-stage pipeline:
1. **Transcription (Speech-to-Text):** The system uses AI (Whisper) to extract audio from the uploaded video and track exact timestamps for every word.
2. **Reading and Analyzing the Text (NLP):** An advanced Language Model evaluates the transcript to find:
   - **Strong Hooks:** Emotional highlights and viral questions.
   - **Complete Thoughts:** Important statements with a clear beginning and end.
3. **Scoring & Cutting:** The AI assigns a "virality score" to these text blocks. FFmpeg then physically cuts the video at the timestamps of the highest-scoring segments and generates the subtitles.

---

## 7. Use Cases & User Stories

### Use Case 1 – Automated Podcast Clipping
- **Actor:** Content Creator (Podcaster)
- **Description:** The process of a user uploading a heavy video file and the system automatically returning processed, ready-to-post short clips without manual intervention.
- **Steps:**
  1. The user logs into their account on the web dashboard and uploads a full podcast episode.
  2. The system confirms the upload and sets the video status to "Processing".
  3. The Backend automatically extracts the audio and sends it to the Whisper API to generate a timestamped transcript.
  4. The NLP engine scans the transcript text mathematically to identify highly engaging 30-to-60-second segments.
  5. The Backend server runs FFmpeg to physically cut the video at those specific timestamps and visualizes the text as subtitles.
  6. The system alerts the user that processing is 100% complete.
  7. The user views the top extracted clips on their personal dashboard and downloads them directly to their computer.

### Use Case 2 – User Registration & Secure Authentication
- **Actor:** New User / Content Creator
- **Description:** The process of a new user creating an account strictly to secure their massive video files and prevent unauthorized server usage.
- **Steps:**
  1. The user navigates to the InsightClips registration page.
  2. The user enters their Name, Email, and creates a secure Password.
  3. The system sends this data to the Supabase Authentication module.
  4. Supabase validates the credentials and creates a new `User ID` in the database.
  5. The user is automatically logged in and redirected to their personal dashboard.

### Detailed User Stories
- **US-01:** As a podcaster, I want to upload long videos directly through the web browser so I don't need to install any heavy software locally.
- **US-02:** As a content creator, I want the system to automatically analyze the content to find the best moments natively, because I lack the time to manually re-watch my own 2-hour recordings.
- **US-03:** As a social media manager, I want auto-generated subtitles permanently embedded on the clips because most mobile users watch videos on mute.

---

## 8. Technology Stack & Architecture

### Frontend
- **Next.js / React** — Interactive, client-side dashboard UI.
- **Tailwind CSS** — Modern UX aesthetics.

### Backend & AI Processing
- **Python + FastAPI** — Core server logic handling video loads.
- **OpenAI Whisper & spaCy/NLP** — Semantic analysis and transcription engine.
- **FFmpeg** — Frame-accurate video rendering and subtitle generation.

### Database Layer
- **Supabase (PostgreSQL)** — Secure cloud-hosted file storage and user isolation.

```text
User Upload (long video)
        │
        ▼
   Frontend (Next.js)
        │
        ▼
   Backend (FastAPI)
      ├── Audio Extraction
      ├── Whisper Transcription
      ├── NLP Analysis
      └── FFmpeg Clipping
        │
        ▼
Supabase Storage & DB
        │
        ▼
   User Dashboard
```

---

## 9. API Endpoints & Project Structure

### RESTful Endpoints
- **Authentication:** `POST /auth/register` (Register a new user), `POST /auth/login` (Login user).
- **Podcast Processing:** `POST /upload` (Upload podcast video), `GET /podcasts` (Get user podcasts), `GET /clips/{podcastId}` (Retrieve clips).

### Monorepo Structure
```
InsightClips/
├── backend/
│   ├── app/
│   ├── routers/
│   ├── services/
│   ├── models/
│   ├── utils/
│   └── main.py
├── frontend/
├── docs/
├── .env.example
├── .gitignore
├── README.md
└── requirements.txt
```

---

## 10. Database Schema (Including Authentication)

```sql
Users       → id, name, email, password_hash, created_at
Podcasts    → id, userId (FK), title, videoUrl, transcript, createdAt
Clips       → id, podcastId (FK), startTime, endTime, clipUrl, rankScore, subtitles
```

---

## 11. Implementation Methodology & Parallel Work Breakdown

The project will be completed over a period of **3 months (12 weeks)**, ensuring the scope is entirely realistic for a 3-person team. The development follows an Agile methodology divided into **6 Sprints** (2 weeks per sprint). 

We utilize a **Feature-Driven architecture**. In every sprint, all 3 team members are developing simultaneously on explicitly defined, isolated full-stack features to avoid blocking each other.

### Primary Feature Ownership
| Name | Formal Role | Feature Responsibility (Full-Stack Implementation) |
|---|---|---|
| **Rinesa Merovci** | Lead Developer | **Core Extraction Engine:** Full implementation of the AI video processing module, Whisper integration, FFmpeg scripting, and backend pipeline execution. |
| **Pënar Kera** | Full-stack Developer | **User Experience & Management:** End-to-end implementation of the Next.js visual dashboard, UI/UX design, and clip management. |
| **Rinesa Bislimi** | Backend Developer | **Data Pipeline & Delivery:** Full implementation of file upload networking, Supabase authentication/storage handling, and database schema management. |

### Detailed Sprint Timelines (12 Weeks)
- **Sprint 1 (Weeks 1-2): Setup, Login/Auth & Basic Ingestion**
  - *Rinesa M:* Local python backend setup & accepting basic local audio configurations.
  - *Pënar K:* Scaffold Next.js, define UI/UX branding, and build the **Login, Register & Dashboard** screens.
  - *Rinesa B:* Configure Supabase Postgres schemas, **Setup Supabase Auth**, and initial API connection tokens.
- **Sprint 2 (Weeks 3-4): Core Upload & Storage**
  - *Rinesa M:* Build algorithm to separate lightweight MP3s from MP4 videos for faster processing.
  - *Pënar K:* Build polished file-upload components with loading/progress bars enforcing high UI quality.
  - *Rinesa B:* Finalize cloud storage HTTP networking sending raw videos safely to Supabase.
- **Sprint 3 (Weeks 5-6): AI Transcription Pipeline**
  - *Rinesa M:* Integrate OpenAI Whisper API to ingest audio and output text JSON natively.
  - *Pënar K:* Implement live-status tracking components inside the React dashboard.
  - *Rinesa B:* Handle database writes to securely store massive, continuous text transcripts.
- **Sprint 4 (Weeks 7-8): NLP Logic & Moment Extraction**
  - *Rinesa M:* Write the Python NLP mathematical scoring logic to detect semantic hooks & complete sentences.
  - *Pënar K:* Develop specialized UI components allowing users to read full transcripts visually on the web.
  - *Rinesa B:* Develop API endpoints strictly responsible for serving exact timestamp metadata cleanly to the client.
- **Sprint 5 (Weeks 9-10): Video Clipping Mechanics**
  - *Rinesa M:* Execute complex backend shell scripts allowing FFmpeg to physically slice the MP4 video using the timestamps.
  - *Pënar K:* Design the final "Video Result" page featuring an embedded web video player for the custom clips.
  - *Rinesa B:* Code the backend functions responsible for baking the Whisper transcript dynamically onto the cut video frames.
- **Sprint 6 (Weeks 11-12): Integration, Polish & Release**
  - *Team:* Combine the Next.js Client perfectly with the FastAPI server. Test handling edge cases (timeouts, massive 1-hour files). Finalize clean UI/UX components, merge the final Git Master branch, eliminate unused boilerplate, and submit the official Academic Documentation.

---

## 12. Risks, Challenges & Future Improvements

### Key Risks
- **Large File Operations:** Receiving, storing, and manipulating 1GB+ video files efficiently over the web without timing out HTTP requests.
- **API Limits:** Whisper API processing performance and cost limitations.
- **AI Cut Uncertainty:** Ensuring the NLP script strictly extracts logical, complete thoughts without brutally cutting subjects off mid-sentence.

### Future Improvements
- **Real-time processing** and livestream clipping logic.
- **Mobile application** dedicated for iOS/Android content managers.
- **Multi-language transcription** and auto social media publishing endpoints.

---

## 13. Local Setup Instructions

### Prerequisites
- Python 3.11+
- Node.js 18+
- FFmpeg installed in OS PATH
- Active Supabase Cloud Project

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --reload
```

### Frontend
```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

---

<div align="center">
  <h3>InsightClips</h3>
  <p><i>A Laboratory Course (Kurs Laboratorik) Project</i></p>
  <sub>Built by 3rd-year Computer Science & Engineering students:</sub><br>
  <b>Rinesa Bislimi • Pënar Kera • Rinesa Merovci</b><br>
  <i>MIT License</i>
</div>
