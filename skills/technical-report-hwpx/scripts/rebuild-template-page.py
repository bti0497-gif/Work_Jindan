"""Rebind a reviewed one-page HWPX template range to the matching PDF text.

This is a paired-document learning trial, not PDF-only automatic restoration.
The range is explicit: a section is never assumed to equal a printed page.
"""
import argparse
import copy
import hashlib
import json
import re
import unicodedata
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
import fitz

p = argparse.ArgumentParser()
for key in ['pdf', 'hwpx', 'section', 'output']:
    p.add_argument('--' + key, required=True)
for key in ['page', 'start-paragraph', 'end-paragraph']:
    p.add_argument('--' + key, required=True, type=int)
p.add_argument('--reviewed-text', help='PDF에서 추출되지 않아 원본 HWPX와 시각 확인한 문구의 해시 결합 JSON')
p.add_argument('--layout-repairs', help='원본에서 빠진 개체 문단의 줄 배치를 PDF와 대조한 해시 결합 JSON')
args = p.parse_args()
pdf_path, hwpx_path, output = map(lambda x: Path(x).resolve(), [args.pdf, args.hwpx, args.output])
if output in [pdf_path, hwpx_path]:
    raise ValueError('원본을 덮어쓸 수 없습니다.')
HP = 'http://www.hancom.co.kr/hwpml/2011/paragraph'
HH = 'http://www.hancom.co.kr/hwpml/2011/head'
HS = 'http://www.hancom.co.kr/hwpml/2011/section'
HC = 'http://www.hancom.co.kr/hwpml/2011/core'
OPF = 'http://www.idpf.org/2007/opf/'
ns = {'hp': HP, 'hh': HH, 'hc': HC}
local = lambda e: e.tag.rsplit('}', 1)[-1]
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
canonical = lambda s: ''.join(c for c in unicodedata.normalize('NFKC', s) if not c.isspace())
evidence = {'schema': 'jindan-paired-page-trial/1', 'method': 'pdf-text-bound-hwpx-template',
            'pdf': {'filename': pdf_path.name, 'sha256': sha(pdf_path), 'page': args.page},
            'styleSource': {'filename': hwpx_path.name, 'sha256': sha(hwpx_path), 'section': args.section,
                            'range': [args.start_paragraph, args.end_paragraph]},
            'bindings': [], 'status': 'candidate-generated', 'hancomOutputVerified': False,
            'limitations': ['원본 HWPX의 위치·서식을 재사용한 문서 쌍 시험이며 PDF 단독 자동 복원이 아닙니다.']}
reviewed = json.loads(Path(args.reviewed_text).read_text(encoding='utf-8-sig')) if args.reviewed_text else {}
repairs = json.loads(Path(args.layout_repairs).read_text(encoding='utf-8-sig')) if args.layout_repairs else {}
for reviewed_input in [reviewed, repairs]:
    if reviewed_input and (reviewed_input.get('pdfSha256') != evidence['pdf']['sha256'] or reviewed_input.get('hwpxSha256') != evidence['styleSource']['sha256'] or reviewed_input.get('page') != args.page):
        raise ValueError('검토 근거가 현재 원본에 속하지 않습니다.')

