import ReportParagraphControls from './ReportParagraphControls.jsx';
export default function ReportTypographyControls({value,onChange,disabled=false,prefix='보고서'}){
    return <div className="studio-typography-controls">
        <div className="studio-property-row">{[['widthPercent','장평(%)',50,200,100],['spacingPercent','자간(%)',-50,50,0],['lineSpacingPercent','줄간격(%)',50,400,160]].map(([key,label,min,max,fallback])=><label key={key}>{label}<input aria-label={`${prefix} ${label}`} type="number" min={min} max={max} step="1" disabled={disabled} value={value[key]??fallback} onChange={e=>onChange({[key]:Number(e.target.value),applyBodyStyle:true})}/></label>)}</div>
        <ReportParagraphControls value={value} prefix={prefix} disabled={disabled} onChange={(next,key)=>onChange({[key]:next[key],applyBodyStyle:true})}/>
    </div>;
}
