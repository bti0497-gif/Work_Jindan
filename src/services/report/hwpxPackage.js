import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { XMLValidator } from 'fast-xml-parser';
const MAX_TOTAL = 256 * 1024 * 1024;
const MAX_XML = 48 * 1024 * 1024;
const local = name => name.split(':').at(-1);
const xmlEscape = value => String(value).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
function decode(value) {
    return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, code) => {
        if (code[0] === '#') return String.fromCodePoint(parseInt(code.slice(code[1].toLowerCase() === 'x' ? 2 : 1), code[1].toLowerCase() === 'x' ? 16 : 10));
        return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[code];
    });
}
export function readHwpxPackage(input) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    let total = 0, count = 0;
    const entries = unzipSync(bytes, { filter: entry => {
        if (++count > 20000 || (total += entry.originalSize) > MAX_TOTAL || (/\.xml$/i.test(entry.name) && entry.originalSize > MAX_XML) || entry.name.includes('..') || entry.name.startsWith('/')) throw new Error('HWPX 패키지 크기 또는 경로가 올바르지 않습니다.');
        return true;
    } });
    if (!Object.keys(entries).some(name => /^Contents\/section\d+\.xml$/.test(name))) throw new Error('HWPX 본문이 없습니다.');
    if (Object.keys(entries).some(name => /(?:signatures?|encryption)/i.test(name))) throw new Error('서명·암호화 문서는 변경할 수 없습니다. 검증된 별도 사본을 사용하세요.');
    return entries;
}

export function packHwpxPackage(entries) {
    const ordered = {};
    if (entries.mimetype) ordered.mimetype = [entries.mimetype, { level: 0 }];
    for (const [name, value] of Object.entries(entries)) if (name !== 'mimetype') ordered[name] = name === 'version.xml' ? [value, { level: 0 }] : value;
    return zipSync(ordered);
}

