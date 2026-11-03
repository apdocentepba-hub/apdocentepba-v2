"""Reel original APDocentePBA: screenshots de páginas PÚBLICAS, cero datos de alumnos/docentes.
Salida MP4 vertical para publicación exclusiva en @apdocentepba.
NO toca index.html, Worker, base de datos ni usuarios.
"""
from __future__ import annotations
import asyncio, hashlib, json, math, subprocess, wave
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageStat, ImageFilter
from playwright.async_api import async_playwright

ROOT=Path(__file__).resolve().parent
CAP=ROOT/"capturas"
FRAMES=ROOT/"escenas"
W,H,FPS=1080,1920,30
SECONDS=3.3
OVERLAP=.38
FONT="/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
BOLD="/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
WHITE=(241,250,252)
TEAL=(70,235,209)
MUTED=(187,216,228)
NAVY=(5,24,38)
PAGES={
  "portada":"https://alertasapd.com.ar/",
  "empezar":"https://alertasapd.com.ar/empezar.html",
  "herramientas":"https://alertasapd.com.ar/herramientas-docentes.html",
}

def font(size,bold=False):return ImageFont.truetype(BOLD if bold else FONT,size)

async def capture():
  CAP.mkdir(parents=True,exist_ok=True)
  async with async_playwright() as pw:
    browser=await pw.chromium.launch(args=["--no-sandbox"])
    try:
      for key,url in PAGES.items():
        page=await browser.new_page(viewport={"width":390,"height":844},device_scale_factor=1.5,is_mobile=True,has_touch=True,reduced_motion="reduce",locale="es-AR")
        response=await page.goto(url,wait_until="domcontentloaded",timeout=45000)
        if response is None or response.status>=400:raise RuntimeError("Public screenshot failed "+key)
        await page.wait_for_timeout(1100)
        await page.screenshot(path=str(CAP/(key+".png")),animations="disabled",full_page=False)
        await page.close()
    finally:
      await browser.close()
  for key in PAGES:
    p=CAP/(key+".png")
    with Image.open(p) as im:
      sd=ImageStat.Stat(im.convert("RGB")).stddev
      if im.width<390 or im.height<800 or max(sd)<10:raise RuntimeError("Screenshot blank "+str(p))
      print("PUBLIC_CAPTURE_OK",key,im.size,[round(v,1) for v in sd],flush=True)

def panel(i):
  t=Image.new("RGB",(W,H),NAVY)
  dr=ImageDraw.Draw(t)
  for y in range(H):
    c=(6+int(8*(1-y/H)), 27+int(15*(1-y/H)), 40+int(17*(1-y/H)))
    dr.line((0,y,W,y),fill=c)
  for n in range(14):
    x=80+n*81
    dr.line((x,210,x-260,1460),fill=(15,56,67),width=2)
  dr.rounded_rectangle((46,49,1034,1868),radius=48,outline=(39,105,116),width=3)
  dr.text((92,88),"◉  APDOCENTE PBA",font=font(40,True),fill=TEAL)
  dr.text((94,1703),"PLATAFORMA INDEPENDIENTE",font=font(28,True),fill=MUTED)
  dr.text((94,1752),"Las ofertas y postulaciones se verifican en ABC",font=font(21),fill=MUTED)
  dr.text((94,1810),"@apdocentepba  ·  alertasapd.com.ar",font=font(22,True),fill=TEAL)
  return t

def text(draw,strings,start=230,size=67,hi=None):
  y=start
  for s in strings:
    color=TEAL if s==hi else WHITE
    draw.text((90,y),s,font=font(size,True),fill=color)
    y+=size+22
  return y

def label(draw,word,x=94,y=520):
  f=font(24,True)
  bb=draw.textbbox((0,0),word,font=f)
  ww=bb[2]+54
  draw.rounded_rectangle((x,y,x+ww,y+57),radius=17,fill=(22,74,78),outline=(65,151,148),width=2)
  draw.text((x+27,y+13),word,font=f,fill=TEAL)

def footer(draw,lines,y=1557):
  for line in lines:
    draw.text((97,y),line,font=font(31,True),fill=WHITE)
    y+=56

def crop(im,w,h):
  z=max(w/im.width,h/im.height)
  out=im.resize((round(im.width*z),round(im.height*z)),Image.Resampling.LANCZOS)
  dx=(out.width-w)//2
  dy=(out.height-h)//2
  return out.crop((dx,dy,dx+w,dy+h))

