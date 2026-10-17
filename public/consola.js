"use strict";

/* La consola: escenas con cuatro niveles de intensidad (cada nivel, su lista de pistas),
   el gramófono, los ambientes, los golpes y las tiradas. Todo pasa por Web Audio:

   escenas ─┐
   gramófono ┼─ maestro ─ compresor ─ altavoces
   ambiente ─┤
   golpes ───┘ (y la reverb, que reciben los golpes) */

const ESCENAS = {
  investigacion: { nombre: "Investigación", sub: "La cama de fondo. Déjala sonar toda la sesión.", niveles: ["Calma", "Algo no encaja", "Inquietud", "El cerco se cierra"], nivel: 0.75 },
  mitos: { nombre: "Lo innombrable", sub: "El contacto con lo que no debería existir.", niveles: ["Extrañeza", "Presencia", "Manifestación", "Ruptura"], nivel: 0.85 },
  accion: { nombre: "Combate", sub: "Puños, pistolas y dinamita.", niveles: ["Tensión", "Refriega", "Tiroteo", "A la desesperada"], nivel: 0.9 },
  persecucion: { nombre: "Persecución", sub: "Huir, o ser quien caza.", niveles: ["Escabullirse", "Os siguen", "Ganan terreno", "En los talones"], nivel: 0.9 },
  respiro: { nombre: "Respiro", sub: "Pausas, curas y lo que queda después.", niveles: ["Calma", "Recuerdo", "Pesar", "Duelo"], nivel: 0.7 },
};

const DISCOS = {
  "maple-leaf-rag": ["Maple Leaf Rag", "Ragtime · Joplin"],
  "the-entertainer": ["The Entertainer", "Ragtime · Joplin"],
  "fig-leaf-rag": ["Fig Leaf Rag", "Ragtime · Joplin"],
  "hot-swing": ["Hot Swing", "Jazz de salón"],
  "gaslamp-funworks": ["Gaslamp Funworks", "Feria y verbena"],
  "tango-de-manzana": ["Tango de Manzana", "Tango"],
  "night-on-the-docks-sax": ["Night on the Docks", "Saxo nocturno"],
  "gymnopedie-no-1": ["Gymnopédie n.º 1", "Piano · Satie"],
  "danse-macabre": ["Danse macabre", "Orquesta · Saint-Saëns"],
  "hall-of-the-mountain-king": ["En la gruta del rey de la montaña", "Orquesta · Grieg"],
  "ibn-al-noor": ["Ibn Al-Noor", "Norte de África"],
  "desert-city": ["Desert City", "Norte de África"],
};

const TECLAS_GOLPES = ["q", "w", "e", "r", "t", "y"];
const FUNDIDO = 3; // segundos al cambiar de escena o de nivel

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const guardado = (() => {
  try {
    return JSON.parse(localStorage.getItem("consola") || "{}");
  } catch (_) {
    return {};
  }
})();
function guardar() {
  try {
    localStorage.setItem("consola", JSON.stringify(guardado));
  } catch (_) {}
}

let ctx, maestro, buses, biblioteca;
const estado = {
  escena: null, // la que suena, o null
  ultima: "investigacion",
  niveles: Object.fromEntries(Object.keys(ESCENAS).map((k) => [k, 0])),
  posiciones: {}, // "escena/nivel" -> { i, t }: cada lista sigue donde se dejó
  pausada: false,
  plato: null, // pista del gramófono
  inicio: null,
};
const listas = {};

/* ---------- arranque del audio ---------- */

function arrancarAudio() {
  if (ctx) return ctx.resume();
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  const compresor = ctx.createDynamicsCompressor();
  compresor.threshold.value = -14;
  compresor.ratio.value = 3;
  maestro = ctx.createGain();
  maestro.gain.value = guardado.maestro ?? 0.8;
  maestro.connect(compresor).connect(ctx.destination);

  const bus = (v) => {
    const g = ctx.createGain();
    g.gain.value = v;
    g.connect(maestro);
    return g;
  };
  buses = {
    escenas: bus(guardado.vMusica ?? 0.9),
    gramofono: bus(guardado.vGramofono ?? 0.8),
    ambiente: bus(guardado.vAmbiente ?? 0.7),
    golpes: bus(guardado.vGolpes ?? 0.9),
  };
  const reverb = ctx.createConvolver();
  reverb.normalize = true;
  reverb.connect(buses.golpes);
  buses.reverb = ctx.createGain();
  buses.reverb.connect(reverb);
  Sintes.iniciar(ctx, buses);
  reverb.buffer = Sintes.respuestaReverb();
  estado.inicio = Date.now();
  return ctx.resume();
}

