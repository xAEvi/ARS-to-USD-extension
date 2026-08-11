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

## 6. Estado activo (revertido: ahora activa por defecto en todas partes)

Esta sección documentaba la activación manual por pestaña, con `activeTab` y sin `content_scripts`
declarativo, que evitaba a propósito la advertencia de permisos amplios. Se implementó así en la
fase 3 y se probó en uso real.

Pedido explícito posterior: la extensión pasa a estar activa por defecto en todas las páginas, con
la opción 2 que esta sección había dejado de lado. Es una reversión consciente de la decisión de
`DISENO.md` sección 2.2, no un error de esa fase.

Lo que cambia respecto a lo implementado en la fase 3:

- [x] `entrypoints/content.ts` (renombrado desde `content-script.ts`: WXT solo registra un content
      script en el manifiesto declarativo si el archivo se llama `content.ts` o `*.content.ts`; con
      otro nombre, `matches` se ignora en silencio y el script queda sin uso, como pasó en el primer
      intento de este cambio) usa `defineContentScript({ matches: [...], main() {...} })` en vez de
      `defineUnlistedScript`. Se inyecta solo, en toda página `http`/`https`, sin que el popup tenga
      que llamar a `chrome.scripting.executeScript`.
- [x] Se cae el permiso `activeTab` y `scripting` del manifiesto. `content_scripts` con `matches`
      ya declara el acceso necesario; no hace falta gesto del usuario ni inyección programática.
      Advertencia aceptada: Chrome muestra "Leer y cambiar tus datos en todos los sitios web que
      visitás" al instalar, la misma que se había evitado a propósito en la fase 3.
- [x] `background/active-tabs.ts` (estado por pestaña, en `chrome.storage.session`) se reemplaza
      por `shared/disabled-hosts.ts` (lista de exclusión por hostname, en `chrome.storage.local`).
      El cambio de alcance importa: antes el estado por defecto era "inactiva" y vivía mientras
      durara la pestaña; ahora el default es "activa" y la excepción ("desactivada acá") persiste
      por sitio entre visitas, sesiones y pestañas nuevas, hasta que el usuario la revierte a mano.
- [x] El popup mantiene el interruptor, ahora tildado por defecto ("Activa en este sitio"). Al
      destildarlo persiste la excepción y, si la pestaña ya tiene el content script corriendo, le
      manda `DEACTIVATE` para que el efecto sea inmediato sin recargar. `ACTIVATE`/`DEACTIVATE`
      sobreviven de la fase 3 con el mismo rol.
- [x] El content script consulta su propio estado al cargar (`isHostDisabled(location.hostname)`)
      en vez de arrancar apagado a la espera de un mensaje. El badge se invierte: ahora solo aparece
      ("OFF", gris) cuando el sitio está desactivado, porque estar activa es el estado normal y no
      necesita anunciarse.

Con esto, la limitación que motivaba la opción 1 (la sesión activa muriendo al navegar, por la
semántica de `activeTab`) deja de aplicar: sin `activeTab`, no hay sesión que revocar. La extensión
corre en cada carga de página según el estado persistido del hostname, punto.

## 7. Lectura de la selección

- [x] Leer el texto con `Range.toString()` y no con el `textContent` del nodo ancla. La selección
      cruza nodos con frecuencia: el símbolo en un `<span>` y el número en otro es un patrón común
      en sitios de e-commerce.
- [ ] Expandir el rango a los límites del número antes de parsear. Sin implementar todavía: hoy una
      selección parcial como `1.99` dentro de `1.999,00` simplemente no pasa el filtro de
      `readSelection` (no matchea el patrón completo) y no se convierte nada, en vez de convertir el
      valor completo corregido. Es más seguro que el bug original que esto prevenía, así que queda
      pendiente como mejora y no como corrección urgente.
- [x] Escuchar `mouseup` y `keyup`, no `selectionchange`. Sin debounce: ninguno de los dos dispara
      por píxel de arrastre, a diferencia de `selectionchange`.
- [x] Ignorar selecciones dentro de `[contenteditable]`, `input` y `textarea`, y cerrar el panel si
      había uno abierto de una selección anterior.
