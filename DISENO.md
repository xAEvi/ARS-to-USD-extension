# ARS to USD - Documento de diseño

Extensión de Chrome (Manifest V3) que convierte a dólares un monto en pesos argentinos que el
usuario subraya en cualquier página, usando la cotización oficial, alguna de las cotizaciones
alternativas del dólar, o un valor manual definido por el usuario.

## 1. Alcance

### 1.1. Dentro del alcance

- Navegador: Chrome (Manifest V3) únicamente.
- Conversión unidireccional: ARS a USD.
- Cotización: dólar oficial, blue, bolsa (MEP), contado con liqui (CCL), tarjeta, mayorista o
  cripto, obtenidas de una API pública, o valor manual ingresado por el usuario.
- Disparo: el usuario subraya el monto que quiere convertir. No hay escaneo de página ni
  detección automática.
- Presentación: un panel flotante junto a la selección, sin modificar el DOM de la página.
- Activación: la extensión está activa por defecto en cualquier sitio; el popup permite
  desactivarla en el sitio actual, con la preferencia recordada entre visitas.

### 1.2. Fuera del alcance

- Firefox, Edge u otros navegadores.
- Conversión inversa (USD a ARS).
- Corrección de falsos positivos o memoria de montos aprendidos: no aplican cuando quien decide
  qué convertir es el usuario y no un detector.
- Selección dentro de `iframe` de origen cruzado y dentro de Shadow DOM cerrado.
- Historial de cotizaciones o gráficos.

Las limitaciones de Shadow DOM e `iframe` se documentan como conocidas y aceptadas.

## 2. Decisiones de arquitectura

### 2.1. Extensión y no script externo

Los precios en sitios argentinos se renderizan mayoritariamente por JavaScript (SPAs, carga
diferida, actualización de carritos). Un scraper externo obtiene HTML muerto y pierde ese
contenido. Además la GUI necesita estar acoplada a la pestaña activa, cosa que un proceso externo
no puede resolver sin un canal adicional.

### 2.2. Disparo por selección, no por escaneo

Una versión anterior de este proyecto escaneaba la página entera al apretar un botón y decidía
sola qué montos eran precios en pesos, con un aparato de detección por marcador de moneda, señales
de contexto de página (dominio, locale, JSON-LD) y niveles de confianza. Ese modelo generaba tanto
falsos positivos como falsos negativos, y necesitaba una capa entera de corrección: marcado de
falsas alarmas, reglas de supresión persistentes por sitio, memoria de montos aprendidos.

El modelo actual invierte la responsabilidad. El usuario subraya el monto que quiere convertir; ese
gesto es la confirmación de que ahí hay un precio, y es una señal más confiable que cualquier
heurística. La extensión no evalúa si el monto está en pesos, en dólares o en otra moneda, ni
intenta adivinar la nacionalidad del sitio: si el usuario lo subrayó, lo quiere convertido. La
consecuencia se acepta explícitamente: subrayar un monto que ya estaba en dólares produce un
resultado sin sentido, de la misma forma en que escribir mal un número en una calculadora produce
un resultado sin sentido. Es responsabilidad del usuario, no algo que la extensión pueda resolver
sin volver a necesitar todo el aparato de detección que este cambio elimina.

Lo único que la extensión valida es que la selección tenga *forma* de valor monetario, para que el
panel no aparezca cuando el usuario subraya texto por cualquier otro motivo. Ver sección 3.

### 2.3. Activa por defecto, con content script declarativo

Como no hace falta decidir nada sobre el contenido de la página, tampoco hace falta un gesto previo
del usuario para empezar a escuchar selecciones. El content script se declara en el manifiesto
(`content_scripts` con `matches` sobre todo `http`/`https`) y Chrome lo inyecta solo en cada carga
de página, sin intervención de la extensión.

Esto es un cambio de rumbo consciente respecto a versiones anteriores del proyecto, que preferían
activación manual por pestaña con `activeTab` para evitar la advertencia de permisos amplios que
Chrome muestra al instalar una extensión con `content_scripts` declarativo sobre todos los sitios
("leer y cambiar tus datos en todos los sitios web que visitás"). Se decidió pagar ese costo a
cambio de que la extensión funcione sin que el usuario tenga que acordarse de activarla en cada
pestaña nueva.

El popup conserva un interruptor, invertido respecto al de antes: por defecto la extensión está
activa, y el interruptor sirve para desactivarla en el sitio actual. Ver sección 6.

### 2.4. Núcleo puro separado de la capa de página

