import { strFromU8, strToU8 } from 'fflate';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { indexHwpxSection, packHwpxPackage, readHwpxPackage } from './hwpxPackage.js';
import { analyzeReport } from './sourceParser.js';
import { createCollectionForm, fingerprint, inputFields } from './collectionForms.js';
import { validateData } from './reportEngine.js';

const local = name => name.split(':').at(-1);
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);
const nearest = (node, name) => {
    for (let parent = node.parent; parent; parent = parent.parent) if (local(parent.name) === name) return parent;
    return null;
};
const markerPrefix = 'JDF_';
const slotToken = '__JINDAN_COLLECTION_INPUT__';
const xmlParser = new XMLParser({ preserveOrder: true, ignoreAttributes: false, parseTagValue: false, trimValues: false, processEntities: true });
function cellText(xml) {
    const keyOf = node => Object.keys(node).find(key => ![':@', '#text'].includes(key));
    const text = nodes => nodes.map(node => {
        if ('#text' in node) return String(node['#text']);
        const key = keyOf(node), name = local(key || '');
        if (['tbl', 'pic', 'ole', 'script'].includes(name)) return '';
        if (name === 'lineBreak') return '\n';
        if (name === 'tab') return '\t';
        return text(node[key] || []);
    }).join('');
    const paragraphs = [];
    const walk = nodes => {
        for (const node of nodes) {
            const key = keyOf(node);
            if (!key || local(key) === 'tbl') continue;
            if (local(key) === 'p') paragraphs.push(text(node[key]).trim());
            else walk(node[key] || []);
        }
    };
    walk(xmlParser.parse(xml));
    return paragraphs.filter(Boolean).join('\n');
}
const replaceAttribute = (tag, name, value) => {
    const pattern = new RegExp(`\\b${name}\\s*=\\s*(?:"[^"]*"|'[^']*')`);
    return pattern.test(tag) ? tag.replace(pattern, `${name}="${escape(value)}"`) : tag.replace(/\/?\s*>$/, ending => ` ${name}="${escape(value)}"${ending}`);
};
function patchXml(xml, patches, origin = 0) {
    let boundary = origin + xml.length;
    for (const patch of patches.sort((a, b) => b.begin - a.begin)) {
        if (patch.end > boundary || patch.begin < origin || patch.begin > patch.end) throw new Error('조사 양식의 교체 위치가 겹칩니다.');
        xml = xml.slice(0, patch.begin - origin) + patch.text + xml.slice(patch.end - origin);
        boundary = patch.begin;
    }
    return xml;
}
function paragraph(text, character = '0', shape = '0', style = '0') {
    return `<hp:p id="0" paraPrIDRef="${escape(shape)}" styleIDRef="${escape(style)}" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="${escape(character)}"><hp:t>${escape(text)}</hp:t></hp:run></hp:p>`;
}
function supplementalTable(field, name, id, border = '1') {
    const cell = (column, text, marker = '') => `<hp:tc name="${escape(marker)}" header="0" hasMargin="1" protect="0" editable="0" dirty="0" borderFillIDRef="${escape(border)}"><hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">${paragraph(text)}</hp:subList><hp:cellAddr colAddr="${column}" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="20000" height="3000"/><hp:cellMargin left="141" right="141" top="141" bottom="141"/></hp:tc>`;
    return `<hp:tbl id="${id}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="0" rowCnt="1" colCnt="2" cellSpacing="0" borderFillIDRef="${escape(border)}" noAdjust="0"><hp:sz width="40000" widthRelTo="ABSOLUTE" height="3000" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="141" bottom="141"/><hp:inMargin left="141" right="141" top="141" bottom="141"/><hp:tr>${cell(0, `${field.group} / ${field.label}${field.unit ? ` (${field.unit})` : ''}`)}${cell(1, '', name)}</hp:tr></hp:tbl>`;
}
function hostTable(xml, node, tableXml) {
    const parent = nearest(node, 'p');
    const character = nearest(node, 'run')?.attrs.charPrIDRef || '0';
    let opening = parent ? xml.slice(parent.start, parent.openEnd) : '<hp:p id="0" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">';
    opening = replaceAttribute(replaceAttribute(opening, 'pageBreak', '0'), 'columnBreak', '0');
    return `${opening}<hp:run charPrIDRef="${escape(character)}">${tableXml}</hp:run></${parent?.name || 'hp:p'}>`;
}

