# SPRINT 10: Analytics Intelligence, Recommendations, and Release Hardening
## Role-Based Task Assignment

Based on the formal roles defined in the project:
- Rinesa Merovci - Lead AI Developer (Core Engine)
- Rinesa Bislimi - Backend Developer (Data Pipeline)
- Penar Kera - Full-stack Developer (UX and Client Logic)

---

## Sprint Description

Sprint 10 focuses on making the platform intelligent and presentation-ready. The goal is to deliver measurable clip insights, content recommendations, and a polished analytics experience while hardening the application for final testing and demonstration. This sprint emphasizes decision-support features for users and confidence-building features for the development team.

---

## JOB 1 - SPRINT 10 Clip Insights and Recommendation Intelligence

**ASSIGNED TO: Rinesa Merovci**

Suggested GitHub Issue Title: `Sprint 10 - Recommendation scoring and clip insight intelligence`
Role: Lead AI Developer (Core Engine)
Formal Responsibility: AI logic, ranking heuristics, content-scoring optimization, and semantic intelligence

### Responsibilities

- Improve recommendation logic for surfaced clips
- Refine insight scoring for engagement-oriented metrics
- Support meaningful ranking signals using transcript and clip metadata
- Tune logic so recommendations remain explainable and deterministic
- Validate output quality using manual review and automated tests

### Scope

This job expands the intelligence layer beyond generation. Deliverables include:
1. Recommendation logic that promotes high-value clips
2. Insight scoring that summarizes why a clip is likely to perform well
3. Search and ranking support that helps users discover strong output quickly
4. Clear result structures for frontend analytics and recommendation panels

### Deliverables

- **Service updates:** `backend/app/services/recommendation_service.py`
- **Service updates:** `backend/app/services/clip_insights_service.py`
- **Service updates:** `backend/app/services/search_service.py`
- **Model updates:** `backend/app/models/clip_insights.py`
- **Model updates:** `backend/app/models/search.py`
- **Unit Tests:** `backend/tests/test_recommendation_service.py`
- **Unit Tests:** `backend/tests/test_clip_insights_service.py`
- **Unit Tests:** `backend/tests/test_search_service.py`

### Acceptance Criteria

- Recommendation output stays stable for the same input dataset
- Insight scores include interpretable ranking factors
- Search results prioritize relevant podcasts or clips consistently
- Tests cover edge cases for ranking and scoring logic
- Manual review confirms top-ranked clips are reasonable

### Non-Goals

- Deep-learning retraining pipelines
- User-personalized recommendations based on long-term history
- External analytics provider integrations

---

## JOB 2 - SPRINT 10 Analytics API, Aggregation, and Final Backend Hardening

**ASSIGNED TO: Rinesa Bislimi**

Suggested GitHub Issue Title: `Sprint 10 - Analytics aggregation endpoints and backend hardening`
Role: Backend Developer (Data Pipeline)
Formal Responsibility: Protected APIs, database-backed metrics delivery, validation, and reliability

### Responsibilities

- Expose backend endpoints for clip metrics and podcast analytics
- Aggregate publish, view, and download signals into frontend-ready payloads
- Protect analytics endpoints with authentication and ownership rules
- Improve backend consistency for final testing and demonstration
- Close validation gaps across podcast, clip, and publishing data paths

### Scope

This job makes analytics measurable and reliable. Deliverables include:
1. Backend metrics APIs for clip-level and podcast-level insights
2. Secure ownership checks to prevent cross-user data exposure
3. Stable response contracts for charts, summaries, and KPI cards
4. Additional tests for final regression protection

### Deliverables

- **Router updates:** `backend/app/routers/podcasts.py`
- **Router updates:** `backend/app/routers/clips.py`
- **Service updates:** `backend/app/services/podcast_service.py`
- **Service updates:** `backend/app/services/publishing_service.py`
- **Service updates:** `backend/app/services/profile_service.py`
- **Model updates:** `backend/app/models/podcast.py`
- **Model updates:** `backend/app/models/publishing.py`
- **Unit Tests:** `backend/tests/test_podcasts_analysis_router.py`
- **Unit Tests:** `backend/tests/test_podcast_service.py`
- **Unit Tests:** `backend/tests/test_publishing_routes.py`

### Acceptance Criteria

- Authenticated users can request analytics only for their own podcasts and clips
- Metrics endpoints return totals, trend values, and top-performing clips cleanly
- Error responses are consistent for missing, invalid, and unauthorized resources
- Regression tests pass for analytics and protected-route behavior
- Backend is stable enough for end-to-end demo flow

### Non-Goals

- Real-time websocket analytics streaming
- Multi-tenant admin reporting
- Paid reporting exports in CSV or PDF format

---

## JOB 3 - SPRINT 10 Analytics Dashboard, Discovery UX, and Final Demo Polish

**ASSIGNED TO: Penar Kera**

Suggested GitHub Issue Title: `Sprint 10 - Analytics dashboard and recommendation experience polish`
Role: Full-stack Developer (UX and Client Logic)
Formal Responsibility: Dashboard UI, client-side state management, protected flows, and visual polish

### Responsibilities

- Complete the analytics page and recommendation display flow
- Improve search and discovery experience for podcasts and generated clips
- Integrate backend metrics into charts, cards, and comparative summaries
- Polish navigation and empty/loading/error states for final presentation
- Make sure the final demo journey feels consistent across pages

### Scope

This job presents the platform’s intelligence clearly to end users and evaluators. Deliverables include:
1. A usable analytics dashboard with key clip and podcast metrics
2. Recommendation and discovery UI that highlights valuable content
3. Better state handling across dashboard, analytics, podcasts, and clips pages
4. Final presentation polish for a cohesive lab-project demonstration

### Deliverables

- **Page updates:** `frontend/app/analytics/page.tsx`
- **Page updates:** `frontend/app/dashboard/page.tsx`
- **Page updates:** `frontend/app/podcasts/page.tsx`
- **Page updates:** `frontend/app/clips/page.tsx`
- **API client updates:** `frontend/lib/api.ts`
- **Tests:** `frontend/tests/analytics.test.tsx`
- **Tests:** `frontend/tests/api.test.ts`

### Acceptance Criteria

- Analytics page loads real backend metrics successfully
- Users can identify top-performing clips and summary trends quickly
- Search and discovery flows reduce friction when browsing podcast outputs
- Loading and error states are clear across major dashboard pages
- Frontend tests cover analytics rendering and API integration

### Non-Goals

- Advanced chart customization editors
- Cross-platform mobile app UI
- Marketing website redesign

---

## Sprint 10 Expected Outcome

By the end of Sprint 10, InsightClips should deliver measurable clip-performance insights, recommendation-assisted discovery, and a polished analytics workflow supported by secure backend aggregation and final demo-ready frontend UX.