El filtro que decide si una selección es un monto convertible, el parseo del número, la conversión
y el formato de salida viven en funciones puras sin acceso a `document` ni a `window`. La capa de
página solo las invoca. Esto permite testear esa lógica contra una tabla de casos sin levantar un
navegador.

La firma central es:

```typescript
readSelection(text: string): SelectedAmount | undefined;
```

### 2.5. Fetch de cotización en el service worker

La llamada a la API se hace desde el background y nunca desde el content script. Motivos:

- La Content Security Policy de la página puede bloquear peticiones salientes del content script.
- Centraliza la caché: una sola cotización compartida por todas las pestañas.
- El `host_permissions` de la API queda acotado al background.

## 3. Lectura de la selección

### 3.1. El filtro

La extensión no clasifica moneda ni infiere nacionalidad de sitio. El único criterio es la forma de
la selección: tiene que ser un número, con un marcador de moneda opcional adelante o atrás, y nada
más. Nada de palabras sueltas, nada de dos montos, nada de un monto dentro de una frase.

```typescript
export type SelectedAmount = {
  /** The selected text, trimmed, as the panel should echo it back. */
  rawText: string;

  /** The parsed numeric value, in Argentine pesos. */
  valueArs: number;
};

function readSelection(text: string): SelectedAmount | undefined;
```

Reglas, todas necesarias para devolver un resultado:

1. El texto recortado de espacios no puede estar vacío.
2. No puede superar 24 caracteres. Entra cómodo un `US$ 1.234.567.890,12` y no entra una oración.
3. Tiene que matchear un patrón anclado (`^...$`) de número con marcador opcional. El anclaje es lo
   que descarta un monto dentro de una frase: sin él, cualquier texto que contenga un número en
   algún lugar pasaría el filtro.
4. La cantidad de dígitos que el usuario escribió no puede superar 12. Un número de trece dígitos
   no suele ser un precio: es más probable que sea un número de tarjeta, un teléfono o un código de
   seguimiento. Este límite es sobre lo escrito, antes de aplicar una palabra de escala; ver la
   sección 3.2 para el límite sobre el valor final.
5. El valor parseado tiene que ser finito y mayor a cero, y el valor final (después de aplicar una
   palabra de escala) no puede superar el billón de pesos. Ver sección 3.2.

Cualquier selección que no cumpla todo esto se ignora en silencio: sin panel, sin aviso. El usuario
estaba subrayando para otra cosa y la extensión no tiene por qué interrumpirlo.

### 3.2. Escalas: sufijos y palabras que multiplican

Además del número literal, la selección puede llevar una palabra o un sufijo que multiplica el
valor: `100k`, `2 palos`, `1 millón`. Esto es distinto de los marcadores de moneda de la sección
3.3, que son ruido descartable. Una palabra de escala cambia el valor, así que reconocerla mal es
mucho más costoso que ignorar mal un marcador: `2` y `2 palos` difieren en un factor de un millón.
La consecuencia se acepta explícitamente, en la misma línea que la sección 2.2: un error acá
produce un número equivocado con la misma apariencia de válido que uno correcto, y no hay forma de
evitarlo del todo sin volver a necesitar un aparato de inferencia. La mitigación es ser conservador
con qué se reconoce como escala, no intentar cubrir cada forma posible.

| Forma | Factor | Ejemplo |
| --- | --- | --- |
| `k`, `K` | 1.000 | `100k`, `22,5k` |
| `M`, `m`, `MM` | 1.000.000 | `1M`, `20m`, `1MM` |
| `mil` | 1.000 | `100 mil` |
| `millón`, `millones` (con o sin tilde) | 1.000.000 | `1 millón`, `2 millones` |
| `luca`, `lucas` | 1.000 | `10 lucas` |
| `palo`, `palos` | 1.000.000 | `2 palos` |
| `mango`, `mangos` | 1 | `500 mangos` |
| `gamba`, `gambas` | 100 | `2 gambas` |
| `melón`, `melones` (con o sin tilde) | 1.000.000 | `2 melones` |

Decisiones puntuales:

- **`m` minúscula significa millón, igual que `M`, no "mil".** En el uso real que motivó esto, "mil"
  se abrevia `k`, no `m`; el único multiplicador que usa la letra `m` es millón, así que no hay
  ambigüedad práctica que resolver, aunque `m` sea ambigua en teoría contra otras convenciones.
