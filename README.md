# nephei-keeper

[keeper.nephei.org](https://keeper.nephei.org): la Radiogramola del Guardián, un panel para dirigir La llamada de Cthulhu y Pulp Cthulhu en la mesa.

- **Escenas.** Investigación, Lo innombrable, Combate, Persecución y Respiro. Cada una tiene cuatro intensidades, y cada intensidad tiene su lista de pistas. Al cambiar de escena o de intensidad, la música se funde, y cada lista sigue donde se dejó.
- **Gramófono.** La música que oyen los personajes (ragtime, tango, Satie…), en un canal aparte y con filtro de bocina y crujido.
- **Ambiente y golpes.** Lluvia, tormenta, viento, mar, chimenea, reloj, latido y presencia; susto, impacto, crescendo, disparo, trueno y campanada. Todo se sintetiza con Web Audio, así que no hay ficheros detrás.
- **Tiradas.** Para la 7.ª edición: habilidad con dados de bonificación y penalización, grados de éxito, pérdida de Cordura y dados sueltos.

Inspirado en el [TASC-7](https://deltagreen.sorakalden.com/) de Delta Green.

## Estructura

| Ruta | Qué es |
|---|---|
| `public/index.html`, `estilo.css` | La página. |
| `public/consola.js` | El motor de la música, el gramófono y la interfaz. |
| `public/sintes.js` | Los ambientes y los golpes. |
| `public/dados.js` | Las tiradas. |
| `public/musica/`, `public/pistas.json` | Las pistas y su índice. Los genera `herramientas/bajar-musica.py`. |
| `herramientas/pistas.txt` | Qué pistas van en cada escena e intensidad, y los discos del gramófono. |

## Cambiar la música

1. Edita `herramientas/pistas.txt`. Cada línea lleva escena, intensidad (de 0 a 3, o `-` para el gramófono) y el título exacto de la pista en incompetech.com.
2. Ejecuta `python herramientas/bajar-musica.py`. Baja solo las pistas nuevas, las recomprime a 96 kbps y reescribe `public/pistas.json`. Necesita `curl` y ffmpeg; vale el de `pip install imageio-ffmpeg`.
3. Si añades un disco, ponle nombre y género en `DISCOS`, dentro de `public/consola.js`.

Toda la música es de Kevin MacLeod, con licencia [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). La página muestra la atribución y la lista de pistas. Si añades música de otra fuente, tiene que permitir redistribuirla.

## Despliegue

Solo assets estáticos en el Worker `nephei-keeper`, conectado con Workers Builds: cada push a `main` lo despliega.
