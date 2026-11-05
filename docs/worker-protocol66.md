# Local report worker protocol66

`jindan-worker/1` is a local, versioned, one-request-per-Node-process transport.
It runs the repaired single-origin engine under
`src/Jindan.Report.Worker/engine/src/services/report`. It does not start Hancom,
use COM/OLE, install fonts, read credentials, invoke paid providers, upload, or
modify source documents. `reportReady=false` is mandatory in every envelope.

Document/archive/image binary sidecars have the same160MiB maximum as document
inputs. The serialized result/analysis JSON bundle keeps its separate192MiB
maximum. Oversized binary data is rejected before that sidecar is atomically
written; it cannot be exported successfully only to fail later source reimport.
The C# adapter independently applies160MiB to every binary descriptor. The sole
smaller test-limit injection is the explicit `test:binary-limit` operation behind
`JINDAN_WORKER_TEST=1`; production cannot override these limits through parameters
or an arbitrary environment limit.

## Additional bound local operations66

- `locate`: owned bundle plus `parameters.rowId`. PDF uses its exact analysis
  page anchor. Native input searches independent renderer text-layout runs,
  including text boxes/cells; multiple page matches are explicitly ambiguous
  candidates. It does not assert actual Hancom pagination.
- `specification`: owned HWPX bundle; `action=inspect` derives the real section
  profile, `validate` checks `context.spec`, and `apply` calls the existing
  immutable-source restoration writer. Role fonts, paragraph indents/spacing/
  break settings, margins, furniture slots/alignment, object positions and
  pictures use source SHA, real object IDs and actual evidence descriptors.
  Picture dimensions are checked before decoding. Same-format bytes remain
  unchanged; PNG/JPEG/WebP conversion keeps original pixel dimensions. This
  formatting copy retains past content and is separate from a current draft.
- `discipline`: owned HWPX bundle; file-only `context.workspace`/`payload`.
  inspect/addTableFields/addCellField/setField/removeField/setValue/setRule/
  removeRule/replaceEditor/confirmSchema/setNotes/confirmManualNotes/newRun/
  restoreRun/buildSummary/exportCollection/importCollection reuse the original
  deterministic engine. Saved state never replaces fresh source/document
  bindings. Value-only edits preserve schema revision; schema changes invalidate
  confirmation. Empty current inputs never inherit past cells.
- `electrical`: owned bundle, exact evidence hashes and imported metadata.
  Source plan is rebuilt rather than trusted from old state. Eight group links,
  KEPCO scope and thermal delivery states are review candidates, not generated
  measurements or judgments.
- `inspectLegacyProject`: exact archive SHA; existing
  `projectArchive.readProjectArchive` verifies schema, duplicate ZIP names,
  paths/limits, file SHA/size/type and references. Files are sidecars; old title,
  chapters and document settings become allowlisted read-only historical
  context. Old actors/permissions/executable analysis/field values/acknowledgment
  are never adopted. Explicit host confirmation imports new/deduplicated IDs
  into the current authorized project and clears executable analysis/review.
  Imported data is historical and cannot implicitly become current evidence.
  The transport160MiB input/512MiB aggregate caps remain narrower than the old
  maximum512MiB archive contract; oversized inputs fail rather than bypass it.

`inspectMaterial` accepts `parameters.includeImages='true'` for original BMT
embedded images. Unbounded/unsupported image dimensions produce explicit
preview limitations; metadata and original bytes remain separate. No OCR is
enabled. CAD preview uses the separate local original-geometry adapter.

## Launch and session ownership

Host creates a fresh, private session directory per request and copies only the
required input files there. Start the explicitly selected Node binary with
`[absoluteWorkerPath, absoluteSessionDirectory]`, `shell=false`, hidden window,
redirected stdin/stdout/stderr. Write one JSON request (optional final newline),
close stdin, and await process exit. Never invoke a command shell or find/kill a
process by name. Reusing a session whose `output` already exists is refused.

The JavaScript reference client exports:

```js
import {invokeWorker} from './src/Jindan.Report.Worker/worker-client.mjs';
const result = await invokeWorker({
  nodePath: process.execPath,
  workerPath: 'F:/jindan-dotnet/src/Jindan.Report.Worker/worker.mjs',
  sessionDirectory: '<fresh owned session directory>',
  request, timeoutMs: 120000, signal, onProgress
});
```

