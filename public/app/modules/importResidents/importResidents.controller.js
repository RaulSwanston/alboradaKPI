import { processFile } from '../core/documentProcessor.js';
import { queryGeminiModel, consolidateWithGemini } from '../models/gemini.js'; // Importa las funciones de la IA
import { consolidateEntities } from '../core/dataMerge.js'; // Importa la función de fusión de entidades

// Ahora puedes usar: processFile(...), queryGeminiModel(...)
import { waitForAuth } from '../core/firebase.js';

export async function importResidents() {
  initImportResidents();
}

async function initImportResidents() {
  // 1. VERIFICACIÓN DE AUTENTICACIÓN
  const user = await waitForAuth();
  if (!user) {
    console.log('User not authenticated, redirecting to login.');
    window.location.href = '/login';
    return; // Detiene la ejecución si no hay usuario
  }
  console.log('User authenticated, initializing import page.');

  // --- ESTADO LOCAL DENTRO DE LA INICIALIZACIÓN ---
  let uploadedFiles = [];

  // --- REFERENCIAS A ELEMENTOS DEL DOM ---
  const fileInput = document.getElementById('dropzone-file');
  const dropzoneLabel = document.querySelector('.dropzone-label');
  const processButton = document.getElementById('process-file-btn');
  const dropzonePrompt = document.getElementById('dropzone-prompt');
  const filePreviewList = document.getElementById('file-preview-list');
  const feedbackDiv = document.getElementById('file-upload-feedback');

  if (!fileInput || !dropzoneLabel || !processButton || !dropzonePrompt || !filePreviewList || !feedbackDiv) {
    console.error('Error crítico: Uno o más elementos del DOM no se encontraron. Verifica la estructura del HTML.');
    return;
  }

  // --- FUNCIONES HELPER (DEFINIDAS DENTRO DEL SCOPE PARA ACCEDER A `uploadedFiles`) ---

  /**
   * Muestra un mensaje de feedback en la UI y opcionalmente un spinner.
   * @param {string} message - El mensaje a mostrar.
   * @param {'info'|'success'|'error'|'warning'} type - El tipo de mensaje para el estilo.
   * @param {boolean} showSpinner - Si es true, muestra un indicador de carga.
   */
  function updateFeedback(message, type = 'info', showSpinner = false) {
    if (feedbackDiv) {
      feedbackDiv.textContent = message;
      // Resetea las clases y añade la clase base y la del tipo de mensaje
      feedbackDiv.className = 'feedback-container';
      if (type) {
        feedbackDiv.classList.add(`feedback-${type}`);
      }
      // Añade o quita la clase para el spinner
      feedbackDiv.classList.toggle('is-loading', showSpinner);
    }
  }

  /**
   * Actualiza la interfaz para mostrar la lista de archivos cargados.
   */
  function updateFilePreviewUI() {
    if (uploadedFiles.length === 0) {
      filePreviewList.style.display = 'none';
      dropzonePrompt.style.display = 'flex';
      processButton.disabled = true;
    } else {
      dropzonePrompt.style.display = 'none';
      filePreviewList.style.display = 'block';
      filePreviewList.innerHTML = uploadedFiles.map((file, index) => {
        const fileType = getFileType(file);
        const iconSVG = getFileIcon(fileType);
        const fileSize = (file.size / 1024).toFixed(2) + ' KB';
        return `
          <div class="file-preview-item" data-index="${index}">
            <div class="file-preview-item-icon">${iconSVG}</div>
            <div class="file-preview-item-details">
              <div class="file-preview-item-name" title="${file.name}">${file.name}</div>
              <div class="file-preview-item-size">${fileType.toUpperCase()} - ${fileSize}</div>
            </div>
            <button type="button" class="file-preview-item-remove" data-index="${index}" title="Eliminar archivo">
              <svg fill="currentColor" viewBox="0 0 20 20" width="20" height="20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"></path></svg>
            </button>
          </div>
        `;
      }).join('');
      processButton.disabled = false;
    }
    updateFeedback(`${uploadedFiles.length} archivo(s) seleccionados.`, 'info');
  }

  /**
   * Maneja la selección de nuevos archivos, evitando duplicados.
   */
  function handleFileSelection(files) {
    const newFiles = Array.from(files);
    let validationError = false;

    newFiles.forEach(file => {
      // Evitar duplicados
      if (uploadedFiles.some(f => f.name === file.name && f.size === file.size)) {
        return;
      }
      
      // Validar tipo y tamaño
      const validTypes = [
        'text/csv', 
        'application/vnd.ms-excel', 
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/pdf',
        'text/plain'
      ];
      const isValidType = validTypes.includes(file.type) || ['.csv', '.xls', '.xlsx', '.doc', '.docx', '.pdf', '.txt'].some(ext => file.name.endsWith(ext));
      if (!isValidType || file.size > 5 * 1024 * 1024) {
        updateFeedback(`Archivo no válido o muy grande: ${file.name}`, 'error');
        validationError = true;
        return;
      }

      uploadedFiles.push(file);
    });

    if (!validationError) {
      updateFilePreviewUI();
    }
  }

  /**
   * Procesa la lista de archivos cargados.
   */
  async function handleFileProcessing() {
    if (uploadedFiles.length === 0) {
        updateFeedback('No hay archivos seleccionados para procesar.', 'error');
        return;
    }

    // Referencias a los elementos de la UI de resultados
    const resultsCard = document.getElementById('processing-results');
    const summaryElement = document.getElementById('processing-summary');
    const tableContainer = document.getElementById('results-table-container');

    // Ocultar resultados anteriores y prepararse para el nuevo procesamiento
    resultsCard.style.display = 'none';
    tableContainer.innerHTML = '';
    let processedFilesCount = 0;
    let allExtractedEntities = []; // Array para acumular todas las entidades extraídas

    const filesToProcess = [...uploadedFiles];
    processButton.disabled = true;
    processButton.textContent = `Procesando ${filesToProcess.length} archivo(s)...`;

    // --- PASO 1: Extracción por cada archivo ---
    for (const file of filesToProcess) {
        try {
            updateFeedback(`Extrayendo contenido de: ${file.name}...`, 'info');
            const result = await processFile(file);

            if (result.success) {
              console.log("respuesta:", result);
              return;
                const aiPrompt = `Aquí está el contenido extraído de un documento. Por favor, procesa este contenido según tus instrucciones y devuelve un JSON con las entidades encontradas:\n\n--- CONTENIDO DEL DOCUMENTO ---\n${result.content}\n--- FIN DEL CONTENIDO ---`;
                
                updateFeedback(`Enviando a IA para extracción: ${file.name}...`, 'info', true);
                const aiResponse = await queryGeminiModel(aiPrompt);
                let aiResponseText = aiResponse.text();
                let jsonString = aiResponseText;

                const firstBracketIndex = jsonString.indexOf('{');
                const lastBracketIndex = jsonString.lastIndexOf('}');

                if (firstBracketIndex !== -1 && lastBracketIndex > firstBracketIndex) {
                    jsonString = jsonString.substring(firstBracketIndex, lastBracketIndex + 1);
                }
                
                let structuredData;
                try {
                    structuredData = JSON.parse(jsonString);
                } catch (parseError) {
                    throw new Error(`La IA no devolvió un JSON de extracción válido. Respuesta: "${aiResponseText}"`);
                }

                if (structuredData.entities && Array.isArray(structuredData.entities)) {
                    allExtractedEntities.push(...structuredData.entities);
                    updateFeedback(`IA extrajo ${structuredData.entities.length} entidades de ${file.name}.`, 'success');
                } else {
                    updateFeedback(`Advertencia: IA no devolvió el formato esperado para ${file.name}.`, 'warning');
                }
                processedFilesCount++;
            } else {
                throw new Error(result.error || `Error desconocido al procesar ${file.name}`);
            }
        } catch (error) {
            console.error(`Error en la fase de extracción para ${file.name}:`, error);
            updateFeedback(`Error extrayendo datos de ${file.name}.`, 'error', false);
            allExtractedEntities.push({ file: file.name, error: error.message });
        }
    }
    
    // --- PASO 2: Consolidación Inteligente por IA ---
    let finalEntities = [];
    if (allExtractedEntities.length > 0) {
        try {
            updateFeedback('IA está consolidando y fusionando todos los datos...', 'info', true);
            const consolidationResponse = await consolidateWithGemini(allExtractedEntities);
            let consolidationText = consolidationResponse.text();
            let jsonString = consolidationText;

            const firstBracketIndex = jsonString.indexOf('{');
            const lastBracketIndex = jsonString.lastIndexOf('}');

            if (firstBracketIndex !== -1 && lastBracketIndex > firstBracketIndex) {
                jsonString = jsonString.substring(firstBracketIndex, lastBracketIndex + 1);
            }

            const consolidatedData = JSON.parse(jsonString);

            if (consolidatedData.consolidatedEntities) {
                finalEntities = consolidatedData.consolidatedEntities;
                updateFeedback('Datos consolidados por la IA con éxito.', 'success');
            } else {
                throw new Error("La respuesta de consolidación de la IA no tiene el formato esperado.");
            }
        } catch (error) {
            console.error('Error en la fase de consolidación de la IA:', error);
            updateFeedback('Error durante la consolidación final de la IA.', 'error', false);
            finalEntities = allExtractedEntities; // Como fallback, mostramos las entidades sin consolidar
            summaryElement.textContent += " (Error en la consolidación, mostrando datos crudos)";
        }
    }

    // --- PASO 3: Mostrar Resultados Finales ---
    summaryElement.textContent = `Proceso finalizado. Se encontraron ${finalEntities.length} entidades únicas en ${processedFilesCount} archivo(s).`;
    tableContainer.innerHTML = `<h4>JSON Final Consolidado:</h4><pre><code>${JSON.stringify(finalEntities, null, 2)}</code></pre>`;
    resultsCard.style.display = 'block';

    processButton.disabled = false;
    processButton.textContent = 'Procesar Archivos';
  }
  
  // --- CONFIGURACIÓN DE EVENT LISTENERS ---

  dropzoneLabel.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzoneLabel.classList.add('dragover');
  });

  dropzoneLabel.addEventListener('dragleave', () => {
    dropzoneLabel.classList.remove('dragover');
  });

  dropzoneLabel.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzoneLabel.classList.remove('dragover');
    handleFileSelection(e.dataTransfer.files);
  });

  fileInput.addEventListener('change', (e) => {
    handleFileSelection(e.target.files);
  });

  processButton.addEventListener('click', handleFileProcessing);

  // Listener para los botones de eliminar archivo (delegación de eventos)
  filePreviewList.addEventListener('click', (e) => {
    const removeButton = e.target.closest('.file-preview-item-remove');
    if (removeButton) {
      const indexToRemove = parseInt(removeButton.dataset.index, 10);
      uploadedFiles.splice(indexToRemove, 1);
      updateFilePreviewUI();
    }
  });

} // Fin de initImportResidents

