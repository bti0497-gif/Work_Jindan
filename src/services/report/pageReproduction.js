// A deliberately small, editable page vocabulary. No PDF/image backgrounds or executable SVG.
export const PAGE_TRIAL_SCHEMA = 'jindan-editable-page/1';
const fail = () => { throw new Error('재현 페이지의 형식이나 값이 올바르지 않습니다.'); };
const number = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : fail();
const string = (value, max) => typeof value === 'string' && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value) ? value : fail();
const color = value => typeof value === 'string' && /^(#[0-9a-f]{6}|none)$/i.test(value) ? value : fail();
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) ? value : fail();
export function validatePageTrial(input) {
    if (!input || input.schema !== PAGE_TRIAL_SCHEMA || !Array.isArray(input.objects) || input.objects.length > 500) fail();
    const source = input.source || {}, ids = new Set();
    const result = { schema: PAGE_TRIAL_SCHEMA, title: string(input.title, 300), width: number(input.width, 10, 2400), height: number(input.height, 10, 2400),
        source: { pdfSha256: hash(source.pdfSha256), hwpxSha256: hash(source.hwpxSha256), pdfPage: number(source.pdfPage, 1, 10000),
            pdfName: string(source.pdfName, 500), hwpxName: string(source.hwpxName, 500), method: string(source.method, 300) }, objects: [], fonts: [] };
    if (input.fonts != null && (!Array.isArray(input.fonts) || input.fonts.length > 4)) fail();
    let fontBytes = 0;
    for (const font of input.fonts || []) {
        const data = string(font.data, 2500000);
        if (!/^(AAEAAA|T1RUTw)[A-Za-z0-9+/]*={0,2}$/.test(data) || (fontBytes += data.length) > 4000000) fail();
        result.fonts.push({ family: string(font.family, 100), data });
    }
    if (!Number.isInteger(result.source.pdfPage)) fail();
    for (const object of input.objects) {
        if (!object || !['text', 'panel'].includes(object.type)) fail();
        const id = string(object.id, 80); if (!id || ids.has(id)) fail(); ids.add(id);
        const clean = { id, type: object.type, label: string(object.label, 200), x: number(object.x, -2400, 4800), y: number(object.y, -2400, 4800), fill: color(object.fill) };
        if (object.type === 'text') Object.assign(clean, { text: string(object.text, 2000), originalText: string(object.originalText, 2000), fontFamily: string(object.fontFamily, 100),
            fontSize: number(object.fontSize, 1, 200), originalFontSize: number(object.originalFontSize, 1, 200), originalWidth: number(object.originalWidth, 0, 2400),
            sourceParagraphs: (Array.isArray(object.sourceParagraphs) && object.sourceParagraphs.length <= 100 ? object.sourceParagraphs : fail()).map(p => ({ section: string(p.section, 100), index: number(p.index, 0, 100000), id: string(p.id, 100) })) });
        else Object.assign(clean, { width: number(object.width, 0.01, 2400), height: number(object.height, 0.01, 2400), radius: number(object.radius, 0, 500),
            corner: ['none', 'top', 'bottom', 'all'].includes(object.corner) ? object.corner : fail(), stroke: color(object.stroke), strokeWidth: number(object.strokeWidth, 0, 20) });
        result.objects.push(clean);
    }
    return result;
}
export function bindPageTrial(input, materials) {
    const model = validatePageTrial(input);
    const pdf = materials.find(m => m.format === 'pdf' && m.sha256 === model.source.pdfSha256);
    const hwpx = materials.find(m => m.format === 'hwpx' && m.sha256 === model.source.hwpxSha256);
    if (!pdf || !hwpx) throw new Error('이 재현시험의 원본 HWPX와 PDF를 자료 모음 또는 프로젝트 폴더에 먼저 등록하세요. 원본 해시가 일치해야 합니다.');
    return { model, pdfMaterialId: pdf.id, hwpxMaterialId: hwpx.id };
}
const xml = value => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[ch]);
function panelPath(o) {
    const w = o.width, h = o.height, r = Math.min(o.radius, w / 2, h / 2);
    if (o.corner === 'top') return `M0 ${h} V${r} Q0 0 ${r} 0 H${w-r} Q${w} 0 ${w} ${r} V${h}`;
    if (o.corner === 'bottom') return `M0 0 H${w} V${h-r} Q${w} ${h} ${w-r} ${h} H${r} Q0 ${h} 0 ${h-r} Z`;
    return `M${r} 0 H${w-r} Q${w} 0 ${w} ${r} V${h-r} Q${w} ${h} ${w-r} ${h} H${r} Q0 ${h} 0 ${h-r} V${r} Q0 0 ${r} 0 Z`;
}
export function pageTrialSvg(input, selectedId = '') {
    const model = validatePageTrial(input);
    // CSS strings need their own escaping; XML escaping alone is insufficient here.
    const cssFamily = value => [...value].map(c => `\\${c.codePointAt(0).toString(16)} `).join('');
    const fonts = model.fonts.map(font => `@font-face{font-family:"${cssFamily(font.family)}";src:url(data:font/ttf;base64,${font.data}) format("truetype")}`).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${model.width}pt" height="${model.height}pt" viewBox="0 0 ${model.width} ${model.height}" role="img" aria-label="${xml(model.title)}"><defs><style>${fonts}</style></defs><rect width="100%" height="100%" fill="white"/>${model.objects.map(o => {
        const attrs = `data-object-id="${xml(o.id)}" aria-label="${xml(o.label)}"`;
        const selected = o.id === selectedId;
        if (o.type === 'text') {
            const width = o.text === o.originalText ? ` textLength="${o.originalWidth * o.fontSize / o.originalFontSize}" lengthAdjust="spacingAndGlyphs"` : '';
            return `<g ${attrs}><text x="${o.x}" y="${o.y}" fill="${o.fill}" font-family="${xml(o.fontFamily)}" font-size="${o.fontSize}" xml:space="preserve"${width}>${xml(o.text)}</text>${selected ? `<rect x="${o.x-3}" y="${o.y-o.fontSize}" width="${Math.max(o.originalWidth * o.fontSize / o.originalFontSize, 20)+6}" height="${o.fontSize*1.3}" fill="none" stroke="#3679ee" stroke-width="0.8" stroke-dasharray="3 2" pointer-events="none"/>` : ''}</g>`;
        }
        return `<path ${attrs} transform="translate(${o.x} ${o.y})" d="${panelPath(o.corner === 'none' ? {...o, radius:0} : o)}" fill="${o.fill}" stroke="${selected ? '#3679ee' : o.stroke}" stroke-width="${selected ? Math.max(1, o.strokeWidth) : o.strokeWidth}"/>`;
    }).join('')}</svg>`;
}
export function pageTrialHtml(input) {
    const model = validatePageTrial(input);
    return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src 'self' data:"><style>@page{size:${model.width}pt ${model.height}pt;margin:0}html,body{margin:0;padding:0;width:${model.width}pt;height:${model.height}pt}svg{display:block}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}</style></head><body>${pageTrialSvg(model)}</body></html>`;
}
