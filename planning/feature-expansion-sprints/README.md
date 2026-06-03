# FEATURE EXPANSION SPRINT PLAN
## Role-Based Task Assignment

Based on the formal roles defined in the project:
- Rinesa Bislimi - Backend Developer (Data Pipeline)
- Penar Kera - Full-stack Developer (UX and Client Logic)
- Rinesa Merovci - Lead AI Developer (Core Engine)

---

## Why These Features Matter

These features can make **InsightClips** more useful and more unique.

### Why the project becomes more useful

- Users get more control over how clips are generated
- Users can choose visual style, templates, subtitles, clip count, and clip duration
- Users get planning help after generation through content-calendar suggestions
- Users get reusable hashtag recommendations for each generated clip
- Users can import content directly from YouTube instead of uploading files manually
- Users get a feedback and support area inside the platform

### Why the project becomes more unique

- The platform moves beyond basic podcast clipping and becomes a content-production assistant
- Automatic source or book overlays make the video output feel smarter and more contextual
- Hashtag recommendations connect generation with publishing strategy
- Content calendar suggestions connect one podcast to a multi-platform posting workflow

---

## Delivery Viewpoint

Delivering all requested features as a polished implementation in **1 week** would be too risky for a 3-person team.

The bigger features are:
- visual mode switching for output style
- automatic source or book graphics appearing in the correct moment
- prompt-based generation controls
- content calendar generation
- YouTube import for podcast processing
- hashtag recommendation generation

### Recommendation

Use **3 sprints** so the work stays realistic, balanced, and presentable.

If needed, Sprint 1 can already produce a strong demoable improvement while Sprints 2 and 3 add the smarter and more unique features.

---

# SPRINT 11: Custom Generation Controls and Visual Style Foundation
## JOB 1 - Backend Generation Settings and Clip Configuration

**ASSIGNED TO: Rinesa Bislimi**

Suggested GitHub Issue Title: `Sprint 11 - Generation settings API and user configuration support`
Role: Backend Developer (Data Pipeline)
Formal Responsibility: Data models, protected APIs, request validation, and feature persistence

### Responsibilities

- Create backend support for generation settings chosen by the user
- Add request fields for clip duration, number of clips, topic focus, and subtitles on or off
- Support saving or reusing preferred generation settings
- Validate user requests so generation inputs remain safe and consistent

### Scope

This job creates the backend contract for user-controlled generation. Deliverables include:
1. Generation settings model updates
2. Request validation for clip-generation preferences
3. API support for user-selected export behavior
4. Tests for valid and invalid settings payloads

### Deliverables

- **Model updates:** `backend/app/models/clipping.py`
- **Model updates:** `backend/app/models/export_settings.py`
- **Router updates:** `backend/app/routers/clips.py`
- **Service updates:** `backend/app/services/clipping_service.py`
- **Unit Tests:** `backend/tests/test_clipping_service.py`
- **Unit Tests:** `backend/tests/test_export_settings_model.py`

### Acceptance Criteria

- Users can submit clip duration, number of clips, subtitles choice, and topic guidance
- Invalid settings are rejected with clean error messages
- Backend response contracts are stable for frontend integration
- Tests cover normal, invalid, and edge-case inputs

### Non-Goals

- Final AI prompt optimization for all use cases
- Personalized saved presets across many devices

---

## JOB 2 - Templates, Text Design, and User Settings UI

**ASSIGNED TO: Penar Kera**

Suggested GitHub Issue Title: `Sprint 11 - Templates and generation settings interface`
Role: Full-stack Developer (UX and Client Logic)
Formal Responsibility: Dashboard UX, configuration flows, and frontend integration

### Responsibilities

- Build the UI where users choose templates and text styles
- Add controls for number of clips, clip length, subtitles, and topic prompt
- Present font and text-style options clearly
- Make the settings flow easy to use before generation starts

### Scope

This job gives users visible control over output generation. Deliverables include:
1. A settings panel for generation preferences
2. Template selection UI
3. Text or font style selection UI
4. Frontend integration with backend generation settings

### Deliverables

