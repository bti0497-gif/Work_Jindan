"""Extract PDF text positions, bind to HWPX paragraphs, and apply reviewed vector decorations.

This is a local, assisted one-page experiment, not an automatic HWPX pagination engine.
Raster decorations must be separately traced and reviewed; they are never page backgrounds.
"""
import argparse
import base64
import hashlib
import json
import re
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
import fitz

parser = argparse.ArgumentParser()
parser.add_argument('--pdf', required=True)
parser.add_argument('--hwpx', required=True)
parser.add_argument('--page', type=int, default=1)
parser.add_argument('--decorations', help='Reviewed vector replacement JSON, bound to PDF SHA and page')
parser.add_argument('--font-map', required=True, help='JSON file mapping PDF font names to installed editable font families')
parser.add_argument('--font-file', action='append', default=[], help='Embed a locally licensed font: family=path; fontTools required')
parser.add_argument('--output', required=True)
args = parser.parse_args()
pdf, hwpx, output = [Path(p).resolve() for p in [args.pdf, args.hwpx, args.output]]
if output in [pdf, hwpx]:
    raise ValueError('원본을 덮어쓸 수 없습니다.')
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
pdf_sha, hwpx_sha = sha(pdf), sha(hwpx)
paragraphs = []
local = lambda element: element.tag.rsplit('}', 1)[-1]
with zipfile.ZipFile(hwpx) as archive:
    entries = archive.infolist()
    if len(entries) > 20000 or sum(i.file_size for i in entries) > 256 * 1024 * 1024:
        raise ValueError('HWPX 패키지 크기 한도 초과')
    for entry in sorted(entries, key=lambda i: i.filename):
        if not re.fullmatch(r'Contents/section\d+\.xml', entry.filename):
            continue
        root = ET.fromstring(archive.read(entry))
        for index, paragraph in enumerate(e for e in root.iter() if local(e) == 'p'):
            # Do not mix child table paragraphs into an enclosing paragraph's binding.
            runs = [e for e in paragraph if local(e) == 'run']
            text = ''.join(''.join(t.itertext()) for run in runs for t in run if local(t) == 't').strip()
            if text:
                paragraphs.append({'text': text, 'section': entry.filename, 'index': index, 'id': paragraph.get('id', '')})
fonts = json.loads(Path(args.font_map).read_text(encoding='utf-8-sig'))
embedded_fonts = []
for specification in args.font_file:
    from fontTools.ttLib import TTFont
    import io
    family, font_path = specification.split('=', 1)
    font = TTFont(font_path)
    if 'OS/2' not in font or font['OS/2'].fsType != 0:
        raise ValueError('이 시험은 설치·포함 제한이 없는 로컬 글꼴(fsType=0)만 포함합니다.')
    # Legacy HWP fonts can have invalid cmap language values rejected by Chromium OTS.
    # Preserve all Unicode glyphs so editing new Hangul remains possible.
    font['cmap'].tables = [table for table in font['cmap'].tables if table.isUnicode() and table.format in [4, 12]]
    for table in font['cmap'].tables:
        table.language = 0
    if 'DSIG' in font:
        del font['DSIG']
    stream = io.BytesIO(); font.save(stream)
    embedded_fonts.append({'family': family, 'data': base64.b64encode(stream.getvalue()).decode('ascii')})
with fitz.open(pdf) as doc:
    if not 1 <= args.page <= len(doc) or doc.needs_pass:
        raise ValueError('PDF 쪽 또는 암호화 상태 확인 필요')
    page = doc[args.page - 1]
    if page.rotation != 0 or page.get_drawings():
        raise ValueError('회전 쪽·PDF 벡터 경로 자동 변환은 아직 지원하지 않습니다.')
    decorations = []
    if args.decorations:
        recipe = json.loads(Path(args.decorations).read_text(encoding='utf-8-sig'))
        if recipe['pdfSha256'] != pdf_sha or recipe['pdfPage'] != args.page:
            raise ValueError('도형 대체 근거가 원본 쪽과 다릅니다.')
        decorations = recipe['objects']
    if page.get_images() and not decorations:
        raise ValueError('이미지 장식은 검토한 벡터 대체 자료가 필요합니다. 원본 배경으로 복사하지 않습니다.')
    objects = decorations[:]
    for block in page.get_text('dict')['blocks']:
        if block['type'] != 0:
            continue
        for line in block['lines']:
            if line['dir'] != (1.0, 0.0):
                raise ValueError('회전 글자 미지원')
            for span in line['spans']:
                text = span['text']
                if not text.strip():
                    continue
                matches = [p for p in paragraphs if p['text'] == text.strip()]
                if not matches:
                    raise ValueError(f'HWPX 문단과 일치하지 않는 PDF 글자: {text}')
                if span['font'] not in fonts:
                    raise ValueError(f'설치 글꼴 연결 필요: {span["font"]}')
                objects.append({'id': f'text-{len(objects)}', 'type': 'text', 'label': text[:80], 'text': text, 'originalText': text,
                                'x': span['origin'][0], 'y': span['origin'][1], 'fontFamily': fonts[span['font']],
                                'fontSize': span['size'], 'originalFontSize': span['size'], 'originalWidth': span['bbox'][2] - span['bbox'][0],
                                'fill': f'#{span["color"]:06x}',
                                'sourceParagraphs': [{k: p[k] for k in ['section', 'index', 'id']} for p in matches[:100]]})
    model = {'schema': 'jindan-editable-page/1', 'title': next((o['text'] for o in objects if o['type'] == 'text'), '재현 페이지'),
             'width': page.rect.width, 'height': page.rect.height,
             'source': {'pdfSha256': pdf_sha, 'hwpxSha256': hwpx_sha, 'pdfPage': args.page, 'pdfName': pdf.name, 'hwpxName': hwpx.name,
                        'method': 'HWPX 문단 연결 · PDF 글자 위치 추출 · 장식 수동 벡터 재구성'}, 'objects': objects, 'fonts': embedded_fonts}
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(model, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'status': 'candidate-generated', 'objects': len(objects), 'editableTextObjects': sum(o['type'] == 'text' for o in objects),
                  'output': str(output), 'automaticPagination': False, 'verified': False}, ensure_ascii=False))
