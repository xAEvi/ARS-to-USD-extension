# ARS to USD - Documento de diseño

Extensión de Chrome (Manifest V3) que detecta montos expresados en pesos argentinos dentro de una
página y anexa su equivalente en dólares, usando la cotización oficial o un valor manual definido
por el usuario.

## 1. Alcance

### 1.1. Dentro del alcance

- Navegador: Chrome (Manifest V3) únicamente.
- Conversión unidireccional: ARS a USD.
- Cotización: dólar oficial obtenido de una API pública, o valor manual ingresado por el usuario.
- Presentación: el precio original se conserva intacto y el equivalente en dólares se anexa a
  continuación.
- Activación: manual, por acción explícita del usuario desde el popup de la extensión.
- Corrección por parte del usuario: marcar una conversión como falsa alarma y desmarcarla, con
  persistencia por sitio entre visitas.

### 1.2. Fuera del alcance (v1)

- Firefox, Edge u otros navegadores.
- Conversión inversa (USD a ARS).
- Cotizaciones alternativas (blue, MEP, contado con liquidación, tarjeta, cripto).
- Contenido dentro de `iframe` de origen cruzado y dentro de Shadow DOM cerrado.
- Ejecución automática al cargar la página.
- Historial de cotizaciones o gráficos.

Las limitaciones de Shadow DOM e `iframe` se documentan como conocidas y aceptadas.

## 2. Decisiones de arquitectura

### 2.1. Extensión y no script externo

Los precios en sitios argentinos se renderizan mayoritariamente por JavaScript (SPAs, carga
diferida, actualización de carritos). Un scraper externo obtiene HTML muerto y pierde ese
contenido. Además la GUI necesita estar acoplada a la pestaña activa, cosa que un proceso externo
no puede resolver sin un canal adicional.

### 2.2. Inyección programática y no `content_scripts` declarativo

Como la activación es manual, el content script se inyecta con `chrome.scripting.executeScript`
sobre la pestaña activa cuando el usuario lo pide. Consecuencias:

- El manifiesto no declara `content_scripts` ni `host_permissions` de terceros.
- El permiso `activeTab` se otorga por gesto del usuario y expira al navegar, lo cual es
  exactamente la semántica que se busca.
- No hace falta blocklist de dominios: si el usuario no aprieta el botón, la extensión no toca
  nada.

### 2.3. Núcleo puro separado de la capa DOM

Toda la lógica de detección, parseo y conversión vive en funciones puras sin acceso a `document` ni
a `window`. La capa DOM solo las invoca. Esto permite testear el detector contra un corpus de
strings reales sin levantar un navegador, que es donde se concentra el riesgo real del proyecto.

La firma central es:

```typescript
detect(text: string, context: PageContext): Array<DetectedAmount>;
```

### 2.4. Fetch de cotización en el service worker

La llamada a la API se hace desde el background y nunca desde el content script. Motivos:

- La Content Security Policy de la página puede bloquear peticiones salientes del content script.
- Centraliza la caché: una sola cotización compartida por todas las pestañas.
- El `host_permissions` de la API queda acotado al background.

## 3. Detección

El objetivo no es determinar si una página es argentina, sino si un monto puntual está expresado en
pesos. La nacionalidad del sitio es una señal de contexto que aumenta o disminuye la confianza,
nunca el criterio de decisión.

### 3.1. Contexto de página

Se construye una única vez por ejecución y se pasa a todas las llamadas del detector.

```typescript
export type PageContext = {
  /** Hostname of the current document. */
  hostname: string;

  /** Whether the hostname belongs to an Argentine top level domain. */
  isArgentineDomain: boolean;

  /** Value of the document language attribute, if present. */
  documentLanguage?: string;

  /** Whether the document declares an Argentine locale. */
  isArgentineLocale: boolean;

  /** Prices explicitly declared as ARS in the page structured data. */
  declaredArsPrices: Set<number>;

  /** Whether the page structured data declares any non ARS currency. */
  hasForeignCurrencyMarkup: boolean;
};
```

Señales que alimentan el contexto:

| Señal | Fuente | Peso |
| --- | --- | --- |
| TLD `.ar` o `.com.ar` | `location.hostname` | Medio |
| `<html lang="es-AR">` | Atributo `lang` | Medio |
| `og:locale` con `es_AR` | Meta tags | Bajo |
| `priceCurrency: "ARS"` en JSON-LD | `script[type="application/ld+json"]` | Alto |
| `priceCurrency` distinto de ARS en JSON-LD | Idem | Alto, en contra |

