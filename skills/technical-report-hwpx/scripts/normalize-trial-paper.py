"""Correct Chromium's rounded PDF media box from the candidate HWPX paper.

Keep the upper-left paper origin fixed. PDF coordinates start at the bottom,
so replacing the media box with (0, 0, width, height) would move every object
relative to the page top when Chromium rounded the height.
No PDF content streams, text or images are replaced or rescaled.
"""
import argparse
import json
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
import fitz

parser = argparse.ArgumentParser()
for key in ['hwpx', 'pdf', 'output']:
    parser.add_argument('--' + key, required=True)
args = parser.parse_args()
source, pdf_path, output = [Path(value).resolve() for value in [args.hwpx, args.pdf, args.output]]
if output in [source, pdf_path]:
    raise ValueError('별도 PDF 출력 위치를 지정하세요.')
with zipfile.ZipFile(source) as archive:
    root = ET.fromstring(archive.read('Contents/section0.xml'))
    paper = next(e for e in root.iter() if e.tag.endswith('}pagePr'))
    width, height = int(paper.get('width')) / 100, int(paper.get('height')) / 100
with fitz.open(pdf_path) as doc:
    if len(doc) != 1:
        raise ValueError('한 쪽 시험 PDF만 지원합니다.')
    page = doc[0]
    if page.rotation:
        raise ValueError('회전 없는 시험 PDF만 지원합니다.')
    before = page.mediabox
    corrected = fitz.Rect(before.x0, before.y1 - height, before.x0 + width, before.y1)
    page.set_mediabox(corrected)
    doc.save(output)
print(json.dumps({'widthPt': width, 'heightPt': height, 'contentStreamsChanged': False,
                  'upperLeftOriginPreserved': True, 'previousMediaBox': list(before),
                  'mediaBox': list(corrected)}))
