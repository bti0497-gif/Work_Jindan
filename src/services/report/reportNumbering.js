import { strFromU8, strToU8 } from 'fflate';
import { XMLValidator } from 'fast-xml-parser';
import { indexHwpxSection, packHwpxPackage, readHwpxPackage } from './hwpxPackage.js';

const local = node => node.name.split(':').at(-1);
const kindOf = type => ({ TABLE: '표', PICTURE: '그림' })[type];
const escape = text => text.replace(/[&<>]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[char]);
const ancestor = (node, predicate) => {
    for (let parent = node.parent; parent; parent = parent.parent) if (predicate(parent)) return parent;
    return null;
};
const keyOf = (kind, parts) => `${kind}:${parts.map(Number).join('-')}`;
const labelPattern = /(?:표|그림)\s*\d+(?:\s*[-.‐‑–−]\s*\d+)*/g;
const sectionLabel = section => `구역 ${Number(section.match(/\d+/)[0]) + 1}`;
const locationOf = record => `${sectionLabel(record.section)} / 문단 ${record.paragraph.index + 1}`;

function labels(text) {
    return [...text.matchAll(labelPattern)].filter(match => {
        const before = text[match.index - 1] || '';
        const after = text[match.index + match[0].length] || '';
        return !/[가-힣A-Za-z0-9]/.test(before) && !/[A-Za-z0-9]/.test(after);
    }).map(match => {
        const kind = match[0].startsWith('그림') ? '그림' : '표';
        const offset = match[0].search(/\d/), numberText = match[0].slice(offset);
        const parts = [...numberText.matchAll(/\d+/g)].map(item => item[0]);
        return { kind, parts, key: keyOf(kind, parts), start: match.index, end: match.index + match[0].length,
            numberStart: match.index + offset, numberText };
    });
}

function sectionRecords(entries) {
    const sections = Object.keys(entries).filter(name => /^Contents\/section\d+\.xml$/.test(name))
        .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
    return sections.map(section => {
        const xml = strFromU8(entries[section]), indexed = indexHwpxSection(xml, section);
        const pNodes = indexed.nodes.filter(node => node.paragraph);
        const records = pNodes.map(node => ({ node, section, paragraph: node.paragraph, chunks: [], text: '', objects: [] }));
        const byIndex = new Map(records.map(record => [record.paragraph.index, record]));
        for (const slot of indexed.slots) {
            // Read simple inline breaks for context, but only plain text slots can be patched.
            if (slot.plain || slot.textOnly) byIndex.get(slot.paragraphIndex).chunks.push({ slot, position: slot.begin, text: slot.text });
        }
        const objects = indexed.nodes.filter(node => ['tbl', 'pic', 'chart'].includes(local(node)));
        for (const object of objects) {
            const p = ancestor(object, node => node.paragraph);
            if (p) byIndex.get(p.paragraph.index).objects.push(object);
        }
        for (const node of indexed.nodes.filter(node => local(node) === 'autoNum' && kindOf(node.attrs.numType))) {
            const p = ancestor(node, node => node.paragraph);
            if (!p || !/^\d+$/.test(node.attrs.num || '')) continue;
            const format = indexed.nodes.find(child => child.parent === node && local(child) === 'autoNumFormat');
            const record = byIndex.get(p.paragraph.index);
            // A virtual label makes native counters discoverable even when the word is a format prefix.
            record.chunks.push({ node, format, position: node.start, text: node.attrs.num, autoKind: kindOf(node.attrs.numType) });
        }
        for (const record of records) {
            record.chunks.sort((a, b) => a.position - b.position);
            for (const chunk of record.chunks) {
                if (chunk.autoKind && !new RegExp(`${chunk.autoKind}\\s*(?:\\d+\\s*[-.‐‑–−]\\s*)*$`).test(record.text)) {
                    const prefix = chunk.format?.attrs.prefixChar || '';
                    record.text += prefix.includes(chunk.autoKind) ? prefix : `${chunk.autoKind} `;
                }
                chunk.start = record.text.length;
                record.text += chunk.text;
                chunk.end = record.text.length;
                if (chunk.autoKind) record.text += chunk.format?.attrs.suffixChar || '';
            }
            record.labels = labels(record.text);
        }
        return { section, xml, indexed, records, objects, byIndex };
    });
}

