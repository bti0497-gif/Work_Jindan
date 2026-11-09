# WPF startup76 — 2026-11-09

## Scope and authorization

The approved compact mockup is implemented as native WPF + WPF UI 4.3.0.
The user requested only the blank main shell, login, and mandatory project
selection/creation, connected to the existing company server. This supersedes
the earlier no-cloud implementation restriction for these operations only.
Only the previously approved public Firebase settings and brand resources are
linked from Desktop/Assets. No credentials, tokens, legacy sessions, company
records, or report files were copied. No test creates a company project.

No deployment/package/EXE or installer is produced. `UseAppHost=false` builds
development DLLs; the existing verified SDK hosts the development UI without a
console window. Existing WinForms sources, startup75, report engine, legacy
Electron source, frozen handoffs, and existing workspace are preserved.

## Native DLL boundaries

- `src/Wpf/Jindan.Wpf.Desktop`: common host, server composition, blank maximized
  shell, single menu row, explicit startup-module inventory. Minimize and close
  remain available; restore/resize/maximize controls are disabled.
- `src/Wpf/Jindan.Wpf.Shared`: shared window contract, compact WPF UI resources,
  branding and exit confirmation.
- `src/Wpf/Jindan.Wpf.Login`: login window DLL; ID, password, opt-in remember ID.
- `src/Wpf/Jindan.Wpf.Projects`: project chooser DLL; left create form, right
  detail grid (project name/start/end), 760 DIP width and 34 DIP rows.
- `src/Wpf/Jindan.Startup`: UI-independent startup contract, selection state,
  duplicate-action protection and remembered-ID persistence.
- `src/Wpf/Jindan.Startup.Server`: adapter to existing CloudReadService71 and
  server startup75. Feature DLLs receive an interface, never another feature DLL.

The development host loads only the two named DLLs from `modules/`; it never
scans arbitrary assemblies. These WPF DLLs are not yet enrolled into the old
signed/trusted manifest patch pipeline. That existing pipeline is untouched;
distribution and per-feature patch packaging remain a later integration step.

## Workflow and data behavior

1. Show the maximized empty shell with one disabled menu row.
2. Open the compact, branded login modal. Firebase verifies the existing
   ID/password transformation and requires an active member profile. No local
   account bootstrap or offline-login fallback exists in this host.
3. After successful login, open the Projects DLL modal and fetch
   `jindan_projects` from the company Firestore using that user's bearer token.
   Original document IDs are retained, deleted records omitted, no fake/sample
   project is inserted into the app.
4. Selection enables Open; Open rechecks membership and fetches current projects
   before accepting the selected document. Deleted/unavailable records cannot
   open using a stale cached row.
5. Create validates name/dates, uses the existing schema, and applies a
   create-only document precondition. An uncertain response retains both the
   request ID and original input; retry resolves that same document first.
   Successful creation selects the new project for Open.
6. Cancel, Escape and X ask `종료하시겠습니까?`. Cancel dismisses only the
   confirmation; OK cancels pending work and exits the app.
7. Successful selection sets the host's current project and title. The workspace
   intentionally stays empty in this limited implementation. Project selection
   and Logout are enabled; other business menus are visible but disabled until
   their WPF workspace/sidebar DLLs are implemented.

Expired/revoked authentication offers re-login. Listing failures are distinct
from an empty list, clear stale options, and offer Refresh. Server-side project
update/delete, processes/tasks, Drive and report editing are outside this step.

User preferences and fixed-code diagnostics live under
`%LOCALAPPDATA%/Deojon/Jindan/Wpf`. Only ID is optionally persisted; passwords
and bearer tokens remain in memory. No project names/contents are logged.

## Validation and development

```powershell
& ./tools/dotnet.ps1 restore Jindan.Wpf.slnx --configfile src/Wpf/NuGet.Config --locked-mode
& ./tools/dotnet.ps1 build Jindan.Wpf.slnx --no-restore -c Debug
& ./tools/dotnet.ps1 run --project tests/Jindan.Wpf.Startup.Tests --no-restore -c Debug
& ./tools/dotnet.ps1 run --project tests/Jindan.Cloud.Tests --no-restore -c Debug
# Only when interactive development verification is wanted:
& ./tools/start-wpf76.ps1
```

WPF UI and its abstraction package are pinned to 4.3.0 with lock files. The
official NuGet source is scoped to the new WPF tree; old NuGet.Config is unchanged.
API/theme references: https://wpfui.lepo.co/documentation/themes.html and
https://wpfui.lepo.co/api/Wpf.Ui.Controls.TitleBar.html.

Automated validation: 35 new synthetic startup/UI/HTTP checks and 41 existing
cloud regression checks pass. Tests include failed login, membership revocation,
legacy protocol/field compatibility, retained document IDs, create-only requests,
lost response retry, deleted-project revalidation, duplicate-action blocking,
remember-ID clearing, actual XAML construction/rendering, compact control sizing,
empty startup shell, exit decisions, DLL independence and module loading.

Evidence: `artifacts/wpf76-tests.log`, `artifacts/wpf76-cloud-regression.log`,
`artifacts/wpf76-tests/{main,login,projects}.png`. Images use synthetic records.
Native developer login window was visually inspected. The user subsequently
entered credentials directly: the development session recorded successful
company authentication and an authenticated project-list read at
2026-11-09 16:03:44–16:03:45 KST, then normal disconnect at 16:04:00 KST.
The user subsequently confirmed “로그인 완료 — 프로젝트 목록 표시됨”.
No project-selected event was recorded before exit. The exact list count and
project opening have not yet been independently verified; a follow-up window
inventory confirmed that the development app was closed. No real project was
created or modified by this verification. Synthetic creation/retry checks must
not be presented as live-server write acceptance.

reportReady=false; supervisorAccepted=false. No native report acceptance or
old preservation gate is promoted by this UI work.