El JSON-LD de schema.org es la señal más confiable cuando existe. Se recorren los nodos `Product`,
`Offer` y `AggregateOffer`, y los montos declarados como ARS se guardan en `declaredArsPrices`.
Cualquier monto de texto que coincida numéricamente con uno de esos valores obtiene confianza alta
de forma directa.

### 3.2. Reconocimiento de tokens

Se busca un símbolo o código de moneda seguido de un número, o un número seguido de una palabra de
moneda. La presencia de marcador de moneda es obligatoria: un número suelto nunca se convierte.
Esto elimina de raíz la mayoría de los falsos positivos (años, SKUs, teléfonos, cantidades).

Prefijos reconocidos, en orden de prioridad:

1. Marcadores de dólar: `U$S`, `US$`, `USD`, `u$d`, `US $`. Rechazo inmediato.
2. Marcadores de peso explícitos: `ARS`, `AR$`, `$ARS`.
3. Símbolo ambiguo: `$`.

Sufijos reconocidos: `pesos`, `ARS`, `pesos argentinos`, `dólares`, `USD` (los dos últimos como
rechazo).

### 3.3. Parseo del número

El formato es-AR usa punto como separador de miles y coma como separador decimal. El caso ambiguo
es un punto sin coma acompañante.

Reglas, en orden:

1. Si hay coma, la coma es el separador decimal y los puntos son de miles. `1.234,56` da `1234.56`.
2. Si hay solo puntos y el último grupo tiene exactamente 3 dígitos, todos los puntos son de miles.
   `1.500` da `1500`. `1.234.567` da `1234567`.
3. Si hay solo un punto y el grupo final tiene 1 o 2 dígitos, es decimal. `1.50` da `1.5`.
4. Si no hay separadores, se parsea directo.

La regla 2 es la que resuelve el caso frecuente de `$1.500` en un sitio argentino, que en formato
en-US se leería como mil quinientos milésimos.

Cuando el número viene en formato en-US inequívoco (`1,234.56`), es una señal en contra de ARS y
baja la confianza.

### 3.4. Niveles de confianza

```typescript
export type Confidence = 'high' | 'medium' | 'low';
```

- **high**: marcador explícito `ARS` / `AR$`, o coincidencia con un precio declarado como ARS en el
  JSON-LD de la página.
- **medium**: símbolo `$` ambiguo, más dominio o locale argentino, más formato numérico es-AR.
- **low**: símbolo `$` ambiguo sin contexto argentino suficiente, o formato numérico en-US.
- **Rechazo**: cualquier marcador de dólar presente en el token, o `hasForeignCurrencyMarkup` con
  ausencia total de señales de ARS.

El umbral mínimo para convertir es configurable y por defecto es `medium`. Los montos convertidos
con confianza `low` se renderizan con un estilo distinto para que el usuario sepa que la extensión
no está segura.

### 3.5. Exclusiones de recorrido

No se procesan nodos de texto contenidos en:

- `script`, `style`, `noscript`, `template`
- `input`, `textarea`, `select`, `option`
- Cualquier elemento con `contenteditable`
- Cualquier elemento con el atributo `data-aru-wrap` (anotación previa de la extensión)

## 4. Cotización

### 4.1. Fuente

Endpoint primario: `https://dolarapi.com/v1/dolares/oficial`. Es público, sin API key y con CORS
abierto.

Respuesta relevante:

```json
{
  "moneda": "USD",
  "casa": "oficial",
  "compra": 1010.0,
  "venta": 1050.0,
  "fechaActualizacion": "2026-08-10T14:00:00.000Z"
}
```

Se usa el valor de `venta` por defecto, que es el precio al que se compran dólares y por lo tanto el
que representa el costo real de convertir. El lado (`compra`, `venta` o promedio) queda como opción
de configuración.

Fuente de respaldo si el primario falla: `https://api.bluelytics.com.ar/v2/latest`, campo
`oficial.value_sell`.

### 4.2. Caché y frescura

- TTL por defecto: 10 minutos.
- La cotización cacheada se guarda en `chrome.storage.local` junto a su timestamp de obtención y la
  fecha de actualización informada por la fuente.
- Si la API falla y existe un valor cacheado vencido, se usa igual pero se marca `isStale: true`. El
  popup y la anotación deben reflejar esa condición de forma visible.
