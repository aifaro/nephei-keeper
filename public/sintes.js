"use strict";

/* Ambientes y golpes hechos en el navegador con Web Audio: no hay ficheros detrás.
   Los ambientes son bucles que se encienden y se apagan; los golpes suenan una vez.
   Todo sale por los buses que le pasa la consola (ambiente, golpes y reverb). */

const Sintes = (() => {
  let ctx, busAmb, busFx, envioReverb;
  let ruidoBlanco, ruidoMarron;

  function iniciar(contexto, buses) {
    ctx = contexto;
    busAmb = buses.ambiente;
    busFx = buses.golpes;
    envioReverb = buses.reverb;
    ruidoBlanco = bufferRuido("blanco");
    ruidoMarron = bufferRuido("marron");
  }

  function bufferRuido(tipo, segundos = 6) {
    const n = ctx.sampleRate * segundos;
    const b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      let ultimo = 0;
      for (let i = 0; i < n; i++) {
        const blanco = Math.random() * 2 - 1;
        if (tipo === "marron") {
          ultimo = (ultimo + 0.02 * blanco) / 1.02;
          d[i] = ultimo * 3.5;
        } else d[i] = blanco;
      }
    }
    return b;
  }

  /* ---------- piezas ---------- */

  function fuenteRuido(buffer, inicio = ctx.currentTime) {
    const s = ctx.createBufferSource();
    s.buffer = buffer;
    s.loop = true;
    s.loopStart = Math.random();
    s.start(inicio, Math.random() * (buffer.duration - 1));
    return s;
  }

  function filtro(tipo, frecuencia, q = 0.7) {
    const f = ctx.createBiquadFilter();
    f.type = tipo;
    f.frequency.value = frecuencia;
    f.Q.value = q;
    return f;
  }

  function ganancia(valor = 1) {
    const g = ctx.createGain();
    g.gain.value = valor;
    return g;
  }

  function lfo(frecuencia, profundidad, destino) {
    const o = ctx.createOscillator();
    const g = ganancia(profundidad);
    o.frequency.value = frecuencia;
    o.connect(g).connect(destino);
    o.start();
    return o;
  }

  function cadena(...nodos) {
    for (let i = 0; i < nodos.length - 1; i++) nodos[i].connect(nodos[i + 1]);
    return nodos[nodos.length - 1];
  }

  // Un golpe de ruido corto con su envolvente: gotas, chasquidos, tics.
  function chasquido(destino, { t = ctx.currentTime, dur = 0.02, frec = 3000, q = 1, nivel = 0.5, tipo = "bandpass" } = {}) {
    const s = ctx.createBufferSource();
    s.buffer = ruidoBlanco;
    const f = filtro(tipo, frec, q);
    const g = ganancia(0);
    g.gain.setValueAtTime(nivel, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    cadena(s, f, g, destino);
    s.start(t, Math.random() * 5, dur + 0.05);
  }

  function golpeGrave(destino, { t = ctx.currentTime, desde = 120, hasta = 40, dur = 0.5, nivel = 1 } = {}) {
    const o = ctx.createOscillator();
    const g = ganancia(0);
    o.frequency.setValueAtTime(desde, t);
    o.frequency.exponentialRampToValueAtTime(hasta, t + dur * 0.6);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(nivel, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    cadena(o, g, destino);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // Repite fn a intervalos aleatorios mientras el ambiente siga encendido.
  function aleatorio(estado, min, max, fn) {
    const paso = () => {
      if (!estado.vivo) return;
      fn();
      estado.temporizadores.push(setTimeout(paso, min + Math.random() * (max - min)));
    };
    estado.temporizadores.push(setTimeout(paso, Math.random() * max));
  }

  /* ---------- ambientes ---------- */

  const AMBIENTES = {
    lluvia: {
      nombre: "Lluvia", sub: "Constante, contra los cristales",
      crear(salida, e) {
        const s = fuenteRuido(ruidoBlanco);
        const g = ganancia(0.32);
        cadena(s, filtro("highpass", 500), filtro("lowpass", 7000), g, salida);
        lfo(0.11, 0.06, g.gain);
        aleatorio(e, 40, 160, () => chasquido(salida, { frec: 1500 + Math.random() * 4000, q: 4, nivel: 0.12 + Math.random() * 0.15, dur: 0.03 }));
        return [s];
      },
    },
    tormenta: {
      nombre: "Tormenta", sub: "Aguacero y truenos lejanos",
      crear(salida, e) {
        const s = fuenteRuido(ruidoBlanco);
        const g = ganancia(0.45);
        cadena(s, filtro("highpass", 300), filtro("lowpass", 5000), g, salida);
        lfo(0.07, 0.12, g.gain);
        aleatorio(e, 14000, 32000, () => trueno(salida, 0.35 + Math.random() * 0.4, 1800 + Math.random() * 3000));
        return [s];
      },
    },
    viento: {
      nombre: "Viento", sub: "Racheado, aúlla en las rendijas",
      crear(salida) {
        const s = fuenteRuido(ruidoMarron);
        const f = filtro("bandpass", 500, 2.2);
        const g = ganancia(0.9);
        cadena(s, f, g, salida);
        const l1 = lfo(0.06, 260, f.frequency);
        const l2 = lfo(0.13, 0.4, g.gain);
        return [s, l1, l2];
      },
    },
    mar: {
      nombre: "Mar", sub: "Olas contra el espigón",
      crear(salida) {
        const s = fuenteRuido(ruidoMarron);
        const f = filtro("lowpass", 700);
        const g = ganancia(0.55);
        cadena(s, f, g, salida);
        const l1 = lfo(0.085, 0.45, g.gain);
        const l2 = lfo(0.085, 450, f.frequency);
        const r = fuenteRuido(ruidoBlanco);
        const gr = ganancia(0.05);
        cadena(r, filtro("highpass", 2500), gr, salida);
        const l3 = lfo(0.085, 0.045, gr.gain);
        return [s, r, l1, l2, l3];
      },
    },
    fuego: {
      nombre: "Chimenea", sub: "Leña que cruje",
      crear(salida, e) {
        const s = fuenteRuido(ruidoMarron);
        cadena(s, filtro("lowpass", 400), ganancia(0.35), salida);
        aleatorio(e, 30, 400, () => chasquido(salida, { frec: 1800 + Math.random() * 3500, q: 1.5, nivel: 0.1 + Math.random() * 0.4, dur: 0.01 + Math.random() * 0.03 }));
        aleatorio(e, 2500, 7000, () => chasquido(salida, { frec: 900, q: 0.8, nivel: 0.5, dur: 0.12 }));
        return [s];
      },
    },
    reloj: {
      nombre: "Reloj de pared", sub: "Tic, tac",
      crear(salida, e) {
        let par = false;
        const tic = () => {
          if (!e.vivo) return;
          chasquido(salida, { frec: par ? 2600 : 3300, q: 9, nivel: 0.55, dur: 0.035 });
          par = !par;
          e.temporizadores.push(setTimeout(tic, 1000));
        };
        tic();
        return [];
      },
    },
    latido: {
      nombre: "Latido", sub: "Un corazón que se acelera poco a poco",
      crear(salida, e) {
        let intervalo = 1000;
        const late = () => {
          if (!e.vivo) return;
          const t = ctx.currentTime + 0.02;
          golpeGrave(salida, { t, desde: 90, hasta: 45, dur: 0.18, nivel: 0.9 });
          golpeGrave(salida, { t: t + 0.24, desde: 75, hasta: 40, dur: 0.22, nivel: 0.65 });
          intervalo = Math.max(520, intervalo - 6);
          e.temporizadores.push(setTimeout(late, intervalo));
        };
        late();
        return [];
      },
    },
    presencia: {
      nombre: "Presencia", sub: "Un zumbido grave, como si algo respirase",
      crear(salida) {
        const nodos = [];
        const g = ganancia(0.22);
        const f = filtro("lowpass", 260, 4);
        f.connect(g).connect(salida);
        for (const frec of [41.2, 41.7, 61.9, 82.6]) {
          const o = ctx.createOscillator();
          o.type = "sawtooth";
          o.frequency.value = frec;
          o.connect(f);
          o.start();
          nodos.push(o);
        }
        nodos.push(lfo(0.045, 120, f.frequency), lfo(0.03, 0.12, g.gain));
        const s = fuenteRuido(ruidoMarron);
        cadena(s, filtro("bandpass", 180, 6), ganancia(0.4), salida);
        nodos.push(s);
        return nodos;
      },
    },
  };

  const encendidos = {};

  function ambiente(clave, nivel = 0.7) {
    if (encendidos[clave]) return encendidos[clave];
    const salida = ganancia(0);
    salida.connect(busAmb);
    const estado = { vivo: true, temporizadores: [], salida };
    estado.nodos = AMBIENTES[clave].crear(salida, estado);
    salida.gain.setTargetAtTime(nivel, ctx.currentTime, 0.8);
    encendidos[clave] = estado;
    return estado;
  }

  function apagarAmbiente(clave, segundos = 1.5) {
    const e = encendidos[clave];
    if (!e) return;
    delete encendidos[clave];
    e.vivo = false;
    e.temporizadores.forEach(clearTimeout);
    e.salida.gain.setTargetAtTime(0, ctx.currentTime, segundos / 4);
    setTimeout(() => {
      e.nodos.forEach((n) => { try { n.stop(); } catch (_) {} });
      e.salida.disconnect();
    }, segundos * 1000 + 200);
  }

  function nivelAmbiente(clave, nivel) {
    const e = encendidos[clave];
    if (e) e.salida.gain.setTargetAtTime(nivel, ctx.currentTime, 0.1);
  }

  /* ---------- golpes ---------- */

  function salidaGolpe(reverb = 0.35) {
    const g = ganancia(1);
    g.connect(busFx);
    const env = ganancia(reverb);
    g.connect(env).connect(envioReverb);
    setTimeout(() => g.disconnect(), 12000);
    return g;
  }

  function trueno(salida, nivel = 0.8, retumbo = 4000) {
    const t = ctx.currentTime;
    const s = ctx.createBufferSource();
    s.buffer = ruidoMarron;
    const f = filtro("lowpass", 900);
    const g = ganancia(0);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(nivel, t + 0.15);
    g.gain.setTargetAtTime(nivel * 0.5, t + 0.3, 0.3);
    g.gain.setTargetAtTime(0, t + 1.2, retumbo / 4000);
    f.frequency.setValueAtTime(1400, t);
    f.frequency.exponentialRampToValueAtTime(220, t + 3);
    cadena(s, f, g, salida);
    s.start(t, Math.random() * 3);
    s.stop(t + 8);
  }

  const GOLPES = {
    susto: {
      nombre: "Susto", sub: "Para que salten de la silla",
      sonar() {
        const t = ctx.currentTime;
        const sal = salidaGolpe(0.5);
        const g = ganancia(0);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.5, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
        g.connect(sal);
        for (const frec of [622, 659, 932, 988, 1397]) {
          const o = ctx.createOscillator();
          o.type = "sawtooth";
          o.frequency.setValueAtTime(frec, t);
          o.frequency.linearRampToValueAtTime(frec * 0.97, t + 1.6);
          o.connect(g);
          o.start(t);
          o.stop(t + 1.7);
        }
        chasquido(sal, { t, frec: 2000, q: 0.5, nivel: 0.9, dur: 0.4 });
        golpeGrave(sal, { t, desde: 160, hasta: 45, dur: 0.6, nivel: 0.9 });
      },
    },
    impacto: {
      nombre: "Impacto", sub: "Un golpe grave de película",
      sonar() {
        const t = ctx.currentTime;
        const sal = salidaGolpe(0.6);
        golpeGrave(sal, { t, desde: 110, hasta: 30, dur: 3, nivel: 1 });
        const s = ctx.createBufferSource();
        s.buffer = ruidoMarron;
        const g = ganancia(0);
        g.gain.setValueAtTime(0.9, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 2.5);
        cadena(s, filtro("lowpass", 300), g, sal);
        s.start(t, 0, 3);
      },
    },
    crescendo: {
      nombre: "Crescendo", sub: "Seis segundos que suben y cortan en seco",
      sonar() {
        const t = ctx.currentTime;
        const d = 6;
        const sal = salidaGolpe(0.25);
        const s = ctx.createBufferSource();
        s.buffer = ruidoBlanco;
        const f = filtro("bandpass", 200, 3);
        const g = ganancia(0);
        f.frequency.setValueAtTime(200, t);
        f.frequency.exponentialRampToValueAtTime(6000, t + d);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.6, t + d);
        g.gain.setValueAtTime(0, t + d + 0.01);
        cadena(s, f, g, sal);
        s.start(t, 0, d + 0.1);
        const go = ganancia(0);
        go.gain.setValueAtTime(0.0001, t);
        go.gain.exponentialRampToValueAtTime(0.25, t + d);
        go.gain.setValueAtTime(0, t + d + 0.01);
        go.connect(sal);
        for (const frec of [55, 82.5, 110.6]) {
          const o = ctx.createOscillator();
          o.type = "sawtooth";
          o.frequency.setValueAtTime(frec, t);
          o.frequency.exponentialRampToValueAtTime(frec * 4, t + d);
          o.connect(go);
          o.start(t);
          o.stop(t + d + 0.05);
        }
      },
    },
    disparo: {
      nombre: "Disparo", sub: "Un tiro de revólver",
      sonar() {
        const t = ctx.currentTime;
        const sal = salidaGolpe(0.7);
        chasquido(sal, { t, frec: 1200, q: 0.3, nivel: 1, dur: 0.25, tipo: "lowpass" });
        chasquido(sal, { t, frec: 4000, q: 0.5, nivel: 0.6, dur: 0.06 });
        golpeGrave(sal, { t, desde: 150, hasta: 50, dur: 0.35, nivel: 1 });
      },
    },
    trueno: {
      nombre: "Trueno", sub: "Encima de la casa",
      sonar() {
        const sal = salidaGolpe(0.3);
        chasquido(sal, { frec: 2500, q: 0.3, nivel: 0.8, dur: 0.3 });
        trueno(sal, 1, 6000);
      },
    },
    campana: {
      nombre: "Campanada", sub: "La torre de la iglesia",
      sonar() {
        const t = ctx.currentTime;
        const sal = salidaGolpe(0.6);
        const base = 196;
        [[0.5, 0.5, 9], [1, 0.6, 7], [1.19, 0.35, 5], [1.5, 0.25, 4], [2, 0.3, 3.5], [2.74, 0.18, 2.5], [3.76, 0.12, 1.8]].forEach(([r, a, d]) => {
          const o = ctx.createOscillator();
          const g = ganancia(0);
          o.frequency.value = base * r;
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(a * 0.5, t + 0.006);
          g.gain.exponentialRampToValueAtTime(0.0001, t + d);
          cadena(o, g, sal);
          o.start(t);
          o.stop(t + d + 0.1);
        });
      },
    },
  };

  // Respuesta al impulso inventada: ruido que decae, como una sala de piedra.
  function respuestaReverb(segundos = 2.8) {
    const n = ctx.sampleRate * segundos;
    const b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
    }
    return b;
  }

  // Crujido de disco de pizarra para el gramófono.
  function crujido(salida) {
    const n = ctx.sampleRate * 4;
    const b = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < n; i++) {
      d[i] = (Math.random() * 2 - 1) * 0.02;
      if (Math.random() < 0.0009) d[i] += (Math.random() * 2 - 1) * 0.9;
    }
    // Un golpe por vuelta: el disco gira a 78 rpm.
    for (let v = 0; v < 4 * 1.3; v++) d[Math.floor(v * ctx.sampleRate / 1.3)] = 0.6;
    const s = ctx.createBufferSource();
    s.buffer = b;
    s.loop = true;
    cadena(s, filtro("bandpass", 2500, 0.6), salida);
    s.start();
    return s;
  }

  return { iniciar, AMBIENTES, GOLPES, ambiente, apagarAmbiente, nivelAmbiente, respuestaReverb, crujido, encendidos };
})();
