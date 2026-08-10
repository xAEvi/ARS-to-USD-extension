# ARS to USD

Extension de Chrome (Manifest V3) que detecta montos expresados en pesos argentinos dentro de una
pagina web y anexa su equivalente en dolares, usando la cotizacion oficial o un valor manual
definido por el usuario.

El precio original nunca se modifica: la extension solo agrega el equivalente en dolares a
continuacion, y todo el proceso es reversible con un click.

## Estado

Las 8 fases del plan de trabajo (ver `DISENO.md`, seccion 13) estan completas: deteccion y parseo
de montos, cotizacion con cache y fallback, anotacion en el DOM, popup, supresion de falsos
positivos persistente por sitio, uso de datos estructurados (JSON-LD), soporte de SPAs via
`MutationObserver`, y limites de rendimiento para paginas con listados grandes.

Version actual: `0.1.0`.

## Funcionalidades

- Deteccion de montos en pesos argentinos por simbolo (`$`, `ARS`, `AR$`) o palabra (`pesos`),
  con distintos niveles de confianza segun que tan ambigua sea la senal.
- Conversion a dolares con la cotizacion oficial (`dolarapi.com`, con `bluelytics.com.ar` como
  respaldo) o con un valor manual fijado por el usuario.
- Activacion manual desde el popup: nada se escanea ni se modifica hasta que el usuario aprieta
  "Convertir". El boton "Revertir" deshace la anotacion por completo.
- Marcado de falsas alarmas: click en un monto convertido para indicar "No es un precio" o "No
  esta en pesos", con la opcion de aplicar la correccion a todos los casos similares de la pagina.
  La marca persiste por sitio (`chrome.storage.local`) y se puede revisar o quitar desde el popup.
- Modo "mostrar suprimidos": en vez de ocultar los montos bloqueados por una regla, los marca con
  un indicador discreto que permite deshacer la regla y convertir el monto sin recargar la pagina.
- Uso de JSON-LD (schema.org) cuando la pagina lo declara, para reconocer con confianza alta los
  precios ya etiquetados como ARS y descartar los declarados en otra moneda.
- Deteccion continua en sitios que renderizan por JavaScript (SPAs): mientras la sesion de
  conversion sigue activa, los precios que aparecen despues del primer escaneo tambien se anotan.
- Tope de anotaciones por pagina y recorrido en lotes para no colgar el navegador en listados con
  miles de precios.
- Conversion manual desde el menu contextual: seleccionar un monto que la deteccion automatica no
  reconocio y convertirlo a mano. La extension recuerda el lugar por sitio, asi paginas similares
  lo convierten solas de ahi en adelante.

## Instalacion (para desarrollo)

Requiere Node.js y Yarn.

```bash
yarn install
yarn build
```

Esto genera la extension sin empaquetar en `.output/chrome-mv3`. Para cargarla en Chrome:

1. Abrir `chrome://extensions`.
2. Activar "Modo de desarrollador".
3. "Cargar descomprimida" y seleccionar la carpeta `.output/chrome-mv3`.

Para generar un `.zip` instalable (por ejemplo, para subir a la Chrome Web Store):

```bash
yarn zip
```

El archivo queda en `.output/`.

## Uso

1. Click en el icono de la extension para abrir el popup.
2. Revisar la cotizacion mostrada (fuente, valor y antiguedad) o cambiar a modo manual.
3. Click en "Convertir" para anotar los precios en pesos de la pestana activa.
4. Click en un monto convertido para marcarlo como falsa alarma si la deteccion es incorrecta.
5. Click en "Revertir" para deshacer todas las anotaciones de la pagina.

## Configuracion

La configuracion del usuario vive en `chrome.storage.sync` (`src/config/schema.ts`). El popup
expone algunos campos directamente (fuente de la cotizacion, valor manual, "mostrar montos
suprimidos"); el resto tiene un valor por defecto razonable y solo se ajusta editando
`chrome.storage.sync` a mano:

| Campo | Default | Descripcion |
| --- | --- | --- |
| `rateSource` | `official` | Cotizacion oficial o manual. |
| `manualRate` | `1000` | Valor manual (ARS por USD), si `rateSource` es `manual`. |
| `rateSide` | `venta` | Lado de la cotizacion oficial a usar. |
| `rateTtlMs` | `600000` (10 min) | Tiempo de vida de la cotizacion cacheada. |
| `minConfidence` | `medium` | Confianza minima para convertir un monto detectado. |
| `maxRulesPerHost` | `200` | Tope de reglas de supresion guardadas por sitio (poda LRU). |
| `showSuppressed` | `false` | Muestra un marcador en los montos suprimidos en vez de ocultarlos. |
| `watchMutations` | `true` | Mantiene la deteccion activa tras cambios de DOM (soporte de SPAs). |
| `maxAnnotations` | `500` | Tope de anotaciones por pagina. |

## Desarrollo

```bash
yarn dev          # modo desarrollo de WXT, con recarga en caliente
yarn test         # corre la suite de Vitest una vez
yarn test:watch   # corre la suite en modo watch
yarn typecheck    # chequeo de tipos con tsc --noEmit
yarn format       # formatea el proyecto con Prettier
```

El nucleo de deteccion (`src/core/`) es codigo puro sin acceso al DOM y es lo que mas cobertura de
tests tiene; la capa de pagina (`src/page/`) se testea con jsdom. `entrypoints/` es orquestacion
fina y no tiene tests unitarios propios.

## Documentacion

- [`DISENO.md`](./DISENO.md): documento de diseño completo (arquitectura, modelo de deteccion,
  supresion de falsos positivos, mensajeria, riesgos conocidos).
- [`CHANGELOG.md`](./CHANGELOG.md): historial de cambios del proyecto.

## Limitaciones conocidas

- Solo Chrome (Manifest V3). No hay soporte para Firefox, Edge u otros navegadores.
- Conversion unidireccional: solo de pesos argentinos a dolares.
- No se detectan precios dentro de `iframe` de origen cruzado ni de Shadow DOM cerrado.
- No hay cotizaciones alternativas (blue, MEP, contado con liquidacion, tarjeta, cripto).
