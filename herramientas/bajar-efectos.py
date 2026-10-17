"""Baja de Freesound los efectos de efectos.txt (todos con licencia CC0), los prepara
y escribe public/efectos.json con las tomas y los créditos.

    python herramientas/bajar-efectos.py

- golpe: se quita el silencio inicial, se limita a 12 s y se normaliza el pico.
- ambiente: se toma hasta minuto y medio y se iguala el volumen; el bucle con fundido
  cruzado lo hace el navegador.
- pulso: se mide el periodo, se corta 30 ms antes de un golpe y el bucle dura un número
  entero de periodos, para que no pierda el compás. En efectos.json va su duración.

Usa las previsualizaciones de alta calidad (MP3 de 128 kbps), que no piden cuenta.
Necesita curl, numpy y ffmpeg (sirve el de `pip install imageio-ffmpeg`)."""
import html, json, pathlib, re, subprocess, tempfile, urllib.parse
import numpy as np

RAIZ = pathlib.Path(__file__).resolve().parent.parent
DESTINO = RAIZ / "public" / "efectos"
TASA = 44100

try:
    import imageio_ffmpeg
    FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
except ImportError:
    FFMPEG = "ffmpeg"

def curl(url):
    return subprocess.run(["curl", "-sSfL", "-A", "Mozilla/5.0", url], capture_output=True, check=True).stdout

def ficha(id_):
    pagina = curl(f"https://freesound.org/s/{id_}/").decode("utf-8", "replace")
    dato = lambda k: html.unescape(re.search(k + r'="([^"]*)"', pagina)[1])
    licencia = re.search(r'creativecommons\.org/(publicdomain/zero|licenses/[a-z-]+)/[\d.]+', pagina)[0]
    assert "publicdomain/zero" in licencia, f"{id_} no es CC0: {licencia}"
    mp3 = dato("data-mp3").replace("-lq.mp3", "-hq.mp3")
    autor = urllib.parse.unquote(re.search(rf'/people/([^/"]+)/sounds/{id_}/', pagina)[1])
    return {"id": id_, "titulo": dato("data-title"), "autor": autor,
            "url": f"https://freesound.org/s/{id_}/", "mp3": mp3}

def leer(fichero):
    crudo = subprocess.run([FFMPEG, "-v", "error", "-i", str(fichero), "-ac", "2", "-ar", str(TASA), "-f", "f32le", "-"],
                           capture_output=True, check=True).stdout
    return np.frombuffer(crudo, dtype=np.float32).reshape(-1, 2).copy()

def escribir(datos, fichero):
    with tempfile.NamedTemporaryFile(suffix=".raw", delete=False) as t:
        t.write(datos.astype(np.float32).tobytes())
    subprocess.run([FFMPEG, "-v", "error", "-y", "-f", "f32le", "-ar", str(TASA), "-ac", "2", "-i", t.name,
                    "-codec:a", "libmp3lame", "-b:a", "160k", str(fichero)], check=True)
    pathlib.Path(t.name).unlink()

def envolvente(d, ventana=0.01):
    n = int(TASA * ventana)
    m = np.abs(d).max(axis=1)
    return np.convolve(m, np.ones(n) / n, mode="same")

def preparar(tipo, d):
    extra = {}
    if tipo == "golpe":
        env = envolvente(d)
        inicio = max(0, int(np.argmax(env > env.max() * 0.02)) - int(TASA * 0.01))
        d = d[inicio:inicio + TASA * 12]
        cola = min(len(d), int(TASA * 0.3))
        d[-cola:] *= np.linspace(1, 0, cola)[:, None]
        d = d / np.abs(d).max() * 0.89
    elif tipo == "ambiente":
        d = d[int(TASA * 1):int(TASA * 91)]
        rms = np.sqrt((d ** 2).mean())
        d = np.clip(d * (0.08 / rms), -0.95, 0.95)
    else:  # pulso
        env = envolvente(d, 0.005)
        # Periodo por autocorrelación de la envolvente, entre 0,5 y 2,5 s.
        e = env[: TASA * 30] - env[: TASA * 30].mean()
        ac = np.correlate(e[::40], e[::40], mode="full")[len(e[::40]) - 1:]
        lo, hi = int(TASA * 0.5 / 40), int(TASA * 2.5 / 40)
        periodo = (lo + int(np.argmax(ac[lo:hi]))) * 40
        # Del pico más fuerte de los primeros 3 s al pico que cae cerca de N periodos después.
        a = int(np.argmax(env[: TASA * 3]))
        n = max(1, int((TASA * 40) // periodo))
        while a + n * periodo + periodo // 4 > len(d) - TASA:
            n -= 1
        c = a + n * periodo
        b = c - periodo // 4 + int(np.argmax(env[c - periodo // 4: c + periodo // 4]))
        margen = int(TASA * 0.03)
        d = d[a - margen: b - margen + TASA // 2]
        rms = np.sqrt((d[: b - a] ** 2).mean())
        d = np.clip(d * (0.12 / rms), -0.95, 0.95)
        extra["bucle"] = round((b - a) / TASA, 4)
        extra["periodo"] = round(periodo / TASA, 3)
    return d, extra

DESTINO.mkdir(parents=True, exist_ok=True)
indice = {}
for linea in (RAIZ / "herramientas" / "efectos.txt").read_text(encoding="utf-8").splitlines():
    if not linea.strip() or linea.startswith("#"):
        continue
    clave, tipo, ids = linea.split("|")
    tomas = []
    for n, id_ in enumerate(ids.split(",")):
        fichero = DESTINO / f"{clave}-{n}.mp3"
        f = ficha(id_)
        print(clave, n, f["titulo"], "·", f["autor"], flush=True)
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as t:
            t.write(curl(f["mp3"]))
        d, extra = preparar(tipo, leer(t.name))
        pathlib.Path(t.name).unlink()
        escribir(d, fichero)
        tomas.append({"f": f"efectos/{fichero.name}", "d": round(len(d) / TASA, 2), **extra,
                      "credito": {k: f[k] for k in ("titulo", "autor", "url")}})
    indice[clave] = {"tipo": tipo, "tomas": tomas}

(RAIZ / "public" / "efectos.json").write_text(json.dumps(indice, ensure_ascii=False, indent=1), encoding="utf-8")
total = sum(p.stat().st_size for p in DESTINO.glob("*.mp3"))
print(f"{sum(len(v['tomas']) for v in indice.values())} tomas, {total / 1e6:.1f} MB")