function captionCandidate(record, section) {
    const label = record.labels[0];
    if (!label || record.labels.length !== 1) return null;
    const caption = ancestor(record.node, node => local(node) === 'caption');
    const owner = caption && ancestor(caption, node => ['tbl', 'pic', 'chart'].includes(local(node)));
    const expected = owner && (local(owner) === 'tbl' ? '표' : '그림');
    if (owner) return { ...label, record, object: owner, wrongKind: expected !== label.kind };
    // Ordinary sentences, table contents, headers, footnotes and TOC entries are references, not captions.
    if (ancestor(record.node, node => ['tc', 'header', 'footer', 'footNote', 'endNote', 'drawText'].includes(local(node)))) return null;
    const prefix = record.text.slice(0, label.start).trim();
    const tail = record.text.slice(label.end), suffix = tail.replace(/^[\s\]>〉》】〕）)]+/, '').trim();
    if (!/^[[<〈《【〔（(]?$/.test(prefix) || !suffix || /(?:\t|[.·…_]{2,})\s*\d+\s*$/.test(suffix)
        || !/^(?:\s|[\]>〉》】〕）)])/.test(tail)
        || /^(?:에서|으로|처럼|부터|까지|참조|참고|은|는|이|가|을|를|과|와|에|의|로)(?:\s|[,.])/u.test(suffix)) return null;
    const siblings = section.records.filter(item => item.node.parent === record.node.parent && (item.text.trim() || item.objects.length));
    const index = siblings.indexOf(record);
    const neighbors = (label.kind === '표' ? [record, siblings[index + 1], siblings[index - 1]] : [record, siblings[index - 1], siblings[index + 1]]).filter(Boolean);
    const kinds = label.kind === '표' ? ['tbl'] : ['pic', 'chart'];
    const object = neighbors.flatMap(item => item.objects).find(node => kinds.includes(local(node))
        || (label.kind === '그림' && local(node) === 'tbl' && section.objects.some(child => ['pic', 'chart'].includes(local(child)) && child.start > node.start && child.end < node.end)));
    return object ? { ...label, record, object } : null;
}

function textEdit(record, start, end, value, edits) {
    const chunks = record.chunks.filter(chunk => chunk.end > start && chunk.start < end);
    if (!chunks.length || chunks[0].start > start || chunks.at(-1).end < end || chunks.some(chunk => chunk.slot && !chunk.slot.plain)) return false;
    // Counters store only the final ordinal; composite numbers around them are literal text.
    if (chunks.some(chunk => chunk.node && (chunk.start < start || chunk.end > end || !/^\d+$/.test(value)))) return false;
    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i], from = Math.max(0, start - chunk.start), to = Math.min(chunk.text.length, end - chunk.start);
        edits.push({ record, chunk, from, to, value: i === 0 ? value : '' });
    }
    return true;
}

function ordinalEdit(item, next, edits) {
    const oldOrdinal = item.parts.at(-1), start = item.end - oldOrdinal.length;
    return textEdit(item.record, start, item.end, next, edits);
}

function attributePatch(xml, node, name, value) {
    const opening = xml.slice(node.start, node.openEnd);
    const match = new RegExp(`\\b${name}\\s*=\\s*(["'])([^"']*)\\1`).exec(opening);
    if (!match) return null;
    const begin = node.start + match.index + match[0].indexOf(match[1]) + 1;
    return { begin, end: begin + match[2].length, replacement: String(value) };
}