- Si no hay valor cacheado y la API falla, la extensión no convierte nada y el popup informa el
  error. No se inventa una cotización.

El popup siempre muestra la fuente, el valor y la antigüedad del dato. Convertir con una cotización
vieja sin avisar es peor que no convertir.

### 4.3. Modo manual

El usuario puede fijar un valor manual. Cuando `rateSource` es `manual`, el background ni siquiera
consulta la API. La anotación indica que la cotización es manual para que el usuario no confunda el
origen del número.

Validación del input: número positivo, mayor a cero, con tope superior razonable para evitar errores
de tipeo silenciosos.

## 5. Anotación en el DOM

### 5.1. Estrategia

No se usa `innerHTML` en ningún caso. Reemplazar HTML por regex rompe event listeners y es un vector
de inyección. El recorrido se hace con `TreeWalker` sobre `NodeFilter.SHOW_TEXT` y cada coincidencia
se materializa dividiendo el nodo de texto con `splitText` e insertando un elemento envoltorio.

Estructura resultante:

```html
<span data-aru-wrap data-aru-original="$15.000" data-aru-confidence="high">
  $15.000
  <span data-aru-usd> (USD 12,50)</span>
</span>
```

El atributo `data-aru-original` permite revertir sin ambigüedad y el atributo `data-aru-wrap` da
idempotencia: un segundo escaneo ignora lo ya procesado.

El elemento `[data-aru-usd]` es además el objetivo de click para marcar una falsa alarma, según lo
descripto en la sección 6.7.

### 5.2. Reversión

Recorrer todos los `[data-aru-wrap]`, reemplazarlos por un nodo de texto con el contenido de
`data-aru-original` y llamar a `normalize()` sobre el padre para reunificar los nodos de texto
partidos.

### 5.3. Estilos

Los estilos se inyectan en un `<style>` propio con selectores basados en los atributos `data-aru-*`,
que son específicos y no colisionan con clases del sitio. Se usan propiedades heredadas
(`color`, `opacity`, `font-size` relativo) para no romper layouts de grillas de precios.

Los montos de confianza `low` llevan un subrayado punteado y un `title` que explica la incertidumbre.

### 5.4. Rendimiento

- Recorrido en lotes con `requestIdleCallback`, con tope de nodos por lote.
- Tope duro de anotaciones por página para evitar colgar listados muy largos.
- `MutationObserver` activo solo mientras la sesión está activa, con debounce y desconexión temporal
  durante las escrituras propias para evitar el bucle de retroalimentación.

### 5.5. Formato de salida

```typescript
new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
```

Prefijo `USD`. Ejemplo: `USD 12,50`. Valores menores a un centavo se muestran como `< USD 0,01`.

## 6. Supresión de falsos positivos

El usuario puede marcar una conversión como incorrecta. La marca se persiste por sitio y en visitas
posteriores esa detección deja de convertirse. La marca también se puede quitar.

Esta es la única señal de calidad real que produce el sistema, y por eso se guarda con el motivo del
rechazo y no solo como un booleano.

### 6.1. El problema de identidad

Marcar "este monto no debe convertirse" exige poder reconocer el mismo monto en la próxima visita.
El identificador obvio no sirve en ninguno de sus dos extremos:

- Identificar por el texto del token falla cuando el número cambia. Un contador que hoy dice
  `$1.240` mañana dice `$1.310` y la regla no aplica más.
- Identificar por posición exacta en el DOM falla en cuanto el sitio re-renderiza, reordena una
  lista o cambia el orden de los resultados.

La solución es una firma estructural del contenedor, que describe dónde vive el monto y no cuánto
vale, más la posibilidad de usar el token literal cuando el texto sí es estable.

### 6.2. Firma estructural

Se construye subiendo desde el elemento que contiene el nodo de texto, hasta un máximo de cinco
ancestros o hasta `body`. Por cada nivel se elige el descriptor más estable disponible, en este
orden:

1. `#id`, si el `id` existe y no parece autogenerado.
2. `[data-testid=valor]` u otro `data-*` semántico.
3. La primera clase que parezca semántica.
4. `:nth-child(n)` como último recurso.

Se descartan como no estables los identificadores y clases que contienen hashes o secuencias largas
de dígitos, típicos de CSS modules y de frameworks con clases generadas (`css-1x2y3z`, `sc-a1b2c3`).
Si un nivel solo ofrece descriptores inestables se cae a `nth-child`.