- **Page updates:** `frontend/app/clips/page.tsx`
- **Page updates:** `frontend/app/upload/page.tsx`
- **Component updates:** `frontend/components/SubtitleStylePanel.tsx`
- **API client updates:** `frontend/lib/api.ts`
- **Tests:** `frontend/tests/api.test.ts`
- **Tests:** `frontend/tests/clips.test.tsx`

### Acceptance Criteria

- Users can configure generation settings before clip creation
- Template and text-style controls are understandable and usable
- Frontend sends settings correctly to backend APIs
- Empty, loading, and error states are handled clearly

### Non-Goals

- Full design-system overhaul
- Marketing site redesign

---

## JOB 3 - Video Mode Buttons and Style Rendering Foundation

**ASSIGNED TO: Rinesa Merovci**

Suggested GitHub Issue Title: `Sprint 11 - Video mode rendering and style-switching foundation`
Role: Lead AI Developer (Core Engine)
Formal Responsibility: AI/video pipeline logic, rendering behavior, and export-quality rules

### Responsibilities

- Implement the first version of the 3 output modes
- Support mode selection such as original people, book-like style, and stylized animated presentation
- Define how overlays, subtitles, and rendering behavior differ by mode
- Prepare the rendering pipeline for future visual expansion

### Scope

This job establishes the technical base for multiple clip styles. Deliverables include:
1. A mode-selection contract that reaches the rendering layer
2. First-pass logic for switching video output behavior
3. Clear fallback behavior when a style cannot be fully rendered
4. Tests for deterministic mode selection behavior

### Deliverables

- **Service updates:** `backend/app/services/media_service.py`
- **Service updates:** `backend/app/services/clipping_service.py`
- **Model updates:** `backend/app/models/media.py`
- **Unit Tests:** `backend/tests/test_media_utils.py`
- **Unit Tests:** `backend/tests/test_clipping_service.py`

### Acceptance Criteria

- System accepts 3 visual output modes
- Render pipeline behaves consistently based on selected mode
- Unsupported style cases fail gracefully
- Tests confirm mode selection does not break export flow

### Non-Goals

- Fully cinematic AI animation generation
- Advanced character generation with external model pipelines

---

# SPRINT 12: Smart Context Features, Hashtag Recommendations, and Product Support
## JOB 1 - Feedback System and Content Calendar Backend

**ASSIGNED TO: Rinesa Bislimi**

Suggested GitHub Issue Title: `Sprint 12 - Feedback endpoints and content calendar backend contracts`
Role: Backend Developer (Data Pipeline)
Formal Responsibility: Secure APIs, data structures, validation, and service reliability

### Responsibilities

- Create backend endpoints for feedback, support, and contact messages
- Add backend support for content calendar generation output
- Define a structured response for platform-specific post suggestions
- Validate ownership and protect access to generated planning data

### Scope

This job supports user communication and post-generation planning. Deliverables include:
1. Feedback and support request APIs
2. Content calendar response models
3. Basic scheduling suggestion structure for TikTok, LinkedIn, and YouTube
4. Tests for submission flows and planning outputs

### Deliverables

- **Router updates:** `backend/app/routers/users.py`
- **Service updates:** `backend/app/services/profile_service.py`
- **Service updates:** `backend/app/services/publishing_service.py`
- **Model updates:** `backend/app/models/publishing.py`
- **Model updates:** `backend/app/models/profile.py`
- **Unit Tests:** `backend/tests/test_profile_service.py`
- **Unit Tests:** `backend/tests/test_publishing_service.py`

### Acceptance Criteria

- Users can submit feedback or support requests from the application
- Backend returns structured content calendar suggestions for generated clips
- Publishing-plan data is stable and protected
- Tests cover valid and invalid request flows

### Non-Goals

- Real posting automation to every social platform
- Full customer-support ticketing system

---

## JOB 2 - Feedback UI, Content Calendar UI, and Hashtag Recommendation Experience

**ASSIGNED TO: Penar Kera**

Suggested GitHub Issue Title: `Sprint 12 - Feedback pages, calendar planning UI, and hashtag recommendation display`
Role: Full-stack Developer (UX and Client Logic)
Formal Responsibility: Product UX, user flows, frontend integration, and presentation polish

### Responsibilities