- **`verde` (dólares) no es una escala.** `500 verdes` o `2 palos verdes` significan montos en
  dólares, no en pesos multiplicados. Convertirlos como si fueran pesos da un número sin sentido, y
  no hay forma de leer la moneda correcta sin volver a inferir contexto. Se dejan fuera a propósito:
  una selección con `verde` no matchea ninguna de las formas de la tabla y se rechaza como cualquier
  otra selección sin sentido.
- **Los sufijos pegados (`k`, `M`, `m`, `MM`) no toleran una letra después.** El anclaje de la
  sección 3.1 ya lo garantiza: si después del sufijo queda una letra sin consumir (`22.5kg`, `50km`,
  `100kb`, `3kW`, `5m2`), nada en el patrón puede absorberla y la selección entera se rechaza. No
  hace falta una regla aparte para esto.
- **`mango` no multiplica, es sinónimo de "peso" (factor 1).** Se incluye igual porque aparece
  seguido en texto real ("500 mangos").
- Fracciones (`medio palo`), números escritos en palabras y rangos quedan fuera de alcance. Ver
  sección 6 de las decisiones que motivaron este cambio para el detalle de por qué.

El tope de valor final (sección 3.1, regla 5) es un billón de pesos (`10^12`). Existe porque el
tope de dígitos escritos no alcanza una vez que hay un multiplicador de por medio:
`999999999999k` tiene 12 dígitos, pasa esa regla, y da un valor en los cuatrillones sin este
segundo límite.

### 3.3. Marcadores de moneda como ruido tolerado

A diferencia de una versión anterior de este proyecto, los marcadores de moneda (`$`, `ARS`, `AR$`,
`pesos`, pero también `USD`, `U$S`, `US$`, `dólares`) no se clasifican ni se usan para aceptar o
rechazar una selección. Son ruido tolerado alrededor del número: `$1.999` y `US$ 100` se aceptan
por igual, porque el usuario los subrayó y no porque el marcador diga algo sobre la moneda real del
monto.

### 3.4. Parseo del número

El formato es-AR usa punto como separador de miles y coma como separador decimal. El caso ambiguo
es un punto sin coma acompañante.

Reglas, en orden:

1. Si hay coma, la coma es el separador decimal y los puntos son de miles. `1.234,56` da `1234.56`.
2. Si hay solo puntos y el último grupo tiene exactamente 3 dígitos, todos los puntos son de miles.
   `1.500` da `1500`. `1.234.567` da `1234567`.
3. Si hay solo un punto y el grupo final tiene 1 o 2 dígitos, es decimal. `1.50` da `1.5`.
4. Si no hay separadores, se parsea directo.

La regla 2 es la que resuelve el caso frecuente de `$1.500` en un sitio argentino. Cuando el texto
seleccionado viene en formato en-US inequívoco (`1,234.56`), se interpreta igual como el valor que
representa: la ambigüedad ya no baja ninguna confianza, porque no hay confianza que bajar.

### 3.5. Selección en la página

- Se escucha `mouseup` y `keyup`, no `selectionchange`, que dispara en cada píxel de un arrastre.
- El texto se obtiene con `Range.toString()` y no con el `textContent` del nodo ancla, porque la
  selección cruza nodos con frecuencia: el símbolo en un `<span>` y el número en otro es un patrón
  común en sitios de e-commerce.
- Se ignoran selecciones dentro de `[contenteditable]`, `input` y `textarea`. Si había un panel
  abierto de una selección anterior, se cierra.

## 4. Cotización

### 4.1. Fuente

Endpoint base: `https://dolarapi.com/v1/dolares/<casa>`. Es público, sin API key y con CORS
abierto. Casas disponibles:

| Casa | Slug |
| --- | --- |
| Oficial | `oficial` |
| Blue | `blue` |
| Bolsa (MEP) | `bolsa` |
| Contado con liqui (CCL) | `contadoconliqui` |
| Tarjeta | `tarjeta` |
| Mayorista | `mayorista` |
| Cripto | `cripto` |

Respuesta relevante, igual en todas las casas:

```json
{
  "compra": 1010.0,
  "venta": 1050.0,
  "fechaActualizacion": "2026-08-10T14:00:00.000Z"
}
```

Se usa el valor de `venta` por defecto, que es el precio al que se compran dólares y por lo tanto el
que representa el costo real de convertir. El lado (`compra`, `venta` o promedio) queda como opción
de configuración, común a todas las casas.

