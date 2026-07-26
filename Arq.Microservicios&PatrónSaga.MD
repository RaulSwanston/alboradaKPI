# Arquitectura de Microservicios y el Patrón Saga

**Caso de Estudio: Sistema de Reservas de Hotel a Gran Escala**

## 1. Introducción y Contexto

El diseño de sistemas de software para empresas globales (como cadenas hoteleras del tamaño de Marriott) requiere arquitecturas capaces de soportar alta disponibilidad, tolerancia a fallos y un enorme volumen de peticiones concurrentes.

Históricamente, estos sistemas se construían bajo un enfoque **Monolítico**, donde todos los componentes de negocio (gestión de hoteles, cálculo de tarifas, reservas y procesamiento de pagos) compartían el mismo código base y una única base de datos centralizada. Sin embargo, ante eventos de alta demanda, este enfoque presenta serios problemas de escalabilidad y puntos únicos de fallo.

La alternativa moderna es la migración hacia una **Arquitectura de Microservicios**, donde cada funcionalidad de negocio se transforma en un servicio independiente, autónomo y desacoplado.

---

## 2. El Desafío del Escalado Independiente

Una de las principales razones para adoptar microservicios es que **cada componente del sistema escala de forma diferente** según el comportamiento de los usuarios.

### El Rol del API Gateway

En esta arquitectura distribuidora, los clientes (usuarios web o móviles) no se comunican directamente con cada microservicio. En su lugar, interactúan con un **Public API Gateway**.

* El API Gateway actúa como un punto de entrada único.
* Recibe la petición, autentica al usuario si es necesario y enruta el *request* de manera inteligente al microservicio correspondiente.

### Ejemplo Práctico de Escalado

Imagina que se organiza un evento masivo (como un concierto mundial o una convención de tecnología) en una ciudad específica:

* **El escenario:** Miles de usuarios intentarán buscar habitaciones y consolidar una reserva al mismo tiempo.
* **El comportamiento del sistema:** El tráfico hacia el *Reservation Service* y el *Rate Service* se incrementará drásticamente. Por el contrario, el servicio de administración interna (*Hotel Management Service*) mantendrá una carga baja y constante.
* **La solución con Microservicios:** La infraestructura detecta el pico de tráfico y levanta automáticamente múltiples instancias (escalado horizontal) **únicamente** del *Reservation Service*. El resto de los servicios (como pagos o catálogo) siguen consumiendo los mismos recursos de siempre. En un monolito, habrías tenido que duplicar todo el sistema completo en el servidor, desperdiciando memoria y cómputo.

---

## 3. El Problema de la Inconsistencia de Datos

El desacoplamiento de los microservicios exige que **cada uno posea su propia base de datos (Database-per-Service)**. Esto evita que un servicio interfiera con los datos de otro, pero introduce un problema crítico: **¿Cómo garantizamos la consistencia de los datos en una transacción que involucra a múltiples servicios?**

### El Escenario de Fallo Común

1. Un cliente inicia el flujo para reservar una habitación.
2. El **Payment Service** procesa el pago de forma exitosa y registra la transacción en la `Payment DB`.
3. Inmediatamente después, el **Reservation Service** intenta confirmar la habitación, pero la comunicación falla o la `Reservation DB` se satura y rechaza la operación.
4. **Resultado catastrófico:** El usuario ve el cargo en su tarjeta de crédito, pero el hotel no tiene ningún registro de la reserva. El sistema ha quedado en un estado de **inconsistencia**.

En sistemas monolíticos, esto se resolvía con transacciones ACID locales (mediante comandos como `BEGIN TRANSACTION` y `ROLLBACK`). Si el segundo paso fallaba, la base de datos revertía automáticamente el cobro. En un entorno distribuido, donde las bases de datos están físicamente separadas y no se conocen entre sí, un rollback tradicional es técnicamente imposible.

---

## 4. Solución: El Patrón Saga

Para solucionar las transacciones distribuidas sin bloquear el sistema, se utiliza el **Patrón Saga**. Una Saga es una secuencia de **transacciones locales**. Cada servicio ejecuta su función en su propia base de datos y, al terminar, publica un mensaje o evento que dispara el siguiente paso de la cadena.

Existen dos formas de implementar este patrón (Orquestación y Coreografía), pero el principio fundamental en caso de errores son las **Transacciones Compensatorias**.

### Transacciones Compensatorias (El "Rollback" Distribuido)

Si un paso en mitad de la saga falla, el sistema no puede borrar mágicamente lo que ya ocurrió en otros servidores. Lo que hace es emitir un evento de fallo que activa acciones diseñadas específicamente para **deshacer los efectos** de los pasos anteriores.

| Servicio | Transacción Local (Éxito) | Transacción Compensatoria (En caso de fallo posterior) |
| --- | --- | --- |
| **Reservation Service** | Reserva la habitación en estado "Pendiente" | Cancela la reserva o libera la habitación del inventario. |
| **Payment Service** | Realiza el cargo monetario al usuario | Ejecuta un reembolso / devolución del dinero a la tarjeta. |
| **Inventory Service** | Descuenta la habitación del stock disponible | Suma nuevamente la habitación al stock (Ajuste de inventario). |

Si la reserva falla en el último paso debido a la falta de inventario, la saga se mueve "hacia atrás" y activa la *Transacción Compensatoria* del servicio de pagos, realizando un reembolso automático para que el usuario nunca quede cobrado sin su servicio.

---

## 5. Pragmatismo en el Diseño: Base de Datos Compartida

El video concluye con una lección de arquitectura muy valiosa para el mundo real: **No te dejes llevar ciegamente por el purismo teórico.**

Aunque la regla de oro de los microservicios dice que cada uno *debe* tener una base de datos independiente, implementar el Patrón Saga añade una complejidad técnica enorme (manejo de mensajería, reintentos, idoneidad de eventos, estados intermedios).

Si tienes un conjunto de servicios que están extremadamente relacionados entre sí por la lógica de negocio (por ejemplo: la información del *Hotel*, los tipos de *Habitaciones* y el control de *Tarifas*), es completamente válido y a veces mucho más eficiente diseñar el sistema para que **compartan la misma base de datos relacional**. Esto permite mantener la simplicidad de las transacciones tradicionales en el núcleo duro del negocio, aislando la arquitectura de microservicios y patrones complejos como Saga únicamente para fronteras donde el escalado masivo y la separación realmente lo justifiquen (como la separación entre el flujo de Reserva y el flujo de Pagos).

---