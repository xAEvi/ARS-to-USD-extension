# To-do: montos abreviados y en lunfardo

Documento de trabajo de la branch `shorthand-amounts`. Propone extender `readSelection` para que
reconozca las formas abreviadas y coloquiales en que se escriben montos en pesos, mas alla del
numero literal que entiende hoy.

Cuando el cambio este cerrado y validado, lo que sobreviva se integra a `DISENO.md` seccion 3 y
este archivo se elimina.

## 1. Estado actual

Todas las formas que siguen se rechazan hoy. Verificado corriendo `readSelection` contra ellas, no
inferido del codigo:

```
"100k"        NO       "2 palos"      NO       "100 000"     NO
"22.5k"       NO       "10 lucas"     NO       "$1.500.-"    NO
"1M"          NO       "500 mangos"   NO       "100 mil"     NO
"1MM"         NO       "medio palo"   NO       "2 millones"  NO
```

El patron anclado de `patterns.ts` acepta un numero con un marcador de moneda opcional adelante o
atras, y nada mas. `k`, `palos` o `lucas` no son marcadores, asi que la seleccion entera no matchea.

## 2. El cambio conceptual: marcador contra multiplicador

Esta es la parte que importa antes de escribir una sola linea.

Hoy los marcadores de moneda (`$`, `ARS`, `pesos`, `USD`) son **ruido tolerado**: se dejan pasar y
se descartan, no afectan el valor. `$1.500` y `1.500` dan lo mismo.

Lo que se propone acá es distinto: `k`, `palos` y `lucas` **multiplican el valor**. `2` y `2 palos`
no son lo mismo, difieren en un factor de un millon. Eso significa que:

- El sufijo deja de ser opcional-e-ignorable y pasa a formar parte del calculo.
- Un error de reconocimiento ya no produce "no pasa nada", produce **un numero mil o un millon de
  veces equivocado**, mostrado con la misma cara de seguridad que uno correcto.

Es el riesgo mas serio de toda la propuesta y condiciona el resto: conviene ser conservador con
qué se acepta, y preferir rechazar una forma legitima antes que multiplicar mal una que no lo era.

Implica ademas un cambio de forma en el nucleo: `MONETARY_SELECTION_PATTERN` necesita un grupo
`multiplier` ademas del `number`, y `readSelection` necesita aplicarlo despues de `parseAmount`.

## 3. Formas propuestas

### 3.1. Sufijos de escala (prioridad alta)

| Forma | Factor | Ejemplo | Valor |
| --- | --- | --- | --- |
| `k`, `K` | 1.000 | `100k` | 100.000 |
| `k` con decimal | 1.000 | `22,5k` / `22.5k` | 22.500 |
| `M` | 1.000.000 | `1M` | 1.000.000 |
| `MM` | 1.000.000 | `1MM` | 1.000.000 |

Notas:

- `MM` viene de la notacion financiera (mille mille). Es menos frecuente que `M` pero aparece en
  contextos de finanzas y no cuesta nada soportarlo.
- El decimal con `k` es el caso que mas se usa en la practica (`22,5k`, `1,5k`). Hay que aceptar
  tanto la coma es-AR como el punto en-US, porque en chats la gente escribe las dos.
- **`m` minuscula es ambigua y conviene rechazarla.** Puede leerse como "mil" o como "millon"
  segun quien escriba, y no hay forma de desambiguar. `1m` no deberia convertirse.

### 3.2. Palabras de escala (prioridad alta)

| Forma | Factor | Ejemplo | Valor |
| --- | --- | --- | --- |
| `mil` | 1.000 | `100 mil` | 100.000 |
| `millon`, `millón` | 1.000.000 | `1 millón` | 1.000.000 |
| `millones` | 1.000.000 | `2 millones` | 2.000.000 |

Son las menos riesgosas de todas: son explicitas, no colisionan con unidades y no dependen de
jerga. Si se implementa una sola cosa de este documento, que sea esta junto con `k`.

