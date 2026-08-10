# To-do: conversión por selección

Documento de trabajo de la branch `underline-feature`. Describe el cambio de disparo de la
extensión: de escanear la página entera y anexar conversiones sola, a esperar que el usuario
subraye (seleccione con el cursor) un monto y convertirlo en el acto.

Este documento no reemplaza a `DISENO.md`. Cuando el cambio esté cerrado y validado, lo que
sobreviva acá se integra a las secciones correspondientes del documento de diseño y este archivo
se elimina.

## 1. Objetivo

Hoy la unidad de trabajo es la página: el usuario aprieta "Convertir" y la extensión decide sola
qué montos son precios en pesos, con todo el aparato de confianza, supresión de falsos positivos e
inclusión que eso arrastra.

La propuesta invierte el modelo: la unidad de trabajo pasa a ser la selección. El usuario subraya
un monto, y la extensión lo convierte y muestra el resultado en un panel flotante al lado de la
selección, sin tocar el DOM de la página.

El gesto de subrayar es una confirmación explícita de que ese texto es un precio. Eso es
exactamente la señal que el detector automático intenta adivinar, y se obtiene gratis.

## 2. Qué se gana y qué se pierde

Se gana:

- Los falsos positivos desaparecen por construcción. No hay nada que suprimir si la extensión solo
  convierte lo que el usuario le señaló.
- No hay escritura en el DOM de la página. Se caen de un saque el riesgo de romper layouts de
  grillas de precios, la reversión, la idempotencia por `data-aru-wrap` y el bucle de
  `MutationObserver`.
- No hay recorrido de la página. Se caen el tope de anotaciones, el batching por
  `requestIdleCallback` y el costo de arranque en listados largos.
- La capacidad es testeable end to end. La selección se puede programar desde Playwright y el panel
  es DOM propio, a diferencia del menú contextual nativo de la sección 15.5 de `DISENO.md`.

Se pierde:

- La conversión masiva. Ver diez precios de un listado pasa a ser diez gestos en vez de uno.
- El valor de las secciones 6 (supresión) y 15 (inclusión) de `DISENO.md`, que quedan sin razón de
  existir si no hay detección automática. Ver la sección 6 de este documento.

El intercambio hay que decidirlo explícitamente antes de escribir código: la conversión masiva era
la razón de ser de la v1.

## 3. El conflicto arquitectónico a resolver primero

La sección 2.2 de `DISENO.md` establece que no hay `content_scripts` declarativo y que la extensión
no toca la página hasta un gesto explícito del usuario, apoyándose en `activeTab`.

Escuchar selecciones exige que el content script ya esté presente *antes* de que el usuario
seleccione. Eso choca de frente con esa decisión. Opciones:

1. **Activación por pestaña (recomendada).** El popup mantiene un botón, que pasa de "Convertir" a
   "Activar en esta pestaña". Ese click inyecta el content script y a partir de ahí toda selección
   en esa pestaña abre el panel, hasta que el usuario navega o desactiva. Conserva la semántica de
   `activeTab` intacta y sigue siendo un gesto por pestaña, no por monto.
2. **Content script declarativo con `host_permissions: ["<all_urls>"]`.** Selección viva en toda
   página sin activar nada. Rompe la sección 2.2, agrega la advertencia de permisos "leer y cambiar
   todos tus datos en todos los sitios" en la instalación, y obliga a una blocklist de dominios.
3. **Mantener el menú contextual como disparo.** Ya está implementado y no requiere nada nuevo:
   seleccionar, click derecho, "Convertir a USD". Es un gesto más que la opción 1 pero cero costo
   arquitectónico.

Decisión pendiente. El resto del plan asume la opción 1.

## 4. Comportamiento propuesto

- [ ] El usuario activa la extensión en la pestaña desde el popup.
- [ ] Al soltar el mouse sobre una selección de texto no vacía, la extensión evalúa el texto
      seleccionado.
- [ ] Si el texto contiene un monto parseable, se abre el panel flotante anclado a la selección.
- [ ] Si no lo contiene, no pasa nada. El silencio es la respuesta correcta acá: el usuario
      selecciona texto todo el tiempo por motivos que no tienen que ver con la extensión.
- [ ] El panel se cierra al hacer click fuera, al presionar `Escape`, o al cambiar la selección.

Detalles de implementación que no son opcionales:

- [ ] Leer el texto con `Range.toString()` y no el `textContent` del nodo ancla. La selección puede
      cruzar varios nodos de texto (`$` en un `<span>` y el número en otro es un patrón común en
      sitios de e-commerce) y puede ser parcial sobre un nodo.
- [ ] Anclar el panel con `Range.getBoundingClientRect()`, con corrección de borde para que no se
      salga del viewport y reposicionamiento en `scroll` y `resize`.
- [ ] Montar el panel en un host con Shadow DOM adjunto al `body`, igual que el popover de falsa
      alarma de la sección 6.7 de `DISENO.md`.
- [ ] Escuchar `mouseup` y `keyup` en vez de `selectionchange`, que dispara en cada píxel del
      arrastre. Si igual hace falta `selectionchange` para la selección por teclado, va con debounce.
