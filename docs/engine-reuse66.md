# Reusable engine boundary66

The future PDF application is unchanged. Reuse is provided through these local
libraries/protocols, not by copying the MDI shell or launching Hancom.

## Native package inspection

`src/Engines/Jindan.Engine.Package` targets net10.0, uses only BCL and has no UI,
Node or company-data dependency. A consumer references its project/DLL:

```csharp
using Jindan.Engine.Package;
var inventory = NativePackage.InspectHwpx(bytes, ct: cancellationToken);
var recovery = NativePackage.VerifyRecovery(recoveryBytes,
    projectId: "project:synthetic", expectedSha256: expectedHash,
    ct: cancellationToken);
```

The result contains entry and slot-text hashes, section/cell/picture counts or
verified recovery links. PackageLimits bounds entries/expanded/XML/input bytes;
DTD/external resolution, duplicate/path and manifest/link inconsistencies are
rejected. `PackageException.Code` is stable for the documented validation family.
Successful inspection means structural checks passed; it does not reproduce a
page, prove value meaning or accept an old approval. Golden fixtures remain
frozen and are checked independently by JS and C# tests.

## Hybrid report operations

`Jindan.Contracts` is UI independent. A consumer implements its own authenticated
authorization callback and uses `Jindan.Report.Adapter.ReportService` with an
explicit new local data root, Node executable and worker entry. Ship the full
declared ReportStudio worker package, including lockfile runtime dependencies;
the small M1 bundled facade is intentionally not a complete PDF runtime.
The current adapter assembly targets `net10.0-windows` (without a WinForms
dependency); a consuming project must use a compatible Windows target. The
native package inspector and common Contracts separately target plain `net10.0`.

```csharp
using var reports = new Jindan.Report.Adapter.ReportService(
    dataRoot, nodePath, workerPath,
    authorize: (context, operation, ct) =>
        currentRepository.AuthorizeDocumentAsync(actor, context,
            write: operation != "analyze" && operation != "preview", ct));
var result = await reports.ExecuteAsync(documentContext,
    new Jindan.Contracts.ReportCommand("analyze", projectId,
        immutableSourcePath, sourceSha256), progress, cancellationToken);
```

The sample's write policy is deliberately conservative. The application must
also scope every source/evidence asset to the current project, resolve current
persisted user rights and distinguish imported historical state from new facts.
An actor ID in DocumentContext is not an authentication token. No authorization
callback is a conscious standalone-library use, never a safe company-host
default; the production workbench supplies its persisted-role callback.

Keep ContextId stable for one document, use a separate one for another document,
invalidate on source/project/review changes and dispose the service at shutdown.
Dispose cancels admission and waits for only its owned worker processes. SHA,
request/generation and fresh-review gates remain active after recovery; a saved
receipt never restores executable acknowledgement. Review acknowledgement is a
program action, not evidence of a human or native Hancom acceptance.

Worker `jindan-worker/1` uses bounded JSON lines plus immutable hashed sidecars.
See worker-protocol66.md and report-adapter66.md for operation fields, limits,
output descriptors, error/cancellation semantics and reproduction commands.
Binary inputs/outputs are limited to160MiB each; recovered JSON bundles have
their own192MiB bound. Do not log document bodies or transport huge base64
strings. Test-only controls require an explicit test environment and are not
enabled by the workbench.

## Maintenance and remaining gates

Feature DLLs communicate through contracts/injected services, never another
feature DLL. A module patch carries its declared worker/resources/dependencies
and compatible manifest; contract/schema changes need wider reviewed migration.
Do not replace only one assembly if its resource/worker contract changed.

Complex PDF/HWPX layout and CAD remain hybrid. No OCR default, whole-page PDF
background, COM/OLE or paid API is introduced. Exact original font use,
native-save metadata/tab preservation, every editable object and real company
current-data workflow remain unresolved external acceptance gates. Structural,
synthetic GUI and native supervisor results must stay separate by exact SHA.

The consumer's native-save, picture, font, metadata and current-data obligations
are detailed in [preservation-contract66.md](preservation-contract66.md).
