#!/usr/bin/env python3
import json
from pathlib import Path
for path in sorted(Path('../docs/bot-experiments').glob('*cycle-escapes.json')):
    rows=json.loads(path.read_text());print(path.name)
    for r in rows:
        print(json.dumps({k:r[k] for k in ['name','side','placements','winner','firstRepeat','unique']}))
