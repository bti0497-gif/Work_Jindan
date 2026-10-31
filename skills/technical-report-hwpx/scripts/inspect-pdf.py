import argparse
import json
from pathlib import Path
import fitz

parser = argparse.ArgumentParser(description='Read PDF page geometry, printed-number candidates and conservative blank-page evidence.')
parser.add_argument('--input', required=True)
parser.add_argument('--output')
args = parser.parse_args()
pages = []
with fitz.open(args.input) as document:
    if document.needs_pass:
        raise ValueError('암호화된 PDF는 보호 해제한 사본으로 분석하세요.')
    if len(document) > 3000:
        raise ValueError('PDF 페이지 분석 한도(3,000쪽)를 넘습니다.')
    for index, page in enumerate(document):
        text = page.get_text().strip()
        images, drawings = len(page.get_images()), len(page.get_drawings())
        bottom = page.get_text(clip=fitz.Rect(0, max(0, page.rect.height - 65), page.rect.width, page.rect.height)).strip()
        pages.append({'pdfPage': index + 1, 'pageLabel': page.get_label(), 'widthMm': round(page.rect.width * 25.4 / 72, 2), 'heightMm': round(page.rect.height * 25.4 / 72, 2),
                      'textCharacters': len(text), 'imageCount': images, 'drawingCount': drawings, 'emptyContent': not text and images == 0 and drawings == 0, 'bottomText': bottom[:160]})
result = {'status': 'inventory-only', 'pageCount': len(pages), 'emptyContentPages': [page['pdfPage'] for page in pages if page['emptyContent']], 'pages': pages,
          'limitations': ['빈 쪽 후보는 문자·이미지·도형의 부재를 확인한 결과입니다. 실제 모양과 제본상 역할은 별도로 확인하세요.', 'PDF 파일 안의 페이지와 책에 인쇄된 쪽 번호는 같지 않을 수 있습니다.']}
encoded = json.dumps(result, ensure_ascii=False, indent=2)
if args.output:
    destination = Path(args.output)
    if destination.suffix.lower() != '.json':
        raise ValueError('PDF 분석 결과는 .json 파일로 저장하세요.')
    if destination.resolve() == Path(args.input).resolve():
        raise ValueError('원본 PDF 위에 결과를 저장할 수 없습니다.')
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(encoded + '\n', encoding='utf-8')
else:
    print(encoded)
