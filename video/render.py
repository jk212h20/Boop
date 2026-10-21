"""Deterministic quilt-board motion graphics. No generated gameplay imagery."""
import json,math,subprocess,wave,sys
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFont
R=Path(__file__).parent; O=R/'outputs'; W,H=1920,1080; FPS=24
S=json.loads((R/'script.json').read_text())['scenes']
FONT='/System/Library/Fonts/Supplemental/Arial.ttf'
BOLD='/System/Library/Fonts/Supplemental/Arial Rounded Bold.ttf'
COL={'bg':'#F8F1E5','ink':'#35283F','muted':'#786E7B','orange':'#E69A62','gray':'#96A7BB','mint':'#C4D8CC','plum':'#624967'}
def font(n,b=False):return ImageFont.truetype(BOLD if b else FONT,n)
def ease(x):x=max(0,min(1,x));return x*x*(3-2*x)
def txt(d,xy,t,n=32,fill=None,b=False):d.text(xy,t,font=font(n,b),fill=fill or COL['ink'])
def wrap(t,n,width):
 lines=[];line=''
 for word in t.split():
  test=(line+' '+word).strip()
  if font(n).getlength(test)>width and line:lines.append(line);line=word
  else:line=test
 if line:lines.append(line)
 return lines
def cat(d,x,y,color='o',adult=False,scale=1,alpha=1):
 # Distinct adult size, broad cheeks and chest bib; kittens have small round faces.
 r=(49 if adult else 36)*scale; c=COL['orange' if color=='o' else 'gray'];ink=COL['ink'];x=float(x);y=float(y)
 d.ellipse((x-r-2,y-r+12,x+r+2,y+r+16),fill='#D6CABC')
 d.polygon([(x-r*.92,y-r*.28),(x-r*.92,y-r*1.22),(x-r*.26,y-r*.72)],fill=c,outline=ink,width=3)
 d.polygon([(x+r*.92,y-r*.28),(x+r*.92,y-r*1.22),(x+r*.26,y-r*.72)],fill=c,outline=ink,width=3)
 d.ellipse((x-r,y-r*.8,x+r,y+r*.9),fill=c,outline=ink,width=3)
 for a in [-1,1]:
  d.ellipse((x+a*r*.37-3*scale,y-3*scale,x+a*r*.37+3*scale,y+5*scale),fill=ink)
  for z in [-.1,.15]:d.line((x+a*r*.6,y+r*.28,x+a*r*1.04,y+r*z),fill=ink,width=2)
 d.polygon([(x-5*scale,y+r*.19),(x+5*scale,y+r*.19),(x,y+r*.30)],fill=ink)
 d.arc((x-10*scale,y+r*.20,x,y+r*.47),0,110,fill=ink,width=2)
 d.arc((x,y+r*.20,x+10*scale,y+r*.47),70,180,fill=ink,width=2)
 if adult:d.rounded_rectangle((x-r*.43,y+r*.51,x+r*.43,y+r*.77),radius=9,fill='#F6DFC0')
def pos(c,r):return 1050+c*123,270+r*123
def arrow(d,a,b,fill='#624967',width=6):
 d.line((*a,*b),fill=fill,width=width);ang=math.atan2(b[1]-a[1],b[0]-a[0]);L=17
 d.polygon([b,(b[0]-L*math.cos(ang-.5),b[1]-L*math.sin(ang-.5)),(b[0]-L*math.cos(ang+.5),b[1]-L*math.sin(ang+.5))],fill=fill)
def base(scene,index):
 im=Image.new('RGB',(W,H),COL['bg']);d=ImageDraw.Draw(im)
 # Fine textile-line border, matte editorial design.
 d.line((70,125,1850,125),fill='#DCD0C6',width=2)
 txt(d,(72,43),'boop.',58,b=True);txt(d,(315,69),'THE RULES, ONE LITTLE PUSH AT A TIME',21,fill=COL['muted'])
 txt(d,(1640,69),f'{index+1:02d} / {len(S):02d}',24,b=True)
 txt(d,(80,186),scene['chapter'],24,fill=COL['plum'],b=True)
 y=252
 for l in scene['title'].split('\n'):txt(d,(76,y),l,78,b=True);y+=94
 for l in wrap(scene['caption'],31,780):txt(d,(80,y+30),l,31,fill=COL['muted']);y+=42
 # Bed with quilt squares, stitched inset seams.
 d.rounded_rectangle((969,189,1780,952),radius=38,fill='#D9C3AA')
 d.rounded_rectangle((962,180,1773,934),radius=38,fill='#F3DFCA',outline='#BAA18A',width=3)
 palette=['#D2DCCE','#EBD8C0','#DDCEDC','#CEDAE0']
 for r in range(6):
  for c in range(6):
   x,y=pos(c,r);box=(x-60,y-60,x+60,y+60)
   d.rounded_rectangle(box,radius=8,fill=palette[(c+r*3)%4])
   for k in range(-48,49,16):
    d.line((x+k,y-51,x+k+7,y-51),fill='#B5A79C',width=1);d.line((x+k,y+51,x+k+7,y+51),fill='#B5A79C',width=1)
    d.line((x-51,y+k,x-51,y+k+7),fill='#B5A79C',width=1);d.line((x+51,y+k,x+51,y+k+7),fill='#B5A79C',width=1)
 if scene['id']!='setup':
  cat(d,114,860,'o');txt(d,(172,842),'KITTEN',24,b=True)
  cat(d,408,854,'o',True,scale=.8);txt(d,(468,842),'CAT',24,b=True)
  txt(d,(80,910),'Orange and gray are the two players.',23,fill=COL['muted'])
 return im
