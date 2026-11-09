# Native UI simplification — 2026-11-09

User direction: use the old app's basic login/menu scope, defer extra tools, and
switch the main app into a dedicated Report Studio workspace instead of an MDI
child or modal. Existing saved work and report engines must be preserved.

## Changes

- Login uses ID, password, remember ID and Login, matching the old component's
  input scope. Only an explicitly remembered ID is persisted. Passwords are never
  saved by this preference. Failed preference I/O does not fail authentication.
- Existing local .NET authentication remains in place; this is not a claim that
  company Firebase login or account migration is complete. The existing .NET data
  directory is reused at launch without copying account/config files.
- First-run workspace creation is a separate setup dialog, shown as a link only
  when no local account exists; the established user's login has no setup fields.
- Seven familiar top-level entries replace nine always-visible feature entries.
  Member management is visible only to administrators. All nine DLLs still load.
  Duplicate navigation, migration/backup experiments and sync test menus are not
  shown in the normal screen. The underlying implementations are retained.
- Record editors show basic actions, grouping file/view/record operations into
  task menus. The synthetic Drive-cache action is removed from normal UI.
- Rich text retains bold/italic/underline/size, with other formatting under Format.
- Report Studio is a non-top-level, non-MDI document hosted in a dedicated surface.
  Business menus/tabs/MDI client are hidden. The selected project's report panels
  replace the business panels. Back to Work restores the business view without
  closing/recreating either document or changing the report's project context.
- Report Studio's main bar has five groups/actions. Archive/migration/recovery
  and other deferred pages are removed from normal navigation; engines and
  persisted workspace fields remain intact. No existing reports were modified.
- No-project report startup now requests project selection instead of reporting
  a generic work-list read failure.
- Launch uses the WinExe apphost, `Jindan.Desktop.exe`, instead of starting the
  console `dotnet.exe` as the visible application. Health checks still use the
  runtime in the calling process.

## Validation

- Release solution build: zero errors/warnings.
- Focused native UI checks: 19 passed, including studio embedding, no duplicate
  studio instances, business/report input retention across return/reentry,
  project context retention, studio close, and login preferences.
- Existing rich text checks: 18 passed. One old test's selector was updated from
  the former alignment button to the corresponding Format menu item; its
  unchanged-formatting/dirty-state assertion is unchanged.
- Candidate 1 is retained as test evidence. Candidate 2 includes the final Format
  context-menu wiring and normalized text files.
- Test evidence: `artifacts/simple72-ui-tests.log`,
  `artifacts/simple72-richtext-tests.log`, `artifacts/simple72-build.log`.
- Final candidate: `artifacts/ready-for-review/simple72-r2`, stable source snapshot,
  nine verified module packages, zero build warnings/errors. The focused 19 checks
  were repeated successfully against its module packages:
  `artifacts/simple72-ui-final-tests.log`.
- The compiled apphost's PE subsystem is Windows GUI (2). The launcher uses this
  apphost rather than the console runtime process.
- Interactive launcher: `tools/start-simple72.ps1`; separate executable copy:
  `artifacts/product-patch66-simple72-session/application`. It connects to the
  existing .NET data directory under the prior cloud71 interactive copy. Neither
  source candidates nor the old Electron workspace are used as writable app data.
- Interactive copy verification completed: 3,216 files matched the preserved
  candidate (`artifacts/product-patch66-simple72-session/COPY_RESULT.json`).
- Native module health check on that interactive copy exited successfully (0).
  The interactive launcher also rejects startup while the previous app's
  exclusive installation lock is held.
- Automatic close of the earlier owned development app was stopped when the
  computer-use tool detected concurrent user input. The user was asked to close
  it directly; no process was forcibly terminated and no unsaved work discarded.
  The user subsequently confirmed closing it. The launcher passed its lock and
  module checks and started `Jindan.Desktop.exe` (initial PID 34612). Observed the
  new compact login screen with ID/password, remember ID and Login; no first-run
  setup fields or app console window were present. Existing .NET account/data
  path was reused. The user completed authentication; login success and all nine
  module loads were verified in the new session diagnostics.
- Live UI inspection confirmed seven business menu entries, compact project/file
  command bars, dedicated full-workspace Studio, Back to Work, and Studio reentry.
  No records or report content were created/modified for the live UI check. Studio
  was left open with the project-selection prompt. The title bar still appends the
  underlying maximized business document's name; this cosmetic caption issue is
  recorded separately from the successful workspace switch.

Live company-server verification remains pending as described in cloud-read71.md.
The earlier preservation baseline differences remain disclosed in
development-resume71.md; this UI work does not reset that baseline or claim that
the aggregate historical gate passes. No deployment, commit or push.

`reportReady=false`, `supervisorAccepted=false`.