// --- FUNCIONES HERMANAS (sin acceso al estado local de init) ---

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

function getFileIcon(fileType) {
    const icons = {
      excel: '<svg xmlns="http://www.w3.org/2000/svg" height="800" width="1200" viewBox="-343.4625 -532.5 2976.675 3195"><path d="M1437.75 1011.75L532.5 852v1180.393c0 53.907 43.7 97.607 97.607 97.607h1562.036c53.907 0 97.607-43.7 97.607-97.607V1597.5z" fill="#185C37"/><path d="M1437.75 0H630.107C576.2 0 532.5 43.7 532.5 97.607V532.5l905.25 532.5L1917 1224.75 2289.75 1065V532.5z" fill="#21A366"/><path d="M532.5 532.5h905.25V1065H532.5z" fill="#107C41"/><path d="M1180.393 426H532.5v1331.25h647.893c53.834-.175 97.432-43.773 97.607-97.607V523.607c-.175-53.834-43.773-97.432-97.607-97.607z" opacity=".1"/><path d="M1127.143 479.25H532.5V1810.5h594.643c53.834-.175 97.432-43.773 97.607-97.607V576.857c-.175-53.834-43.773-97.432-97.607-97.607z" opacity=".2"/><path d="M1127.143 479.25H532.5V1704h594.643c53.834-.175 97.432-43.773 97.607-97.607V576.857c-.175-53.834-43.773-97.432-97.607-97.607z" opacity=".2"/><path d="M1073.893 479.25H532.5V1704h541.393c53.834-.175 97.432-43.773 97.607-97.607V576.857c-.175-53.834-43.773-97.432-97.607-97.607z" opacity=".2"/><linearGradient gradientTransform="matrix(1 0 0 -1 0 2132)" y2="404.982" x2="967.987" y1="1729.018" x1="203.513" gradientUnits="userSpaceOnUse" id="a"><stop offset="0" stop-color="#18884f"/><stop offset=".5" stop-color="#117e43"/><stop offset="1" stop-color="#0b6631"/></linearGradient><path d="M97.607 479.25h976.285c53.907 0 97.607 43.7 97.607 97.607v976.285c0 53.907-43.7 97.607-97.607 97.607H97.607C43.7 1650.75 0 1607.05 0 1553.143V576.857c0-53.907 43.7-97.607 97.607-97.607z" fill="url(#a)"/><path d="M302.3 1382.264l205.332-318.169L319.5 747.683h151.336l102.666 202.35c9.479 19.223 15.975 33.494 19.49 42.919h1.331a798.667 798.667 0 0121.3-44.677L725.371 747.79H864.3l-192.925 314.548L869.2 1382.263H721.378L602.79 1160.158a186.298 186.298 0 01-14.164-29.66h-1.757a140.458 140.458 0 01-13.739 28.755l-122.102 223.011z" fill="#FFF"/><path d="M2192.143 0H1437.75v532.5h852V97.607C2289.75 43.7 2246.05 0 2192.143 0z" fill="#33C481"/><path d="M1437.75 1065h852v532.5h-852z" fill="#107C41"/></svg>',
      word: '<svg width="800px" height="800px" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><defs><linearGradient id="a" x1="4.494" y1="-1712.086" x2="13.832" y2="-1695.914" gradientTransform="translate(0 1720)" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#2368c4"/><stop offset="0.5" stop-color="#1a5dbe"/><stop offset="1" stop-color="#1146ac"/></linearGradient></defs><title>file_type_word</title><path d="M28.806,3H9.705A1.192,1.192,0,0,0,8.512,4.191h0V9.5l11.069,3.25L30,9.5V4.191A1.192,1.192,0,0,0,28.806,3Z" style="fill:#41a5ee"/><path d="M30,9.5H8.512V16l11.069,1.95L30,16Z" style="fill:#2b7cd3"/><path d="M8.512,16v6.5L18.93,23.8,30,22.5V16Z" style="fill:#185abd"/><path d="M9.705,29h19.1A1.192,1.192,0,0,0,30,27.809h0V22.5H8.512v5.309A1.192,1.192,0,0,0,9.705,29Z" style="fill:#103f91"/><path d="M16.434,8.2H8.512V24.45h7.922a1.2,1.2,0,0,0,1.194-1.191V9.391A1.2,1.2,0,0,0,16.434,8.2Z" style="opacity:0.10000000149011612;isolation:isolate"/><path d="M15.783,8.85H8.512V25.1h7.271a1.2,1.2,0,0,0,1.194-1.191V10.041A1.2,1.2,0,0,0,15.783,8.85Z" style="opacity:0.20000000298023224;isolation:isolate"/><path d="M15.783,8.85H8.512V23.8h7.271a1.2,1.2,0,0,0,1.194-1.191V10.041A1.2,1.2,0,0,0,15.783,8.85Z" style="opacity:0.20000000298023224;isolation:isolate"/><path d="M15.132,8.85H8.512V23.8h6.62a1.2,1.2,0,0,0,1.194-1.191V10.041A1.2,1.2,0,0,0,15.132,8.85Z" style="opacity:0.20000000298023224;isolation:isolate"/><path d="M3.194,8.85H15.132a1.193,1.193,0,0,1,1.194,1.191V21.959a1.193,1.193,0,0,1-1.194,1.191H3.194A1.192,1.192,0,0,1,2,21.959V10.041A1.192,1.192,0,0,1,3.194,8.85Z" style="fill:url(#a)"/><path d="M6.9,17.988c.023.184.039.344.046.481h.028c.01-.13.032-.287.065-.47s.062-.338.089-.465l1.255-5.407h1.624l1.3,5.326a7.761,7.761,0,0,1,.162,1h.022a7.6,7.6,0,0,1,.135-.975l1.039-5.358h1.477l-1.824,7.748H10.591L9.354,14.742q-.054-.222-.122-.578t-.084-.52H9.127q-.021.189-.084.561c-.042.249-.075.432-.1.552L7.78,19.871H6.024L4.19,12.127h1.5l1.131,5.418A4.469,4.469,0,0,1,6.9,17.988Z" style="fill:#fff"/></svg>',
      pdf: '<svg width="800px" height="800px" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><title>file_type_pdf2</title><path d="M24.1,2.072h0l5.564,5.8V29.928H8.879V30H29.735V7.945L24.1,2.072" style="fill:#909090"/><path d="M24.031,2H8.808V29.928H29.664V7.873L24.03,2" style="fill:#f4f4f4"/><path d="M8.655,3.5H2.265v6.827h20.1V3.5H8.655" style="fill:#7a7b7c"/><path d="M22.472,10.211H2.395V3.379H22.472v6.832" style="fill:#dd2025"/><path d="M9.052,4.534h-.03l-.207,0H7.745v4.8H8.773V7.715L9,7.728a2.042,2.042,0,0,0,.647-.117,1.427,1.427,0,0,0,.493-.291,1.224,1.224,0,0,0,.335-.454,2.13,2.13,0,0,0,.105-.908,2.237,2.237,0,0,0-.114-.644,1.173,1.173,0,0,0-.687-.65A2.149,2.149,0,0,0,9.37,4.56a2.232,2.232,0,0,0-.319-.026M8.862,6.828l-.089,0V5.348h.193a.57.57,0,0,1,.459.181.92.92,0,0,1,.183.558c0,.246,0,.469-.222.626a.942.942,0,0,1-.524.114" style="fill:#464648"/><path d="M12.533,4.521c-.111,0-.219.008-.295.011L12,4.538h-.78v4.8h.918a2.677,2.677,0,0,0,1.028-.175,1.71,1.71,0,0,0,.68-.491,1.939,1.939,0,0,0,.373-.749,3.728,3.728,0,0,0,.114-.949,4.416,4.416,0,0,0-.087-1.127,1.777,1.777,0,0,0-.4-.733,1.63,1.63,0,0,0-.535-.4,2.413,2.413,0,0,0-.549-.178,1.282,1.282,0,0,0-.228-.017m-.182,3.937-.1,0V5.392h.013a1.062,1.062,0,0,1,.6.107,1.2,1.2,0,0,1,.324.4,1.3,1.3,0,0,1,.142.526c.009.22,0,.4,0,.549a2.926,2.926,0,0,1-.033.513,1.756,1.756,0,0,1-.169.5,1.13,1.13,0,0,1-.363.36.673.673,0,0,1-.416.106" style="fill:#464648"/><path d="M17.43,4.538H15v4.8h1.028V7.434h1.3V6.542h-1.3V5.43h1.4V4.538" style="fill:#464648"/><path d="M21.781,20.255s3.188-.578,3.188.511S22.994,21.412,21.781,20.255Zm-2.357.083a7.543,7.543,0,0,0-1.473.489l.4-.9c.4-.9.815-2.127.815-2.127a14.216,14.216,0,0,0,1.658,2.252,13.033,13.033,0,0,0-1.4.288Zm-1.262-6.5c0-.949.307-1.208.546-1.208s.508.115.517.939a10.787,10.787,0,0,1-.517,2.434A4.426,4.426,0,0,1,18.161,13.841ZM13.513,24.354c-.978-.585,2.051-2.386,2.6-2.444C16.11,21.911,14.537,24.966,13.513,24.354ZM25.9,20.895c-.01-.1-.1-1.207-2.07-1.16a14.228,14.228,0,0,0-2.453.173,12.542,12.542,0,0,1-2.012-2.655,11.76,11.76,0,0,0,.623-3.1c-.029-1.2-.316-1.888-1.236-1.878s-1.054.815-.933,2.013a9.309,9.309,0,0,0,.665,2.338s-.425,1.323-.987,2.639-.946,2.006-.946,2.006a9.622,9.622,0,0,0-2.725,1.4c-.824.767-1.159,1.356-.725,1.945.374.508,1.683.623,2.853-.91a22.549,22.549,0,0,0,1.7-2.492s1.784-.489,2.339-.623,1.226-.24,1.226-.24,1.629,1.639,3.2,1.581,1.495-.939,1.485-1.035" style="fill:#dd2025"/><path d="M23.954,2.077V7.95h5.633L23.954,2.077Z" style="fill:#909090"/><path d="M24.031,2V7.873h5.633L24.031,2Z" style="fill:#f4f4f4"/><path d="M8.975,4.457h-.03l-.207,0H7.668v4.8H8.7V7.639l.228.013a2.042,2.042,0,0,0,.647-.117,1.428,1.428,0,0,0,.493-.291A1.224,1.224,0,0,0,10.4,6.79a2.13,2.13,0,0,0,.105-.908,2.237,2.237,0,0,0-.114-.644,1.173,1.173,0,0,0-.687-.65,2.149,2.149,0,0,0-.411-.105,2.232,2.232,0,0,0-.319-.026M8.785,6.751l-.089,0V5.271H8.89a.57.57,0,0,1,.459.181.92.92,0,0,1,.183.558c0,.246,0,.469-.222.626a.942.942,0,0,1-.524.114" style="fill:#fff"/><path d="M12.456,4.444c-.111,0-.219.008-.295.011l-.235.006h-.78v4.8h.918a2.677,2.677,0,0,0,1.028-.175,1.71,1.71,0,0,0,.68-.491,1.939,1.939,0,0,0,.373-.749,3.728,3.728,0,0,0,.114-.949,4.416,4.416,0,0,0-.087-1.127,1.777,1.777,0,0,0-.4-.733,1.63,1.63,0,0,0-.535-.4,2.413,2.413,0,0,0-.549-.178,1.282,1.282,0,0,0-.228-.017m-.182,3.937-.1,0V5.315h.013a1.062,1.062,0,0,1,.6.107,1.2,1.2,0,0,1,.324.4,1.3,1.3,0,0,1,.142.526c.009.22,0,.4,0,.549a2.926,2.926,0,0,1-.033.513,1.756,1.756,0,0,1-.169.5,1.13,1.13,0,0,1-.363.36.673.673,0,0,1-.416.106" style="fill:#fff"/><path d="M17.353,4.461h-2.43v4.8h1.028V7.357h1.3V6.465h-1.3V5.353h1.4V4.461" style="fill:#fff"/></svg>',
      json: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-filetype-json" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M14 4.5V11h-1V4.5h-2A1.5 1.5 0 0 1 9.5 3V1H4a1 1 0 0 0-1 1v9H2V2a2 2 0 0 1 2-2h5.5zM4.151 15.29a1.2 1.2 0 0 1-.111-.449h.764a.58.58 0 0 0 .255.384q.105.073.25.114.142.041.319.041.245 0 .413-.07a.56.56 0 0 0 .255-.193.5.5 0 0 0 .084-.29.39.39 0 0 0-.152-.326q-.152-.12-.463-.193l-.618-.143a1.7 1.7 0 0 1-.539-.214 1 1 0 0 1-.352-.367 1.1 1.1 0 0 1-.123-.524q0-.366.19-.639.192-.272.528-.422.337-.15.777-.149.456 0 .779.152.326.153.5.41.18.255.2.566h-.75a.56.56 0 0 0-.12-.258.6.6 0 0 0-.246-.181.9.9 0 0 0-.37-.068q-.324 0-.512.152a.47.47 0 0 0-.185.384q0 .18.144.3a1 1 0 0 0 .404.175l.621.143q.326.075.566.211a1 1 0 0 1 .375.358q.135.222.135.56 0 .37-.188.656a1.2 1.2 0 0 1-.539.439q-.351.158-.858.158-.381 0-.665-.09a1.4 1.4 0 0 1-.478-.252 1.1 1.1 0 0 1-.29-.375m-3.104-.033a1.3 1.3 0 0 1-.082-.466h.764a.6.6 0 0 0 .074.27.5.5 0 0 0 .454.246q.285 0 .422-.164.137-.165.137-.466v-2.745h.791v2.725q0 .66-.357 1.005-.355.345-.985.345a1.6 1.6 0 0 1-.568-.094 1.15 1.15 0 0 1-.407-.266 1.1 1.1 0 0 1-.243-.39m9.091-1.585v.522q0 .384-.117.641a.86.86 0 0 1-.322.387.9.9 0 0 1-.47.126.9.9 0 0 1-.47-.126.87.87 0 0 1-.32-.387 1.55 1.55 0 0 1-.117-.641v-.522q0-.386.117-.641a.87.87 0 0 1 .32-.387.87.87 0 0 1 .47-.129q.265 0 .47.129a.86.86 0 0 1 .322.387q.117.255.117.641m.803.519v-.513q0-.565-.205-.973a1.46 1.46 0 0 0-.59-.63q-.38-.22-.916-.22-.534 0-.92.22a1.44 1.44 0 0 0-.589.628q-.205.407-.205.975v.513q0 .562.205.973.205.407.589.626.386.217.92.217.536 0 .917-.217.384-.22.589-.626.204-.41.205-.973m1.29-.935v2.675h-.746v-3.999h.662l1.752 2.66h.032v-2.66h.75v4h-.656l-1.761-2.676z"/></svg>',
      csv: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-filetype-csv" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M14 4.5V14a2 2 0 0 1-2 2h-1v-1h1a1 1 0 0 0 1-1V4.5h-2A1.5 1.5 0 0 1 9.5 3V1H4a1 1 0 0 0-1 1v9H2V2a2 2 0 0 1 2-2h5.5zM3.517 14.841a1.13 1.13 0 0 0 .401.823q.195.162.478.252.284.091.665.091.507 0 .859-.158.354-.158.539-.44.187-.284.187-.656 0-.336-.134-.56a1 1 0 0 0-.375-.357 2 2 0 0 0-.566-.21l-.621-.144a1 1 0 0 1-.404-.176.37.37 0 0 1-.144-.299q0-.234.185-.384.188-.152.512-.152.214 0 .37.068a.6.6 0 0 1 .246.181.56.56 0 0 1 .12.258h.75a1.1 1.1 0 0 0-.2-.566 1.2 1.2 0 0 0-.5-.41 1.8 1.8 0 0 0-.78-.152q-.439 0-.776.15-.337.149-.527.421-.19.273-.19.639 0 .302.122.524.124.223.352.367.228.143.539.213l.618.144q.31.073.463.193a.39.39 0 0 1 .152.326.5.5 0 0 1-.085.29.56.56 0 0 1-.255.193q-.167.07-.413.07-.175 0-.32-.04a.8.8 0 0 1-.248-.115.58.58 0 0 1-.255-.384zM.806 13.693q0-.373.102-.633a.87.87 0 0 1 .302-.399.8.8 0 0 1 .475-.137q.225 0 .398.097a.7.7 0 0 1 .272.26.85.85 0 0 1 .12.381h.765v-.072a1.33 1.33 0 0 0-.466-.964 1.4 1.4 0 0 0-.489-.272 1.8 1.8 0 0 0-.606-.097q-.534 0-.911.223-.375.222-.572.632-.195.41-.196.979v.498q0 .568.193.976.197.407.572.626.375.217.914.217.439 0 .785-.164t.55-.454a1.27 1.27 0 0 0 .226-.674v-.076h-.764a.8.8 0 0 1-.118.363.7.7 0 0 1-.272.25.9.9 0 0 1-.401.087.85.85 0 0 1-.478-.132.83.83 0 0 1-.299-.392 1.7 1.7 0 0 1-.102-.627zm8.239 2.238h-.953l-1.338-3.999h.917l.896 3.138h.038l.888-3.138h.879z"/></svg>',
      txt: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-filetype-txt" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M14 4.5V14a2 2 0 0 1-2 2h-2v-1h2a1 1 0 0 0 1-1V4.5h-2A1.5 1.5 0 0 1 9.5 3V1H4a1 1 0 0 0-1 1v9H2V2a2 2 0 0 1 2-2h5.5zM1.928 15.849v-3.337h1.136v-.662H0v.662h1.134v3.337zm4.689-3.999h-.894L4.9 13.289h-.035l-.832-1.439h-.932l1.228 1.983-1.24 2.016h.862l.853-1.415h.035l.85 1.415h.907l-1.253-1.992zm1.93.662v3.337h-.794v-3.337H6.619v-.662h3.064v.662H8.546Z"/></svg>',
      file: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-file-text-fill" viewBox="0 0 16 16"><path d="M12 0H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2M5 4h6a.5.5 0 0 1 0 1H5a.5.5 0 0 1 0-1m-.5 2.5A.5.5 0 0 1 5 6h6a.5.5 0 0 1 0 1H5a.5.5 0 0 1-.5-.5M5 8h6a.5.5 0 0 1 0 1H5a.5.5 0 0 1 0-1m0 2h3a.5.5 0 0 1 0 1H5a.5.5 0 0 1 0-1"/></svg>',
    };
    return icons[fileType] || icons['file'];
}