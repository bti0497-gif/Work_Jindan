import { Gunzip } from 'fflate';
import { XMLParser, XMLValidator } from 'fast-xml-parser';

export const MAX_PWV_BYTES = 48 * 1024 * 1024;
const MAX_DECODED_BYTES = 64 * 1024 * 1024;
const array = value => value == null || value === '' ? [] : Array.isArray(value) ? value : [value];
const text = value => typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';
const attrs = node => Object.fromEntries(Object.entries(node || {}).filter(([key]) => key.startsWith('@_')).map(([key, value]) => [key.slice(2), text(value)]));
const numeric = value => typeof value === 'string' && value.trim() && Number.isFinite(Number(value)) ? Number(value) : null;
const parser = () => new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, parseTagValue: false, parseAttributeValue: false, trimValues: true });

export function readPowerViewXml(input) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    if (!bytes.length || bytes.length > MAX_PWV_BYTES) throw new Error('PowerView 원본은 48MB 이하의 PWV 파일로 등록하세요.');
    let xml;
    try { xml = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { throw new Error('UTF-8 형식의 PowerView PWV 원본을 선택하세요.'); }
    if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) throw new Error('PowerView XML 구조가 올바르지 않습니다.');
    const root = parser().parse(xml)?.PQData;
    if (!root || !Object.hasOwn(root, 'PQDataRecords') || !Object.hasOwn(root, 'PQInstruments') || !Object.hasOwn(root, 'PQSites')) throw new Error('측정자료가 포함된 PowerView PWV 원본이 아닙니다.');
    return { root, bytes };
}

function decode(binary, budget) {
    const options = attrs(binary), encoded = text(typeof binary === 'string' ? binary : binary?.['#text']).replace(/\s/g, '');
    if (options.Encoding !== 'Base64Binary' || encoded.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw new Error('지원하지 않는 이진 인코딩입니다.');
    if (encoded.length > 24 * 1024 * 1024) throw new Error('채널 데이터 크기 한도를 넘습니다.');
    const packed = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
    let data;
    if (options.Compression === 'None') { data = packed; budget.used += data.length; }
    else if (options.Compression === 'GZip') {
        const chunks = []; let size = 0;
        const unzip = new Gunzip(chunk => {
            size += chunk.length; budget.used += chunk.length;
            if (size > 16 * 1024 * 1024 || budget.used > MAX_DECODED_BYTES) throw new Error('압축 해제 크기 한도를 넘습니다.');
            chunks.push(chunk);
        });
        for (let offset = 0; offset < packed.length; offset += 1024) unzip.push(packed.subarray(offset, offset + 1024), offset + 1024 >= packed.length);
        data = new Uint8Array(size); let offset = 0;
        for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.length; }
    } else throw new Error(`지원하지 않는 압축 형식: ${options.Compression || '미지정'}`);
    if (budget.used > MAX_DECODED_BYTES || data.length > 16 * 1024 * 1024) throw new Error('측정 데이터 크기 한도를 넘습니다.');
    return { data, options };
}
function series(binary, budget) {
    const { data, options } = decode(binary, budget);
    if (!['Single', 'Double'].includes(options.DataType)) throw new Error(`지원하지 않는 수치 형식: ${options.DataType}`);
    const width = options.DataType === 'Single' ? 4 : 8;
    if (data.length % width) throw new Error('채널 수치 데이터의 길이가 맞지 않습니다.');
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength), preview = [];
    let finiteCount = 0, missingCount = 0, min = Infinity, max = -Infinity;
    for (let offset = 0; offset < data.length; offset += width) {
        const value = width === 4 ? view.getFloat32(offset, true) : view.getFloat64(offset, true);
        const valid = Number.isFinite(value);
        if (preview.length < 3) preview.push(valid ? value : null);
        if (valid) { finiteCount++; min = Math.min(min, value); max = Math.max(max, value); } else missingCount++;
    }
    return { count: data.length / width, finiteCount, missingCount, min: finiteCount ? min : null, max: finiteCount ? max : null, preview, dataType: options.DataType, compression: options.Compression };
}
function timeAxis(node, budget) {
    const result = { quantity: text(node?.QuantityType), unit: text(node?.Unit), prefix: text(node?.UnitPrefix), representation: text(node?.Representation),
        numberOfSamples: numeric(text(node?.NumberOfSamples)), snapshotLengthMs: numeric(text(node?.SnapshotLengthMs)), preview: [] };
    if (node?.BinaryData) {
        const { data, options } = decode(node.BinaryData, budget);
        if (options.DataType !== 'DateTime' || data.length % 8) throw new Error('시간축 형식은 별도 확인이 필요합니다.');
        const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
        result.decodedCount = data.length / 8;
        // Keep .NET's high kind bits and exact ticks; local/UTC interpretation needs PowerView comparison.
        for (let i = 0; i < Math.min(data.length / 8, 3); i++) {
            const raw = view.getBigUint64(i * 8, true);
            result.preview.push({ ticks: (raw & 0x3fffffffffffffffn).toString(), kindBits: (raw >> 62n).toString() });
        }
    }
    return result;
}

