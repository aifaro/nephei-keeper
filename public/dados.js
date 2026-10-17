"use strict";

/* Tiradas de La llamada de Cthulhu, 7.ª edición: porcentaje con dados de bonificación
   y penalización, grados de éxito, tiradas de Cordura y dados sueltos. */

const Dados = (() => {
  const d = (caras) => 1 + Math.floor(Math.random() * caras);

  // Un dado de unidades y uno o más de decenas; 00 y 0 son 100.
  function porcentaje(modificador = 0) {
    const unidades = d(10) - 1;
    const decenas = Array.from({ length: 1 + Math.abs(modificador) }, () => (d(10) - 1) * 10);
    const valor = (t) => (t + unidades === 0 ? 100 : t + unidades);
    const posibles = decenas.map(valor);
    const resultado = modificador > 0 ? Math.min(...posibles) : modificador < 0 ? Math.max(...posibles) : posibles[0];
    return { resultado, unidades, decenas };
  }

  function grado(resultado, habilidad) {
    const pifia = habilidad < 50 ? resultado >= 96 : resultado === 100;
    if (resultado === 1) return { clave: "critico", nombre: "Crítico" };
    if (pifia && resultado > habilidad) return { clave: "pifia", nombre: "Pifia" };
    if (resultado <= Math.floor(habilidad / 5)) return { clave: "extremo", nombre: "Éxito extremo" };
    if (resultado <= Math.floor(habilidad / 2)) return { clave: "dificil", nombre: "Éxito difícil" };
    if (resultado <= habilidad) return { clave: "normal", nombre: "Éxito normal" };
    return { clave: "fallo", nombre: "Fallo" };
  }

  // "2D6+1", "1D10 + 1D4 - 2", "3"...
  function expresion(texto) {
    const limpio = texto.replace(/\s+/g, "").toUpperCase();
    if (!/^[+-]?(\d*D\d+|\d+)([+-](\d*D\d+|\d+))*$/.test(limpio)) return null;
    let total = 0;
    const partes = [];
    for (const [, signo, n, caras, fijo] of limpio.matchAll(/([+-]?)(?:(\d*)D(\d+)|(\d+))/g)) {
      const s = signo === "-" ? -1 : 1;
      if (fijo) {
        total += s * +fijo;
        partes.push(`${signo || (partes.length ? "+" : "")}${fijo}`);
      } else {
        const cuantos = Math.min(+(n || 1), 100);
        const tiradas = Array.from({ length: cuantos }, () => d(+caras));
        total += s * tiradas.reduce((a, b) => a + b, 0);
        partes.push(`${signo || (partes.length ? "+" : "")}[${tiradas.join(",")}]`);
      }
    }
    return { total, detalle: partes.join(" ") };
  }

  // Pérdida de Cordura del tipo "1/1D6": lo de la izquierda si pasa, lo de la derecha si falla.
  function cordura(san, perdida) {
    const [exito, fallo = exito] = perdida.split("/").map((s) => s.trim());
    const tirada = porcentaje(0).resultado;
    const pasa = tirada <= san && tirada !== 100 && !(san < 50 && tirada >= 96);
    const expr = pasa ? exito : fallo;
    const maximo = tirada === 100 || (san < 50 && tirada >= 96);
    let pierde;
    if (maximo && !pasa) {
      // En una pifia se pierde el máximo posible.
      pierde = expr.replace(/\s+/g, "").toUpperCase().split(/(?=[+-])/).reduce((a, p) => {
        const m = p.match(/([+-]?)(?:(\d*)D(\d+)|(\d+))/);
        const s = m[1] === "-" ? -1 : 1;
        return a + s * (m[4] ? +m[4] : +(m[2] || 1) * +m[3]);
      }, 0);
    } else {
      const e = expresion(expr || "0");
      pierde = e ? e.total : 0;
    }
    return { tirada, pasa, pierde: Math.max(0, pierde), expr, maximo: maximo && !pasa, queda: Math.max(0, san - pierde) };
  }

  return { d, porcentaje, grado, expresion, cordura };
})();
