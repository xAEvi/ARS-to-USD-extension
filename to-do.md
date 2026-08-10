# To-do: conversión de USD a ARS por selección

Documento de trabajo de la branch `underline-feature`. Describe el reemplazo del modelo de la v1,
no un agregado sobre él.

Cuando el cambio esté cerrado y validado, lo que sobreviva acá se integra a `DISENO.md`, que hay
que reescribir en buena parte, y este archivo se elimina.

## 1. Qué hace la extensión ahora

Con la extensión activa en la pestaña, el usuario subraya un valor monetario y la extensión lo
convierte de dólares a pesos argentinos, usando la cotización oficial o el valor manual que el
usuario haya configurado. El resultado se muestra en un panel flotante al lado de la selección.

Eso es todo. No hay escaneo de página, no hay anotaciones en el DOM, no hay marcado de falsos
positivos, no hay reglas aprendidas y no hay menú contextual.

## 2. Qué se descarta

Todo el modelo de la v1 se cae, no se adapta:

- Escaneo automático de la página y anotación inline.
- Supresión de falsos positivos (sección 6 de `DISENO.md`), en todas sus formas: popover de
  marcado, alcances de regla, firma estructural, persistencia por sitio, modo "mostrar suprimidos"
  y listado de reglas en el popup.
- Conversión manual con memoria por menú contextual (sección 15 de `DISENO.md`), incluidas las
  reglas de inclusión.
- Niveles de confianza como filtro. Sin detección automática no hay nada que puntuar: el gesto de
  subrayar es la confirmación, y es binaria.
- Reversión, idempotencia por `data-aru-wrap`, `MutationObserver`, recorrido en lotes y tope de
  anotaciones. Son todas mitigaciones de escribir en el DOM ajeno, y ya no se escribe.

## 3. La inversión de dirección

El cambio más grande no es el disparo, es que la conversión ahora va de USD a ARS. La v1 convertía
ARS a USD y la sección 1.2 de `DISENO.md` listaba explícitamente la conversión inversa como fuera
de alcance. Se invierte.

Consecuencias que hay que asumir de entrada:

- [ ] `convertToUsd` pasa a `convertToArs` y divide deja de dividir para multiplicar.
- [ ] `formatUsd` pasa a formatear pesos. El caso piso `< USD 0,01` deja de tener sentido: los
      montos resultantes son grandes. Formato propuesto: `ARS 2.098.950,00`, con agrupación es-AR y
      prefijo `ARS` explícito para que no se confunda con el `$` del precio original.
- [ ] Los marcadores de moneda invierten su polaridad. `U$S`, `US$`, `USD` y `u$d` pasan de rechazo
      a aceptación explícita, y `ARS`, `AR$` y `pesos` pasan de aceptación a rechazo.
- [ ] Las señales de contexto de página invierten su signo. Dominio `.ar`, `lang="es-AR"` y
      `priceCurrency: "ARS"` en el JSON-LD pasan de ser evidencia a favor a ser evidencia en contra.
- [ ] El desempate del parseo numérico invierte su default. La regla 2 de la sección 3.3 de
      `DISENO.md` resuelve `1.500` como mil quinientos porque asumía sitio argentino. Los precios
      que ahora nos interesan viven en sitios extranjeros con formato en-US, donde ese default es el
      equivocado. `1,999.00` ya parsea bien, el caso a revisar es el punto solo.

Además, la identidad del proyecto queda desalineada: el repositorio se llama `ARS-to-USD-script`, la
extensión se llama "ARS to USD", el tipo de configuración es `ArsToUsdConfiguration` y los atributos
del DOM son `data-aru-*`. Decisión pendiente: renombrar todo en un commit mecánico, o convivir con
el nombre viejo. Recomiendo renombrar antes de escribir el código nuevo, no después.

## 4. Cotización

`rate-service.ts` se mantiene tal cual: misma fuente, misma caché, mismo fallback, mismo modo
manual. Solo cambia el lado de la operación.

