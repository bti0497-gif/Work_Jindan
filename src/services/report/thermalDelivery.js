export const THERMAL_DELIVERY_ROLES = {
    bmt: { label: '탐지점 수정 후 저장한 BMT', formats: ['bmt'] },
    measurements: { label: '측정점 결과표 엑셀(선택·대조용)', formats: ['xlsx'], optional: true },
    image: { label: '배율·위치 조정 후 내보낸 최종 사진', formats: ['jpg', 'jpeg', 'png', 'webp'] },
};
export function bindThermalDeliveryFile(material, role) {
    if (!material?.id || !/^[a-f0-9]{64}$/i.test(material.sha256 || '') || !THERMAL_DELIVERY_ROLES[role]?.formats.includes(material.format)) throw new Error('열화상 결과 묶음의 파일 종류·원본 연결을 확인하세요.');
    return { materialId: material.id, sha256: material.sha256, filename: material.filename };
}
export function thermalDeliveryStatus(delivery, materials) {
    const missing = Object.entries(THERMAL_DELIVERY_ROLES).filter(([role, definition]) => {
        const binding = delivery[role];
        if (!binding && definition.optional) return false;
        return !materials.some(material => material.id === binding?.materialId && material.sha256 === binding?.sha256 && definition.formats.includes(material.format));
    }).map(([, definition]) => definition.label);
    return { missing, prepared: !missing.length && !!delivery.pointsConfirmed && !!delivery.imageConfirmed, reportReady: false };
}
