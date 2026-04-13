# SPRINT 3: AI Processing Pipeline and Clip Generation
## Role-Based Task Assignment

Based on the formal roles defined in the project:
- Rinesa Merovci — Lead AI Developer (Core Engine)
- Rinesa Bislimi — Backend Developer (Data Pipeline)
- Penar Kera — Full-stack Developer (UX and Client Logic)

---

## JOB 1 — SPRINT 3 Transcription and Timing Service

**ASSIGNED TO: Rinesa Merovci**

GitHub Issue: #20
Role: Lead AI Developer (Core Engine)
Formal Responsibility: Mathematical extraction logic, Whisper AI API integration, and processing optimization

### Responsibilities

- Integrate OpenAI Whisper API for speech-to-text extraction
- Extract precise word-level timestamps from audio
- Build reusable service layer: backend/app/services/transcription_service.py
- Handle AI model selection and optimization for speed and accuracy tradeoff
- Implement error handling for audio quality issues and API limits

### Scope

Transcription serves as the foundation for the entire AI pipeline. Deliverables include:
1. A production-safe wrapper for the OpenAI Whisper API
2. Efficient extraction of transcript and word-level timing data
3. Graceful handling of timeouts, API quotas, and poor audio quality
4. A structured contract for downstream analysis processes

### Deliverables:

- **Service:** `backend/app/services/transcription_service.py`
  - Function: `transcribe_media(file_path: Path, model: str = "base") -> TranscriptionResult`
  
- **Model:** `backend/app/models/transcription.py`
  ```python
  class TranscriptWord(BaseModel):
      word: str
      start: float  # seconds
      end: float    # seconds
      confidence: float  # 0-1

  class TranscriptionResult(BaseModel):
      transcript_text: str
      duration_seconds: float
      detected_language: str  # "en" for MVP
      words: list[TranscriptWord]
      model_used: str
      processing_time_seconds: float
  ```

- **Local CLI:** `scripts/test_transcription.py`
  ```bash
  python scripts/test_transcription.py episode.mp4 --model base
  ```
  Output: JSON with transcript + word timings

- **Error Types:**
  - `TranscriptionError` (base)
  - `WhisperNotAvailableError`
  - `AudioQualityError`
  - `APITimeoutError`
  - `LanguageNotSupportedError`

- **Unit Tests:** `backend/tests/test_transcription_service.py`
  - Mock Whisper API responses
  - Test word-level accuracy
  - Test error handling

### Acceptance Criteria

- Transcription works for all formats from Sprint 2 (mp3, wav, m4a, mp4)
- Word-level timestamps accurate to ±100ms
- 60-minute audio processed in less than 15 minutes with base model
- No full-file loading into memory (streaming and chunking required)
- Errors convert cleanly to API responses
- Local CLI test works: python scripts/test_transcription.py sample.mp4

### Non-Goals

- Real-time streaming transcription (batch only)
- Multi-language support (English only for MVP)
- Speaker diarization (who said what)
- Translation capabilities

---

## JOB 2 — SPRINT 3 Semantic Analysis and Virality Scoring

**ASSIGNED TO: Rinesa Bislimi**

GitHub Issue: #21
Role: Backend Developer (Data Pipeline)
Formal Responsibility: Supabase database models, authentication networking, strict Webhook validations, and endpoint routing

### Responsibilities

- Build semantic analysis service using NLP libraries (spaCy or transformers)
- Implement virality scoring algorithm based on content analysis
- Store scoring results in PostgreSQL for downstream clipping processes
- Design and maintain database schema for scores persistence
- Create backend endpoint to trigger asynchronous analysis jobs

### Scope

Analysis represents the intelligence layer of the pipeline. Deliverables include:
1. Processing transcription and timestamps from Job 1
2. Identifying highlight segments using NLP sentiment and keyword analysis
3. Scoring each segment by virality potential on a 0-100 scale
4. Persisting scores to database for Job 3 to consume during clipping

### Deliverables:

