import { XMLParser, XMLValidator } from 'fast-xml-parser';

export const MAX_BMT_BYTES = 48 * 1024 * 1024;
const fail = message => { throw new Error(message); };
const ascii = (bytes, start, end) => new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(start, end));
function findBytes(bytes, text, start = 0, end = bytes.length) {
    const search = new TextEncoder().encode(text);
    outer: for (let i = start; i <= end - search.length; i++) {
        for (let j = 0; j < search.length; j++) if (bytes[i + j] !== search[j]) continue outer;
        return i;
    }
    return -1;
}
/** Read only the self-describing ToFo 1.0.1 BmtMetaData variant observed in Testo 868 files. */
export function readThermalBmt(input) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    if (!bytes.length || bytes.length > MAX_BMT_BYTES) fail('BMT 원본은 0바이트보다 크고 48MB 이하여야 합니다.');
    if (bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255) fail('지원하는 Testo BMT 원본 형식이 아닙니다.');
    const headerStart = findBytes(bytes, '<ToFo ', 0, Math.min(bytes.length, 2 * 1024 * 1024));
    const headerEnd = headerStart < 0 ? -1 : findBytes(bytes, '</ToFo>', headerStart, Math.min(bytes.length, headerStart + 2048));
    if (headerStart < 0 || headerEnd < 0) fail('BMT의 ToFo 형식 정보를 찾을 수 없습니다.');
    const headerXml = ascii(bytes, headerStart, headerEnd + 7);
    if (/<!DOCTYPE|<!ENTITY/i.test(headerXml) || XMLValidator.validate(headerXml) !== true) fail('BMT 형식 정보가 올바르지 않습니다.');
    const header = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '', parseAttributeValue: false }).parse(headerXml)?.ToFo;
    if (header?.version !== '1.0.1' || header.data?.endianness !== 'little') fail('이 BMT 버전은 아직 지원하지 않습니다. IRSoft에서 내보낸 자료로 확인하세요.');
    const xmlSize = Number(header.xml?.size), dataSize = Number(header.data?.size);
    if (!Number.isSafeInteger(xmlSize) || xmlSize < 1 || xmlSize > 512 * 1024 || !Number.isSafeInteger(dataSize) || dataSize < 1 || dataSize > MAX_BMT_BYTES) fail('BMT 내용 크기가 올바르지 않습니다.');
    let schemaStart = headerEnd + 7;
    while ([10, 13, 32, 9].includes(bytes[schemaStart])) schemaStart++;
    const dataStart = schemaStart + xmlSize, dataEnd = dataStart + dataSize;
    if (dataEnd > bytes.length || bytes.length - dataEnd > 64) fail('BMT 데이터 길이가 형식 정보와 다릅니다.');
    const schemaXml = ascii(bytes, schemaStart, dataStart);
    if (/<!DOCTYPE|<!ENTITY/i.test(schemaXml) || XMLValidator.validate(schemaXml) !== true) fail('BMT 항목 정의가 올바르지 않습니다.');
    const tree = new XMLParser({ preserveOrder: true, ignoreAttributes: false, parseTagValue: false }).parse(schemaXml);
    if (tree.length !== 1 || tree[0][':@']?.['@_name'] !== 'BmtMetaData' || !tree[0].group) fail('BMT 측정 메타데이터를 찾을 수 없습니다.');
    const fields = new Map(); let offset = dataStart, count = 0;
    const walk = (nodes, path = '', depth = 0) => {
        if (depth > 24) fail('BMT 항목의 중첩 한도를 넘습니다.');
        for (const node of nodes) {
            if (node['#text'] != null) { if (String(node['#text']).trim()) fail('BMT 항목 정의가 올바르지 않습니다.'); continue; }
            const attrs = node[':@'] || {}, name = attrs['@_name'];
            if (typeof name !== 'string' || !name || name.includes('/') || ++count > 10000) fail('BMT 항목 이름 또는 개수 한도를 확인하세요.');
            const key = `${path}/${name}`;
            if (node.group) walk(node.group, key, depth + 1);
            else if (node.item) {
                const size = Number(attrs['@_size']), type = attrs['@_type'];
                if (!Number.isSafeInteger(size) || size < 0 || offset + size > dataEnd || fields.has(key)) fail('BMT 항목 크기 또는 중복 항목을 확인하세요.');
                fields.set(key, { type, bytes: bytes.subarray(offset, offset + size) }); offset += size;
            } else fail('지원하지 않는 BMT 항목 정의입니다.');
        }
    };
    walk(tree);
    if (offset !== dataEnd) fail('BMT 데이터와 항목 정의의 크기가 일치하지 않습니다.');
    return { bytes, fields, headerStart, trailerBytes: bytes.length - dataEnd };
}

