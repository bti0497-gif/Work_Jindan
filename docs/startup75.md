# Native startup75 — 2026-11-09

## Accepted workflow

- Keep the single top menu and DLL sidebars. Start maximized, with minimize/close enabled and maximize/resize disabled.
- Before login/project selection finishes, show only a blank white shell and disabled menu bar.
- Compact branded login has ID/password, opt-in ID persistence and no local-account setup. Firebase verifies the existing legacy ID/password transformation; an active member profile is required. No local-password fallback.
- The user explicitly approved reuse of only the prior application's public Firebase project ID and web API key. They are embedded in Desktop/Assets/server-public.json. Existing branding assets are reused. No password, token, OAuth secret or other configuration was copied.
- After login the Projects DLL supplies the modal project chooser: creation inputs/buttons on the left; server project list on the right. Create refreshes/selects the new row, Open revalidates that the selected project remains available, and only then opens the workbench with that context.
- Cancel/Escape/window close asks “종료하시겠습니까?”. Cancel closes only the confirmation. OK exits without entering the workbench. Loading/creating cannot be double-submitted.

## Server and preservation boundary

- Existing Firebase Authentication and Firestore security rules apply; no admin credentials or rules changes. Project create is sent only when the user presses Create, using the exact existing jindan_projects schema and a create-only precondition. No test creates a real company project.
- Project list errors are shown as errors, not an empty-project result. Deleted projects are omitted; opening re-fetches membership/list. Server disable/expiry prevents cache access.
- Passwords and tokens remain in memory; opt-in ID storage contains only the ID. Diagnostics contain fixed event codes/counts, not account data or request bodies.
- Server-account caches use a hashed project/UID directory beneath the existing workspace's server-accounts folder. Prior local accounts, data, reports, old Electron sources and frozen packages are untouched. Cache sessions cannot be fabricated from an Identity record or used after disconnect.
- This is startup authentication + server project list/create/open. Existing project update/delete, process/task server synchronization, Drive writes and member administration are not claimed complete. Other existing modules retain their local storage behavior. Prior local work is not automatically migrated into a server account.

## UI74 corrections included

- Reproduced the missing-toolbar issue: maximized borderless MDI child at X=-9,Y=-38 inside a maximized host. The normal-state child now fills the MDI client rectangle without native caption offsets. Resize, repeated navigation and studio return retain documents/drafts.
- Shared grids use automatic header height, minimum column widths and scrolling. File IDs/hashes/folder IDs remain stored but are hidden from normal list/editor controls. File tree/import/attachment actions still own those values.
- Primary command captions match project registration, process addition, task addition and post writing. Local file import is explicitly labelled local; cloud upload parity is not implied.

## Validation

- Release solution build: 0 warnings, 0 errors.
- SimpleUi: 41 checks, including modal create/open, cancel/confirm exit, empty-shell controls, startup context, MDI viewport geometries and dirty-document preservation.
- Cloud: 41 synthetic checks; no real cloud requests. Includes authentication failure, disabled member, forged session, unchanged project IDs, project schema/create precondition and cached scope authorization.
- Domain: 22; local modules: 13; rich text: 18. Total 135 passed.
- The local-module reply-button test now traverses the already-grouped submenu rather than assuming a top-level button; it still executes reply creation and attachment authorization checks.
- Visual inspection: actual native project chooser, left inputs/buttons and right list, readable headers and empty-list guidance. Real user login and real project opening remain manual acceptance steps.

Logs: artifacts/startup75-build.log, startup75-ui-tests.log, startup75-cloud-tests.log, startup75-Jindan.Domain.Tests.log, startup75-Jindan.LocalModules.Tests.log, startup75-Jindan.RichText.Tests.log.

Official protocol reference: https://firebase.google.com/docs/reference/rest/auth/ and https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.documents/commit.

reportReady=false; supervisorAccepted=false. No prior aggregate preservation approval is inherited. The earlier accepted changes in F:/jindan remain saved, so the historical all-files baseline discrepancy is not reset or relabelled as passing.