/* ---------- reproductores ---------- */

// Un <audio> con su ganancia, para hacer fundidos sin cortes.
class Reproductor {
  constructor(destino) {
    this.audio = new Audio();
    this.audio.preload = "auto";
    this.fuente = ctx.createMediaElementSource(this.audio);
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.fuente.connect(this.gain).connect(destino);
  }
  cargar(clave, desde = 0) {
    this.clave = clave;
    this.audio.src = `/musica/${clave}.mp3`;
    this.audio.currentTime = desde;
    const promesa = this.audio.play();
    if (promesa) promesa.catch(() => {});
  }
  fundir(nivel, segundos = FUNDIDO) {
    const g = this.gain.gain;
    g.cancelScheduledValues(ctx.currentTime);
    g.setValueAtTime(g.value, ctx.currentTime);
    g.linearRampToValueAtTime(nivel, ctx.currentTime + segundos);
  }
  apagar(segundos = FUNDIDO) {
    this.fundir(0, segundos);
    clearTimeout(this.reposo);
    this.reposo = setTimeout(() => this.audio.pause(), segundos * 1000 + 100);
  }
  despertar() {
    clearTimeout(this.reposo);
  }
}

const mezcla = { actual: null, libres: [] };

function reproductorLibre() {
  return mezcla.libres.pop() || new Reproductor(buses.escenas);
}

