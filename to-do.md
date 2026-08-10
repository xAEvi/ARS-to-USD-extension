# To-do: conversión por selección

Documento de trabajo de la branch `underline-feature`. Describe el reemplazo del modelo de disparo
de la v1, no un agregado sobre él.

Cuando el cambio esté cerrado y validado, lo que sobreviva acá se integra a `DISENO.md`, que hay
que reescribir en buena parte, y este archivo se elimina.

## 1. Qué hace la extensión ahora

Con la extensión activa en la pestaña, el usuario subraya un valor monetario y la extensión lo
convierte a dólares, usando la cotización oficial o el valor manual que el usuario haya
configurado. El resultado se muestra en un panel flotante al lado de la selección.

Eso es todo. No hay escaneo de página, no hay anotaciones en el DOM, no hay marcado de falsos
positivos, no hay reglas aprendidas y no hay menú contextual.

La dirección de la conversión no cambia: sigue siendo ARS a USD. Lo que cambia es quién decide qué
se convierte, que pasa de ser la extensión a ser el usuario.

## 2. Qué se descarta

Todo el modelo de disparo de la v1 se cae, no se adapta:

- Escaneo automático de la página y anotación inline.
- Supresión de falsos positivos (sección 6 de `DISENO.md`), en todas sus formas: popover de
  marcado, alcances de regla, firma estructural, persistencia por sitio, modo "mostrar suprimidos"
  y listado de reglas en el popup.
- Conversión manual con memoria por menú contextual (sección 15 de `DISENO.md`), incluidas las
  reglas de inclusión.
- Inferencia de moneda y niveles de confianza. Ver la sección 3.
- Reversión, idempotencia por `data-aru-wrap`, `MutationObserver`, recorrido en lotes y tope de
  anotaciones. Son todas mitigaciones de escribir en el DOM ajeno, y ya no se escribe.

Lo que se descarta es, casi punto por punto, lo que existía para corregir a la detección automática
cuando erraba. Sin detección automática, no hay nada que corregir.

## 3. La extensión ya no infiere moneda

Toda la sección 3 de `DISENO.md` desaparece: el contexto de página, las señales de dominio y locale,
la lectura de JSON-LD, la clasificación de marcadores y los niveles de confianza.

El criterio pasa a ser el usuario. Si subraya un monto, lo quiere en dólares. La extensión no evalúa
si ese monto estaba en pesos, en dólares o en cualquier otra moneda, ni intenta adivinar la
nacionalidad del sitio.

La contrapartida es explícita y aceptada: subrayar un precio que ya estaba en dólares devuelve un
número sin sentido. Es la misma clase de responsabilidad que tiene cualquiera que usa una
calculadora, y el costo de evitarlo era todo el aparato de detección que este cambio elimina.

## 4. El único filtro: forma de la selección

Lo único que la extensión valida es que la selección tenga forma de valor monetario y nada más. El
filtro no existe para acertar la moneda, existe para que el panel no aparezca cuando el usuario
subraya texto por cualquier otro motivo, que es lo que hace la mayor parte del tiempo.

Regla propuesta. Se convierte solo si el texto seleccionado, ya recortado de espacios, cumple todo
esto:

- [ ] Es un número, con un marcador de moneda opcional adelante o atrás, y nada más. Nada de
      palabras sueltas, nada de dos montos, nada de un monto dentro de una frase.
- [ ] No contiene saltos de línea.
- [ ] No supera un largo máximo en caracteres. Propongo 24, que entra cómodo un
      `US$ 1.234.567.890,12` y no entra una oración.
- [ ] No supera una cantidad máxima de dígitos. Un número de doce dígitos puede ser muchas cosas,
      pero un precio no suele ser una de ellas.

Cualquier cosa que no cumpla, se ignora en silencio. Sin panel, sin aviso, sin nada: el usuario
estaba subrayando para otra cosa y la extensión no tiene por qué interrumpirlo.

Esto vive en una función pura, sin acceso al DOM, del tipo
`readSelection(text: string): SelectedAmount | undefined`. Es lo único que queda del núcleo de
decisión y es trivial de testear con una tabla de casos, que es donde conviene poner el esfuerzo:
los umbrales de largo y de dígitos se van a tener que ajustar con uso real.

## 5. Qué se mantiene

El núcleo de dominio queda casi intacto:

- `number-parser.ts` no se toca. El desempate hacia es-AR sigue siendo el correcto.
- `converter.ts` y `formatter.ts` no se tocan.
- `patterns.ts` se recorta. Los marcadores dejan de clasificarse en dólar, pesos y ambiguo, y pasan
  a ser simplemente ruido tolerado alrededor del número: `$1.999` y `1.999 pesos` se aceptan igual
  porque el usuario los subrayó, no porque digan algo sobre la moneda.
- `rate-service.ts` no se toca: misma fuente, misma caché, mismo fallback, mismo modo manual.

## 6. Estado activo

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

## 7. Lectura de la selección

