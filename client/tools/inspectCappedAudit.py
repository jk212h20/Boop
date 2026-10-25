#!/usr/bin/env python3
"""Bounded, readable diagnostics from retained full capped-game traces."""
import json
import gzip
from pathlib import Path
for path in sorted(Path('../docs/bot-experiments/capped-audit').glob('*.json.gz')):
    data=json.loads(gzip.decompress(path.read_bytes()));s=data['summary'];events=data['events']
    print(json.dumps({k:s[k] for k in ['seed','newColor','placements','winner','firstRepeat','repeatedDecisions','inventoryAt180']}))
    print('late board samples (O/o orange cat/kitten, G/g gray cat/kitten):')
    for ply in [100,140,179,200]:
        e=next((e for e in events if e['ply']==ply and e['state']['phase']=='playing'),None)
        if not e:continue
        board=e['state']['board'];chars={('orange','cat'):'O',('orange','kitten'):'o',('gray','cat'):'G',('gray','kitten'):'g'}
        print(ply,' '.join(''.join(chars[(p['color'],p['type'])] if p else '.' for p in row) for row in board),json.dumps(e['inventory']))