- [x] Pasar el texto por `readSelection` y no hacer nada si no pasa el filtro de la sección 4.

Implementado en `entrypoints/content.ts` (renombrado desde `content-script.ts` en la sección 6).

## 8. El panel

- [x] Montado en un host con Shadow DOM adjunto al `body`, para que los estilos del sitio no lo
      deformen ni los propios se filtren.
- [x] Anclado con `Range.getBoundingClientRect()`, con corrección de borde de viewport y
      reposicionamiento en `scroll` y `resize`. Si el rango deja de existir al reposicionar (por
      ejemplo, la selección se limpió), el panel se cierra solo.
- [x] Muestra el monto original, el monto convertido, y la fuente y antigüedad de la cotización,
      incluido el indicador de dato vencido que ya exige la sección 4.2 de `DISENO.md`. También
      muestra el error de cotización cuando `RATE_GET` falla, en vez de fallar en silencio.
- [x] Se cierra con click afuera (detectado con `event.composedPath()`, que atraviesa el límite del
      Shadow DOM), con `Escape`, y al no encontrar un monto válido en la selección siguiente.

Implementado en `src/page/panel.ts`, con tests en `tests/page/panel.test.ts` (con
`@vitest-environment jsdom`, siguiendo el mismo patrón que tenían los tests de DOM de la v1).

Preguntas abiertas sobre el panel, sin resolver en esta fase:

- ¿El monto original es editable, para ajustar a mano lo que la selección tomó mal? El ejemplo de
  referencia lo sugiere. Hoy es de solo lectura.
- ¿Se puede copiar el monto convertido al portapapeles desde el panel? Hoy no.

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
| `background/rate-service.ts` | Actualizado en la fase de cotizaciones alternativas: toma una casa de dolarapi.com en vez de un único endpoint fijo, con caché independiente por casa. |
| `background/suppression-store.ts`, `background/inclusion-store.ts`, `background/context-menu.ts` | Se eliminan. |
| `background/router.ts` | Se recorta a los mensajes que quedan (`RATE_GET`/`RATE_REFRESH`). |
| `background/active-tabs.ts` | Nuevo en la fase 3 (estado activo por pestaña), eliminado en la sección 6 (estado por hostname en `shared/disabled-hosts.ts`). |
| `entrypoints/content.ts` (antes `content-script.ts`) | Se reescribe entero, y se inyecta solo vía `content_scripts` declarativo en vez de por el popup. |
| `entrypoints/popup/` | Se reescribe: interruptor de activación por sitio, selector de cotización con siete casas y label de la casa activa. Se cae el resumen de escaneo, el botón de revertir y el listado de reglas. |
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

Fases 1 a 4 completas. No se probó en un navegador real todavía, solo con `yarn typecheck`,
`yarn test` (jsdom para el panel) y `yarn build`. Falta la verificación manual de la fase 8 del plan
original de `DISENO.md` (instalar la extensión sin empaquetar y probar el flujo real) antes de dar
por cerrado el cambio.

La fase 1 va primero a propósito. Escribir el filtro nuevo con el pipeline viejo todavía colgando
obliga a mantener vivo código que igual se va a borrar.

## 11. Riesgos

| Riesgo | Mitigación |
| --- | --- |
| El panel aparece cuando el usuario subraya texto por otro motivo | Filtro de forma de la sección 4, con umbrales ajustables |
| Umbrales de largo y dígitos mal calibrados, que dejan afuera montos válidos | Tabla de casos en los tests y ajuste con uso real |
| Convertir un monto que ya estaba en dólares | Sin mitigación, por decisión de producto. Queda en criterio del usuario |
| Selección parcial que toma un número equivocado | Expansión del rango a los límites del número antes de parsear |
| Sitios que cancelan o reescriben la selección con sus propios handlers | Se detecta en pruebas reales, sin mitigación previa |
| Advertencia de permisos amplios ("leer y cambiar tus datos en todos los sitios web") al instalar, por el `content_scripts` declarativo de la sección 6 | Aceptada por decisión explícita de producto: la extensión pasa a estar activa en todas partes por defecto |
