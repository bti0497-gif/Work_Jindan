import {exportDraftCollection,importDraftCollection} from './draftCollection.js';
import { analyzeReport } from './sourceParser.js';
import { writeNativeReport } from './nativeWriter.js';
import { exportNativeCollection, readNativeCollection } from './nativeCollection.js';
import { analyzeReferenceSource } from './referenceAnalyzer.js';
import { inspectPowerView } from './powerView.js';
import { inspectElectricalSource } from './electricalPreparation.js';
import { inspectThermalBmt } from './thermalBmt.js';
import {readInputTables,createReportTextCandidate} from './applicationData.js';
import {writePdfHwpx} from './pdfHwpxWriter.js';
import {inspectRestoration,applyRestorationSpecification} from './restoration.js';
import {writePreparedDraft} from './draftWriter.js';
import {inspectPdfProvenance} from './pdfProvenance.js';
import {extractPdfEmbeddedFonts,verifyPdfEmbeddedFonts} from './pdfEmbeddedFonts.js';

self.onmessage = async ({ data }) => {
    try {
        if(data.action==='extract-pdf-fonts'){const fonts=await extractPdfEmbeddedFonts(data.bytes,data.analysis,data.pages);self.postMessage({fonts},fonts.assets.flatMap(f=>[f.bytes.buffer,f.sourceBytes.buffer]));return;}
        if(data.action==='export-draft-collection'){const output=await exportDraftCollection(data.bytes,data.context);self.postMessage({collectionFile:{...output,bytes:output.bytes.buffer}},[output.bytes.buffer]);return;}
        if(data.action==='import-draft-collection'){self.postMessage({collectionPreview:await importDraftCollection(data.bytes,data.filledBytes,data.filename,data.context)});return;}
        if(data.action==='write-prepared-draft'){const output=await writePreparedDraft(data.bytes,data.context);self.postMessage({candidate:{...output,bytes:output.bytes.buffer}},[output.bytes.buffer]);return;}
        if(data.action==='write-restoration-spec'){const output=await applyRestorationSpecification(data.bytes,data.spec,data.options);self.postMessage({candidate:{...output,bytes:output.bytes.buffer}},[output.bytes.buffer]);return;}
        if(data.action==='write-pdf-hwpx'){if(data.options?.fonts)await verifyPdfEmbeddedFonts(data.plan,data.options.fonts);const output=writePdfHwpx(data.plan,data.options);self.postMessage({candidate:{...output,bytes:output.bytes.buffer}},[output.bytes.buffer]);return;}
        if(data.action==='read-input-tables'){self.postMessage({tables:readInputTables(data.bytes,data.filename)});return;}
        if(data.action==='write-studio-replacement'){const output=await createReportTextCandidate(data.bytes,data.filename,data.sourceSha256,data.target,data.value);self.postMessage({candidate:{...output,bytes:output.bytes.buffer}},[output.bytes.buffer]);return;}
        if(data.action==='inspect-studio-report') {
            const document=await analyzeReport(data.bytes,data.filename);
            const profile=document.format==='hwpx'?await analyzeReferenceSource(data.bytes,data.filename):null;
            const restoration=document.format==='hwpx'?inspectRestoration(data.bytes,document.source.sha256):null;
            const provenance=document.format==='hwpx'?inspectPdfProvenance(data.bytes):null;
            self.postMessage({document,profile,restoration,provenance});return;
        }
        if (data.action === 'inspect-thermal-bmt') {
            const thermal = await inspectThermalBmt(data.bytes, data.filename, { includeImages: true });
            const buffers = Object.values(thermal.images).filter(Boolean).map(image => image.buffer);
            self.postMessage({ thermal }, buffers);
            return;
        }
        if (data.action === 'prepare-electrical') {
            self.postMessage({ electrical: await inspectElectricalSource(data.bytes, data.filename) });
            return;
        }
        if (data.action === 'inspect-powerview') {
            self.postMessage({ powerView: await inspectPowerView(data.bytes, data.filename) });
            return;
        }
        if (data.action === 'analyze-reference') {
            self.postMessage({ referenceProfile: await analyzeReferenceSource(data.bytes, data.filename) });
            return;
        }
        if (data.action === 'export-collection') {
            const output = await exportNativeCollection(data.workspace, data.bytes, data.options);
            self.postMessage({ collectionFile: { ...output, bytes: output.bytes.buffer } }, [output.bytes.buffer]);
            return;
        }
        if (data.action === 'import-collection') {
            const collectionPreview = await readNativeCollection(data.workspace, data.bytes, data.filledBytes, data.filename, data.options);
            self.postMessage({ collectionPreview });
            return;
        }
        if (data.action === 'write-native') {
            const output = await writeNativeReport(data.workspace, data.bytes, data.mode,data.options);
            self.postMessage({ native: { bytes: output.bytes.buffer, review: output.review } }, [output.bytes.buffer]);
            return;
        }
        const document = await analyzeReport(data.bytes, data.filename);
        const sourceBytes = data.bytes instanceof ArrayBuffer ? data.bytes : data.bytes.buffer;
        self.postMessage({ document, sourceBytes }, [sourceBytes]);
    } catch (error) {
        self.postMessage({ error: error.message || '보고서 분석에 실패했습니다.' });
    }
};