async function collectionPlan(workspace, sourceBytes, options) {
    const form = await createCollectionForm(workspace, options);
    if (workspace.document.format !== 'hwpx') throw new Error('한글에서 기존 HWP 보고서를 HWPX 사본으로 저장해 등록하세요. 한글 조사 양식은 HWPX로 내보냅니다.');
    const bytes = sourceBytes instanceof Uint8Array ? sourceBytes : new Uint8Array(sourceBytes);
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
    if (hash !== workspace.source.sha256) throw new Error('조사 양식의 원본 보고서 버전이 다릅니다.');
    const entries = readHwpxPackage(bytes), sections = new Map(), tableNodes = new Map(), cellNodes = new Map();
    const sectionNames = Object.keys(entries).filter(name => /^Contents\/section\d+\.xml$/.test(name)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
    for (const name of sectionNames) {
        const xml = strFromU8(entries[name]), index = indexHwpxSection(xml, name);
        sections.set(name, { xml, ...index });
        const nodes = index.nodes.filter(node => local(node.name) === 'tbl');
        const cellsByTable = new Map();
        for (const cell of index.nodes) if (local(cell.name) === 'tc') {
            const parent = nearest(cell, 'tbl');
            if (!cellsByTable.has(parent)) cellsByTable.set(parent, []);
            cellsByTable.get(parent).push(cell);
        }
        const tables = workspace.document.tables.filter(table => table.anchor.section === name);
        if (tables.length !== nodes.length) throw new Error('원본 표 구조가 달라졌습니다. 보고서를 다시 등록하세요.');
        for (const [tableIndex, table] of tables.entries()) {
            const node = nodes[tableIndex];
            tableNodes.set(table.id, node);
            const cells = cellsByTable.get(node) || [];
            if (cells.length !== table.cells.length) throw new Error('원본 표의 셀 연결을 확인할 수 없습니다.');
            table.cells.forEach((cell, i) => cellNodes.set(cell.id, cells[i]));
        }
    }
    const fields = inputFields(workspace).filter(field => form.fields.some(item => item.id === field.id)), mappings = [], cellsUsed = new Set();
    for (const [index, field] of fields.entries()) {
        const name = `${markerPrefix}${form.schemaFingerprint}_${index}`;
        if (!field.binding?.cellId) { mappings.push({ field, name, supplemental: true, prefix: '', suffix: '' }); continue; }
        if (field.binding.sourceSha256 !== workspace.source.sha256) throw new Error(`${field.label}: 원본 교체 위치가 다릅니다.`);
        const table = workspace.document.tables.find(table => table.id === field.binding.tableId);
        const cell = table?.cells.find(cell => cell.id === field.binding.cellId), node = cellNodes.get(field.binding.cellId);
        if (!cell || !node) throw new Error(`${field.label}: 조사할 표의 셀을 찾을 수 없습니다.`);
        if (cellsUsed.has(cell.id)) throw new Error(`${field.label}: 한글 조사 양식은 셀 하나에 입력항목 하나를 연결하세요. 같은 셀의 여러 글자 구간을 하나의 입력항목으로 정리하세요.`);
        cellsUsed.add(cell.id);
        const wholeCell = field.binding.scope === 'cell';
        const slots = wholeCell ? cell.textSlots : [field.binding.slotId ? cell.textSlots.find(slot => slot.id === field.binding.slotId) : cell.textSlots.length === 1 ? cell.textSlots[0] : null];
        if (!slots.length || slots.some(slot => !slot?.plain && !(wholeCell && slot?.textOnly))) throw new Error(`${field.label}: 입력할 글자 구간 또는 셀 전체를 지정하세요. 표의 판정 셀처럼 교체할 구간만 선택하세요.`);
        if (wholeCell) { mappings.push({ field, name, table, cell, node, slots, prefix: '', suffix: '' }); continue; }
        const slot = slots[0];
        const section = sections.get(table.anchor.section), cellXml = section.xml.slice(node.start, node.end);
        const tagged = patchXml(cellXml, [{ begin: slot.begin, end: slot.end, text: slot.selfClosing ? `<${slot.tagName}>${slotToken}</${slot.tagName}>` : slotToken }], node.start);
        const pieces = cellText(tagged).split(slotToken);
        if (pieces.length !== 2) throw new Error(`${field.label}: 입력 셀의 고정 문구를 구분할 수 없습니다.`);
        mappings.push({ field, name, table, cell, node, slots, prefix: pieces[0], suffix: pieces[1] });
    }
    if (!mappings.length) throw new Error('조사할 입력항목을 먼저 지정하세요.');
    return { entries, sections, tableNodes, cellNodes, form, mappings };
}

export async function exportNativeCollection(workspace, sourceBytes, options) {
    const plan = await collectionPlan(workspace, sourceBytes, options);
    const selected = new Set(plan.mappings.filter(item => !item.supplemental).map(item => plan.tableNodes.get(item.table.id)));
    const roots = [...selected].filter(node => {
        for (let parent = nearest(node, 'tbl'); parent; parent = nearest(parent, 'tbl')) if (selected.has(parent)) return false;
        return true;
    });
    const newSections = [], usedIds = new Set([...plan.sections.values()].flatMap(section => section.nodes.map(node => node.attrs.id)));
    let extraId = 2000000000;
    const extra = plan.mappings.filter(item => item.supplemental);
    for (const [name, section] of plan.sections) {
        const tables = roots.filter(node => section.nodes.includes(node));
        if (!tables.length && (newSections.length || !extra.length)) continue;
        const root = section.nodes.find(node => local(node.name) === 'sec');
        if (!root) throw new Error('HWPX 구역 구조를 찾을 수 없습니다.');
        const secPr = section.nodes.find(node => local(node.name) === 'secPr');
        const rootStart = section.xml.slice(root.start, root.openEnd);
        let body = secPr ? `<hp:p id="0" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="0">${section.xml.slice(secPr.start, secPr.end)}</hp:run></hp:p>` : '';
        if (!newSections.length) body += paragraph(`${workspace.projectTitle} · ${plan.form.disciplineLabel} 진단 조사 양식`) + paragraph('빈 입력 칸에 새 측정값·판정만 작성하고 HWPX로 저장하세요. 장비명·규격은 유지됩니다. 입력 셀의 필드 이름과 표·셀 구조는 지우지 마세요.');
        for (const tableNode of tables) {
            const original = workspace.document.tables.find(table => plan.tableNodes.get(table.id) === tableNode);
            const mappings = plan.mappings.filter(item => !item.supplemental && item.node.start >= tableNode.start && item.node.end <= tableNode.end && item.table.anchor.section === name);
            const patches = [];
            for (const item of mappings) {
                patches.push({ begin: item.node.start, end: item.node.openEnd, text: replaceAttribute(section.xml.slice(item.node.start, item.node.openEnd), 'name', item.name) });
                for (const slot of item.slots) patches.push({ begin: slot.begin, end: slot.end, text: slot.selfClosing ? `<${slot.tagName}/>` : '' });
            }
            for (const p of section.paragraphs) for (const cache of p.layoutCaches) if (cache.begin >= tableNode.start && cache.end <= tableNode.end) patches.push({ ...cache, text: '' });
            for (const node of section.nodes) if (local(node.name) === 'pos' && node.parent === tableNode) patches.push({ begin: node.start, end: node.openEnd, text: replaceAttribute(section.xml.slice(node.start, node.openEnd), 'treatAsChar', '1') });
            const tableXml = patchXml(section.xml.slice(tableNode.start, tableNode.end), patches, tableNode.start);
            body += paragraph(original.title) + hostTable(section.xml, tableNode, tableXml);
        }
        if (!newSections.length) for (const item of extra) {
            while (usedIds.has(String(extraId))) extraId++;
            const border = section.nodes.find(node => local(node.name) === 'tc')?.attrs.borderFillIDRef || '1';
            const tableXml = supplementalTable(item.field, item.name, extraId++, border);
            body += `<hp:p id="0" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="0">${tableXml}</hp:run></hp:p>`;
        }
        const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${rootStart}${body}</${root.name}>`;
        if (XMLValidator.validate(xml) !== true) throw new Error('생성한 한글 조사 양식의 구조를 확인할 수 없습니다.');
        newSections.push(strToU8(xml));
    }
    for (const name of Object.keys(plan.entries)) if (/^Contents\/section\d+\.xml$/.test(name)) delete plan.entries[name];
    newSections.forEach((bytes, i) => { plan.entries[`Contents/section${i}.xml`] = bytes; });
    if (plan.entries['Contents/header.xml']) plan.entries['Contents/header.xml'] = strToU8(strFromU8(plan.entries['Contents/header.xml']).replace(/\bsecCnt="\d+"/, `secCnt="${newSections.length}"`));
    if (plan.entries['Contents/content.hpf']) {
        let hpf = strFromU8(plan.entries['Contents/content.hpf']);
        const oldIds = new Set();
        hpf = hpf.replace(/<([\w.-]+:)?item\b[^>]*\/>/g, tag => {
            if (!/\bhref="Contents\/section\d+\.xml"/.test(tag)) return tag;
            oldIds.add(tag.match(/\bid="([^"]+)"/)?.[1]); return '';
        });
        hpf = hpf.replace(/<([\w.-]+:)?itemref\b[^>]*\/>/g, tag => oldIds.has(tag.match(/\bidref="([^"]+)"/)?.[1]) ? '' : tag);
        hpf = hpf.replace(/<\/([\w.-]+:)?manifest>/, (tag, prefix = '') => newSections.map((_, i) => `<${prefix}item id="section${i}" href="Contents/section${i}.xml" media-type="application/xml"/>`).join('') + tag);
        hpf = hpf.replace(/<\/([\w.-]+:)?spine>/, (tag, prefix = '') => newSections.map((_, i) => `<${prefix}itemref idref="section${i}" linear="yes"/>`).join('') + tag);
        // Keep only binary assets referenced by retained XML. Survey files do not carry every image in the old report.
        const retainedXml = Object.entries(plan.entries).filter(([name]) => /\.xml$/.test(name)).map(([, bytes]) => strFromU8(bytes)).join('\n');
        hpf = hpf.replace(/<([\w.-]+:)?item\b[^>]*\/>/g, tag => {
            const path = tag.match(/\bhref="(BinData\/[^"]+)"/)?.[1], id = tag.match(/\bid="([^"]+)"/)?.[1];
            if (!path || !id || retainedXml.includes(`"${id}"`) || retainedXml.includes(`'${id}'`) || retainedXml.includes(path)) return tag;
            delete plan.entries[path]; return '';
        });
        plan.entries['Contents/content.hpf'] = strToU8(hpf);
    }
    if (plan.entries['settings.xml']) plan.entries['settings.xml'] = strToU8(strFromU8(plan.entries['settings.xml']).replace(/<([\w.-]+:)?CaretPosition\b[^>]*\/>/, (_, prefix = '') => `<${prefix}CaretPosition listIDRef="0" paraIDRef="0" pos="0"/>`));
    if (plan.entries['Preview/PrvText.txt']) plan.entries['Preview/PrvText.txt'] = strToU8('새 측정값과 판정을 작성할 진단 조사 양식입니다. 작성 후 HWPX로 저장하여 앱에서 불러오세요.');
    delete plan.entries['Preview/PrvImage.png'];
    return { bytes: packHwpxPackage(plan.entries), fieldCount: plan.mappings.length, tableCount: roots.length + extra.length, schemaFingerprint: plan.form.schemaFingerprint };
}

export async function readNativeCollection(workspace, sourceBytes, filledBytes, filename = '', options) {
    const plan = await collectionPlan(workspace, sourceBytes, options);
    const document = await analyzeReport(filledBytes, filename);
    if (document.format !== 'hwpx') throw new Error('작성한 조사 파일을 HWPX로 저장한 뒤 불러오세요.');
    const names = new Map(), warnings = [];
    for (const table of document.tables) for (const cell of table.cells) {
        if (!cell.fieldName?.startsWith(markerPrefix)) continue;
        if (names.has(cell.fieldName)) throw new Error('조사 파일에 같은 입력 셀이 복제되었습니다. 중복된 표·셀을 확인하세요.');
        names.set(cell.fieldName, { table, cell });
    }
    const expected = new Set(plan.mappings.map(item => item.name));
    if ([...names.keys()].some(name => !expected.has(name))) throw new Error('다른 프로젝트·분야·양식 버전의 한글 조사 파일입니다. 현재 양식으로 작성한 파일을 선택하세요.');
    const missing = plan.mappings.filter(item => !names.has(item.name));
    if (missing.length) throw new Error(`조사 파일의 입력 셀 식별자가 없습니다: ${missing.slice(0, 5).map(item => item.field.label).join(', ')}. 내보낸 한글 양식에서 표·셀을 삭제하지 말고 내용만 작성하세요.`);
    const values = {}, comparedTables = new Set();
    for (const item of plan.mappings) {
        const { table, cell } = names.get(item.name), text = cell.text;
        if (text === (item.prefix + item.suffix).trim()) values[item.field.id] = '';
        else {
            if (!text.startsWith(item.prefix) || !text.endsWith(item.suffix) || text.length < item.prefix.length + item.suffix.length) throw new Error(`${item.field.label}: 입력 구간 밖의 고정 문구·단위가 바뀌었습니다. 내보낸 양식의 고정 문구를 유지하세요.`);
            values[item.field.id] = text.slice(item.prefix.length, item.suffix ? -item.suffix.length : undefined).trim();
        }
        if (!item.supplemental && !comparedTables.has(item.table.id)) {
            comparedTables.add(item.table.id);
            const editable = new Set(plan.mappings.filter(mapping => mapping.table?.id === item.table.id).map(mapping => mapping.cell.id));
            const changed = item.table.cells.filter(original => !editable.has(original.id)).some(original => table.cells.find(cell => cell.row === original.row && cell.column === original.column)?.text !== original.text);
            if (changed) warnings.push(`${item.table.title}: 장비명·규격 등 고정 셀의 변경은 가져오지 않습니다. 보고서에는 원래 고정 내용을 유지합니다.`);
        }
    }
    const collection = { ...plan.form, values, collectedFrom: { filename, sha256: document.source.sha256 } };
    const validation = validateData({ ...workspace, values: { ...workspace.values, ...values } });
    return { collection, warnings, errors: validation.errors, inputFingerprint: await fingerprint({ values: workspace.values, revision: workspace.revision }),
        rows: plan.mappings.map(item => ({ id: item.field.id, group: item.field.group, label: item.field.label, unit: item.field.unit, previous: workspace.values[item.field.id] ?? '', value: values[item.field.id] })) };
}
