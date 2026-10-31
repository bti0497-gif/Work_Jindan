import argparse
import hashlib
import json
import re
import zipfile
from pathlib import Path
import fitz
from PIL import Image, ImageChops, ImageOps, ImageStat

parser = argparse.ArgumentParser(description='Render independent reference/candidate PDF pages and create visual comparison evidence; never auto-certify reproduction.')
parser.add_argument('--reference', required=True)
parser.add_argument('--candidate', required=True)
parser.add_argument('--reference-page', type=int, default=1)
parser.add_argument('--candidate-page', type=int, default=1)
parser.add_argument('--candidate-source')
parser.add_argument('--output', required=True)
parser.add_argument('--dpi', type=int, default=144)
args = parser.parse_args()
if not 72 <= args.dpi <= 300:
    raise ValueError('렌더링 DPI는 72~300으로 지정하세요.')
output = Path(args.output).resolve()
inputs = [Path(value).resolve() for value in [args.reference, args.candidate, args.candidate_source] if value]
names = ['reference.png', 'candidate.png', 'difference.png', 'comparison.png', 'comparison.json']
if any(output / name in inputs for name in names):
    raise ValueError('원본 위에 비교 자료를 저장할 수 없습니다.')
def sha(file):
    hasher = hashlib.sha256()
    with open(file, 'rb') as source:
        while chunk := source.read(1024 * 1024):
            hasher.update(chunk)
    return hasher.hexdigest()
def render(file, number):
    with fitz.open(file) as document:
        if document.needs_pass:
            raise ValueError('암호화된 PDF는 보호 해제한 사본을 사용하세요.')
        if not 1 <= number <= len(document):
            raise ValueError('비교할 PDF 페이지가 범위를 벗어났습니다.')
        page = document[number - 1]
        if page.rect.width * page.rect.height * (args.dpi / 72) ** 2 > 40_000_000:
            raise ValueError('렌더링 크기 한도를 넘습니다. DPI를 낮추세요.')
        pixmap = page.get_pixmap(matrix=fitz.Matrix(args.dpi / 72, args.dpi / 72), colorspace=fitz.csRGB, alpha=False)
        image = Image.frombytes('RGB', (pixmap.width, pixmap.height), pixmap.samples)
        metadata = {'pdfPage': number, 'pageCount': len(document), 'widthPt': page.rect.width, 'heightPt': page.rect.height,
                    'rotation': page.rotation, 'mediaBox': list(page.mediabox), 'cropBox': list(page.cropbox), 'text': page.get_text().strip()}
        return image, metadata
reference, ref = render(args.reference, args.reference_page)
candidate, cand = render(args.candidate, args.candidate_page)
width, height = max(reference.width, candidate.width), max(reference.height, candidate.height)
if width * height > 40_000_000:
    raise ValueError('합성 비교 이미지 한도를 넘습니다. DPI를 낮추세요.')
left, right = Image.new('RGB', (width, height), 'white'), Image.new('RGB', (width, height), 'white')
left.paste(reference, (0, 0)); right.paste(candidate, (0, 0))
difference = ImageChops.difference(left, right)
gray = difference.convert('L')
histogram = gray.histogram()
changed = sum(histogram[13:]) / (width * height)
comparison = Image.new('RGB', (width * 2 + 16, height), '#dce2eb')
comparison.paste(left, (0, 0)); comparison.paste(right, (width + 16, 0))
source_evidence = None
if args.candidate_source:
    source_file = Path(args.candidate_source)
    paragraph_count = 0
    if source_file.suffix.lower() == '.json':
        if source_file.stat().st_size > 5 * 1024 * 1024:
            raise ValueError('편집 페이지 크기 한도 초과')
        model = json.loads(source_file.read_text(encoding='utf-8'))
        if model.get('schema') != 'jindan-editable-page/1':
            raise ValueError('편집 페이지 형식 확인 필요')
        objects = model.get('objects', [])
        source_evidence = {'path': str(source_file.resolve()), 'sha256': sha(source_file), 'format': model['schema'],
                           'editableTextObjects': sum(o['type'] == 'text' for o in objects),
                           'editableVectorObjects': sum(o['type'] == 'panel' for o in objects),
                           'limitation': '독립 편집 페이지 모델입니다. 원본 HWPX 기반 자동 조판·HWPX 내보내기는 별도 검증 대상입니다.'}
    else:
        with zipfile.ZipFile(source_file) as archive:
            entries = archive.infolist()
            if len(entries) > 20000 or sum(entry.file_size for entry in entries) > 256 * 1024 * 1024:
                raise ValueError('후보 HWPX의 크기 한도를 넘습니다.')
            for entry in entries:
                if re.fullmatch(r'Contents/section\d+\.xml', entry.filename):
                    if entry.file_size > 48 * 1024 * 1024:
                        raise ValueError('후보 HWPX XML의 크기 한도를 넘습니다.')
                    xml = archive.read(entry).decode('utf-8')
                    paragraph_count += len(re.findall(r'<(?:[\w.-]+:)?p\b', xml))
        source_evidence = {'path': str(source_file.resolve()), 'sha256': sha(source_file), 'paragraphElements': paragraph_count,
                       'limitation': '문단 개체의 존재는 확인했지만 모든 내용의 편집 가능성이나 이 PDF의 내보내기 출처를 자동 증명하지 않습니다.'}
ref_hash, cand_hash = sha(args.reference), sha(args.candidate)
independent = inputs[0] != inputs[1] and ref_hash != cand_hash
warnings = ['비교 자료 생성은 재현 검증 완료가 아닙니다. 편집 원본·내용·배치·홀짝·번호를 확인하세요.']
if not independent:
    warnings.append('원본과 후보가 같은 파일 또는 같은 바이트입니다. 독립적인 재현 증거로 사용할 수 없습니다.')
if not source_evidence or not (source_evidence.get('paragraphElements') or source_evidence.get('editableTextObjects')):
    warnings.append('편집 가능한 후보 HWPX의 문단 근거가 없습니다.')
result = {'schema': 'technical-report-page-comparison/1', 'status': 'compared', 'dpi': args.dpi,
          'reference': {'path': str(Path(args.reference).resolve()), 'sha256': ref_hash, **ref},
          'candidate': {'path': str(Path(args.candidate).resolve()), 'sha256': cand_hash, **cand},
          'candidateSource': source_evidence, 'independentCandidateBytes': independent,
          'samePageSize': abs(ref['widthPt'] - cand['widthPt']) < 0.1 and abs(ref['heightPt'] - cand['heightPt']) < 0.1,
          'sameExtractedText': ref['text'] == cand['text'], 'changedPixelFractionThreshold12': changed,
          'meanAbsoluteChannelDifference': sum(ImageStat.Stat(difference).mean) / (3 * 255), 'verified': False, 'warnings': warnings}
output.mkdir(parents=True, exist_ok=True)
reference.save(output / 'reference.png'); candidate.save(output / 'candidate.png')
ImageOps.autocontrast(difference).save(output / 'difference.png'); comparison.save(output / 'comparison.png')
(output / 'comparison.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'output': str(output), 'status': 'compared', 'independentCandidateBytes': independent, 'samePageSize': result['samePageSize'], 'changedPixelFractionThreshold12': changed, 'verified': False}, ensure_ascii=False))