# Pieces: column,row,color,adult. Movement keyed by initial index. Placement always explicit.
def example(id):
 P=[];new=None;M={};line=None;note='';mode='push'
 if id in ['intro','recap']:P=[(1,2,'o',False),(3,2,'o',True),(2,3,'g',False)];new=(2,2,'o',True);M={0:(0,2),1:(4,2),2:(2,4)};note='A small move changes the whole neighborhood.'
 elif id=='setup':mode='setup';note='Each player: 8 active kittens. Cats wait in reserve.'
 elif id=='turn':P=[(1,1,'g',False),(4,4,'o',False)];new=(2,3,'o',False);note='Only place from your available pool.'
 elif id=='boop':P=[(1,1,'g',False),(2,1,'o',False),(3,1,'g',False),(1,2,'o',False),(3,2,'g',False),(1,3,'g',False),(2,3,'o',False),(3,3,'o',False)];new=(2,2,'o',False);M={i:(c+(c-2),r+(r-2)) for i,(c,r,*_) in enumerate(P)};note='Every eligible adjacent piece moves one square.'
 elif id=='edge':P=[(0,2,'g',False)];new=(1,2,'o',False);M={0:(-1,2)};note='Gray kitten returns to the gray pool.'
 elif id=='blocked':P=[(2,2,'g',False),(3,2,'o',False)];new=(1,2,'o',False);note='Occupied destination: both pieces stay.'
 elif id=='chain':P=[(2,2,'g',False),(4,2,'o',False)];new=(1,2,'o',False);M={0:(3,2)};note='The moved kitten does not push the orange kitten.'
 elif id in ['graduate','pool']:P=[(1,2,'o',False),(2,2,'o',False),(3,1,'o',False)];new=(3,0,'o',False);M={2:(3,2)};line=[(1,2),(2,2),(3,2)];mode='graduate';note='Your placement can boop your own pieces into a row.'
 elif id=='power':P=[(2,1,'g',True),(2,4,'g',True),(3,3,'g',False)];new=(2,3,'o',True);M={1:(2,5),2:(4,3)};mode='power';note='Above: kitten cannot push cat. Below: cat pushes both.'
 elif id=='mixed':P=[(1,2,'o',True),(2,2,'o',False),(3,1,'o',False)];new=(3,0,'o',False);M={2:(3,2)};line=[(1,2),(2,2),(3,2)];mode='graduate';note='One existing cat + two kittens → three cats in pool.'
 elif id=='eight':P=[(0,0,'o',False),(2,0,'o',False),(4,0,'o',True),(1,2,'o',False),(3,2,'o',True),(5,3,'o',False),(0,4,'o',True),(3,5,'o',False)];mode='eight';note='Choose one kitten to graduate, or return one cat.'
 elif id=='choice':P=[(1,2,'o',False),(2,2,'o',False),(3,2,'o',False),(3,3,'o',False),(3,4,'o',False)];line=[(1,2),(2,2),(3,2)];mode='choice';note='Choose the highlighted three. Leave the other two.'
 elif id=='win':P=[(1,2,'o',True),(2,2,'o',True),(3,1,'o',True)];new=(3,0,'o',True);M={2:(3,2)};line=[(1,2),(2,2),(3,2)];mode='win';note='The final position is what counts.'
 elif id=='eightcats':P=[(0,0,'o',True),(2,0,'o',True),(4,0,'o',True),(1,2,'o',True),(3,2,'o',True),(5,3,'o',True),(0,4,'o',True)];new=(3,5,'o',True);mode='eightcats';note='Eight adult cats of one color. No row required.'
 elif id=='junior':P=[(1,2,'o',False),(2,2,'o',False),(3,1,'o',False)];new=(3,0,'o',False);M={2:(3,2)};line=[(1,2),(2,2),(3,2)];mode='win';note='Junior variant: three kittens is the finish line.'
 return P,new,M,line,note,mode