Pregunta abierta que importa para el producto. El caso de uso real es el del ejemplo: un precio en
dólares en un sitio del exterior. El costo efectivo de esa compra para alguien en Argentina no es el
dólar oficial, es el dólar tarjeta, que es el oficial más impuestos. La sección 1.2 de `DISENO.md`
deja las cotizaciones alternativas fuera de alcance, pero con la dirección invertida esa exclusión
pasa a ser el caso principal y no un extra. Opciones:

1. Mantener solo oficial y manual, como está hoy. El usuario que quiera el precio real lo carga a
   mano.
2. Agregar el dólar tarjeta como fuente, que `dolarapi.com` ya expone en
   `/v1/dolares/tarjeta`. Es un campo más en `rateSource`, no una arquitectura nueva.

Recomiendo la opción 2. El costo es bajo y sin eso la conversión informa un número que el usuario
no va a pagar nunca.

## 5. Estado activo

"Con la extensión activa" implica un estado por pestaña que hoy no existe: la v1 inyecta el script,
escanea y termina.

- [ ] El popup pasa a tener un interruptor de activación en vez del botón "Convertir".
- [ ] El estado vive por pestaña, en el background, y se refleja en el badge del ícono para que el
      usuario sepa si está activa sin abrir el popup.
- [ ] Al activar, se inyecta el content script con `chrome.scripting.executeScript`, igual que hoy.

Limitación a resolver, no a ignorar. El permiso `activeTab` se otorga por gesto y se revoca al
navegar. Con solo `activeTab`, la sesión activa muere en cuanto el usuario cambia de página, y hay
que volver a activar. Sobrevive la navegación de una SPA, no la navegación real. Opciones:

1. Aceptarlo y que el usuario reactive por página.
2. Pedir `host_permissions` amplios y reinyectar al navegar, con la advertencia de permisos que eso
   implica en la instalación.

Recomiendo empezar por la 1 y medir cuánto molesta en uso real antes de pagar el costo de la 2.

## 6. Lectura de la selección

- [ ] Leer el texto con `Range.toString()` y no con el `textContent` del nodo ancla. La selección
      cruza nodos con frecuencia: el símbolo en un `<span>` y el número en otro es un patrón común.
- [ ] Expandir el rango a los límites del número antes de parsear, para que una selección parcial
      como `1.99` dentro de `1,999.00` no convierta un valor equivocado.
- [ ] Escuchar `mouseup` y `keyup`, no `selectionchange`, que dispara en cada píxel del arrastre. Si
      hace falta para la selección por teclado, va con debounce.
- [ ] Ignorar selecciones dentro de `[contenteditable]`, `input` y `textarea`.
- [ ] Si el texto seleccionado no parsea como monto, no pasa nada y no se muestra nada. El usuario
      selecciona texto todo el tiempo por motivos ajenos a la extensión.
- [ ] Si el texto seleccionado tiene un marcador explícito de pesos, no se convierte. Multiplicar un
      precio que ya está en pesos por la cotización produce un número absurdo con apariencia de
      válido, que es el peor error posible acá.
- [ ] Sin marcador, se asume dólares. Es la única suposición razonable: si el usuario activó la
      extensión y subrayó un monto, es porque quiere saber cuánto es en pesos.

## 7. El panel

- [ ] Montado en un host con Shadow DOM adjunto al `body`, para que los estilos del sitio no lo
      deformen ni los propios se filtren.
- [ ] Anclado con `Range.getBoundingClientRect()`, con corrección de borde de viewport y
      reposicionamiento en `scroll` y `resize`.
- [ ] Muestra el monto original con su moneda, el monto convertido, y la fuente y antigüedad de la
      cotización, incluido el indicador de dato vencido que ya exige la sección 4.2 de `DISENO.md`.
- [ ] Se cierra con click afuera, con `Escape` y al cambiar la selección.

Preguntas abiertas sobre el panel:

- ¿El monto es editable en el panel, o es solo lectura? El ejemplo de referencia sugiere editable.
- ¿Hay selector de moneda de origen, o la dirección USD a ARS es fija? Un selector abre la puerta a
  pares arbitrarios, y eso sí cambia el alcance: `dolarapi.com` no sirve para eso y haría falta una
  fuente multi moneda.

## 8. Inventario de código

