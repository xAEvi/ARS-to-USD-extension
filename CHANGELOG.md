# Changelog

Todos los cambios relevantes de este proyecto se documentan en este archivo.

El formato sigue los lineamientos de Keep a Changelog y el proyecto adhiere al versionado semántico.

## [No publicado]

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
