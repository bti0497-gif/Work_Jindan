import { strFromU8, unzipSync } from 'fflate';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { analyzeReport } from './sourceParser.js';

export const REFERENCE_ANALYZER_VERSION = 1;
const local = key => key.split(':').at(-1);
const attributes = source => Object.fromEntries([...source.matchAll(/([\w.:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(match => [local(match[1]), match[2] ?? match[3]]));
const tags = (xml, name) => [...xml.matchAll(new RegExp(`<((?:[\\w.-]+:)?${name})\\b([^<>]*?)(?:\\/>|>([\\s\\S]*?)<\\/\\1\\s*>)`, 'g'))].map(match => ({ attrs: attributes(match[2]), content: match[3] || '', position: match.index }));
const opening = (xml, name) => [...xml.matchAll(new RegExp(`<(?:[\\w.-]+:)?${name}\\b([^<>]*)>`, 'g'))].map(match => attributes(match[1]));
const nodes = (tree, name, result = []) => {
    if (!tree || typeof tree !== 'object') return result;
    for (const [key, value] of Object.entries(tree)) {
        if (local(key) === name) result.push(...(Array.isArray(value) ? value : [value]));
        if (value && typeof value === 'object') nodes(value, name, result);
    }
    return result;
};
const decode = text => text.replace(/&(?:amp|lt|gt|quot|apos);/g, value => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" })[value]);
const plain = xml => decode(tags(xml, 't').map(tag => tag.content.replace(/<[^>]*>/g, '')).join(' ')).replace(/\s+/g, ' ').trim();
const mm = value => Number.isFinite(Number(value)) && value !== '' && value != null ? Math.round(Number(value) * 25.4 / 7200 * 10) / 10 : null;
const histogram = (values, limit = 20) => {
    const counts = new Map();
    for (const item of values) {
        const key = JSON.stringify(item), previous = counts.get(key);
        counts.set(key, { value: item, count: (previous?.count || 0) + 1 });
    }
    return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, limit);
};
const caption = text => {
    if (text.length > 180 || /\t|[·.…]{3,}/.test(text)) return null;
    const match = /^\s*([[<〈]?)(표|그림)\s*(\d+(?:\s*[-.]\s*\d+)*)([\]>〉]?)\s*(.*)$/.exec(text);
    if (!match || !match[5] || /^(?:은|는|이|가|을|를|에서|에\s|의\s)/.test(match[5])) return null;
    return { kind: match[2] === '표' ? 'table' : 'figure', pattern: `${match[1]}${match[2]} ${match[3].replace(/\d+/g, 'N')}${match[4]}`, number: match[3].replace(/\s+/g, ''), label: text.slice(0, 180), continuation: /계\s*속/.test(match[5]) };
};

/** Local source evidence only: no model training, external calls or source edits. */
export async function analyzeReferenceSource(input, filename = '') {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    const document = await analyzeReport(bytes, filename);
    if (document.format !== 'hwpx') throw new Error('양식 학습 원본은 HWPX로 등록하세요.');
    let total = 0;
    const files = unzipSync(bytes, { filter: file => {
        if (!/^Contents\/(?:header|section\d+)\.xml$/.test(file.name)) return false;
        total += file.originalSize;
        if (total > 128 * 1024 * 1024 || file.originalSize > 48 * 1024 * 1024) throw new Error('서식 XML이 분석 한도를 넘습니다.');
        return true;
    } });
    const headerXml = files['Contents/header.xml'] ? strFromU8(files['Contents/header.xml']) : '';
    if (headerXml && (/<!DOCTYPE|<!ENTITY/i.test(headerXml) || XMLValidator.validate(headerXml) !== true)) throw new Error('HWPX 서식 정의를 확인할 수 없습니다.');
    const header = headerXml ? new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '', removeNSPrefix: true, parseTagValue: false, parseAttributeValue: false }).parse(headerXml) : {};
    const fontGroup = nodes(header, 'fontface').find(group => group.lang === 'HANGUL');
    const fonts = new Map(nodes(fontGroup || {}, 'font').map(font => [String(font.id), font.face]));
    const shapes = new Map(nodes(header, 'charPr').map(shape => [String(shape.id), shape]));
    const paraShapes = new Map(nodes(header, 'paraPr').map(shape => [String(shape.id), shape]));
    const styles = new Map(nodes(header, 'style').map(style => [String(style.id), style]));
    const typography = histogram(document.paragraphs.flatMap(paragraph => paragraph.textSlots.filter(slot => slot.text.trim()).map(slot => {
        const shape = shapes.get(String(slot.charShapeId));
        return shape ? { font: fonts.get(String(shape.fontRef?.hangul)) || '서체 참조 확인 필요', sizePt: Number(shape.height) / 100, bold: Object.hasOwn(shape, 'bold') } : null;
    })).filter(Boolean));
    const paragraphFormats = histogram(document.paragraphs.filter(paragraph => paragraph.text).map(paragraph => {
        const shape = paraShapes.get(String(paragraph.paragraphShapeId));
        return { styleId: String(paragraph.styleId), name: styles.get(String(paragraph.styleId))?.name || '', paragraphShapeId: String(paragraph.paragraphShapeId),
            align: shape?.align?.horizontal || '', lineSpacing: nodes(shape || {}, 'lineSpacing')[0] || null };
    }), 16);
    const sections = [], headers = [], footers = [], pageNumbers = [];
    let pictureCount = 0, explicitPageBreaks = 0;
    for (const [name, data] of Object.entries(files).filter(([name]) => /section\d+\.xml$/.test(name))) {
        const xml = strFromU8(data);
        for (const page of tags(xml, 'pagePr')) {
            const margin = opening(page.content, 'margin')[0] || {};
            sections.push({ section: name, position: page.position, widthMm: mm(page.attrs.width), heightMm: mm(page.attrs.height),
                marginsMm: Object.fromEntries(['left', 'right', 'top', 'bottom', 'header', 'footer', 'gutter'].map(key => [key, mm(margin[key])])),
                pageStarts: opening(xml, 'startNum'), visibility: opening(xml, 'visibility'), hiddenFurniture: opening(xml, 'hide') });
        }
        for (const kind of ['header', 'footer']) for (const area of tags(xml, kind)) (kind === 'header' ? headers : footers).push({ section: name, position: area.position, applyPageType: area.attrs.applyPageType || '', text: plain(area.content).slice(0, 240), hasShapes: /<(?:[\w.-]+:)?(?:line|rect|pic|container)\b/.test(area.content) });
        pageNumbers.push(...opening(xml, 'pageNum').map(value => ({ section: name, ...value })));
        pictureCount += opening(xml, 'pic').length;
        explicitPageBreaks += opening(xml, 'p').filter(attrs => attrs.pageBreak === '1').length;
    }
    const catalogOnly = /목차|차례/.test(filename), chapterMap = new Map(), headings = [], captions = [];
    for (const paragraph of document.paragraphs.filter(paragraph => !paragraph.tableId && paragraph.text)) {
        const text = paragraph.text.trim();
        const chapter = /^제\s*(\d{1,2})\s*장\s*(.{1,100})$/.exec(text);
        const heading = /^(\d{1,2}(?:\.\d{1,2}){1,3})\s+(.{1,100})$/.exec(text);
        if ((chapter || heading) && !/\t|[·.…]{3,}/.test(text)) {
            const chapterNumber = Number(chapter?.[1] || heading[1].split('.')[0]);
            if (!catalogOnly && chapterNumber > 0 && !chapterMap.has(chapterNumber)) chapterMap.set(chapterNumber, { number: chapterNumber, title: chapter ? text : `제${chapterNumber}장`, paragraphId: paragraph.id });
            if (headings.length < 300) headings.push({ text: text.slice(0, 120), chapterNumber, level: chapter ? 1 : heading[1].split('.').length, paragraphId: paragraph.id, styleId: paragraph.styleId, paragraphShapeId: paragraph.paragraphShapeId, charShapeIds: [...new Set(paragraph.textSlots.map(slot => slot.charShapeId))] });
        }
        const label = caption(text);
        if (label && captions.length < 200) captions.push({ ...label, paragraphId: paragraph.id });
    }
    return { version: REFERENCE_ANALYZER_VERSION, source: document.source, catalogOnly, chapters: [...chapterMap.values()].sort((a, b) => a.number - b.number), headings, captions,
        counts: { paragraphs: document.paragraphs.length, tables: document.tables.length, cells: document.tables.reduce((sum, table) => sum + table.cells.length, 0), pictures: pictureCount, explicitPageBreaks },
        sections, headers: headers.slice(0, 32), footers: footers.slice(0, 32), pageNumbers: pageNumbers.slice(0, 64), typography, paragraphFormats,
        tableShapes: histogram(document.tables.map(table => ({ rows: table.rows, columns: table.columns, merged: table.cells.some(cell => cell.rowSpan > 1 || cell.colSpan > 1) }))),
        tableExamples: document.tables.slice(0, 8).map(table => ({ id: table.id, title: table.title.slice(0, 160), rows: table.rows, columns: table.columns, headerLabels: table.cells.filter(cell => cell.row === 0).slice(0, 12).map(cell => cell.text.slice(0, 100)) })),
        limitations: ['HWPX 구조에서 추출한 양식 후보이며 PDF와 시각 대조·한 쪽 재현 검증 전입니다.', '명시적 쪽 나눔 수는 실제 쪽 수가 아닙니다. 빈 쪽과 홀수 쪽 시작은 PDF로 확인해야 합니다.', '이전 진단의 측정값·판정·법령을 새 보고서 값으로 자동 재사용하지 않습니다.'] };
}
