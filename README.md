# ARS to USD

Extension de Chrome (Manifest V3) que convierte a dolares un monto en pesos argentinos que
subrayes en cualquier pagina, usando la cotizacion oficial, alguna de las cotizaciones
alternativas del dolar, o un valor manual definido por vos.

La extension no toca el contenido de la pagina: no hay nada que anotar ni revertir. El resultado
se muestra en un panel flotante junto a la seleccion.

## Estado

Version actual: `1.0.1`. Ver `DISENO.md` seccion 13 para el detalle de las fases completas.

## Funcionalidades

- Activa por defecto en cualquier sitio `http`/`https`. El popup permite desactivarla en el sitio
  actual, con la preferencia recordada entre visitas.
- Subrayar un monto en pesos muestra un panel con su equivalente en dolares, la fuente de la
  cotizacion usada y su antiguedad, con aviso cuando el dato esta vencido.
- Cotizacion oficial, blue, bolsa (MEP), contado con liqui (CCL), tarjeta, mayorista o cripto
  (`dolarapi.com`, con `bluelytics.com.ar` como respaldo solo para oficial y blue), o un valor
  manual fijado por vos. El popup muestra en todo momento cual esta usando.
- No hay deteccion automatica de precios: el gesto de subrayar es la unica confirmacion que la
  extension necesita.

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

Al instalar vas a ver la advertencia de que la extension puede leer y cambiar tus datos en todos
los sitios web que visitas. Es esperada: ver `DISENO.md` seccion 2.3 para por que se acepto ese
costo.

Para generar un `.zip` instalable (por ejemplo, para subir a la Chrome Web Store):

```bash
yarn zip
```

El archivo queda en `.output/`.

## Uso

1. Click en el icono de la extension para revisar la cotizacion (fuente, valor y antiguedad) o
   cambiarla.
2. En cualquier pagina, subraya un monto en pesos. El panel aparece solo con el equivalente en
   dolares.
3. Si un sitio en particular no te interesa que la extension actue ahi, destilda "Activa en este
   sitio" desde el popup. La preferencia se guarda para ese sitio.

## Configuracion

La configuracion de cotizacion vive en `chrome.storage.sync` (`src/config/schema.ts`) y se edita
entera desde el popup:

| Campo | Default | Descripcion |
| --- | --- | --- |
| `rateSource` | `oficial` | Casa del dolar a usar (`oficial`, `blue`, `bolsa`, `contadoconliqui`, `tarjeta`, `mayorista`, `cripto`) o `manual`. |
| `manualRate` | `1000` | Valor manual (ARS por USD), si `rateSource` es `manual`. |
| `rateSide` | `venta` | Lado de la cotizacion a usar (`compra`, `venta` o `promedio`). |
| `rateTtlMs` | `600000` (10 min) | Tiempo de vida de la cotizacion cacheada, por casa. |

La lista de sitios donde la extension esta desactivada vive por separado, en
`chrome.storage.local`, y se administra desde el interruptor del popup.

## Desarrollo

```bash
yarn dev          # modo desarrollo de WXT, con recarga en caliente
yarn test         # corre la suite de Vitest una vez
yarn test:watch   # corre la suite en modo watch
yarn typecheck    # chequeo de tipos con tsc --noEmit
yarn format       # formatea el proyecto con Prettier
```

El nucleo (`src/core/`) es codigo puro sin acceso al DOM y es lo que mas cobertura de tests tiene;
la unica capa que toca `document` es `src/page/panel.ts`, testeada con jsdom. `entrypoints/` es
orquestacion fina y no tiene tests unitarios propios.

## Documentacion

- [`DISENO.md`](./DISENO.md): documento de diseno completo (arquitectura, filtro de seleccion,
  cotizacion, panel, activacion por sitio, riesgos conocidos).
- [`CHANGELOG.md`](./CHANGELOG.md): historial de cambios del proyecto.

## Limitaciones conocidas

- Solo Chrome (Manifest V3). No hay soporte para Firefox, Edge u otros navegadores.
- Conversion unidireccional: solo de pesos argentinos a dolares.
- No se detectan selecciones dentro de `iframe` de origen cruzado ni de Shadow DOM cerrado.
- Subrayar un monto que ya esta en dolares produce un resultado sin sentido: la extension no
  infiere la moneda del texto seleccionado, queda en criterio de quien selecciona.