/** Read-only evidence preview. It intentionally does not certify units, scaling, criteria or report insertion. */
export async function inspectPowerView(input, filename = '') {
    const { root, bytes } = readPowerViewXml(input), budget = { used: 0 };
    const sourceSha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
    const instruments = array(root.PQInstruments.PQInstrument).map(node => ({ ...attrs(node), company: text(node.Company), model: text(node.Model), serial: text(node.SerialNumber), calibrationDate: text(node.CalibrationDate) }));
    const sites = array(root.PQSites.PQSite).map(node => attrs(node));
    const sourceRecords = array(root.PQDataRecords.PQDataSingleRecord);
    if (sourceRecords.length > 1000) throw new Error('한 파일에서 확인할 측정 기록 한도를 넘습니다.');
    const records = []; let totalChannels = 0, totalMeasurements = 0;
    for (const [index, record] of sourceRecords.entries()) {
        const properties = record.PQRecordProperties || {}, measurements = record.PQRecord || {};
        const channels = [], scalars = [], warnings = [];
        let axis = null;
        try { axis = timeAxis(record.PQTimeAxis, budget); } catch (error) { warnings.push(error.message); }
        for (const channel of array(measurements.PQChannels?.PQChannel)) {
            if (++totalChannels > 20000) throw new Error('측정 채널 개수 한도를 넘습니다.');
            const item = { id: attrs(channel).ID || '', quantity: attrs(channel.QuantityInfo), additional: channel.QuantityInfo?.AdditionalInfo || {}, measurements: [] };
            for (const measurement of array(channel.PQMeasurements)) {
                if (++totalMeasurements > 80000 || budget.used > MAX_DECODED_BYTES) throw new Error('측정 데이터 분석 한도를 넘습니다.');
                const entry = { id: attrs(measurement).ID || '', interval: text(measurement.IntervalType), unit: attrs(measurement.UnitInfo), conversion: attrs(measurement.ConversionConstants), hasFlags: !!measurement.BinaryFlags };
                try {
                    entry.raw = series(measurement.BinaryData, budget);
                    if (axis?.numberOfSamples != null && entry.raw.count !== axis.numberOfSamples) entry.warning = '시간축과 수치 개수가 다릅니다. 고조파 목록 등 별도 축인지 확인하세요.';
                } catch (error) { entry.error = error.message; }
                item.measurements.push(entry);
            }
            channels.push(item);
        }
        for (const scalar of array(measurements.PQScalars?.ScalarValue)) {
            if (scalars.length >= 20000) throw new Error('스칼라 측정 개수 한도를 넘습니다.');
            scalars.push({ quantity: attrs(scalar.QuantityInfo), unit: attrs(scalar.UnitInfo), rawValue: text(scalar.Value), value: numeric(text(scalar.Value)) });
        }
        records.push({ index, id: text(properties.ID), name: text(properties.Name), mainType: text(properties.MainType), subType: text(properties.SubType),
            start: text(properties.ActualStartTime), stop: text(properties.ActualStopTime), instrumentId: text(properties.InstrumentID), siteId: text(properties.SiteID),
            settingsId: text(properties.RecordSettingID), declaredChannelCount: numeric(text(properties.NumberOfChannels)), timeAxis: axis, channels, scalars, warnings });
    }
    return { schema: 'jindan-powerview-inspection/1', filename, sourceSha256, bytes: bytes.length, instruments, sites, records,
        settings: array(root.PQRecordSettings?.PQRecordSetting), decodedBytes: budget.used, status: 'raw-preview', reportReady: false,
        limitations: ['단위·CT/PT 배율·시간대·제외 구간·통계 정의를 PowerView 표시값과 대조해야 합니다.', '원시 수치만 읽었으며 새 보고서에 자동 반영하거나 적합·부적합을 판정하지 않습니다.'] };
}