export async function inspectThermalBmt(input, filename = '', { includeImages = false } = {}) {
    const parsed = readThermalBmt(input), { bytes, fields } = parsed;
    const field = key => fields.get(`/BmtMetaData/${key}`);
    const number = (key, type, size, getter) => {
        const item = field(key);
        if (!item) return null;
        if (item.type !== type || item.bytes.length !== size) fail(`BMT ${key} 항목 형식이 다릅니다.`);
        const view = new DataView(item.bytes.buffer, item.bytes.byteOffset, size), value = view[getter](0, true);
        return Number.isFinite(value) ? value : null;
    };
    const string = key => {
        const item = field(key);
        if (!item) return '';
        if (item.type !== 'string' || item.bytes.length < 4 || item.bytes.length > 8192) fail('BMT 문자열 형식을 확인하세요.');
        if (new DataView(item.bytes.buffer, item.bytes.byteOffset, 4).getUint32(0, true) !== item.bytes.length - 4) fail('BMT 문자열 길이가 다릅니다.');
        return ascii(item.bytes, 4, item.bytes.length);
    };
    const temp = key => {
        const kelvin = number(key, 'Temperature<MarkedFloat>', 4, 'getFloat32');
        return { raw: kelvin, unit: 'K', celsius: kelvin != null && kelvin > 0 && kelvin < 2000 ? kelvin - 273.15 : null };
    };
    const grid = field('Images/Ir');
    if (!grid || grid.type !== 'cvmat' || grid.bytes.length < 24) fail('BMT 열화상 배열을 찾을 수 없습니다.');
    const view = new DataView(grid.bytes.buffer, grid.bytes.byteOffset, grid.bytes.length);
    const [dimensions, rows, columns, cvType, channels, elementSize] = Array.from({ length: 6 }, (_, i) => view.getInt32(i * 4, true));
    if (dimensions !== 2 || cvType !== 2 || channels !== 1 || elementSize !== 2 || rows < 1 || columns < 1 || rows * columns > 4 * 1024 * 1024 || rows * columns * 2 + 24 !== grid.bytes.length) fail('이 BMT의 열화상 배열 형식은 아직 지원하지 않습니다.');
    let minimum = Infinity, maximum = -Infinity;
    for (let i = 24; i < grid.bytes.length; i += 2) { const raw = view.getUint16(i, true); minimum = Math.min(minimum, raw); maximum = Math.max(maximum, raw); }
    const points = ['CenterSpot', 'ColdSpot', 'HotSpot', 'MeasPoint1', 'MeasPoint2', 'MeasPoint3', 'MeasPoint4', 'MeasPoint5'].flatMap(name => {
        const item = field(`MeasPoints/${name}/Position`);
        if (!item) return [];
        if (item.type !== 'cvpoint' || item.bytes.length !== 8) fail('BMT 측정점 위치 형식이 다릅니다.');
        const v = new DataView(item.bytes.buffer, item.bytes.byteOffset, 8), x = v.getInt32(0, true), y = v.getInt32(4, true);
        const visible = number(`MeasPoints/${name}/Visible`, 'bool', 1, 'getUint8') === 1;
        return [{ name, x, y, visible, raw: x >= 0 && y >= 0 && x < columns && y < rows ? view.getUint16(24 + (y * columns + x) * 2, true) : null, temperatureC: null }];
    });
    const dateItem = field('FileInfo/DateTime');
    if (dateItem && (dateItem.type !== 'uint64' || dateItem.bytes.length !== 8)) fail('BMT 촬영시각 형식이 다릅니다.');
    const encodedSeconds = dateItem ? new DataView(dateItem.bytes.buffer, dateItem.bytes.byteOffset, 8).getBigUint64(0, true) : null;
    const recordedClock = encodedSeconds != null && encodedSeconds <= 253402300799n ? new Date(Number(encodedSeconds) * 1000).toISOString().slice(0, 19).replace('T', ' ') : '';
    const coefficients = field('Recompute/RecomputeCoeffs');
    let recomputeCoefficients = [];
    if (coefficients) {
        const v = new DataView(coefficients.bytes.buffer, coefficients.bytes.byteOffset, coefficients.bytes.length);
        if (coefficients.type !== 'vecfloat' || v.byteLength < 4 || v.byteLength > 1028 || v.getUint32(0, true) * 4 + 4 !== v.byteLength) fail('BMT 온도 환산계수 형식이 다릅니다.');
        recomputeCoefficients = Array.from({ length: (v.byteLength - 4) / 4 }, (_, i) => v.getFloat32(4 + i * 4, true));
    }
    const jpeg = (key) => {
        const item = field(key);
        if (!item) return null;
        if (item.type !== 'vecuint8' || item.bytes.length < 8) fail('BMT 실사진 형식이 다릅니다.');
        const length = new DataView(item.bytes.buffer, item.bytes.byteOffset, 4).getUint32(0, true);
        if (length !== item.bytes.length - 4 || length > 24 * 1024 * 1024 || item.bytes[4] !== 255 || item.bytes[5] !== 216) fail('BMT 실사진 길이 또는 이미지 형식을 확인하세요.');
        return includeImages ? item.bytes.slice(4) : { bytes: length };
    };
    const realImage = jpeg('Images/Vis');
    const savedByIrsoft = fields.has('/BmtMetaData/WAS_SAVED_BY_IRSOFT');
    const hasEditorMarkers = fields.has('/BmtMetaData/IMGADDONID_GRAPHICOBJECTS_WITH_ID') || fields.has('/BmtMetaData/IMGADDONID_GRAPHICOBJECTS');
    const result = { format: 'testo-bmt', version: 1, status: 'metadata-preview', reportReady: false,
        source: { filename, sha256: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join(''), bytes: bytes.length },
        device: string('DeviceInfo/DeviceName'), recordedClock, encodedSeconds: encodedSeconds?.toString() || '', timeZone: 'unconfirmed', checksumVerification: 'not-performed',
        displayedUnit: string('Miscellaneous/TemperatureUnit'), superResolution: number('Miscellaneous/SuperResolution', 'bool', 1, 'getUint8') === 1,
        environment: { emissivity: number('Environment/EmissivityValue', 'float', 4, 'getFloat32'), reflectedTemperature: temp('Environment/ReflectedTemperature'), ambientTemperature: temp('Environment/Temperature') },
        detector: { columns: number('IrImage/Cols', 'uint16', 2, 'getUint16'), rows: number('IrImage/Rows', 'uint16', 2, 'getUint16') },
        grid: { columns, rows, samples: rows * columns, rawMinimum: minimum, rawMaximum: maximum, rawUnit: 'unverified', temperatureC: null },
        scale: { minimum: temp('Scaling/TempMin'), maximum: temp('Scaling/TempMax') }, points, pointsSource: 'camera-metadata', editor: { savedByIrsoft, hasEditorMarkers, editedPointsVerified: false }, recomputeCoefficients, realImageBytes: includeImages ? realImage?.length || 0 : realImage?.bytes || 0,
        warnings: ['열화상 배열의 원시값은 온도가 아닙니다. 방사율·반사온도와 환산계수를 적용한 결과를 IRSoft와 대조해야 합니다.', '스케일 최저·최고값은 표시 범위 설정이며 실제 측정 최저·최고온도로 사용하지 않습니다.', '촬영시각의 시간대는 미확인입니다. 폴더명이나 현재 연도를 측정연도로 대신하지 않습니다.'],
    };
    if (hasEditorMarkers) result.warnings.push('IRSoft 편집 마커가 별도로 있습니다. 아래 카메라 기록점은 사용자가 재지정한 최종 탐지점으로 확정할 수 없습니다. 같은 수정본에서 측정점 결과표와 최종 이미지를 내보내 연결하세요.');
    if (includeImages) result.images = { preview: bytes.slice(0, parsed.headerStart), real: realImage };
    return result;
}
