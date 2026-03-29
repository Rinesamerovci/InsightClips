<div align="center">

<img src="https://img.shields.io/badge/AI--Powered-Podcast%20Highlighter-8fbc8f?style=for-the-badge&logo=openai&logoColor=white" />

# InsightClips
### *AI-Based System for Extracting Key Moments from Podcasts*

[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=flat-square&logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Next.js](https://img.shields.io/badge/Next.js-14+-000000?style=flat-square&logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?style=flat-square&logo=supabase&logoColor=white)](https://supabase.com)
[![Stripe](https://img.shields.io/badge/Stripe-Payments-008CDD?style=flat-square&logo=stripe&logoColor=white)](https://stripe.com)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)

</div>

---

## 1. Project Description
**InsightClips** is a university laboratory project developed as an AI-powered web platform that automatically extracts the most important moments from long podcast videos, converting them into short, social-media-ready clips. 

The system leverages natural language processing, automated audio transcription, and programmatic video editing. While primarily an academic requirement for the course **"Kurs Laboratorik"**, the architecture is explicitly designed with real-world constraints—including a dynamic payment model—to ensure the application can be safely launched and used by real users post-graduation without incurring uncontrolled API costs.

## 2. Problem Statement
Content creators face critical bottlenecks when dealing with long-form media:
- Podcasts often last **1–2 hours**, making manual timeline review extremely tedious.
- Video abstraction and clipping require several hours of labor per episode.
- Free AI processing platforms inevitably face **severe financial losses** because third-party APIs (OpenAI Whisper, LLMs) bill by the minute or token. 

InsightClips solves the technical hurdle of video processing while addressing the architectural challenge of cost management through a strict rate-limited ingestion pipeline.

## 3. Project Goal & Definition of Done (MVP)
The objective of this project is to build and present a **fully functional AI-powered web application** capable of operating as a sustainable production service.

> **Definition of Done (MVP):** 
> The project is complete when a user can register, log in, and upload a podcast video to the cloud. The platform mitigates API abuse by granting **1 free video (max 30 mins)** to new users. For subsequent videos, the system calculates processing costs and requires payment via **Stripe**. Upon confirmation, the backend AI extracts at least **3 highlight clips** (30–60 seconds each) with native, perfectly synchronized subtitles, ready for download.

## 4. Target Audience
Once public usage begins, the platform is targeted toward:
- **Content Creators / Podcasters:** Seeking automated shorts generation.
- **Social Media Managers:** Handling large volumes of daily content.
- **Digital Agencies:** Producing rapid short-form marketing materials.

---

## 5. Functional & Non-Functional Requirements

### Core Features (Functional Requirements)
| Feature | Description |
|---|---|
| **Video Upload** | Upload podcast video or audio directly to cloud storage via a Next.js dashboard. |
| **Payment AI Guard** | Pre-calculate video length and charge users dynamically via Stripe *before* AI activation. |
| **AI Transcription** | Convert speech to text natively with word-level timestamps using OpenAI Whisper. |
| **Moment Analysis** | Automatically detect "viral" segments using NLP semantic scoring. |
| **Auto-Clipping** | Precisely cut clips using FFmpeg based on AI-identified timestamps. |
| **Subtitle Integration** | Auto-generate and hardcode captions directly onto the exported video fragments. |

### System Standards (Non-Functional Requirements)
- **Financial Security:** Strict backend Webhook validations preventing users from bypassing API costs.
- **Performance:** A 60-minute video must be fully processed, transcribed, and clipped in under 20 minutes.
- **Usability:** A responsive user interface supporting massive file uploads gracefully.
- **Security:** Secure authentication layers using Supabase Row-Level Security (RLS).

---

## 6. Business Logic & AI Cost Innovation
What strongly differentiates InsightClips as a university project is its realistic treatment of third-party API costs. Rather than assuming infinite free usage—which causes immediate startup failure—this project implements a sustainable **Freemium + Pay-Per-Video** architecture:

1. **Free Tier:** Users receive 1 free video with a hard limit of 30 minutes, demonstrating technical viability while preventing arbitrary server abuse.
2. **Dynamic AI Pricing:** Videos are charged based on CPU/API processing difficulty (duration):
   - 0–30 mins = $1.00
   - 30–60 mins = $2.00
   - 60–120 mins = $4.00
3. **Unit Economics (Academic Defense):** Processing a 60-min video incurs ~$0.43 in specific API computing costs (Whisper + Tokens). At a $2.00 price point, minus standard Stripe clearing fees ($0.36), the platform validates a positive net return. This proves the application architecture is highly scalable and prepared for real-world deployment.

---

## 7. How the AI Extraction Logic Works
The core intelligence of **InsightClips** relies on a strict 4-stage processing pipeline:
1. **Pre-Flight Check (Validation):** FFprobe sweeps the uploaded video length. The FastAPI server determines the associated computational cost and holds processing until the Stripe Webhook confirms the transaction.
2. **Transcription (Speech-to-Text):** The backend utilizes OpenAI Whisper to extract audio and plot exact timestamps for every spoken word.
3. **Semantic Analysis (NLP):** An advanced Language Model evaluates the transcription text to isolate complete thoughts, emotional highs, and strong hooks.
4. **Automated Clipping:** The algorithm assigns mathematical "virality scores" to textual segments. FFmpeg physically slices the video at the highest-scoring timestamps while simultaneously burning the text as subtitles.

---

## 8. Technology Stack & Architecture

### Frontend (Client Tier)
- **Next.js / React** — Interactive, client-side dashboard UI.
- **Tailwind CSS** — Modern UX aesthetics.
- **Stripe.js** — Secure frontend checkout routing.

### Backend (API & Processing Tier)
- **Python + FastAPI** — Core server logic handling asynchronous webhooks and huge file streams.
- **OpenAI Whisper & spaCy/NLP** — Semantic analysis and transcription engine.
- **FFmpeg** — Frame-accurate video rendering and subtitle generation.

### Database Layer (Storage Tier)
- **Supabase (PostgreSQL)** — Secure cloud-hosted file storage, isolated user spaces, and authentication.

```text
User Upload (long video)
        │
        ▼
   Frontend (Next.js)  ────► Stripe Checkout
        │                        │
        ▼                        ▼
   Backend (FastAPI) ◄──── Stripe Webhook 
      ├── Audio Extraction
      ├── Whisper Transcription
      ├── NLP Analysis
      └── FFmpeg Clipping
        │
        ▼
Supabase Storage & DB
```

---

## 9. API Endpoints & Project Structure

### Important Endpoints
- **Authentication:** `POST /auth/register`, `POST /auth/login`.
- **Payment & Security:** `POST /upload/calculate-price`, `POST /webhooks/stripe`.
- **Media Processing:** `POST /upload`, `GET /podcasts`, `GET /clips/{podcastId}`.

### Monorepo Structure
```
InsightClips/
├── backend/
│   ├── app/
│   ├── routers/
│   ├── services/
│   ├── utils/
│   └── main.py
├── frontend/
├── docs/
├── README.md
└── requirements.txt
```

---

## 10. Database Schema (PostgreSQL)

```sql
Users       → id, email, password_hash, free_trial_used (bool), stripe_customer_id, created_at
Podcasts    → id, userId (FK), title, videoUrl, duration, price, payment_status, createdAt
Clips       → id, podcastId (FK), startTime, endTime, clipUrl, rankScore, subtitles
Payments    → id, userId (FK), podcastId (FK), stripe_payment_id, amount, status, created_at
```

---

## 11. Implementation Methodology & Parallel Work Breakdown

We utilize a **Feature-Driven architecture** to be completed sequentially over **3 months (12 weeks/6 sprints)**. The 3 students develop simultaneously in isolated environments to avoid blocking each other during the semester. 

### Parallel Workflow Methodology (Zero-Blocker Development)
To guarantee the team works simultaneously without "blocking" each other, we enforce strict software engineering isolation protocols:
1. **Mock Data Validation (Frontend):** The Next.js dashboard is built using hardcoded JSON state, completely decoupling UI development from backend readiness.
2. **API Contracts & Postman (Backend):** FastAPI HTTP endpoints are constructed and tested natively using Postman, removing any dependency on the Next.js visual interface.
3. **Isolated CLI Execution (AI Engine):** Whisper APIs, NLP Semantic Logic, and FFmpeg slicing operations are written as completely detached Python scripts (CLI) tested on local static `.mp4` files. They are only merged into the API pipeline during Sprint 6.
4. **Git Branching Strategy:** Each student commits exclusively to their isolated Git branch (e.g., `feature/dashboard`, `feature/fastapi`, `feature/whisper`) and pushes to `main` only upon validated integration.

### Team Roles & Responsibilities
| Name | Formal Role | Academic Feature Responsibility |
|---|---|---|
| **Rinesa Merovci** | Lead AI Developer | **Core Engine:** Mathematical extraction logic, Whisper AI API integration, FFmpeg processing shell scripts, and FastAPI processing queues. |
| **Pënar Kera** | Full-stack Developer | **UX & Client Logic:** Next.js dashboard design, state management, Stripe Checkout UI routing, and live status polling. |
| **Rinesa Bislimi** | Backend Developer | **Data Pipeline:** Supabase database models, authentication networking, strict Webhook validations for API protection, and endpoint routing. |

### Detailed Project Timeline (12 Weeks)
- **Sprint 1 (Weeks 1-2): Setup & UI Foundation**
  - Next.js scaffolding, Supabase Auth setup, and fundamental Next.js App routing.
- **Sprint 2 (Weeks 3-4): File Pipelines & Payment Security Guards**
  - FastAPI file ingestion endpoints. Integration of `ffprobe` for processing video length to enforce constraints *before* uploading to Supabase Storage.
- **Sprint 3 (Weeks 5-6): AI Transcription Foundation**
  - Implementation of OpenAI Whisper API routing to extract perfect `.json` timestamps linking text to audio intervals.
- **Sprint 4 (Weeks 7-8): Semantic NLP Logic**
  - Implementation of algorithms for highlighting semantic emotional highs and detecting complete, cohesive sentences (avoiding abrupt audio cuts).
- **Sprint 5 (Weeks 9-10): Webhooks & Video Slicing Execution**
  - Development of Stripe webhook listeners to trigger FFmpeg only upon successful 200 HTTP API clearing codes. 
- **Sprint 6 (Weeks 11-12): Merging & Laboratory Presentation Polish**
  - Final frontend API consumption to show the outputted clips on dashboard, edge-case testing, and final translation checks for academic submission.

---

## 12. Risks, Challenges & Future Improvements

### Academic & Technical Challenges
- **Financial Architecture:** Guaranteeing that the Python backend completely halts GPU/API tasks if the PostgreSQL `payment_status` is not cryptographically validated by the Stripe Server webhooks.
- **Large File Operations:** Passing 1GB+ video blobs using efficient streaming techniques rather than overloading server RAM.
- **Artificial Intelligence Limits:** Resolving instances where the AI extraction unexpectedly cuts a speaker mid-sentence due to overlapping audio layers.

### Extensibility Post-Graduation
- Transitioning to a microservices architecture for handling thousands of concurrent podcast uploads.
- Adding multi-lingual generative AI dubbing.

---

<div align="center">
  <h3>InsightClips</h3>
  <p><i>A University Laboratory Project (Kurs Laboratorik)</i></p>
  <sub>Built by 3rd-year Computer Science & Engineering students:</sub><br>
  <b>Rinesa Bislimi • Pënar Kera • Rinesa Merovci</b><br>
  <i>MIT License</i>
</div>
