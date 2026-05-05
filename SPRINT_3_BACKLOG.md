# SPRINT 3: AI Processing Pipeline & Clip Generation

Copy-paste each job below into GitHub Issues as a new issue in your project backlog.

---

## 🎯 JOB 1: SPRINT 3 Transcription & Timing Service

**Owner:** Rinesa Merovci  
**Focus:** Core AI engine - Whisper integration  
**Issue:** #20

### Scope:

- Integrate OpenAI Whisper API for speech-to-text extraction
- Create reusable service layer: `backend/app/services/transcription_service.py`
- Extract word-level timestamps from audio
- Build structured response contract for transcript + timing metadata
- Error handling for audio quality, language detection, API timeouts
- Local test script: `scripts/test_transcription.py`

### Deliverables:

- Whisper service wrapper with configurable model sizes (tiny, base, small, medium)
- Structured `TranscriptionResult` pydantic model with word timings
- Error handling for:
  - Missing OpenAI API key
  - API timeout (>300s)
  - Unsupported language
  - Poor audio quality
  - Empty transcription
- Unit tests for mock Whisper responses
- Developer CLI for testing transcription locally

### Acceptance Criteria:

- ✅ Transcription works for various audio formats from Sprint 2 (mp3, wav, m4a, mp4)
- ✅ Word-level timestamps are accurate to ±100ms
- ✅ Long files (60+ min) are processed in streaming chunks, not loaded fully into memory
- ✅ Errors are explicit enough for API layer conversion to HTTP responses
- ✅ Processing time for 60-min audio: <15 min with "base" model
- ✅ Local CLI test: `python scripts/test_transcription.py episode.mp4` returns JSON with transcript + timestamps

### Utility/Backend Specs:

**Service location:** `backend/app/services/transcription_service.py`

**Model location:** `backend/app/models/transcription.py`

**Suggested core function:**
```python
def transcribe_media(file_path: Path, model: str = "base") -> TranscriptionResult:
    """Transcribe media file using OpenAI Whisper API."""
    ...
```

**Suggested result contract:**
```python
class TranscriptWord(BaseModel):
    word: str
    start: float  # seconds
    end: float    # seconds
    confidence: float  # 0-1

class TranscriptionResult(BaseModel):
    transcript_text: str
    duration_seconds: float
    detected_language: str  # e.g., "en"
    words: list[TranscriptWord]
    model_used: str
    processing_time_seconds: float
```

**Integration contract for Job 2:**
- Input: `podcast_id` and file path (from Sprint 2 storage)
- Output: `TranscriptionResult` or typed exception
- Usage: Job 2 will call `transcribe_media()` to get word timings for analysis

### Non-goals for Job 1:

- ❌ Real-time streaming transcription (batch only)
- ❌ Multi-language support (English only for MVP)
- ❌ Speaker diarization (who said what)
- ❌ Translation to other languages

---

## 🎯 JOB 2: SPRINT 3 Semantic Analysis & Virality Scoring

**Owner:** Rinesa Bislimi  
**Focus:** Data pipeline - NLP segment scoring  
**Issue:** #21

### Scope:

- Build semantic analysis service using spaCy or transformers
- Identify complete thoughts and emotional segments from transcripts
- Implement virality scoring algorithm based on:
  - Sentence sentiment analysis
  - NLP engagement keywords (e.g., "amazing", "breakthrough", "impossible")
  - Pause duration and intonation patterns (from Whisper metadata)
  - Speech rate variations
- Create `backend/app/services/analysis_service.py`
- Build scoring response contract with timestamp ranges + scores
- Batch processing for long transcripts
- Database storage: save scores in PostgreSQL for clipping stage

### Deliverables:

- Semantic segment detector (groups related sentences, 10-30 seconds each)
- Virality scoring engine (0-100 scale, normalized)
- Database schema: `scores` table with columns:
  - `id, podcast_id, segment_start_sec, segment_end_sec, virality_score, transcript_snippet`
- Backend endpoint: `POST /podcasts/{id}/analyze` (triggers async background job)
- Service function: `analyze_and_score(podcast_id, transcription_result) -> list[ScoreSegment]`
- Unit tests for scoring logic (mock transcripts with known sentiment)
- Performance benchmark: score a 60-min transcript in <5 min

### Acceptance Criteria:

- ✅ Scores correlate with subjective "highlight" review by team
- ✅ Processing doesn't block user (async background job, stored in DB)
- ✅ Results stored durably in `scores` table for clipping stage to consume
- ✅ Clear error responses for malformed transcripts
- ✅ Top 3-5 segments per 60-min video score >70/100
- ✅ Segments are non-overlapping and cover meaningful content
- ✅ API returns `AnalysisResult` with list of scored segments

### Utility/Backend Specs:

**Service location:** `backend/app/services/analysis_service.py`

**Model location:** `backend/app/models/analysis.py`

**Suggested core function:**
```python
def analyze_and_score(
    podcast_id: str,
    transcription_result: TranscriptionResult,
) -> list[ScoreSegment]:
    """Analyze transcript and return scored segments (30-60s each)."""
    ...
```

**Suggested result contract:**
```python
class ScoreSegment(BaseModel):
    segment_start_seconds: float
    segment_end_seconds: float
    duration_seconds: float
    virality_score: float  # 0-100
    transcript_snippet: str
    sentiment: Literal["positive", "neutral", "negative"]
    keywords: list[str]  # extracted engagement keywords

class AnalysisResult(BaseModel):
    podcast_id: str
    total_segments_analyzed: int
    top_scoring_segments: list[ScoreSegment]  # sorted by score DESC
    average_score: float
    processing_time_seconds: float
```

