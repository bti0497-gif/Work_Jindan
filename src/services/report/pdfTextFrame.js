// Ink bounds are not paragraph wrapping bounds. A verified surrounding PDF
// rectangle gives a real available edge without changing glyph size or scale.
export function enclosingPdfTextContainer(bbox,fills,pageWidth,rules,paintOrder){
    if(!Array.isArray(bbox)||bbox.length!==4||!bbox.every(Number.isFinite))return null;
    if(!Number.isInteger(paintOrder))return null;
    const bounded=(fills||[]).filter(f=>Array.isArray(f.bbox)&&f.bbox.length===4&&f.bbox.every(Number.isFinite)&&Number.isInteger(f.operator)&&f.operator<paintOrder&&f.bbox[0]>=0&&f.bbox[2]<=pageWidth&&f.bbox[0]<=bbox[0]&&f.bbox[1]<=bbox[1]&&f.bbox[2]>=bbox[2]&&f.bbox[3]>=bbox[3]);
    return bounded.map(f=>{
        const [l,t,r,b]=f.bbox,edges=[['h',t,l,r],['h',b,l,r],['v',l,t,b],['v',r,t,b]].map(([axis,at,start,end])=>(rules||[]).find(s=>s.axis===axis&&!s.filled&&Number.isInteger(s.operator)&&Math.abs(s.at-at)<.6&&Math.abs(s.start-start)<.6&&Math.abs(s.end-end)<.6));
        return edges.every(Boolean)?{...f,borderOperators:edges.map(e=>e.operator)}:null;
    }).filter(Boolean).sort((a,b)=>(a.bbox[2]-a.bbox[0])*(a.bbox[3]-a.bbox[1])-(b.bbox[2]-b.bbox[0])*(b.bbox[3]-b.bbox[1]))[0]||null;
}