### 3.3. Lunfardo (prioridad media)

| Forma | Factor | Ejemplo | Valor | Confianza |
| --- | --- | --- | --- | --- |
| `luca`, `lucas` | 1.000 | `10 lucas` | 10.000 | Alta |
| `palo`, `palos` | 1.000.000 | `2 palos` | 2.000.000 | Alta |
| `mango`, `mangos` | 1 | `500 mangos` | 500 | Alta |
| `gamba`, `gambas` | 100 | `2 gambas` | 200 | Media |
| `melon`, `melones` | 1.000.000 | `2 melones` | 2.000.000 | Baja |

Sobre la confianza y la utilidad real de cada uno:

- `palo` es el mas vigente de todos. Con la inflacion acumulada, es la unidad en la que se habla
  hoy de sueldos, autos y alquileres.
- `luca` sigue vigente pero perdio peso: mil pesos dejo de ser una cifra que amerite abreviarse.
- `mango` no es un multiplicador, es sinonimo de "peso" (factor 1). Vale la pena igual porque
  aparece muchisimo en texto real ("500 mangos").
- `gamba` (100) esta practicamente en desuso por la misma razon que `luca` se debilito. Bajo valor
  de implementar, pero cuesta poco.
- `melon` como millon lo tengo con **baja confianza para el uso argentino**: lo asocio mas a Espana,
  donde `palo` no se usa. Conviene verificarlo con uso real antes de incluirlo, no darlo por hecho.

### 3.4. Notacion de precio argentina (prioridad alta)

| Forma | Ejemplo | Valor |
| --- | --- | --- |
| Sufijo `.-` | `$1.500.-` | 1.500 |
| Sufijo `,-` | `$1.500,-` | 1.500 |
| Espacio como separador de miles | `100 000` | 100.000 |

El sufijo `.-` es extremadamente comun en precios argentinos escritos (listas, presupuestos,
facturas) y hoy hace que la seleccion se rechace entera. **Probablemente sea el agregado con mejor
relacion entre valor y riesgo de todo el documento**: no multiplica nada, solo hay que tolerarlo y
descartarlo, exactamente como ya se hace con `$`.

El separador de miles por espacio es notacion SI y aparece en documentos formales. Ojo: hay que
aceptar tambien el espacio fino (U+2009) y el espacio duro (U+00A0), que es lo que suelen insertar
los procesadores de texto y los sitios que formatean con `Intl`.

## 4. Ambiguedades y colisiones a resolver

Cada una de estas es una forma de producir un numero equivocado con apariencia de valido.

| Colision | Riesgo | Mitigacion propuesta |
| --- | --- | --- |
| `k` seguido de otra letra: `22.5kg`, `100kb`, `50km`, `3kW` | Alto. Multiplicaria por mil un peso, un tamano de archivo o una distancia | Exigir que despues del sufijo no haya ninguna letra. `22.5kg` debe seguir rechazandose |
| `M` seguido de letra: `1Mb`, `2MW` | Alto. Mismo caso | Misma regla |
| `m` minuscula sola | Alto. Ambigua entre mil y millon | Rechazar. No soportarla |
| `verde`, `verdes` (`500 verdes`) | Alto. Significa **dolares**, no pesos. Convertirlo da un numero sin sentido | No incluirlo como multiplicador. Que caiga en el rechazo general |
| `palo verde`, `luca verde` | Alto. Millon y mil **de dolares** | Idem: rechazar si aparece `verde` |
| `palo` fuera de contexto monetario ("2 palos de escoba") | Bajo. La seleccion explicita lo vuelve improbable | Aceptado, criterio del usuario (`DISENO.md` seccion 2.2) |
| `mango`, `melon` como frutas ("500 mangos" en un inventario) | Bajo. Mismo razonamiento | Aceptado |
| `luca` como nombre propio | Bajo. Requiere numero adelante para matchear | Sin mitigacion necesaria |

