# To-do: conversión por selección

Documento de trabajo de la branch `underline-feature`. Describe el reemplazo del modelo de disparo
de la v1, no un agregado sobre él.

Cuando el cambio esté cerrado y validado, lo que sobreviva acá se integra a `DISENO.md`, que hay
que reescribir en buena parte, y este archivo se elimina.

## 1. Qué hace la extensión ahora

Con la extensión activa en la pestaña, el usuario subraya un valor monetario en pesos y la extensión
lo convierte a dólares, usando la cotización oficial o el valor manual que el usuario haya
configurado. El resultado se muestra en un panel flotante al lado de la selección.

Eso es todo. No hay escaneo de página, no hay anotaciones en el DOM, no hay marcado de falsos
positivos, no hay reglas aprendidas y no hay menú contextual.

La dirección de la conversión no cambia: sigue siendo ARS a USD. Lo que cambia es qué le da a la
extensión permiso para convertir un monto, que pasa de ser una inferencia a ser un gesto del
usuario.

## 2. Qué se descarta

Todo el modelo de disparo de la v1 se cae, no se adapta:

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

Lo que se descarta es, casi punto por punto, lo que existía para corregir a la detección automática
cuando erraba. Sin detección automática, no hay nada que corregir.

## 3. Qué se mantiene

El núcleo de dominio queda intacto, que es la mitad del valor del proyecto:

- `number-parser.ts` no se toca. El desempate hacia es-AR sigue siendo el correcto: los montos que
  se subrayan son precios argentinos.
- `converter.ts` y `formatter.ts` no se tocan.
- `patterns.ts` no se toca. Los marcadores de dólar siguen siendo rechazo, los de pesos siguen
  siendo aceptación explícita y el `$` sigue siendo ambiguo.
- `rate-service.ts` no se toca: misma fuente, misma caché, mismo fallback, mismo modo manual.

El que cambia de rol es `detector.ts`. Ya no busca montos en un texto ni puntúa confianza: recibe un
texto que el usuario ya confirmó que es un precio y solo decide si hay motivo para no convertirlo.

## 4. Estado activo

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

## 5. Lectura de la selección

- [ ] Leer el texto con `Range.toString()` y no con el `textContent` del nodo ancla. La selección
      cruza nodos con frecuencia: el símbolo en un `<span>` y el número en otro es un patrón común
      en sitios de e-commerce.
- [ ] Expandir el rango a los límites del número antes de parsear, para que una selección parcial
      como `1.99` dentro de `1.999,00` no convierta un valor equivocado.
- [ ] Escuchar `mouseup` y `keyup`, no `selectionchange`, que dispara en cada píxel del arrastre. Si
      hace falta para la selección por teclado, va con debounce.
- [ ] Ignorar selecciones dentro de `[contenteditable]`, `input` y `textarea`.
- [ ] Si el texto seleccionado no parsea como monto, no pasa nada y no se muestra nada. El usuario
      selecciona texto todo el tiempo por motivos ajenos a la extensión.
- [ ] Si el texto seleccionado tiene un marcador explícito de dólares, no se convierte. Dividir por
      la cotización un monto que ya está en dólares da un número diminuto con apariencia de válido,
      que es el peor error posible acá. El panel puede decir que ya está en dólares, en vez de no
      mostrar nada, para que el usuario sepa que la extensión lo vio y decidió.
- [ ] Sin marcador, se asume pesos. El requisito de marcador obligatorio de la sección 3.2 de
      `DISENO.md` existía para no convertir números sueltos que la extensión encontraba sola. Con
      una selección explícita ese riesgo desaparece, y exigir marcador solo produciría falsos
      negativos frente a un gesto deliberado del usuario.

## 6. El panel

- [ ] Montado en un host con Shadow DOM adjunto al `body`, para que los estilos del sitio no lo
      deformen ni los propios se filtren.
- [ ] Anclado con `Range.getBoundingClientRect()`, con corrección de borde de viewport y
      reposicionamiento en `scroll` y `resize`.
- [ ] Muestra el monto original, el monto convertido, y la fuente y antigüedad de la cotización,
      incluido el indicador de dato vencido que ya exige la sección 4.2 de `DISENO.md`.
