# SPRINT 9: Publishing Workflow, Profile Management, and Export Personalization
## Role-Based Task Assignment

Based on the formal roles defined in the project:
- Rinesa Merovci - Lead AI Developer (Core Engine)
- Rinesa Bislimi - Backend Developer (Data Pipeline)
- Penar Kera - Full-stack Developer (UX and Client Logic)

---

## Sprint Description

Sprint 9 focuses on turning generated clips into a creator-ready workflow. The goal is to let authenticated users manage their profile, personalize subtitle and export preferences, and publish clips through a secure backend pipeline. This sprint connects the technical clip-generation engine with practical creator-facing delivery features.

---

## JOB 1 - SPRINT 9 Export Presets, Subtitle Styling, and Overlay Intelligence

**ASSIGNED TO: Rinesa Merovci**

Suggested GitHub Issue Title: `Sprint 9 - Export presets and overlay-aware clip personalization`
Role: Lead AI Developer (Core Engine)
Formal Responsibility: Mathematical extraction logic, processing optimization, FFmpeg execution, and clip-quality intelligence

### Responsibilities

- Extend export logic for platform-ready video outputs
- Improve subtitle styling and timing consistency for generated clips
- Refine overlay mapping so visual assets match clip category and tone
- Support reusable presets for social publishing formats
- Validate that rendering logic stays stable across multiple clip durations

### Scope

This job strengthens the AI and media-processing side of the product after clip generation. Deliverables include:
1. Reusable export settings for common publishing destinations
2. Subtitle rendering rules that improve readability without harming sync accuracy
3. Smarter overlay selection tied to content tags or podcast categories
4. Stable media output contracts that frontend and backend can consume safely

### Deliverables

- **Service updates:** `backend/app/services/media_service.py`
- **Service updates:** `backend/app/services/overlay_mapping_service.py`
- **Model support:** `backend/app/models/export_settings.py`
- **Schema support:** `backend/sql/export_settings_schema.sql`
- **Overlay assets validation:** `backend/assets/overlays/`
- **Unit Tests:** `backend/tests/test_overlay_mapping_service.py`
- **Unit Tests:** `backend/tests/test_media_utils.py`

### Acceptance Criteria

- Export presets support at least vertical and landscape output options
- Subtitle styles remain readable on short and long clips
- Overlay selection is deterministic and category-aware
- Output rendering does not break existing clipping flow
- Tests cover preset validation and overlay mapping behavior

### Non-Goals

- Direct publishing to third-party social media APIs
- Full AI-generated captions rewriting
- Real-time editing preview inside the browser

---

## JOB 2 - SPRINT 9 Secure Publishing and User Settings API

**ASSIGNED TO: Rinesa Bislimi**

Suggested GitHub Issue Title: `Sprint 9 - Secure publishing API and user settings persistence`
Role: Backend Developer (Data Pipeline)
Formal Responsibility: Database models, authentication networking, protected routing, and persistence contracts

### Responsibilities

- Finalize authenticated profile and publishing endpoints
- Persist export preferences and publication metadata in the database
- Enforce authorization on user-specific settings and publishing actions
- Strengthen request validation for clip publishing workflows
- Guarantee API responses are clean for frontend consumption

### Scope

This job formalizes the backend contract for user-facing creator tools. Deliverables include:
1. Protected profile retrieval and update flows
2. Persistent export settings for each authenticated user
3. Publishing records that track clip destination, status, and metadata
4. Error handling for unauthorized access, invalid payloads, and missing clips

### Deliverables

- **Dependency/Auth updates:** `backend/app/dependencies/auth.py`
- **Router updates:** `backend/app/routers/users.py`
- **Router updates:** `backend/app/routers/clips.py`
- **Service updates:** `backend/app/services/profile_service.py`
- **Service updates:** `backend/app/services/publishing_service.py`
- **Model updates:** `backend/app/models/profile.py`
- **Model updates:** `backend/app/models/publishing.py`
- **Schema support:** `backend/sql/auth_schema.sql`
- **Schema support:** `backend/sql/publication_schema.sql`
- **Schema support:** `backend/sql/export_settings_schema.sql`
- **Unit Tests:** `backend/tests/test_profile_service.py`
- **Unit Tests:** `backend/tests/test_publishing_service.py`
- **Unit Tests:** `backend/tests/test_publishing_routes.py`

### Acceptance Criteria

- Only authenticated users can view or modify their profile and settings
- Publishing requests validate clip ownership before execution
- Export settings persist correctly and load back without data loss
- Publishing API returns clear status values for pending, published, and failed flows
- Tests cover authorization, validation, and data persistence

### Non-Goals

- Full billing expansion for paid publishing tiers
- Team accounts or multi-user workspace sharing
- External webhook integrations for social platforms

---

## JOB 3 - SPRINT 9 Creator Dashboard Integration and Settings UX

**ASSIGNED TO: Penar Kera**

Suggested GitHub Issue Title: `Sprint 9 - Profile, settings, and publishing UX integration`
Role: Full-stack Developer (UX and Client Logic)
Formal Responsibility: Next.js dashboard design, client state management, and user-facing workflow integration

### Responsibilities

- Build the frontend flow for profile editing and settings management
- Connect clip actions to publishing and export-preference APIs
- Surface subtitle styling and export options in a usable UI
- Improve loading, success, and error states across creator pages
- Keep visual consistency between dashboard, clips, profile, and settings pages

### Scope

This job turns the backend publishing workflow into a usable experience. Deliverables include:
1. A settings page for export and subtitle preferences
2. A profile page that supports viewing and editing user information
3. Clip action controls for publish/export-related actions
4. Client-side API integration with protected backend endpoints

### Deliverables

- **Page updates:** `frontend/app/profile/page.tsx`
- **Page updates:** `frontend/app/settings/page.tsx`
- **Page updates:** `frontend/app/clips/page.tsx`
- **Component updates:** `frontend/components/SubtitleStylePanel.tsx`
- **Component updates:** `frontend/components/UserProfileCard.tsx`
- **API client updates:** `frontend/lib/api.ts`
- **Utility updates:** `frontend/lib/subtitle-style.ts`
- **Tests:** `frontend/tests/api.test.ts`
- **Tests:** `frontend/tests/clips.test.tsx`

### Acceptance Criteria

- Users can update profile fields through the UI
- Settings form persists export and subtitle choices successfully
- Publishing controls show success and failure states clearly
- Protected pages redirect gracefully when auth is missing
- Frontend tests cover the new settings and publishing interactions

### Non-Goals

- Full drag-and-drop timeline editor
- Social-media account linking UI
- Mobile-native application support

---

## Sprint 9 Expected Outcome

By the end of Sprint 9, InsightClips should support a complete creator-side management flow: authenticated profile handling, persistent export preferences, and a secure publishing-ready clip workflow with polished frontend controls.
