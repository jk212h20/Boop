"""Independent local Nemotron content check, using the installed benchmark runtime."""
import json,re,sys,time
from pathlib import Path
from mlx_audio.stt.utils import load
root=Path(__file__).parent
script=json.loads((root/'script.json').read_text())
model=load('mlx-community/nemotron-3.5-asr-streaming-0.6b')
for scene in script['scenes']:
 p=root/'outputs'/f"{scene['id']}.wav"
 dest=p.with_name(scene['id']+'-asr.json')
 if not p.exists() or dest.exists():continue
 result=model.generate(str(p),language='en')
 text=result.text.strip()
 data={'expected':scene['text'],'transcript':text}
 dest.write_text(json.dumps(data,indent=2))
 print(scene['id']+': '+text,flush=True)