function barajar(lista) {
  const a = [...lista];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function lista(escena, nivel) {
  const k = `${escena}/${nivel}`;
  listas[k] ||= barajar(biblioteca.escenas[escena][nivel]);
  return listas[k];
}

function guardarPosicion() {
  const r = mezcla.actual;
  if (!r || !r.lugar) return;
  estado.posiciones[r.lugar] = { i: r.indice, t: r.audio.currentTime };
}

// Pone a sonar la escena y el nivel indicados con un fundido cruzado.
function sonar(escena, nivel, segundos = FUNDIDO) {
  guardarPosicion();
  const anterior = mezcla.actual;
  if (anterior) {
    anterior.apagar(segundos);
    setTimeout(() => mezcla.libres.push(anterior), segundos * 1000 + 200);
  }
  const lugar = `${escena}/${nivel}`;
  const pos = estado.posiciones[lugar] || { i: 0, t: 0 };
  const r = reproductorLibre();
  r.despertar();
  r.lugar = lugar;
  r.indice = pos.i;
  r.audio.onended = () => siguiente(r);
  r.cargar(lista(escena, nivel)[pos.i], pos.t);
  r.fundir(volumenEscena(escena, nivel), segundos);
  mezcla.actual = r;
  estado.escena = escena;
  estado.ultima = escena;
  estado.pausada = false;
  pintar();
}

function siguiente(r) {
  if (r !== mezcla.actual) return;
  const [escena, nivel] = r.lugar.split("/");
  const l = lista(escena, +nivel);
  r.indice = (r.indice + 1) % l.length;
  r.cargar(l[r.indice], 0);
  pintar();
}

// El nivel también empuja un poco el volumen: de -20 % abajo a +20 % arriba.
function volumenEscena(escena, nivel) {
  return ESCENAS[escena].nivel * (0.8 + nivel * 0.4 / 3);
}

function pulsarEscena(escena) {
  arrancarAudio();
  if (estado.escena === escena && !estado.pausada) return pausar();
  if (estado.escena === escena && estado.pausada && mezcla.actual.lugar === `${escena}/${estado.niveles[escena]}`) {
    estado.pausada = false;
    mezcla.actual.despertar();
    mezcla.actual.audio.play();
    mezcla.actual.fundir(volumenEscena(escena, estado.niveles[escena]), 1.5);
    return pintar();
  }
  sonar(escena, estado.niveles[escena]);
}

function pausar(segundos = 1.5) {
  if (!mezcla.actual || estado.pausada) return;
  mezcla.actual.apagar(segundos);
  estado.pausada = true;
  pintar();
}

function cambiarNivel(escena, nivel) {
  nivel = Math.max(0, Math.min(3, nivel));
  if (estado.niveles[escena] === nivel) return;
  estado.niveles[escena] = nivel;
  if (estado.escena === escena && !estado.pausada) sonar(escena, nivel);
  else pintar();
}

/* ---------- gramófono ---------- */

const plato = {};

function montarPlato() {
  if (plato.r) return;
  // Bocina de gramófono: sin graves ni agudos, algo de saturación y el crujido del disco.
  const entrada = ctx.createGain();
  plato.r = new Reproductor(entrada);
  plato.r.gain.gain.value = 1;
  plato.efecto = ctx.createGain();
  plato.limpio = ctx.createGain();
  const graves = ctx.createBiquadFilter();
  graves.type = "highpass";
  graves.frequency.value = 280;
  const agudos = ctx.createBiquadFilter();
  agudos.type = "lowpass";
  agudos.frequency.value = 3800;
  const bocina = ctx.createBiquadFilter();
  bocina.type = "peaking";
  bocina.frequency.value = 1400;
  bocina.gain.value = 5;
  const sat = ctx.createWaveShaper();
  const curva = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) {
    const x = i / 511.5 - 1;
    curva[i] = Math.tanh(x * 1.8) / Math.tanh(1.8);
  }
  sat.curve = curva;
  plato.salida = ctx.createGain();
  plato.salida.gain.value = 0;
  entrada.connect(graves).connect(agudos).connect(bocina).connect(sat).connect(plato.efecto).connect(plato.salida);
  entrada.connect(plato.limpio).connect(plato.salida);
  plato.ruido = ctx.createGain();
  plato.ruido.connect(plato.salida);
  Sintes.crujido(plato.ruido);
  plato.salida.connect(buses.gramofono);
  plato.r.audio.loop = false;
  plato.r.audio.onended = () => pararDisco(0.5);
  aplicarBocina();
}

function aplicarBocina() {
  if (!plato.efecto) return;
  const on = guardado.bocina !== false;
  plato.efecto.gain.value = on ? 1.6 : 0;
  plato.limpio.gain.value = on ? 0 : 1;
  plato.ruido.gain.value = on ? 1 : 0;
}

function ponerDisco(clave) {
  arrancarAudio();
  montarPlato();
  if (estado.plato === clave) return pararDisco();
  plato.r.despertar();
  plato.r.audio.pause();
  plato.r.cargar(clave, 0);
  const g = plato.salida.gain;
  g.cancelScheduledValues(ctx.currentTime);
  g.setValueAtTime(0, ctx.currentTime);
  g.linearRampToValueAtTime(1, ctx.currentTime + 0.6);
  estado.plato = clave;
  pintar();
}

function pararDisco(segundos = 1.2) {
  if (!estado.plato) return;
  const g = plato.salida.gain;
  g.cancelScheduledValues(ctx.currentTime);
  g.setValueAtTime(g.value, ctx.currentTime);
  g.linearRampToValueAtTime(0, ctx.currentTime + segundos);
  setTimeout(() => plato.r.audio.pause(), segundos * 1000 + 50);
  estado.plato = null;
  pintar();
}

/* ---------- todo fuera ---------- */

function fundirTodo(segundos = 6) {
  if (!ctx) return;
  pausar(segundos);
  pararDisco(segundos);
  Object.keys(Sintes.encendidos).forEach((k) => Sintes.apagarAmbiente(k, segundos));
  pintar();
}

function cortar() {
  if (!ctx) return;
  pausar(0.05);
  pararDisco(0.05);
  Object.keys(Sintes.encendidos).forEach((k) => Sintes.apagarAmbiente(k, 0.1));
  pintar();
}

