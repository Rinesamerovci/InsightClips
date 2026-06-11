# Rinesa Bislimi Lista 2 Audit

Ky dokument ndan kerkesat e listes se dyte sipas scope-it, qe puna te
vazhdoje pa prekur payment, pa marre punet e Penar Kera dhe pa hyre ne
render/AI internals te Rinesa Merovci.

## Te Kryera Ne Kod

- Invalid Supabase refresh token cleanup.
  - Implementuar ne `frontend/context/AuthContext.tsx`.
  - Session artifacts pastrohen kur Supabase kthen invalid refresh token.

- Password policy per register/reset/profile.
  - Implementuar ne `frontend/lib/password-policy.ts`.
  - Register, reset password dhe profile password update kerkojne:
    - se paku 8 karaktere
    - shkronje
    - numer
    - karakter special

- Feedback/support/contact submit.
  - Backend ruan mesazhet ne `public.user_messages`.
  - Backend tenton SMTP notification kur env vars jane konfiguruar.
  - Frontend tregon qarte nese email notification u dergua apo vetem u ruajt ne Supabase.

- Contact email nga account-i i loguar.
  - Settings form e merr email-in nga user-i i loguar.
  - Fusha eshte read-only qe reply te shkoje te user-i i sakte.
  - Backend gjithashtu e imponon `contact_email` nga profili i user-it te loguar,
    edhe nese dikush e therret API-n direkt me email tjeter.

- Source media persistence per upload/YouTube.
  - Source media mund te ruhet ne Supabase Storage `podcast-sources`.
  - Analysis dhe clipping mund te materializojne source media nga Supabase Storage.
  - Kjo shmang varjen nga `/tmp` pas restartit te Render.

- Publishing revoke/download lifecycle.
  - Revoke pastron `published`, `download_url`, `published_at`.
  - Backend tenton te fshije objektin nga bucket `clips`.
  - Download route vazhdon te jete ownership-checked.

- Analytics backend counts.
  - `view_count`, `download_count`, `average_virality_score`, `publish_rate`
    llogariten ne backend kur kolonat ekzistojne.
  - Ka fallback per database me schema me te vjeter.

## Kerkojne Konfigurim Jasht Kodit

- SMTP email real.
  - Duhet env vars ne `backend/.env.local` per localhost dhe Render env per deployment.
  - Pa keto, mesazhet ruhen ne Supabase por nuk dergohet email.

- Supabase Storage policies.
  - Duhet te leshohet `backend/sql/storage_policies.sql` ne Supabase SQL Editor.

- Render/Supabase live validation.
  - Duhet test live me upload, analyze, generate, publish pas konfigurimit.

## Nuk Preken Nga Rinesa Bislimi

- Payment, Stripe, checkout, free trial minute accounting, paid gating.
  - Keto jane jashte scope-it te ketij branch/hapi.

- UI polish i faqes kryesore.
  - Footer, demo video, homepage stats/copy, responsive header/nav jane kryesisht scope i Penar Kera.

- Upload UI states dhe mobile polish.
  - Error visuals, white button styling, selected platform UI dhe responsive polish jane UI scope.

- Export settings UX.
  - "No changes to save" dhe settings polish jane kryesisht Penar Kera.

- Render/FFmpeg/transcription/generation speed.
  - Gjenerimi qe vonon, vetem nje klip, subtitle burn, overlay/crop/audio combinations jane kryesisht scope i Rinesa Merovci.

- Delete account.
  - Implementuar si hard delete i sigurt pas vendimit qe per projektin tone
    privatësia dhe pastrimi total jane sjellja me e mire.
  - Backend nuk pranon `user_id` nga frontend.
  - User duhet te konfirmoje email-in e account-it.
  - Cleanup perfshin source media, generated clip objects, local generated
    folders, profile/database cascade, dhe Supabase Auth user.

## Te Mbetura Per Rinesa Bislimi Ose Bugfix Te Sigurt

1. Verifikim qe frontend-i e shfaq qarte statusin e SMTP. Kryer.
2. Verifikim qe backend-i kthen `email_notification_sent` ne te gjitha route-at:
   feedback, support, contact. Kryer.
3. Verifikim qe docs tregojne sakte env vars per SMTP dhe storage. Kryer.
4. Teste per pjeset e mesiperme. Kryer.

## Verdikti I Listes 2 Per Scope-in E Rinesa Bislimit

Pjeset e Rinesa Bislimit nga lista 2 jane implementuar ne kod. Mbeten vetem
konfigurimet qe duhet te behen jashte kodit per test live:

- SMTP env vars
- Supabase `storage_policies.sql`
- live deployment test

Pjeset e tjera te listes 2 nuk duhet te preken ne kete scope sepse i takojne
payment, UI ose render/AI pipeline.
