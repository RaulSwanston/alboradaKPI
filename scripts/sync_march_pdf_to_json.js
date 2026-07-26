const fs = require('fs');
const path = require('path');

// Ruta de archivos
const JSON_PATH = 'public/src/doc/movimientos_propiedades/transacciones_marzo_2025.json';

// Datos extraídos manualmente del PDF "marzo2025.pdf" (Estado de Cuenta Alborada)
// Se incluyen PAGOS (Ingresos) y GASTOS/RETIROS (Egresos en negativo)
const pdfTransactions = [
    // --- 01-mar-2025 ---
    { date: '2025-03-01', voucher: '16819', desc: 'YAPPY DE ROBERTO RODRIGUEZ PEREIRA POR Paga casa 43 familia Rodriguez enero y febrero', house: '43', amount: 30.00 },
    { date: '2025-03-01', voucher: '16820', desc: 'EFECTIVO FLIA VANEGAS -CASA 200 ENERO -FEBRERO Y MARZO', house: '200', amount: 45.00 },
    { date: '2025-03-01', voucher: '16821', desc: 'EFECTIVO DELANO SANDERS - CASA 285 FEBRERO Y MARZO', house: '285', amount: 30.00 },
    { date: '2025-03-01', voucher: '16822', desc: 'YAPPY DE PASTOR CAMARENA SMITH', house: 'D-10', amount: 30.00 },
    // --- 02-mar-2025 ---
    { date: '2025-03-02', voucher: '16823', desc: 'YAPPY DE JULIO ENRIQUE MEJIA POR Seguridad y mantenimiento Casa 291 Flia Mejia Nino', house: '291', amount: 30.00 },
    { date: '2025-03-02', voucher: '16824', desc: 'BANCA MOVIL TRANSFERENCIA DE LEOPOLDO QUINTERO VALDES (O) LUZMILA ELENA PORTER DE QUINTER', house: '47', amount: 30.00 },
    { date: '2025-03-02', voucher: '16825', desc: 'YAPPY DE YAVIRITZEL DEL CARMEN PANAY POR Enero y febrero casa 187', house: '187', amount: 30.00 },
    { date: '2025-03-02', voucher: '16826', desc: 'YAPPY DE YESICA MARLENE CHIFUNDO DE PRESTAN POR Seguridad y mantenimiento de casa 210 Flia', house: '210', amount: 30.00 },
    { date: '2025-03-02', voucher: '16827', desc: 'YAPPY DE SARALIZ LORENA HUSBAND DE VELASQUEZ POR casa 117 tercera oeste flia Velasquez', house: '117', amount: 30.00 },
    { date: '2025-03-02', voucher: '16828', desc: 'YAPPY DE SUMAYKIRA YANILET GRENALD FERREIRA POR Pago de Casa 136 familia Grenald mantenimi', house: '136', amount: 30.00 },
    { date: '2025-03-02', voucher: '16829', desc: 'YAPPY DE NATIVIDAD SANCHEZ DE FORBES', house: '175', amount: 30.00 },
    { date: '2025-03-02', voucher: '16830', desc: 'YAPPY DE ISAIAS FRANCISCO TATE BENJAMIN POR mes de enero casa 239 Tate', house: '239', amount: 15.00 },
    { date: '2025-03-02', voucher: '16831', desc: 'YAPPY DE YARITZA YAMILKA COOPER CHIFUNDO POR Mes de febrero Casa 202 Silvina Chifundo Yari', house: '202', amount: 15.00 },
    { date: '2025-03-02', voucher: '16832', desc: 'YAPPY DE ANTONIO ALCEDO AGUIRRE POR Casa 217 Enero', house: '217', amount: 15.00 },
    { date: '2025-03-02', voucher: '16833', desc: 'BANCA MOVIL TRANSFERENCIA DE FELICIA OLIVIA GITTENS MERCHANT Casa 40 Flia GittensZachary m', house: '40', amount: 45.00 },
    { date: '2025-03-02', voucher: '16834', desc: 'BANCA MOVIL TRANSFERENCIA DE NATIVIDAD VALENCIA DE JIMENEZ mantenimiento de marzo Casa N 2', house: '26', amount: 15.00 },
    { date: '2025-03-02', voucher: '16835', desc: 'BANCA MOVIL TRANSFERENCIA DE KRISTIANY QUERUBE OGLIVIE SANCLEMENTE A TERCEROS', house: '186', amount: 15.00 },
    { date: '2025-03-02', voucher: '16836', desc: 'BANCA MOVIL TRANSFERENCIA DE PORFIRIO JUSTAVINO CEDEÑO mes de marzo casa 289', house: '289', amount: 15.00 },
    // --- 03-mar-2025 ---
    { date: '2025-03-03', voucher: '16837', desc: 'YAPPY DE ANSELMO EMILIANO FORDE CHRISTOPHER', house: '5', amount: 15.00 },
    { date: '2025-03-03', voucher: '16838', desc: 'YAPPY DE CIARA LUZ JIMENEZ CONCEPCION', house: '16', amount: 15.00 },
    { date: '2025-03-03', voucher: '16839', desc: 'YAPPY DE VICTOR DE JESUS CASTILLO CORTEZ', house: '16', amount: 15.00 },
    { date: '2025-03-03', voucher: '16840', desc: 'YAPPY DE YANETH YAMILKA BADILLA PINEDA', house: '157', amount: 15.00 },
    { date: '2025-03-03', voucher: '16841', desc: 'BANCA MOVIL TRANSFERENCIA DE LUIS ENRIQUE AMADOR MARTINEZ pago mes Marzo', house: '195', amount: 15.00 },
    { date: '2025-03-03', voucher: '16842', desc: 'YAPPY DE MELANY DEL CARMEN TAYLOR DELGADO POR Casa 107', house: '107', amount: 30.00 },
    // --- 04-mar-2025 ---
    { date: '2025-03-04', voucher: '16843', desc: 'YAPPY DE YANIZA INDIRA ATENCIO DE DRECKETT', house: '18', amount: 45.00 },
    { date: '2025-03-04', voucher: '16844', desc: 'BANCA MOVIL TRANSFERENCIA DE BARBARA ANN BENDIGO DE SANTAMARIA Mes Marzo Flia Santamaria c', house: '44', amount: 15.00 },
    { date: '2025-03-04', voucher: '16845', desc: 'YAPPY DE VIELKA LUZMILA CUSATTI ANAYA', house: '20', amount: 10.00 },
    { date: '2025-03-04', voucher: '16846', desc: 'YAPPY DE NAYRA DEL CARMEN RAMOS RAMOS (O) JERONIMO VALENTIN HERNANDEZ POR pago de garita F', house: '54', amount: 15.00 },
    // --- 05-mar-2025 ---
    { date: '2025-03-05', voucher: '16847', desc: 'TATIANA JAEN - CASA 254 -ENERO Y FEBRERO -EFECTIVO', house: '254', amount: 30.00 },
    { date: '2025-03-05', voucher: '16848', desc: 'YAPPY DE EDIANI YENISEL MARTINEZ ARAUZ POR Mensualidad enero 2025', house: '198', amount: 15.00 },
    { date: '2025-03-05', voucher: '16849', desc: 'YAPPY DE SAHID RAFAEL VASQUEZ LAGUNA POR Garita casa 272 Enero y Febrero 2025 Flia Vasquez', house: '272', amount: 30.00 },
    { date: '2025-03-05', voucher: '16850', desc: 'Iluminada Bonilla -efectivo -casa 167 mes de febrero', house: '167', amount: 15.00 },
    { date: '2025-03-05', voucher: '16851', desc: 'YAPPY DE EDIANI YENISEL MARTINEZ ARAUZ POR Pago mes de marzo casa 198 flia Arosemena', house: '198', amount: 15.00 },
    { date: '2025-03-05', voucher: '16852', desc: 'YAPPY DE AURELINA AYARZA de MENDOZA (O) CORIEL MENDOZA AYARZA POR enero y febrero flia men', house: '244', amount: 30.00 },
    { date: '2025-03-05', voucher: '16853', desc: 'YAPPY DE GILDA TATIANA GAVIDIA de SMALL POR Mantenimiento casa 3 Flia Small', house: '3', amount: 15.00 },
    { date: '2025-03-05', voucher: '16854', desc: 'YAPPY DE HECTOR GABRIEL IBARGUEN MURILLO POR flia ibarguen Casa 21 febrero', house: '21', amount: 15.00 },
    // --- 06-mar-2025 ---
    { date: '2025-03-06', voucher: '16855', desc: 'Macias Ng - casa 11 -enero, febrero y marzo', house: '11', amount: 45.00 },
    { date: '2025-03-06', voucher: '16856', desc: 'YAPPY DE JAIME CEBALLOS ANDRADE POR casa 147 Jaime Ceballos', house: '147', amount: 45.00 },
    { date: '2025-03-06', voucher: '16857', desc: 'YAPPY DE MARIA DE LOS ANGELES MONTENEGRO DE LEON POR casa 14', house: '14', amount: 30.00 },
    { date: '2025-03-06', voucher: '16858', desc: 'Luis Levy - mant. -febrero', house: '234', amount: 15.00 },
    { date: '2025-03-06', voucher: '16859', desc: 'recibo reemplazo recibo 16775 del 18/02/2025', house: '', amount: 0.00 },
    // --- 08-mar-2025 ---
    { date: '2025-03-08', voucher: '16860', desc: 'Delano Saunders - mant, enero', house: '285', amount: 15.00 },
    { date: '2025-03-08', voucher: '16861', desc: 'Pablo Mejia - mant. Marzo y abril', house: '50', amount: 30.00 },
    { date: '2025-03-08', voucher: '16862', desc: 'Ilka Mack  -mant-marzo', house: '59', amount: 15.00 },
    { date: '2025-03-08', voucher: '16863', desc: 'Flia. Mc Laughilin   - mant. Enero y febrero', house: '161', amount: 30.00 },
    { date: '2025-03-05', voucher: '16864', desc: 'BANCA MOVIL TRANSFERENCIA DE TAMARA YEZENIA CATUY de PACHECO SEG ENERO FEBRERO MARZO C160', house: '160', amount: 45.00 },
    { date: '2025-03-06', voucher: '16865', desc: 'BANCA MOVIL TRANSFERENCIA DE MARLENE BOYCE DAWKINS casa 181 Enero y febrero', house: '181', amount: 30.00 },
    { date: '2025-03-06', voucher: '16866', desc: 'YAPPY DE YOLANDA ENEIDA LOPER ALABARCA POR mantenimiento marzo 2025 casa 271', house: '271', amount: 20.00 },
    { date: '2025-03-06', voucher: '16867', desc: 'ACH - YOHANA LISBETH MOLINAR MARIN DE GONDOLA- febrero', house: '113', amount: 15.00 },
    { date: '2025-03-06', voucher: '16868', desc: 'YAPPY DE MARTHA BIBIANA ACOSTA MARULANDA POR casa 105 familia Estrada meses de enero a mar', house: '105', amount: 45.00 },
    { date: '2025-03-06', voucher: '16869', desc: 'YAPPY DE IRASEMA ESTHER MURILLO DE SMALL', house: '119', amount: 30.00 },
    { date: '2025-03-06', voucher: '16870', desc: 'YAPPY DE MIOZOTIS DEL CARMEN OLMOS LARA- marzo', house: '10', amount: 15.00 },
    // --- 07-mar-2025 ---
    { date: '2025-03-07', voucher: '16871', desc: 'YAPPY DE YAMARIS SOTO PIMENTEL', house: '162', amount: 30.00 },
    { date: '2025-03-07', voucher: '16872', desc: 'ACH - OBREGON CHIFUNDO KIZAIDA NAYUDI - enero y febrero', house: '115', amount: 30.00 },
    { date: '2025-03-07', voucher: '16873', desc: 'YAPPY DE NURIA ELENA JIMENEZ de ABREGO POR casa193 pago Enero', house: '193', amount: 20.00 },
    { date: '2025-03-07', voucher: '16874', desc: 'BANCA MOVIL TRANSFERENCIA DE YENITZA NAYROBIS ASHAW SMALL cuota de marzo casa 261', house: '261', amount: 15.00 },
    // --- 08-mar-2025 (Continuación) ---
    { date: '2025-03-08', voucher: '16875', desc: 'YAPPY DE YUMITZIE ANNELIS HARWOOD de CEDEÑO POR pago meses de enero y febrero casa 192 Fli', house: '192', amount: 30.00 },
    { date: '2025-03-08', voucher: '16876', desc: 'BANCA MOVIL TRANSFERENCIA DE YAMILETH ALEIDA SANCHEZ DE ESPINOSA Mant y Seg ALBORADA ENE Y', house: '122', amount: 30.00 },
    { date: '2025-03-08', voucher: '16877', desc: 'YAPPY DE GREGORIA HEIDI BRYAN RAMOS por marzo casa 196', house: '196', amount: 15.00 },
    { date: '2025-03-08', voucher: '16878', desc: 'YAPPY DE GIRLY ALEXIA ROBINSON MATOS POR Pago mantenimiento enero y febrero casa 257', house: '257', amount: 30.00 },
    { date: '2025-03-08', voucher: '16879', desc: 'BANCA MOVIL TRANSFERENCIA DE KHALILA MITZOIE ASHBY DE BERMUDEZ Enero a Abril Familia Bermu', house: '212', amount: 60.00 },
    { date: '2025-03-08', voucher: '16880', desc: 'BANCA MOVIL TRANSFERENCIA DE YOLANDA FORBES FERNANDEZ Enero Febrero Marzo casa 155', house: '155', amount: 45.00 },
    { date: '2025-03-08', voucher: '16881', desc: 'BANCA MOVIL TRANSFERENCIA DE CELIA ESTHER SALAZAR de PAULT casa 183', house: '183', amount: 15.00 },
    { date: '2025-03-08', voucher: '16882', desc: 'YAPPY DE ANTONIO ALCEDO AGUIRRE POR Casa 217 marzo', house: '217', amount: 15.00 },
    { date: '2025-03-08', voucher: '16883', desc: 'YAPPY DE GUILLERMO CHALHOUB RODRIGUEZ POR Enero y Feb 2025 Casa 250 Alborada', house: '250', amount: 30.00 },
    { date: '2025-03-08', voucher: '16884', desc: 'YAPPY DE LUZ MARIA MEDINA OLAYA POR Enero y febrero flia Sotomayor casa 209', house: '209', amount: 30.00 },
    { date: '2025-03-08', voucher: '16885', desc: 'YAPPY DE VIELKA LUZMILA CUSATTI ANAYA -marzo', house: '20', amount: 15.00 },
    // --- 09-mar-2025 ---
    { date: '2025-03-09', voucher: '16886', desc: 'BANCA MOVIL TRANSFERENCIA DE ALIZA EMERITA JIMENEZ A TERCEROS mant. Marzo- casa 30', house: '30', amount: 15.00 },
    // --- 10-mar-2025 ---
    { date: '2025-03-10', voucher: '16887', desc: 'YAPPY DE ENRIQUE HERRERA MUÑOZ POR pago anual ano 2025 casa77 fliaHerrera', house: '77', amount: 200.00 },
    { date: '2025-03-10', voucher: '16888', desc: 'ACH - DEMETRIO CELSO PRESCOTT RODRIGUEZ', house: '241', amount: 15.00 },
    { date: '2025-03-10', voucher: '16889', desc: 'BANCA MOVIL TRANSFERENCIA DE NATZURY YEISSEL REINA BERNAL A TERCEROS casa 132 enero y febrero', house: '132', amount: 30.00 },
    { date: '2025-03-10', voucher: '16890', desc: 'ACH - HAMILTON GONZALEZ IRIS ELIZABETH DE enero - marzo', house: '111', amount: 45.00 },
    { date: '2025-03-10', voucher: '16891', desc: 'BANCA MOVIL TRANSFERENCIA DE LUZ GRACIELA MARTINEZ RODRIGUEZ pago a seguridad enero casa 2', house: '245', amount: 15.00 },
    // --- 11-mar-2025 ---
    { date: '2025-03-11', voucher: '16892', desc: 'FLIA RUDY  MES DE ENERO- FEBRERO Y MARZO', house: '32', amount: 45.00 },
    { date: '2025-03-11', voucher: '16893', desc: 'YVONNE ROBERTS - ENERO -ABRIL', house: '92', amount: 60.00 },
    { date: '2025-03-11', voucher: '16894', desc: 'LORRAINE DE ALEXANDER - ENERO Y FEBRERO', house: '89', amount: 30.00 },
    { date: '2025-03-11', voucher: '16895', desc: 'KAREN DE GONZALEZ - ENERO -FEBRE- Y MARZO-25', house: '97', amount: 45.00 },
    { date: '2025-03-11', voucher: '16896', desc: 'OMAR CUETO - ENERO -FEB- MARZO', house: '2', amount: 45.00 },
    { date: '2025-03-11', voucher: '16897', desc: 'FLIA. BARNES -  MARZO/25', house: '148', amount: 15.00 },
    { date: '2025-03-11', voucher: '16898', desc: 'ISAAC FRANCIS - ENERO -FEB-MARZO', house: '288', amount: 45.00 },
    { date: '2025-03-11', voucher: '16899', desc: 'CARLOS GARAY - ENERO', house: '4', amount: 15.00 },
    { date: '2025-03-11', voucher: '16900', desc: 'ARACELIS TUD DE ROSALES - ENERO Y FEBRERO', house: '140', amount: 30.00 },
    { date: '2025-03-11', voucher: '16901', desc: 'YAPPY DE ZAIS ANTONIO COSTARELOS HERRERA POR Casa 230 Fam Costarelos Enero feb y Marzo 202', house: '230', amount: 45.00 },
    // --- 15-mar-2025 ---
    { date: '2025-03-15', voucher: '16902', desc: 'FLIA CUERVO - ENERO-FEB-MARZO', house: '253', amount: 45.00 },
    { date: '2025-03-15', voucher: '16903', desc: 'FLIA. GITTENS -ENERO A MARZO', house: '61', amount: 45.00 },
    // --- 17-mar-2025 ---
    { date: '2025-03-17', voucher: '16904', desc: 'SERGIO DE CASTRO - ENERO Y FEBRERO', house: '246', amount: 30.00 },
    { date: '2025-03-17', voucher: '16905', desc: 'AURA HURTADO - ENERO A MARZO', house: '9', amount: 45.00 },
    { date: '2025-03-17', voucher: '16906', desc: 'ANULADO', house: '', amount: 0.00 },
    { date: '2025-03-17', voucher: '16907', desc: 'ANULADO', house: '', amount: 0.00 },
    // --- 11-mar-2025 (Rezagados/Orden de PDF) ---
    { date: '2025-03-11', voucher: '16908', desc: 'BANCA MOVIL TRANSFERENCIA DE DAMARIS ESTHER SARMIENTO de MARTINEZ CASA 324 MARTINEZ SARMIE -ENERO Y FEBRERO', house: '324', amount: 30.00 },
    { date: '2025-03-11', voucher: '16909', desc: 'BANCA MOVIL TRANSFERENCIA DE GISELA GONZALEZ QUIROZ Casa 88 Gisela Gonzalez Enero a Abril', house: '88', amount: 60.00 },
    { date: '2025-03-11', voucher: '16910', desc: 'YAPPY DE NIDIA ROSA BOHORQUEZ DE MARTINEZ enero - febrero', house: '63', amount: 30.00 },
    { date: '2025-03-11', voucher: '16911', desc: 'FLIA CHIRU', house: '292', amount: 15.00 },
    { date: '2025-03-11', voucher: '16912', desc: 'YAPPY DE EMELINA IVETT CATUY ALARCON POR casa 68 familia Pacheco catuy recibo al nombre de', house: '68', amount: 15.00 },
    // --- 12-mar-2025 ---
    { date: '2025-03-12', voucher: '16913', desc: 'BANCA MOVIL TRANSFERENCIA DE MARCELA PAVIA DE LAJON (TRANSPORTE LAJON) Pago Enero Febrero', house: 'D-06', amount: 45.00 },
    { date: '2025-03-12', voucher: '16914', desc: 'DEPOSITO CUENTA DE AHORROS SIN LIBRETA FLIA CAMPOS -', house: '304', amount: 15.00 },
    { date: '2025-03-12', voucher: '16915', desc: 'ACH - MUNOZ BALLARD YIRA ENERO -ABRIL CASA 73', house: '73', amount: 60.00 },
    { date: '2025-03-12', voucher: '16916', desc: 'BANCA MOVIL TRANSFERENCIA DE ALEXANDRIA URSULA TAYLOR pago seguridad enero a dic 2024', house: '226', amount: 180.00 },
    { date: '2025-03-12', voucher: '16917', desc: 'BANCA MOVIL TRANSFERENCIA DE CARLOS ERNESTO LAMBERT PEREZ A TERCEROS', house: '223', amount: 30.00 },
    { date: '2025-03-12', voucher: '16918', desc: 'YAPPY DE MARIBEL ARISPE DE VEGA - ENERO Y FEBRERO', house: '296', amount: 30.00 },
    { date: '2025-03-12', voucher: '16919', desc: 'YAPPY DE SONIA ISABEL RODRIGUEZ DE MURILLO POR Familia MurilloRodriguez casa 34 enerofebre', house: '34', amount: 45.00 },
    { date: '2025-03-12', voucher: '16920', desc: 'BANCA MOVIL TRANSFERENCIA DE BOLIVAR RODRIGUEZ TORIBIO Alborada casa 295 flia Rodriguez Le', house: '295', amount: 45.00 },
    // --- 13-mar-2025 ---
    { date: '2025-03-13', voucher: '16921', desc: 'YAPPY DE ADDIS MASSIEL BETEGON ROSALES POR Casa 33 enero febrero marzo Familia Betegon Ros', house: '33', amount: 45.00 },
    { date: '2025-03-13', voucher: '16922', desc: 'YAPPY DE ROSEMENE SERVILIUS MEDIEU (CARIBBEAN FOOD GOURMET)', house: '182', amount: 15.00 },
    { date: '2025-03-13', voucher: '16923', desc: 'YAPPY DE MAUREL MARIAM MIER DE ESCOBAR -FLIA escobar - febrero y marzo', house: '221', amount: 30.00 },
    { date: '2025-03-13', voucher: '16924', desc: 'ACH - JASMIN SUSAN JOHNSON FORBES - ENERO', house: '42', amount: 15.00 },
    { date: '2025-03-13', voucher: '16925', desc: 'YAPPY DE VANESSA VICTORIA PARNTHER LUZCANDO POR Mant casa 80 de Enero a Abril 2025 calle 2', house: '80', amount: 60.00 },
    { date: '2025-03-13', voucher: '16926', desc: 'YAPPY DE EDGAR PAUL ORTEGA PIMENTEL POR Casa 323 Flia Ortega Mar y Abr', house: '323', amount: 30.00 },
    { date: '2025-03-13', voucher: '16927', desc: 'YAPPY DE JOSE DAVID BONILLA ALVARADO POR Pago Garita Enero y Febrero 2025 Casa D14 Flia Bo', house: 'D-14', amount: 30.00 },
    // --- 14-mar-2025 ---
    { date: '2025-03-14', voucher: '16928', desc: 'YAPPY DE JAIME ALBERTO PEREZ MERO - MARZO', house: '205', amount: 15.00 },
    { date: '2025-03-14', voucher: '16929', desc: 'YAPPY DE LINETH GISSEL SANTOS MELENDEZ POR enero febrero y marzo familia Paz casa 7', house: '7', amount: 45.00 },
    { date: '2025-03-19', voucher: '16930', desc: 'CASA 89 LORREAINE ALEXANDER - MARZO', house: '89', amount: 15.00 }, // Nota: Fecha en PDF dice 19 pero orden es 14, se asume 14 o 19. Usaremos 19 como dice.
    // --- 21-mar-2025 ---
    { date: '2025-03-21', voucher: '16931', desc: 'PIEDAD DEL CID - CASA 57', house: '57', amount: 15.00 },
    // --- 14-mar-2025 (Volviendo en fechas) ---
    { date: '2025-03-14', voucher: '16932', desc: 'BANCA MOVIL TRANSFERENCIA DE LINDA YAJAIRA LAJON ANDERSON Casa 219 marzo y abril', house: '219', amount: 30.00 },
    { date: '2025-03-14', voucher: '16933', desc: 'BANCA EN LINEA TRANSFERENCIA DE HUMBERTO LUIS GUEVARA SERRACIN CASA No 23 MESES ENERO FEBR', house: '23', amount: 45.00 },
    { date: '2025-03-14', voucher: '16934', desc: 'FLIA CHIRU', house: '292', amount: 15.00 },
    { date: '2025-03-14', voucher: '16935', desc: 'BANCA MOVIL TRANSFERENCIA DE TWIRA TASHAWNNA ALLEYNE CLARK Casa 316 Ignacio Dreckett ENE a', house: '316', amount: 45.00 },
    { date: '2025-03-14', voucher: '16936', desc: 'YAPPY DE GIRLY ALEXIA ROBINSON MATOS POR Pago mantenimiento casa 257 mes de marzo', house: '257', amount: 15.00 },
    { date: '2025-03-14', voucher: '16937', desc: 'YAPPY DE ANALIDA JORDAN DE GALVAN -FEBRERO Y MARZO', house: '48', amount: 30.00 },
    { date: '2025-03-14', voucher: '16938', desc: 'YAPPY DE DIANA MARIA SANCHEZ FLORES', house: 'D-24', amount: 30.00 },
    { date: '2025-03-14', voucher: '16939', desc: 'YAPPY DE GLADYS OSIRIS VILLANUEVA DE AGUILAR', house: '37', amount: 30.00 },
    { date: '2025-03-14', voucher: '16940', desc: 'BANCA MOVIL TRANSFERENCIA DE FERNANDO CHAVERRA PINEDA Fernando Chaverra casa 317 Marzo', house: '317', amount: 15.00 },
    { date: '2025-03-14', voucher: '16941', desc: 'BANCA MOVIL TRANSFERENCIA DE NORMA JAY SKERRITT VALENTINE Pago de mantenimiento Familia BETEGON -MARZO', house: 'D-5', amount: 15.00 },
    { date: '2025-03-14', voucher: '16942', desc: 'BANCA MOVIL TRANSFERENCIA DE ORLANDO ENRIQUE ARGUELLES CUESTA Enero a abril casa 313', house: '313', amount: 60.00 },
    { date: '2025-03-14', voucher: '16943', desc: 'BANCA MOVIL TRANSFERENCIA DE JOSE MANUEL TUÑON RAMOS Pago de Enero a Marzo Casa 137 Famili', house: '137', amount: 45.00 },
    { date: '2025-03-14', voucher: '16944', desc: 'YAPPY DE ANA MICHELLE PILE OSSA (O) ARELIS VANESSA OSSA DIAZ POR enero y febrero Casa 106', house: '106', amount: 30.00 },
    { date: '2025-03-14', voucher: '16945', desc: 'YAPPY DE MARIET BROOKS SALAMANCA POR mantenimiento casa 78', house: '78', amount: 30.00 },
    // --- 15-mar-2025 ---
    { date: '2025-03-15', voucher: '16946', desc: 'YAPPY DE ANSELMO EMILIANO FORDE CHRISTOPHER- MARZO', house: '5', amount: 15.00 },
    { date: '2025-03-15', voucher: '16947', desc: 'YAPPY DE GENEVA KAYLYN CORBIN GREENAWAY (O) GEORGE CORBIN GARRICK (O) POR casa 307 calle 6', house: '307', amount: 30.00 },
    { date: '2025-03-15', voucher: '16948', desc: 'YAPPY DE KASHMAH SHAMMETH CADOGAN DE LEWIS MARZO', house: '150', amount: 15.00 },
    { date: '2025-03-15', voucher: '16949', desc: 'DEPOSITO CUENTA DE AHORROS SIN LIBRETA- FLIA BEJARANO -ENE-FEB', house: '218', amount: 30.00 },
    { date: '2025-03-15', voucher: '16950', desc: 'YAPPY DE ARTURO ROGELIO ROBINSON WILLIAMS - ENERO -ABRIL', house: '173', amount: 60.00 },
    { date: '2025-03-15', voucher: '16951', desc: 'YAPPY DE KATIRIA YATHZEEL ORTEGA CASTILLO POR casa 283', house: '283', amount: 15.00 },
    // --- 16-mar-2025 ---
    { date: '2025-03-16', voucher: '16952', desc: 'BANCA MOVIL TRANSFERENCIA DE FERNANDO DE CASTRO BUENDIA A TERCEROS - ENERO -FEB-MARZO', house: '311', amount: 45.00 },
    { date: '2025-03-16', voucher: '16953', desc: 'YAPPY DE ALAIN AMINT ARAUZ POWELL POR casa numero 1 enero y febrero', house: '1', amount: 30.00 },
    { date: '2025-03-16', voucher: '16954', desc: 'BANCA MOVIL TRANSFERENCIA DE JANINA ANGELINNA BORELLY DE MELO Casa 279 Pago de garita de l', house: '279', amount: 45.00 },
    { date: '2025-03-16', voucher: '16955', desc: 'YAPPY DE OSVALDO HERRERA CARRIAZO POR marzo casa 53 familia Herrera BAMBY', house: '53', amount: 15.00 },
    
    // --- GASTOS (Egresos) ---
    { date: '2025-03-16', voucher: 'S/N', desc: 'TRANSFERENCIA A 0499013332792 JERONIMO HERNANDEZ- MATERIALES ELECTRICOS', house: '', amount: -21.14, type: 'EXPENSE', voucherType: 'Débito' },
    
    // --- 16-mar-2025 (Continuación) ---
    { date: '2025-03-16', voucher: '16956', desc: 'YAPPY DE CELESTINA RODRIGUEZ casa 51 - pago hasta abril 2025', house: '51', amount: 60.00 },
    { date: '2025-03-16', voucher: '16957', desc: 'YAPPY DE LIGIA ELENA ADLES JIMENEZ CASA 91 enero a marzo', house: '91', amount: 45.00 },
    { date: '2025-03-16', voucher: '16958', desc: 'BANCA MOVIL TRANSFERENCIA DE YOMAIRA YAISET ASHAW SMALL cuota Febrero y Marzo Casa 293', house: '293', amount: 30.00 },
    { date: '2025-03-16', voucher: '16959', desc: 'YAPPY DE AURA MERCEDES PINEDA DE SANTAMARIA POR Casa31 familia Santamaria', house: '31', amount: 60.00 },
    { date: '2025-03-16', voucher: '16960', desc: 'BANCA MOVIL TRANSFERENCIA DE LISSETH HERMINIA DE LA ESPADA DE DE NICOLO mensualidad Marzo', house: '194', amount: 15.00 },
    { date: '2025-03-16', voucher: '16961', desc: 'BANCA MOVIL TRANSFERENCIA DE YISEL BONET ALTAMIRANDA DE YARD pago casa 156 flia Yard mes d', house: '156', amount: 15.00 },
    { date: '2025-03-16', voucher: '16962', desc: 'YAPPY DE WYLMA ISUALY MATURANA DE ESCOBAR', house: '85', amount: 15.00 },
    { date: '2025-03-16', voucher: '16963', desc: 'YAPPY DE YESICA MARLENE CHIFUNDO DE PRESTAN POR seguridad del mes de marzo Flia Prestan ca', house: '210', amount: 15.00 },
    { date: '2025-03-16', voucher: '16964', desc: 'YAPPY DE SUMAYKIRA YANILET GRENALD FERREIRA POR Pago de casa 136 familia Grenald mantenimi', house: '136', amount: 15.00 },
    { date: '2025-03-16', voucher: '16965', desc: 'BANCA MOVIL TRANSFERENCIA DE MIGUEL ANTONIO TAMAYO MARTINEZ CASA D19 FLIA TAMAYO MES DE MA', house: 'D-19', amount: 15.00 },
    // --- 17-mar-2025 ---
    { date: '2025-03-17', voucher: '16966', desc: 'YAPPY DE JOANNA VANESSA EVERSLEY DE VALDES POR casa 71 FEB-MAR', house: '71', amount: 30.00 },
    { date: '2025-03-17', voucher: '16967', desc: 'YAPPY DE JULIO ENRIQUE MEJIA POR Pago de Mant y Garita de Marzo Casa 291 Flia Mejia', house: '291', amount: 15.00 },
    { date: '2025-03-17', voucher: '16968', desc: 'YAPPY DE ERNESTO GALVAN LEON (FANCYS CLUB)- ENERO', house: '139', amount: 15.00 },
    { date: '2025-03-17', voucher: '16969', desc: 'YAPPY DE ERNESTO GALVAN LEON (FANCYS CLUB) FEBRERO- MARZO', house: '139', amount: 30.00 },
    { date: '2025-03-17', voucher: '16970', desc: 'ACH - REYNALDO ANGARITA CALDERON', house: '82', amount: 45.00 },
    { date: '2025-03-17', voucher: '16971', desc: 'ACH - JOSE LUIS GONZALEZ FLETCHER - ENERO Y MARZO', house: '247', amount: 30.00 },
    { date: '2025-03-17', voucher: '16972', desc: 'DEPOSITO CUENTA DE AHORROS SIN LIBRETA- FLIA BEJARANO -ENE-FEB nuria dice que es  flia kandrin', house: '151', amount: 30.00 },
    { date: '2025-03-17', voucher: '16973', desc: 'YAPPY DE ENRIQUE JOSE MARCANO GOMEZ ENERO Y FEBRERO', house: '130', amount: 30.00 },
    { date: '2025-03-17', voucher: '16974', desc: 'YAPPY DE JUAN RICARDO FLORES CARDALES POR casa 280 familia Flores padilla Enero Febrero Ma', house: '280', amount: 45.00 },
    { date: '2025-03-17', voucher: '16975', desc: 'YAPPY DE CARLOS AUGUSTO LEOTEAU VASQUEZ -ENERO -ABRIL', house: '326', amount: 60.00 },
    { date: '2025-03-17', voucher: '16976', desc: 'YAPPY DE FLIA DIAZ -ENERO -FEB', house: '326', amount: 30.00 },
    { date: '2025-03-17', voucher: '16977', desc: 'YAPPY DE ZAYIRA ROSCHELL NAVAS DE ECHEVERRIA POR Pago enero y febrero Casa 249 5ta oeste', house: '249', amount: 30.00 },
    { date: '2025-03-17', voucher: '16978', desc: 'FLIA CORTES - ENERO A JUNIO', house: '203', amount: 90.00 },
    { date: '2025-03-17', voucher: '16979', desc: 'Flia Avila - enero a marzo casa 238', house: '238', amount: 45.00 },
    
    // --- GASTOS (Egresos) ---
    { date: '2025-03-17', voucher: 'S/N', desc: 'COMPRA DE CERRADURAS', house: '', amount: -55.62, type: 'EXPENSE', voucherType: 'Débito' },
    { date: '2025-03-17', voucher: 'S/N', desc: 'COMPRA DE JABON DE MANOS', house: '', amount: -1.45, type: 'EXPENSE', voucherType: 'Débito' },

    // --- 17-mar-2025 (Continuación) ---
    { date: '2025-03-17', voucher: '16980', desc: 'BANCA MOVIL TRANSFERENCIA DE LUZ GRACIELA MARTINEZ RODRIGUEZ casa 245 Flia Sarmiento Pago', house: '245', amount: 30.00 },
    { date: '2025-03-17', voucher: '16981', desc: 'YAPPY DE YANITSHA YARDEL HARRIS FREDERICK POR Casa 100 seguridad ENERO FEBRERO Y MARZO 202', house: '100', amount: 45.00 },
    { date: '2025-03-17', voucher: '16982', desc: 'YAPPY DE NITZIA ITZEL AGUILAR GALVAN POR Flia Aguilar Casa 56 2dacalleoeste', house: '56', amount: 15.00 },
    { date: '2025-03-18', voucher: '16983', desc: 'BANCA MOVIL TRANSFERENCIA DE KRISTIANY QUERUBE OGLIVIE SANCLEMENTE marzo', house: '186', amount: 15.00 },
    { date: '2025-03-18', voucher: '16984', desc: 'BANCA MOVIL TRANSFERENCIA DE ALDO ANTONIO BOVELL FINDLEY Casa 229 Familia Bovell Enero Feb', house: '229', amount: 45.00 },
    { date: '2025-03-18', voucher: '16985', desc: 'YAPPY DE NICOLE NAZARETH MICK BARRIOS POR casa 27 familia James Mick', house: '27', amount: 60.00 },
    { date: '2025-03-18', voucher: '16986', desc: 'FLIA THACHAR CASA 15 ENERO -MARZO', house: '15', amount: 45.00 },
    { date: '2025-03-18', voucher: '16987', desc: 'FLIA-CEBALLOS CASA 13 ENERO -MARZO', house: '13', amount: 45.00 },
    { date: '2025-03-18', voucher: '16988', desc: 'YAPPY DE YAVIRITZEL DEL CARMEN PANAY POR mes de marzo casa 187', house: '187', amount: 15.00 },
    { date: '2025-03-18', voucher: '16989', desc: 'BANCA MOVIL TRANSFERENCIA DE CARLENI ANYURE CLOP FLORES mensualidad enero febrero y marzo', house: '149', amount: 45.00 },
    { date: '2025-03-18', voucher: '16990', desc: 'YAPPY DE MIGUEL ROGELIO SANCHEZ PALACIO POR Marzo y Abril Flia Sanchez Casa 6 Oeste', house: '6', amount: 30.00 },
    { date: '2025-03-18', voucher: '16991', desc: 'YAPPY DE RAQUEL MAGALI RACERO DE LAWRENCE POR Casa 120 pago de ENERO Y FEBRERO familia Lawre', house: '120', amount: 30.00 },
    { date: '2025-03-19', voucher: '16992', desc: 'YAPPY DE SARALIZ LORENA HUSBAND DE VELASQUEZ POR familia Brown3ra oeste enero y febrero', house: '108', amount: 30.00 },
    
    // --- GASTOS ---
    { date: '2025-03-19', voucher: 'S/N', desc: 'BANCA EN LINEA TRANSFERENCIA A 0338011480674 TIGER SECURITY COMPANY AND TRAINING CENTER, S', house: '', amount: -2728.50, type: 'EXPENSE', voucherType: 'Débito' },

    // --- 19-mar-2025 ---
    { date: '2025-03-19', voucher: '16993', desc: 'YAPPY DE MANUEL ENRIQUE VILLARREAL GUILLEN POR pago seguridad marzo 2025 casa 103', house: '103', amount: 15.00 },
    { date: '2025-03-19', voucher: '16994', desc: 'YAPPY DE DAYANARA ITZEL BENJAMIN DE DE LEON POR casa D 12 familia De Leon', house: 'D-12', amount: 30.00 },
    { date: '2025-03-19', voucher: '16995', desc: 'DEPOSITO CUENTA DE AHORROS SIN LIBRETA', house: '', amount: 30.00 }, // Sin casa identificada, se asume UNIDENTIFIED o se deja blank
    { date: '2025-03-19', voucher: '16996', desc: 'YAPPY DE ARALIS LUSIEN CAMIRA ROJAS POR Familia Cedeno Camira Casa 258 Quinta Centro pago', house: '258', amount: 45.00 },
    { date: '2025-03-19', voucher: '16997', desc: 'BANCA MOVIL TRANSFERENCIA DE ADELSA AYARIS AGUILAR ALVARADO casa D9', house: 'D-09', amount: 15.00 },
    // --- 20-mar-2025 ---
    { date: '2025-03-20', voucher: '16998', desc: 'BANCA MOVIL TRANSFERENCIA DE JESSENIA MAGALI FRUTO DE BETHANCOURT Enero Feb Marzo Flia Bet', house: '112', amount: 45.00 },
    { date: '2025-03-20', voucher: '16999', desc: 'ACH - YOHANA LISBETH MOLINAR MARIN DE GONDOLA -marzo', house: '113', amount: 15.00 },
    { date: '2025-03-20', voucher: '17000', desc: 'BANCA MOVIL TRANSFERENCIA DE NIDIA SILGADO LEON Casa 164 mes febrero', house: '164', amount: 15.00 },
    { date: '2025-03-20', voucher: '17001', desc: 'BANCA EN LINEA TRANSFERENCIA DE ENEIRA ESTHER BELTRAN DE KIRCHMAN CASA 62 MIRNA DE LEE MES', house: '62', amount: 15.00 },
    { date: '2025-03-21', voucher: '17002', desc: 'YAPPY DE SIXTA MARIA CARDALES DE RIOS POR Casa 213 Sixta Cardales de Rios', house: '213', amount: 15.00 },
    { date: '2025-03-21', voucher: '17003', desc: 'YAPPY DE SIXTA MARIA CARDALES DE RIOS POR Casa 213', house: '213', amount: 15.00 },
    { date: '2025-03-22', voucher: '17004', desc: 'YAPPY DE AMILKAR MORENO RIOS POR Mantenimiento Casa 36', house: '36', amount: 15.00 },
    { date: '2025-03-22', voucher: '17005', desc: 'YAPPY DE IRIS DEL CARMEN GRIFFITH BETEGON POR casa 208 Enero Febrero 2025', house: '208', amount: 30.00 },
    { date: '2025-03-23', voucher: '17006', desc: 'BANCA MOVIL TRANSFERENCIA DE BARBARA ANN BENDIGO DE SANTAMARIA pago Casa 44 Flia Santamari', house: '44', amount: 15.00 },
    
    // --- GASTOS ---
    { date: '2025-03-24', voucher: 'S/N', desc: 'COMPRA DE NEVERA', house: '', amount: -171.19, type: 'EXPENSE', voucherType: 'Débito' },
    { date: '2025-03-24', voucher: 'S/N', desc: 'COMPRA DE ABANICO E INSUMOS GARITA', house: '', amount: -33.29, type: 'EXPENSE', voucherType: 'Débito' },

    // --- 24-mar-2025 ---
    { date: '2025-03-24', voucher: '17007', desc: 'ACH - SYAHMAR MILENN ORTIZ CASTILLO - marzo abril', house: '46', amount: 30.00 },
    { date: '2025-03-25', voucher: '17008', desc: 'YAPPY DE MARIBEL ARISPE DE VEGA', house: '296', amount: 15.00 },
    { date: '2025-03-25', voucher: '17009', desc: 'YAPPY DE JANETH ANGELICA PARKER DE CAMPBELL POR Casa 115 Familia Augustine', house: '115', amount: 15.00 },
    { date: '2025-03-25', voucher: '17010', desc: 'YAPPY DE ISABEL RIQUELME MARTINEZ POR casa 277 marzo y abril flia Riquelme Luque', house: '277', amount: 30.00 },
    
    // --- GASTOS ---
    { date: '2025-03-25', voucher: 'S/N', desc: 'COMPRA DE REGULADOR DE VOLTAJE', house: '', amount: -8.00, type: 'EXPENSE', voucherType: 'Débito' },

    // --- 27-mar-2025 ---
    { date: '2025-03-27', voucher: '17011', desc: 'TONY AMAYA casa 189', house: '189', amount: 30.00 },
    { date: '2025-03-27', voucher: '17012', desc: 'FLIA NORSE - CASA 318', house: '318', amount: 45.00 },
    
    // --- GASTOS (Correcciones) ---
    // NOTA: "se hizo recibo en abril que entro la plata" -> Esto NO son transacciones financieras del mes, son notas. 
    // Las ignoraremos si no afectan el saldo. Pero en el PDF no hay monto negativo, solo nota. 
    // Sin embargo, si hay un recibo 17013 y 17014 sin monto, no los agregamos.

    // --- 26-mar-2025 ---
    { date: '2025-03-26', voucher: '17015', desc: 'BANCA MOVIL TRANSFERENCIA DE MADELEIN NOEMY TAYLOR DALEY Antonio Taylos casa 118', house: '118', amount: 45.00 },
    
    // --- 27-mar-2025 ---
    { date: '2025-03-27', voucher: '17016', desc: 'YAPPY DE JAZMINA ITZEL VEGA DE SMITH POR seguridad y mantenimiento Marzo y abril 2025 Casa', house: '328', amount: 30.00 },
    { date: '2025-03-27', voucher: '17017', desc: 'YAPPY DE NATIVIDAD SANCHEZ DE FORBES POR pago mes de Marzo casa 175 flia Forbes', house: '175', amount: 15.00 },
    { date: '2025-03-27', voucher: '17018', desc: 'BANCA MOVIL TRANSFERENCIA DE DIOVANA LAVERN GRIFFITH KNIGTH casa 138 mantenimiento segurid', house: '138', amount: 30.00 },
    { date: '2025-03-27', voucher: '17019', desc: 'YAPPY DE EDIANI YENISEL MARTINEZ ARAUZ POR Mes de abril casa 198 flia Arosemena calle cuar', house: '198', amount: 15.00 },
    { date: '2025-03-27', voucher: '17020', desc: 'YAPPY DE ANIUTKA YOHANI ISAAC SILVERA POR enero y febrero casa 273', house: '273', amount: 30.00 },
    // --- 28-mar-2025 ---
    { date: '2025-03-28', voucher: '17021', desc: 'YAPPY DE LUCAS ANTONIO CORTES SURGEON POR casa 134 marzo', house: '134', amount: 15.00 },
    { date: '2025-03-28', voucher: '17022', desc: 'YAPPY DE MELANY DEL CARMEN TAYLOR DELGADO POR Casa 107 mes de marzo', house: '107', amount: 15.00 },
    { date: '2025-03-28', voucher: '17023', desc: 'YAPPY DE JULIO ENRIQUE MEJIA POR Pago de Mant y Garita de abril casa291 Flia Mejia', house: '291', amount: 15.00 },
    { date: '2025-03-28', voucher: '17024', desc: 'BANCA EN LINEA TRANSFERENCIA DE 0427120001653 DAYRA LUCILA CANALES DE SWANSTON casa 240 ma', house: '240', amount: 30.00 },
    { date: '2025-03-28', voucher: '17025', desc: 'BANCA MOVIL TRANSFERENCIA DE GYSELLE DEYANIRA GRANT WELCH Alborada CASA 265 MARZO', house: '265', amount: 15.00 },
    { date: '2025-03-28', voucher: '17026', desc: 'YAPPY DE ANA MICHELLE PILE OSSA (O) ARELIS VANESSA OSSA DIAZ POR mes de marzo', house: '106', amount: 15.00 },
    { date: '2025-03-28', voucher: '17027', desc: 'YAPPY DE YELENA DELIBETH ALVEAR ARCIA POR casa 174', house: '174', amount: 15.00 },
    { date: '2025-03-28', voucher: '17028', desc: 'YAPPY DE ERIC ARIEL VILLANUEVA (O) AIMAR ELIESER VILLANUEVA ARCHIBALD POR pago seguridad f', house: '236', amount: 15.00 },
    { date: '2025-03-28', voucher: '17029', desc: 'YAPPY DE GILDA TATIANA GAVIDIA DE SMALL POR Seguridad Marzo Flia Small casa 3', house: '3', amount: 15.00 },
    { date: '2025-03-28', voucher: '17030', desc: 'YAPPY DE BETZAIDA ITZEL CABEZA DE FORBES POR Marzo Familia Forbes casa 204', house: '204', amount: 15.00 },
    { date: '2025-03-28', voucher: '17031', desc: 'YAPPY DE JAIME DAVID ANDERSON SINCLAIR', house: '172', amount: 15.00 },
    { date: '2025-03-28', voucher: '17032', desc: 'YAPPY DE JOSE DAVID BONILLA ALVARADO POR Pago de Garita Casa D14 Flia Bonilla Gonzalez Mar', house: 'D-14', amount: 15.00 },
    { date: '2025-03-29', voucher: '17033', desc: 'BANCA MOVIL TRANSFERENCIA DE CARLOS ANTONIO MORAN MC COY Mantenimiento y Seguridad Familia', house: '251', amount: 15.00 },
    { date: '2025-03-29', voucher: '17034', desc: 'YAPPY DE VANESSA VICTORIA PARNTHER LUZCANDO', house: '75', amount: 15.00 },
    { date: '2025-03-29', voucher: '17035', desc: 'YOLANDA CAMPOS', house: '304', amount: 15.00 },
    
    // --- GASTO ---
    { date: '2025-03-29', voucher: 'S/N', desc: 'BANCA MOVIL TRANSFERENCIA A 0472996299559 PEDRO ANTONIO GLASGOW BARRETT corte de hierba pa', house: '', amount: -90.00, type: 'EXPENSE', voucherType: 'Débito' },

    // --- 29-mar-2025 (Continuación) ---
    { date: '2025-03-29', voucher: '17036', desc: 'YAPPY DE NATALIA KATIUSKA WARDROPE SANCHEZ POR pago de mensualidad Flia Martinez casa 166', house: '166', amount: 15.00 },
    { date: '2025-03-30', voucher: '17037', desc: 'YAPPY DE SHARYN TAVANE DELGADO ROWE POR Casa 199 cuota mes de marzo', house: '199', amount: 15.00 },
    { date: '2025-03-30', voucher: '17038', desc: 'YAPPY DE MIOZOTIS DEL CARMEN OLMOS LARA', house: '10', amount: 15.00 },
    { date: '2025-03-30', voucher: '17039', desc: 'YAPPY DE PASTOR CAMARENA SMITH', house: 'D-10', amount: 15.00 },
    { date: '2025-03-30', voucher: '17040', desc: 'YAPPY DE DAIZA BRU TORRES', house: '143', amount: 30.00 },
    
    // --- GASTOS (Correcciones de pago) ---
    // CORRECCIÓN: Registro único de 126.10 confirmado visualmente en el PDF (resaltado en rojo)
    { date: '2025-03-30', voucher: 'S/N', desc: 'BANCA MOVIL TRANSFERENCIA A 0499013332792 NAYRA DEL CARMEN RAMOS RAMOS (O) JERONIMO VALENT', house: '', amount: -126.10, type: 'EXPENSE', voucherType: 'Débito' },

    { date: '2025-03-30', voucher: '17041', desc: 'BANCA MOVIL TRANSFERENCIA DE FERNANDO CHAVERRA PINEDA Fernando Chaverra casa 317', house: '317', amount: 15.00 },
    { date: '2025-03-30', voucher: '17042', desc: 'BANCA MOVIL TRANSFERENCIA DE NUDIA ESTHER MORALES DE GUERRA pago 315 enero febrero', house: '315', amount: 30.00 },
    { date: '2025-03-30', voucher: '17043', desc: 'YAPPY DE VIELKA LUZMILA CUSATTI ANAYA', house: '20', amount: 15.00 },
    { date: '2025-03-30', voucher: '17044', desc: 'YAPPY DE CIARA LUZ JIMENEZ CONCEPCION', house: '16', amount: 30.00 },
    { date: '2025-03-31', voucher: '17045', desc: 'BANCA MOVIL TRANSFERENCIA DE DALIS YADIRA BANDINI AGUSTINE Pago mantenimiento flia Bandini', house: '178', amount: 15.00 },
    { date: '2025-03-31', voucher: '17046', desc: 'BANCA MOVIL TRANSFERENCIA DE DAYRA ISABEL FLORES DE MORENO Abril y mayo Casa D1', house: 'D-01', amount: 30.00 },
    { date: '2025-03-31', voucher: '17047', desc: 'BANCA MOVIL TRANSFERENCIA DE DAMARIS ESTHER SARMIENTO DE MARTINEZ MARZO ABRIL Y MAYO CASA', house: '324', amount: 45.00 },
    // 17048 error anulado en PDF
    { date: '2025-03-31', voucher: '17049', desc: 'RAUL MURDOCK - CASA 95 - MANT. MARZO', house: '95', amount: 15.00 },
    
    // --- GASTO ---
    { date: '2025-03-31', voucher: 'S/N', desc: 'BANCA MOVIL TRANSFERENCIA A 0411983626650 REYNALDO RIOS ANAYA instalacion de cerraduras ga', house: '', amount: -40.00, type: 'EXPENSE', voucherType: 'Débito' },

    { date: '2025-03-31', voucher: '17050', desc: 'YAPPY DE IDA CEMA JACKSON DE VALENCIA', house: '270', amount: 15.00 },
    { date: '2025-03-31', voucher: '17051', desc: 'YAPPY DE GABRIEL BURNHAM CHARRIS POR Casa 242 Familia Burnham Mes Marzo 2025', house: '242', amount: 15.00 },
    { date: '2025-03-31', voucher: '17052', desc: 'YAPPY DE ARIEL CORPAS BETEGON', house: '319', amount: 45.00 },
    { date: '2025-03-31', voucher: '17053', desc: 'YAPPY DE NAYRA DEL CARMEN RAMOS RAMOS (O) JERONIMO VALENTIN HERNANDEZ POR pago casa54 Familia H', house: '54', amount: 15.00 },
    
    // --- GASTO ---
    { date: '2025-03-31', voucher: 'S/N', desc: 'BANCA MOVIL TRANSFERENCIA A 0499013332792 NAYRA DEL CARMEN RAMOS RAMOS (O) JERONIMO VALENT', house: '', amount: -100.00, type: 'EXPENSE', voucherType: 'Débito' },

    { date: '2025-03-31', voucher: '17054', desc: 'YAPPY DE YARITZA YAMILKA COOPER CHIFUNDO POR Mes de Marzo 2025 Casa 202 Familia Cooper Chi', house: '202', amount: 15.00 },
    { date: '2025-03-31', voucher: '17055', desc: 'YAPPY DE MARIA DE LOS ANGELES MONTENEGRO DE LEON POR flia Montenegro casa 14 abril 2025', house: '14', amount: 15.00 },
    { date: '2025-03-31', voucher: '17056', desc: 'YAPPY DE ALBERTO GUILLERMO CHAMBERS SMITH', house: '41', amount: 30.00 },
    { date: '2025-03-31', voucher: '17057', desc: 'YAPPY DE YULIXA DEL CARMEN ESPADA DE SIERRA POR Seguridad casa 110 Familia Sierra', house: '110', amount: 30.00 },
];

