import {originalPdfFonts} from './pdfOriginalFonts.js';
import {unicodeAccessibleFont,missingFontGlyphs,editableFontEmbeddingFlags} from './sfntFonts.js';
import {pdfEmbeddedFontProfile} from './pdfFonts.js';
const sha=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
// Read only the exact PDF font streams used by the selected source pages.
// Fonts are document assets, never installed into Windows or sent externally.
export async function extractPdfEmbeddedFonts(bytes,analysis,numbers,{signal}={}){
 const data=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes),selected=new Set(numbers),assets=[],warnings=[],groups=new Map();
 if(analysis?.pairedLearning)return {assets,warnings}; // Native reference typography remains authoritative.
 if(await sha(data)!==analysis?.source?.sha256)throw new Error('글꼴을 읽을 원본 PDF 버전이 분석과 다릅니다.');
 if(!selected.size||[...selected].some(n=>!analysis.pages.some(p=>p.number===n)))throw new Error('원본 글꼴의 선택 페이지를 확인하세요.');
 for(const page of analysis.pages.filter(p=>selected.has(p.number)))for(const line of [...page.lines,...page.tables.flatMap(t=>t.cells.flatMap(c=>c.lines||[]))])for(const run of line.runs||[]){const info=run.style?.fontInfo;if(!info?.family||!info.embeddedStreamSha256)continue;const group=groups.get(info.family)||{family:info.family,streams:new Map(),characters:new Set()};group.streams.set(info.embeddedStreamSha256,{...info,page:page.number});for(const c of run.text)group.characters.add(c);groups.set(info.family,group);}
 const source=originalPdfFonts(data,{includeBytes:true});let total=0;
 for(const group of groups.values()){
  if(signal?.aborted)throw new Error('원본 글꼴 추출을 취소했습니다.');
  if(group.streams.size!==1){warnings.push(`${group.family}: 선택 쪽에서 서로 다른 원본 글꼴 스트림이 대응되어 포함하지 않았습니다.`);continue;}
  const expected=[...group.streams.values()][0],font=await source(expected.page,expected.baseFont);
  if(!font||font.family!==group.family||font.embeddedStreamSha256!==expected.embeddedStreamSha256)throw new Error('원본 글꼴 스트림이 분석 근거와 다릅니다.');
  try{const flags=editableFontEmbeddingFlags(font.bytes);if(!flags.allowed){warnings.push(`${group.family}: 원본 글꼴의 문서 편집 포함 플래그가 지원 조건에 맞지 않습니다.`);continue;}
   const prepared=unicodeAccessibleFont(font.bytes,font),missing=missingFontGlyphs(prepared.bytes,[...group.characters].join(''));
   if(missing.length){warnings.push(`${group.family}: 원본 부분 글꼴에서 선택 문자의 윤곽 ${missing.length}개를 확인하지 못해 포함하지 않았습니다.`);continue;}
   total+=prepared.bytes.length;if(assets.length>=32||total>32*1024*1024)throw new Error('원본 글꼴 패키지 크기가 한도를 넘습니다.');
   assets.push({family:font.family,bytes:prepared.bytes,sourceBytes:font.bytes.slice(),sourcePdfSha256:analysis.source.sha256,sourceStreamSha256:font.embeddedStreamSha256,baseFont:font.baseFont,sourcePage:expected.page,sha256:await sha(prepared.bytes),fsType:flags.fsType,method:prepared.method,tablesChanged:prepared.tablesChanged,unmappedLegacyCodes:prepared.unmappedLegacyCodes||[],requiredCharacters:[...group.characters].join(''),sourceSubset:true,subsetScope:'Only current source glyphs verified; newly typed characters require independent availability review.',nativeVerified:false});
  }catch(error){warnings.push(`${group.family}: ${error.message}`);}
 }
 return {assets,warnings};
}

// The worker rebinds both the immutable PDF stream and the derived font bytes
// immediately before packaging; metadata hashes alone are not that proof.
export async function verifyPdfEmbeddedFonts(plan,fonts){
 if(!Array.isArray(fonts?.assets)||fonts.assets.length>32)throw new Error('원본 글꼴 패키지 구성을 확인하세요.');
 let total=0;
 for(const font of fonts.assets){
  if(!(font.sourceBytes instanceof Uint8Array)||!(font.bytes instanceof Uint8Array)||font.sourceBytes.length>16*1024*1024||font.bytes.length>16*1024*1024||(total+=font.sourceBytes.length+font.bytes.length)>64*1024*1024||font.sourcePdfSha256!==plan.source.sha256||!plan.fontEvidence?.some(f=>f.family===font.family&&f.baseFont===font.baseFont&&f.sourcePage===font.sourcePage&&f.embeddedStreamSha256===font.sourceStreamSha256)||await sha(font.sourceBytes)!==font.sourceStreamSha256||await sha(font.bytes)!==font.sha256)throw new Error('원본 글꼴 바이트와 분석 근거의 결합이 다릅니다.');
  const profile=pdfEmbeddedFontProfile(font.sourceBytes);
  if(profile?.family!==font.family)throw new Error('원본 글꼴의 서체 대응이 다릅니다.');
  const expected=unicodeAccessibleFont(font.sourceBytes,profile).bytes;
  if(expected.length!==font.bytes.length||expected.some((b,i)=>b!==font.bytes[i]))throw new Error('원본 글꼴에서 유도한 문자 대응 바이트가 다릅니다.');
 }
}
