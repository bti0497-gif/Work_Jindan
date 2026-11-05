import {indexHwpxSection} from './hwpxPackage.js';
const escape=text=>text.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'})[c]);

// Controlled alternative, not applied to production until native A/B review.
// The value and PAGE semantics remain in autoNum; only its decoration moves.
export function literalPageNumberDecoration(control){
    const prefix='<root>',index=indexHwpxSection(prefix+control+'</root>','PAGE-decoration');
    const numbers=index.nodes.filter(n=>n.name==='hp:autoNum'),formats=index.nodes.filter(n=>n.name==='hp:autoNumFormat');
    if(numbers.length!==1||numbers[0].attrs.numType!=='PAGE'||formats.length!==1||formats[0].parent!==numbers[0]||formats[0].attrs.type!=='DIGIT'||numbers[0].parent?.name!=='hp:ctrl')throw new Error('동적 PAGE 제어와 표시 형식을 확인하세요.');
    const format=formats[0],before=control.slice(format.start-prefix.length,format.end-prefix.length),left=format.attrs.prefixChar||'',right=format.attrs.suffixChar||'';
    if((left+right).length>20||/[\r\n\t\d]/.test(left+right))throw new Error('쪽번호 장식만 분리할 수 있습니다.');
    const after=before.replace(/\bprefixChar="[^"]*"/,'prefixChar=""').replace(/\bsuffixChar="[^"]*"/,'suffixChar=""');
    const value=control.slice(0,format.start-prefix.length)+after+control.slice(format.end-prefix.length);
    return {xml:`<hp:t>${escape(left)}</hp:t>${value}<hp:t>${escape(right)}</hp:t>`,evidence:{method:'literal-decoration-around-dynamic-PAGE/1',prefix:left,suffix:right,pageFieldValue:numbers[0].attrs.num,numType:'PAGE',fixedNumberTextInserted:false,nativeVerified:false}};
}
