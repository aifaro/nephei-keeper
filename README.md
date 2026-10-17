# nephei-keeper

[keeper.nephei.org](https://keeper.nephei.org): la Radiogramola del Guardián, un panel para dirigir La llamada de Cthulhu y Pulp Cthulhu en la mesa.

- **Escenas.** Investigación, Lo innombrable, Combate, Persecución y Respiro. Una perilla elige entre cuatro intensidades, y cada intensidad tiene su lista de pistas. Al cambiar de escena o de intensidad la música se funde, y cada lista sigue donde se dejó. Junto al dial se pasa a la pista siguiente o a la anterior.
- **Gramófono.** La música que oyen los personajes (ragtime, tango, Satie…), en un canal aparte y con filtro de bocina y crujido.
- **Ambiente y golpes.** Doce ambientes en bucle (lluvia, tormenta, puerto, taberna, reloj, latido…) y dieciocho golpes en tres grupos (terror, acción, la casa), casi todos con varias tomas. Son grabaciones reales de Freesound con licencia CC0.
- **Tiradas.** Para la 7.ª edición: habilidad con dados de bonificación y penalización, grados de éxito, pérdida de Cordura y dados sueltos.

Inspirado en el [TASC-7](https://deltagreen.sorakalden.com/) de Delta Green.

## Estructura

| Ruta | Qué es |
|---|---|
| `public/index.html`, `estilo.css` | La página. |
| `public/consola.js` | El motor de la música, el gramófono y la interfaz. |
| `public/efectos.js` | Los ambientes y los golpes. |
| `public/dados.js` | Las tiradas. |
| `public/musica/`, `public/pistas.json` | Las pistas y su índice. Los genera `herramientas/bajar-musica.py`. |
| `herramientas/pistas.txt` | Qué pistas van en cada escena e intensidad, y los discos del gramófono. |
| `public/efectos/`, `public/efectos.json` | Los ambientes y los golpes, y su índice con los créditos. Los genera `herramientas/bajar-efectos.py` a partir de `herramientas/efectos.txt`. |

## Cambiar la música

1. Edita `herramientas/pistas.txt`. Cada línea lleva escena, intensidad (de 0 a 3, o `-` para el gramófono) y el título exacto de la pista en incompetech.com.
2. Ejecuta `python herramientas/bajar-musica.py`. Baja solo las pistas nuevas, tal como las publica incompetech (MP3 de 320 kbps, sin recomprimir), y reescribe `public/pistas.json`. Necesita `curl` y ffmpeg; vale el de `pip install imageio-ffmpeg`. Cada fichero tiene que pesar menos de 25 MiB, el límite de Workers.
3. Si añades un disco, ponle nombre y género en `DISCOS`, dentro de `public/consola.js`.

Toda la música es de Kevin MacLeod, con licencia [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). La página muestra la atribución y la lista de pistas. Si añades música de otra fuente, tiene que permitir redistribuirla.

## Cambiar los efectos

En `herramientas/efectos.txt` cada línea lleva la clave, el tipo (`golpe`, `ambiente` o `pulso`) y los números de Freesound de sus tomas, que tienen que ser CC0. `python herramientas/bajar-efectos.py` los baja, los recorta y los nivela; además de ffmpeg necesita numpy. Si añades una clave, ponle nombre en `AMBIENTES` o `GOLPES`, dentro de `public/efectos.js`.

## Despliegue

Solo assets estáticos en el Worker `nephei-keeper`, conectado con Workers Builds: cada push a `main` lo despliega.
