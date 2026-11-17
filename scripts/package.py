"""Package runnable sources and factual datasets, not third-party documents."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import hashlib
import json
import re
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'Secours-Citoyen-Preparation-OpenAI.zip'
files=[]
allowed_top={'server.js','package.json','requirements.txt','README.md','TEST_REPORT.md','soul.md','.env.example','.gitignore','public','lib','data','scripts','tests','docs'}
for p in ROOT.rglob('*'):
    rel=p.relative_to(ROOT)
    if rel.parts[0] not in allowed_top or any(part.startswith('.') and part not in {'.env.example','.gitignore'} for part in rel.parts):continue
    if not p.is_file() or any(x in {'__pycache__','.venv','node_modules','.git'} for x in rel.parts):continue
    if p.suffix in {'.zip','.pbf','.pyc'}:continue
    if 'evidence' in rel.parts and p.suffix in {'.html','.pdf','.txt'}:continue
    files.append(p)
# Refuse a shareable archive containing any currently configured private secret.
# Values stay in memory and are never printed, hashed individually or exported.
secrets=[]
env=ROOT/'.env'
if env.is_file():
    for line in env.read_text(encoding='utf-8-sig').splitlines():
        match=re.match(r'^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$',line)
        if not match or not any(word in match[1] for word in ['KEY','TOKEN','SECRET','PASSWORD']):continue
        value=match[2].strip()
        if value[:1] in {'"',"'"}:value=value[1:].split(value[0],1)[0]
        else:value=re.split(r'\s+#',value,maxsplit=1)[0].strip()
        if len(value)>=8:secrets.append(value.encode())
for p in files:
    content=p.read_bytes()
    if any(secret in content for secret in secrets):raise SystemExit('Archive refusée : secret détecté dans un fichier partageable.')
with ZipFile(OUT,'w',ZIP_DEFLATED) as z:
    for p in sorted(files):z.write(p,'secours-citoyen/'+p.relative_to(ROOT).as_posix())
with ZipFile(OUT) as z:
    assert z.testzip() is None
    assert len(z.namelist())==len(files)
    for p in files:
        entry='secours-citoyen/'+p.relative_to(ROOT).as_posix()
        assert hashlib.sha256(z.read(entry)).digest()==hashlib.sha256(p.read_bytes()).digest()
print(json.dumps({'archive':str(OUT),'files':len(files),'bytes':OUT.stat().st_size,'sha256':hashlib.sha256(OUT.read_bytes()).hexdigest()},indent=2))