def frame(scene,i,t,duration):
 im=base_cache[i].copy();d=ImageDraw.Draw(im);P,new,M,line,note,mode=example(scene['id']);p=ease((t-2.6)/1.3);placing=ease((t-1.2)/.75);late=ease((t-duration*.62)/1.4)
 if mode=='setup':
  for j in range(8):
   cat(d,115+j*85,668,'o',scale=.6);cat(d,115+j*85,774,'g',scale=.6)
   cat(d,107+j*44,868,'o',True,scale=.33);cat(d,480+j*44,868,'g',True,scale=.33)
  txt(d,(80,610),'ORANGE POOL · 8 KITTENS',23,b=True)
  txt(d,(80,718),'GRAY POOL · 8 KITTENS',23,b=True)
  txt(d,(80,824),'8 CATS IN RESERVE',20,b=True);txt(d,(450,824),'8 CATS IN RESERVE',20,b=True)
  txt(d,(80,915),'Keep all pieces off the bed until play begins.',23,fill=COL['muted'])
  txt(d,(1190,555),'EMPTY BED',35,b=True)
 else:
  if line and p>.95:
   pts=[pos(*a) for a in line];d.line([pts[0],pts[-1]],fill='#AFC4AE',width=100)
   for x,y in pts:d.ellipse((x-56,y-56,x+56,y+56),outline='#517866',width=4)
  for j,(c,r,col,adult) in enumerate(P):
   x,y=pos(c,r)
   if j in M:
    nx,ny=pos(*M[j]);
    if t>2 and p<.98:arrow(d,(x,y),(nx,ny))
    x+=(nx-x)*p;y+=(ny-y)*p
   if mode=='graduate' and line and (round((x-1050)/123),round((y-270)/123)) in line and late>0:
    # Diagram explicitly removes three, then reveals their adult pool counterparts.
    if late<.5:cat(d,x,y-100*late,col,adult,scale=1-late*1.6)
   elif mode=='eight' and j==0 and late>0:
    if late<.5:cat(d,x,y-100*late,col,adult,scale=1-late*1.6)
   elif mode=='choice' and j<3 and late>.5:continue
   elif scene['id']=='edge' and j==0 and p>.99:
    cat(d,844,664,col,adult);txt(d,(731,736),'GRAY POOL',24,b=True)
   else:cat(d,x,y,col,adult)
  if new and placing>0:
   x,y=pos(new[0],new[1]);
   if placing<1:d.ellipse((x-57,y-57,x+57,y+57),outline='#624967',width=4)
   cat(d,x,y-45*(1-placing),new[2],new[3],scale=.7+.3*placing)
  if scene['id']=='blocked' and t>2:
   x,y=pos(3,2);d.rectangle((x-55,y-55,x+55,y+55),outline='#AA635D',width=4)
   arrow(d,pos(2,2),pos(2.45,2),fill='#AA635D')
   txt(d,(1170,646),'BLOCKED',27,fill='#AA635D',b=True)
  if mode=='power':
   if placing>0:
    x,y=pos(2,0);cat(d,x,y-45*(1-placing),'o',False,scale=.7+.3*placing)
   if t>2.6:txt(d,(1190,240),'STAYS',23,b=True)
   if t>2:txt(d,(1190,490),'CAT CAN PUSH',23,b=True)
  if mode=='graduate' and late>.5:
   txt(d,(1150,725),'THREE SQUARES NOW EMPTY',24,fill='#517866',b=True)
  if mode in ['graduate','eight'] and late>.5:
   n=3 if mode=='graduate' else 1
   for j in range(n):cat(d,280+j*140,708,'o',True,scale=.85)
   txt(d,(80,642),'AVAILABLE POOL',23,b=True)
   txt(d,(80,784),'Retired kittens → box lid',24,fill=COL['muted'])
  if mode=='choice' and late>.5:
   for c,r in line:
    x,y=pos(c,r);d.ellipse((x-52,y-52,x+52,y+52),outline='#517866',width=5)
  if mode in ['win','eightcats'] and p>.99:
   d.rounded_rectangle((80,675,730,750),radius=28,fill='#517866');txt(d,(224,695),'ORANGE WINS',34,fill='white',b=True)
 # Supporting takeaway, fitted below headline and above legends.
 for j,l in enumerate(wrap(note,29,760)):txt(d,(80,540+j*40),l,29,b=False)
 # Animated phase label keeps the causal order readable without decorative motion.
 if mode not in ['setup','eight','choice']:
  phase='BEFORE' if t<1.2 else 'PLACE' if t<2.6 else 'BOOP' if t<3.9 else 'AFTER THE BOOPS'
  d.rounded_rectangle((1150,137,1600,175),radius=15,fill='#E4D9CF')
  txt(d,(1180,145),phase,20,b=True)
 # Progress rail and synchronized sentence-level subtitle.
 d.rectangle((80,961,1840,965),fill='#DDD1C8');d.rectangle((80,961,80+1760*(i+t/duration)/len(S),965),fill='#624967')
 sub=subtitle_at(i,t)
 size=31
 while len(wrap(sub,size,1760))>2:size-=1
 for j,l in enumerate(wrap(sub,size,1760)):txt(d,(80,981+j*37),l,size)
 if scene['id']=='junior':txt(d,(1040,944),'Game design: Scott Brady · Smirk & Dagger',18,fill=COL['muted'])
 return im