- **Service:** `backend/app/services/analysis_service.py`
  - Function: `analyze_and_score(podcast_id: str, transcription: TranscriptionResult) -> list[ScoreSegment]`
  
- **Model:** `backend/app/models/analysis.py`
  ```python
  class ScoreSegment(BaseModel):
      segment_start_seconds: float
      segment_end_seconds: float
      duration_seconds: float
      virality_score: float  # 0-100
      transcript_snippet: str
      sentiment: Literal["positive", "neutral", "negative"]
      keywords: list[str]

  class AnalysisResult(BaseModel):
      podcast_id: str
      total_segments_analyzed: int
      top_scoring_segments: list[ScoreSegment]
      average_score: float
      processing_time_seconds: float
  ```

- **Database Schema:** `backend/sql/analysis_schema.sql`
  ```sql
  CREATE TABLE scores (
      id UUID PRIMARY KEY,
      podcast_id UUID NOT NULL REFERENCES podcasts(id),
      segment_start_sec FLOAT,
      segment_end_sec FLOAT,
      virality_score FLOAT,
      transcript_snippet TEXT,
      sentiment VARCHAR,
      keywords TEXT[],
      created_at TIMESTAMP
  );
  ```

- **Backend Route:** `POST /podcasts/{podcast_id}/analyze`
  - Triggers async background job
  - Returns `AnalysisResult` with top segments

- **Unit Tests:** `backend/tests/test_analysis_service.py`
  - Mock transcription input
  - Test scoring logic
  - Test segment grouping

### Acceptance Criteria

- Scores correlate with subjective highlight review from team members
- Processing does not block user requests (background job execution)
- Results are stored durably in scores table for future retrieval
- Top 3-5 segments per 60-minute video achieve scores above 70 out of 100
- Segments do not overlap and demonstrate thematic coherence
- 60-minute transcript analyzed within 5 minutes
- Clear and descriptive error responses for malformed transcripts

### Non-Goals

- Speaker emotion detection beyond sentiment analysis
- Background music or content rating analysis
- Topic classification and categorization
- Automatic chapter generation

---

## JOB 3 — SPRINT 3 FFmpeg Clipping and Subtitle Integration

**ASSIGNED TO: Penar Kera**

GitHub Issue: #22
Role: Full-stack Developer (UX and Client Logic)
Formal Responsibility: Next.js dashboard design, state management, Stripe Checkout UI routing, and live status polling

### Responsibilities

- Build FFmpeg wrapper service for precise video slicing operations
- Generate and apply subtitle burns to generated video clips
- Manage clip storage and retrieval from cloud storage (Supabase Storage)
- Create backend endpoint to trigger clip generation workflows
- Develop frontend interface for browsing and downloading generated clips

### Scope

Clipping represents the final output generation stage. Deliverables include:
1. Processing scored segments from Job 2
2. Extracting precise video segments using exact timing information
3. Creating SRT subtitle files from accompanying transcripts
4. Burning subtitles onto video clips without quality degradation
5. Persisting results and exposing download URLs to frontend users
6. Implementing user interface for clip browsing and management

### Deliverables:

- **Service:** `backend/app/services/clipping_service.py`
  - Function: `generate_clips(podcast_id: str, score_segments: list[ScoreSegment], transcription: TranscriptionResult) -> list[ClipResult]`
  
- **Model:** `backend/app/models/clipping.py`
  ```python
  class ClipResult(BaseModel):
      clip_number: int
      clip_start_seconds: float
      clip_end_seconds: float
      duration_seconds: float
      virality_score: float
      video_url: str  # Supabase Storage URL
      subtitle_text: str
      status: Literal["ready", "processing", "failed"]

  class ClipGenerationResult(BaseModel):
      podcast_id: str
      total_clips_generated: int
      clips: list[ClipResult]
      processing_time_seconds: float
      download_folder_url: str
  ```