// Locate character data without rebuilding XML. All surrounding bytes and package assets survive unchanged.
export function indexHwpxSection(xml, section) {
    if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) throw new Error('HWPX XML이 올바르지 않습니다.');
    const paragraphs = [], slots = [], stack = [], nodes = [];
    const tags = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<\/?[A-Za-z_][\w.:-]*(?:\s+(?:[^<>"']|"[^"]*"|'[^']*')*)?\s*\/?>/g;
    for (const match of xml.matchAll(tags)) {
        const token = match[0], start = match.index, end = start + token.length;
        if (token.startsWith('<!') || token.startsWith('<?')) continue;
        const closing = token.startsWith('</');
        const name = token.match(/^<\/?([\w.:-]+)/)[1];
        if (closing) {
            const node = stack.pop();
            if (!node || node.name !== name) throw new Error('HWPX 태그 연결을 확인할 수 없습니다.');
            node.end = end; node.closeStart = start;
            if (local(name) === 't' && node.slot) {
                node.slot.end = start;
                node.slot.raw = xml.slice(node.slot.begin, start);
                node.slot.plain = !node.slot.raw.includes('<');
                const text = node.slot.raw.replace(/<([\w.-]+:)?lineBreak\s*\/>/g, '\n').replace(/<([\w.-]+:)?tab\b[^<>]*\/>/g, '\t');
                node.slot.textOnly = !text.includes('<');
                node.slot.text = node.slot.textOnly ? decode(text) : '';
            }
            if (local(name) === 'linesegarray' && node.ownerParagraph) node.ownerParagraph.layoutCaches.push({ begin: node.start, end });
            continue;
        }
        const attrs = {};
        for (const attribute of token.matchAll(/([\w.:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[local(attribute[1])] = decode(attribute[2] ?? attribute[3]);
        const parentParagraph = [...stack].reverse().find(node => node.paragraph)?.paragraph;
        const parentRun = [...stack].reverse().find(node => local(node.name) === 'run');
        const node = { name, attrs, start, openEnd: end, end: /\/\s*>$/.test(token) ? end : null, parent: stack.at(-1) || null };
        nodes.push(node);
        if (local(name) === 'p') {
            node.paragraph = { index: paragraphs.length, styleId: attrs.styleIDRef || '', paragraphShapeId: attrs.paraPrIDRef || '', textSlots: [], layoutCaches: [] };
            paragraphs.push(node.paragraph);
        }
        if (local(name) === 'linesegarray' && parentParagraph) {
            node.ownerParagraph = parentParagraph;
            if (/\/\s*>$/.test(token)) parentParagraph.layoutCaches.push({ begin: start, end });
        }
        if (local(name) === 't' && parentParagraph) {
            const selfClosing = /\/\s*>$/.test(token);
            const slot = { id: `${section}:text:${start}`, section, begin: selfClosing ? start : end, end: selfClosing ? end : null,
                tagName: name, selfClosing, charShapeId: parentRun?.attrs.charPrIDRef || '', paragraphIndex: parentParagraph.index, raw: '', text: '', plain: true };
            slots.push(slot); parentParagraph.textSlots.push(slot); node.slot = slot;
        }
        if (!/\/\s*>$/.test(token)) stack.push(node);
    }
    if (stack.length || slots.some(slot => slot.end == null)) throw new Error('HWPX 글자 구간을 확인할 수 없습니다.');
    return { paragraphs, slots, nodes };
}

export async function replaceHwpxSlots(input, sourceSha256, replacements) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
    if (hash !== sourceSha256) throw new Error('교체 대상 한글 원본 버전이 다릅니다.');
    if (!Array.isArray(replacements) || !replacements.length) throw new Error('교체할 글자 구간이 없습니다.');
    const entries = readHwpxPackage(bytes), changed = [], used = new Set();
    const bySection = new Map();
    for (const replacement of replacements) {
        if (typeof replacement.value !== 'string' || !replacement.slotId || used.has(replacement.slotId)) throw new Error('중복되거나 올바르지 않은 교체 구간입니다.');
        if (Array.from(replacement.value).some(char => char.charCodeAt(0) < 32 && !['\t', '\n', '\r'].includes(char))) throw new Error('한글 본문에 사용할 수 없는 제어 문자가 있습니다.');
        const section = replacement.section;
        if (!/^Contents\/section\d+\.xml$/.test(section) || !entries[section]) throw new Error('교체할 본문 구역을 찾을 수 없습니다.');
        used.add(replacement.slotId);
        bySection.set(section, [...(bySection.get(section) || []), replacement]);
    }
    for (const [section, edits] of bySection) {
        let xml = strFromU8(entries[section]);
        const native = indexHwpxSection(xml, section);
        const indexed = new Map(native.slots.map(slot => [slot.id, slot]));
        const editedParagraphs = new Set();
        const patches = edits.map(edit => {
            const slot = indexed.get(edit.slotId);
            if ((!slot?.plain && !(edit.wholeText && slot?.textOnly)) || (edit.expectedText != null && edit.expectedText !== slot.text)) throw new Error('서식 구간이 변경되었거나 복합 글자 요소입니다. 교체 위치를 다시 확인하세요.');
            editedParagraphs.add(slot.paragraphIndex);
            // Line breaks remain inside the original run and inherit that run's character properties.
            const prefix = slot.tagName.includes(':') ? `${slot.tagName.split(':')[0]}:` : '';
            const text = edit.value.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n').map(xmlEscape).join(`<${prefix}lineBreak/>`);
            return { ...slot, replacement: slot.selfClosing ? `<${slot.tagName}>${text}</${slot.tagName}>` : text };
        });
        // Cached text positions can point past a shortened paragraph and cause HWP to reject the file.
        // Invalidate only edited paragraphs; font, indent, spacing and table properties remain intact.
        for (const index of editedParagraphs) for (const range of native.paragraphs[index].layoutCaches) patches.push({ ...range, replacement: '' });
        patches.sort((a, b) => b.begin - a.begin);
        for (const patch of patches) xml = xml.slice(0, patch.begin) + patch.replacement + xml.slice(patch.end);
        if (XMLValidator.validate(xml) !== true) throw new Error('작성 후 HWPX XML 검증에 실패했습니다.');
        entries[section] = strToU8(xml);
        changed.push(section);
    }
    // Retain the container's text-preview target, but discard the stale picture preview.
    if (entries['Preview/PrvText.txt']) entries['Preview/PrvText.txt'] = strToU8('새 진단보고서 검토용 작업본입니다. 한글에서 본문과 쪽 배치를 검토하고 다시 저장하세요.');
    delete entries['Preview/PrvImage.png'];
    return { bytes: packHwpxPackage(entries), changedSections: changed, replacedSlots: replacements.length, needsHancomLayoutReview: true };
}