def mobile(image,screen,x=220,y=630,width=640,height=950):
  shadow=Image.new("RGBA",(width+100,height+118),(0,0,0,0))
  d=ImageDraw.Draw(shadow)
  d.rounded_rectangle((36,26,width+68,height+88),radius=58,fill=(0,0,0,154))
  shadow=shadow.filter(ImageFilter.GaussianBlur(18))
  image.paste(shadow,(x-45,y-43),shadow)
  d=ImageDraw.Draw(image)
  d.rounded_rectangle((x-15,y-16,x+width+15,y+height+20),radius=52,fill=(14,20,29),outline=TEAL,width=5)
  inner=crop(screen,width-30,height-40)
  mask=Image.new("L",inner.size,0)
  ImageDraw.Draw(mask).rounded_rectangle((0,0,inner.width-1,inner.height-1),radius=27,fill=255)
  image.paste(inner,(x+15,y+21),mask)
  d.rounded_rectangle((x+int(width*.40),y-6,x+int(width*.60),y+7),radius=6,fill=(54,83,93))

def one(screens):
  im=panel(0);d=ImageDraw.Draw(im)
  text(d,["¿BUSCÁS CARGOS","O MATERIAS","EN PBA?"],220,69,hi="EN PBA?")
  label(d,"MIRÁ CÓMO ORGANIZARTE",y=540)
  mobile(im,screens["empezar"],x=225,y=665,width=630,height=900)
  footer(ImageDraw.Draw(im),["Una búsqueda más clara","empieza por tus preferencias."],1610)
  return im

def two(screens):
  im=panel(1);d=ImageDraw.Draw(im)
  text(d,["1. ELEGÍ","TUS DISTRITOS"],235,76,hi="TUS DISTRITOS")
  label(d,"CARGOS · MATERIAS · NIVEL · TURNO",y=460)
  mobile(im,screens["empezar"],x=225,y=615,width=630,height=970)
  footer(ImageDraw.Draw(im),["Configurá lo que querés buscar."],1612, )
  return im

def three(screens):
  im=panel(2);d=ImageDraw.Draw(im)
  text(d,["2. CONSULTÁ","TUS ALERTAS"],235,76,hi="TUS ALERTAS")
  label(d,"SEGÚN TU PLAN",y=472)
  # Esquema creado para explicar filtros; NO representa ofertas en tiempo real.
  d.rounded_rectangle((119,642,961,1490),radius=44,fill=(13,53,68),outline=TEAL,width=5)
  d.text((169,696),"MIS PREFERENCIAS",font=font(47,True),fill=WHITE)
  for k,(name,description) in enumerate([
      ("DISTRITO","Elegí tu zona"),
      ("CARGO O MATERIA","Definí qué buscás"),
      ("NIVEL / TURNO","Adaptalo a tu disponibilidad")]):
      y=802+k*197
      d.rounded_rectangle((159,y,919,y+162),radius=24,fill=(24,84,96),outline=(56,145,143),width=2)
      d.text((195,y+22),name,font=font(34,True),fill=TEAL)
      d.text((195,y+86),description,font=font(27),fill=WHITE)
  d.text((167,1437),"ESQUEMA ILUSTRATIVO",font=font(27,True),fill=MUTED)
  footer(ImageDraw.Draw(im),["Revisá las alertas disponibles","para tu cuenta y preferencias."],1574)
  return im

def four(screens):
  im=panel(3);d=ImageDraw.Draw(im)
  text(d,["3. VERIFICÁ","SIEMPRE EN ABC"],225,67,hi="SIEMPRE EN ABC")
  label(d,"ANTES DE POSTULARTE",y=474)
  mobile(im,screens["herramientas"],x=225,y=625,width=630,height=960)
  footer(ImageDraw.Draw(im),["Plazos, requisitos, situación","de revista y horario."],1610)
  return im

def five(screens):
  im=panel(4);d=ImageDraw.Draw(im)
  text(d,["ALERTAS APD","+ RECURSOS","DOCENTES"],229,71,hi="DOCENTES")
  label(d,"PID · LISTADOS · GUÍAS",y=524)
  mobile(im,screens["empezar"],x=225,y=650,width=630,height=900)
  footer(ImageDraw.Draw(im),["Una ayuda para organizarte.","No reemplaza sistemas oficiales."],1600)
  return im

def six(screens):
  im=panel(5);d=ImageDraw.Draw(im)
  text(d,["EMPEZÁ A","ORGANIZAR","TU BÚSQUEDA"],228,72,hi="TU BÚSQUEDA")
  mobile(im,screens["empezar"],x=225,y=650,width=630,height=785)
  d=ImageDraw.Draw(im)
  d.rounded_rectangle((84,1515,996,1640),radius=28,fill=TEAL)
  d.text((126,1552),"ENTRÁ DESDE EL PERFIL",font=font(45,True),fill=NAVY)
  return im

