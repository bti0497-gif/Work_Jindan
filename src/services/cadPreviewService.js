import { rasterizeCadSvg } from './cadRaster';
import { createCadEngine } from './cadEngine';

const CAD_EXTENSIONS = new Set(['dwg', 'dxf']);
const engine = createCadEngine(() => new Worker(new URL('./cadPreview.worker.js', import.meta.url), { type: 'module' }));

export const warmCadEngine = () => engine.warm();

if (import.meta.hot) import.meta.hot.dispose(() => engine.dispose());

export const isCadFile = file => {
    const extension = file?.name?.split('.').pop()?.toLowerCase();
    return CAD_EXTENSIONS.has(extension);
};

export const renderCadPreview = async (file, blob, { signal } = {}) => {
    if (!isCadFile(file)) {
        throw new Error('DWG 또는 DXF 파일만 미리 볼 수 있습니다.');
    }
    signal?.throwIfAborted();
    const buffer = await blob.arrayBuffer();
    signal?.throwIfAborted();
    const preview = await engine.render(file.name, buffer, signal);
    return rasterizeCadSvg(preview, signal);
};