/* ---------- interfaz ---------- */

const ROMANOS = ["I", "II", "III", "IV", "V"];

function construir() {
  $("#escenas").innerHTML = Object.entries(ESCENAS)
    .map(([k, e], i) => `
      <article class="escena" data-escena="${k}">
        <button class="escena-boton" data-escena="${k}" aria-pressed="false">
          <span class="canal">${ROMANOS[i]}</span>
          <span class="escena-nombre">${e.nombre}</span>
          <span class="escena-sub">${e.sub}</span>
          <span class="escena-estado">En espera</span>
          <kbd>${i + 1}</kbd>
        </button>
        <div class="niveles" role="radiogroup" aria-label="Intensidad de ${e.nombre}">
          ${e.niveles.map((n, j) => `<button role="radio" data-nivel="${j}" aria-checked="false"><span class="lampara"></span>${n}</button>`).join("")}
        </div>
      </article>`)
    .join("");

  $("#discos").innerHTML = Object.entries(DISCOS)
    .map(([k, [t, g]]) => `<li><button class="disco" data-disco="${k}"><span class="etiqueta" aria-hidden="true"></span><span class="disco-titulo">${t}</span><span class="disco-genero">${g}</span></button></li>`)
    .join("");

  $("#ambientes").innerHTML = Object.entries(Sintes.AMBIENTES)
    .map(([k, a]) => `
      <div class="ambiente" data-ambiente="${k}">
        <button class="ambiente-boton" aria-pressed="false"><span class="lampara"></span><span><b>${a.nombre}</b><small>${a.sub}</small></span></button>
        <input type="range" min="0" max="1" step="0.01" value="${guardado.amb?.[k] ?? 0.7}" aria-label="Nivel de ${a.nombre}">
      </div>`)
    .join("");

  $("#golpes").innerHTML = Object.entries(Sintes.GOLPES)
    .map(([k, g], i) => `<button class="golpe" data-golpe="${k}"><b>${g.nombre}</b><small>${g.sub}</small><kbd>${TECLAS_GOLPES[i].toUpperCase()}</kbd></button>`)
    .join("");

  // Escenas
  $$(".escena").forEach((el) => {
    const k = el.dataset.escena;
    $(".escena-boton", el).addEventListener("click", () => pulsarEscena(k));
    $$(".niveles button", el).forEach((b) => b.addEventListener("click", () => cambiarNivel(k, +b.dataset.nivel)));
  });
  $$(".disco").forEach((b) => b.addEventListener("click", () => ponerDisco(b.dataset.disco)));
  $("#bocina").checked = guardado.bocina !== false;
  $("#bocina").addEventListener("change", (e) => {
    guardado.bocina = e.target.checked;
    guardar();
    aplicarBocina();
  });

  // Ambientes
  $$(".ambiente").forEach((el) => {
    const k = el.dataset.ambiente;
    const rango = $("input", el);
    $("button", el).addEventListener("click", () => {
      arrancarAudio();
      if (Sintes.encendidos[k]) Sintes.apagarAmbiente(k);
      else Sintes.ambiente(k, +rango.value);
      pintar();
    });
    rango.addEventListener("input", () => {
      Sintes.nivelAmbiente(k, +rango.value);
      (guardado.amb ||= {})[k] = +rango.value;
      guardar();
    });
  });

  $$(".golpe").forEach((b) => b.addEventListener("click", () => golpe(b.dataset.golpe)));

  // Volúmenes
  for (const [id, clave, bus] of [["v-maestro", "maestro"], ["v-musica", "vMusica", "escenas"], ["v-gramofono", "vGramofono", "gramofono"], ["v-ambiente", "vAmbiente", "ambiente"], ["v-golpes", "vGolpes", "golpes"]]) {
    const r = $("#" + id);
    if (guardado[clave] != null) r.value = guardado[clave];
    r.addEventListener("input", () => {
      guardado[clave] = +r.value;
      guardar();
      if (!ctx) return;
      const nodo = bus ? buses[bus] : maestro;
      nodo.gain.setTargetAtTime(+r.value, ctx.currentTime, 0.05);
    });
  }

  $("#fundir").addEventListener("click", () => fundirTodo());
  $("#cortar").addEventListener("click", cortar);
  $("#pantalla").addEventListener("click", pantallaCompleta);
  $("#abrir-manual").addEventListener("click", () => $("#manual").showModal());
  $("#abrir-creditos").addEventListener("click", () => $("#creditos").showModal());
  $$("dialog .cerrar").forEach((b) => b.addEventListener("click", () => b.closest("dialog").close()));

  document.addEventListener("keydown", teclado);
  construirDados();
  construirCreditos();
  setInterval(reloj, 1000);
  reloj();
  pintar();
}