Fuente de respaldo si el primario falla: `https://api.bluelytics.com.ar/v2/latest`. Solo cubre las
casas `oficial` y `blue`, que son las únicas que esa API expone; para el resto de las casas, si
dolarapi.com falla, no hay segundo intento y se pasa directo a la caché vencida o al error.

### 4.2. Caché y frescura

- TTL por defecto: 10 minutos.
- Cada casa tiene su propia entrada de caché en `chrome.storage.local` (clave `rate-cache:<casa>`),
  junto a su timestamp de obtención y la fecha de actualización informada por la fuente. Cambiar de
  casa en el popup no reutiliza una cotización vieja de otra.
- Si la API falla y existe un valor cacheado vencido para esa casa, se usa igual pero se marca
  `isStale: true`. El popup y el panel deben reflejar esa condición de forma visible.
- Si no hay valor cacheado y la API falla, la extensión no convierte nada y lo informa. No se
  inventa una cotización.

El popup y el panel siempre muestran la fuente, el valor y la antigüedad del dato. Convertir con
una cotización vieja sin avisar es peor que no convertir.

### 4.3. Modo manual

El usuario puede fijar un valor manual. Cuando `rateSource` es `'manual'`, el background ni siquiera
consulta la API.

Validación del input: número positivo, mayor a cero, con tope superior de 1.000.000 para evitar
errores de tipeo silenciosos.

## 5. El panel flotante

### 5.1. Estrategia

No se toca el DOM de la página en ningún caso: no hay nada que anotar, revertir, ni sincronizar con
mutaciones del sitio. El panel es un elemento propio, montado en un host con Shadow DOM adjunto al
`body`, para que los estilos del sitio no lo deformen y los propios no se filtren hacia afuera.

```typescript
export type PanelContent =
  | {
      status: 'ok';
      rawText: string;
      converted: string;
      sourceLabel: string;
      ageLabel: string;
      isStale: boolean;
    }
  | { status: 'error'; rawText: string; message: string };

function showAmountPanel(
  getAnchorRect: () => DOMRect | undefined,
  content: PanelContent,
  onClose: () => void,
): void;

function closeAmountPanel(): void;
```

### 5.2. Posicionamiento

El panel se ancla con `Range.getBoundingClientRect()` de la selección, con corrección para no
salirse del viewport, y se reposiciona en `scroll` y `resize`. `getAnchorRect` es una función y no
un valor fijo: se vuelve a evaluar en cada reposicionamiento, contra el mismo `Range` clonado al
abrir el panel. Si en algún momento deja de devolver un rect (la selección ya no existe), el panel
se cierra solo.

### 5.3. Cierre

- Click afuera del panel, detectado con `event.composedPath()`, que atraviesa el límite del Shadow
  DOM y permite distinguir un click dentro del panel de uno fuera de él.
- Tecla `Escape`.
- Al no encontrar un monto válido en la selección siguiente (ver sección 3.1).

### 5.4. Contenido

Muestra el monto original tal como fue seleccionado, el monto convertido, y la fuente y antigüedad
de la cotización usada, con el aviso de dato vencido de la sección 4.2 cuando corresponde. Si
`RATE_GET` devuelve un error, el panel lo muestra en vez de fallar en silencio.

Formato de salida del monto convertido:

```typescript
new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
```

Prefijo `USD`. Ejemplo: `USD 12,50`. Valores menores a un centavo se muestran como `< USD 0,01`.

## 6. Activación por sitio

### 6.1. Modelo

La extensión está activa por defecto en cualquier página `http`/`https`. El popup permite
desactivarla en el sitio actual; esa preferencia es la única que se persiste, como lista de
exclusión por hostname.

```typescript
export type DisabledHostsState = Array<string>;
```

Persistencia: `chrome.storage.local`, clave `disabled-hosts`. `local` y no `sync`: es una
preferencia de navegación por dispositivo, no algo que deba seguir al usuario entre instalaciones
de Chrome como sí lo hace la configuración de cotización.

Los hostnames se normalizan (minúsculas, sin el prefijo `www.`) antes de guardarse o compararse, así
`www.example.com` y `example.com` comparten una sola entrada.

### 6.2. Al cargar una página

El content script, declarado en el manifiesto y sin necesidad de que el popup lo inyecte, consulta
al cargar si su propio hostname está en la lista de exclusión y arranca activo o inactivo según esa
respuesta.

### 6.3. Cambio en caliente

Si el usuario cambia el interruptor del popup mientras la pestaña ya está abierta, el popup persiste
el cambio y además le manda un mensaje directo (`ACTIVATE` o `DEACTIVATE`) al content script de esa
pestaña, para que el efecto sea inmediato sin necesidad de recargar la página.