- Add a feedback or contact area for users
- Build the UI for content calendar recommendations
- Present clip-specific hashtag suggestions in a useful way
- Make it easy for users to reuse planning content after clip generation

### Scope

This job turns backend planning features into a clear product experience. Deliverables include:
1. Feedback and support page or panel
2. Content calendar display for generated clips
3. Hashtag recommendation section per clip
4. Smooth integration into existing dashboard and clips flow

### Deliverables

- **Page updates:** `frontend/app/clips/page.tsx`
- **Page updates:** `frontend/app/dashboard/page.tsx`
- **Page updates:** `frontend/app/settings/page.tsx`
- **API client updates:** `frontend/lib/api.ts`
- **Tests:** `frontend/tests/clips.test.tsx`
- **Tests:** `frontend/tests/analytics.test.tsx`

### Acceptance Criteria

- Users can view suggested posting plans for their generated clips
- Users can see recommended hashtags for each clip
- Feedback or contact flow is available and understandable
- Frontend handles empty and partial planning data clearly

### Non-Goals

- Social media post composer with drag-and-drop scheduling
- CRM or inbox management system

---

## JOB 3 - Source Detection, Timed Overlays, and Hashtag Intelligence

**ASSIGNED TO: Rinesa Merovci**

Suggested GitHub Issue Title: `Sprint 12 - Mention detection, timed source overlays, and hashtag intelligence`
Role: Lead AI Developer (Core Engine)
Formal Responsibility: Semantic detection, content intelligence, and timeline-aware rendering logic

### Responsibilities

- Detect when the speaker mentions a book, source, concept, or named reference
- Trigger a visual overlay at the relevant moment in the clip
- Generate relevant hashtag suggestions from transcript meaning and clip topic
- Keep the logic deterministic and explainable

### Scope

This job adds the most unique AI-style enhancement to the product. Deliverables include:
1. Mention-detection logic for transcript text
2. Timed overlay mapping for visual source appearance
3. Clip-level hashtag recommendation generation
4. Tests for detection quality and result structure

### Deliverables

- **Service updates:** `backend/app/services/overlay_mapping_service.py`
- **Service updates:** `backend/app/services/analysis_service.py`
- **Service updates:** `backend/app/services/recommendation_service.py`
- **Model updates:** `backend/app/models/overlay.py`
- **Model updates:** `backend/app/models/clip_insights.py`
- **Unit Tests:** `backend/tests/test_overlay_mapping_service.py`
- **Unit Tests:** `backend/tests/test_analysis_service.py`
- **Unit Tests:** `backend/tests/test_recommendation_service.py`

### Acceptance Criteria

- System can detect at least basic named references from transcript data
- Overlays appear at the correct approximate timestamps
- Each clip can return a set of relevant recommended hashtags
- Logic stays testable and stable for repeated runs

### Non-Goals

- Perfect named-entity recognition for every possible source
- Fully autonomous fact verification for mentioned books or references

---

# SPRINT 13: YouTube Import, Integration Polish, and Release Readiness
## JOB 1 - YouTube Import Backend and Processing Integration

**ASSIGNED TO: Rinesa Bislimi**

Suggested GitHub Issue Title: `Sprint 13 - YouTube import backend flow and ingestion validation`
Role: Backend Developer (Data Pipeline)
Formal Responsibility: Ingestion security, validation, job orchestration, and storage integration

### Responsibilities

- Add backend support to ingest podcasts directly from YouTube
- Validate URLs and protect the import pipeline from malformed requests
- Connect imported media to the existing processing flow
- Store metadata needed for podcast creation and tracking

### Scope

This job reduces friction in the ingestion flow. Deliverables include:
1. Backend endpoint for YouTube import requests
2. Validation rules for accepted sources
3. Job integration into existing upload or processing flow
4. Tests for valid, invalid, and failure scenarios

### Deliverables

- **Router updates:** `backend/app/routers/upload.py`
- **Service updates:** `backend/app/services/upload_service.py`
- **Service updates:** `backend/app/services/podcast_service.py`
- **Model updates:** `backend/app/models/upload.py`
- **Unit Tests:** `backend/tests/test_upload_service.py`
- **Unit Tests:** `backend/tests/test_podcast_service.py`

### Acceptance Criteria

