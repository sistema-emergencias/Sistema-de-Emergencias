/* Esquema del formulario de campo: define pasos y campos. El administrador maestro puede cambiar
   rótulos, ocultar campos, exigir/permitir «No aplica», cambiar opciones y agregar campos extra
   desde la página de Estadística; esos cambios se guardan en la central y se aplican sobre este esquema. */
(function (g) {
  'use strict';
  const CATS = [['CAÍDA / CORTES DE ARBOL','OTROS'],['CONTROL DE ABEJAS','OTROS'],['CONTROL DE AVISPAS','OTROS'],['CAÍDA DE CUERDAS','OTROS'],['CORTO CIRCUITO','INCENDIOS'],['COLAPSO DE ESTRUCTURAS','OTROS'],['CAPACITACIONES','OTROS'],['EXTRICACIÓN VEHICULAR','RESCATES'],['FUGA DE GAS NATURAL','OTROS'],['FUGA DE GAS GLP','MATERIALES PELIGROSOS'],['INCENDIO FORESTAL','INCENDIOS'],['INCENDIO ESTRUCTURAL','INCENDIOS'],['INCENDIO VEHICULAR','INCENDIOS'],['INUNDACIÓN','OTROS'],['LABORES DE PREVENCION O ACOMPAÑAMIENTO EN GESTION DEL RIESGO','OTROS'],['MATERIALES PELIGROSOS / DERRAMES','MATERIALES PELIGROSOS'],['PRIMEROS AUXILIOS','OTROS'],['RESCATE DE PERSONA / PARAPENTE','RESCATES'],['RESCATE DE ANIMAL','RESCATES'],['REUNIÓN EN LA ALCALDÍA','OTROS'],['REUNIONES DE SERVICIO SOCIAL','OTROS'],['SUMINISTROS DE AGUA','OTROS'],['VISITAS DE SEGURIDAD','INSPECCIONES DE SEGURIDAD']];
  const TIPOS = ['INCENDIOS','RESCATES','OTROS','MATERIALES PELIGROSOS','INSPECCIONES DE SEGURIDAD'];
  const VEH = ['B-2','B-3','B-4','T-1','L-1','L-2','L-3'];
  const SNIF = {
    tipo: [['SUP','Superficial'],['C','Copa'],['SUB','Subterráneo'],['M','Mixto'],['O','Otros'],['NS','No seleccionado']],
    causa: [['Q','Quemas fuera de control'],['D','Descuido y negligencia'],['A','Accidental'],['R','Reactivación de focos'],['I','Intencional'],['O','Otros'],['SID','Sin definir']],
    area: [['BND','Bosque Natural Denso'],['BP','Bosque plantado'],['BS','Bosque Seco'],['C','Cultivos'],['P','Páramos'],['BI','Bosque intervenido'],['R','Rastrojos'],['VS','Vegetación Seca'],['SBN_PST','Sabanas pastizales'],['PST_MNJ','Pastos manejados'],['CBR_SIN_DTR','Coberturas sin determinar'],['SP','Sabanas y pastizales'],['PM','Pastos mejorados']]
  };
  const VEH_INFO = 'B = máquina con bomba y tanque de agua (la B-3 solo tiene bomba, sin agua) · L = apoyo logístico.';
  const YN = ['SI', 'NO'];
  /* Sistema de Comando de Incidentes: funciones y apoyos. No se activa todo en todos los incidentes. */
  const SCI_ROLES = [['ci','Comandante del incidente','Asume el mando y todas las funciones que no delegue'],['seg','Oficial de seguridad','Vigila los riesgos y la seguridad del personal'],['inf','Oficial de información pública','Atiende a la prensa y a la comunidad'],['enl','Oficial de enlace','Coordina con otras instituciones'],['ops','Jefe de operaciones','Dirige las acciones tácticas en la escena'],['pla','Jefe de planificación','Recoge información y prepara el plan'],['log','Jefe de logística','Provee recursos, equipos y servicios'],['adm','Jefe de administración y finanzas','Costos, tiempos y compras']];
  const SCI_FUNC = ['Ataque / extinción','Rescate','Suministro de agua','Control de tráfico y seguridad','Búsqueda y reconocimiento','Apoyo logístico','Reserva (en espera)','Otros'];
  const SCI_NOACT = 'No se activó (la asume el comandante del incidente)';
  /* Instalaciones del SCI */
  const SCI_INST = [['Puesto de Comando (PC)','Lugar desde donde el comandante dirige el incidente. Debe ser seguro, con buena visibilidad y comunicaciones, y estar identificado.'],['Área de espera (AE)','Sitio donde los recursos llegan, se registran y esperan una asignación.'],['Base','Lugar donde se coordinan y administran las funciones logísticas del incidente (suministros, equipos, servicios).'],['Campamento','Lugar con servicios mínimos (descanso, alimentación, aseo) para el personal que lo necesita.'],['Helibase / Helipunto','Zona para operaciones de helicópteros: la helibase es el sitio principal; el helipunto es un punto temporal de aterrizaje.'],['Área de concentración de víctimas (A.C.V.)','Lugar donde se reúnen, clasifican y atienden las víctimas antes de su traslado.']];
  /* Los 8 pasos del primer respondedor al llegar a la escena (SCI) */
  const SCI_PASOS = ['Informar a su base de su arribo a la escena','Asumir el mando y establecer el Puesto de Comando (PC)','Evaluar la situación','Establecer su perímetro de seguridad','Establecer sus objetivos','Determinar las estrategias','Determinar la necesidad de recursos y posibles instalaciones','Preparar la información para transferir el mando'];
  const CANAL = ['Llamada telefónica','Radio','Personal en la estación','Policía o autoridad','Redes o WhatsApp','De oficio'];
  const TDOC = [['CC','Cédula de Ciudadanía (CC)'],['TI','Tarjeta de Identidad (TI)'],['RC','Registro Civil de Nacimiento (RC)'],['PP','Pasaporte (PP)'],['CE','Cédula de Extranjería (CE)'],['PPT','Permiso por Protección Temporal (PPT)'],['PEP','Permiso Especial de Permanencia (PEP)']];
const PTIPO = ['Vivienda','Finca','Comercial','Agrícola','Vía pública','Lote baldío','Industrial','Otro'];
  const INST = [['dc','Defensa Civil'],['cr','Cruz Roja'],['pn','Policía Nacional'],['pcar','Policía de Carreteras'],['hosp','Hospitales']];
  const LISTAS = {
    les:  { max: 6,  cols: [['n','Nombre'],['td','Tipo de documento','tdoc'],['d','Número de documento'],['e','Edad','number'],['t','Trasladado a'],['p','Trasladado por']], no: 'No hubo lesionados' },
    vimp: { max: 4,  cols: [['c','Conductor'],['td','Tipo de documento','tdoc'],['d','Número de documento'],['v','Vehículo'],['col','Color'],['pl','Placa']], no: 'No hubo vehículos implicados' },
    acc:  { max: 57, cols: [['h','Hora','time'],['a','Acción realizada','area']], no: '' },
    hall: { max: 12, cols: [['a','Área o aspecto'],['h','Hallazgo','area'],['r','Recomendación o requerimiento','area'],['p','Plazo (ej.: inmediato, 15 días)']], no: 'Sin hallazgos que requieran intervención' }
  };
  /* Actividades logísticas o institucionales: formulario simplificado (secciones 1, 2, 4 y 5; la numeración original se conserva). */
  const SIMPLE_CATS = ['CAPACITACIONES','REUNIÓN EN LA ALCALDÍA','REUNIONES DE SERVICIO SOCIAL','SUMINISTROS DE AGUA'];
  /* Visitas de seguridad: no generan constancia de emergencia sino un INFORME TÉCNICO DE INSPECCIÓN (formulario propio) */
  const INS_CAT = 'VISITAS DE SEGURIDAD';
  const CUMPLE = ['CUMPLE','NO CUMPLE','NO APLICA'];
  const CK = (p, l, hint) => ({ p: 'rpt.ins.' + p, l, t: 'chip1', o: CUMPLE, naOk: false, opt: true, hint: hint || '' });
  const SH_ITEMS = [['evac','Rutas y medios de evacuación libres, continuos y señalizados'],['sal','Salidas de emergencia: suficientes, sin obstrucción y con apertura en sentido de la evacuación'],['pas','Pasillos y escaleras: ancho libre, pasamanos y superficie antideslizante'],['sen','Señalización de seguridad y evacuación'],['ilu','Iluminación de emergencia'],['plan','Plan de emergencias, brigada y simulacros'],['aforo','Aforo / ocupación acorde con la capacidad']];
  const PCI_ITEMS = [['ext','Extintores: tipo, ubicación, carga y mantenimiento vigente'],['det','Detección y alarma de incendio'],['extf','Extinción fija (rociadores, gabinetes, red contra incendios)'],['elec','Instalaciones eléctricas (tableros, cableado, conexiones)'],['comb','Materiales combustibles y orden y aseo'],['ign','Fuentes de ignición (cocción, calor, chispas)'],['sust','Almacenamiento de sustancias peligrosas, gas o combustibles']];
  const ASK_CATS = ['LABORES DE PREVENCION O ACOMPAÑAMIENTO EN GESTION DEL RIESGO'];
  const MODO_SIMPLE = 'ACOMPAÑAMIENTO O PREVENCIÓN', MODO_EMERG = 'ATENCIÓN DE EMERGENCIA';
  const SIMPLE_STEPS = ['esencial','quien','tiempos','fotos'];
  const RANGOS_ORDEN = ['comandante','subcomandante','inspector','capitán','capitan','mayor','teniente coronel','coronel','teniente','subteniente','sargento','cabo','bombero','brigadista','aspirante','oficial'];
  const F = (p, l, t, x) => Object.assign({ p, l, t }, x || {});
  const STEPS = [
    { id: 'esencial', t: '1 · Identificación y localización del evento', f: [
      F('cat', 'Incidente o actividad', 'cat', { naOk: false }),
      F('extra._modo', '¿Fue acompañamiento/prevención o atención de una emergencia?', 'chip1', { o: [MODO_SIMPLE, MODO_EMERG], naOk: false, when: 'ask', hint: 'Si fue acompañamiento o prevención se habilita el formulario simplificado; si fue una emergencia, el completo.' }),
      F('fecha', 'Día del evento', 'date', { naOk: false }),
      F('lat', 'Ubicación (GPS)', 'gps', { naOk: false, hint: 'Obligatoria en todos los registros. Si olvidó marcarla y ya se retiró del sitio, use «Agregar o corregir ubicación» y márquela en el mapa.' }),
      F('dir', 'Dirección o lugar de referencia', 'text'),
      F('bar', 'Barrio, corregimiento o vereda', 'text'),
      F('zona', 'Zona', 'chip1', { o: ['URBANA', 'RURAL'] }) ] },
    { id: 'r_prop', t: '2 · Propiedad afectada y propietario', f: [
      F('rpt.prop.tipo', 'Tipo de propiedad', 'sel', { o: PTIPO }),
      F('rpt.prop.nom', 'Nombre del propietario', 'text'),
      F('rpt.prop.td', 'Tipo de documento del propietario', 'selv', { o: TDOC }),
      F('rpt.prop.doc', 'Número de documento del propietario', 'text'),
      F('rpt.prop.tel', 'Teléfono de contacto', 'text') ] },
    { id: 'r_eval', t: '6c · Evaluación inicial de la situación', f: [
      F('rpt.dinc', 'Descripción del incidente', 'area', { hint: 'Qué encuentra el comandante de incidentes al llegar. No es el resumen de las acciones: ese va en la descripción de los hechos.' }),
      F('rpt.amen', 'Amenazas del incidente', 'area'),
      F('rpt.obj', 'Objetivos iniciales', 'area') ] },
    { id: 'r_esc', t: '6d · Condición de la escena', f: [
      F('rpt.esc.alt', '¿Hubo alteración de la escena antes de llegar?', 'yn'),
      F('rpt.esc.altc', '¿Cómo se alteró?', 'text', { whenp: ['rpt.esc.alt', 'SI'] }),
      F('rpt.esc.prot', '¿Se protegió el área al llegar?', 'yn'),
      F('rpt.esc.protc', '¿Cómo?', 'text', { whenp: ['rpt.esc.prot', 'SI'] }),
      F('rpt.esc.int', '¿Intervino alguien antes de llegar?', 'yn'),
      F('rpt.esc.intc', '¿Quiénes?', 'text', { whenp: ['rpt.esc.int', 'SI'] }) ] },
    { id: 'r_inst', t: '6e · Instituciones de apoyo', f: INST.map(([k, n]) => F('rpt.inst.' + k, n, 'pair', { hint: 'Unidades y vehículos que enviaron' })) },
    { id: 'r_les', t: '6f · Personas lesionadas', f: [ F('rpt.les', 'Lesionados', 'list', { lista: 'les' }) ] },
    { id: 'r_vimp', t: '6g · Vehículos implicados', f: [ F('rpt.vimp', 'Vehículos implicados', 'list', { lista: 'vimp' }) ] },
    { id: 'quien', t: '4 · Personal y recursos desplegados', f: [
      F('pers', 'Personal que atendió', 'pers'),
      F('uni', 'N° de unidades que asistieron', 'auto', { naOk: false, hint: 'Se calcula solo con las personas seleccionadas arriba.' }),
      F('veh', 'Vehículo(s)', 'chipsN', { hint: VEH_INFO }) ] },
    { id: 'r_sci', t: '6i · Estructura organizacional del incidente (SCI)', f: [ 
      F('rpt.sci', 'Funciones activadas', 'sci', { naOk: false, hint: 'Es opcional: marque solo las funciones que se activaron. Las que no se marquen las asume el Comandante del incidente.' }),
      F('rpt.cmd.g', 'Grado', 'text'),
      F('rpt.cmd.c', 'Cargo', 'text') ] },
    { id: 'r_pc', t: '6b · Puesto de comando y áreas operativas', f: [
      F('rpt.pc', 'Ubicación del puesto de comando', 'text'),
      F('rpt.pcid', 'Identificación del comando de incidentes', 'text', { hint: 'Nombre o referencia con que se identificó el comando de incidentes (ej.: «Comando Incendio Vereda El Retiro»).' }),
      F('rpt.ae', 'Área de espera', 'text'),
      F('rpt.acv', 'A.C.V.', 'text') ] },
    { id: 'quepaso', t: '3 · Descripción y características del evento', f: [
      F('desc', 'Descripción de los hechos (opcional)', 'area', { naOk: false, opt: true, hint: 'Es el RELATO del evento, en tercera persona y de corrido (qué se encontró, qué ocurrió, cómo terminó). La secuencia hora por hora va en la Bitácora; no la repita aquí. Las observaciones legales o necesidades no van aquí: van en «Observaciones adicionales».' }),
      F('canal', 'Cómo se recibió el aviso', 'sel', { o: CANAL }),
      F('rep', 'Nombre de quién avisó', 'text', { hint: 'Si la central ya lo registró, aparece solo.' }),
      F('reptel', 'Teléfono de quién avisó', 'text'),
      F('area', 'Área afectada (se convierte a hectáreas)', 'hec', { when: 'forest', naOk: false }),
      F('veg', 'Vegetación afectada', 'text', { when: 'forest' }),
      F('inc.tipo', 'Tipo de incendio', 'selv', { o: SNIF.tipo, when: 'forest', naOk: false }),
      F('inc.causa', 'Causa del incendio', 'selv', { o: SNIF.causa, when: 'forest', naOk: false }),
      F('inc.areaTipo', 'Tipo de cobertura afectada', 'selv', { o: SNIF.area, when: 'forest', naOk: false }),
      F('inc.prot', '¿Es área protegida de orden nacional?', 'yn', { when: 'forest', naOk: false }),
      F('inc.protNom', 'Nombre del área protegida', 'text', { when: 'forest', whenp: ['inc.prot', 'SI'], naOk: false }) ] },
    { id: 'tiempos', t: '2 · Cronología de la respuesta', f: [
      F('hora', 'Hora de la alerta', 'time', { naOk: false }),
      F('hsal', 'Salida de la estación', 'time'),
      F('hlle', 'Llegada al sitio', 'time'),
      F('hfin', 'Terminación de la emergencia o actividad', 'time', { hint: 'Hora en que terminó la atención en el sitio. No es la hora de regreso a la estación.' }),
      F('rpt.hdes', 'Desmovilización hacia el cuartel', 'time', { hint: 'Hora en que la unidad salió del sitio hacia el cuartel.' }),
      F('hreg', 'Llegada a la estación', 'time', { hint: 'Hora en que la unidad regresó a la estación.' }),
      F('durmin', 'Duración del evento (en minutos)', 'num', { hint: 'Se calcula sola con la hora de alerta y la de fin (también si pasa de un día al otro) y se muestra en horas y minutos; puede cambiarla.' }) ] },
    { id: 'r_acc', t: '6j · Bitácora de operaciones y cronología', f: [ F('rpt.acc', 'Acciones realizadas, con su hora (obligatorio)', 'list', { lista: 'acc', naOk: false, hint: 'Toque las acciones rápidas o escriba las suyas. De aquí salen las horas del reporte (alerta, salida, llegada, terminación, desmovilización y regreso). Anote al menos «Alerta recibida». Cada acción con su hora. Puede ir llenándola en vivo con el botón «Bitácora».' }) ] },
    { id: 'r_obs', t: '6k · Observaciones adicionales (opcional)', f: [ F('rpt.obs', 'Observaciones adicionales', 'area', { naOk: false, opt: true, hint: 'Opcional. NO repita el relato de los hechos ni la bitácora. Use este espacio solo para observaciones legales, disciplinarias o normativas y para requerimientos o necesidades (material gastado, apoyo que faltó, novedades con terceros).' }) ] },
    { id: 'fotos', t: '5 · Registro fotográfico', f: [ F('fotos', 'Registro fotográfico del evento', 'photos', { hint: 'Recomendado: mínimo 3 fotografías: 1) la situación al llegar, 2) el personal trabajando y 3) los vehículos en la escena.' }) ] }
  ];
  const INS_STEPS = [
    { id: 'esencial', t: '1 · Identificación y localización del evento', f: [
      F('cat', 'Incidente o actividad', 'cat', { naOk: false }),
      F('fecha', 'Día de la inspección', 'date', { naOk: false }),
      F('lat', 'Ubicación (GPS)', 'gps', { naOk: false, hint: 'Obligatoria. Tómela estando en el establecimiento.' }),
      F('dir', 'Dirección del establecimiento', 'text'),
      F('bar', 'Barrio, corregimiento o vereda', 'text') ] },
    { id: 'i_est', t: '2 · Establecimiento, responsable e inspectores', f: [
      F('rpt.ins.rs', 'Nombre o razón social del establecimiento', 'text', { naOk: false }),
      F('rpt.ins.nit', 'NIT o documento del propietario', 'text'),
      F('rpt.ins.act', 'Actividad económica', 'text'),
      F('rpt.ins.motivo', 'Motivo de la visita', 'sel', { o: ['Solicitud del establecimiento','Programada por el Cuerpo de Bomberos','Seguimiento de una inspección anterior','Requisito para licencia o permiso','Otro'] }),
      F('rpt.ins.resp', 'Responsable del establecimiento (quien atendió)', 'text'),
      F('rpt.ins.respc', 'Cargo del responsable', 'text'),
      F('rpt.ins.respt', 'Teléfono del responsable', 'text'),
      F('hora', 'Hora de inicio de la inspección', 'time', { naOk: false }),
      F('hfin', 'Hora de terminación', 'time'),
      F('pers', 'Inspector(es) que realizaron la visita', 'pers', { naOk: false }) ] },
    { id: 'i_ant', t: '3 · Antecedentes', f: [
      F('rpt.ins.ant', 'Inspecciones anteriores y hallazgos previos', 'area', { hint: 'Fecha y resultado, si existen. Si no hay, marque «No aplica».' }),
      F('rpt.ins.antev', 'Eventos asociados (incendios, emergencias previas)', 'area'),
      F('rpt.ins.antrec', 'Recomendaciones anteriores y medidas correctivas ejecutadas', 'area') ] },
    { id: 'i_alc', t: '4 · Objeto, alcance y áreas evaluadas', f: [
      F('rpt.ins.obj', 'Propósito de la inspección (opcional)', 'area', { naOk: false, opt: true, hint: 'Si lo deja vacío, el informe usa el texto estándar: verificar de forma visual las condiciones de seguridad humana y protección contra incendios.' }),
      F('rpt.ins.areas', 'Áreas evaluadas', 'area', { naOk: false, hint: 'Ej.: recepción, bodega, cocina, segundo piso, parqueadero.' }),
      F('rpt.ins.lim', 'Limitaciones o áreas no inspeccionadas (opcional)', 'area', { naOk: false, opt: true, hint: 'Ej.: zona cerrada con llave, sin acceso a la cubierta. El informe ya aclara que es una inspección visual.' }) ] },
    { id: 'i_desc', t: '5 · Descripción del establecimiento', f: [
      F('rpt.ins.uso', 'Uso principal de la edificación', 'sel', { o: ['Comercial','Industrial','Institucional o educativo','Salud','Reunión o gran concurrencia','Vivienda','Mixto','Almacenamiento','Otro'] }),
      F('rpt.ins.niv', 'Niveles o pisos', 'text'),
      F('rpt.ins.m2', 'Área aproximada (m²)', 'text'),
      F('rpt.ins.ocup', 'Ocupación aproximada (personas) y horario', 'text'),
      F('rpt.ins.dg', 'Características e instalaciones (distribución, materiales, condiciones generales)', 'area') ] },
    { id: 'i_sh', t: '6 · Seguridad humana', f: SH_ITEMS.map(x => CK(x[0], x[1])).concat([F('rpt.ins.shobs', 'Observaciones de seguridad humana', 'area', { hint: 'Solo lo que explique un «No cumple» o un dato importante.' })]) },
    { id: 'i_pci', t: '7 · Protección contra incendios', f: PCI_ITEMS.map(x => CK(x[0], x[1])).concat([F('rpt.ins.pciobs', 'Observaciones de protección contra incendios', 'area')]) },
    { id: 'i_hall', t: '8 · Hallazgos, riesgo y concepto', f: [
      F('rpt.ins.hall', 'Hallazgos que requieren intervención', 'list', { lista: 'hall', hint: 'Los «No cumple» de las listas se incluyen solos en el informe; aquí agregue hallazgos adicionales, o detalle el plazo y la recomendación de cada uno.' }),
      F('rpt.ins.riesgo', 'Nivel preliminar de riesgo', 'chip1', { o: ['BAJO','MEDIO','ALTO','NO VALORADO'], naOk: false, opt: true }),
      F('rpt.ins.restr', 'Restricciones de uso o acceso (si las hay)', 'area'),
      F('rpt.ins.concepto', 'Concepto técnico', 'chip1', { o: ['FAVORABLE','FAVORABLE CON REQUERIMIENTOS','NO FAVORABLE','NO EMITIDO'], naOk: false, opt: true, hint: 'Si no lo marca, el informe lo propone según las listas y queda sujeto a su firma.' }),
      F('rpt.ins.concl', 'Conclusión adicional del inspector (opcional)', 'area', { naOk: false, opt: true }) ] },
    { id: 'fotos', t: '9 · Registro fotográfico', f: [ F('fotos', 'Registro fotográfico', 'photos', { hint: 'Fotografíe los hallazgos y las áreas inspeccionadas; describa cada foto.' }) ] }
  ];
  g.CBV_ESQ = { INS_CAT, INS_STEPS, SH_ITEMS, PCI_ITEMS, SIMPLE_CATS, ASK_CATS, MODO_SIMPLE, MODO_EMERG, SIMPLE_STEPS, RANGOS_ORDEN, CATS, TIPOS, VEH, SNIF, YN, CANAL, PTIPO, TDOC, INST, LISTAS, STEPS, SCI_ROLES, SCI_FUNC, SCI_NOACT, SCI_PASOS, SCI_INST, VEH_INFO };
})(typeof window !== 'undefined' ? window : globalThis);