It resolves an envelope after the owned child exits, including cancellation and
timeout. `workerPid` and `workerExited` are client audit fields, not engine proof.
Its signal handler kills only its `ChildProcess`, waits for `close`, ignores any
pending success, and reports `CANCELLED`. Timeout similarly reports `TIMEOUT`.
Noncooperative synchronous CPU work is interrupted by terminating this disposable
owned process. This is stronger than a Promise race or an AbortSignal alone.
No browser/native/unrelated application process is terminated.

## Request

```json
{
  "protocol": "jindan-worker/1",
  "requestId": "unique-request-id",
  "projectId": "project:isolated-synthetic",
  "sourceSha256": "<64 lowercase hex>",
  "operation": "analyze",
  "parameters": { "filename": "source.hwpx" },
  "files": {
    "source": { "path": "input/source.hwpx", "sha256": "<64 lowercase hex>" }
  }
}
```

Metadata is at most64KiB. IDs are bounded ASCII, project ID uses the portable
engine's `project:` grammar. Source SHA is the hash of `files.source`, or
`files.archive` for recovery. No inline source/bundle/context bytes or base64.
`parameters` contains small operation selectors; human/source content belongs in
hashed JSON files. Input JSON is bounded/depth checked and rejects dangerous
prototype keys. Unknown/missing operation adapters never report success.

Each file descriptor is `{path,sha256}`. Paths may be absolute or session-relative.
Worker resolves every input with `realpath`, requires a regular file strictly
inside the session and outside output, checks declared SHA and length, and reads
copies. Symlinks/junctions resolving outside the session are refused. Individual
files are nonempty and at most160MiB; bundle-named files are at most192MiB.
Total input bytes are at most512MiB, at most1000 file keys/evidence entries,
further restricted by the64KiB request. This transport deliberately has a
narrower individual archive limit than the core's512MiB recovery archive limit.
It never relaxes underlying engine limits or binding validation.

Supported file keys:

| Key | Content |
|---|---|
| source | Exact source bytes, required for ordinary operations |
| bundle | Exact engine analysis bundle JSON (`analyze` result's `value`) |
| context | Draft/review/evidence metadata JSON or operation context |
| filled | Returned HWPX collection bytes |
| referenceSource | Paired original HWPX bytes |
| referenceBundle | Paired original HWPX analysis bundle JSON |
| textReview | Optional paired-text review JSON |
| archive | Recovery ZIP, used with `recover` |
| evidence | Array of `{id,path,sha256}` for every context material |
| other bounded key | Explicit file referenced by `createRecovery` context.fileKey |

## Operation mapping

| Operation | Files and selectors | Core method |
|---|---|---|
| analyze | source; parameters.filename | analyze |
| pairReference | PDF source/bundle, referenceSource/referenceBundle, optional textReview | pairReference |
| restore | PDF source/bundle, parameters.chapterId, context.settings/spec | restore |
| prepareDraft | source/bundle/context/evidence | prepareDraft |
| writeDraft | source/bundle/context/evidence | writeDraft |
| exportCollection | source/bundle/context/evidence | exportCollection |
| importCollection | source/bundle/context/evidence/filled; parameters.filename | importCollection |
| exportArtifact | source; parameters.filename | exportArtifact |
| createRecovery | source plus explicit keyed files; context.files/state | createRecovery |
| recover | archive (or source); sourceSha256 is archive SHA | recover |
| preview | source; parameters.page (1-based), scale0.5..2 | bounded direct-source PDF or HWP/HWPX renderer |
| inspectMaterial | source; parameters.filename | BMT/PWV/CSV/XLSX diagnostics or report analysis |
| readThermalBmt / readPowerView | source; parameters.filename | explicit local raw-reader diagnostics |
| cadPreview | source; parameters.filename keeps original DWG/DXF extension | local CAD render adapter |

For `createRecovery`, context.files contains core metadata
`{id,role,filename,parentIds,fileKey}`; `fileKey` selects exact loaded file bytes.
`evidence:<id>` selects the matching loaded evidence item, allowing immutable
sources, candidate lineage and review evidence to accompany the archive.
Core validates roles, hashes, parents/cycles and archive limits. For `recover`,
output files are sidecar binary descriptors and all recovered native edits still
require fresh analysis/review. Serialized recovered state is never approval.

Portable recoveredDraftSession is a host workflow boundary, not an automatically
persisted worker object. The .NET host must enforce fresh analysis and review of
the selected recovered source before draft/collection writes. It must not pass
old bundle/review from arbitrary recovered state as a fresh acknowledgment.

## Stdout and output files

Stdout is newline-delimited bounded progress/result envelopes, never raw document
text, binary, API credentials, library diagnostics or base64. Each envelope echoes
protocol/requestId/projectId/sourceSha256/operation/reportReady. Only safe stage
IDs and bounded numeric page/total/current fields are forwarded as progress.
The client rejects mismatched IDs, duplicate result, progress after result,
malformed JSON, oversized lines and oversized aggregate protocol output. Library
console diagnostics are suppressed. Stderr is drained without exposing/logging
its untrusted content. Error text is fixed generic guidance; core error code is
retained when valid, never arbitrary caught exception text.

Successful result:

```json
{
  "protocol":"jindan-worker/1", "type":"result", "ok":true,
  "requestId":"...", "projectId":"project:...", "sourceSha256":"...",
  "operation":"analyze", "reportReady":false,
  "resultFile": {
    "path":"<session>/output/result-0001.json",
    "sha256":"...", "size":1234, "mediaType":"application/json"
  },
  "result_value": {"contractVersion":"jindan-report-engine/1","resultBytes":1234,"sourceSha256":"..."}
}
```

`resultFile` is the full facade result JSON `{ok,operation,contractVersion,value,
reportReady}`. `result_value` is only a small noncontent summary; it is not the
bundle. Every ArrayBuffer/typed-array in the result is replaced by:

```json
{"$workerFile":{"path":"<session>/output/result-0001.bin","sha256":"...","size":1234,"mediaType":"application/octet-stream"}}
```

Binary files and final JSON are written to new `.tmp` files with exclusive-create,
then atomically renamed within output. Final JSON is at most192MiB. The client
checks final descriptor containment/size/SHA after successful exit. Consumers
must also validate every referenced binary descriptor before use or export, and
only consume files following a matching successful result and clean exit. A
canceled/crashed session can contain incomplete/orphan output; quarantine it,
never publish it as a candidate. Filenames/output descriptors are not approval.

`pngBytes` uses `.png` and mediaType `image/png`; other binary payloads use
`.bin` and `application/octet-stream`. Direct preview returns pageNumber,
pageCount, sourceSha256, width/height, renderer and `layoutVerified=false`.
HWP/HWPX always enters the WASM renderer as those exact native bytes; it never
uses a linked PDF. Its SVG is bounded and rejects scripts, foreignObject,
declarations/entities, event handlers, CSS execution and external references
before local Napi rasterization. `measureTextWidth` uses actual canvas font
metrics. PDF preview is an original-page render; it is never a background in
generated HWPX. Renderer success is not native Hancom layout/edit approval.

Failure returns `{type:'result',ok:false,error:{code,message},...boundIDs}`.
Client transport failures include TIMEOUT, CANCELLED, WORKER_CRASH,
WORKER_START_FAILED, STALE_RESULT, INVALID_PROTOCOL and INVALID_RESULT_FILE.
Root and typed-array source buffers remain unchanged. Session files are local
artifacts; caller retention/cleanup is explicit and limited to owned sessions.

## Runtime and limitations

Node and npm dependency versions are pinned in the new project's package/lock.
Native HWPX analyze/write/collection/recovery use the repaired JS engine. PDF
analysis uses local pdfjs worker. OCR is not default or a fallback; missing image
or font capabilities fail explicitly. Embedded-font metadata is not actual
native font selection. Hancom SaveAs picture preservation is conditional on the
independently verified auto-reduction-off setting, which this worker never
changes. Source JSON/embedded-font/tab roundtrip limitations remain separate.

Test-only `test:hang`, `test:cpu`, `test:crash`, `test:echo`, `test:wrong-id`,
`test:validate-svg`
operations require inherited process environment `JINDAN_WORKER_TEST=1`.
A request cannot enable these operations. Production host must leave it unset.

## Reproducible process tests

The C# owner additionally closes request admission on Dispose, cancels in-flight
generations and drains only its actual owned Process references synchronously.
It does not enumerate or kill by name. Single and two simultaneous CPU children
and STA shutdown are regression-tested; canceled work cannot publish success.
The reusable adapter validates protected/UNC/reparse output roots and runtime
paths before creating its first session directory. Binary limits remain160MiB
in/out; JSON remains a distinct192MiB boundary.

```powershell
node --test tests/WorkerProtocol/*.test.cjs
```

Tests create isolated synthetic session directories under system temp; they do
not use corporate reports, native GUI, credentials or live services. They execute
actual subprocess timeout/noncooperative CPU cancellation, pre-cancellation,
crash/retry, concurrent ownership, stale IDs, path/hash/size/reuse guards, exact
native source analysis, pending/stale draft rejection, and binary artifact
sidecars. Exact latest counts are reported by the execution log, not inherited
from earlier tests. No native/company approval is implied.