| Módulo | Destino |
| --- | --- |
| `core/number-parser.ts` | Se mantiene. Revisar el desempate del punto solo hacia en-US y sumar casos al test. |
| `core/converter.ts` | Se invierte a `convertToArs`. |
| `core/formatter.ts` | Se reescribe para formatear pesos. |
| `core/patterns.ts` | Se mantiene la mecánica, se invierte la polaridad de los marcadores. |
| `core/detector.ts` | Se reduce mucho. Ya no busca montos en un texto ni puntúa confianza: solo clasifica la moneda de un texto que el usuario ya confirmó. |
| `core/types.ts` | Se limpia. `Confidence` y `DetectedAmount` pierden sentido en su forma actual. |
| `core/suppression.ts`, `core/inclusion.ts` | Se eliminan. |
| `page/signature.ts` | Se elimina. Solo lo usaban supresión e inclusión. |
| `page/walker.ts`, `page/scheduler.ts`, `page/observer.ts`, `page/annotator.ts`, `page/feedback-popover.ts` | Se eliminan. |
| `page/context.ts`, `page/structured-data.ts` | Se evalúa si sobreviven degradados como señal de moneda, o si se eliminan. Con la suposición de la sección 6, probablemente sobren. |
| `background/rate-service.ts` | Se mantiene. |
| `background/suppression-store.ts`, `background/inclusion-store.ts`, `background/context-menu.ts` | Se eliminan. |
| `background/router.ts` | Se recorta a los mensajes que quedan. |
| `entrypoints/content-script.ts` | Se reescribe entero. |
| `entrypoints/popup/` | Se reescribe: interruptor de activación, cotización y configuración. Se cae el resumen de escaneo, el botón de revertir y el listado de reglas. |
| `config/schema.ts`, `config/defaults.ts` | Sobreviven `rateSource`, `manualRate`, `rateSide` y `rateTtlMs`. Se caen `minConfidence`, `maxRulesPerHost`, `showSuppressed`, `watchMutations` y `maxAnnotations`. |
| `shared/messages.ts` | Se caen `RULES_*`, `INCLUSION_*`, `SCAN_RUN`, `SCAN_REVERT` y `MANUAL_CONVERT_SELECTION`. |
| Manifiesto | Se cae el permiso `contextMenus`. |
| `tests/` | Se eliminan los de supresión e inclusión. El corpus de fixtures del detector se conserva pero con los resultados esperados invertidos: los casos que antes eran rechazo por ser dólares ahora son los casos válidos. |

El corpus de fixtures sigue siendo el activo más valioso del repositorio y es lo único de la v1 que
conviene rescatar con cuidado en vez de borrar.

## 9. Plan de trabajo

| Fase | Contenido | Resultado |
| --- | --- | --- |
| 1 | Decidir renombre del proyecto, fuente de cotización y alcance del panel | Cambio especificado |
| 2 | Eliminar supresión, inclusión, menú contextual y pipeline de escaneo | Árbol limpio |
| 3 | Invertir núcleo: conversión, formato, marcadores y desempate numérico, con tests | Núcleo verificable sin navegador |
| 4 | Estado activo por pestaña y popup nuevo | Ciclo de activación |
| 5 | Lectura de la selección y panel flotante | Flujo completo |
| 6 | Reescritura de `DISENO.md` y del README | Documentación coherente |

La fase 2 va antes que la 3 a propósito. Invertir el núcleo con el pipeline viejo todavía colgando
de él obliga a mantener vivo código que igual se va a borrar.

## 10. Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Convertir un monto que ya estaba en pesos y mostrar un número absurdo como válido | Rechazo duro ante marcador explícito de pesos |
| Ambigüedad `1.500` resuelta hacia el default equivocado en sitios extranjeros | Invertir el default a en-US y cubrirlo con tests |
| La sesión activa muere al navegar por la semántica de `activeTab` | Aceptado en la primera versión, `host_permissions` como salida si molesta |
| Informar el dólar oficial cuando el usuario va a pagar dólar tarjeta | Agregar la fuente tarjeta |
| Sitios que cancelan o reescriben la selección con sus propios handlers | Se detecta en pruebas reales, sin mitigación previa |
| Pérdida de la conversión masiva de la v1 | Decisión explícita de producto, ya tomada |
