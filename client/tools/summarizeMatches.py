#!/usr/bin/env python3
"""Summarize retained JSONL matches without treating swapped colors as independent."""
import argparse
import json
from pathlib import Path
from statistics import mean, stdev
p=argparse.ArgumentParser();p.add_argument('logs',nargs='+',type=Path);args=p.parse_args()
for path in args.logs:
    records=[json.loads(s) for s in path.read_text().splitlines() if s.strip()]
    games=[r for r in records if 'seed' in r]
    pairs={}
    wins=losses=draws=0
    for r in games:
        value=.5 if r['winner'] is None else float(r['winner']==r['newColor'])
        pairs.setdefault(r['seed'],[]).append(value)
        wins+=value==1;losses+=value==0;draws+=value==.5
    complete=[mean(v) for v in pairs.values() if len(v)==2]
    result={'file':str(path),'games':len(games),'wins':wins,'losses':losses,'draws':draws,
            'completePairs':len(complete),'score':mean(complete) if complete else None}
    if len(complete)>1:
        # Descriptive SE only: small paired batches do not establish a rating.
        result['pairedScoreSE']=stdev(complete)/(len(complete)**.5)
    print(json.dumps(result))
