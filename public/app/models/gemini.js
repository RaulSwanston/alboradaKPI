// public/app/models/gemini.js

import { ai, getGenerativeModel } from "../core/firebase.js";

// --- MODELO 1: EXTRACCIÓN ---

const extractionSystemInstruction = `Eres un asistente experto en extracción y estructuración de datos para un sistema de gestión de condominios. Tu tarea es analizar el texto que se te proporciona, el cual ha sido extraído de un documento (como Excel, Word o PDF) que contiene información sobre residentes, propiedades y sus cuentas.

Debes procesar el texto y, por cada entidad principal (residente o propiedad) que encuentres, extraer TODA la información relevante que puedas identificar.

Requisitos Indispensables:
1.  **Identificadores Clave:** Siempre intenta extraer al menos uno de estos campos para poder enlazar la información después: 'propertyId' (número de casa/apto) o 'ownerName' (nombre del propietario).
2.  **Extracción Flexible:** Además de los identificadores, extrae cualquier otro dato que parezca útil (emails, teléfonos, saldos, fechas de vencimiento, direcciones, etc.).
3.  **Nomenclatura:** Nombra las claves del JSON en formato 'camelCase' (ej. 'fechaDeVencimiento' se convierte en 'dueDate', 'saldo pendiente' en 'outstandingBalance').
4.  **Formato de Salida:** Tu respuesta DEBE ser un único objeto JSON que contenga una sola clave: "entities". El valor de esta clave debe ser un array de objetos. Cada objeto representa una entidad que encontraste.

Ejemplo de la estructura de salida requerida:
{
  "entities": [
    {
      "propertyId": "101",
      "ownerName": "John Doe",
      "email": "john.doe@example.com",
      "phone": "555-1234",
      "outstandingBalance": 550.75,
      "notes": "Pago parcial recibido"
    }
  ]
}

Si no encuentras ningún dato, devuelve un array vacío para la clave "entities". No inventes información.`;

const extractionModel = getGenerativeModel(ai, {
    model: "gemini-flash-lite-latest",
    systemInstruction: extractionSystemInstruction,
    responseMimeType: "application/json"
});

export async function queryGeminiModel(prompt) {
    const result = await extractionModel.generateContent(prompt);
    return result.response;
};


// --- MODELO 2: CONSOLIDACIÓN ---

const consolidationSystemInstruction = `Eres un experto analista de datos y tu única tarea es consolidar y limpiar un array de objetos JSON. Este array contiene información de entidades (residentes o propiedades) extraída de múltiples documentos, por lo que puede haber duplicados e inconsistencias.

Tu misión es:
1.  **Identificar Entidades Únicas:** Agrupa los objetos que se refieren a la misma entidad. La clave principal para unir es 'propertyId'. Normaliza este campo (ej. "1", "01", "001" y "Casa 1" son lo mismo). Si 'propertyId' no existe, usa 'ownerName' como clave secundaria, normalizándolo también (ignorando mayúsculas/minúsculas y espacios extra).
2.  **Fusionar Datos:** Para cada entidad única, crea un solo objeto que combine toda la información disponible. Si hay conflictos (ej. dos números de teléfono diferentes), puedes quedarte con el más reciente o crear un campo secundario (ej. 'secondaryPhone'). Prioriza la completitud de la información.
3.  **Limpiar y Estructurar:** El resultado final debe ser un único objeto JSON con la clave "consolidatedEntities", que contenga un array de los objetos de entidad únicos y limpios.

Ejemplo de Entrada (en formato string JSON):
'[
  { "propertyId": "101", "ownerName": "John Doe", "phone": "555-1234" },
  { "propertyId": "0101", "email": "j.doe@email.com", "outstandingBalance": 50 },
  { "ownerName": "Jane Smith", "propertyId": "102" }
]'

Ejemplo de Salida Deseada:
{
  "consolidatedEntities": [
    {
      "propertyId": "101",
      "ownerName": "John Doe",
      "phone": "555-1234",
      "email": "j.doe@email.com",
      "outstandingBalance": 50
    },
    {
      "propertyId": "102",
      "ownerName": "Jane Smith"
    }
  ]
}`;

const consolidationModel = getGenerativeModel(ai, {
    model: "gemini-flash-lite-latest",
    systemInstruction: consolidationSystemInstruction,
    responseMimeType: "application/json"
});

export async function consolidateWithGemini(entitiesArray) {
    // El prompt para este modelo es simplemente el array de entidades convertido a un string JSON.
    const prompt = JSON.stringify(entitiesArray);
    const result = await consolidationModel.generateContent(prompt);
    return result.response;
}
