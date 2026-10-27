#!/usr/bin/env python3
"""Extract per-frame video PTS, encoded last-rAF clock and approximate orange token x.

Requires ffmpeg, ffprobe and numpy. Output is diagnostic: the clock is
updated on rAF, may be stale relative to the video, and token color detection
is a heuristic which must be checked against video frames.
"""
import json, subprocess, sys, zipfile
from pathlib import Path
import numpy as np

source = Path(sys.argv[1])
if source.is_dir():
    with zipfile.ZipFile(source / 'trace.zip') as archive:
        for line in archive.read('test.trace').splitlines():
            entry = json.loads(line)
            for attachment in entry.get('attachments', []):
                if attachment.get('name') == 'glide-timing.json':
                    evidence = json.loads(archive.read('resources/' + attachment['sha1']))
    video = str(source / 'video.webm')
else:
    video = str(source)
    evidence = json.loads(Path(sys.argv[2]).read_text())['evidence']
probe = subprocess.check_output(['ffprobe','-v','error','-select_streams','v:0','-show_entries','frame=best_effort_timestamp_time','-of','csv=p=0',video],text=True)
pts = [float(line) for line in probe.splitlines() if line.strip()]
proc = subprocess.Popen(['ffmpeg','-v','error','-i',video,'-vsync','0','-f','rawvideo','-pix_fmt','rgb24','-'],stdout=subprocess.PIPE)
width,height=390,844
known = {int(frame['time']):frame for frame in evidence['frames']}
y0=max(0,int(evidence['originRect']['y'])); y1=min(height,int(evidence['originRect']['y']+evidence['originRect']['height']))
rows=[]
for index, timestamp in enumerate(pts):
    raw=proc.stdout.read(width*height*3)
    if len(raw)!=width*height*3: raise RuntimeError('short video frame')
    pixels=np.frombuffer(raw,dtype=np.uint8).reshape(height,width,3)
    clock=sum(1<<i for i in range(20) if int(pixels[8,i*8+4].sum(dtype=np.int64))>390)
    previous=known.get(clock)
    rgb=pixels[y0:y1].astype(np.int16)
    r,g,b=rgb[:,:,0],rgb[:,:,1],rgb[:,:,2]
    mask=(r>170)&(g>100)&(b>80)&(5*r>6*g)&(100*g>108*b)&(2*r>3*b)
    columns=mask.sum(axis=0)
    window=44
    scores=np.convolve(columns,np.ones(window,dtype=int),'valid')
    x=int(np.argmax(scores)); score=int(scores[x])
    rows.append({'frame':index,'video_pts_ms':round(timestamp*1000,1),
                 'last_raf_clock_ms':clock if previous else None,'last_raf_x':previous['x'] if previous else None,
                 'last_raf_pose':previous['pose'] if previous else None,'orange_window_x':x if score>=120 else None,
                 'orange_pixels':score})
proc.stdout.close();proc.wait()
result={'video':Path(video).name,'evidence':evidence,'frames':rows,
        'limits':'Video PTS and the encoded last-rAF clock are distinct; the clock can remain stale. Orange-window position is an unverified color heuristic.'}
print(json.dumps(result,ensure_ascii=False,indent=2))