- Users can submit a YouTube link for processing
- Invalid URLs are rejected clearly
- Imported content can enter the normal generation pipeline
- Tests cover failure handling and expected metadata behavior

### Non-Goals

- Playlist import
- Bulk channel ingestion

---

## JOB 2 - YouTube Import UI and Final Product Polish

**ASSIGNED TO: Penar Kera**

Suggested GitHub Issue Title: `Sprint 13 - YouTube import interface and final UX polish`
Role: Full-stack Developer (UX and Client Logic)
Formal Responsibility: Frontend workflow design, integration, and final user-facing polish

### Responsibilities

- Add a YouTube import flow in the frontend
- Integrate import submission with the backend
- Polish the end-to-end journey from import to generated clips
- Improve consistency across templates, settings, hashtags, and planning UI

### Scope

This job makes the feature set feel connected instead of scattered. Deliverables include:
1. A clear YouTube import entry point
2. Import status handling in the UI
3. Improved consistency across generation-related pages
4. Final UX polish before team review or presentation

### Deliverables

- **Page updates:** `frontend/app/upload/page.tsx`
- **Page updates:** `frontend/app/podcasts/page.tsx`
- **Page updates:** `frontend/app/dashboard/page.tsx`
- **API client updates:** `frontend/lib/api.ts`
- **Tests:** `frontend/tests/api.test.ts`
- **Tests:** `frontend/tests/clips.test.tsx`

### Acceptance Criteria

- Users can start generation from a YouTube URL in the UI
- Frontend handles loading, validation, and failure states properly
- The workflow feels consistent with file-upload generation
- Final UI reflects the new advanced feature set cleanly

### Non-Goals

- Browser extension capture
- Direct in-app YouTube playback editing

---

## JOB 3 - Render Quality, Final Integration, and Output Reliability

**ASSIGNED TO: Rinesa Merovci**

Suggested GitHub Issue Title: `Sprint 13 - Rendering polish, output reliability, and final intelligence integration`
Role: Lead AI Developer (Core Engine)
Formal Responsibility: Export reliability, video-output consistency, and intelligence-layer integration

### Responsibilities

- Improve the quality and consistency of final clip rendering
- Ensure styles, overlays, subtitles, and hashtags work together correctly
- Reduce generation errors caused by mode or overlay combinations
- Prepare the final pipeline for team testing and demonstration

### Scope

This job focuses on integration quality, not just new feature count. Deliverables include:
1. Stronger render reliability across output modes
2. Stable coexistence of overlays, subtitles, and style templates
3. Better final output consistency for demos and review
4. Targeted tests for pipeline regressions

### Deliverables

- **Service updates:** `backend/app/services/media_service.py`
- **Service updates:** `backend/app/services/clipping_service.py`
- **Service updates:** `backend/app/services/overlay_mapping_service.py`
- **Unit Tests:** `backend/tests/test_media_utils.py`
- **Unit Tests:** `backend/tests/test_overlay_mapping_service.py`
- **Unit Tests:** `backend/tests/test_clipping_service.py`

### Acceptance Criteria

- Mixed feature combinations do not break clip generation
- Subtitles, overlays, and styles render together consistently
- Final exports stay stable enough for team review and presentation
- Regression tests protect the most failure-prone generation paths

### Non-Goals

- Full video editor timeline for manual frame-by-frame editing
- Studio-grade animation pipeline

---

## Summary of Hashtag Feature

The hashtag feature should be included as part of generated clip intelligence.

### Suggested Product Behavior

- After a clip is generated, the system returns recommended hashtags for that clip
- Hashtags should be based on transcript topic, clip context, and target platform if available
- Users should be able to copy or reuse the hashtag suggestions when posting

### Suggested Ownership

- **Rinesa Merovci:** hashtag-generation logic and relevance scoring
- **Penar Kera:** hashtag display in clip results UI
- **Rinesa Bislimi:** response models and API delivery support if needed

---

## Final Recommendation

For team delivery, the safest plan is:
- **Sprint 11:** control and customization
- **Sprint 12:** smart context, support, and hashtags
- **Sprint 13:** YouTube import and final integration polish

This split keeps the jobs balanced across the 3 teammates while also making the project visibly stronger for GitHub, demos, and presentation.
