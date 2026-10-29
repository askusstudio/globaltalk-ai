# GlobalTalk AI — Antigravity implementation task

You are the senior full-stack engineer. Work directly in this repository.

## Non-negotiable security
- Keep `GEMINI_API_KEY` on the server only.
- Use the server's short-lived Live API ephemeral token endpoint for browser connections.
- Before any public deployment, require Firebase Authentication for token provisioning, verify Firebase ID tokens on the server, add per-user rate limits, and configure CORS to the production origin only.
- Never loosen Firestore rules to public read/write.

## Build order
1. Install dependencies, run frontend and backend, inspect errors, and fix them.
2. Verify the Live API model identifier and SDK API shape against current official docs; update if needed.
3. Make audio input/output resilient: AudioWorklet, buffering, interruption handling, reconnect/session resumption, cleanup and browser permission errors.
4. Add authenticated cloud progress: sessions, learner profile, vocabulary, milestones, reviews and assessment history.
5. Implement spaced repetition (SM-2-inspired or another documented algorithm) with due dates, Again/Hard/Good/Easy ratings, and unit tests.
6. Add a tutor-initiated end-of-session recap. Store only the necessary transcript and allow transcript deletion/export.
7. Add a skill assessment rubric with evidence quotes and clearly labelled estimated scores. Do not claim objective pronunciation scoring without a dedicated evaluation model.
8. Add user controls for microphone permission, transcript retention and data deletion.
9. Add automated tests and browser verification.
10. Update README with exact setup, known limitations, environment variables and deployment steps.

## Definition of done
- `npm run build` succeeds.
- Voice start/end and permission-denied paths are handled.
- The tutor asks follow-up questions in the selected language and adapts to level and session mode.
- Session history and vocabulary reviews persist across signed-in devices.
- A user can export and delete their own records.
- Security rules and server auth checks are tested.
- README describes only features that were actually verified.