- **Database Schema:** `backend/sql/clips_schema.sql`
  ```sql
  CREATE TABLE clips (
      id UUID PRIMARY KEY,
      podcast_id UUID NOT NULL REFERENCES podcasts(id),
      clip_number INT,
      clip_start_sec FLOAT,
      clip_end_sec FLOAT,
      virality_score FLOAT,
      storage_path VARCHAR,
      storage_url VARCHAR,
      subtitle_url VARCHAR,
      status VARCHAR,
      created_at TIMESTAMP
  );
  ```

- **Backend Route:** `POST /podcasts/{podcast_id}/generate-clips`
  - Triggers async clip generation
  - Returns `ClipGenerationResult` with clip URLs

- **Frontend Component:** `frontend/app/clips/page.tsx`
  - List of generated clips
  - Thumbnail previews (if possible)
  - Download buttons
  - Clip metadata (duration, score, title)

- **API Client:** Extend `frontend/lib/api.ts`
  - `generateClips(podcastId: string)`
  - `getClips(podcastId: string)`
  - `downloadClip(clipId: string)`

- **Unit Tests:** `backend/tests/test_clipping_service.py`
  - FFmpeg command building
  - Subtitle generation and timing
  - Error handling

### Acceptance Criteria

- Clips are cut precisely without audio or video desynchronization (±10ms accuracy)
- Subtitles are synchronized with video content and remain readable without overlap
- Users can download clips via authenticated URLs
- 60-minute video processes to 3-5 clips within 20 minutes
- Invalid timestamps and missing audio segments are handled gracefully
- Generated clips play in standard video players (mp4 and h264 codec)
- Frontend displays clips in gallery format with associated metadata

### Non-Goals

- Advanced video effects or transition effects
- Multiple quality tier support (720p and 1080p variants)
- Real-time clip preview generation
- Social media platform export functionality

---

## Dependency Chain

JOB 1 — Rinesa Merovci: Transcription and Timing
    -> publishes TranscriptionResult model
JOB 2 — Rinesa Bislimi: Analysis and Scoring
    -> publishes AnalysisResult and scores stored in database
JOB 3 — Penar Kera: Clipping and Frontend Gallery
    -> publishes final clips ready for download

## Zero-Blocker Development Rules

Week 1 (Job 1):
- Rinesa Merovci publishes TranscriptionResult model early
- Rinesa Bislimi can mock Whisper responses to test NLP scoring independently
- Penar Kera can mock transcript data to test FFmpeg timing independently

Week 2 (Job 2):
- Rinesa Bislimi publishes AnalysisResult and scores table schema early
- Penar Kera can mock scoring results to test video slicing independently
- All jobs can work in parallel using mocked contracts

Week 3 (Job 3):
- Final integration phase: real Whisper flows to real Analysis to real Clipping
- Frontend connected to production backend API

---

## Database Schema Migrations

Each job is responsible for creating its own SQL migration file:
1. Job 1 (Transcription): backend/sql/transcription_schema.sql
2. Job 2 (Analysis): backend/sql/analysis_schema.sql
3. Job 3 (Clipping): backend/sql/clips_schema.sql

All migrations will be applied to development and staging Supabase instances during integration phase.

---

## Distribution Instructions

### For Rinesa Merovci

Copy and share the following sections:
- JOB 1 — SPRINT 3 Transcription and Timing Service
- ASSIGNED TO: Rinesa Merovci
- Through: Non-Goals section

---

### For Rinesa Bislimi

Copy and share the following sections:
- JOB 2 — SPRINT 3 Semantic Analysis and Virality Scoring
- ASSIGNED TO: Rinesa Bislimi
- Through: Non-Goals section

---

### For Penar Kera

Copy and share the following sections:
- JOB 3 — SPRINT 3 FFmpeg Clipping and Subtitle Integration
- ASSIGNED TO: Penar Kera
- Through: Non-Goals section

---

## Reassignment Instructions

To reassign a job to a different team member, modify the assignment header:

Current format:
ASSIGNED TO: [Current Name]

Replace with desired team member name:
ASSIGNED TO: [New Name]

All deliverables and scope requirements remain unchanged regardless of assignment.
