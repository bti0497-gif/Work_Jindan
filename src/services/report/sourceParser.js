import CFB from 'cfb';
import { Inflate, unzipSync, strFromU8 } from 'fflate';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { indexHwpxSection } from './hwpxPackage.js';

// 본 제품은 (주)한글과컴퓨터의 한글 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.
// Read-only adapters: source files, macros, embedded objects and pictures are never executed or modified.
const MAX_SOURCE = 160 * 1024 * 1024;
const MAX_STREAM = 48 * 1024 * 1024;
const MAX_TOTAL = 128 * 1024 * 1024;
const utf16 = new TextDecoder('utf-16le');
const view = bytes => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
const fail = message => { throw new Error(message); };

export function readRecords(bytes) {
    const result = [];
    const data = view(bytes);
    let offset = 0;
    while (offset < bytes.length) {
        if (offset + 4 > bytes.length) fail('HWP 레코드 머리말이 잘렸습니다.');
        const start = offset;
        const header = data.getUint32(offset, true);
        offset += 4;
        let size = header >>> 20;
        if (size === 0xfff) {
            if (offset + 4 > bytes.length) fail('HWP 확장 레코드가 잘렸습니다.');
            size = data.getUint32(offset, true);
            offset += 4;
        }
        if (size > bytes.length - offset) fail('HWP 레코드 길이가 올바르지 않습니다.');
        result.push({ tag: header & 1023, level: (header >>> 10) & 1023, offset: start, bytes: bytes.subarray(offset, offset + size) });
        if (result.length > 1000000) fail('문서 레코드 수가 분석 한도를 넘습니다.');
        offset += size;
    }
    return result;
}

export function decodeHwpText(bytes) {
    if (bytes.length % 2) fail('HWP 문단 문자열의 길이가 올바르지 않습니다.');
    const data = view(bytes);
    const parts = [];
    let start = 0;
    for (let offset = 0; offset < bytes.length;) {
        const code = data.getUint16(offset, true);
        if (code >= 32) { offset += 2; continue; }
        parts.push(utf16.decode(bytes.subarray(start, offset)));
        if (code === 10 || code === 13) parts.push('\n');
        else if (code === 9) parts.push('\t');
        else if ([24, 30, 31].includes(code)) parts.push(' ');
        const size = code >= 1 && code <= 23 && ![10, 13].includes(code) ? 16 : 2;
        if (offset + size > bytes.length) fail('HWP 문단 제어 문자가 잘렸습니다.');
        offset += size;
        start = offset;
    }
    parts.push(utf16.decode(bytes.subarray(start)));
    return parts.join('').trim();
}

function inflateBounded(bytes) {
    const chunks = [];
    let size = 0;
    const inflater = new Inflate(chunk => {
        size += chunk.length;
        if (size > MAX_STREAM) fail('압축 해제한 문서 영역이 분석 한도를 넘습니다.');
        chunks.push(chunk);
    });
    for (let offset = 0; offset < bytes.length; offset += 16384) {
        inflater.push(bytes.subarray(offset, offset + 16384), offset + 16384 >= bytes.length);
    }
    const result = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
    return result;
}

function readString(bytes, offset = 0) {
    if (offset + 2 > bytes.length) return { text: '', end: bytes.length };
    const size = view(bytes).getUint16(offset, true) * 2;
    if (offset + 2 + size > bytes.length) fail('HWP 서식 문자열이 잘렸습니다.');
    return { text: utf16.decode(bytes.subarray(offset + 2, offset + 2 + size)), end: offset + 2 + size };
}

