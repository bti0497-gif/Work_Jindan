// Only properties supported by explicit PDF geometry/paint evidence are inferred.
export function pdfColor(value) {
    if (Array.isArray(value) && value.length === 1) return pdfColor(value[0]);
    if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) return value.toUpperCase();
    return null;
}
const canonical = text => String(text).normalize('NFKC').replace(/\s+/g, '');

function doubleStroke(segments,axis,at,from,to){
    const lines=segments.filter(s=>s.axis===axis&&Math.abs(s.at-at)<=2&&s.start<=from+1&&s.end>=to-1&&Number.isFinite(s.widthPt)&&s.widthPt>0&&s.widthPt<=.6&&!s.dash?.length);
    const pairs=lines.flatMap((a,i)=>lines.slice(i+1).filter(b=>Math.abs(a.at-b.at)>=.5&&Math.abs(a.at-b.at)<=1.8&&Math.abs(a.widthPt-b.widthPt)<=.05&&pdfColor(a.color)&&pdfColor(a.color)===pdfColor(b.color)).map(b=>[a,b]));
    if(!pairs.length)return null;
    const pair=pairs.sort((a,b)=>Math.abs((a[0].at+a[1].at)/2-at)-Math.abs((b[0].at+b[1].at)/2-at))[0];
    // A native double border's width spans BOTH strokes and their gap, rather
    // than describing one stroke. Keep the observed pair as audit evidence.
    return {widthPt:Math.abs(pair[0].at-pair[1].at)+(pair[0].widthPt+pair[1].widthPt)/2,color:pdfColor(pair[0].color),rulingPair:pair.map(s=>({axis:s.axis,at:s.at,start:s.start,end:s.end,widthPt:s.widthPt,color:pdfColor(s.color)}))};
}

// Old analyses retain the raw ruling geometry, so reconstruction can also recover a double border.
export function restoreDoublePdfBorders(table,segments=[]){
    return {...table,cells:table.cells.map(cell=>{
        if(!cell.bbox||!cell.borders)return cell;const [l,t,r,b]=cell.bbox,borders={...cell.borders};
        for(const [side,axis,at,from,to]of [['left','v',l,t,b],['right','v',r,t,b],['top','h',t,l,r],['bottom','h',b,l,r]])if(['SOLID','DOUBLE_SLIM'].includes(borders[side]?.type)){const observed=doubleStroke(segments,axis,at,from,to);if(observed)borders[side]={...borders[side],...observed,type:'DOUBLE_SLIM'};}
        return {...cell,borders};
    })};
}

export function applyPdfTextColors(items, paints = []) {
    if (!paints.length) return items;
    const text = paints.map(p => canonical(p.text)).join('');
    const ranges = []; let end = 0, cursor = 0, rangeIndex = 0;
    for (const paint of paints) { const start = end; end += canonical(paint.text).length; ranges.push({start, end, color: pdfColor(paint.color),operator:paint.operator}); }
    return items.map(item => {
        const key = canonical(item.text), start = key ? text.indexOf(key, cursor) : -1;
        if (start < 0) return item;
        cursor = start + key.length;
        while (rangeIndex < ranges.length && ranges[rangeIndex].end <= start) rangeIndex++;
        const colors = new Set(),orders=[];
        for (let i = rangeIndex; i < ranges.length && ranges[i].start < cursor; i++) {colors.add(ranges[i].color);if(Number.isInteger(ranges[i].operator))orders.push(ranges[i].operator);}
        return colors.size === 1 && !colors.has(null) ? {...item, color: [...colors][0],paintOrder:orders.length?Math.min(...orders):undefined} : item;
    });
}

export function pdfCellAppearance(box, contents, graphics, hasWall) {
    const [left, top, right, bottom] = box;
    const fills = (graphics.fills || []).filter(fill => fill.bbox[0] <= left + 1 && fill.bbox[1] <= top + 1 && fill.bbox[2] >= right - 1 && fill.bbox[3] >= bottom - 1);
    const background = pdfColor(fills.at(-1)?.color);
    const borders = {};
    for (const [side, axis, at, from, to] of [['left','v',left,top,bottom],['right','v',right,top,bottom],['top','h',top,left,right],['bottom','h',bottom,left,right]]) {
        const candidates = graphics.segments.filter(s => s.axis === axis && Math.abs(s.at - at) <= 2 && s.end > from && s.start < to);
        const strongest = candidates.reduce((a,b) => (b.widthPt || 0) > (a?.widthPt || 0) ? b : a, null);
        const observed=doubleStroke(candidates,axis,at,from,to);
        borders[side] = hasWall(graphics.segments, axis, at, from, to) ? {type: observed?'DOUBLE_SLIM':strongest?.dash?.length ? 'DASH' : 'SOLID', widthPt: observed?.widthPt ?? strongest?.widthPt ?? .34, color: observed?.color || pdfColor(strongest?.color) || '#000000',...(observed?{rulingPair:observed.rulingPair}:{})} : {type:'NONE'};
    }
    let align;
    if (contents.length) {
        const x0 = Math.min(...contents.map(i => i.bbox[0])), x1 = Math.max(...contents.map(i => i.bbox[2]));
        const l = x0 - left, r = right - x1;
        if (Math.abs(l-r) <= 2.5 && l > 1) align = 'CENTER';
        else if (r <= 4 && l > r + 4) align = 'RIGHT';
        else align = 'LEFT';
    }
    return {background, borders, align};
}

// HWPX border widths use a discrete set of millimetre values.
export function hwpxBorderWidth(points) {
    const target = Math.max(0, Number(points) || .34) * 25.4 / 72;
    const widths = [.1,.12,.15,.2,.25,.3,.4,.5,.6,.7,1,1.5,2,3,4,5];
    return widths.reduce((a,b) => Math.abs(b-target) < Math.abs(a-target) ? b : a) + ' mm';
}
