import { useEffect, useState } from 'react';

const temperature = field => field?.celsius == null ? '미확인' : `${field.celsius.toFixed(1)} °C`;
export default function ThermalBmtPreview({ inspection }) {
    const [images, setImages] = useState({});
    useEffect(() => {
        const urls = Object.fromEntries(Object.entries(inspection.images || {}).filter(([, bytes]) => bytes?.length).map(([key, bytes]) => [key, URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' }))]));
        setImages(urls);
        return () => Object.values(urls).forEach(url => URL.revokeObjectURL(url));
    }, [inspection]);
    return <article className="studio-thermal" aria-label="Testo 열화상 원본 확인">
        <h3>{inspection.device || 'Testo'} · BMT 원본</h3>
        <p className="studio-notice">원본 구조·측정 설정 확인 단계입니다. 온도 환산 및 보고서 자동 반영은 검증 대기입니다.</p>
        {inspection.editor?.hasEditorMarkers && <p className="studio-notice">IRSoft 편집 마커가 있습니다. 재지정한 탐지점의 값은 같은 수정본에서 내보낸 측정점 결과표로 확인하세요.</p>}
        <dl><dt>촬영시각</dt><dd>{inspection.recordedClock || '미확인'} <small>(기기 기록 · 시간대 미확인)</small></dd><dt>열화상 배열</dt><dd>{inspection.grid.columns} × {inspection.grid.rows} · {inspection.superResolution ? 'SuperResolution' : '일반 촬영'}</dd><dt>검출기 해상도</dt><dd>{inspection.detector.columns} × {inspection.detector.rows}</dd><dt>방사율</dt><dd>{inspection.environment.emissivity?.toFixed(2) ?? '미확인'}</dd><dt>반사온도</dt><dd>{temperature(inspection.environment.reflectedTemperature)}</dd><dt>대기온도 설정</dt><dd>{temperature(inspection.environment.ambientTemperature)}</dd><dt>표시 스케일</dt><dd>{temperature(inspection.scale.minimum)} ~ {temperature(inspection.scale.maximum)}<br /><small>설정 범위이며 측정 최저·최고온도가 아닙니다.</small></dd></dl>
        <div className="studio-thermal-images">{images.preview && <figure><img src={images.preview} alt="BMT에 저장된 열화상 미리보기" /><figcaption>원본 내장 열화상 미리보기</figcaption></figure>}{images.real && <figure><img src={images.real} alt="BMT에 저장된 실사진" /><figcaption>원본 내장 실사진</figcaption></figure>}</div>
        <h4>카메라에 기록된 측정점</h4><p className="studio-note">IRSoft에서 나중에 재지정한 탐지점과 일치하는지는 별도 확인이 필요합니다.</p><table><thead><tr><th>측정점</th><th>배열 위치 (X, Y)</th><th>온도</th></tr></thead><tbody>{inspection.points.filter(point => point.visible).map(point => <tr key={point.name}><td>{{ CenterSpot: '중심점 M1', ColdSpot: '최저점', HotSpot: '최고점' }[point.name] || point.name}</td><td>{point.x}, {point.y}</td><td>환산 검증 대기</td></tr>)}</tbody></table>
        <ul className="studio-note">{inspection.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>
    </article>;
}