### 6.4. Indicador

El badge del ícono de la extensión solo aparece cuando el sitio actual está desactivado (texto
`OFF`, en gris). Estar activa es el estado normal y no necesita anunciarse; estar desactivada es la
excepción y sí vale la pena que se note sin abrir el popup.

## 7. Estructura del proyecto

```
ARS-to-USD-script/
  src/
    core/
      types.ts             Tipos compartidos del núcleo.
      patterns.ts           Patrón anclado de valor monetario.
      number-parser.ts     Parseo de formatos numéricos es-AR y en-US.
      selection.ts         Función pura de lectura de la selección.
      converter.ts          Conversión de monto a USD.
      formatter.ts          Formato de salida del monto convertido.
      hostname.ts           Normalización de hostnames.
    page/
      panel.ts              Panel flotante en Shadow DOM.
    background/
      rate-service.ts       Obtención, caché por casa y fallback de la cotización.
      router.ts             Ruteo de mensajes (RATE_GET/RATE_REFRESH).
    shared/
      messages.ts           Contratos de mensajería tipados.
      storage.ts             Acceso tipado a chrome.storage.
      disabled-hosts.ts     Lista de exclusión por sitio, y el badge.
      rate-display.ts       Formato de fuente y antigüedad de cotización, compartido.
    config/
      schema.ts             Tipo de configuración.
      defaults.ts            Valores por defecto y endpoints.
      store.ts               Lectura y escritura de la configuración.
  entrypoints/
    background.ts
    content.ts               Content script declarativo (matches http/https).
    popup/
  tests/
    fixtures/
    *.test.ts
    page/panel.test.ts       Test de DOM del panel, con jsdom.
```

`src/core/` es código puro sin acceso al DOM. `src/page/` es la única capa que toca `document`, y se
testea con `@vitest-environment jsdom`. `entrypoints/` es orquestación fina sin tests unitarios
propios.

## 8. Configuración

```typescript
export type ArsToUsdConfiguration = {
  /** Which dollar quote to use: a dolarapi.com house, or the manual rate. */
  rateSource: RateHouse | 'manual';

  /** Manual exchange rate in ARS per USD. Only used when rateSource is manual. */
  manualRate: number;

  /** Side of the quote used for the conversion. */
  rateSide: RateSide;

  /** Cache lifetime for the rate, in milliseconds. */
  rateTtlMs: number;
};
```

Valores por defecto en `config/defaults.ts`: `rateSource: 'oficial'`, `manualRate: 1000`,
`rateSide: 'venta'`, `rateTtlMs: 600000` (10 minutos). Los endpoints se pueden sobreescribir en
tiempo de build mediante variables `VITE_` para no hardcodear URLs en el código de dominio.

Persistencia:

- `chrome.storage.sync`: configuración de cotización del usuario.
- `chrome.storage.local`: caché de cotización por casa y lista de sitios desactivados.

## 9. Mensajería

```typescript
export type Message =
  | { type: 'RATE_GET' }
  | { type: 'RATE_REFRESH' }
  | { type: 'ACTIVATE' }
  | { type: 'DEACTIVATE' };
```

`RATE_GET`/`RATE_REFRESH` van de cualquier página de la extensión (popup o content script) al
background, resueltos contra `rate-service.ts`. `ACTIVATE`/`DEACTIVATE` van del popup directo al
content script de la pestaña actual, vía `chrome.tabs.sendMessage`, para el cambio en caliente de
la sección 6.3.

Flujo de una conversión:

1. El usuario subraya un monto en una página con la extensión activa.
2. El content script llama a `readSelection` sobre el texto de la selección. Si no matchea, no pasa
   nada.
3. Si matchea, el content script pide la cotización vigente al background (`RATE_GET`), que
   responde desde caché o desde la API según la casa configurada.
4. El content script convierte el monto y muestra el panel anclado a la selección.

## 10. Manifiesto

```json
{
  "manifest_version": 3,
  "name": "ARS to USD",
  "permissions": ["storage"],
  "host_permissions": ["https://dolarapi.com/*", "https://api.bluelytics.com.ar/*"],
  "action": { "default_popup": "popup.html" },
  "background": { "service_worker": "background.js" },
  "content_scripts": [
    { "matches": ["http://*/*", "https://*/*"], "js": ["content-scripts/content.js"] }
  ]
}
```

