"""Encoded artifact checks and bounded transcription differences."""
import json,subprocess,wave,re,difflib
from pathlib import Path
ROOT=Path(__file__).parent;OUT=ROOT/'outputs'
script=json.loads((ROOT/'script.json').read_text());report={}
for s in script['scenes']:
    p=OUT/(s['id']+'-asr.json');d=json.loads(p.read_text())
    clean=lambda x:re.findall(r'[a-z0-9]+',x.lower().replace('boop','boop'))
    expected=clean(s['text']);heard=clean(d['transcript'])
    diffs=[{'expected':expected[i:j],'heard':heard[k:l]} for tag,i,j,k,l in difflib.SequenceMatcher(None,expected,heard).get_opcodes() if tag!='equal']
    report[s['id']]={'differences':diffs}
probe=json.loads(subprocess.check_output(['/opt/homebrew/bin/ffprobe','-v','quiet','-show_streams','-show_format','-of','json',str(OUT/'boop-cozy-rules.mp4')]))
assert 120<=float(probe['format']['duration'])<=180
assert any(s.get('codec_name')=='h264' and s.get('width')==1920 and s.get('height')==1080 for s in probe['streams'])
assert any(s.get('codec_name')=='aac' for s in probe['streams'])
report['duration']=probe['format']['duration']
(OUT/'qc.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
