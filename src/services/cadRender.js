import { contentBounds, readDwg, readDxf, writeSvg } from 'nasjidwg';

export const CAD_PREVIEW_MAX_EDGE = 1600;

// Runs in the worker. SVG is an intermediate format and is never displayed.
export const renderCadSvg = (name, bytes) => {
    const extension = name.split('.').pop()?.toLowerCase();
    if (extension !== 'dwg' && extension !== 'dxf') throw new Error('DWG 또는 DXF 파일만 미리 볼 수 있습니다.');
    const drawing = extension === 'dxf' ? readDxf(bytes) : readDwg(bytes);
    if (!drawing.entities.length) throw new Error('이 도면에서 표시할 모델 공간 객체를 찾지 못했습니다.');

    const bounds = contentBounds(drawing);
    const spanX = Math.max(bounds ? bounds.max.x - bounds.min.x : 100, 1e-9);
    const spanY = Math.max(bounds ? bounds.max.y - bounds.min.y : 100, 1e-9);
    const padding = 0.04 * Math.max(spanX, spanY);
    const width = Math.max(1, Math.floor(CAD_PREVIEW_MAX_EDGE * (spanX + padding) / Math.max(spanX + padding, spanY + padding)));
    const height = Math.min(CAD_PREVIEW_MAX_EDGE, Math.max(1, Math.round(width * (spanY + padding) / (spanX + padding))));
    const svg = writeSvg(drawing, {
        width,
        background: '#111827',
        stroke: '#e5e7eb'
    });
    return { svg, width, height };
};
