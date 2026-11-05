from pathlib import Path
import hashlib,json,re
old=Path('F:/jindan');root=Path(__file__).resolve().parent.parent
engine=root/'src/Jindan.Report.Worker/engine'
records=[]
pattern=re.compile(r'''(?:from\s*|import\s*\(|require\s*\()\s*['"]([^'"]+)''')
excluded={'report-ai.test.cjs','report-skill.test.cjs','page-reproduction.test.cjs'}
tests=[p for p in (old/'scripts').glob('*.test.cjs') if ('services/report' in p.read_text(encoding='utf-8-sig') or p.name in {'png-density57.test.cjs','font-name60.test.cjs'}) and p.name not in excluded]
queue=[old/'src/services/report/portableEngine.js',old/'src/services/report/recoveredDraftSession.js',*tests];seen=set();packages=set()
while queue:
 source=queue.pop()
 if source in seen:continue
 seen.add(source);rel=source.relative_to(old).as_posix()
 assert source.suffix in {'.js','.cjs','.json'},rel
 b=source.read_bytes();text=b.decode('utf-8-sig')
 if rel.startswith('scripts/'):
  target=root/'tests/LegacyEngine'/source.relative_to(old/'scripts')
  text=text.replace('../src/','../../src/Jindan.Report.Worker/engine/src/')
  # Legacy helper imports remain relative inside the isolated test folder.
  text=text.replace("import('../src/", "import('../../src/Jindan.Report.Worker/engine/src/")
 else:target=engine/rel
 target.parent.mkdir(parents=True,exist_ok=True);target.write_text(text,encoding='utf-8',newline='')
 records.append({'origin':str(source),'originSha256':hashlib.sha256(b).hexdigest(),'destination':target.relative_to(root).as_posix(),'migratedSha256':hashlib.sha256(target.read_bytes()).hexdigest(),'transformation':'test relative engine path only' if rel.startswith('scripts/') else 'UTF8 BOM normalization only','category':'legacy-test' if rel.startswith('scripts/') else 'engine-source'})
 for dep in pattern.findall(b.decode('utf-8-sig')):
  if dep.startswith('.'):
   p=(source.parent/dep).resolve()
   if not p.suffix:
    for suffix in ['.js','.cjs','.json']:
     if p.with_suffix(suffix).is_file():p=p.with_suffix(suffix);break
   if p.is_file():queue.append(p)
  elif not dep.startswith('node:'):packages.add(dep.split('/')[0] if not dep.startswith('@') else '/'.join(dep.split('/')[:2]))
# Runtime-only local asset imported via new URL rather than static import.
asset=old/'src/services/report/assets/hwpxBase.json'
if asset not in seen:
 target=engine/asset.relative_to(old);target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(asset.read_bytes());records.append({'origin':str(asset),'originSha256':hashlib.sha256(asset.read_bytes()).hexdigest(),'destination':target.relative_to(root).as_posix(),'migratedSha256':hashlib.sha256(target.read_bytes()).hexdigest(),'transformation':'none','category':'engine-asset'})
manifest={'schema':'jindan-migration-source-map/1','sourceRoot':'F:/jindan','engineSingleSource':'src/Jindan.Report.Worker/engine','files':sorted(records,key=lambda r:r['destination']),'testFiles':sorted(p.name for p in tests),'excludedTests':{n:'External skill/desktop launcher or AI boundary; not core engine repair' for n in sorted(excluded)},'externalPackages':sorted(packages),'reportReady':False,'supervisorAccepted':False}
(root/'migration/source-map.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'copiedFiles':len(records),'testFiles':len(tests),'packages':sorted(packages)}))
