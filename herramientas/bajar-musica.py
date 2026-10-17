"""Baja de incompetech.com las pistas de pistas.txt, las recomprime a MP3 de 96 kbps
y escribe public/pistas.json con título, duración y escena de cada una.

    python herramientas/bajar-musica.py

Necesita curl y ffmpeg (sirve el de `pip install imageio-ffmpeg`). Las pistas ya bajadas no se repiten."""
import json, pathlib, re, subprocess, urllib.parse

RAIZ = pathlib.Path(__file__).resolve().parent.parent
DESTINO = RAIZ / "public" / "musica"
ORIGEN = "https://incompetech.com/music/royalty-free/mp3-royaltyfree/"

try:
    import imageio_ffmpeg
    FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
except ImportError:
    FFMPEG = "ffmpeg"

def nombre(titulo):
    return re.sub(r"[^a-z0-9]+", "-", titulo.lower()).strip("-")

def duracion(fichero):
    salida = subprocess.run([FFMPEG, "-i", str(fichero)], capture_output=True, text=True).stderr
    h, m, s = re.search(r"Duration: (\d+):(\d+):([\d.]+)", salida).groups()
    return round(int(h) * 3600 + int(m) * 60 + float(s), 1)

DESTINO.mkdir(parents=True, exist_ok=True)
pistas, escenas = {}, {}
for linea in (RAIZ / "herramientas" / "pistas.txt").read_text(encoding="utf-8").splitlines():
    if not linea.strip() or linea.startswith("#"):
        continue
    escena, nivel, titulo = linea.split("|")
    clave = nombre(titulo)
    final = DESTINO / f"{clave}.mp3"
    if not final.exists():
        bruto = DESTINO / f"{clave}.orig.mp3"
        print("bajando", titulo, flush=True)
        subprocess.run(["curl", "-sSfL", "-o", str(bruto), ORIGEN + urllib.parse.quote(titulo) + ".mp3"], check=True)
        subprocess.run([FFMPEG, "-v", "error", "-y", "-i", str(bruto), "-map_metadata", "-1",
                        "-codec:a", "libmp3lame", "-b:a", "96k", str(final)], check=True)
        bruto.unlink()
    pistas[clave] = {"t": titulo, "a": "Kevin MacLeod", "d": duracion(final)}
    destino = escenas.setdefault(escena, [] if nivel == "-" else [[], [], [], []])
    (destino if nivel == "-" else destino[int(nivel)]).append(clave)

(RAIZ / "public" / "pistas.json").write_text(
    json.dumps({"pistas": pistas, "escenas": escenas}, ensure_ascii=False, indent=1), encoding="utf-8")
total = sum(f.stat().st_size for f in DESTINO.glob("*.mp3"))
print(f"{len(pistas)} pistas, {total / 1e6:.0f} MB")