/** Repair displayed caption ordinals and unambiguous references without rebuilding document XML. */
export function repairReportNumbering(input) {
    const entries = readHwpxPackage(input), sections = sectionRecords(entries);
    const report = { status: 'checked', tables: 0, figures: 0, captions: [], corrections: [], warnings: [], uncaptionedObjects: [] };
    const warn = message => { if (!report.warnings.includes(message)) report.warnings.push(message); };
    const edits = [], counters = new Map(), targets = new Map(), captions = new Set(), assigned = new Map(), last = new Map(), nativeCaptions = [];
    let chapter = null;
    for (const section of sections) for (const record of section.records) {
        if (!ancestor(record.node, node => ['tc', 'caption', 'header', 'footer', 'footNote', 'endNote'].includes(local(node)))) {
            const heading = /^\s*제\s*(\d+)\s*장(?:\s|[.·:：]|$)/.exec(record.text.normalize('NFKC'));
            if (heading) chapter = Number(heading[1]);
        }
        const item = captionCandidate(record, section);
        if (!item) continue;
        const location = locationOf(record);
        if (chapter !== null && item.parts.length > 1 && Number(item.parts[0]) !== chapter) {
            warn(`${location}: '${item.kind} ${item.numberText}'의 앞 번호가 제${chapter}장과 다릅니다. 장·절 번호 체계를 확인하세요.`);
        }
        if (item.wrongKind) { captions.add(record); warn(`${location}: 개체 종류와 표·그림 제목이 다릅니다. 제목을 확인하세요.`); continue; }
        const prefix = item.parts.slice(0, -1).map(Number).join('-'), scope = `${item.kind}:${prefix}`;
        const continuation = /(?:[（([]\s*(?:계\s*속|continued)\s*[）)\]]|(?:계\s*속|continued)\s*$)/i.test(record.text);
        const previous = last.get(scope);
        if (continuation && (!previous || previous.key !== item.key)) {
            warn(`${location}: '${item.kind} ${item.numberText}'의 앞쪽 계속 표·그림을 찾을 수 없습니다.`);
            captions.add(record); continue;
        }
        // Several paragraph lines in one native caption refer to the same object.
        if (assigned.has(item.object) && !continuation) { warn(`${location}: 한 개체에 번호가 여러 개 있습니다. 제목을 확인하세요.`); continue; }
        const ordinal = continuation ? previous.ordinal : (counters.get(scope) || 0) + 1;
        const next = item.numberText.replace(/\d+$/, String(ordinal).padStart(item.parts.at(-1).length > 1 && item.parts.at(-1).startsWith('0') ? item.parts.at(-1).length : 1, '0'));
        const auto = record.chunks.find(chunk => chunk.node && chunk.end > item.numberStart && chunk.start < item.end);
        captions.add(record); assigned.set(item.object, item);
        if (!continuation) {
            counters.set(scope, ordinal); last.set(scope, { ...item, ordinal });
            report[item.kind === '표' ? 'tables' : 'figures']++;
        }
        const target = { ...item, ordinal, next, location };
        const unsupported = auto?.format && auto.format.attrs.type !== 'DIGIT';
        if (unsupported) { warn(`${location}: 숫자 이외의 자동 번호 형식은 한글에서 확인하세요.`); target.ordinal = Number(item.parts.at(-1)); target.next = item.numberText; }
        else if (auto) nativeCaptions.push({ ...target, auto });
        const group = targets.get(item.key) || []; group.push(target); targets.set(item.key, group);
        if (!unsupported && next !== item.numberText) {
            if (ordinalEdit(item, String(ordinal).padStart(next.match(/\d+$/)[0].length, '0'), edits)) {
                report.corrections.push({ type: 'caption', kind: item.kind, before: item.numberText, after: next, location });
            } else { target.ordinal = Number(item.parts.at(-1)); target.next = item.numberText;
                warn(`${location}: 복합 번호 구간을 자동 수정할 수 없습니다.`); }
        }
        report.captions.push({ kind: item.kind, before: item.numberText, after: target.next, location, continuation });
    }
    for (const section of sections) for (const record of section.records) {
        if (captions.has(record) || ancestor(record.node, node => ['header', 'footer', 'footNote', 'endNote'].includes(local(node)))) continue;
        for (const label of record.labels) {
            const location = locationOf(record);
            const candidates = targets.get(label.key) || [], newNumbers = [...new Set(candidates.map(item => item.next.replace(/\s/g, '').replace(/[.‐‑–−]/g, '-')))];
            if (!candidates.length) { warn(`${location}: '${label.kind} ${label.numberText}'에 연결되는 표·그림 제목이 없습니다.`); continue; }
            if (newNumbers.length !== 1) { warn(`${location}: '${label.kind} ${label.numberText}' 번호가 중복되어 참조 대상을 확인해야 합니다.`); continue; }
            const target = candidates[0];
            if (target.ordinal === Number(label.parts.at(-1))) continue;
            if (/^(?:\s*(?:[~∼～,–-]|및|와|과|내지)\s*\d)/.test(record.text.slice(label.end)) || /전회차|이전\s*보고서|타\s*시설|참고문헌|출처/.test(record.text)) {
                warn(`${location}: 범위·외부 자료 참조 '${label.kind} ${label.numberText}'를 확인하세요.`); continue;
            }
            if (section.indexed.nodes.some(node => local(node) === 'fieldBegin' && node.start >= record.node.start && node.end <= record.node.end)) {
                warn(`${location}: 연결 필드의 '${label.kind} ${label.numberText}' 참조는 한글에서 필드를 갱신하세요.`); continue;
            }
            const ordinal = String(target.ordinal).padStart(label.parts.at(-1).startsWith('0') ? label.parts.at(-1).length : 1, '0');
            if (ordinalEdit({ ...label, record }, ordinal, edits)) report.corrections.push({ type: 'reference', kind: label.kind,
                before: label.numberText, after: label.numberText.replace(/\d+$/, ordinal), location });
            else warn(`${location}: 복합 참조 번호를 자동 수정할 수 없습니다.`);
        }
        if (/표\s*(?:목차|차례)|그림\s*(?:목차|차례)/.test(record.text)) warn('표·그림 목차의 쪽 번호는 한글에서 목차를 갱신해 확인하세요.');
    }
    // Native counters also have reset/start controls. Keep their values consistent with repaired captions.
    const controlPatches = new Map();
    for (const section of sections) {
        const patches = [];
        for (const node of section.indexed.nodes) {
            if (!['newNum', 'startNum'].includes(local(node))) continue;
            for (const [type, attr] of local(node) === 'newNum' ? [[node.attrs.numType, 'num']] : [['TABLE', 'table'], ['PICTURE', 'pic']]) {
                const kind = kindOf(type);
                if (!kind || !(attr in node.attrs)) continue;
                const next = nativeCaptions.find(item => item.kind === kind && item.record.section === section.section && item.auto.node.start > node.start);
                if (!next) continue;
                const firstAuto = section.indexed.nodes.find(item => local(item) === 'autoNum' && item.attrs.numType === type && item.start > node.start);
                if (firstAuto !== next.auto.node) continue;
                const value = next.ordinal;
                if (value !== Number(node.attrs[attr])) {
                    const patch = attributePatch(section.xml, node, attr, value);
                    if (patch) { patches.push(patch); report.corrections.push({ type: 'counter', kind, before: node.attrs[attr], after: String(value), location: sectionLabel(section.section) }); }
                }
            }
        }
        for (const item of nativeCaptions.filter(item => item.record.section === section.section)) {
            const node = item.auto.node;
            if (local(node.parent) !== 'ctrl') { warn(`${item.location}: 자동 번호 제어 구조를 한글에서 확인하세요.`); continue; }
            const siblings = section.indexed.nodes.filter(child => child.parent === node.parent);
            const previous = siblings[siblings.indexOf(node) - 1];
            if (previous && local(previous) === 'newNum' && previous.attrs.numType === node.attrs.numType) continue;
            const prefix = node.name.includes(':') ? `${node.name.split(':')[0]}:` : '';
            patches.push({ begin: node.start, end: node.start, replacement: `<${prefix}newNum num="${item.ordinal}" numType="${node.attrs.numType}"/>` });
            report.corrections.push({ type: 'counter', kind: item.kind, before: '자동', after: String(item.ordinal), location: item.location });
        }
        controlPatches.set(section.section, patches);
        for (const object of section.objects) if (!assigned.has(object) && !ancestor(object, parent => assigned.get(parent)?.kind === '그림')) {
            report.uncaptionedObjects.push({ kind: local(object) === 'tbl' ? '표' : '그림', section: section.section, position: object.start });
        }
    }
    if (report.uncaptionedObjects.length) warn(`번호가 연결되지 않은 표·그림 개체 ${report.uncaptionedObjects.length}개가 있습니다. 배치용 표인지 제목이 누락된 개체인지 확인하세요.`);
    let changed = false;
    for (const section of sections) {
        const selected = edits.filter(edit => edit.record.section === section.section), groups = new Map(), modified = new Set();
        const patches = controlPatches.get(section.section);
        for (const edit of selected) {
            const group = groups.get(edit.chunk) || []; group.push(edit); groups.set(edit.chunk, group);
            modified.add(edit.record.paragraph.index);
        }
        for (const [chunk, changes] of groups) {
            let text = chunk.text;
            for (const edit of changes.sort((a, b) => b.from - a.from)) text = text.slice(0, edit.from) + edit.value + text.slice(edit.to);
            if (chunk.node) {
                const patch = attributePatch(section.xml, chunk.node, 'num', text);
                if (patch) patches.push(patch);
            } else {
                const prefix = chunk.slot.tagName.includes(':') ? `${chunk.slot.tagName.split(':')[0]}:` : '';
                patches.push({ begin: chunk.slot.begin, end: chunk.slot.end,
                    replacement: text.split('\n').map(line => escape(line).replaceAll('\t', `<${prefix}tab/>`)).join(`<${prefix}lineBreak/>`) });
            }
        }
        for (const index of modified) for (const range of section.indexed.paragraphs[index].layoutCaches) patches.push({ ...range, replacement: '' });
        if (!patches.length) continue;
        patches.sort((a, b) => b.begin - a.begin);
        let xml = section.xml, limit = xml.length;
        for (const patch of patches) {
            if (patch.end > limit) throw new Error('표·그림 번호 수정 위치가 겹칩니다.');
            xml = xml.slice(0, patch.begin) + patch.replacement + xml.slice(patch.end); limit = patch.begin;
        }
        if (XMLValidator.validate(xml) !== true) throw new Error('표·그림 번호 수정 후 문서 검증에 실패했습니다.');
        entries[section.section] = strToU8(xml); changed = true;
    }
    report.status = report.warnings.length ? 'review-required' : report.corrections.length ? 'corrected' : 'checked';
    if (changed) delete entries['Preview/PrvImage.png'];
    return { bytes: changed ? packHwpxPackage(entries) : input, report };
}
