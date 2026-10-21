"""Registered bounded finishing workflow, with receiver-side input checks."""
import json,time,subprocess
from pathlib import Path
R=Path(__file__).parent;O=R/'outputs'
scenes=json.loads((R/'script.json').read_text())['scenes']
for attempt in range(60):
 missing=[s['id'] for s in scenes if not (O/(s['id']+'.wav')).exists()]
 if not missing:break
 print('Awaiting narration: '+', '.join(missing),flush=True);time.sleep(15)
else:raise SystemExit('Narration did not complete within 15 minutes')
def run(*args):subprocess.run(args,check=True)
run('/Users/nick/ActiveProjects/BreezeTTS/mlx-audio-bench/.venv/bin/python',str(R/'asr.py'))
run('/Users/nick/ActiveProjects/Visual/.venv/bin/python',str(R/'qc.py'))
run('python3',str(R/'test_rules.py'))
run('/Users/nick/ActiveProjects/Visual/.venv/bin/python',str(R/'render.py'))
run('/opt/homebrew/bin/ffprobe','-v','error','-show_entries','format=duration,size:stream=codec_name,width,height,r_frame_rate','-of','json',str(O/'boop-rules.mp4'))
