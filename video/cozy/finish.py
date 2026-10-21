"""Cozy TV packaging, original synthesized score, captions and final encode."""
import json,math,subprocess,wave,textwrap,sys
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).parent;OUT=ROOT/'outputs';FPS=24
script=json.loads((ROOT/'script.json').read_text());FF='/opt/homebrew/bin/ffmpeg'
def font(n,bold=False):return ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial'+(' Bold' if bold else '')+'.ttf',n)
def probe(p):return float(subprocess.check_output(['/opt/homebrew/bin/ffprobe','-v','quiet','-show_entries','format=duration','-of','csv=p=0',str(p)]))
def prepare():
    timeline=[];start=0
    for s in script['scenes']:
        # Consistent comfortable delivery; brevity comes from the tighter script.
        dst=OUT/(s['id']+'-paced.wav')
        subprocess.run([FF,'-v','error','-y','-i',str(OUT/(s['id']+'.wav')),'-af','atempo=0.94,apad=pad_dur=0.7','-ar','48000',str(dst)],check=True)
        frames=math.ceil(probe(dst)*FPS);dur=frames/FPS
        timeline.append({**s,'start':start,'duration':dur,'frames':frames});start+=dur
    (OUT/'timeline.json').write_text(json.dumps(timeline,indent=2));print('Duration',start,flush=True)
    assert 120<=start<=180, f'Need pacing repair: {start}'
    return timeline