function parseHwp(bytes) {
    const ole = CFB.read(bytes, { type: 'array' });
    const entry = name => {
        const index = ole.FullPaths.findIndex(path => path.endsWith(`/${name}`));
        if (index < 0) fail(`HWP의 ${name} 영역을 찾을 수 없습니다.`);
        return new Uint8Array(ole.FileIndex[index].content);
    };
    const header = entry('FileHeader');
    if (header.length < 40 || !new TextDecoder().decode(header.subarray(0, 32)).startsWith('HWP Document File')) fail('HWP 5 형식이 아닙니다.');
    const flags = view(header).getUint32(36, true);
    if (flags & 6) fail('암호 또는 배포용 문서는 분석할 수 없습니다. 보호 해제한 사본을 사용하세요.');
    let total = 0;
    const stream = name => {
        const raw = entry(name);
        const data = flags & 1 ? inflateBounded(raw) : raw;
        total += data.length;
        if (data.length > MAX_STREAM || total > MAX_TOTAL) fail('문서 내용이 분석 한도를 넘습니다.');
        return readRecords(data);
    };
    const info = stream('DocInfo');
    const fonts = info.filter(r => r.tag === 19).map(r => readString(r.bytes, 1).text);
    const shapes = info.filter(r => r.tag === 21).map(r => {
        if (r.bytes.length < 50) return {};
        const data = view(r.bytes);
        return { font: fonts[data.getUint16(0, true)], sizePt: data.getInt32(42, true) / 100, bold: !!(data.getUint32(46, true) & 2),
            widthPercent: r.bytes[14], spacingPercent: data.getInt8(21), raw: Array.from(r.bytes) };
    });
    const paragraphShapes = info.filter(r => r.tag === 25).map(r => {
        const data = view(r.bytes);
        return { raw: Array.from(r.bytes), ...(r.bytes.length >= 28 ? {
            attributes: data.getUint32(0, true), leftMargin: data.getInt32(4, true), rightMargin: data.getInt32(8, true),
            indent: data.getInt32(12, true), beforeSpacing: data.getInt32(16, true), afterSpacing: data.getInt32(20, true),
        } : {}) };
    });
    const styles = info.filter(r => r.tag === 26).map((r, id) => {
        const name = readString(r.bytes);
        const english = readString(r.bytes, name.end);
        return { id, name: name.text, ...(english.end + 8 <= r.bytes.length ? shapes[view(r.bytes).getUint16(english.end + 6, true)] : {}) };
    });
    const paragraphs = [];
    const tables = [];
    const sections = ole.FullPaths.filter(path => /\/BodyText\/Section\d+$/.test(path)).map(path => path.slice(path.indexOf('BodyText/'))).sort((a, b) => Number(a.match(/\d+$/)[0]) - Number(b.match(/\d+$/)[0]));
    if (!sections.length || sections.length > 1000) fail('HWP 본문 구역을 찾을 수 없거나 구역이 너무 많습니다.');
    for (const section of sections) {
        const records = stream(section);
        const active = new Map();
        const controls = [];
        const tableStack = [];
        for (let index = 0; index < records.length; index++) {
            const r = records[index];
            const data = view(r.bytes);
            while (controls.length && controls.at(-1).level >= r.level) controls.pop();
            while (tableStack.length && tableStack.at(-1).controlLevel >= r.level) tableStack.pop();
            const table = tableStack.at(-1);
            if (r.tag === 66) {
                if (r.bytes.length < 12) fail('HWP 문단 속성이 잘렸습니다.');
                for (const level of active.keys()) if (level >= r.level) active.delete(level);
                const paragraph = { id: `${section}:p:${index}`, text: '', styleId: data.getUint8(10), paragraphShapeId: data.getUint16(8, true), characterRuns: [], anchor: { section, record: index }, tableId: table?.id || null };
                paragraphs.push(paragraph);
                active.set(r.level, paragraph);
                if (table?.activeCell && r.level === table.level) table.activeCell.paragraphIds.push(paragraph.id);
            } else if (r.tag === 67) {
                const paragraph = active.get(r.level - 1);
                if (!paragraph) fail('HWP 문단과 문자열의 연결이 올바르지 않습니다.');
                paragraph.text += decodeHwpText(r.bytes);
            } else if (r.tag === 68) {
                if (r.bytes.length % 8) fail('HWP 글자 모양 구간이 올바르지 않습니다.');
                const paragraph = active.get(r.level - 1);
                if (!paragraph) fail('HWP 글자 모양의 문단 연결이 올바르지 않습니다.');
                for (let offset = 0; offset < r.bytes.length; offset += 8) paragraph.characterRuns.push({ position: data.getUint32(offset, true), charShapeId: data.getUint32(offset + 4, true) });
            } else if (r.tag === 71 && r.bytes.length >= 4) {
                controls.push({ id: String.fromCharCode(...r.bytes.subarray(0, 4)).split('').reverse().join(''), level: r.level });
            } else if (r.tag === 77) {
                if (r.bytes.length < 8) fail('HWP 표 속성이 잘렸습니다.');
                const parent = [...controls].reverse().find(c => c.id === 'tbl ');
                const rows = data.getUint16(4, true), columns = data.getUint16(6, true);
                if (!rows || !columns || rows * columns > 100000) fail('표 크기가 분석 한도를 넘습니다.');
                const next = { id: `${section}:t:${index}`, rows, columns, cells: [], anchor: { section, record: index }, level: r.level, controlLevel: parent?.level ?? r.level - 1 };
                tables.push(next);
                tableStack.push(next);
            } else if (r.tag === 72 && table && r.level === table.level && r.bytes.length >= 34) {
                const column = data.getUint16(8, true), row = data.getUint16(10, true);
                const colSpan = data.getUint16(12, true), rowSpan = data.getUint16(14, true);
                table.activeCell = null;
                if (colSpan && rowSpan && column + colSpan <= table.columns && row + rowSpan <= table.rows) {
                    const cell = { id: `${table.id}:r${row}c${column}`, row, column, colSpan, rowSpan, paragraphIds: [], anchor: { section, record: index } };
                    table.cells.push(cell);
                    table.activeCell = cell;
                }
            }
        }
    }
    return finalize({ format: 'hwp', styles, characterShapes: shapes, paragraphShapes, paragraphs, tables,
        native: { strategy: 'original-package', writer: 'requires-hwpx-conversion', requiresHancomLayoutReview: true } });
}