console.log(`--- Procesando ${pdfTransactions.length} transacciones extraídas del PDF ---`);

// 1. Leer JSON actual
let currentData = [];
try {
    currentData = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
    console.log(`Registros actuales: ${currentData.length}`);
} catch (error) {
    console.error("Error al leer JSON:", error);
    process.exit(1);
}

// 2. Filtrar: Mantener SOLO los cargos de mantenimiento ('FEE') de -15.00
// Eliminamos cualquier 'PAYMENT' o 'EXPENSE' previo para evitar duplicados y reemplazar con la data limpia del PDF.
const maintenanceFees = currentData.filter(t => t.type === 'FEE');
console.log(`Cargos de mantenimiento conservados: ${maintenanceFees.length}`);

// 3. Convertir la data del PDF al formato del JSON
const newTransactions = pdfTransactions.map(t => {
    return {
        effectiveDate: t.date,
        voucherNumber: t.voucher || 'S/N',
        description: t.desc,
        propertyId: t.house || '__UNIDENTIFIED__',
        amount: t.amount,
        voucherType: t.voucherType || 'Recibo',
        type: t.type || 'PAYMENT', // Por defecto PAYMENT si no se especifica EXPENSE
        status: t.house ? 'verified' : 'unidentified'
    };
});

// 4. Fusionar
const finalData = [...maintenanceFees, ...newTransactions];

// 5. Ordenar por fecha
finalData.sort((a, b) => new Date(a.effectiveDate) - new Date(b.effectiveDate));

// 6. Guardar
fs.writeFileSync(JSON_PATH, JSON.stringify(finalData, null, 2), 'utf8');
console.log(`✅ JSON actualizado con éxito.`);
console.log(`Total final de registros: ${finalData.length}`);
