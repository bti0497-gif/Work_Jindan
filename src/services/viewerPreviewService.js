import { getFileBlob } from './driveService';
import { isCadFile, renderCadPreview } from './cadPreviewService';
import { createPreviewCache } from './previewCache';

const cadPreviews = createPreviewCache();

export const loadViewerPreview = (file, signal) => {
    if (!isCadFile(file)) return getFileBlob(file.id, { signal });
    const key = JSON.stringify(['cad-png-v1', file.id, file.name, file.modifiedTime, file.size]);
    return cadPreviews.load(key, async jobSignal => {
        const source = await getFileBlob(file.id, { signal: jobSignal });
        return renderCadPreview(file, source, { signal: jobSignal });
    }, signal);
};