La firma resultante se guarda como string legible, no hasheada, para que el usuario pueda revisar y
entender sus propias reglas desde el popup.

### 6.3. Alcance de la regla

```typescript
export type SuppressionScope =
  /** Matches the literal token text anywhere in the host. */
  | 'token'

  /** Matches the exact structural signature, including positional descriptors. */
  | 'location'

  /** Matches the structural signature with positional descriptors removed. */
  | 'location-group';
```

- `location` es el valor por defecto al marcar una falsa alarma. Suprime ese lugar puntual, cualquiera
  sea el número que aparezca ahí.
- `location-group` se ofrece como acción secundaria, "aplicar a todos los casos similares", y resuelve
  el caso de un listado donde la misma columna produce el mismo falso positivo en cada fila.
- `token` se ofrece cuando el texto es claramente estático, por ejemplo un código de producto que
  empieza con `$`.

Las reglas son por hostname exacto, con normalización del prefijo `www.`. No se propagan entre
subdominios.

### 6.4. Modelo de datos

```typescript
export type SuppressionReason =
  /** The matched text is not a monetary value at all. */
  | 'not-a-price'

  /** The matched text is monetary but not expressed in Argentine pesos. */
  | 'not-ars';

export type SuppressionRule = {
  /** Stable identifier derived from the hostname, scope and matcher. */
  id: string;

  /** Hostname the rule applies to, with the www prefix removed. */
  hostname: string;

  /** What the rule matches against. */
  scope: SuppressionScope;

  /** Literal token text. Present when scope is token. */
  token?: string;

  /** Structural signature of the container. Present when scope is location or location-group. */
  signature?: string;

  /** Why the user marked the detection as a false positive. */
  reason: SuppressionReason;

  /** Creation timestamp, in epoch milliseconds. */
  createdAt: number;

  /** Last time the rule suppressed a detection, in epoch milliseconds. */
  lastMatchedAt?: number;
};
```

La distinción entre `not-a-price` y `not-ars` importa. El primer motivo señala una falla del
reconocimiento de tokens y es material para corregir el detector. El segundo señala una falla de la
inferencia de moneda y, en una versión futura con conversión inversa, permitiría tratar ese monto
como dólares en lugar de simplemente ignorarlo.

### 6.5. Persistencia

Las reglas viven en `chrome.storage.local` bajo la clave `suppression:<hostname>`, con un array por
sitio.

- `local` y no `sync` porque `sync` impone 8 KB por ítem y 100 KB totales, que un usuario activo
  agota. La configuración sigue en `sync`, las reglas no.
- Tope de 200 reglas por sitio y poda LRU por `lastMatchedAt` al alcanzarlo.
- El popup ofrece "limpiar reglas de este sitio" y el listado completo de reglas del host actual.

### 6.6. Integración en el pipeline

La supresión se evalúa después de la detección y antes de la anotación, y vive en la capa de página
porque necesita la posición en el DOM para calcular la firma. El núcleo se mantiene puro exponiendo
la función de matcheo:

```typescript
matches(rule: SuppressionRule, candidate: SuppressionCandidate): boolean;
```

donde `SuppressionCandidate` transporta el token normalizado y las dos variantes de firma ya
calculadas por la capa de página. Así el matcheo se testea sin DOM.

Las reglas suprimen de forma dura y no bajan la confianza: es una decisión explícita del usuario y
tiene prioridad sobre cualquier señal automática.

### 6.7. Interacción

**Marcar.** El monto anexado es clickeable y abre un popover con las opciones "No es un precio",
"No está en pesos", "Aplicar a todos los similares" y "Cancelar". Al confirmar, la anotación se
revierte en el acto y se persiste la regla.

Dos detalles obligatorios de implementación:

- El handler del click hace `preventDefault` y `stopPropagation`, porque las anotaciones suelen caer
  dentro de un `<a>` de tarjeta de producto y de lo contrario el sitio navega.
- El popover se monta en un host con Shadow DOM adjunto al `body`, para que los estilos del sitio no
  lo deformen y los propios no se filtren.

**Desmarcar.** Por dos vías:

- Desde el popup, en el listado de reglas del sitio actual, con el motivo y la firma visibles.
- Desde la página, con un modo "mostrar suprimidos" que renderiza un marcador discreto en cada monto
  que una regla bloqueó, clickeable para eliminar la regla y convertir ese monto.

El resumen del escaneo informa cuántos montos fueron suprimidos por reglas, para que el usuario note
si una regla vieja está bloqueando de más.

