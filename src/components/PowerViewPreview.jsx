import { useMemo, useState } from 'react';

const quantities = { Voltage: '전압', Current: '전류', Frequency: '주파수', VoltageTHD: '전압 THD', CurrentTHD: '전류 THD',
    VoltageHarmonic: '전압 고조파', CurrentHarmonic: '전류 고조파', PowerFactor: '역률' };
const units = { Volts: 'V', Amps: 'A', Hertz: 'Hz', Watts: 'W', VoltAmps: 'VA', Vars: 'var', Percent: '%' };
const value = number => number == null ? '결측' : Number(number).toLocaleString('ko-KR', { maximumFractionDigits: 6 });
export default function PowerViewPreview({ inspection }) {
    const [recordIndex, setRecordIndex] = useState(0), [search, setSearch] = useState('');
    const record = inspection.records[recordIndex];
    const rows = useMemo(() => record ? record.channels.flatMap(channel => channel.measurements.map(measurement => ({ channel, measurement }))).filter(({ channel }) =>
        `${quantities[channel.quantity.QuantityType] || ''} ${channel.quantity.QuantityType} ${channel.quantity.PhaseType} ${channel.quantity.PhaseNumber}`.toLowerCase().includes(search.toLowerCase())) : [], [record, search]);
    return <article className="studio-structure studio-powerview" aria-label="PowerView 측정자료 확인">
        <h2>PowerView 원본 측정자료</h2><p className="studio-note">{inspection.limitations.join(' ')}</p>
        <p>측정 지점: {inspection.sites.map(site => site.Name).filter(Boolean).join(', ') || '원본에서 지점명 확인 필요'}</p>
        <p>장비: {inspection.instruments.map(instrument => `${instrument.company} ${instrument.model}`).join(', ') || '원본에서 장비 확인 필요'}</p>
        <label>측정 기록<select aria-label="PowerView 측정 기록 선택" value={recordIndex} onChange={event => { setRecordIndex(Number(event.target.value)); setSearch(''); }}>{inspection.records.map((item, index) => <option key={index} value={index}>{item.name || item.subType || `기록 ${index + 1}`}</option>)}</select></label>
        {!record && <p>저장된 측정 기록이 없습니다.</p>}
        {record && <><p>측정 시작 {record.start || '미지정'} · 종료 {record.stop?.startsWith('0001-') ? '원본에 종료 시각 없음' : record.stop || '미지정'}</p>
            <p>채널 {record.channels.length.toLocaleString()}개 · 단일 측정값 {record.scalars.length.toLocaleString()}개 · 시간축 표본 {record.timeAxis?.numberOfSamples?.toLocaleString() ?? '확인 필요'}개</p>
            {!!record.warnings.length && <p className="studio-note">{record.warnings.join(' ')}</p>}
            <label>측정항목 검색<input aria-label="PowerView 측정항목 검색" value={search} onChange={event => setSearch(event.target.value)} placeholder="전압, 전류, THD, PowerFactor 등" /></label>
            <p>원본 채널 수치 · {rows.length.toLocaleString()}개 중 앞 {Math.min(rows.length, 200)}개 표시</p>
            <table><thead><tr><th>측정항목 / 상</th><th>통계 구분</th><th>원본 단위 / 배율</th><th>표본 수</th><th>첫 수치</th><th>확인 사항</th></tr></thead><tbody>{rows.slice(0, 200).map(({ channel, measurement }, index) => <tr key={`${channel.id}-${measurement.id}-${index}`}><td>{quantities[channel.quantity.QuantityType] || channel.quantity.QuantityType}<small>{channel.quantity.PhaseType} {channel.quantity.PhaseNumber}</small></td><td>{measurement.interval || '순시·목록 데이터'}</td><td>{measurement.unit.UnitPrefix || ''} {units[measurement.unit.Unit] || measurement.unit.Unit || '미지정'}<small>Gain {measurement.conversion.Gain ?? '미지정'}</small></td><td>{measurement.raw?.count?.toLocaleString() ?? '읽기 실패'}</td><td>{measurement.raw?.preview.map(value).join(', ') || '—'}</td><td>{measurement.error || [measurement.warning, measurement.hasFlags && '제외 구간 플래그 확인', !!measurement.raw?.missingCount && `결측 ${measurement.raw.missingCount}개`].filter(Boolean).join(' · ') || 'PowerView 대조 전'}</td></tr>)}</tbody></table>
            {!!record.scalars.length && <details><summary>단일 측정값 {record.scalars.length.toLocaleString()}개 확인</summary><table><thead><tr><th>항목 / 상</th><th>원본 수치</th><th>원본 단위</th></tr></thead><tbody>{record.scalars.slice(0, 300).map((scalar, index) => <tr key={index}><td>{quantities[scalar.quantity.QuantityType] || scalar.quantity.QuantityType} / {scalar.quantity.PhaseType} {scalar.quantity.PhaseNumber}</td><td>{value(scalar.value)}</td><td>{scalar.unit.UnitPrefix || ''} {units[scalar.unit.Unit] || scalar.unit.Unit || '미지정'}</td></tr>)}</tbody></table></details>}
        </>}
        <p className="studio-analysis-hash">원본 SHA-256: {inspection.sourceSha256}</p>
    </article>;
}
