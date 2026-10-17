"use strict";

/* Ambientes y golpes: grabaciones reales de Freesound (CC0), preparadas con
   herramientas/bajar-efectos.py. Los ambientes se repiten con un fundido cruzado para que
   no se note la costura; los pulsos (reloj, latido) se repiten a compás. */

const Efectos = (() => {
  const AMBIENTES = {
    lluvia: { nombre: "Lluvia", sub: "Contra los cristales" },
    tormenta: { nombre: "Tormenta", sub: "Aguacero y truenos" },
    viento: { nombre: "Viento", sub: "Aúlla en una iglesia vacía" },
    puerto: { nombre: "Puerto", sub: "Olas contra el muelle" },
    olas: { nombre: "Acantilado", sub: "Mar contra las rocas" },
    chimenea: { nombre: "Chimenea", sub: "Leña que crepita" },
    noche: { nombre: "Noche de verano", sub: "Grillos en el campo" },
    taberna: { nombre: "Taberna", sub: "Conversaciones y vasos" },
    barco: { nombre: "Bodega de barco", sub: "Maderas que crujen" },
    reloj: { nombre: "Reloj de pared", sub: "Tic, tac" },
    latido: { nombre: "Latido", sub: "Un corazón en el silencio" },
    presencia: { nombre: "Presencia", sub: "Un zumbido grave, como si algo respirase" },
  };

  const GOLPES = {
    Terror: {
      susto: { nombre: "Susto", sub: "Golpe de orquesta" },
      impacto: { nombre: "Impacto", sub: "Grave, de tráiler" },
      crescendo: { nombre: "Crescendo", sub: "Sube y estalla" },
      grito: { nombre: "Grito", sub: "De pánico" },
      susurros: { nombre: "Susurros", sub: "Voces que no deberían estar" },
      aullido: { nombre: "Aullido", sub: "Un lobo, o algo peor" },
    },
    Acción: {
      disparo: { nombre: "Disparo", sub: "Pistola" },
      rafaga: { nombre: "Ráfaga", sub: "Una Thompson" },
      explosion: { nombre: "Explosión", sub: "Dinamita" },
      amartillar: { nombre: "Amartillar", sub: "Un revólver, despacio" },
      cristales: { nombre: "Cristales", sub: "Una ventana que revienta" },
      portazo: { nombre: "Portazo", sub: "Madera maciza" },
    },
    "La casa": {
      crujido: { nombre: "Puerta", sub: "Se abre, crujiendo" },
      llaman: { nombre: "Llaman", sub: "Alguien en la puerta" },
      pasos: { nombre: "Pasos", sub: "Botas sobre madera" },
      trueno: { nombre: "Trueno", sub: "Encima de la casa" },
      campanada: { nombre: "Campanada", sub: "La torre de la iglesia" },
      sirena: { nombre: "Sirena", sub: "Un barco en la niebla" },
    },
  };

  const FUNDIDO_BUCLE = 4; // segundos de solape entre vueltas de un ambiente
  const GOLPE_LARGO = 6; // los golpes más largos se cortan si se vuelven a pulsar

  let ctx, busAmb, busFx, indice, listo;
  const buffers = {};
  const encendidos = {};
  const sonando = {}; // golpe -> fuentes en curso
  const ultimaToma = {};

  function iniciar(contexto, buses) {
    ctx = contexto;
    busAmb = buses.ambiente;
    busFx = buses.golpes;
    listo = fetch("/efectos.json")
      .then((r) => r.json())
      .then((i) => {
        indice = i;
        // Los golpes se cargan enseguida para que suenen al instante; los ambientes, al usarlos.
        for (const e of Object.values(indice)) if (e.tipo === "golpe") e.tomas.forEach((t) => cargar(t.f));
      });
  }

  function cargar(fichero) {
    buffers[fichero] ||= fetch("/" + fichero)
      .then((r) => r.arrayBuffer())
      .then((b) => ctx.decodeAudioData(b));
    return buffers[fichero];
  }

  /* ---------- ambientes ---------- */

  function ambiente(clave, nivel = 0.7) {
    if (encendidos[clave]) return;
    const salida = ctx.createGain();
    salida.gain.value = 0;
    salida.connect(busAmb);
    const estado = { vivo: true, salida, fuentes: new Set() };
    encendidos[clave] = estado;
    salida.gain.setTargetAtTime(nivel, ctx.currentTime, 0.6);
    listo.then(() => {
      const toma = indice[clave].tomas[0];
      return cargar(toma.f).then((buffer) => [toma, buffer]);
    }).then(([toma, buffer]) => {
      if (!estado.vivo) return;
      if (indice[clave].tipo === "pulso") {
        const s = fuente(buffer, salida, estado);
        s.loop = true;
        s.loopStart = 0;
        s.loopEnd = toma.bucle;
        s.start();
      } else {
        // Primera vuelta desde un punto al azar, para que no empiece siempre igual.
        vuelta(buffer, estado, ctx.currentTime + 0.05, Math.random() * buffer.duration * 0.6);
      }
    });
  }

  function fuente(buffer, destino, estado) {
    const s = ctx.createBufferSource();
    s.buffer = buffer;
    s.connect(destino);
    estado.fuentes.add(s);
    s.onended = () => estado.fuentes.delete(s);
    return s;
  }

  // Una vuelta del bucle; la siguiente entra FUNDIDO_BUCLE segundos antes de que acabe esta.
  function vuelta(buffer, estado, inicio, desde = 0) {
    if (!estado.vivo) return;
    const g = ctx.createGain();
    g.connect(estado.salida);
    const s = fuente(buffer, g, estado);
    const dura = buffer.duration - desde;
    const fin = inicio + dura;
    const X = Math.min(FUNDIDO_BUCLE, dura / 3);
    g.gain.setValueAtTime(0, inicio);
    g.gain.linearRampToValueAtTime(1, inicio + X);
    g.gain.setValueAtTime(1, fin - X);
    g.gain.linearRampToValueAtTime(0, fin);
    s.start(inicio, desde);
    s.stop(fin + 0.05);
    const siguiente = fin - X;
    estado.temporizador = setTimeout(() => vuelta(buffer, estado, siguiente), Math.max(0, (siguiente - ctx.currentTime - 2) * 1000));
  }

  function apagarAmbiente(clave, segundos = 1.5) {
    const e = encendidos[clave];
    if (!e) return;
    delete encendidos[clave];
    e.vivo = false;
    clearTimeout(e.temporizador);
    e.salida.gain.cancelScheduledValues(ctx.currentTime);
    e.salida.gain.setValueAtTime(e.salida.gain.value, ctx.currentTime);
    e.salida.gain.linearRampToValueAtTime(0, ctx.currentTime + segundos);
    setTimeout(() => {
      e.fuentes.forEach((s) => { try { s.stop(); } catch (_) {} });
      e.salida.disconnect();
    }, segundos * 1000 + 100);
  }

  function nivelAmbiente(clave, nivel) {
    const e = encendidos[clave];
    if (e) e.salida.gain.setTargetAtTime(nivel, ctx.currentTime, 0.1);
  }

  /* ---------- golpes ---------- */

  async function golpe(clave) {
    await listo;
    const tomas = indice[clave].tomas;
    const activos = sonando[clave] || [];
    if (activos.length && tomas.some((t) => t.d > GOLPE_LARGO)) {
      // Un golpe largo que ya suena: volver a pulsarlo lo apaga.
      activos.forEach(({ s, g }) => {
        g.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
        s.stop(ctx.currentTime + 0.4);
      });
      sonando[clave] = [];
      return false;
    }
    // Una toma al azar, que no repita la anterior.
    let n = Math.floor(Math.random() * tomas.length);
    if (tomas.length > 1 && n === ultimaToma[clave]) n = (n + 1) % tomas.length;
    ultimaToma[clave] = n;
    const buffer = await cargar(tomas[n].f);
    const g = ctx.createGain();
    g.connect(busFx);
    const s = ctx.createBufferSource();
    s.buffer = buffer;
    s.connect(g);
    const item = { s, g };
    (sonando[clave] ||= []).push(item);
    s.onended = () => {
      sonando[clave] = (sonando[clave] || []).filter((x) => x !== item);
      g.disconnect();
      document.dispatchEvent(new CustomEvent("golpe-fin", { detail: clave }));
    };
    s.start();
    return true;
  }

  function enCurso(clave) {
    return (sonando[clave] || []).length > 0;
  }

  function creditos() {
    return Object.entries(indice || {}).flatMap(([clave, e]) => e.tomas.map((t) => ({ clave, ...t.credito })));
  }

  // Crujido de disco de pizarra para el gramófono (este sí, sintetizado).
  function crujido(salida) {
    const n = ctx.sampleRate * 4;
    const b = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < n; i++) {
      d[i] = (Math.random() * 2 - 1) * 0.02;
      if (Math.random() < 0.0009) d[i] += (Math.random() * 2 - 1) * 0.9;
    }
    // Un golpe por vuelta: el disco gira a 78 rpm.
    for (let v = 0; v < 4 * 1.3; v++) d[Math.floor((v * ctx.sampleRate) / 1.3)] = 0.6;
    const s = ctx.createBufferSource();
    s.buffer = b;
    s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 2500;
    f.Q.value = 0.6;
    s.connect(f).connect(salida);
    s.start();
    return s;
  }

  return { iniciar, AMBIENTES, GOLPES, ambiente, apagarAmbiente, nivelAmbiente, golpe, enCurso, creditos, crujido, encendidos };
})();
