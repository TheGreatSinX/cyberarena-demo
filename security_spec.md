# Security Specification: QuizArena

## 1. Data Invariants
- **Non-authoritative browser**: Players can never write directly to game status, timers, scores, leaderboard, or other players' data.
- **Answer confidentiality**: Private answer data containing `correctOptionId` is stored under `games/{gameId}/privateQuestions/{questionId}` and is strictly denied from read/write by client SDKs.
- **Admin authentication & verification**: Admin-only collections (`users`, `quizzes`, `quizzes/{quizId}/questions`, `auditLogs`) require an authenticated user with verified email, matching administrator profile, or matching runtime bootstrapped admin email `webdev.cybernetics@gmail.com`.
- **Game public access**: Players with a valid game PIN may read the public `games/{gameId}` document and the `games/{gameId}/questions/{questionId}` snapshots for the active game.
- **Session integrity**: A player can only join via verified server logic or strictly validated schema where `sessionToken` protects identity, preventing impersonation or arbitrary score modification.
- **Audit trail immutability**: Audit logs are append-only by verified administrators and cannot be altered or deleted.

## 2. The "Dirty Dozen" Threat Payloads
1. **Direct Score Injection**: Player attempts `db.collection('games').doc(gameId).collection('players').doc(playerId).update({ score: 999999 })` -> Rejected (PERMISSION_DENIED).
2. **Ghost Answer Sniffing**: Player attempts `db.collection('games').doc(gameId).collection('privateQuestions').doc(qId).get()` -> Rejected (PERMISSION_DENIED).
3. **Premature Game Advancing**: Unauthenticated user attempts `db.collection('games').doc(gameId).update({ status: 'FINISHED' })` -> Rejected (PERMISSION_DENIED).
4. **Spoofed Admin Quiz Deletion**: Non-admin attempts `db.collection('quizzes').doc(quizId).delete()` -> Rejected (PERMISSION_DENIED).
5. **Junk ID Poisoning**: Payload with 2KB junk document ID attempting to exhaust quota -> Rejected by `isValidId()` check.
6. **Audit Log Erasure**: Disgruntled user attempting `db.collection('auditLogs').doc(id).delete()` -> Rejected.
7. **Nickname Impersonation / Double Joining**: Client attempting to overwrite existing player record -> Rejected.
8. **Role Escalation in Profile**: User attempting to set `role: "SUPER_ADMIN"` or `disabled: false` -> Rejected.
9. **Question Answer Leakage on Quiz**: Non-admin attempting to list unpublished quiz questions -> Rejected.
10. **Timer Bypass**: Player writing an answer directly after `questionEndsAt` -> Rejected.
11. **Negative or Infinite Score Exploit**: Negative score payload or NaN score payload -> Rejected.
12. **Unverified Email Impersonation**: Attacker authenticating with `webdev.cybernetics@gmail.com` without `email_verified == true` -> Rejected.

## 3. Validation Logic Architecture
- All documents validate through standalone `isValid[Entity]()` helper functions.
- Every string is bounded by `.size() <= MAX`.
- Path variables guarded by `isValidId()`.
- Default deny catch-all `match /{document=**} { allow read, write: if false; }`.
