# Quickhand release fixes implementation plan

**Goal:** Fix the ten reviewed defects and add offline regressions without account access, publication or commits.

**Architecture:** Keep the existing MV3 modules and storage layout. Recognize named or page-discovered shortcuts only; share text-entry guards and punctuation normalization in keys.js. Preserve local records and synchronize settings through serialized background mutations.

**Spec:** The review and user authorization in this conversation; extension/README.md notification rules.

**Constraints:** No external service calls, no account scripts, no commits. Keep active-strength hints unrestricted, mascot data URLs and existing logos. Retain rolling 24-hour repeat/reminder intervals; clarify that wording rather than silently changing it.

- [x] Input and parser: failing tests for Option/AltGr/IME, unknown combinations, valid editing keys, comma/shift symbols and two-step sequences; implement and run the suite.
- [x] Site recognition: failing tests for keyboard-generated clicks, Mac fallback modifiers and Drive Control+V prefixes; implement and verify mouse/key identity.
- [x] Engine: failing tests for ten-use learning, active-mode pending hints, stale daily-cap entries, keyboard-only records and missing legacy fields; implement and run the suite.
- [x] Background: failing tests for simultaneous setting patches and command toggles, concurrent records and worker restart; serialize settings mutations and run the suite.
- [x] Validate with offline Chrome fixtures, full npm test, npm run pack, ZIP exclusion checks and git diff checks. Review the resulting changes and report remaining live-site limitations.

Decisions: The user approved the review's fixes; no additional design approval is needed. Add Mac Drive Control+V recognition symmetrically with the existing Control+C mapping, without claiming live Google verification. Keep unknown combinations out of new records; retain existing records so they remain inspectable and deletable.

Validation: Initial regression run failed 20 tests on the reviewed defects. Final Node suite passed 64/64 and offline Chrome passed 4/4. Independent read-only review caught Option+Arrow editing and compact/hyphen comma cases; both were reproduced RED and fixed GREEN. Packaging succeeds and excludes development files. No account scripts, external services, publication or commits were used. Mac behavior is simulated; live Google UI, real macOS and extension-update integration still require manual release checks.