def music(duration):
    sr=48000;n=math.ceil(duration*sr);audio=np.zeros(n,dtype=np.float32);beat=60/92
    # Original mellow major-seventh progression: FM keys, warm pad, soft pulse bass.
    chords=[[48,52,55,59],[45,48,52,55],[41,45,48,52],[43,47,50,55]]
    def note(m,start,length,amp,kind):
        lo=int(start*sr);hi=min(n,lo+int(length*sr));t=np.arange(hi-lo)/sr;hz=440*2**((m-69)/12)
        env=np.minimum(1,t/.035)*np.minimum(1,(length-t)/.22)
        if kind=='keys':x=np.sin(2*np.pi*hz*t+1.5*np.sin(2*np.pi*hz*2*t)*np.exp(-t*3))*np.exp(-t*1.7)
        elif kind=='bass':x=np.sin(2*np.pi*hz*t)+.18*np.sin(4*np.pi*hz*t)
        else:x=np.sin(2*np.pi*hz*t)+.25*np.sin(2*np.pi*hz*1.003*t)
        audio[lo:hi]+=x*env*amp
    for bar in range(math.ceil(duration/(beat*4))):
        st=bar*beat*4;ch=chords[bar%4]
        for m in ch:note(m+12,st,beat*4,.009,'pad')
        for b in range(4):
            if st+b*beat>=duration:continue
            note(ch[0]-12,st+b*beat,beat*.7,.030,'bass')
            note(ch[(b+bar)%4]+24,st+b*beat,beat*.85,.025,'keys')
    # Gentle analog percussion; deterministic noise, no copyrighted samples.
    rng=np.random.default_rng(80)
    for i in range(int(duration/beat)):
        lo=int(i*beat*sr);length=min(int(sr*.10),n-lo);t=np.arange(length)/sr
        audio[lo:lo+length]+=.017*np.sin(2*np.pi*(55*t+5*(1-np.exp(-t*40))))*np.exp(-t*35)
        if i%2:audio[lo:lo+length]+=.006*rng.normal(size=length)*np.exp(-t*45)
    fade=np.minimum(1,np.arange(n)/sr/2)*np.minimum(1,(n-np.arange(n))/sr/3);audio*=fade
    with wave.open(str(OUT/'music.wav'),'wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(sr);w.writeframes((audio.clip(-1,1)*32767).astype('<i2').tobytes())

def captions(s,t):
    sentences=s['text'].replace('’',"'").split('. ');total=sum(len(x) for x in sentences);at=0
    for x in sentences:
        end=at+len(x)/total*(s['duration']-.7)
        if t<end:return x.rstrip('.')+'.'
        at=end
    return sentences[-1]
def frame(s,f):
    t=f/FPS;im=Image.new('RGB',(1920,1080),'#f6ebd7');d=ImageDraw.Draw(im)
    # Warm public-access television graphics, not destructive VHS blur.
    d.rounded_rectangle((25,25,1895,1055),radius=32,outline='#36364f',width=6)
    for i,c in enumerate(['#d16d46','#d7a454','#8ea7a1']):d.rectangle((52,48+i*15,1868,58+i*15),fill=c)
    d.text((70,135),'BOOP',font=font(72,True),fill='#34354f');d.text((72,220),'COZY GAME NIGHT',font=font(24,True),fill='#a75a3c')
    y=335
    for line in textwrap.wrap(s['title'],17):d.text((70,y),line,font=font(47,True),fill='#34354f');y+=60
    tips={'setup':'8 kittens each\nCats stay in reserve','boop':'One square away\nAll eight directions','edge':'Back to the owner\nNot captured','limits':'Only placement pushes\nNo domino effect','graduate':'Cats go to your pool\nNot onto the board','strength':'Kitten → kittens\nCat → either type','mixed':'Same color, three pieces\nKeep eight active pieces','eight':'Choose one to return','choice':'Choose just one group','win':'After all pushes finish','welcome':'Two players. One cozy bed.','recap':'Ready? Your turn.'}
    for line in tips[s['id']].split('\n'):d.text((72,y+85),line,font=font(28),fill='#665869');y+=42
    raw=Image.open(OUT/s['id']/f'{f:05d}.png').convert('RGBA');src=Image.new('RGBA',raw.size,'#b8bcc9');src.alpha_composite(raw);src=src.convert('RGB');src=src.resize((1248,878),Image.Resampling.LANCZOS)
    im.paste(src,(610,118));d=ImageDraw.Draw(im);
    if s['id'] in ['graduate','mixed','eight'] and f/s['frames']>.80:
        d.rounded_rectangle((1090,830,1420,875),radius=12,fill='#f6ebd7');d.text((1255,852),'YOUR AVAILABLE POOL',font=font(23,True),fill='#a75a3c',anchor='mm')
    d.rounded_rectangle((603,111,1865,1003),radius=20,outline='#34354f',width=7)
    d.rounded_rectangle((50,910,1870,1030),radius=16,fill='#34354f')
    lines=textwrap.wrap(captions(s,t),94)
    for i,line in enumerate(lines):d.text((960,938+i*39),line,font=font(33),fill='#fff5df',anchor='mt')
    d.text((72,825),f'{script["scenes"].index(next(x for x in script["scenes"] if x["id"]==s["id"]))+1:02d} / 12',font=font(24),fill='#a75a3c')
    return im

def finish():
    tl=json.loads((OUT/'timeline.json').read_text());duration=sum(s['duration'] for s in tl);music(duration)
    narration=[]
    for s in tl:
        p=OUT/(s['id']+'-paced.wav');raw=subprocess.check_output([FF,'-v','error','-i',str(p),'-f','f32le','-ac','1','-ar','48000','-']);x=np.frombuffer(raw,dtype='<f4');n=round(s['duration']*48000);narration.append(np.pad(x,(0,max(0,n-len(x))))[:n])
    x=np.concatenate(narration)
    with wave.open(str(OUT/'narration.wav'),'wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(48000);w.writeframes((x.clip(-1,1)*32767).astype('<i2').tobytes())
    proc=subprocess.Popen([FF,'-v','error','-y','-f','rawvideo','-pixel_format','rgb24','-video_size','1920x1080','-framerate',str(FPS),'-i','-','-an','-c:v','libx264','-preset','fast','-crf','20','-pix_fmt','yuv420p','-r','24',str(OUT/'picture.mp4')],stdin=subprocess.PIPE)
    for s in tl:
        print('Packaging',s['id'],flush=True)
        for f in range(s['frames']):proc.stdin.write(frame(s,f).tobytes())
        frame(s,int(s['frames']*.48)).save(OUT/(s['id']+'-review.jpg'))
    proc.stdin.close();assert proc.wait()==0
    subprocess.run([FF,'-v','error','-y','-i',str(OUT/'picture.mp4'),'-i',str(OUT/'narration.wav'),'-i',str(OUT/'music.wav'),'-filter_complex','[2:a]volume=0.9[m];[1:a][m]amix=inputs=2:normalize=0,loudnorm=I=-18:TP=-1.5:LRA=7[a]','-map','0:v','-map','[a]','-c:v','copy','-c:a','aac','-b:a','192k','-ar','48000','-movflags','+faststart','-shortest',str(OUT/'boop-cozy-rules.mp4')],check=True)
    def stamp(t):
        ms=round(t*1000);h,ms=divmod(ms,3600000);m,ms=divmod(ms,60000);sec,ms=divmod(ms,1000);return f'{h:02}:{m:02}:{sec:02},{ms:03}'
    blocks=[]
    for s in tl:
        sentences=s['text'].replace('’',"'").split('. ');total=sum(len(z) for z in sentences);start=s['start']
        for sentence in sentences:
            end=start+len(sentence)/total*(s['duration']-.7)
            blocks.append(f'{len(blocks)+1}\n{stamp(start)} --> {stamp(end)}\n{sentence.rstrip(".")}.\n');start=end
    (OUT/'boop-cozy-rules.srt').write_text('\n'.join(blocks))
    print('FILM_OK',duration,flush=True)
if __name__=='__main__':prepare() if '--prepare' in sys.argv else finish()