## 7. Estructura del proyecto

```
ARS-to-USD-script/
  src/
    core/
      types.ts             Tipos compartidos del núcleo.
      patterns.ts          Expresiones regulares de tokens monetarios.
      number-parser.ts     Parseo de formatos numéricos es-AR y en-US.
      detector.ts          Función pura de detección y scoring de confianza.
      converter.ts         Conversión de monto a USD.
      formatter.ts         Formato de salida del monto convertido.
      suppression.ts       Tipos y matcheo puro de reglas de supresión.
    page/
      context.ts           Construcción del PageContext desde el documento.
      structured-data.ts   Lectura de JSON-LD de schema.org.
      walker.ts            Recorrido de nodos de texto con exclusiones.
      signature.ts         Cálculo de la firma estructural de un contenedor.
      annotator.ts         Inserción y reversión de anotaciones.
      feedback-popover.ts  Popover de marcado de falsa alarma.
      observer.ts          MutationObserver de la sesión activa.
      styles.css           Estilos de las anotaciones.
    background/
      rate-service.ts      Obtención, caché y fallback de la cotización.
      suppression-store.ts Persistencia, poda y consulta de reglas por sitio.
      router.ts            Ruteo de mensajes.
    popup/
      index.html
      main.ts
      styles.css
    shared/
      messages.ts          Contratos de mensajería tipados.
      storage.ts           Acceso tipado a chrome.storage.
    config/
      schema.ts            Tipo de configuración.
      defaults.ts          Valores por defecto.
  entrypoints/
    background.ts
    content.ts
    popup/
  tests/
    fixtures/              Corpus de strings reales de sitios argentinos.
    detector.test.ts
    number-parser.test.ts
    suppression.test.ts
```

## 8. Configuración

```typescript
export type ArsToUsdConfiguration = {
  /** Source used to obtain the exchange rate. */
  rateSource: 'official' | 'manual';

  /** Manual exchange rate in ARS per USD. Only used when rateSource is manual. */
  manualRate: number;

  /** Side of the official quote used for the conversion. */
  rateSide: 'venta' | 'compra' | 'promedio';

  /** Minimum confidence level required to annotate a detected amount. */
  minConfidence: Confidence;

  /** Cache lifetime for the official rate, in milliseconds. */
  rateTtlMs: number;

  /** Maximum number of annotations produced in a single page. */
  maxAnnotations: number;

  /** Whether the mutation observer stays active after the initial scan. */
  watchMutations: boolean;

  /** Whether suppressed amounts are rendered with a marker so they can be unmarked in place. */
  showSuppressed: boolean;

  /** Maximum number of suppression rules kept per hostname before LRU pruning. */
  maxRulesPerHost: number;
};
```

Los valores por defecto viven en `config/defaults.ts`. Los endpoints y el TTL base se pueden
sobreescribir en tiempo de build mediante variables `VITE_` para no hardcodear URLs en el código de
dominio.

Persistencia:

- `chrome.storage.sync`: configuración del usuario.
- `chrome.storage.local`: caché de cotización y reglas de supresión.

## 9. Mensajería

```typescript
export type Message =
  | { type: 'RATE_GET' }
  | { type: 'RATE_REFRESH' }
  | { type: 'RULES_GET'; hostname: string }
  | { type: 'RULES_ADD'; rule: SuppressionRule }
  | { type: 'RULES_REMOVE'; hostname: string; ruleId: string }
  | { type: 'RULES_CLEAR'; hostname: string }
  | { type: 'SCAN_RUN'; rate: ExchangeRate; rules: Array<SuppressionRule> }
  | { type: 'SCAN_REVERT' }
  | { type: 'SCAN_STATUS' };
```

Flujo de una activación:

1. El usuario abre el popup y presiona "Convertir".
2. El popup pide la cotización al background (`RATE_GET`), que responde desde caché o desde la API,
   y las reglas del host actual (`RULES_GET`).
3. El popup inyecta el content script en la pestaña activa con `chrome.scripting.executeScript`.
4. El popup envía `SCAN_RUN` con la cotización resuelta y las reglas del sitio.
5. El content script construye el `PageContext`, recorre el DOM, descarta lo que matchea alguna regla
   y anota el resto. Responde con el conteo de montos convertidos, la distribución por nivel de
   confianza y la cantidad de montos suprimidos.
6. El popup muestra el resultado y habilita el botón de revertir.

Flujo de un marcado de falsa alarma:

