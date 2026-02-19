// public/app/core/documentProcessor.js

// --- IMPORTACIONES DE LIBRERÍAS ---

// mammoth: Se importa para procesar exclusivamente archivos de Microsoft Word (.docx).
// Es importante porque nos permite extraer el contenido de texto plano de estos
// documentos directamente en el navegador del cliente, sin necesidad de un servidor.
// Nota: 'esm.sh' es un CDN que convierte paquetes de npm en módulos ES6 compatibles con el navegador.
import mammoth from 'https://esm.sh/mammoth';

// SheetJS (xlsx): Se importa para leer y procesar archivos de hojas de cálculo.
// 'read' es la función para parsear el archivo y 'utils' nos da herramientas
// adicionales, como 'sheet_to_json' para convertir los datos a un formato manejable.
// Es crucial para poder interpretar datos tabulares de archivos como .xlsx y .xls.
import { read, utils } from "../../src/libs/xlsx.mjs";

// PDF.js (pdfjsLib): La librería de Mozilla para trabajar con archivos PDF.
// La importamos para poder abrir documentos .pdf y extraer su contenido de texto página por página.
// Es la herramienta estándar y más robusta para manejar la complejidad del formato PDF en la web.
import * as pdfjsLib from '../../src/libs/pdf.mjs';

// Configura la ubicación del worker de PDF.js.
// Para producción, se recomienda alojar este archivo en tu propio servidor.
pdfjsLib.GlobalWorkerOptions.workerSrc = '../../src/libs/pdf.worker.mjs';

/**
 * Determina el tipo de archivo basado en su extensión.
 * @param {File} file - El objeto de archivo.
 * @returns {string} El tipo de archivo ('excel', 'word', 'pdf', 'csv', 'txt', o 'file').
 */

function getFileType(file) {
  const extension = file.name.split('.').pop().toLowerCase();
  if (['xls', 'xlsx'].includes(extension)) return 'excel';
  if (['doc', 'docx'].includes(extension)) return 'word';
  if (extension === 'json') return 'json';
  if (extension === 'csv') return 'csv';
  if (extension === 'txt') return 'txt';
  if (extension === 'pdf') return 'pdf';
  return 'file';
}

/**
 * Procesa un archivo (File object) y devuelve su contenido textual o JSON.
 * @param {File} file - El archivo a procesar.
 * @returns {Promise<{type: 'json'|'text', content: any}>} Un objeto con el contenido y el tipo.
 * @throws {Error} Si el tipo de archivo no es soportado.
 */
export async function processFile(file) {
    const fileType = getFileType(file);
    const arrayBuffer = await file.arrayBuffer();

    if (fileType === 'excel') {
        const workbook = read(arrayBuffer);
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = utils.sheet_to_json(worksheet, { header: 1 });
        return { type: 'json', content: data, success: true };
    } 
    
    if (fileType === 'word') {
        const result = await mammoth.extractRawText({ arrayBuffer });
        return { type: 'text', content: result.value, success: true };
    } 
    
    if (fileType === 'pdf') {
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            fullText += textContent.items.map(item => item.str).join(' ') + '\n\n';
        }
        return { type: 'text', content: fullText, success: true };
    }

    // Para archivos de texto plano o CSV
    if (fileType === 'txt' || fileType === 'csv') {
        const textDecoder = new TextDecoder('utf-8');
        const text = textDecoder.decode(arrayBuffer);
        return { type: 'text', content: text, success: true };
    }

    throw new Error(`Tipo de archivo no soportado: ${file.name}`);
}