- [ ] Se cierra con click afuera, con `Escape` y al cambiar la selección.

Preguntas abiertas sobre el panel:

- ¿El monto original es editable, para ajustar a mano lo que la selección tomó mal? El ejemplo de
  referencia lo sugiere.
- ¿Se puede copiar el monto convertido al portapapeles desde el panel?

## 7. Inventario de código

| Módulo | Destino |
| --- | --- |
| `core/number-parser.ts`, `core/converter.ts`, `core/formatter.ts`, `core/patterns.ts` | Sin cambios. |
| `core/detector.ts` | Se reduce mucho. Pasa de detectar y puntuar a clasificar la moneda de un texto ya confirmado. |
| `core/types.ts` | Se limpia. `Confidence` y `DetectedAmount` pierden sentido en su forma actual. |
| `core/suppression.ts`, `core/inclusion.ts` | Se eliminan. |
| `page/signature.ts` | Se elimina. Solo lo usaban supresión e inclusión. |
| `page/walker.ts`, `page/scheduler.ts`, `page/observer.ts`, `page/annotator.ts`, `page/feedback-popover.ts` | Se eliminan. |
| `page/context.ts`, `page/structured-data.ts` | Se evalúa si sobreviven degradados como señal de moneda, o si se eliminan. Con la suposición de la sección 5, probablemente sobren. |
| `background/rate-service.ts` | Sin cambios. |
| `background/suppression-store.ts`, `background/inclusion-store.ts`, `background/context-menu.ts` | Se eliminan. |
| `background/router.ts` | Se recorta a los mensajes que quedan y suma el estado activo por pestaña. |
| `entrypoints/content-script.ts` | Se reescribe entero. |
| `entrypoints/popup/` | Se reescribe: interruptor de activación, cotización y configuración. Se cae el resumen de escaneo, el botón de revertir y el listado de reglas. |
| `config/schema.ts`, `config/defaults.ts` | Sobreviven `rateSource`, `manualRate`, `rateSide` y `rateTtlMs`. Se caen `minConfidence`, `maxRulesPerHost`, `showSuppressed`, `watchMutations` y `maxAnnotations`. |
| `shared/messages.ts` | Se caen `RULES_*`, `INCLUSION_*`, `SCAN_RUN`, `SCAN_REVERT` y `MANUAL_CONVERT_SELECTION`. |
| Manifiesto | Se cae el permiso `contextMenus`. |
| `tests/` | Se eliminan los de supresión e inclusión. Los de parseo, conversión, formato y cotización quedan tal cual. El corpus de fixtures del detector se conserva, reinterpretado: los casos de rechazo por falta de marcador dejan de ser rechazos. |

El corpus de fixtures sigue siendo el activo más valioso del repositorio y es lo único de la v1 que
conviene rescatar con cuidado en vez de borrar.

## 8. Plan de trabajo

| Fase | Contenido | Resultado |
| --- | --- | --- |
| 1 | Eliminar supresión, inclusión, menú contextual y pipeline de escaneo | Árbol limpio |
| 2 | Reducir el detector a clasificación de moneda, con tests | Núcleo verificable sin navegador |
| 3 | Estado activo por pestaña y popup nuevo | Ciclo de activación |
| 4 | Lectura de la selección y panel flotante | Flujo completo |
| 5 | Reescritura de `DISENO.md` y del README | Documentación coherente |

La fase 1 va primero a propósito. Tocar el detector con el pipeline viejo todavía colgando de él
obliga a mantener vivo código que igual se va a borrar.

## 9. Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Convertir un monto que ya estaba en dólares y mostrar un número diminuto como válido | Rechazo ante marcador explícito de dólares, informado en el panel |
| Selección parcial que toma un número equivocado | Expansión del rango a los límites del número antes de parsear |
| La sesión activa muere al navegar por la semántica de `activeTab` | Aceptado en la primera versión, `host_permissions` como salida si molesta |
| Sitios que cancelan o reescriben la selección con sus propios handlers | Se detecta en pruebas reales, sin mitigación previa |
| Pérdida de la conversión masiva de la v1 | Decisión explícita de producto, ya tomada |
