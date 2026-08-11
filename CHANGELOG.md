# Changelog

Todos los cambios relevantes de este proyecto se documentan en este archivo.

El formato sigue los lineamientos de Keep a Changelog y el proyecto adhiere al versionado semántico.

## [No publicado]

### Agregado

- El popup tiene un interruptor para activar la extensión en la pestaña actual, con un indicador en
  el ícono que muestra si está activa sin necesidad de abrirlo.
- Con la extensión activa, subrayar un monto en pesos muestra un panel flotante con su equivalente
  en dólares, la fuente de la cotización usada y su antigüedad, incluido un aviso cuando el dato
  está vencido. Reemplaza al escaneo automático de la página.

### Cambiado

- Además del dólar oficial, el popup permite elegir entre blue, bolsa (MEP), contado con liqui,
  tarjeta, mayorista y cripto. El popup muestra en todo momento cuál de todas está usando.

### Eliminado

- La conversión manual desde el menú contextual y la memoria por sitio que hacía que las páginas
  parecidas convirtieran solas los montos marcados a mano.
- La detección automática de precios. El botón "Convertir" ya no recorre la página ni anexa el
  equivalente en dólares, y con él se van el botón "Revertir", el resumen del escaneo y la
  conversión de los precios que aparecen sin recargar la página.
- El marcado de falsas alarmas, el listado de reglas guardadas por sitio y el modo "mostrar
  suprimidos". Sin detección automática no hay nada que corregir.
- Las opciones de configuración que solo servían al escaneo: confianza mínima, tope de anotaciones
  por página, tope de reglas por sitio y seguimiento de cambios en la página.

## [0.2.0] - 2026-08-10

### Agregado

- Desde el menú contextual (click derecho) se puede seleccionar un monto que la extensión no
  detectó y convertirlo a dólares a mano.
- Los montos convertidos a mano se recuerdan por sitio, así las páginas parecidas los convierten
  solas en los próximos escaneos.

## [0.1.0] - 2026-08-10

### Agregado

- Documento de diseño con el alcance, la arquitectura, el modelo de supresión de falsos positivos y
  el plan de trabajo de la extensión.
- Changelog del proyecto.
- README del proyecto, con instrucciones de instalación, uso, configuración y desarrollo.
- Extensión instalable en Chrome con el ciclo completo de conversión: el popup muestra la
  cotización vigente (fuente, valor y antigüedad), permite elegir entre cotización oficial o
  manual, y el botón "Convertir" detecta precios en pesos en la página activa y anexa su
  equivalente en dólares. El botón "Revertir" deshace la anotación.
- Marcado de falsas alarmas: al hacer click en un monto convertido se puede indicar "No es un
  precio" o "No está en pesos", con la opción de aplicar la corrección a todos los casos similares
  de la página. La marca persiste por sitio y evita que ese mismo monto se vuelva a convertir en
  visitas futuras.
- El popup muestra el listado de reglas de falsas alarmas guardadas para el sitio activo, con su
  motivo y alcance, y permite quitar una regla puntual o limpiar todas las del sitio.
- Modo "mostrar suprimidos": en vez de ocultar los montos bloqueados por una regla, los marca con
  un indicador discreto que, al hacer click, elimina la regla y convierte el monto en el acto.
- La detección usa los datos estructurados (JSON-LD) de la página, cuando están disponibles, para
  reconocer con confianza alta los precios que el sitio ya declaró en pesos y para descartar los
  declarados en otra moneda.
- Mientras la sesión de conversión sigue activa, la extensión detecta y convierte automáticamente
  los precios nuevos que aparecen sin recargar la página, para dar soporte a sitios que renderizan
  por JavaScript.
- Un tope de anotaciones por página y un recorrido en lotes evitan que la extensión se cuelgue al
  convertir listados con miles de precios.

### Corregido

- El monto convertido ahora muestra que es clickeable (cursor de mano) para marcarlo como falsa
  alarma.