- [ ] Ignorar selecciones dentro de `[contenteditable]`, `input` y `textarea`.

## 5. El panel

Contenido, según el ejemplo visual de referencia:

- [ ] Monto original, con su moneda de origen.
- [ ] Monto convertido, con su moneda de destino.
- [ ] Fuente de la cotización y antigüedad del dato, con el indicador de `isStale` que ya exige la
      sección 4.2 de `DISENO.md`.
- [ ] Selector de moneda de origen, para corregir a mano cuando la inferencia de moneda erró.

Preguntas abiertas sobre el panel:

- El ejemplo de referencia muestra un par USD a EUR y selectores de moneda en ambos lados. El
  alcance actual del proyecto es unidireccional ARS a USD (sección 1.2 de `DISENO.md`). ¿El selector
  de origen es solo para corregir la inferencia entre ARS y USD, o esto es un pedido implícito de
  convertir entre pares arbitrarios? Lo segundo cambia el alcance del proyecto entero, no el disparo:
  hace falta una API de cotizaciones multi moneda y la fuente actual (`dolarapi.com`) no sirve.
- ¿El panel permite editar el monto a mano, como sugiere el ejemplo, o es solo lectura?
- ¿Se mantiene alguna forma de anotación inline opcional, o el panel es la única salida?

## 6. Impacto por módulo

| Módulo | Impacto |
| --- | --- |
| `core/number-parser.ts` | Sin cambios. Es el núcleo del nuevo flujo. |
| `core/converter.ts`, `core/formatter.ts` | Sin cambios. |
| `core/patterns.ts` | Sin cambios. `NUMBER_PATTERN` pasa a ser el patrón principal. |
| `core/detector.ts` | Cambia de rol. Ya no decide si convertir, sino qué moneda tiene el texto que el usuario ya confirmó que es un precio. El umbral de confianza mínima deja de tener sentido como filtro. |
| `core/suppression.ts`, `background/suppression-store.ts`, `page/feedback-popover.ts` | Sin razón de existir. Ver más abajo. |
| `core/inclusion.ts`, `background/inclusion-store.ts` | Sin razón de existir. Ver más abajo. |
| `page/signature.ts` | Solo lo usan supresión e inclusión. Cae con ellas. |
| `page/walker.ts`, `page/scheduler.ts`, `page/observer.ts` | Sin uso si no hay escaneo de página. |
| `page/annotator.ts` | Sin uso si el panel reemplaza la anotación inline. |
| `page/context.ts`, `page/structured-data.ts` | Se mantienen, degradados a señal para inferir la moneda del texto seleccionado. |
| `background/rate-service.ts` | Sin cambios. |
| `background/context-menu.ts` | Redundante con el nuevo disparo. Evaluar si se elimina o se deja como alternativa. |
| `entrypoints/content-script.ts` | Reescritura. Pasa de orquestar un escaneo a escuchar selecciones. |
| `entrypoints/popup/` | El botón "Convertir" pasa a "Activar en esta pestaña". Se cae "Revertir" y se cae el resumen del escaneo. Se cae el listado de reglas. |

Sobre supresión e inclusión: son la mitad del código del proyecto y existen para corregir una
detección automática que este cambio elimina. No los borro en el mismo movimiento. Propuesta:
dejarlos en el árbol, desconectados del pipeline, hasta que la conversión por selección esté
validada en uso real. Si el modelo nuevo se confirma, se eliminan en un commit propio y se
actualizan las secciones 6 y 15 de `DISENO.md`. Si no se confirma, vuelven sin costo.

## 7. Plan de trabajo

| Fase | Contenido | Resultado |
| --- | --- | --- |
| 1 | Decidir la opción de la sección 3 y el alcance de moneda de la sección 5 | Cambio especificado |
| 2 | Lectura del monto desde un `Range`, incluido el caso multi nodo, con tests | Extracción confiable sin DOM real |
| 3 | Panel flotante en Shadow DOM, anclado y con cierre | Salida visual |
| 4 | Content script de selección y activación por pestaña desde el popup | Flujo completo |
| 5 | Inferencia de moneda con el detector degradado y corrección manual en el panel | Precisión del origen |
| 6 | Limpieza del pipeline viejo y actualización de `DISENO.md` | Proyecto coherente |

## 8. Riesgos

| Riesgo | Mitigación |
| --- | --- |
| El panel aparece cuando el usuario selecciona texto por otro motivo | Solo abrir si el texto parsea como monto, y aun así evaluar un disparo explícito adicional |
| Sitios que cancelan o reescriben la selección con sus propios handlers | Detectado en pruebas reales, sin mitigación previa |
| Selección parcial de un número (`1.99` dentro de `1.999,00`) que convierte un valor equivocado | Expandir el rango a los límites del número antes de parsear |
| Pérdida de la conversión masiva como capacidad | Decisión explícita de producto, no un efecto colateral a descubrir después |
| El panel tapa contenido de la página | Posicionamiento con corrección de borde y cierre por `Escape` |