with fitz.open(pdf_path) as pdf:
    page = pdf[args.page - 1]
    spans = [s for b in page.get_text('dict')['blocks'] if b['type'] == 0 for line in b['lines'] for s in line['spans']]
    pdf_text = '\n'.join(s['text'] for s in spans)
    pdf_canonical = canonical(pdf_text)
    printed = re.search(r'-\s*(\d+)\s*-', pdf_text)
    printed_page = int(printed.group(1)) if printed else args.page
    evidence['pdf']['printedPage'] = printed_page
    evidence['pdf']['widthPt'], evidence['pdf']['heightPt'] = page.rect.width, page.rect.height
    with zipfile.ZipFile(hwpx_path) as archive:
        if len(archive.infolist()) > 20000 or sum(i.file_size for i in archive.infolist()) > 256 * 1024 * 1024:
            raise ValueError('HWPX 패키지 크기 한도 초과')
        if any(re.search(r'(signature|encryption)', name, re.I) for name in archive.namelist()):
            raise ValueError('서명·암호화 문서는 변경하지 않습니다.')
        source_section = archive.read(args.section)
        if b'<!DOCTYPE' in source_section or b'<!ENTITY' in source_section:
            raise ValueError('외부 개체가 포함된 XML은 허용하지 않습니다.')
        for _, pair in ET.iterparse(__import__('io').BytesIO(source_section), events=['start-ns']):
            ET.register_namespace(*pair)
        ET.register_namespace('hp', HP)
        ET.register_namespace('hc', HC)
        ET.register_namespace('hs', HS)
        root = ET.fromstring(source_section)
        nodes = list(root)
        if not 0 <= args.start_paragraph <= args.end_paragraph < len(nodes):
            raise ValueError('검토한 원본 문단 범위를 확인하세요.')
        selected = copy.deepcopy(nodes[args.start_paragraph:args.end_paragraph + 1])
        if any(local(n) != 'p' for n in selected):
            raise ValueError('본문 문단 범위만 선택하세요.')
        selected[0].set('pageBreak', '0')
        for repair in repairs.get('items', []):
            index = repair.get('rootParagraphIndex', -1) - args.start_paragraph
            if not 0 <= index < len(selected) or not repair.get('reason') or selected[index].find('hp:linesegarray', ns) is not None:
                raise ValueError('누락 줄 배치의 보정 위치를 확인하세요.')
            values = repair.get('line', {})
            allowed = {'textpos', 'vertpos', 'vertsize', 'textheight', 'baseline', 'spacing', 'horzpos', 'horzsize', 'flags'}
            if set(values) != allowed or any(not isinstance(v, int) or v < 0 or v > 20000000 for v in values.values()):
                raise ValueError('보정할 줄 배치 값을 확인하세요.')
            array = ET.SubElement(selected[index], f'{{{HP}}}linesegarray')
            ET.SubElement(array, f'{{{HP}}}lineseg', {key: str(value) for key, value in values.items()})
        evidence['layoutRepairs'] = repairs.get('items', [])
        counter = 3000000
        for paragraph in [p for node in selected for p in node.iter(f'{{{HP}}}p')]:
            texts = [t for run in paragraph.findall('hp:run', ns) for t in run.findall('hp:t', ns) if t.text and t.text.strip()]
            if not texts:
                continue
            if len(texts) != 1:
                raise ValueError('복합 글자 구간은 별도로 검토해야 합니다.')
            old = texts[0].text
            value = canonical(old)
            start = pdf_canonical.find(value)
            if start < 0:
                manual = next((item for item in reviewed.get('items', []) if item.get('text') == old and item.get('reason') and len(item.get('bbox', [])) == 4), None)
                if not manual:
                    raise ValueError('PDF와 일치하지 않는 템플릿 내용: ' + old[:70])
                value = canonical(manual['text'])
            # Rebind every non-whitespace character from the PDF, retaining template spacing.
            glyphs = iter(pdf_canonical[start:start + len(value)] if start >= 0 else value)
            replacement = ''.join(ch if ch.isspace() else next(glyphs) for ch in unicodedata.normalize('NFKC', old))
            texts[0].text = replacement
            run = next(r for r in paragraph.findall('hp:run', ns) if texts[0] in list(r))
            evidence['bindings'].append({'paragraphId': counter, 'pdfCanonicalRange': [start, start + len(value)],
                                         'textEvidence': 'pdf-extracted' if start >= 0 else 'hwpx-and-pdf-visual-review',
                                         'textSha256': hashlib.sha256(replacement.encode()).hexdigest(),
                                         'charPrIDRef': run.get('charPrIDRef'), 'paraPrIDRef': paragraph.get('paraPrIDRef')})
            paragraph.set('id', str(counter))
            counter += 1
        sec = copy.deepcopy(next(e for e in root.iter() if local(e) == 'secPr'))
        sec.find('hp:startNum', ns).set('page', str(printed_page))
        sec.find('hp:startNum', ns).set('pageStartsOn', 'BOTH')
        paper = sec.find('hp:pagePr', ns)
        paper.set('width', str(round(page.rect.width * 100)))
        paper.set('height', str(round(page.rect.height * 100)))
        controls = []
        restart = ET.Element(f'{{{HP}}}ctrl')
        ET.SubElement(restart, f'{{{HP}}}newNum', {'num': str(printed_page), 'numType': 'PAGE'})
        controls.append(restart)
        # Section-scoped page numbering can be inherited from an earlier section.
        inherited_number = None
        for section_name in sorted(n for n in archive.namelist() if re.fullmatch(r'Contents/section\d+\.xml', n)):
            if int(re.search(r'(\d+)\.xml', section_name).group(1)) > int(re.search(r'(\d+)\.xml', args.section).group(1)):
                continue
            for item in ET.fromstring(archive.read(section_name)).iter(f'{{{HP}}}pageNum'):
                inherited_number = copy.deepcopy(item)
        if inherited_number is not None:
            control = ET.Element(f'{{{HP}}}ctrl')
            control.append(inherited_number)
            controls.append(control)
        for name in ['header', 'footer']:
            for area in root.iter(f'{{{HP}}}{name}'):
                if area.get('applyPageType', 'BOTH') not in ['BOTH', 'EVEN' if printed_page % 2 == 0 else 'ODD']:
                    continue
                control = ET.Element(f'{{{HP}}}ctrl')
                area = copy.deepcopy(area)
                area.set('applyPageType', 'BOTH')
                for number in area.iter(f'{{{HP}}}autoNum'):
                    if number.get('numType') == 'PAGE':
                        number.set('num', str(printed_page))
                control.append(area)
                controls.append(control)
        first_run = selected[0].find('hp:run', ns)
        for item in reversed([sec, *controls]):
            first_run.insert(0, item)
        result_root = ET.Element(f'{{{HS}}}sec', root.attrib)
        result_root.extend(selected)
        binary_ids = {e.get('binaryItemIDRef') for e in result_root.iter() if e.get('binaryItemIDRef')}
        source_manifest = ET.fromstring(archive.read('Contents/content.hpf'))
        binary_items = {e.get('id'): e for e in source_manifest.iter() if local(e) == 'item' and e.get('id') in binary_ids}
        if set(binary_items) != binary_ids:
            raise ValueError('그림 자산 의존성을 확인할 수 없습니다.')
        package = ET.Element(f'{{{OPF}}}package', {'version': '1.0', 'unique-identifier': '', 'id': ''})
        meta = ET.SubElement(package, f'{{{OPF}}}metadata')
        ET.SubElement(meta, f'{{{OPF}}}title').text = f'한 쪽 재현 · 원문 {printed_page}쪽'
        manifest = ET.SubElement(package, f'{{{OPF}}}manifest')
        for ident, href in [('header', 'Contents/header.xml'), ('section0', 'Contents/section0.xml')]:
            ET.SubElement(manifest, f'{{{OPF}}}item', {'id': ident, 'href': href, 'media-type': 'application/xml'})
        for item in binary_items.values():
            manifest.append(copy.deepcopy(item))
        spine = ET.SubElement(package, f'{{{OPF}}}spine')
        for ident in ['header', 'section0']:
            ET.SubElement(spine, f'{{{OPF}}}itemref', {'idref': ident, 'linear': 'yes'})
        header = archive.read('Contents/header.xml').decode('utf-8')
        header = re.sub(r'\bsecCnt="\d+"', 'secCnt="1"', header, count=1)
        header = re.sub(r'(<hh:beginNum\b[^>]*\bpage=")\d+', lambda m: m.group(1) + str(printed_page), header, count=1)
        output.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED) as target:
            target.writestr('mimetype', b'application/hwp+zip', compress_type=zipfile.ZIP_STORED)
            for name in ['version.xml', 'META-INF/container.xml', 'META-INF/manifest.xml']:
                if name in archive.namelist():
                    target.writestr(name, archive.read(name), compress_type=zipfile.ZIP_STORED if name == 'version.xml' else zipfile.ZIP_DEFLATED)
            target.writestr('Contents/header.xml', header.encode('utf-8'))
            target.writestr('Contents/section0.xml', ET.tostring(result_root, encoding='utf-8', xml_declaration=True))
            target.writestr('Contents/content.hpf', ET.tostring(package, encoding='utf-8', xml_declaration=True))
            for item in binary_items.values():
                target.writestr(item.get('href'), archive.read(item.get('href')))
            target.writestr('Preview/PrvText.txt', '\r\n'.join(e.text or '' for e in result_root.iter(f'{{{HP}}}t')).encode('utf-8'))
            target.writestr('Contents/jindan-page-trial.json', json.dumps(evidence, ensure_ascii=False, indent=2).encode('utf-8'))
        evidence['output'] = {'sha256': sha(output), 'file': output.name, 'boundParagraphs': len(evidence['bindings']), 'binaryAssets': len(binary_ids)}
        output.with_suffix('.evidence.json').write_text(json.dumps(evidence, ensure_ascii=False, indent=2), encoding='utf-8')
        reference = fitz.open()
        reference.insert_pdf(pdf, from_page=args.page - 1, to_page=args.page - 1)
        reference.save(output.parent / 'reference.pdf')
print(json.dumps(evidence['output'], ensure_ascii=False))
