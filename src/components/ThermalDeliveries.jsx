import { THERMAL_DELIVERY_ROLES, bindThermalDeliveryFile, thermalDeliveryStatus } from '../services/report/thermalDelivery.js';

export default function ThermalDeliveries({ deliveries = [], materials, onChange }) {
    const change = (id, patch) => onChange(items => items.map(item => item.id === id ? { ...item, ...patch } : item));
    return <section className="electrical-thermal-deliveries" aria-label="확정한 열화상 결과 묶음">
        <h3>IRSoft에서 확정한 결과 연결</h3>
        <p>탐지점 지정 → 수정 BMT 저장 → 실화상과 배율·위치 조정 → 최종 사진 내보내기 순서로 준비합니다. 측정점 결과표는 필요하면 엑셀로 내보내 대조자료로 연결합니다.</p>
        <p className="studio-note">예: M1=R, M2=S, M3=T, M4=N. 실제 상 이름과 탐지점 연결은 사용자가 정합니다. 수정 BMT 직접 해석을 기준으로 준비하며, 현재 최종 편집 탐지점 추출은 검증 대기입니다. 사진은 사용자가 내보낸 배치대로 사용합니다.</p>
        {deliveries.map((delivery, index) => {
            const status = thermalDeliveryStatus(delivery, materials);
            return <fieldset key={delivery.id}><legend>측정 대상 {index + 1}</legend>
                <label>설비·측정 위치<input aria-label={`열화상 묶음 ${index + 1} 측정 위치`} value={delivery.name || ''} maxLength={300} onChange={event => change(delivery.id, { name: event.target.value })} placeholder="예: 유입펌프 제어반 인입선" /></label>
                {Object.entries(THERMAL_DELIVERY_ROLES).map(([role, definition]) => <label key={role}>{definition.label}<select aria-label={`열화상 묶음 ${index + 1} ${role}`} value={delivery[role]?.materialId || ''} onChange={event => {
                    const material = materials.find(item => item.id === event.target.value);
                    change(delivery.id, { [role]: material ? bindThermalDeliveryFile(material, role) : null, pointsConfirmed: false, imageConfirmed: false });
                }}><option value="">위에서 등록한 열화상 자료를 선택하세요</option>{delivery[role] && !materials.some(item => item.id === delivery[role].materialId && item.sha256 === delivery[role].sha256) && <option value={delivery[role].materialId}>연결 확인 필요: {delivery[role].filename}</option>}{materials.filter(item => definition.formats.includes(item.format)).map(item => <option key={item.id} value={item.id}>{item.filename} · {new Date(item.addedAt).toLocaleString('ko-KR')}</option>)}</select></label>)}
                <label>탐지점 이름·상 연결<input aria-label={`열화상 묶음 ${index + 1} 탐지점 이름`} value={delivery.pointLabels || ''} maxLength={1000} onChange={event => change(delivery.id, { pointLabels: event.target.value, pointsConfirmed: false })} placeholder="예: M1=R, M2=S, M3=T, M4=N" /></label>
                <label className="studio-checkbox"><input type="checkbox" aria-label={`열화상 묶음 ${index + 1} 탐지점 확인`} checked={!!delivery.pointsConfirmed} onChange={event => change(delivery.id, { pointsConfirmed: event.target.checked })} />저장한 BMT의 탐지점 설정을 확인함{delivery.measurements?' · 대조 엑셀도 같은 수정본인지 확인함':''}</label>
                <label className="studio-checkbox"><input type="checkbox" aria-label={`열화상 묶음 ${index + 1} 사진 배치 확인`} checked={!!delivery.imageConfirmed} onChange={event => change(delivery.id, { imageConfirmed: event.target.checked })} />최종 사진의 배율·위치·탐지점 표시를 확인함</label>
                <p role="status">{status.missing.length ? `연결 필요: ${status.missing.join(', ')}` : status.prepared ? '사용자 준비 확인 기록됨 · 수치 추출·보고서 반영 검토 대기' : '파일 연결됨 · 탐지점과 사진 배치 확인 대기'}</p>
                <button type="button" className="studio-secondary" onClick={() => onChange(items => items.filter(item => item.id !== delivery.id))}>이 묶음의 연결 해제</button>
            </fieldset>;
        })}
        <button type="button" className="studio-secondary" onClick={() => onChange(items => [...items, { id: crypto.randomUUID(), name: '', pointLabels: '', pointsConfirmed: false, imageConfirmed: false }])}>열화상 결과 묶음 추가</button>
    </section>;
}