1. El usuario hace click en un monto anexado y elige un motivo en el popover.
2. El content script calcula la firma estructural, arma la `SuppressionRule` y la envía al background
   con `RULES_ADD`.
3. El background persiste, poda si hace falta y confirma.
4. El content script revierte esa anotación, y las equivalentes si el alcance elegido fue
   `location-group`.

## 10. Manifiesto

```json
{
  "manifest_version": 3,
  "name": "ARS to USD",
  "version": "0.1.0",
  "permissions": ["activeTab", "scripting", "storage"],
  "host_permissions": ["https://dolarapi.com/*", "https://api.bluelytics.com.ar/*"],
  "action": { "default_popup": "popup.html" },
  "background": { "service_worker": "background.js", "type": "module" }
}
```

No se declaran `content_scripts`. La inyección es siempre programática.

## 11. Stack y herramientas

- TypeScript en modo estricto.
- WXT como framework de extensión, que resuelve la generación del manifiesto y el hot reload de
  content scripts. Alternativa si se prefiere algo más crudo: Vite con `@crxjs/vite-plugin`.
- Vitest para los tests del núcleo.
- Prettier para formato.
- Yarn como gestor de paquetes.

## 12. Testing

El foco está en el núcleo puro. Los tests de DOM son secundarios.

- `number-parser.test.ts`: tabla de casos de formatos es-AR y en-US, incluidos los ambiguos.
- `detector.test.ts`: corpus de fixtures con strings reales extraídos de sitios argentinos, cada uno
  con su `PageContext` y el resultado esperado, incluyendo los casos que deben rechazarse.
- `suppression.test.ts`: matcheo de reglas por cada alcance, incluyendo el caso de firma
  generalizada que debe matchear varias filas de un listado y no debe matchear un contenedor
  distinto.

El corpus de fixtures es el activo más importante del proyecto. Cada falso positivo o falso negativo
encontrado en uso real se incorpora como caso antes de corregir el código. El mecanismo de marcado
de falsas alarmas es, además de una función de producto, la fuente natural de ese corpus: lo que el
usuario marca es exactamente lo que hay que agregar como fixture.

## 13. Plan de trabajo

| Fase | Contenido | Resultado |
| --- | --- | --- |
| 1 | `number-parser`, `patterns`, `detector`, tests con corpus inicial | Núcleo verificable sin navegador |
| 2 | `rate-service` con caché, fallback y modo manual | Cotización confiable |
| 3 | `walker` y `annotator` con reversión e idempotencia | Anotación funcional en páginas estáticas |
| 4 | Popup con estado, selector de fuente e input manual | GUI completa |
| 5 | `signature`, `suppression`, `suppression-store` y popover de marcado | Falsas alarmas persistentes por sitio |
| 6 | Listado y borrado de reglas en el popup, modo "mostrar suprimidos" | Ciclo completo de marcar y desmarcar |
| 7 | `structured-data` y `observer` | Confianza alta vía JSON-LD y soporte de SPAs |
| 8 | Pulido de estilos, límites de rendimiento, empaquetado | Extensión instalable |

La fase 5 depende de la 3, porque la firma se calcula sobre el contenedor de la anotación. Conviene
no adelantarla: sin anotaciones reales no hay forma de validar que las firmas sobrevivan a un
re-render.

## 14. Riesgos conocidos

| Riesgo | Mitigación |
| --- | --- |
| Falsos positivos con `$` ambiguo | Marcador de moneda obligatorio, niveles de confianza, umbral configurable |
| Cotización vencida usada silenciosamente | Marca `isStale` visible en popup y anotación |
| Rotura de layouts en grillas de precios | Anexar en lugar de reemplazar, estilos heredados, tope de anotaciones |
| Bucle de `MutationObserver` | Desconexión durante escrituras propias y debounce |
| Cambio o caída de la API de cotización | Fuente de respaldo, endpoints configurables en build, modo manual siempre disponible |
| Precios en Shadow DOM o `iframe` | Limitación documentada, sin mitigación en v1 |
| Firma estructural que deja de matchear tras un rediseño del sitio | Descriptores estables por nivel, alcance `location-group` como red de seguridad, remarcado barato para el usuario |
| Regla vieja que suprime de más | Conteo de suprimidos en el resumen del escaneo, modo "mostrar suprimidos", borrado por regla y por sitio |
| Crecimiento indefinido de reglas en `storage.local` | Tope por host y poda LRU por `lastMatchedAt` |