def make_scenes():
  FRAMES.mkdir(parents=True,exist_ok=True)
  screens={k:Image.open(CAP/(k+".png")).convert("RGB") for k in PAGES}
  images=[one(screens),two(screens),three(screens),four(screens),five(screens),six(screens)]
  for i,im in enumerate(images):
    p=FRAMES/f"step_{i:02}.jpg"
    im.save(p,quality=91,subsampling=0)
    print("SCENE_OK",p.name,p.stat().st_size,flush=True)
  board=Image.new("RGB",(960,1140),NAVY)
  for i,im in enumerate(images):
    thumb=im.resize((300,533),Image.Resampling.LANCZOS)
    board.paste(thumb,(10+320*(i%3),10+560*(i//3)))
  board.save(ROOT/"contact_sheet.jpg",quality=91)

def make_music(duration):
  rate=32000
  t=np.arange(round((duration+.1)*rate),dtype=np.float64)/rate
  out=np.zeros(t.size)
  chords=[(164.81,196,246.94),(146.83,174.61,220),(174.61,220,261.63),(130.81,164.81,196)]
  for i,chord in enumerate(chords):
    start=i*4.15;end=min((i+1)*4.15,duration)
    ix=(t>=start)&(t<end)
    local=t[ix]-start
    amp=np.clip(np.minimum(local/.22,(end-start-local)/.36),0,1)
    out[ix]+=amp*sum(np.sin(2*np.pi*v*local)*.11+np.sin(2*np.pi*(v/2)*local)*.065 for v in chord)
  beat=60/104
  rng=np.random.default_rng(3103)
  for k in range(round(duration/beat)+1):
    st=int(k*beat*rate)
    if st>=out.size:break
    n=min(int(.14*rate),out.size-st)
    local=np.arange(n)/rate
    wave_kick=.43*np.sin(2*np.pi*(72-30*local)*local)*np.exp(-local*22)
    out[st:st+n]+=wave_kick
    if k%2:
      out[st:st+n]+=rng.normal(0,.075,n)*np.exp(-local*42)
  out=np.tanh(out*.8)*np.minimum(1,t/.3)*np.clip((duration-t)/.65,0,1)
  out=np.clip(out,-.64,.64)
  raw=(np.stack([out,out*.97],axis=1)*32767).astype(np.int16)
  f=ROOT/"original_soundtrack.wav"
  with wave.open(str(f),"wb") as a:
    a.setframerate(rate);a.setnchannels(2);a.setsampwidth(2);a.writeframes(raw.tobytes())
  return f

def export():
  pieces=6
  duration=pieces*SECONDS-(pieces-1)*OVERLAP
  sound=make_music(duration)
  args=[];graph=[]
  for k in range(pieces):
    args+=["-loop","1","-framerate",str(FPS),"-t",str(SECONDS),"-i",str(FRAMES/f"step_{k:02}.jpg")]
    graph.append(f"[{k}:v]scale={W}:{H},setsar=1,format=yuv420p,trim=duration={SECONDS},setpts=PTS-STARTPTS[v{k}]")
  prev="v0"
  for k in range(1,pieces):
    target=f"t{k}"
    off=(SECONDS-OVERLAP)*k
    graph.append(f"[{prev}][v{k}]xfade=transition=fade:duration={OVERLAP}:offset={off:.2f}[{target}]")
    prev=target
  out=ROOT/"apdocentepba_reel_como_empezar.mp4"
  cmd=["ffmpeg","-y","-hide_banner","-loglevel","error",*args,"-i",str(sound),"-filter_complex",";".join(graph),"-map",f"[{prev}]","-map",f"{pieces}:a","-c:v","libx264","-pix_fmt","yuv420p","-r",str(FPS),"-preset","veryfast","-crf","22","-c:a","aac","-b:a","128k","-ar","44100","-movflags","+faststart","-t",str(duration),str(out)]
  subprocess.run(cmd,check=True,timeout=180)
  info=json.loads(subprocess.check_output(["ffprobe","-v","error","-show_format","-show_streams","-of","json",str(out)],text=True))
  v=next(x for x in info["streams"] if x["codec_type"]=="video")
  a=next(x for x in info["streams"] if x["codec_type"]=="audio")
  assert (int(v["width"]),int(v["height"]))==(W,H)
  assert v["codec_name"]=="h264" and a["codec_name"]=="aac"
  d=float(info["format"]["duration"])
  assert 17<=d<=19,(d,duration)
  assert 600000<=out.stat().st_size<=50000000
  checks={"brand":"APDocentePBA","instagram":"@apdocentepba","source_public_only":PAGES,"caption_promise":"organize preferences and review alerts according to plan; official application in ABC","video_type":"REEL","width":W,"height":H,"fps":FPS,"duration_seconds":d,"bytes":out.stat().st_size,"sha256":hashlib.sha256(out.read_bytes()).hexdigest(),"audio":"original synthesized music without third-party tracks","examples":"No live ABC offers or user accounts shown; page previews are public and illustrative","warning":"independent service, not DGCyE; alert != appointment or official application"}
  (ROOT/"manifest.json").write_text(json.dumps(checks,indent=2,ensure_ascii=False)+"\n",encoding="utf8")
  print("VIDEO_VERIFIED",json.dumps(checks,ensure_ascii=False),flush=True)
def main():
  ROOT.mkdir(parents=True,exist_ok=True)
  asyncio.run(capture())
  make_scenes()
  export()
if __name__=="__main__":main()