**Integration contract for Job 3:**
- Input: podcast_id (Job 3 queries `scores` table)
- Output: Top N segments by virality_score, ready to clip
- Usage: Job 3 will fetch scores and use timestamps for FFmpeg slicing

### Non-goals for Job 2:

- ❌ Speaker emotion detection (beyond sentiment)
- ❌ Background music/content rating
- ❌ Topic classification
- ❌ Auto-generated chapters (future Sprint)

---

## 🎯 JOB 3: SPRINT 3 FFmpeg Clipping & Subtitle Burning

**Owner:** Penar Kera  
**Focus:** Output generation - Video export  
**Issue:** #22

### Scope:

- Build FFmpeg wrapper service: `backend/app/services/clipping_service.py`
- Extract top N segments by virality score from analysis results
- Precision video slicing at exact timestamps (±10ms accuracy)
- Generate SRT subtitle files with burned-in captions from transcripts
- Handle multiple audio tracks and video formats
- Create clip storage strategy (Supabase Storage)
- Export finalized clips to user-accessible folder
- Error handling: corrupted video, missing segments, timeout

### Deliverables:

- FFmpeg subprocess wrapper with safety checks and timeout
- Clip extraction service (configurable duration: 30–60s per clip)
- Subtitle burn-in pipeline (SRT generation + ffmpeg filter)
- Async job queuing for large batch exports
- Backend endpoint: `POST /podcasts/{id}/generate-clips` (triggers async job)
- Database schema: `clips` table with columns:
  - `id, podcast_id, clip_number, clip_start_sec, clip_end_sec, s3_url, subtitle_url, created_at`
- Service function: `generate_clips(podcast_id: str, score_segments: list[ScoreSegment]) -> list[ClipResult]`
- Unit tests for FFmpeg command building and subtitle generation
- Local test: generate 3 sample clips from sample video

### Acceptance Criteria:

- ✅ Clips are precisely cut (no audio/video desync, match timestamps ±10ms)
- ✅ Subtitles are synchronized with video and readable (no overlap, clear timing)
- ✅ Users can download clips via authenticated S3 or Supabase URL
- ✅ Processing completes 60-min video with 3-5 clips within 20-min SLA
- ✅ Graceful handling of invalid timestamps or missing audio
- ✅ All clips stored durably with metadata in `clips` table
- ✅ API returns `ClipGenerationResult` with list of clip URLs
- ✅ Clips work in standard video players (mp4, h264 codec)

### Utility/Backend Specs:

**Service location:** `backend/app/services/clipping_service.py`

**Model location:** `backend/app/models/clipping.py`

**Suggested core function:**
```python
def generate_clips(
    podcast_id: str,
    score_segments: list[ScoreSegment],
    transcription_result: TranscriptionResult,
) -> list[ClipResult]:
    """Generate video clips from segments, with burned-in subtitles."""
    ...
```

**Suggested result contract:**
```python
class ClipResult(BaseModel):
    clip_number: int  # 1, 2, 3, ...
    clip_start_seconds: float
    clip_end_seconds: float
    duration_seconds: float
    virality_score: float
    video_url: str  # S3 or Supabase Storage URL
    subtitle_text: str  # SRT content
    status: Literal["ready", "processing", "failed"]

class ClipGenerationResult(BaseModel):
    podcast_id: str
    total_clips_generated: int
    clips: list[ClipResult]
    processing_time_seconds: float
    download_url: str  # folder or manifest
```

**Integration contract from Job 2 & Storage:**
- Input: podcast_id, fetch scores from `scores` table, get transcription from `podcasts.transcript_json`
- Output: Clips stored in S3/Supabase, metadata in `clips` table
- Usage: Frontend (Sprint 4) will fetch clip URLs and display for download

### Non-goals for Job 3:

- ❌ Frontend UI for viewing clips (Sprint 4)
- ❌ Advanced video effects or transitions
- ❌ Multiple quality tiers (720p/1080p switching)
- ❌ Real-time preview generation

---

## 📋 Sprint 3 Workflow & Dependencies

```
Job 1 (Transcription) 
    ↓ publishes TranscriptionResult contract
Job 2 (Analysis) 
    ↓ consumes Transcription, publishes AnalysisResult
Job 3 (Clipping) 
    ↓ consumes Analysis, exports final clips to storage
```

### Zero-Blocker Rules:

1. **Job 1** publishes `TranscriptionResult` model early (Week 1)
   - Job 2 can mock Whisper output and test scoring algorithm independently
   - Job 2 doesn't need to wait for real Whisper API integration

2. **Job 2** publishes `AnalysisResult` model early (Week 2)
   - Job 3 can mock scoring results and test FFmpeg clipping independently
   - Job 3 doesn't need to wait for real semantic analysis

3. **Job 3** can test clip generation against dummy timestamp ranges
   - Use sample video files from `backend/tests/fixtures/` or YouTube download

4. **Database schema** updates happen in parallel
   - Migrations for `scores` and `clips` tables can be applied independently
   - Each job creates its own SQL file: `backend/sql/transcription_schema.sql`, etc.

---

## 🎬 Non-Goals for Sprint 3:

- ❌ Frontend UI for viewing/downloading clips (Sprint 4)
- ❌ Stripe webhook confirmation before Whisper starts (already done in Sprint 2)
- ❌ Real-time streaming transcription (batch only)
- ❌ Multi-language support (English only for MVP)
- ❌ Speaker diarization ("who said what")
- ❌ Advanced video effects or transitions
- ❌ Automatic chapter generation
- ❌ Social media platform export (TikTok/Instagram API)
