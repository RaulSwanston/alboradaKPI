# Objetivo: Un Intérprete de Plantillas HTML en JavaScript

Nuestro objetivo es desarrollar una clase en JavaScript que actúe como un **intérprete y procesador de plantillas HTML** (conocido en inglés como *Template Engine*).

## ¿Cuál es su función?

La función de esta clase es recibir un texto (la plantilla), que contiene una mezcla de HTML y marcadores de posición especiales. Luego, utilizando un conjunto de datos que también recibe, la clase se encarga de analizar la plantilla, reemplazar los marcadores con los datos reales y generar como resultado un string de HTML puro.

En esencia, la clase no crea las plantillas. Es la herramienta que **lee e interpreta** una plantilla ya existente para **ensamblar** el fragmento de HTML final que se mostrará en la página web.

## Definición de Marcadores

Se ha establecido un sistema de dos niveles para los marcadores. Todos operan dentro de comentarios HTML para no interferir con el renderizado del navegador.

### 1. Marcadores de Variable (Salida de datos)

Para imprimir el valor de una variable simple.

*   **Sintaxis:** `<!-- :nombreDeVariable -->`
*   **Ejemplo:** `<h1><!-- :titulo --></h1>`
*   **Lógica:** Usa un solo dos puntos (`:`) como un indicador rápido y limpio para la salida de datos.

### 2. Marcadores de Directiva (Comandos)

Para ejecutar lógica más compleja, como cargar plantillas o incluir fragmentos de HTML.

*   **Sintaxis Base:** `<!-- ::directiva.rutaDelArgumento -->`

#### Reglas de Interpretación (Parsing)

1.  El comando siempre comienza con `::`.
2.  El **nombre de la directiva** es el texto que se encuentra entre `::` y el primer punto (`.`).
3.  La **ruta del argumento** es todo el texto que sigue después del primer punto, hasta que se encuentre un espacio en blanco o un paréntesis `(`.
4.  Dentro de la ruta del argumento, cada punto (`.`) se interpretará como un separador de directorios (`/`).

#### Directivas Iniciales

Para empezar, el motor reconocerá las siguientes directivas:

*   `::theme`: Especifica una plantilla HTML que servirá como base para el documento actual.
    *   **Ejemplo:** `<!-- ::theme.home -->`
    *   **Interpretación:** Se usará la directiva `theme` para buscar un archivo en una ruta como `.../themes/home.html`.

*   `::include`: Inserta el contenido de otro archivo HTML en la ubicación del marcador.
    *   **Ejemplo:** `<!-- ::include.modules.hero -->`
    *   **Interpretación:** Se usará la directiva `include` para buscar un archivo en una ruta como `.../includes/modules/hero.html`.