# Native cloud read connections71 — 2026-11-09

## Work location and preservation

Development resumes in `F:/jindan-dotnet` (native WinForms MDI, nine feature DLLs).
The earlier changes in `F:/jindan` remain saved and are not reverted or imported.
Historical FINAL70/R6 bundles, source receipts, company reports and workspaces remain untouched.
This change does not inherit earlier review approval: reportReady=false, supervisorAccepted=false.

## Implemented native path

- `Jindan.Contracts/CloudRead71.cs`: additive opt-in `ICloudWorkspaceAccess` and read service contracts. No feature-to-feature references or UI types in common contracts.
- `Jindan.Infrastructure/CloudRead71.cs`: native .NET HttpClient provider. No Electron/WebView2 bridge, inherited token/configuration, or browser-cookie reuse.
- `Jindan.Desktop.Contracts/CloudWindows71.cs`: native connection, Drive and board dialogs. The host exposes File → Drive · Firebase 연결; Files and Board DLLs expose their server-read dialogs.
- Google desktop OAuth uses the system browser, PKCE S256, random state and a bounded loopback callback. Only `drive.readonly` is requested. The selected root must be an accessible non-trashed folder. Listing supports pagination/shared-drive flags, hides the existing system names, checks pagination loops/limits and restricts navigation/download to discovered items. Download stages a bounded (256 MiB) new partial file and publishes only after completion. Unsupported native Google document export is explicitly refused.
- Firebase password login preserves the legacy `firebaseIdentity.js` ID/password derivation. Firebase ID tokens, rather than service account/admin credentials, are sent to Firestore so server rules still apply. The member profile must be active and match the entered ID; activity is rechecked for every board request. Exact collections are `jindan_members`, `jindan_board_posts`, `jindan_board_comments`. Existing post IDs, author/title/content, attachment metadata and comments are read; deleted posts are excluded. HTML is displayed as plain text, never executed.
- Passwords/secrets/tokens are not persisted. User enters new connection settings explicitly; browser consent is performed by the user. Tokens expire after at most one hour and require reconnection. Closing the local session invalidates pending responses and disposes connections.
- All cloud operations currently exposed are reads/authentication. Local CRUD and its outbox remain separate; server writing, automatic migration or maintenance is not enabled.

## Diagnostics

Each process writes a capped `diagnostics/session-*.jsonl` under its execution root.
Events cover startup, local login, loaded/opened module IDs, cloud connection,
board lists/comments, Drive lists/downloads, failure and cancellation.
Only fixed operation/module/error codes, elapsed time and counts are accepted.
Passwords, API keys, tokens, URLs, account names, filenames, documents and raw provider errors are excluded.
Logging failure does not interrupt the application.

## Compatibility and delivery

Files/Board advance to 1.0.1 and declare `requiredHostCapabilities: ["cloud-read/71"]`.
The new host validates this requirement. Earlier strict manifest parsers reject
the new field instead of silently treating the packages as compatible.
This first connection release requires the coordinated new host/common DLLs;
it is not a Files-only patch for FINAL70. Existing compatible modules retain 1.0.0.
Do not overwrite an immutable review package. Package into a new directory,
then create a separate runnable copy with a fresh local workspace.

## Validation and boundaries

`tests/Jindan.Cloud.Tests` uses synthetic HttpMessageHandler responses and a real
loopback OAuth callback, with no company/cloud requests. It checks credential
derivation, active-member checks, permission failures, selected-post comments,
OAuth state/PKCE, root verification, pagination, file bytes, unknown selection,
disconnect cancellation and log redaction. Test output: `artifacts/cloud71-tests.log`.
The existing `run-checks70.mjs` runs baseline/report/local/module regressions.

Real company settings and user authentication are still required for live verification.
Unfinished: cloud upload/edit/delete, Firebase board writes/attachments download,
Google-format export/folder ZIP, persisted connection profiles and token refresh,
real provider integration into the project/process sync outbox, and explicit
project-to-cloud-folder/account mapping. Live root folder availability is not
equivalent to local project authorization. No completed-write or full cloud parity claim is made.

Sources used for the connection protocol:
- https://developers.google.com/identity/protocols/oauth2/native-app
- https://firebase.google.com/docs/reference/rest/auth/
- https://firebase.google.com/docs/firestore/use-rest-api
