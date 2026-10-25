"""Validate proof hashes, deduplicate certificates and rebuild storage offsets.
Use --recovered-dir only for independently regenerated, exact-hash certificates.
No verdicts or performance measurements are changed.
"""
import argparse,gzip,hashlib,json,pathlib,zlib
ap=argparse.ArgumentParser();ap.add_argument('--recovered-dir');a=ap.parse_args();root=pathlib.Path('reports/scoring-proof-2026-10-25')
def encode(x):return json.dumps(x,ensure_ascii=False,separators=(',',':')).encode()
for part in range(4):
 manifests=[root/f'part-{part}.json.gz',root/f'extra-{part}.json.gz'];rows=[(p,json.load(gzip.open(p))) for p in manifests];known={}
 files={r['proofStorage']['file'] for _,rs in rows for r in rs if r.get('proofStorage')}
 for file in files:
  data=(root/file).read_bytes();pos=0
  while pos<len(data):
   z=zlib.decompressobj(31);raw=z.decompress(data[pos:]);n=len(data)-pos-len(z.unused_data)
   if not z.eof or n<=0:raise ValueError('Invalid gzip frame')
   p=json.loads(raw);h=hashlib.sha256(encode(p['proof'])).hexdigest();known[h]=p['proof'];pos+=n
 dest=root/f'certificates-{part}.jsonl.gz';tmp=dest.with_suffix('.tmp');written={};offset=0
 with tmp.open('wb') as f:
  for _,rs in rows:
   for r in rs:
    st=r.get('proofStorage')
    if not st:continue
    h=st['sha256']
    if h not in known and a.recovered_dir:
     candidate=pathlib.Path(a.recovered_dir)/f'recovered-proof-{h}.json.gz';proof=json.load(gzip.open(candidate));assert hashlib.sha256(encode(proof)).hexdigest()==h;known[h]=proof
    if h not in known:raise ValueError('Missing exact certificate '+h)
    if h not in written:
     b=gzip.compress(encode({'sha256':h,'proof':known[h]})+b'\n',compresslevel=6,mtime=0);f.write(b);written[h]={'file':dest.name,'offset':offset,'length':len(b),'sha256':h};offset+=len(b)
    r['proofStorage']=dict(written[h])
 tmp.replace(dest)
 for path,rs in rows:path.write_bytes(gzip.compress(encode(rs),compresslevel=6,mtime=0))
 print('Packed',part,'unique certificates',len(written),'bytes',offset)