def readwav(p):
 with wave.open(str(p),'rb') as w:return np.frombuffer(w.readframes(w.getnframes()),dtype='<i2').astype(np.float32)/32768,w.getframerate()
timeline=[];subs=[];audio=[];offset=0
for i,s in enumerate(S):
 p=O/(s['id']+'.wav')
 if '--stills' in sys.argv and not p.exists():a=np.ones(len(s['text'].split())*9000,dtype=np.float32)*.01;sr=24000
 else:a,sr=readwav(p)
 assert sr==24000
 # Trim only outer silence. Preserve breaths and natural interior pauses.
 active=np.flatnonzero(np.abs(a)>.007)
 a=a[max(0,int(active[0])-2400):min(len(a),int(active[-1])+3600)]
 dur=len(a)/sr+1.2;timeline.append({'id':s['id'],'start':offset,'duration':dur,'voice_duration':len(a)/sr})
 sentences=__import__('re').split(r'(?<=[.!?])\s+',s['text']);weights=[len(x.split()) for x in sentences];total=sum(weights);cur=.45
 for sentence,weight in zip(sentences,weights):
  end=cur+(len(a)/sr)*weight/total;subs.append({'scene':i,'start':cur,'end':end,'text':sentence,'global_start':offset+cur,'global_end':offset+end});cur=end
 audio.append(np.concatenate([np.zeros(10800),a,np.zeros(round(dur*sr)-len(a)-10800)]));offset+=dur

def subtitle_at(i,t):
 for sub in subs:
  if sub['scene']==i and sub['start']<=t<sub['end']:return sub['text']
 return ''
base_cache=[base(s,i) for i,s in enumerate(S)]
(O/'timeline.json').write_text(json.dumps(timeline,indent=2))
def stamp(t):
 ms=round(t*1000);return f'{ms//3600000:02d}:{ms//60000%60:02d}:{ms//1000%60:02d},{ms%1000:03d}'
(O/'boop-rules.srt').write_text('\n\n'.join(f"{j+1}\n{stamp(s['global_start'])} --> {stamp(s['global_end'])}\n{s['text']}" for j,s in enumerate(subs)))
if '--stills' in sys.argv:
 for i,s in enumerate(S):
  for t in [1,4,timeline[i]['duration']*.78]:frame(s,i,t,timeline[i]['duration']).save(O/f"review-{i:02d}-{int(t):02d}.jpg",quality=93)
 print('Review stills ready');sys.exit()
full=np.concatenate(audio);peak=max(np.max(np.abs(full)),.01);full*=.85/peak
# Quiet custom plucked notes at chapter entrances, no continuous music under dense rules.
for scene in timeline:
 for k,f in enumerate([261.63,329.63,392]):
  at=round((scene['start']+.03+k*.10)*24000);n=7200;t=np.arange(n)/24000
  tone=.022*np.sin(2*np.pi*f*t)*np.exp(-t*14)
  full[at:at+n]+=tone[:len(full[at:at+n])]
with wave.open(str(O/'mix.wav'),'wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(24000);w.writeframes((np.clip(full,-1,1)*32767).astype('<i2').tobytes())
cmd=['/opt/homebrew/bin/ffmpeg','-hide_banner','-loglevel','warning','-y','-f','rawvideo','-pix_fmt','rgb24','-s','1920x1080','-r',str(FPS),'-i','-','-i',str(O/'mix.wav'),'-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-af','loudnorm=I=-18:TP=-1.5:LRA=7','-ar','48000','-c:a','aac','-b:a','192k','-movflags','+faststart','-shortest',str(O/'boop-rules.mp4')]
p=subprocess.Popen(cmd,stdin=subprocess.PIPE)
try:
 for i,s in enumerate(S):
  dur=timeline[i]['duration'];print(f"Rendering {i+1}/{len(S)} {s['id']} {dur:.1f}s",flush=True)
  for n in range(round(dur*FPS)):p.stdin.write(frame(s,i,n/FPS,dur).tobytes())
finally:p.stdin.close()
assert p.wait()==0
print(f'Finished {offset:.1f}s',flush=True)