## 5. Interaccion con los limites actuales

Dos cosas de `selection.ts` dejan de funcionar como estan:

**`MAX_DIGITS = 12` cuenta digitos escritos, no el valor resultante.** Con multiplicadores eso se
rompe: `999999999999k` tiene 12 digitos y pasa el filtro, pero da un valor de 10^15. Propuesta:
mover el tope al **valor final** despues de aplicar el multiplicador, o aplicar los dos (digitos
escritos para descartar identificadores, y un tope de valor para descartar absurdos).

**`MAX_LENGTH = 24` sigue alcanzando.** `1500 pesos argentinos` son 21 caracteres y `2 palos` son 7.
No hace falta tocarlo, pero conviene revisarlo si se agregan formas largas.

## 6. Lo que conviene dejar afuera

Cosas que aparecen en texto real pero que no valen la pena, con el motivo:

- **Numeros escritos en palabras**: `mil quinientos pesos`, `dos millones`. Implica un parser de
  numerales en espanol entero. Costo alto, y `2 millones` (digito mas palabra) ya cubre el 90% del
  caso util.
- **Fracciones de escala**: `medio palo`, `palo y medio`, `dos lucas y media`. Se usan, pero
  multiplican la complejidad del patron por poco beneficio.
- **Rangos**: `entre $1.000 y $2.000`, `$1.000 a $2.000`. Son dos montos, no uno. Choca de frente
  con el filtro de forma de la seccion 3.1 de `DISENO.md`, que existe justamente para rechazar
  selecciones con mas de un monto.
- **Cuotas**: `3 cuotas de $200`. Es texto alrededor de un monto. El usuario puede subrayar solo el
  `$200` si quiere convertirlo.
- **Cantidades vagas**: `un toco`, `una banda`, `una fortuna`. No tienen valor numerico.
- **`m$n`**: notacion de moneda historica, sin uso hoy.

## 7. Priorizacion propuesta

Si se implementa por partes, este es el orden que recomiendo, de mejor a peor relacion entre valor
y riesgo:

| Orden | Contenido | Motivo |
| --- | --- | --- |
| 1 | Sufijo `.-` / `,-` y separador de miles por espacio | Muy comun, no multiplica nada, riesgo casi nulo |
| 2 | `k`, `K`, `M`, `MM` con la guardia de "ninguna letra despues" | Alto uso, riesgo controlado por una sola regla |
| 3 | `mil`, `millon`, `millones` | Explicito, sin colisiones |
| 4 | `luca(s)`, `palo(s)`, `mango(s)` | Vigentes en uso real, colisiones de bajo riesgo |
| 5 | `gamba(s)` | Practicamente en desuso |
| 6 | `melon(es)` | Solo si se confirma que se usa asi en Argentina |

## 8. Casos de test a agregar

Que se convierten, con su valor esperado:

```
100k            -> 100000        2 palos        -> 2000000
100K            -> 100000        10 lucas       -> 10000
22,5k           -> 22500         500 mangos     -> 500
22.5k           -> 22500         100 mil        -> 100000
1M              -> 1000000       2 millones     -> 2000000
1MM             -> 1000000       1 millón       -> 1000000
$1.500.-        -> 1500          100 000        -> 100000
```

Que se siguen rechazando, y por que:

```
22.5kg          unidad de peso, no escala
50 km           unidad de distancia
100kb           unidad de informacion
3kW             unidad de potencia
1m              minuscula ambigua entre mil y millon
500 verdes      son dolares, no pesos
2 palos verdes  millones de dolares
medio palo      fraccion de escala, fuera de alcance
entre 1k y 2k   dos montos en una seleccion
999999999999k   supera el tope de valor de la seccion 5
```

El caso `22.5kg` contra `22.5k` es el par mas importante de toda la tabla: si esos dos no se
distinguen bien, la funcionalidad hace mas dano que beneficio.
