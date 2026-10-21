"""Extract frames from encoded deliverable, not just the drawing source."""
from pathlib import Path
import json,subprocess
from PIL import Image,ImageDraw,ImageFont
R=Path(__file__).parent;O=R/'outputs';timeline=json.loads((O/'timeline.json').read_text())
rows=[]
for i,s in enumerate(timeline):
 pictures=[]
 for j,t in enumerate([1.0,2.8,4.3,s['duration']*.8]):
  dest=O/f'encoded-{i:02d}-{j}.jpg'
  subprocess.run(['/opt/homebrew/bin/ffmpeg','-hide_banner','-loglevel','error','-y','-ss',str(s['start']+t),'-i',str(O/'boop-rules.mp4'),'-frames:v','1',str(dest)],check=True)
  pictures.append(Image.open(dest).resize((480,270)))
 row=Image.new('RGB',(1920,302),'#F8F1E5');d=ImageDraw.Draw(row);d.text((10,6),s['id'],fill='#35283F',font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',20))
 for j,im in enumerate(pictures):row.paste(im,(j*480,32))
 rows.append(row)
for start in range(0,len(rows),4):
 selected=rows[start:start+4];sheet=Image.new('RGB',(1920,302*len(selected)))
 for j,row in enumerate(selected):sheet.paste(row,(0,j*302))
 sheet.save(O/f'contact-{start:02d}.jpg',quality=93)
print('Encoded motion review contact sheets extracted',flush=True)
