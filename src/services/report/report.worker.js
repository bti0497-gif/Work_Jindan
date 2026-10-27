import { analyzeReport } from './sourceParser.js';
import { writeNativeReport } from './nativeWriter.js';
import { exportNativeCollection, readNativeCollection } from './nativeCollection.js';

self.onmessage = async ({ data }) => {
    try {
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
            const output = await writeNativeReport(data.workspace, data.bytes, data.mode);
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