function golpe(k) {
  arrancarAudio();
  Sintes.GOLPES[k].sonar();
  const b = $(`.golpe[data-golpe="${k}"]`);
  b.classList.remove("disparado");
  void b.offsetWidth;
  b.classList.add("disparado");
}

function pantallaCompleta() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.();
}

function teclado(e) {
  if (e.target.closest?.("input, textarea, select") || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase();
  const claves = Object.keys(ESCENAS);
  if (/^[1-5]$/.test(k)) pulsarEscena(claves[+k - 1]);
  else if (k === "arrowup" || k === "arrowdown") {
    const esc = estado.escena || estado.ultima;
    cambiarNivel(esc, estado.niveles[esc] + (k === "arrowup" ? 1 : -1));
  } else if (TECLAS_GOLPES.includes(k)) golpe(Object.keys(Sintes.GOLPES)[TECLAS_GOLPES.indexOf(k)]);
  else if (k === "escape" && !$("dialog[open]")) fundirTodo();
  else if (k === "x") cortar();
  else if (k === "f") pantallaCompleta();
  else return;
  e.preventDefault();
}

function reloj() {
  const ahora = new Date();
  $("#hora").textContent = ahora.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  if (estado.inicio) {
    const s = Math.floor((Date.now() - estado.inicio) / 1000);
    $("#sesion").textContent = [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((n) => String(n).padStart(2, "0")).join(":");
  }
}

function pintar() {
  const claves = Object.keys(ESCENAS);
  $$(".escena").forEach((el) => {
    const k = el.dataset.escena;
    const activa = estado.escena === k;
    const suena = activa && !estado.pausada;
    el.classList.toggle("activa", suena);
    el.classList.toggle("pausada", activa && estado.pausada);
    $(".escena-boton", el).setAttribute("aria-pressed", suena);
    $(".escena-estado", el).textContent = suena ? "Sonando" : activa ? "En pausa" : "En espera";
    $$(".niveles button", el).forEach((b, j) => b.setAttribute("aria-checked", j === estado.niveles[k]));
  });
  $$(".disco").forEach((b) => b.classList.toggle("girando", b.dataset.disco === estado.plato));
  $(".plato").classList.toggle("girando", !!estado.plato);
  $$(".ambiente").forEach((el) => {
    const on = !!Sintes.encendidos?.[el.dataset.ambiente];
    el.classList.toggle("encendido", on);
    $("button", el).setAttribute("aria-pressed", on);
  });

  // El dial: la aguja apunta a la escena que suena.
  const dial = $("#dial");
  const sintonizada = estado.escena && !estado.pausada;
  dial.classList.toggle("vivo", sintonizada || !!estado.plato);
  const idx = claves.indexOf(estado.escena ?? estado.ultima);
  dial.style.setProperty("--aguja", `${((idx + 0.5) / claves.length) * 100}%`);
  const r = mezcla.actual;
  const pista = r && biblioteca?.pistas[r.clave];
  if (sintonizada && pista) {
    const e = ESCENAS[estado.escena];
    $("#dial-escena").textContent = `${e.nombre} · ${e.niveles[estado.niveles[estado.escena]]}`;
    $("#dial-pista").textContent = `${pista.t} — ${pista.a}`;
  } else if (estado.plato) {
    $("#dial-escena").textContent = "Gramófono";
    $("#dial-pista").textContent = `${DISCOS[estado.plato][0]} — ${biblioteca.pistas[estado.plato].a}`;
  } else {
    $("#dial-escena").textContent = estado.escena ? "En pausa" : "Sin señal";
    $("#dial-pista").textContent = ctx ? "Pulsa una escena para que suene" : "Pulsa una escena para empezar";
  }
  if (estado.plato && sintonizada) $("#dial-pista").textContent += ` · y en el gramófono, ${DISCOS[estado.plato][0]}`;
}

/* ---------- tiradas ---------- */

const historial = [];

function anotar(html, clase = "") {
  historial.unshift({ html, clase });
  historial.length = Math.min(historial.length, 14);
  $("#historial").innerHTML = historial.map((h) => `<li class="${h.clase}">${h.html}</li>`).join("");
}

function construirDados() {
  const form = $("#tirada");
  let mod = 0;
  $$(".mod button", form).forEach((b) =>
    b.addEventListener("click", () => {
      mod = +b.dataset.mod;
      $$(".mod button", form).forEach((x) => x.setAttribute("aria-checked", x === b));
    })
  );
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const hab = Math.max(1, Math.min(100, +$("#habilidad").value || 50));
    const t = Dados.porcentaje(mod);
    const g = Dados.grado(t.resultado, hab);
    const extra = mod ? ` <small>decenas ${t.decenas.map((x) => String(x).padStart(2, "0")).join(" · ")}, unidad ${t.unidades}</small>` : "";
    const etiqueta = mod > 0 ? ` +${mod} bonif.` : mod < 0 ? ` ${mod} penal.` : "";
    anotar(`<b class="n">${t.resultado}</b> <span class="g">${g.nombre}</span> <small>contra ${hab} (${Math.floor(hab / 2)}/${Math.floor(hab / 5)})${etiqueta}</small>${extra}`, g.clave);
  });

  $("#cordura").addEventListener("submit", (e) => {
    e.preventDefault();
    const san = Math.max(0, Math.min(99, +$("#san").value || 0));
    const perdida = $("#perdida").value.trim() || "0/1D6";
    if (!/^[\dDd+\-\s]+(\/[\dDd+\-\s]+)?$/.test(perdida)) return anotar(`No entiendo «${perdida}». Escribe algo como 1/1D6.`, "fallo");
    const c = Dados.cordura(san, perdida);
    let nota = "";
    if (c.pierde >= 5) nota = " <small>5 o más de golpe: tirada de INT para la locura temporal.</small>";
    if (c.queda === 0) nota = " <small>Cordura a cero: locura indefinida.</small>";
    anotar(`<b class="n">${c.tirada}</b> <span class="g">${c.pasa ? "Supera" : c.maximo ? "Pifia" : "Falla"}</span> <small>contra COR ${san}</small> · pierde <b>${c.pierde}</b> (${c.expr}${c.maximo ? ", al máximo" : ""}) · le quedan <b>${c.queda}</b>${nota}`, c.pasa ? "normal" : "fallo");
    $("#san").value = c.queda;
  });

  $("#expresion").addEventListener("submit", (e) => {
    e.preventDefault();
    tirarExpresion($("#dados").value);
  });
  $$(".rapidos button").forEach((b) => b.addEventListener("click", () => tirarExpresion(b.textContent)));
}

function tirarExpresion(texto) {
  const r = Dados.expresion(texto);
  if (!r) return anotar(`No entiendo «${texto}». Escribe algo como 2D6+1.`, "fallo");
  anotar(`<b class="n">${r.total}</b> <span class="g">${texto.toUpperCase().replace(/\s+/g, "")}</span> <small>${r.detalle}</small>`);
}

/* ---------- créditos ---------- */

function construirCreditos() {
  const usadas = Object.entries(biblioteca.pistas).sort((a, b) => a[1].t.localeCompare(b[1].t));
  $("#lista-creditos").innerHTML = usadas.map(([, p]) => `<li>«${p.t}», ${p.a}</li>`).join("");
}

/* ---------- inicio ---------- */

fetch("/pistas.json")
  .then((r) => r.json())
  .then((b) => {
    biblioteca = b;
    construir();
  });