const localName = name => name.includes(':') ? name.split(':').at(-1) : name;
function elements(nodes, name) {
    return (nodes || []).filter(n => Object.keys(n).some(key => !key.startsWith(':') && localName(key) === name));
}
function contents(node) { return node[Object.keys(node).find(key => key !== ':@' && key !== '#text')] || []; }
function attr(node, name, fallback = '') {
    const attrs = node[':@'] || {};
    const key = Object.keys(attrs).find(k => localName(k.replace(/^@_/, '')) === name);
    return key === undefined ? fallback : attrs[key];
}
function xmlText(nodes) {
    return (nodes || []).map(node => {
        if ('#text' in node) return String(node['#text']);
        const key = Object.keys(node).find(k => k !== ':@');
        if (['lineBreak', 'br'].includes(localName(key || ''))) return '\n';
        if (['tab'].includes(localName(key || ''))) return '\t';
        if (['tbl', 'pic', 'script', 'ole'].includes(localName(key || ''))) return '';
        return xmlText(contents(node));
    }).join('');
}
function parseHwpx(bytes) {
    let total = 0;
    const files = unzipSync(bytes, { filter: file => {
        if (!/^Contents\/(section\d+|header)\.xml$/.test(file.name)) return false;
        total += file.originalSize;
        if (file.originalSize > MAX_STREAM || total > MAX_TOTAL) fail('HWPX XML 내용이 분석 한도를 넘습니다.');
        return true;
    } });
    const parser = new XMLParser({ preserveOrder: true, ignoreAttributes: false, parseTagValue: false, trimValues: false, processEntities: true });
    const parse = name => {
        const text = strFromU8(files[name]);
        if (/<!DOCTYPE|<!ENTITY/i.test(text)) fail('외부 개체가 포함된 XML은 분석할 수 없습니다.');
        if (XMLValidator.validate(text) !== true) fail('HWPX XML 구조가 올바르지 않습니다.');
        return parser.parse(text);
    };
    const sections = Object.keys(files).filter(n => /^Contents\/section\d+\.xml$/.test(n)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
    if (!sections.length || sections.length > 1000) fail('HWPX 본문을 찾을 수 없습니다.');
    const paragraphs = [], tables = [];
    const walk = (nodes, section, table = null, cell = null, path = '') => {
        (nodes || []).forEach((node, index) => {
            const key = Object.keys(node).find(k => k !== ':@' && k !== '#text');
            if (!key) return;
            const name = localName(key), location = `${path}/${index}`;
            let nextTable = table, nextCell = cell;
            if (name === 'tbl') {
                const rows = Number(attr(node, 'rowCnt')), columns = Number(attr(node, 'colCnt'));
                if (!rows || !columns || rows * columns > 100000) fail('HWPX 표 크기가 올바르지 않습니다.');
                nextTable = { id: `${section}:t:${location}`, rows, columns, cells: [], anchor: { section, path: location } };
                tables.push(nextTable);
                nextCell = null;
            } else if (name === 'tc' && table) {
                const address = elements(contents(node), 'cellAddr')[0];
                const span = elements(contents(node), 'cellSpan')[0];
                const row = Number(attr(address || {}, 'rowAddr')), column = Number(attr(address || {}, 'colAddr'));
                const rowSpan = Number(attr(span || {}, 'rowSpan', 1)), colSpan = Number(attr(span || {}, 'colSpan', 1));
                if (!Number.isInteger(row) || !Number.isInteger(column) || row < 0 || column < 0 || rowSpan < 1 || colSpan < 1 || row + rowSpan > table.rows || column + colSpan > table.columns) fail('HWPX 셀 주소가 올바르지 않습니다.');
                nextCell = { id: `${table.id}:r${row}c${column}`, fieldName: String(attr(node, 'name')), row, column, rowSpan, colSpan, paragraphIds: [], anchor: { section, path: location } };
                table.cells.push(nextCell);
            } else if (name === 'p') {
                const paragraph = { id: `${section}:p:${location}`, text: xmlText(contents(node)).trim(), styleId: attr(node, 'styleIDRef'), tableId: table?.id || null, anchor: { section, path: location } };
                paragraphs.push(paragraph);
                cell?.paragraphIds.push(paragraph.id);
            }
            walk(contents(node), section, nextTable, nextCell, location);
        });
    };
    for (const name of sections) {
        const before = paragraphs.length;
        walk(parse(name), name);
        const native = indexHwpxSection(strFromU8(files[name]), name);
        const sectionParagraphs = paragraphs.slice(before);
        if (sectionParagraphs.length !== native.paragraphs.length) fail('한글 문단과 원본 서식 구간의 연결에 실패했습니다.');
        sectionParagraphs.forEach((paragraph, index) => Object.assign(paragraph, native.paragraphs[index]));
    }
    return finalize({ format: 'hwpx', styles: [], paragraphs, tables,
        native: { strategy: 'original-package', writer: 'hwpx-text-slots', requiresHancomLayoutReview: true } });
}

function finalize(document) {
    if (document.paragraphs.length > 150000 || document.tables.length > 5000) fail('분석 가능한 문서 크기를 넘었습니다.');
    const byId = new Map(document.paragraphs.map(p => [p.id, p]));
    for (const table of document.tables) {
        for (const cell of table.cells) {
            cell.text = cell.paragraphIds.map(id => byId.get(id)?.text || '').filter(Boolean).join('\n');
            cell.textSlots = cell.paragraphIds.flatMap(id => byId.get(id)?.textSlots || []);
        }
        delete table.activeCell;
        const position = document.paragraphs.findIndex(p => p.tableId === table.id || p.id === table.cells[0]?.paragraphIds[0]);
        const before = document.paragraphs.slice(Math.max(0, position - 16), position).filter(p => !p.tableId && p.text).map(p => p.text);
        table.title = [...before].reverse().find(text => /(?:\[|<|〈|＜)?표\s*\d/.test(text)) || before.at(-1)?.slice(0, 160) || `표 ${document.tables.indexOf(table) + 1}`;
    }
    document.warnings = [
        '추출한 표와 문단은 입력항목 후보입니다. 제목·단위·입력 범위·판정 기준을 확인하세요.',
        '기존 보고서의 수치·판정·법령·요금은 과거 참고자료이며 새 보고서에 자동 재사용하지 않습니다.',
        document.format === 'hwpx' ? 'HWPX 원본의 지정 글자 구간을 교체한 파일은 한글에서 쪽 배치와 미교체 내용을 검토해야 합니다.' : 'HWP 원본 작성은 한글에서 HWPX 사본으로 변환한 후 연결해야 합니다.',
    ];
    return document;
}

export async function analyzeReport(input, filename = '') {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    if (!bytes.length || bytes.length > MAX_SOURCE) fail('빈 파일이거나 160MB 분석 한도를 넘습니다.');
    const signature = Array.from(bytes.subarray(0, 8)).map(n => n.toString(16).padStart(2, '0')).join('');
    let document;
    if (signature === 'd0cf11e0a1b11ae1') document = parseHwp(bytes);
    else if (signature.startsWith('504b0304')) document = parseHwpx(bytes);
    else fail('HWP 5 또는 HWPX 파일을 선택하세요. PDF는 현재 입력 서식 추출 대상이 아닙니다.');
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    const sha256 = Array.from(new Uint8Array(hash)).map(n => n.toString(16).padStart(2, '0')).join('');
    return { ...document, source: { filename, sha256, bytes: bytes.length }, parserVersion: 2 };
}