- [ ] Leer el texto con `Range.toString()` y no con el `textContent` del nodo ancla. La selección
      cruza nodos con frecuencia: el símbolo en un `<span>` y el número en otro es un patrón común
      en sitios de e-commerce.
- [ ] Expandir el rango a los límites del número antes de parsear, para que una selección parcial
      como `1.99` dentro de `1.999,00` no convierta un valor equivocado.
- [ ] Escuchar `mouseup` y `keyup`, no `selectionchange`, que dispara en cada píxel del arrastre. Si
      hace falta para la selección por teclado, va con debounce.
- [ ] Ignorar selecciones dentro de `[contenteditable]`, `input` y `textarea`.
- [ ] Pasar el texto por `readSelection` y no hacer nada si no pasa el filtro de la sección 4.

## 8. El panel

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

## 9. Inventario de código

| Módulo | Destino |
| --- | --- |
| `core/number-parser.ts`, `core/converter.ts`, `core/formatter.ts` | Sin cambios. |
| `core/patterns.ts` | Se recorta a un patrón anclado de valor monetario. Se cae `classifyMarker` y la distinción entre marcadores. |
| `core/selection.ts` | Nuevo. La función pura de la sección 4. |
| `core/detector.ts` | Se elimina. |
| `core/types.ts` | Se limpia. `Confidence`, `DetectedAmount` y `PageContext` se caen. |
| `core/suppression.ts`, `core/inclusion.ts` | Se eliminan. |
| `page/context.ts`, `page/structured-data.ts`, `page/signature.ts` | Se eliminan. Solo existían para inferir moneda o para las reglas. |
| `page/walker.ts`, `page/scheduler.ts`, `page/observer.ts`, `page/annotator.ts`, `page/feedback-popover.ts` | Se eliminan. |
| `background/rate-service.ts` | Sin cambios. |
| `background/suppression-store.ts`, `background/inclusion-store.ts`, `background/context-menu.ts` | Se eliminan. |
| `background/router.ts` | Se recorta a los mensajes que quedan y suma el estado activo por pestaña. |
| `entrypoints/content-script.ts` | Se reescribe entero. |
| `entrypoints/popup/` | Se reescribe: interruptor de activación, cotización y configuración. Se cae el resumen de escaneo, el botón de revertir y el listado de reglas. |
| `config/schema.ts`, `config/defaults.ts` | Sobreviven `rateSource`, `manualRate`, `rateSide` y `rateTtlMs`. Se caen `minConfidence`, `maxRulesPerHost`, `showSuppressed`, `watchMutations` y `maxAnnotations`. |
| `shared/messages.ts` | Se caen `RULES_*`, `INCLUSION_*`, `SCAN_RUN`, `SCAN_REVERT` y `MANUAL_CONVERT_SELECTION`. |
| Manifiesto | Se cae el permiso `contextMenus`. |
| `tests/` | Se eliminan los de supresión, inclusión y detector. Los de parseo, conversión, formato y cotización quedan tal cual. Se suma la tabla de casos de `readSelection`. |

El corpus de fixtures del detector se borra junto con el detector, porque estaba tipado contra
`PageContext` y `DetectedAmount`. Los strings reales de sitios argentinos siguen sirviendo como
casos de parseo numérico y de `readSelection`, y se recuperan con
`git show b183dec:tests/fixtures/detection-corpus.ts` cuando se escriban los tests de la fase 2.

## 10. Plan de trabajo

| Fase | Contenido | Resultado |
| --- | --- | --- |
| 1 | Eliminar detector, supresión, inclusión, menú contextual y pipeline de escaneo | Árbol limpio |
| 2 | `readSelection` y recorte de `patterns.ts`, con tabla de casos | Núcleo verificable sin navegador |
| 3 | Estado activo por pestaña y popup nuevo | Ciclo de activación |
| 4 | Lectura de la selección y panel flotante | Flujo completo |
| 5 | Reescritura de `DISENO.md` y del README | Documentación coherente |

La fase 1 va primero a propósito. Escribir el filtro nuevo con el pipeline viejo todavía colgando
obliga a mantener vivo código que igual se va a borrar.

## 11. Riesgos

| Riesgo | Mitigación |
| --- | --- |
| El panel aparece cuando el usuario subraya texto por otro motivo | Filtro de forma de la sección 4, con umbrales ajustables |
| Umbrales de largo y dígitos mal calibrados, que dejan afuera montos válidos | Tabla de casos en los tests y ajuste con uso real |
| Convertir un monto que ya estaba en dólares | Sin mitigación, por decisión de producto. Queda en criterio del usuario |
| Selección parcial que toma un número equivocado | Expansión del rango a los límites del número antes de parsear |
| La sesión activa muere al navegar por la semántica de `activeTab` | Aceptado en la primera versión, `host_permissions` como salida si molesta |
| Sitios que cancelan o reescriben la selección con sus propios handlers | Se detecta en pruebas reales, sin mitigación previa |