No hay `activeTab` ni `scripting`: el content script se registra de forma declarativa, sin
inyección programática. Esto implica que Chrome muestra la advertencia de permisos amplios al
instalar ("leer y cambiar tus datos en todos los sitios web que visitás"), aceptada según lo
razonado en la sección 2.3.

Nota de implementación de WXT: el archivo tiene que llamarse `content.ts` (o `*.content.ts`) para
que el framework lo registre como `content_scripts` en el manifiesto. Con otro nombre, las opciones
de `defineContentScript` (incluido `matches`) se ignoran en silencio y el script queda sin uso.

## 11. Stack y herramientas

- TypeScript en modo estricto.
- WXT como framework de extensión, que resuelve la generación del manifiesto y el hot reload de
  content scripts.
- Vitest para los tests, con jsdom para los que tocan DOM.
- Prettier para formato.
- Yarn como gestor de paquetes.

## 12. Testing

El foco está en el núcleo puro. Los tests de DOM son secundarios.

- `number-parser.test.ts`: tabla de casos de formatos es-AR y en-US, incluidos los ambiguos.
- `selection.test.ts`: tabla de casos de `readSelection`, con selecciones que deben aceptarse y
  selecciones que deben rechazarse por cada regla del filtro de la sección 3.1, incluidas las
  escalas de la sección 3.2 y sus colisiones (`22.5kg` contra `22.5k`, montos en dólares como
  `500 verdes`, el tope de valor final).
- `rate-service.test.ts`: caché por casa, fallback a bluelytics solo para oficial y blue, modo
  manual, y el caso de una casa sin fallback que falla directo a caché vencida o error.
- `disabled-hosts.test.ts` y `hostname.test.ts`: persistencia de la lista de exclusión y
  normalización de hostnames.
- `page/panel.test.ts`: posicionamiento, contenido y cierre del panel, con `@vitest-environment
  jsdom`.

## 13. Plan de trabajo

Fases completas, en orden:

| Fase | Contenido | Resultado |
| --- | --- | --- |
| 1 | Eliminación del pipeline de detección automática, supresión y conversión manual por menú contextual de la versión anterior | Árbol limpio |
| 2 | `readSelection` y el patrón anclado de valor monetario, con tabla de casos | Núcleo verificable sin navegador |
| 3 | Activación por pestaña (superada por la fase 5) | Ciclo de activación manual |
| 4 | Lectura de la selección en la página y panel flotante | Flujo completo |
| 5 | Cotizaciones alternativas de dolarapi.com y activación por defecto en todo sitio | Ciclo de cotización y activación en su forma actual |
| 6 | Montos abreviados y en lunfardo (`100k`, `2 palos`, `1 millón`) | Extensión en su forma actual |

## 14. Riesgos conocidos

| Riesgo | Mitigación |
| --- | --- |
| El panel aparece cuando el usuario subraya texto por otro motivo | Filtro de forma de la sección 3.1, con umbrales ajustables |
| Umbrales de largo y dígitos mal calibrados, que dejan afuera montos válidos | Cubiertos con tests, ajustables con uso real |
| Convertir un monto que ya estaba en dólares | Sin mitigación, por decisión de producto. Queda en criterio del usuario |
| Advertencia de permisos amplios al instalar, por el content script declarativo sobre todo sitio | Aceptada por decisión explícita de producto (sección 2.3) |
| Cotización vencida usada silenciosamente | Marca `isStale` visible en el popup y en el panel |
| Cambio o caída de la API de cotización | Fuente de respaldo para oficial y blue, endpoints configurables en build, modo manual siempre disponible |
| Montos en Shadow DOM cerrado o `iframe` de origen cruzado | Limitación documentada, sin mitigación |
| Sitios que cancelan o reescriben la selección con sus propios handlers | Se detecta en uso real, sin mitigación previa conocida |
| Una palabra de escala mal reconocida multiplica el valor por mil o por un millón, con la misma apariencia de válido que un resultado correcto | Lista conservadora de escalas (sección 3.2), tope de valor final, sin mitigación adicional posible sin volver a inferir contexto |
| `k`/`M`/`m` pegados a una unidad no monetaria (`22.5kg`, `50km`, `5m2`) | El anclaje de la selección exige que no quede ninguna letra sin consumir después del sufijo; la selección entera se rechaza |
| Un monto en dólares con escala lunfarda (`500 verdes`, `2 palos verdes`) leído como si fuera en pesos | `verde` no está en la lista de escalas reconocidas; la selección se rechaza igual que cualquier forma sin sentido |
