"""Bounded acoustic/content QC; does not claim human listening approval."""
import json,wave,re,difflib
from pathlib import Path
import numpy as np
R=Path(__file__).parent;O=R/'outputs';script=json.loads((R/'script.json').read_text())
report=[]
for s in script['scenes']:
 p=O/(s['id']+'.wav')
 if not p.exists():continue
 with wave.open(str(p),'rb') as w:
  sr=w.getframerate();a=np.frombuffer(w.readframes(w.getnframes()),dtype='<i2').astype(float)/32768
 active=np.flatnonzero(abs(a)>.007)
 clip=int(np.sum(abs(a)>.999));rms=float(np.sqrt(np.mean(a*a)));duration=len(a)/sr
 frames=a[:len(a)//1200*1200].reshape(-1,1200);energies=np.sqrt(np.mean(frames*frames,axis=1))
 # Internal silence after trimming first/last energetic frame, 50 ms resolution.
 voiced=np.flatnonzero(energies>.007);mask=energies[voiced[0]:voiced[-1]+1]<=.007;longest=run=0
 for b in mask:run=run+1 if b else 0;longest=max(longest,run)
 asrp=O/(s['id']+'-asr.json');transcript=json.loads(asrp.read_text())['transcript'] if asrp.exists() else ''
 norm=lambda t:re.findall(r"[a-z0-9]+",t.lower())
 match=difflib.SequenceMatcher(None,norm(s['text']),norm(transcript)).ratio()
 report.append({'id':s['id'],'duration':round(duration,2),'peak':round(float(max(abs(a))),4),'rms':round(rms,4),'clipped_samples':clip,'longest_internal_silence':round(longest*.05,2),'asr_similarity':round(match,3),'transcript':transcript})
(O/'audio-qc.json').write_text(json.dumps(report,indent=2))
for r in report:print(f"{r['id']:10} {r['duration']:5}s peak={r['peak']} clipped={r['clipped_samples']} gap={r['longest_internal_silence']} ASR={r['asr_similarity']}")
if any(r['clipped_samples'] or r['rms']<.005 or r['longest_internal_silence']>1.5 for r in report):raise SystemExit('Acoustic defect requires repair')
