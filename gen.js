/* Generadores de archivos institucionales a partir de las plantillas originales.
   Requiere JSZip (global en el navegador, o pasado en Node). Todas las funciones devuelven Promise<Uint8Array>. */
(function (g) {
  'use strict';
  const CATS = ['CAÍDA / CORTES DE ARBOL','CONTROL DE ABEJAS','CONTROL DE AVISPAS','CAÍDA DE CUERDAS','CORTO CIRCUITO','COLAPSO DE ESTRUCTURAS','CAPACITACIONES','EXTRICACIÓN VEHICULAR','FUGA DE GAS NATURAL','FUGA DE GAS GLP','INCENDIO FORESTAL','INCENDIO ESTRUCTURAL','INCENDIO VEHICULAR','INUNDACIÓN','LABORES DE PREVENCION O ACOMPAÑAMIENTO EN GESTION DEL RIESGO','MATERIALES PELIGROSOS / DERRAMES','PRIMEROS AUXILIOS','RESCATE DE PERSONA / PARAPENTE','RESCATE DE ANIMAL','REUNIÓN EN LA ALCALDÍA','REUNIONES DE SERVICIO SOCIAL','SUMINISTROS DE AGUA','VISITAS DE SEGURIDAD'];
  const MESES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];

  const X = s => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const colNum = c => { let n = 0; for (const ch of c) n = n * 26 + ch.charCodeAt(0) - 64; return n; };
  const serial = iso => { const [y, m, d] = iso.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 86400000) + 25569; };
  const dmy = iso => iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '';
  function durTxt(min) {
    if (min == null || isNaN(min)) return 'N/A';
    min = Math.round(min);
    if (min < 60) return min + ' MINUTOS';
    const h = Math.floor(min / 60), m = min % 60;
    return h + (h === 1 ? ' HORA' : ' HORAS') + (m ? ' Y ' + m + ' MINUTOS' : '');
  }
  /* hora siempre como HH:mm (24 h), venga como venga */
  const dtxt = (t, d) => (d ? (t ? t + ' ' : '') + d : '');
  const h24 = v => {
    if (v == null || v === '') return '';
    if (v instanceof Date) return String(v.getUTCHours()).padStart(2, '0') + ':' + String(v.getUTCMinutes()).padStart(2, '0');
    if (typeof v === 'number' && v >= 0 && v < 1) { const m = Math.round(v * 1440); return String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }
    const t = String(v); let m = /(?:^|T)(\d{1,2}):(\d{2})/.exec(t);
    return m ? String(+m[1]).padStart(2, '0') + ':' + m[2] : t;
  };
  const dmsTxt = (v, pos, neg) => { const a = Math.abs(+v); let g = Math.floor(a); const mf = (a - g) * 60; let m = Math.floor(mf); let sec = Math.round((mf - m) * 600) / 10; if (sec >= 60) { sec = 0; m++; } if (m >= 60) { m = 0; g++; } return g + '°' + String(m).padStart(2, '0') + "'" + (sec < 10 ? '0' : '') + sec.toFixed(1) + '"' + (+v < 0 ? neg : pos); };
  const gmsLat = v => (v === '' || v == null || !isFinite(+v)) ? '' : dmsTxt(+v, 'N', 'S');
  const gmsLon = v => (v === '' || v == null || !isFinite(+v)) ? '' : dmsTxt(+v, 'E', 'W');
  const na = v => (v == null || String(v).trim() === '') ? 'N/A' : String(v);
  const durOf = r => r.dur_txt || durTxt(r.durmin);
  /* Listas del formato de cargue masivo de incendios forestales (SNIF) */
  const SNIF_TIPO = { C: 'Copa', O: 'Otros', SUP: 'Superficial', M: 'Mixto', SUB: 'Subterráneo', NS: 'No seleccionado' };
  const SNIF_CAUSA = { Q: 'Quemas fuera de control', D: 'Descuido y negligencia', A: 'Accidental', R: 'Reactivación de focos', O: 'Otros', I: 'Intencional', SID: 'Sin definir' };
  const SNIF_AREA = { BND: 'Bosque Natural Denso', BP: 'Bosque plantado', BS: 'Bosque Seco', C: 'Cultivos', P: 'Páramos', BI: 'Bosque intervenido', R: 'Rastrojos', VS: 'Vegetación Seca', SBN_PST: 'Sabanas pastizales', PST_MNJ: 'Pastos manejados', CBR_SIN_DTR: 'Coberturas sin determinar', SP: 'Sabanas y pastizales', PM: 'Pastos mejorados' };
  const coordOf = r => r.coord || ((r.lat != null && r.lat !== '' && r.lon != null && r.lon !== '') ? r.lat + ', ' + r.lon : '');
  const sortRows = rows => rows.slice().sort((a, b) => (a.fecha + (a.hora || '')).localeCompare(b.fecha + (b.hora || '')));

  const istr = (ref, s, txt) => `<c r="${ref}"${s != null ? ` s="${s}"` : ''} t="inlineStr"><is><t xml:space="preserve">${X(txt)}</t></is></c>`;
  const numc = (ref, s, v) => `<c r="${ref}"${s != null ? ` s="${s}"` : ''}><v>${v}</v></c>`;

  /* Reemplaza el contenido de una celda existente conservando su estilo. */
  function setCell(xml, ref, value) {
    const re = new RegExp('<c r="' + ref + '"((?: [a-z]+="[^"]*")*)\\s*(?:/>|>[\\s\\S]*?</c>)');
    const m = xml.match(re);
    if (!m) throw new Error('Celda no encontrada ' + ref);
    const sm = m[1].match(/ s="(\d+)"/);
    const s = sm ? sm[1] : null;
    const cell = typeof value === 'number' ? numc(ref, s, value) : istr(ref, s, value);
    return xml.replace(re, () => cell);
  }

  /* Inserta la celda si no existe (conserva el orden de columnas) y escribe el valor; ignora vacíos. */
  function ensureCell(xml, ref) {
    if (new RegExp('<c r="' + ref + '"[ />]').test(xml)) return xml;
    const rn = ref.replace(/[A-Z]+/, ''), cn = colNum(ref.replace(/\d+/, ''));
    const re = new RegExp('<row r="' + rn + '"([^>]*?)(/>|>([\\s\\S]*?)</row>)');
    const m = xml.match(re); if (!m) return xml;
    const attrs = m[1].replace(/\/$/, ''), inner = m[3] || '';
    let pos = inner.length; const cre = /<c r="([A-Z]+)\d+"/g; let k;
    while ((k = cre.exec(inner))) { if (colNum(k[1]) > cn) { pos = k.index; break; } }
    const ni = inner.slice(0, pos) + '<c r="' + ref + '"/>' + inner.slice(pos);
    return xml.replace(re, () => '<row r="' + rn + '"' + attrs + '>' + ni + '</row>');
  }
  const blank = v => v == null || String(v).trim() === '';
  const pn = (xml, ref, v) => put(xml, ref, blank(v) ? 'N/A' : v);
  const put = (xml, ref, v) => (v == null || String(v).trim() === '') ? xml : setCell(ensureCell(xml, ref), ref, typeof v === 'number' ? v : String(v));
  const GRADOS = /^(sgt|sbt|sbtte|cbo|bro|tt|cpt|cap|may|cr|tc|st|sgto|cabo|bombero|teniente|sargento|capit[aá]n|subteniente)\.?$/i;
  const splitGrado = n => { const p = String(n || '').trim().split(/\s+/); if (p.length > 1 && GRADOS.test(p[0])) return [p[0].replace(/\.$/, '').toUpperCase(), p.slice(1).join(' ')]; return ['', String(n || '').trim()]; };

  async function load(JSZip, tpl) { return JSZip.loadAsync(tpl); }
  async function out(zip) {
    try { const f = zip.file('docProps/core.xml'); if (f) { let c = await f.async('string'); if (/<dc:creator>/.test(c)) c = c.replace(/<dc:creator>[\s\S]*?<\/dc:creator>/, '<dc:creator>Sistema CBV · Cristhian Steven Blandón Henao</dc:creator>'); zip.file('docProps/core.xml', c); } } catch (e) { /* ok */ }
    return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  }
  async function forceCalc(zip) {
    let wb = await zip.file('xl/workbook.xml').async('string');
    wb = wb.replace(/<calcPr([^>]*?)\/>/, (m, a) => a.includes('fullCalcOnLoad') ? m : `<calcPr${a} fullCalcOnLoad="1"/>`);
    zip.file('xl/workbook.xml', wb);
  }

  /* ---------- 1. REPORTE DE COMANDANCIA (CONSOLIDADO + DATOS) ---------- */
  async function comandancia(JSZip, tpl, { rows, titulo }) {
    rows = sortRows(rows);
    const zip = await load(JSZip, tpl);
    const cnt = {}; CATS.forEach(c => cnt[c] = 0);
    rows.forEach(r => { if (cnt[r.cat] != null) cnt[r.cat]++; });
    const total = CATS.reduce((a, c) => a + cnt[c], 0);

    // CONSOLIDADO
    let s1 = await zip.file('xl/worksheets/sheet1.xml').async('string');
    s1 = setCell(s1, 'A2', titulo);
    const fre = '(?:<f[^>]*/>|<f[^>]*>[^<]*</f>)';
    CATS.forEach((c, i) => {
      const r = i + 4;
      s1 = s1.replace(new RegExp(`<c r="B${r}" s="(\\d+)">${fre}<v>[^<]*</v></c>`), (m, s) => `<c r="B${r}" s="${s}"><f>COUNTIF(DATOS!$B:$B,$A${r})</f><v>${cnt[c]}</v></c>`);
      s1 = s1.replace(new RegExp(`<c r="C${r}" s="(\\d+)">${fre}<v>[^<]*</v></c>`), (m, s) => `<c r="C${r}" s="${s}"><f>IF($B$27=0,0,B${r}/$B$27)</f><v>${total ? cnt[c] / total : 0}</v></c>`);
    });
    s1 = s1.replace(new RegExp(`<c r="B27" s="(\\d+)">${fre}<v>[^<]*</v></c>`), (m, s) => `<c r="B27" s="${s}"><f>SUM(B4:B26)</f><v>${total}</v></c>`);
    s1 = s1.replace(new RegExp(`<c r="C27" s="(\\d+)">${fre}<v>[^<]*</v></c>`), (m, s) => `<c r="C27" s="${s}"><f>IF($B$27=0,0,B27/$B$27)</f><v>${total ? 1 : 0}</v></c>`);
    zip.file('xl/worksheets/sheet1.xml', s1);

    // actualizar la caché del gráfico (Excel la refresca al abrir)
    const chartPath = 'xl/charts/chart1.xml';
    if (zip.file(chartPath)) {
      let ch = await zip.file(chartPath).async('string');
      let k = 0;
      ch = ch.replace(/<c:numCache>[\s\S]*?<\/c:numCache>/g, m => {
        if (!/<c:pt idx="0">/.test(m)) return m;
        const pts = CATS.map((c, i) => `<c:pt idx="${i}"><c:v>${cnt[c]}</c:v></c:pt>`).join('');
        return m.replace(/<c:ptCount val="\d+"\/>[\s\S]*<\/c:numCache>/, `<c:ptCount val="${CATS.length}"/>${pts}</c:numCache>`);
      });
      zip.file(chartPath, ch);
    }

    // DATOS
    let s2 = await zip.file('xl/worksheets/sheet2.xml').async('string');
    const head = s2.slice(0, s2.indexOf('<row r="4"'));
    const tail = s2.slice(s2.indexOf('</sheetData>'));
    const multiYear = rows.length && rows[0].fecha.slice(0, 4) !== rows[rows.length - 1].fecha.slice(0, 4);
    const label = iso => MESES[+iso.slice(5, 7) - 1] + (multiYear ? ' ' + iso.slice(0, 4) : '');
    let body = '', n = 4, lastKey = rows.length ? rows[0].fecha.slice(0, 7) : null;
    let headFixed = head;
    if (rows.length) headFixed = setCell(head, 'A3', label(rows[0].fecha));
    headFixed = headFixed.replace('<col min="13" max="16" width="11.5" style="20"/>', '<col min="13" max="13" width="19" style="20" customWidth="1"/><col min="14" max="16" width="11.5" style="20"/>')
      .replace(/(<c r="L1"[^>]*>[\s\S]*?<\/c>)/, '$1' + istr('M1', 43, 'N.° CONSECUTIVO'));
    const labelRow = (rn, txt) => `<row r="${rn}" spans="1:41" customFormat="1" ht="15.8" customHeight="1">` + istr('A' + rn, 51, txt) +
      ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'].map(c => `<c r="${c}${rn}" s="${c === 'C' ? 53 : c === 'D' ? 54 : c === 'L' ? 55 : 52}"/>`).join('') + '</row>';
    rows.forEach(r => {
      const key = r.fecha.slice(0, 7);
      if (key !== lastKey) { body += labelRow(n, label(r.fecha)); n++; lastKey = key; }
      body += `<row r="${n}" spans="1:13" customFormat="1" ht="${altoFila([[r.cat, 62], [na(r.dir), 38], [na(r.bar), 22], [na(r.desc), 62], [na(r.veh), 17]])}" customHeight="1">` +
        istr('A' + n, 26, r.tipo || 'OTROS') + istr('B' + n, 26, r.cat) + `<c r="C${n}" s="40"/>` + numc('D' + n, 29, serial(r.fecha)) +
        istr('E' + n, 26, durOf(r)) + istr('F' + n, 26, na(r.dir)) + istr('G' + n, 26, na(r.bar)) + istr('H' + n, 26, na(r.desc)) + istr('I' + n, 26, na(r.area)) +
        (r.uni != null && r.uni !== '' ? numc('J' + n, 26, +r.uni) : istr('J' + n, 26, 'N/A')) + istr('K' + n, 26, na(r.veh)) + istr('L' + n, 26, na(coordOf(r))) + istr('M' + n, 26, r.id || '') + '</row>';
      n++;
    });
    const last = n - 1;
    body += `<row r="${n}" spans="1:12" ht="41.45" thickBot="1">` + istr('A' + n, 21, 'TOTAL \nEMERGENCIAS Y ACTIVIDADES') +
      `<c r="B${n}" s="22"><f>COUNTA(B3:B${last})</f><v>${rows.length}</v></c><c r="C${n}" s="22"/>` +
      ['D', 'E', 'F'].map(c => `<c r="${c}${n}" s="23"/>`).join('') + `<c r="G${n}" s="24"/>` + ['H', 'I', 'J', 'K'].map(c => `<c r="${c}${n}" s="23"/>`).join('') + `<c r="L${n}" s="25"/></row>`;
    let t2 = tail.replace('B3:B358', `B3:B${last}`).replace('B359:B1048576', `B${n}:B1048576`).replace('C3:C358', `C3:C${last}`);
    let h2 = headFixed.replace(/<dimension ref="[^"]*"\/>/, `<dimension ref="A1:AO${n}"/>`).replace(/<selection pane="bottomLeft"[^>]*\/>/, '<selection pane="bottomLeft" activeCell="B4" sqref="B4"/>');
    zip.file('xl/worksheets/sheet2.xml', h2 + body + t2);
    await forceCalc(zip);
    return out(zip);
  }

  /* ---------- 2. REGISTRO DE ACTIVIDADES ---------- */
  /* altura de fila según el texto más largo (el texto largo se ajusta dentro de su celda y nunca se corta) */
  function altoFila(pares) { // pares: [[texto, anchoEnCaracteres]]
    let lin = 1;
    pares.forEach(([t, w]) => { const s = String(t == null ? '' : t); let l = 0; s.split(/\n/).forEach(p => { l += Math.max(1, Math.ceil(p.length / Math.max(6, w * 0.95))); }); lin = Math.max(lin, l); });
    return Math.min(409, Math.max(15.8, Math.round(lin * 14.5 + 3)));
  }
  async function actividades(JSZip, tpl, { rows, titulo }) {
    rows = sortRows(rows);
    const zip = await load(JSZip, tpl);
    let st = await zip.file('xl/styles.xml').async('string');
    const m = st.match(/<cellXfs count="(\d+)">/);
    const dateXf = +m[1];
    st = st.replace(m[0], `<cellXfs count="${dateXf + 1}">`).replace('</cellXfs>', '<xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf></cellXfs>');
    zip.file('xl/styles.xml', st);
    let s = await zip.file('xl/worksheets/sheet1.xml').async('string');
    s = setCell(s, 'A1', titulo);
    const head = s.slice(0, s.indexOf('<row r="3"'));
    let tail = s.slice(s.indexOf('</sheetData>')).replace(/<sortState[\s\S]*?<\/sortState>/, '');
    let body = '';
    rows.forEach((r, i) => {
      const n = i + 3;
      body += `<row r="${n}" spans="1:11" ht="${altoFila([[r.cat, 21], [na(r.dir), 21], [na(r.bar), 22], [na(r.desc), 23], [na(r.veh), 14]])}" customHeight="1">` + istr('A' + n, 2, r.tipo || 'OTROS') + istr('B' + n, 2, r.cat) + numc('C' + n, dateXf, serial(r.fecha)) + istr('D' + n, 2, durOf(r)) +
        istr('E' + n, 2, na(r.dir)) + istr('F' + n, 2, na(r.bar)) + istr('G' + n, 2, na(r.desc)) + istr('H' + n, 2, na(r.area)) +
        (r.uni != null && r.uni !== '' ? numc('I' + n, 2, +r.uni) : istr('I' + n, 2, 'N/A')) + istr('J' + n, 2, na(r.veh)) + istr('K' + n, 2, r.id || '') + '</row>';
    });
    const last = Math.max(rows.length + 2, 3);
    let h = head.replace(/<dimension ref="[^"]*"\/>/, `<dimension ref="A1:K${last}"/>`);
    h = h.replace(/(<c r="J2"[^>]*>[\s\S]*?<\/c>)/, '$1' + istr('K2', 4, 'N.° CONSECUTIVO')).replace('<col min="11" max="18" width="18.875" style="6" customWidth="1"/>', '<col min="11" max="11" width="19" style="2" customWidth="1"/><col min="12" max="18" width="18.875" style="6" customWidth="1"/>');
    h = h.replace(/(<c r="J1" s=")10("\/>)/, '$19$2<c r="K1" s="10"/>')
      .replace('<outlinePr summaryBelow="0" summaryRight="0"/>', '<outlinePr summaryBelow="0" summaryRight="0"/><pageSetUpPr fitToPage="1"/>');
    tail = tail.replace('<mergeCell ref="F1:J1"/>', '<mergeCell ref="F1:K1"/>');
    { const wb = await zip.file('xl/workbook.xml').async('string'); zip.file('xl/workbook.xml', wb.replace(/(Print_Area[^>]*>[^<]*?)\$J\$\d+/, '$1$K$' + Math.max(last, 3))); }
    tail = tail.replace(/<pageSetup [^>]*?scale="80"/, m => m.replace('scale="80"', 'fitToWidth="1" fitToHeight="0"'));
    zip.file('xl/worksheets/sheet1.xml', h + body + tail);
    return out(zip);
  }


  /* ---- ajuste de texto largo: celdas combinadas con ajuste de línea y filas que crecen ---- */
  const CPL_K = 1.4, LH = 12;           // caracteres por unidad de ancho de columna (letra de 9 pt) y alto de línea en puntos
  function xfsDe(st) { const m = st.match(/<cellXfs count="\d+">([\s\S]*?)<\/cellXfs>/); return m ? m[1].match(/<xf [^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g) || [] : []; }
  /* clona el estilo idx con ajuste de línea; devuelve [styles nuevo, índice nuevo] */
  function estiloAjuste(st, idx, horiz, vert) {
    const xfs = xfsDe(st); const base = xfs[idx]; if (!base) return [st, idx];
    let x = base.replace(/<alignment[^>]*\/>/, '');
    if (/\/>$/.test(x) && !/<\/xf>$/.test(x)) x = x.replace(/\/>$/, '></xf>');
    x = x.replace('</xf>', `<alignment${horiz ? ` horizontal="${horiz}"` : ''} vertical="${vert || 'center'}" wrapText="1"/></xf>`);
    if (!/applyAlignment=/.test(x)) x = x.replace('<xf ', '<xf applyAlignment="1" '); else x = x.replace(/applyAlignment="0"/, 'applyAlignment="1"');
    const n = xfs.length;
    st = st.replace(/<cellXfs count="\d+">([\s\S]*?)<\/cellXfs>/, (m, a) => `<cellXfs count="${n + 1}">${a}${x}</cellXfs>`);
    return [st, n];
  }
  const estiloDe = (s, ref) => { const m = s.match(new RegExp('<c r="' + ref + '"[^>]*? s="(\\d+)"')); return m ? +m[1] : 0; };
  const anchoCol = (s, c) => { const re = /<col min="(\d+)" max="(\d+)" width="([\d.]+)"/g; let m; while ((m = re.exec(s))) if (c >= +m[1] && c <= +m[2]) return +m[3]; return 11.2; };
  const anchoRango = (s, c1, c2) => { let w = 0; for (let c = colNum(c1); c <= colNum(c2); c++) w += anchoCol(s, c); return w; };
  const lineasDe = (txt, ancho) => Math.max(1, wrapAll(txt, Math.max(8, Math.floor(ancho * CPL_K))).length);
  const altoDe = (s, n) => { const m = s.match(new RegExp('<row r="' + n + '"[^>]*? ht="([\\d.]+)"')); return m ? +m[1] : 14.95; };
  function fijaAlto(s, n, ht) {
    return s.replace(new RegExp('<row r="' + n + '"([^>]*?)>'), (m, a) => { a = a.replace(/ ht="[\d.]+"/, '').replace(/ customHeight="1"/, ''); return `<row r="${n}"${a} ht="${(Math.round(ht * 100) / 100)}" customHeight="1">`; });
  }
  /* reparte la altura necesaria entre las filas dadas (sólo crece) */
  function crecer(s, filas, necesaria) {
    const actual = filas.reduce((t, n) => t + altoDe(s, n), 0);
    if (necesaria <= actual) return s;
    const cada = necesaria / filas.length;
    filas.forEach(n => { s = fijaAlto(s, n, Math.max(altoDe(s, n), cada)); });
    return s;
  }
  const unirCeldas = (s, quitar, poner) => { quitar.forEach(m => { s = s.replace(new RegExp('<mergeCell ref="' + m + '"/>'), ''); }); s = s.replace(/<mergeCells count="(\d+)">/, (m, c) => `<mergeCells count="${+c - quitar.length + 1}">`); return s.replace('</mergeCells>', `<mergeCell ref="${poner}"/></mergeCells>`); };

  /* Carta (21.59 × 27.94 cm), márgenes de 1 cm, cuatro páginas por bloques de columnas, escala calculada */
  function paginaCarta(s) {
    const bloques = [['A', 'O'], ['P', 'U'], ['V', 'AC'], ['AD', 'AK']];
    let maxPx = 0; bloques.forEach(([a, b]) => { let px = 0; for (let c = colNum(a); c <= colNum(b); c++) px += Math.round(anchoCol(s, c) * 7 + 5); maxPx = Math.max(maxPx, px); });
    let hPt = 0; for (let r = 1; r <= 59; r++) hPt += altoDe(s, r);
    const sw = (19.59 / 2.54) / (maxPx / 96), sh = (25.94 / 2.54 * 72) / hPt;
    const esc = Math.max(40, Math.min(100, Math.floor(Math.min(sw, sh) * 100) - 1));
    const M = (0.5 / 2.54).toFixed(5);
    s = s.replace(/<pageMargins[^>]*\/>/, `<printOptions horizontalCentered="1"/><pageMargins left="${M}" right="${M}" top="${M}" bottom="${M}" header="0" footer="0"/>`);
    s = s.replace(/<pageSetup[^>]*\/>/, `<pageSetup paperSize="1" scale="${esc}" pageOrder="overThenDown" orientation="portrait"/><colBreaks count="3" manualBreakCount="3"><brk id="15" max="1048575" man="1"/><brk id="21" max="1048575" man="1"/><brk id="29" max="1048575" man="1"/></colBreaks>`);
    return s;
  }

  /* ---------- 3. REPORTE DE EMERGENCIAS (un incidente, datos conocidos) ---------- */
  async function reporteEmergencia(JSZip, tpl, r) {
    const zip = await load(JSZip, tpl);
    let s = await zip.file('xl/worksheets/sheet1.xml').async('string');
    const seq = String((r.id || '').split('-').pop() || '').padStart(6, '0').slice(-6);
    ['B', 'C', 'D', 'E', 'F', 'G'].forEach((c, i) => { s = setCell(s, c + '8', seq[i]); });
    if (r.fecha) { s = setCell(s, 'K9', r.fecha.slice(8, 10)); s = setCell(s, 'L9', r.fecha.slice(5, 7)); s = setCell(s, 'M9', r.fecha.slice(2, 4)); }
    if (r.hora) s = setCell(s, 'N9', h24(r.hora));
    s = setCell(s, 'F19', r.cat);
    if (r.hora) s = setCell(s, 'F20', h24(r.hora));
    const maq = { 'B-1': 'B21', 'B-2': 'C21', 'B-3': 'D21', 'B-4': 'E21', 'L-1': 'F21', 'L-2': 'G21', 'L-3': 'H21' };
    const lab = { B21: 'B1', C21: 'B2', D21: 'B3', E21: 'B4', F21: 'L1', G21: 'L2', H21: 'L3' };
    const vs = String(r.veh || '').split(/[,/;]+/).map(x => x.trim().toUpperCase().replace(/\s+/g, '').replace(/^([A-Z])(\d)$/, '$1-$2')).filter(Boolean);
    const fuera = [];
    vs.forEach(v => { if (maq[v]) s = setCell(s, maq[v], lab[maq[v]] + '✓'); else fuera.push(v); });
    s = setCell(s, 'J21', na(r.dir));
    s = setCell(s, 'B22', na(r.bar));
    s = setCell(s, 'J23', 'VALLE DEL CAUCA');
    s = setCell(s, 'N23', 'LA UNIÓN');
    const lat = r.lat != null && r.lat !== '' ? String(r.lat) : '', lon = r.lon != null && r.lon !== '' ? String(r.lon) : '';
    if (lat) s = setCell(s, 'I24', gmsLat(lat) || lat);
    if (lon) s = setCell(s, 'M24', gmsLon(lon) || lon);
    if (!lat && r.coord) s = setCell(s, 'I24', r.coord);
    const rp = r.rpt || {};
    const wrap = (txt, n, max) => { const out = ['', '', '', '']; let li = 0, over = false; String(txt || '').split(/\s+/).filter(Boolean).forEach(w => { if (over) return; if ((out[li] + ' ' + w).trim().length > n) { li++; if (li >= max) { over = true; return; } } out[li] = (out[li] + ' ' + w).trim(); }); return { out, over }; };
    let st = await zip.file('xl/styles.xml').async('string');
    const ajusta = (refs, horiz, vert) => { const m = {}; refs.forEach(ref => { const i = estiloDe(s, ref); const k = i + '|' + (horiz || '') + '|' + (vert || ''); if (!(k in m)) { const r2 = estiloAjuste(st, i, horiz, vert); st = r2[0]; m[k] = r2[1]; } s = s.replace(new RegExp('(<c r="' + ref + '")( s="\\d+")?'), `$1 s="${m[k]}"`); }); };
    s = unirCeldas(s, ['I30:O30', 'I31:O31'], 'I30:O31'); s = unirCeldas(s, ['I32:O32', 'I33:O33', 'I34:O34'], 'I32:O34'); s = unirCeldas(s, ['I35:O35', 'I36:O36', 'I37:O37'], 'I35:O37');
    const wI = anchoRango(s, 'I', 'O');
    s = pn(s, 'I30', rp.dinc); s = pn(s, 'I32', rp.amen); s = pn(s, 'I35', rp.obj);
    ajusta(['I30', 'I32', 'I35'], 'left', 'top');
    s = crecer(s, [30, 31], lineasDe(blank(rp.dinc) ? 'N/A' : rp.dinc, wI) * LH + 4);
    s = crecer(s, [32, 33, 34], lineasDe(blank(rp.amen) ? 'N/A' : rp.amen, wI) * LH + 4);
    s = crecer(s, [35, 36, 37], lineasDe(blank(rp.obj) ? 'N/A' : rp.obj, wI) * LH + 4);
    // 1. propiedad
    const prop = rp.prop || {};
    const pm = { 'Vivienda': 'J12', 'Finca': 'J13', 'Comercial': 'J14', 'Agrícola': 'J15', 'Vía pública': 'N12', 'Lote baldío': 'N13', 'Industrial': 'N14', 'Otro': 'N15' };
    if (pm[prop.tipo]) s = put(s, pm[prop.tipo], 'X');
    s = pn(s, 'I16', prop.nom); s = pn(s, 'I17', dtxt(prop.td, prop.doc)); s = pn(s, 'M17', prop.tel);
    // 2. incidente
    s = pn(s, 'N20', h24(r.hlle));
    if (rp.zona === 'URBANA') s = put(s, 'D23', 'X'); if (rp.zona === 'RURAL') s = put(s, 'G23', 'X');
    s = pn(s, 'G25', rp.pc); s = pn(s, 'G26', rp.pcid); s = pn(s, 'G27', rp.ae); s = pn(s, 'G28', rp.acv);
    // 3. evaluación inicial
    const esc = rp.esc || {};
    [['alt', 38, 40], ['prot', 41, 43], ['int', 44, 46]].forEach(([k, row, rowT]) => {
      if (esc[k] === 'SI') s = put(s, 'L' + row, 'X'); if (esc[k] === 'NO') s = put(s, 'O' + row, 'X');
      s = pn(s, 'H' + rowT, esc[k] === 'NO' && blank(esc[k + 'c']) ? 'N/A' : esc[k + 'c']);
    });
    // 4. instituciones
    const ins = rp.inst || {};
    [['dc', 'F49', 'I49'], ['cr', 'F50', 'I50'], ['pn', 'F51', 'I51'], ['pcar', 'L49', 'N49'], ['hosp', 'L50', 'N50']].forEach(([k, cu, cv]) => {
      const v = ins[k] || []; const e0 = v[0] !== '' && v[0] != null, e1 = v[1] !== '' && v[1] != null; if (!e0 && !e1) { s = put(s, cu, 'N/A'); s = put(s, cv, 'N/A'); } else { s = put(s, cu, e0 ? +v[0] : 0); s = put(s, cv, e1 ? +v[1] : 0); }
    });
    // 5. lesionados (hasta 6)
    if (!(rp.les || []).length) { s = put(s, 'A54', 'NO HUBO LESIONADOS'); ['H54', 'J54', 'K54', 'M54'].forEach(c => { s = put(s, c, 'N/A'); }); }
    (rp.les || []).slice(0, 6).forEach((x, i) => { const n = 54 + i; s = put(s, 'A' + n, x.n); s = put(s, 'H' + n, dtxt(x.td, x.d)); s = put(s, 'J' + n, x.e === '' || x.e == null ? '' : +x.e); s = put(s, 'K' + n, x.t); s = put(s, 'M' + n, x.p); });
    // 6. vehículos implicados (hasta 4)
    if (!(rp.vimp || []).length) { s = put(s, 'P3', 'NO HUBO VEHÍCULOS IMPLICADOS'); ['Q3', 'R3', 'T3', 'U3'].forEach(c => { s = put(s, c, 'N/A'); }); }
    (rp.vimp || []).slice(0, 4).forEach((x, i) => { const n = 3 + i; s = put(s, 'P' + n, x.c); s = put(s, 'Q' + n, dtxt(x.td, x.d)); s = put(s, 'R' + n, x.v); s = put(s, 'T' + n, x.col); s = put(s, 'U' + n, x.pl); });
    // 9. resumen de acciones (hasta 57 filas)
    // descripción de los hechos (tercera persona) + una línea + resumen de acciones; si no cabe, sigue en la hoja CONTINUACIÓN
    const lineas = [];
    /* primero la cronología / bitácora, después una casilla y la descripción de los hechos */
    (rp.acc || []).slice().forEach(x => wrapAll(x.a, 72).forEach((t, k) => lineas.push({ h: k === 0 ? h24(x.h) : '', a: t })));
    if (!blank(r.desc)) { if (lineas.length) lineas.push({ h: '', a: '' }); lineas.push({ h: '', a: 'DESCRIPCIÓN DE LOS HECHOS' }); wrapAll(r.desc, 78).forEach(t => lineas.push({ h: '', a: t })); }
    // 10. unidad que comandó
    const cm = rp.cmd || {}; const gradosDe = r.grados || {};
    s = pn(s, 'AD4', cm.n); s = pn(s, 'AG4', cm.g || gradosDe[cm.n]); s = pn(s, 'AH4', cm.c);
    ajusta(['AD4', 'AG4', 'AH4'], 'center', 'center');
    { const gf = cm.g || gradosDe[cm.n] || ''; if (cm.n) { s = pn(s, 'AI3', [gf, cm.n].filter(Boolean).join(' ')); ajusta(['AI3'], 'center', 'bottom'); } }
    s = crecer(s, [4], Math.max(lineasDe(cm.n || 'N/A', anchoRango(s, 'AD', 'AF')), lineasDe(cm.g || gradosDe[cm.n] || 'N/A', anchoCol(s, 33)), lineasDe(cm.c || 'N/A', anchoCol(s, 34))) * LH + 4);
    // 11. unidades que intervinieron (12 nombres, dos columnas)
    if (!(r.pers || []).length) s = put(s, 'AD7', 'N/A');
    const pers = (r.pers || []).slice(0, 12);
    pers.forEach((nom, i) => { const row = 7 + (i >> 1); let [g, n2] = splitGrado(nom); if (!g) g = gradosDe[nom] || ''; if (i % 2 === 0) { s = put(s, 'AD' + row, n2); s = put(s, 'AG' + row, g); ajusta(['AD' + row, 'AG' + row], 'center', 'center'); } else { s = put(s, 'AH' + row, n2); s = put(s, 'AK' + row, g); ajusta(['AH' + row, 'AK' + row], 'center', 'center'); } });
    for (let row = 7; row <= 12; row++) { const a = pers[(row - 7) * 2], b = pers[(row - 7) * 2 + 1]; const [ga, na2] = a ? splitGrado(a) : ['', '']; const [gb, nb2] = b ? splitGrado(b) : ['', '']; s = crecer(s, [row], Math.max(lineasDe(na2, anchoRango(s, 'AD', 'AF')), lineasDe(ga || gradosDe[a] || '', anchoCol(s, 33)), lineasDe(nb2, anchoRango(s, 'AH', 'AJ')), lineasDe(gb || gradosDe[b] || '', anchoCol(s, 37))) * LH + 3); }
    // 12. observaciones
    const obs = [];
    if (cm.nom) obs.push('Comando de incidentes: ' + cm.nom + '.');
    obs.push(blank(rp.obs) ? 'Sin observaciones adicionales del comandante del incidente.' : rp.obs);
    obs.push(`Duración: ${durOf(r)}. Unidades que asistieron: ${na(r.uni)}. Vehículos: ${na(r.veh)}.`);
    if (r.hsal) obs.push('Salida de estación: ' + h24(r.hsal) + ' h.');
    if (r.hfin) obs.push('Terminación de la emergencia: ' + h24(r.hfin) + ' h.');
    if (rp.hdes) obs.push('Desmovilización hacia el cuartel: ' + h24(rp.hdes) + ' h.');
    if (r.hreg) obs.push('Llegada a la estación: ' + h24(r.hreg) + ' h.');
    if (r.area) obs.push('Área afectada: ' + r.area + (r.veg ? ' (' + r.veg + ')' : '') + '.');
    if (r.inc && (r.inc.tipo || r.inc.causa || r.inc.areaTipo)) { const i = r.inc; obs.push('Incendio forestal: tipo ' + (SNIF_TIPO[i.tipo] || na(i.tipo)) + ', causa ' + (SNIF_CAUSA[i.causa] || na(i.causa)) + ', cobertura ' + (SNIF_AREA[i.areaTipo] || na(i.areaTipo)) + '. Área protegida de orden nacional: ' + na(i.prot) + (i.protNom ? ' (' + i.protNom + ')' : '') + '.'); }
    if (r.extraTxt) obs.push(r.extraTxt);
    if (fuera.length) obs.push('Otros vehículos: ' + fuera.join(', '));
    if (!(rp.les || []).length && r.lesionados) obs.push('Lesionados: ' + r.lesionados + (r.trasladado ? ' (trasladado a ' + r.trasladado + ')' : ''));
    if (r.canal) obs.push('Aviso recibido por: ' + r.canal + (r.rep ? ' (' + r.rep + (r.reptel ? ', tel. ' + r.reptel : '') + ')' : (r.reptel ? ' (tel. ' + r.reptel + ')' : '')) + '.');
    if (!r.rpt) obs.push('Datos completados desde el registro ' + (r.id || '') + '. Faltan los demás campos del formato.');
    const obsTxt = obs.join(' ');
    if (lineas.length) lineas.push({ h: '', a: '' });
    wrapAll('OBSERVACIONES: ' + obsTxt, 72).forEach(t => lineas.push({ h: '', a: t }));
    const CAP = 56;                       // filas 3 a 58 del formato
    const cabe = lineas.length <= CAP ? lineas : lineas.slice(0, CAP - 1);
    const resto = lineas.length <= CAP ? [] : lineas.slice(CAP - 1);
    cabe.forEach((x, i) => { const n = 3 + i; s = put(s, 'V' + n, x.h); s = put(s, 'X' + n, x.a); });
    { const vs = [], xs = []; cabe.forEach((x, i) => { vs.push('V' + (3 + i)); xs.push('X' + (3 + i)); }); if (vs.length) { ajusta(vs, 'center', 'center'); ajusta(xs, 'left', 'center'); } }
    if (resto.length) s = put(s, 'X58', '(continúa en la hoja CONTINUACIÓN)');
    if (!lineas.length) s = put(s, 'X3', 'N/A');
    s = unirCeldas(s, ['AD15:AK15', 'AD16:AK16', 'AD17:AK17', 'AD18:AK18', 'AD19:AK19', 'AD20:AK20'], 'AD15:AK20');
    const obsRef = 'Las observaciones del comandante y los datos complementarios están en el numeral 9 (Resumen de las acciones).';
    s = setCell(s, 'AD15', obsRef); ajusta(['AD15'], 'left', 'top');
    s = crecer(s, [15, 16, 17, 18, 19, 20], lineasDe(obsRef, anchoRango(s, 'AD', 'AK')) * LH + 4);
    // 7. organización del incidente (SCI) dentro de los recuadros del formato
    let dr = await zip.file('xl/drawings/drawing1.xml').async('string');
    dr = organigrama(dr, rp.sci || {}, Object.assign({}, rp.cmd || {}, { nom: (rp.cmd && rp.cmd.nom) || rp.pcid || '' }), r);
    // 14. registro fotográfico
    const fotos = (r.fotos || []).filter(f => f && f.data);
    if (fotos.length) s = await fotosReporte(zip, s, dr, fotos, r);
    else zip.file('xl/drawings/drawing1.xml', dr);
    if (resto.length) { let ct2 = await zip.file('[Content_Types].xml').async('string'); ct2 = await hojaContinuacion(zip, ct2, resto, r); zip.file('[Content_Types].xml', ct2); }
    if ((r.sistema || []).length) { let ct3 = await zip.file('[Content_Types].xml').async('string'); ct3 = await hojaContinuacion(zip, ct3, r.sistema, r, { n: 5, rid: 'rId11', sid: 11, name: 'REGISTROS_SISTEMA', titulo: 'ANEXO · REGISTROS DEL SISTEMA (hora · evento registrado automáticamente en la plataforma)' }); zip.file('[Content_Types].xml', ct3); }
    { let wbx = await zip.file('xl/workbook.xml').async('string'); wbx = wbx.replace(/<sheet name="BORRADOR"(?![^>]*state=)/, '<sheet name="BORRADOR" state="hidden"'); zip.file('xl/workbook.xml', wbx); }
    zip.file('xl/styles.xml', st);
    s = paginaCarta(s);
    zip.file('xl/worksheets/sheet1.xml', s);
    await forceCalc(zip);
    return out(zip);
  }

  /* parte un texto en líneas de n caracteres sin cortar palabras */
  function wrapAll(txt, n) {
    const out = [];
    String(txt == null ? '' : txt).split(/\r?\n/).forEach(par => {
      let cur = ''; par.split(/\s+/).filter(Boolean).forEach(w => { if ((cur + ' ' + w).trim().length > n && cur) { out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); });
      if (cur) out.push(cur);
    });
    return out;
  }
  /* hoja adicional: continuación del numeral 9 cuando el texto no cabe */
  async function hojaContinuacion(zip, ct, lineas, r, o) {
    o = o || { n: 4, rid: 'rId10', sid: 10, name: 'CONTINUACION', titulo: 'CONTINUACIÓN DEL NUMERAL 9 (RESUMEN DE LAS ACCIONES REALIZADAS)' };
    let rows = `<row r="1" ht="22" customHeight="1"><c r="A1" t="inlineStr"><is><t>${X('REPORTE DE EMERGENCIAS · ' + (r.id || '') + ' · ' + o.titulo)}</t></is></c></row>`;
    lineas.forEach((x, i) => { const n = 2 + i; rows += `<row r="${n}"><c r="A${n}" t="inlineStr"><is><t>${X(x.h)}</t></is></c><c r="B${n}" t="inlineStr"><is><t xml:space="preserve">${X(x.a)}</t></is></c></row>`; });
    const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><cols><col min="1" max="1" width="10" customWidth="1"/><col min="2" max="2" width="110" customWidth="1"/></cols><sheetData>${rows}</sheetData><pageMargins left="0.197" right="0.197" top="0.197" bottom="0.197" header="0.1" footer="0.1"/><pageSetup orientation="portrait" fitToHeight="0"/></worksheet>`;
    zip.file('xl/worksheets/sheet' + o.n + '.xml', sheet);
    let wb = await zip.file('xl/workbook.xml').async('string');
    wb = wb.replace('</sheets>', '<sheet name="' + o.name + '" sheetId="' + o.sid + '" r:id="' + o.rid + '"/></sheets>');
    zip.file('xl/workbook.xml', wb);
    let wr = await zip.file('xl/_rels/workbook.xml.rels').async('string');
    wr = wr.replace('</Relationships>', '<Relationship Id="' + o.rid + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + o.n + '.xml"/></Relationships>');
    zip.file('xl/_rels/workbook.xml.rels', wr);
    return ct.replace('</Types>', '<Override PartName="/xl/worksheets/sheet' + o.n + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>');
  }

  /* texto dentro de un recuadro (forma) del dibujo, por nombre */
  function textoForma(dr, nombre, lineas) {
    const i = dr.indexOf('name="' + nombre + '"'); if (i < 0) return dr;
    const a = dr.indexOf('<xdr:txBody>', i), b = dr.indexOf('</xdr:txBody>', a); if (a < 0 || b < 0) return dr;
    const ps = lineas.filter(l => l && l.t).map(l => `<a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="es-CO" sz="${l.sz || 700}"${l.b ? ' b="1"' : ''}/><a:t>${X(l.t)}</a:t></a:r></a:p>`).join('') || '<a:p><a:endParaRPr lang="es-CO" sz="700"/></a:p>';
    const body = '<xdr:txBody><a:bodyPr vertOverflow="clip" horzOverflow="clip" lIns="18000" tIns="18000" rIns="18000" bIns="18000" rtlCol="0" anchor="ctr"/><a:lstStyle/>' + ps;
    return dr.slice(0, a) + body + dr.slice(b);
  }
  function organigrama(dr, sci, cmd, r) {
    const noAct = /no se activ/i;
    const nom = k => { const v = sci[k]; return v && !noAct.test(v) ? v : ''; };
    const rol = (t, k) => [{ t, b: 1, sz: 650 }, { t: nom(k) || (k === 'ci' ? (sci.ci || cmd.n || 'N/A') : 'Lo asume el comandante'), sz: 700 }];
    dr = textoForma(dr, '3 Rectángulo', rol('COMANDANTE DEL INCIDENTE' + (cmd.nom ? ' · ' + cmd.nom : ''), 'ci'));
    dr = textoForma(dr, '8 Rectángulo', rol('Oficial de seguridad', 'seg'));
    dr = textoForma(dr, '9 Rectángulo', rol('Oficial de información pública', 'inf'));
    dr = textoForma(dr, '10 Rectángulo', rol('Oficial de enlace', 'enl'));
    /* el recuadro del oficial de enlace es más bajo que los otros dos: se alarga para que quepan sus dos líneas */
    dr = dr.replace(/<xdr:twoCellAnchor[\s\S]*?<\/xdr:twoCellAnchor>/g, a => /name="10 Rect/.test(a) ? a.replace(/(<xdr:to>[\s\S]*?)<xdr:row>17<\/xdr:row><xdr:rowOff>\d+<\/xdr:rowOff>/, '$1<xdr:row>18</xdr:row><xdr:rowOff>80000</xdr:rowOff>').replace(/(<a:ext cx="\d+" cy=")\d+/, '$1430000') : a);
    const grupos = (sci.grupos || []).filter(g => g && g.u);
    const ops = rol('JEFE DE OPERACIONES', 'ops');
    grupos.slice(0, 6).forEach(g => { ops.push({ t: g.u + ': ' + (g.f || '') + (g.n ? ' (a cargo: ' + g.n + ')' : ''), sz: 600 }); if ((g.p || []).length) ops.push({ t: g.p.join(', '), sz: 520 }); });
    if (grupos.length) dr = dr.replace(/<xdr:twoCellAnchor[\s\S]*?<\/xdr:twoCellAnchor>/g, an => /name="60 Rect/.test(an) ? an.replace(/(<xdr:from><xdr:col>15<\/xdr:col><xdr:colOff>)\d+/, '$160000').replace(/(<xdr:to>[\s\S]*?<xdr:colOff>)1352550/, '$11500000').replace(/(<xdr:to>[\s\S]*?)<xdr:row>26<\/xdr:row><xdr:rowOff>\d+<\/xdr:rowOff>/, '$1<xdr:row>' + (27 + Math.min(6, grupos.length * 2)) + '</xdr:row><xdr:rowOff>0</xdr:rowOff>') : an);
    dr = textoForma(dr, '60 Rectángulo', ops);
    dr = textoForma(dr, '61 Rectángulo', rol('JEFE DE PLANIFICACIÓN', 'pla'));
    dr = textoForma(dr, '62 Rectángulo', rol('JEFE DE LOGÍSTICA', 'log'));
    dr = textoForma(dr, '63 Rectángulo', rol('JEFE DE ADMON. Y FINANZAS', 'adm'));
    return dr;
  }

  /* geometría de la hoja (ancho de columnas y alto de filas) para ubicar fotos */
  function geom(s) {
    const cw = {}; let m; const re = /<col min="(\d+)" max="(\d+)" width="([\d.]+)"/g;
    while ((m = re.exec(s))) for (let c = +m[1]; c <= Math.min(+m[2], 80); c++) cw[c] = Math.round(+m[3] * 7 * 9525);
    return cw;
  }
  const ROW_EMU = Math.round(14.95 * 12700);
  const picAnchor = (id, rid, col, colOff, row, rowOff, W, H, name) => `<xdr:oneCellAnchor><xdr:from><xdr:col>${col}</xdr:col><xdr:colOff>${colOff}</xdr:colOff><xdr:row>${row}</xdr:row><xdr:rowOff>${rowOff}</xdr:rowOff></xdr:from><xdr:ext cx="${W}" cy="${H}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${id}" name="${X(name)}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${W}" cy="${H}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`;
  const fit = (f, maxW, maxH) => { const sc = Math.min(maxW / f.w, maxH / f.h); return [Math.round(f.w * sc), Math.round(f.h * sc)]; };

  async function fotosReporte(zip, s, dr, fotos, r) {
    const cw = geom(s);                                   // ancho de cada columna (1 = A) en EMU
    /* los cuatro recuadros del numeral 14 del formato: columnas AE-AG y AH-AJ; filas 32-44 y 45-55 */
    const BOX = [{ c1: 31, c2: 33, r1: 32, r2: 44 }, { c1: 34, c2: 36, r1: 32, r2: 44 }, { c1: 31, c2: 33, r1: 45, r2: 55 }, { c1: 34, c2: 36, r1: 45, r2: 55 }];
    let rels = await zip.file('xl/drawings/_rels/drawing1.xml.rels').async('string');
    let ct = await zip.file('[Content_Types].xml').async('string');
    if (!/Extension="jpeg"/.test(ct)) ct = ct.replace('<Default Extension="png"', '<Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="png"');
    let anchors = '', id = 900;
    fotos.slice(0, 4).forEach((f, i) => {
      const b = BOX[i], n = i + 1;
      let bw = 0; for (let c = b.c1; c <= b.c2; c++) bw += cw[c] || 0;
      const hE = n => Math.round(altoDe(s, n) * 12700); let bh = 0; for (let q = b.r1; q <= b.r2; q++) bh += hE(q); const pad = 45000;
      const [W, H] = fit(f, bw - 2 * pad, bh - 2 * pad);
      const px = Math.floor((bw - W) / 2), py = Math.floor((bh - H) / 2);
      let c = b.c1, acc = 0; while (c < b.c2 && acc + (cw[c] || 0) <= px) { acc += cw[c] || 0; c++; }
      let row0 = b.r1, rowOff = py; while (row0 < b.r2 && rowOff >= hE(row0)) { rowOff -= hE(row0); row0++; } row0 -= 1;
      const name = 'media/repfoto' + n + '.jpeg', rid = 'rIdRf' + n;
      zip.file('xl/' + name, f.data);
      rels = rels.replace('</Relationships>', `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../${name}"/></Relationships>`);
      anchors += picAnchor(id++, rid, c - 1, px - acc, row0, rowOff, W, H, 'Foto ' + n);
    });
    dr = dr.replace('</xdr:wsDr>', anchors + '</xdr:wsDr>');
    zip.file('xl/drawings/drawing1.xml', dr);
    zip.file('xl/drawings/_rels/drawing1.xml.rels', rels);
    zip.file('[Content_Types].xml', ct);
    return s;
  }

  /* hoja adicional con el resto de las fotografías (2 por fila, 3 filas por página) */
  async function hojaFotos(zip, ct, fotos, desde, r) {
    let rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';
    const colW = 48, cwE = Math.round(colW * 7 * 9525), rowPhoto = 200, rowCap = 3;   // puntos
    let anchors = '', rows = `<row r="1" ht="22" customHeight="1"><c r="A1" t="inlineStr"><is><t>${X('REGISTRO FOTOGRÁFICO DEL INCIDENTE · ' + (r.id || ''))}</t></is></c></row>`;
    const maxW = cwE - 120000, maxH = Math.round(rowPhoto * 12700) - 60000;
    const brks = [];
    fotos.forEach((f, i) => {
      const k = i >> 1, col = i % 2, rp = 2 + k * 2, n = desde + i;
      if (col === 0) { rows += `<row r="${rp}" ht="${rowPhoto}" customHeight="1"/><row r="${rp + 1}" ht="${rowCap}" customHeight="1">__CAP${rp + 1}__</row>`; if (k > 0 && k % 3 === 0) brks.push(rp - 1); }
      const [W, H] = fit(f, maxW, maxH);
      const name = 'media/repfoto' + n + '.jpeg', rid = 'rIdRf' + n;
      zip.file('xl/' + name, f.data);
      rels += `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../${name}"/>`;
      anchors += picAnchor(950 + i, rid, col, Math.floor((cwE - W) / 2), rp - 1, 30000, W, H, 'Foto ' + n);
      const cap = '';
      rows = rows.replace('__CAP' + (rp + 1) + '__', cap + (col ? '' : '__CAP' + (rp + 1) + '__'));
    });
    rows = rows.replace(/__CAP\d+__/g, '');
    const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><cols><col min="1" max="2" width="${colW}" customWidth="1"/></cols><sheetData>${rows}</sheetData><pageMargins left="0.197" right="0.197" top="0.197" bottom="0.197" header="0.1" footer="0.1"/><pageSetup orientation="portrait" fitToHeight="0"/>${brks.length ? '<rowBreaks count="' + brks.length + '" manualBreakCount="' + brks.length + '">' + brks.map(b => `<brk id="${b}" max="16383" man="1"/>`).join('') + '</rowBreaks>' : ''}<drawing r:id="rId1"/></worksheet>`;
    zip.file('xl/worksheets/sheet3.xml', sheet);
    zip.file('xl/worksheets/_rels/sheet3.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing2.xml"/></Relationships>');
    zip.file('xl/drawings/drawing2.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' + anchors + '</xdr:wsDr>');
    zip.file('xl/drawings/_rels/drawing2.xml.rels', rels + '</Relationships>');
    let wb = await zip.file('xl/workbook.xml').async('string');
    wb = wb.replace('</sheets>', '<sheet name="FOTOS ADICIONALES" sheetId="9" r:id="rId9"/></sheets>');
    zip.file('xl/workbook.xml', wb);
    let wr = await zip.file('xl/_rels/workbook.xml.rels').async('string');
    wr = wr.replace('</Relationships>', '<Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/></Relationships>');
    zip.file('xl/_rels/workbook.xml.rels', wr);
    return ct.replace('</Types>', '<Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/drawings/drawing2.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>');
  }


  /* ---------- Reporte de Emergencias listo para imprimir (misma estructura del formato) ---------- */
  function reporteHTML(r, o) {
    o = o || {};
    const E = x => X(x == null ? '' : x), v = x => (x == null || x === '' ? '' : E(x));
    const rp = r.rpt || {}, sci = rp.sci || {}, prop = rp.prop || {}, esc = rp.esc || {}, ins = rp.inst || {}, cmd = rp.cmd || {};
    const noAct = /no se activ/i, nm = k => (sci[k] && !noAct.test(sci[k]) ? sci[k] : 'No activado');
    const seq = String((r.id || '').split('-').pop() || '').padStart(6, '0').slice(-6);
    const f = r.fecha || '';
    const row = (a, b) => `<tr><th>${a}</th><td colspan="3">${b}</td></tr>`;
    const chk = (c, t) => `<span class="ck">${c ? '☒' : '☐'} ${E(t)}</span>`;
    const insV = k => { const a = ins[k] || []; return (a[0] || a[0] === 0 ? a[0] : '') + ' unid. / ' + (a[1] || a[1] === 0 ? a[1] : '') + ' veh.'; };
    const vehs = String(r.veh || '').split(/[,/;]+/).map(x => x.trim()).filter(Boolean);
    const pers = (r.pers || []).slice(0, 24);
    const lat = gmsLat(r.lat), lon = gmsLon(r.lon);
    const acc = (rp.acc || []).slice();
    const fotos = o.fotos || r.fotos || [];
    const css = `@page{size:21.59cm 27.94cm;margin:.5cm}*{box-sizing:border-box}body{font:10.5px/1.3 Arial,Helvetica,sans-serif;color:#000;margin:0;zoom:.95}h1,h2{margin:0}.hd{display:grid;grid-template-columns:80px 1fr 80px;align-items:center;border:1.5px solid #000;padding:4px}.hd img{max-height:64px;max-width:76px}.hd .t{text-align:center;font-weight:700;font-size:13px}table{border-collapse:collapse;width:100%;margin-top:4px;page-break-inside:avoid}th,td{border:1px solid #000;padding:3px 5px;vertical-align:top;text-align:left}th{background:#eee;width:23%;font-weight:700}.sec{background:#222;color:#fff;font-weight:700;text-align:center;padding:3px;margin-top:6px;border:1px solid #000;page-break-after:avoid}.ck{margin-right:12px;white-space:nowrap}.org{display:grid;gap:6px;justify-items:center;border:1px solid #000;padding:6px;margin-top:4px;page-break-inside:avoid}.bx{border:1.5px solid #000;padding:4px 8px;text-align:center;min-width:130px}.bx b{display:block;font-size:9px}.row{display:flex;gap:6px;flex-wrap:wrap;justify-content:center}.ph{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:4px}.ph figure{margin:0;border:1px solid #000;padding:4px;text-align:center;page-break-inside:avoid}.ph img{max-width:100%;max-height:230px}.ph figcaption{font-size:9.5px}.sign{height:46px}`;
    const gr = (sci.grupos || []).map(g => `<div class="bx"><b>Unidad ${E(g.u)}</b>${E(g.f || '')}${g.n ? '<br>' + E(g.n) : ''}${(g.p || []).length ? '<br><small>' + E(g.p.join(', ')) + '</small>' : ''}</div>`).join('');
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Reporte de Emergencias ${E(r.id)}</title><style>${css}</style></head><body>
<div class="hd">${o.logo1 ? `<img src="${o.logo1}" alt="">` : '<span></span>'}<div class="t">CUERPO DE BOMBEROS VOLUNTARIOS<br>LA UNION - VALLE DEL CAUCA<br><br>REPORTE DE EMERGENCIAS</div>${o.logo2 ? `<img src="${o.logo2}" alt="">` : '<span></span>'}</div>
<table><tr><th>INCIDENTE N°</th><td style="font-size:15px;font-weight:700;letter-spacing:.35em">${E(seq)}</td><th>Fecha y hora de elaboración</th><td>${E(f ? f.slice(8, 10) + '/' + f.slice(5, 7) + '/' + f.slice(2, 4) : '')} · ${E(h24(r.hora))} h</td></tr></table>
<div class="sec">1. DATOS DE LA PROPIEDAD</div>
<table><tr><th>Tipo de propiedad</th><td colspan="3">${['Vivienda', 'Finca', 'Comercial', 'Agrícola', 'Vía pública', 'Lote baldío', 'Industrial', 'Otro'].map(t => chk(prop.tipo === t, t)).join('')}</td></tr>${row('Nombre del propietario', v(prop.nom))}<tr><th>Documento de identidad</th><td>${v(prop.doc)}</td><th>N° de contacto</th><td>${v(prop.tel)}</td></tr></table>
<div class="sec">2. DATOS DEL INCIDENTE</div>
<table><tr><th>Tipo de incidente</th><td colspan="3"><b>${E(r.cat)}</b></td></tr><tr><th>Hora de reporte</th><td>${E(h24(r.hora))} h</td><th>Hora de llegada al sitio</th><td>${E(h24(r.hlle))}${r.hlle ? ' h' : ''}</td></tr>
<tr><th>Máquinas</th><td colspan="3">${['T-1', 'B-2', 'B-3', 'B-4', 'L-1', 'L-2', 'L-3'].map(m => chk(vehs.some(x => x.toUpperCase().replace(/\s+/g, '').replace(/^([A-Z])(\d)$/, '$1-$2') === m), m)).join('')} ${E(vehs.filter(x => !/^[TBL][- ]?\d$/i.test(x)).join(', '))}</td></tr>
<tr><th>Dirección</th><td colspan="3">${v(r.dir)}</td></tr><tr><th>Barrio / vereda</th><td colspan="3">${v(r.bar) || 'N/A'}</td></tr>
<tr><th>Zona</th><td>${chk(rp.zona === 'URBANA', 'URBANA')}${chk(rp.zona === 'RURAL', 'RURAL')}</td><th>Departamento / municipio</th><td>VALLE DEL CAUCA · LA UNIÓN</td></tr>
<tr><th>Coordenadas</th><td colspan="3">Latitud: <b>${E(lat)}</b> &nbsp; Longitud: <b>${E(lon)}</b></td></tr>
${row('Ubicación del puesto de comando', v(rp.pc))}${row('Identificación del comando de incidentes', v(rp.pcid))}${row('Ubicación del área de espera', v(rp.ae))}${row('Ubicación del A.C.V.', v(rp.acv))}</table>
<div class="sec">3. EVALUACIÓN INICIAL DEL INCIDENTE</div>
<table>${row('Descripción del incidente', v(rp.dinc))}${row('Amenazas del incidente', v(rp.amen))}${row('Objetivos iniciales', v(rp.obj))}
<tr><th>Hubo alteración en la escena antes de la llegada de bomberos</th><td>${chk(esc.alt === 'SI', 'SI')}${chk(esc.alt === 'NO', 'NO')}</td><th>Cómo se alteró</th><td>${v(esc.altc)}</td></tr>
<tr><th>Se realizó protección del área luego del arribo</th><td>${chk(esc.prot === 'SI', 'SI')}${chk(esc.prot === 'NO', 'NO')}</td><th>Cómo se realizó</th><td>${v(esc.protc)}</td></tr>
<tr><th>Hubo personas que intervinieron antes de la llegada de bomberos</th><td>${chk(esc.int === 'SI', 'SI')}${chk(esc.int === 'NO', 'NO')}</td><th>Quiénes intervinieron</th><td>${v(esc.intc)}</td></tr></table>
<div class="sec">4. INSTITUCIONES QUE INTERVIENEN Y APOYAN EN EL INCIDENTE</div>
<table><tr><th>Defensa Civil</th><td>${insV('dc')}</td><th>Policía Carreteras</th><td>${insV('pcar')}</td></tr><tr><th>Cruz Roja</th><td>${insV('cr')}</td><th>Hospitales</th><td>${insV('hosp')}</td></tr><tr><th>Policía Nacional</th><td>${insV('pn')}</td><th></th><td></td></tr></table>
<div class="sec">5. INFORMACIÓN DE LESIONADOS EN EL INCIDENTE</div>
<table><tr><th>Nombre</th><th>Doc. identidad</th><th>Edad</th><th>Trasladado a / por</th></tr>${(rp.les || []).map(x => `<tr><td>${v(x.n)}</td><td>${v(dtxt(x.td, x.d))}</td><td>${v(x.e)}</td><td>${v(x.t)}${x.p ? ' · ' + v(x.p) : ''}</td></tr>`).join('') || '<tr><td colspan="4">N/A</td></tr>'}</table>
<div class="sec">6. INFORMACIÓN DE VEHÍCULOS IMPLICADOS</div>
<table><tr><th>Conductor</th><th>Doc. identidad</th><th>Vehículo</th><th>Color / placa</th></tr>${(rp.vimp || []).map(x => `<tr><td>${v(x.c)}</td><td>${v(dtxt(x.td, x.d))}</td><td>${v(x.v)}</td><td>${v(x.col)} ${v(x.pl)}</td></tr>`).join('') || '<tr><td colspan="4">N/A</td></tr>'}</table>
<div class="sec">7. ORGANIZACIÓN DEL INCIDENTE (SCI)</div>
<div class="org"><div class="bx"><b>COMANDANTE DEL INCIDENTE${(cmd.nom||rp.pcid) ? " · " + E(cmd.nom||rp.pcid) : ""}</b>${E(sci.ci || cmd.n || '')}</div>
<div class="row"><div class="bx"><b>Oficial de seguridad</b>${E(nm('seg'))}</div><div class="bx"><b>Oficial de información pública</b>${E(nm('inf'))}</div><div class="bx"><b>Oficial de enlace</b>${E(nm('enl'))}</div></div>
<div class="row"><div class="bx"><b>JEFE DE OPERACIONES</b>${E(nm('ops'))}</div><div class="bx"><b>JEFE DE PLANIFICACIÓN</b>${E(nm('pla'))}</div><div class="bx"><b>JEFE DE LOGÍSTICA</b>${E(nm('log'))}</div><div class="bx"><b>JEFE DE ADMON. Y FINANZAS</b>${E(nm('adm'))}</div></div>
${gr ? `<div><b>Función de cada unidad</b></div><div class="row">${gr}</div>` : ''}</div>
<div class="sec">8. BOSQUEJO O CROQUIS DEL LUGAR DEL INCIDENTE</div><table><tr><td style="height:110px"></td></tr></table>
<div class="sec">9. RESUMEN DE LAS ACCIONES</div>
<table><tr><th style="width:12%">HORA (24 h)</th><th>ACCIÓN REALIZADA</th></tr>${acc.map(x => `<tr><td style="text-align:center">${E(h24(x.h))}</td><td>${v(x.a)}</td></tr>`).join('') || '<tr><td colspan="2">N/A</td></tr>'}<tr><td></td><td><b>OBSERVACIONES:</b> ${v(rp.obs)}<br>Duración: ${E(durOf(r))}. Unidades que asistieron: ${E(na(r.uni))}. Vehículos: ${E(na(r.veh))}.${r.hsal ? ' Salida de estación: ' + E(h24(r.hsal)) + ' h.' : ''}${r.hfin ? ' Terminación de la emergencia: ' + E(h24(r.hfin)) + ' h.' : ''}${rp.hdes ? ' Desmovilización hacia el cuartel: ' + E(h24(rp.hdes)) + ' h.' : ''}${r.hreg ? ' Llegada a la estación: ' + E(h24(r.hreg)) + ' h.' : ''}${r.area ? ' Área afectada: ' + E(r.area) + '.' : ''} ${E(r.extraTxt || '')}</td></tr></table>
<div class="sec">10. UNIDAD QUE COMANDÓ EL INCIDENTE</div>
<table><tr><th>Nombres y apellidos</th><th>Grado</th><th>Cargo</th><th>Firma</th></tr><tr><td>${v(cmd.n)}</td><td>${v(cmd.g)}</td><td>${v(cmd.c)}</td><td class="sign" style="vertical-align:bottom;text-align:center;font-size:9px">${E([cmd.g, cmd.n].filter(Boolean).join(' '))}</td></tr></table>
<div class="sec">11. UNIDADES QUE INTERVINIERON EN EL INCIDENTE</div>
<table><tr><td>${pers.map(p => E(p)).join('</td><td>').replace(/(<td>[^]*?){0}/, '')}</td></tr></table>
<div class="sec">12. OBSERVACIONES ADICIONALES (LEGALES, DISCIPLINARIAS, NORMATIVAS O DE REQUERIMIENTOS Y NECESIDADES)</div>
<table><tr><td>Las observaciones del comandante y los datos complementarios están en el numeral 9 (Resumen de las acciones).</td></tr></table>
<div class="sec">13. RECEPCIÓN Y APROBACIÓN DEL INFORME</div>
<table><tr><th>Guardia que recibe el informe</th><th>Grado</th><th>Estado en que recibe</th><th>Firma</th></tr><tr><td class="sign"></td><td></td><td>${chk(false, 'COMPLETO')}${chk(false, 'INCOMPLETO')}</td><td></td></tr></table>
${fotos.length ? `<div class="sec" style="page-break-before:always">14. REGISTRO FOTOGRÁFICO DEL INCIDENTE</div><div class="ph">${fotos.map((p, i) => `<figure><img src="${p.src}" alt="Fotografía ${i + 1}"></figure>`).join('')}</div>` : '<div class="sec">14. REGISTRO FOTOGRÁFICO DEL INCIDENTE</div><table><tr><td>Sin fotografías.</td></tr></table>'}
<script>window.onload=function(){setTimeout(function(){window.print()},400)}</script></body></html>`;
  }

  /* ---------- 4. REGISTRO FOTOGRÁFICO (plantilla Word) ---------- */
  async function fotografico(JSZip, tpl, { titulo, fotos }) {
    // fotos: [{data: Uint8Array JPEG, w, h, desc}]
    const zip = await load(JSZip, tpl);
    let d = await zip.file('word/document.xml').async('string');
    const b0 = d.indexOf('<w:body>') + 8, b1 = d.lastIndexOf('</w:body>');
    const body = d.slice(b0, b1);
    const tok = /<(\/?)w:(tbl|p|sectPr)\b([^>]*?)(\/?)>/g;
    const items = []; const stack = []; let start = 0, m;
    while ((m = tok.exec(body))) {
      const [, close, name, , selfc] = m;
      if (!close && !selfc) { if (!stack.length) start = m.index; stack.push(name); }
      else if (close) { stack.pop(); if (!stack.length) items.push({ name, s: start, e: m.index + m[0].length }); }
      else if (selfc && !stack.length) items.push({ name, s: m.index, e: m.index + m[0].length });
    }
    const sect = items.find(i => i.name === 'sectPr');
    const tblIdx = items.map((it, i) => it.name === 'tbl' ? i : -1).filter(i => i >= 0);
    const pages = Math.max(1, Math.ceil(fotos.length / 3));
    if (pages > tblIdx.length) throw new Error('Máximo ' + tblIdx.length * 3 + ' fotografías por archivo');
    // grupos: cada tabla con los elementos que le siguen hasta la siguiente tabla
    let parts = [];
    for (let p = 0; p < pages; p++) {
      const a = tblIdx[p], z = (tblIdx[p + 1] != null ? tblIdx[p + 1] : items.indexOf(sect));
      let seg = items.slice(a, z).map(it => body.slice(it.s, it.e)).join('');
      if (p === pages - 1) seg = seg.replace(/<w:br w:type="page"\/>/g, '');
      parts.push(seg);
    }
    let nb = parts.join('') + '<w:p/>' + body.slice(sect.s, sect.e);
    // título (solo la primera página lo trae en la plantilla)
    nb = nb.replace(/(<w:p\b(?:(?!<\/w:p>)[\s\S])*?)<w:t[^>]*>REGISTRO DE ACTIVIDADES[\s\S]*?<\/w:p>/, (mm, pre) => mm);
    nb = nb.replace(/<w:t(?: [^>]*)?>REGISTRO DE ACTIVIDADES DEL MES DE:?<\/w:t>/, `<w:t xml:space="preserve">${X(titulo)}</w:t>`);
    if (nb.indexOf(X(titulo)) < 0) {
      // el texto del título está repartido en varias corridas: reemplazar todo el párrafo
      nb = nb.replace(/<w:p\b(?:(?!<\/w:p>)[\s\S])*?REGISTRO(?:(?!<\/w:p>)[\s\S])*?<\/w:p>/, pm => {
        const ppr = (pm.match(/<w:pPr>[\s\S]*?<\/w:pPr>/) || [''])[0];
        const rpr = (pm.match(/<w:r\b[^>]*>(<w:rPr>[\s\S]*?<\/w:rPr>)/) || ['', ''])[1];
        return `<w:p>${ppr}<w:r>${rpr}<w:t xml:space="preserve">${X(titulo)}</w:t></w:r></w:p>`;
      });
    }
    // cajas de texto (solo la rama moderna mc:Choice)
    const boxes = [[4940300, 2802467], [2362200, 2726055], [2324100, 2726266]];
    let rels = await zip.file('word/_rels/document.xml.rels').async('string');
    let fi = 0, bi = 0, docId = 5000;
    nb = nb.replace(/<mc:Choice Requires="wps">[\s\S]*?<\/mc:Choice>/g, ch => ch.replace(/<w:txbxContent>[\s\S]*?<\/w:txbxContent>/, () => {
      const idx = fi++, box = boxes[bi++ % 3], f = fotos[idx];
      if (!f) return '<w:txbxContent><w:p/></w:txbxContent>';
      const name = 'media/foto' + (idx + 1) + '.jpeg', rid = 'rIdFoto' + (idx + 1);
      zip.file('word/' + name, f.data);
      rels = rels.replace('</Relationships>', `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${name}"/></Relationships>`);
      const maxW = box[0] - 182880, maxH = box[1] - 91440 - 520000;
      const sc = Math.min(maxW / f.w, maxH / f.h); const W = Math.round(f.w * sc), H = Math.round(f.h * sc);
      const cap = X(f.desc || '');
      return '<w:txbxContent><w:p><w:pPr><w:spacing w:after="0"/><w:jc w:val="center"/></w:pPr><w:r><w:drawing>' +
        `<wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${W}" cy="${H}"/><wp:docPr id="${docId++}" name="Foto ${idx + 1}" descr="${cap}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
        `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="foto${idx + 1}.jpeg"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${W}" cy="${H}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>` +
        `<w:p><w:pPr><w:spacing w:before="40" w:after="0"/><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr><w:t xml:space="preserve">${cap}</w:t></w:r></w:p></w:txbxContent>`;
    }));
    zip.file('word/_rels/document.xml.rels', rels);
    zip.file('word/document.xml', d.slice(0, b0) + nb + d.slice(b1));
    return out(zip);
  }

  /* ---------- 5. ESTADÍSTICA (libro nuevo con el estilo de la Comandancia) ---------- */
  const COLS = n => { let s = ''; n++; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };
  async function estadistica(JSZip, { titulo, subtitulo, rows, comparar, meses }) {
    // rows: registros del periodo. comparar: {anios:[...], datos:{cat:{anio:n}}, totales:{anio:n}} (opcional)
    rows = sortRows(rows);
    const zip = new JSZip();
    const sheets = [];
    // estilos: 0 normal,1 encabezado,2 texto borde,3 entero borde,4 % borde,5 titulo,6 fecha borde,7 total texto,8 total entero,9 total %,10 subtitulo,11 texto sin borde,12 variación
    const styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<numFmts count="2"><numFmt numFmtId="164" formatCode="0.0%"/><numFmt numFmtId="165" formatCode="+0.0%;-0.0%;0.0%"/></numFmts>' +
      '<fonts count="5"><font><sz val="10"/><name val="Arial"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/></font><font><b/><sz val="14"/><color rgb="FF1F2A44"/><name val="Arial"/></font><font><b/><sz val="10"/><name val="Arial"/></font><font><i/><sz val="10"/><color rgb="FF555555"/><name val="Arial"/></font></fonts>' +
      '<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0B2E6B"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8ECF4"/></patternFill></fill></fills>' +
      '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FF8A93A6"/></left><right style="thin"><color rgb="FF8A93A6"/></right><top style="thin"><color rgb="FF8A93A6"/></top><bottom style="thin"><color rgb="FF8A93A6"/></bottom><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="13">' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
      '<xf numFmtId="3" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="top"/></xf>' +
      '<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="top"/></xf>' +
      '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
      '<xf numFmtId="14" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="top"/></xf>' +
      '<xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>' +
      '<xf numFmtId="3" fontId="3" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>' +
      '<xf numFmtId="164" fontId="3" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>' +
      '<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>' +
      '<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="top"/></xf></cellXfs></styleSheet>';
    const cell = (c, r, o) => {
      const ref = COLS(c) + r;
      if (o == null) return '';
      if (typeof o !== 'object') o = { v: o };
      const s = o.s != null ? ` s="${o.s}"` : '';
      if (o.f) return `<c r="${ref}"${s}><f>${X(o.f)}</f><v>${o.v == null ? 0 : o.v}</v></c>`;
      if (typeof o.v === 'number') return `<c r="${ref}"${s}><v>${o.v}</v></c>`;
      if (o.v === '' || o.v == null) return `<c r="${ref}"${s}/>`;
      return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${X(o.v)}</t></is></c>`;
    };
    function sheet(name, grid, widths, opts = {}) {
      let sd = '';
      grid.forEach((row, i) => { if (!row) return; const r = i + 1; const ht = row._ht ? ` ht="${row._ht}" customHeight="1"` : ''; sd += `<row r="${r}"${ht}>` + row.map((o, c) => cell(c, r, o)).join('') + '</row>'; });
      const cols = '<cols>' + widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('') + '</cols>';
      const pane = opts.freeze ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${opts.freeze}" topLeftCell="A${opts.freeze + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
      const merges = opts.merges ? `<mergeCells count="${opts.merges.length}">${opts.merges.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '';
      sheets.push({ name, xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${pane}<sheetFormatPr defaultRowHeight="14"/>${cols}<sheetData>${sd}</sheetData>${merges}<pageMargins left="0.197" right="0.197" top="0.197" bottom="0.197" header="0.1" footer="0.1"/><pageSetup orientation="landscape" fitToHeight="0"/></worksheet>` });
    }
    const cnt = {}; CATS.forEach(c => cnt[c] = 0); rows.forEach(r => { if (cnt[r.cat] != null) cnt[r.cat]++; });
    const total = rows.length;

    // RESUMEN
    const topCats = CATS.map(c => [c, cnt[c]]).sort((a, b) => b[1] - a[1]).filter(x => x[1] > 0).slice(0, 5);
    const resumen = [[{ v: titulo, s: 5 }], [{ v: subtitulo, s: 10 }], [], [{ v: 'Total de emergencias y actividades', s: 7 }, { v: total, s: 8 }]];
    resumen.push([{ v: 'Categorías con registros', s: 7 }, { v: CATS.filter(c => cnt[c] > 0).length, s: 8 }]);
    if (rows.length) resumen.push([{ v: 'Primer registro', s: 7 }, { v: serial(rows[0].fecha), s: 6 }], [{ v: 'Último registro', s: 7 }, { v: serial(rows[rows.length - 1].fecha), s: 6 }]);
    resumen.push([], [{ v: 'Principales categorías', s: 1 }, { v: 'Cantidad', s: 1 }, { v: '% incidencia', s: 1 }]);
    topCats.forEach(([c, q]) => resumen.push([{ v: c, s: 2 }, { v: q, s: 3 }, { v: total ? q / total : 0, s: 4 }]));
    sheet('RESUMEN', resumen, [62, 14, 14]);

    // POR CATEGORÍA
    const pc = [[{ v: titulo, s: 5 }], [{ v: subtitulo, s: 10 }], [], [{ v: 'EMERGENCIAS', s: 1 }, { v: 'CANTIDAD', s: 1 }, { v: '% INCIDENCIA', s: 1 }]];
    CATS.forEach((c, i) => { const r = i + 5; pc.push([{ v: c, s: 2 }, { v: cnt[c], s: 3 }, { f: `IF($B$${CATS.length + 5}=0,0,B${r}/$B$${CATS.length + 5})`, v: total ? cnt[c] / total : 0, s: 4 }]); });
    pc.push([{ v: 'TOTAL', s: 7 }, { f: `SUM(B5:B${CATS.length + 4})`, v: total, s: 8 }, { f: `IF(B${CATS.length + 5}=0,0,B${CATS.length + 5}/B${CATS.length + 5})`, v: total ? 1 : 0, s: 9 }]);
    sheet('POR CATEGORÍA', pc, [62, 14, 14], { freeze: 4 });

    // POR MES
    const mm = {}; rows.forEach(r => { const k = r.fecha.slice(0, 7); mm[k] = (mm[k] || 0) + 1; });
    const keys = Object.keys(mm).sort();
    const pm = [[{ v: titulo, s: 5 }], [{ v: subtitulo, s: 10 }], [], [{ v: 'MES', s: 1 }, { v: 'TOTAL', s: 1 }]];
    keys.forEach(k => pm.push([{ v: MESES[+k.slice(5)-1] + ' ' + k.slice(0, 4), s: 2 }, { v: mm[k], s: 3 }]));
    pm.push([{ v: 'TOTAL', s: 7 }, { f: `SUM(B5:B${keys.length + 4})`, v: total, s: 8 }]);
    sheet('POR MES', pm, [28, 14], { freeze: 4 });

    // COMPARATIVO
    if (comparar && comparar.anios && comparar.anios.length) {
      const an = comparar.anios;
      const hd = [{ v: 'CATEGORÍA', s: 1 }].concat(an.map(a => ({ v: String(a), s: 1 })));
      if (an.length >= 2) hd.push({ v: 'VARIACIÓN ' + an[an.length - 2] + '→' + an[an.length - 1], s: 1 });
      const cp = [[{ v: titulo + ' · comparativo por año', s: 5 }], [{ v: comparar.nota || subtitulo, s: 10 }], [], hd];
      CATS.forEach((c, i) => {
        const r = i + 5; const row = [{ v: c, s: 2 }].concat(an.map(a => ({ v: (comparar.datos[c] || {})[a] || 0, s: 3 })));
        if (an.length >= 2) { const pa = COLS(an.length - 1), pb = COLS(an.length); const a0 = row[an.length - 1].v, b0 = row[an.length].v; row.push({ f: `IF(${pa}${r}=0,0,(${pb}${r}-${pa}${r})/${pa}${r})`, v: a0 ? (b0 - a0) / a0 : 0, s: 12 }); }
        cp.push(row);
      });
      const tr = [{ v: 'TOTAL', s: 7 }].concat(an.map((a, k) => ({ f: `SUM(${COLS(k + 1)}5:${COLS(k + 1)}${CATS.length + 4})`, v: comparar.totales[a] || 0, s: 8 })));
      if (an.length >= 2) { const a0 = comparar.totales[an[an.length - 2]] || 0, b0 = comparar.totales[an[an.length - 1]] || 0; const pa = COLS(an.length - 1), pb = COLS(an.length), r = CATS.length + 5; tr.push({ f: `IF(${pa}${r}=0,0,(${pb}${r}-${pa}${r})/${pa}${r})`, v: a0 ? (b0 - a0) / a0 : 0, s: 12 }); }
      cp.push(tr);
      sheet('COMPARATIVO', cp, [62].concat(an.map(() => 12)).concat([18]), { freeze: 4 });
    }

    // DATOS
    const dt = [[{ v: 'TIPO DE INCIDENTE', s: 1 }, { v: 'INCIDENTES Y ACTIVIDADES', s: 1 }, { v: 'DÍA DEL EVENTO', s: 1 }, { v: 'DURACIÓN DEL EVENTO', s: 1 }, { v: 'DIRECCIÓN O LUGAR DE REFERENCIA', s: 1 }, { v: 'BARRIO CORREGIMIENTO O VEREDA', s: 1 }, { v: 'DESCRIPCIÓN DEL EVENTO', s: 1 }, { v: 'AREA AFECTADA', s: 1 }, { v: 'N° DE UNIDADES QUE ASISTIERON', s: 1 }, { v: 'VEHÍCULO', s: 1 }, { v: 'COORDENADAS', s: 1 }]];
    rows.forEach(r => dt.push([{ v: r.tipo || 'OTROS', s: 2 }, { v: r.cat, s: 2 }, { v: serial(r.fecha), s: 6 }, { v: durOf(r), s: 2 }, { v: na(r.dir), s: 2 }, { v: na(r.bar), s: 2 }, { v: na(r.desc), s: 2 }, { v: na(r.area), s: 2 }, (r.uni != null && r.uni !== '') ? { v: +r.uni, s: 3 } : { v: 'N/A', s: 2 }, { v: na(r.veh), s: 2 }, { v: na(coordOf(r)), s: 2 }]));
    sheet('DATOS', dt, [22, 44, 14, 20, 34, 26, 60, 16, 14, 16, 26], { freeze: 1 });

    zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' + sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') + '</Types>');
    zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
    zip.file('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + sheets.map((s, i) => `<sheet name="${X(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>');
    zip.file('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') + `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
    zip.file('xl/styles.xml', styles);
    sheets.forEach((s, i) => zip.file(`xl/worksheets/sheet${i + 1}.xml`, s.xml));
    return out(zip);
  }


  /* ---------- 5. FORMATO CARGUE MASIVO INCENDIOS FORESTALES (SNIF) ---------- */
  function dms(v) {
    const a = Math.abs(+v); let g = Math.floor(a); const mf = (a - g) * 60; let m = Math.floor(mf); let sec = Math.round((mf - m) * 60 * 100) / 100;
    if (sec >= 60) { sec = 0; m += 1; } if (m >= 60) { m = 0; g += 1; }
    return { g, m, s: sec };
  }
  const horaNum = h => { const m = /^(\d{1,2}):(\d{2})/.exec(String(h || '')); return m ? (+m[1] * 60 + +m[2]) / 1440 : null; };
  /* items: [{id?, vereda, prot, protNom, fini, hini, ffin, hfin, tipo, causa, areaTipo, area, obs, lat, lon, latg.. (opcional, ya en grados/minutos/segundos)}] */
  async function incendiosSNIF(JSZip, tpl, { items, depto, municipio, lonNegativa }) {
    const zip = await load(JSZip, tpl);
    let s = await zip.file('xl/worksheets/sheet1.xml').async('string');
    // estilos por columna tomados de la fila 10 de la plantilla
    const r10 = s.match(/<row r="10"[^>]*>([\s\S]*?)<\/row>/);
    const st = {};
    if (r10) { const re = /<c r="([A-Z]+)10"(?: s="(\d+)")?/g; let m; while ((m = re.exec(r10[1]))) st[m[1]] = m[2] != null ? m[2] : null; }
    const S = c => (st[c] != null ? st[c] : null);
    const rows = [];
    let maxId = 0; items.forEach(it => { if (it.id && +it.id > maxId) maxId = +it.id; });
    items.forEach((it, i) => {
      const n = 10 + i, id = it.id ? +it.id : ++maxId, c = [];
      const txt = (col, v) => { if (v != null && String(v).trim() !== '') c.push(istr(col + n, S(col), v)); else c.push(`<c r="${col}${n}"${S(col) != null ? ` s="${S(col)}"` : ''}/>`); };
      const num = (col, v) => { if (v != null && v !== '' && !isNaN(+v)) c.push(numc(col + n, S(col), +v)); else c.push(`<c r="${col}${n}"${S(col) != null ? ` s="${S(col)}"` : ''}/>`); };
      c.push(numc('A' + n, S('A'), id));
      txt('B', it.depto || depto || 'VALLE DEL CAUCA'); txt('C', it.mun || municipio || 'LA UNIÓN'); txt('D', it.vereda);
      txt('E', it.prot === 'SI' || it.prot === 'S' ? 'SI' : 'NO'); txt('F', it.prot === 'SI' || it.prot === 'S' ? it.protNom : '');
      const dt = (col, iso) => { if (/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) c.push(numc(col + n, S(col), serial(iso))); else txt(col, ''); };
      const hr = (col, h) => { const f = horaNum(h); if (f != null) c.push(numc(col + n, S(col), f)); else txt(col, '—'); };
      dt('G', it.fini); hr('H', it.hini); dt('I', it.ffin || it.fini); hr('J', it.hfin);
      const tipo = SNIF_TIPO[it.tipo] ? it.tipo : 'SUP', causa = SNIF_CAUSA[it.causa] ? it.causa : 'SID', at = SNIF_AREA[it.areaTipo] ? it.areaTipo : 'CBR_SIN_DTR';
      txt('K', tipo); txt('L', SNIF_TIPO[tipo]); txt('M', causa); txt('N', SNIF_CAUSA[causa]); txt('O', at);
      num('P', it.area); txt('Q', it.obs);
      let la = null, lo = null;
      if (it.latg != null && it.latg !== '') { la = { g: it.latg, m: it.latm, s: it.lats }; lo = { g: it.long, m: it.lonm, s: it.lons }; }
      else if (it.lat != null && it.lat !== '' && it.lon != null && it.lon !== '' && !isNaN(+it.lat) && !isNaN(+it.lon)) { la = dms(it.lat); lo = dms(it.lon); if (lonNegativa && +it.lon < 0) lo.g = -lo.g; }
      if (la) { num('R', la.g); num('S', la.m); num('T', la.s); num('U', lo.g); num('V', lo.m); num('W', lo.s); } else { ['R', 'S', 'T', 'U', 'V', 'W'].forEach(col => txt(col, '')); }
      rows.push(`<row r="${n}" spans="1:23">${c.join('')}</row>`);
    });
    s = s.replace(/<row r="(\d+)"[^>]*?(?:\/>|>[\s\S]*?<\/row>)/g, (m, r) => (+r >= 10 ? '' : m));
    s = s.replace('</sheetData>', rows.join('') + '</sheetData>');
    const last = Math.max(10, 9 + items.length);
    s = s.replace(/<dimension ref="[^"]*"\/>/, `<dimension ref="A1:W${last}"/>`);
    s = s.replace(/<sheetView tabSelected="1" topLeftCell="[^"]*"/, '<sheetView tabSelected="1"').replace(/<selection [^>]*\/>/, '<selection activeCell="A10" sqref="A10"/>');
    zip.file('xl/worksheets/sheet1.xml', s);
    return out(zip);
  }

  g.GEN = { altoFila, reporteHTML, h24, gmsLat, gmsLon, dmsTxt, CATS, MESES, durTxt, dmy, comandancia, actividades, reporteEmergencia, fotografico, estadistica, incendiosSNIF, SNIF_TIPO, SNIF_CAUSA, SNIF_AREA, dms };
})(typeof window !== 'undefined' ? window : globalThis);

/* Vista del Reporte de Emergencias: dibuja el mismo archivo .xlsx (celdas, bordes, colores, figuras e imágenes)
   como páginas HTML, para ver o imprimir el formato oficial sin cambiarlo. Autor: Cristhian Steven Blandón Henao */
(function (g) {
  'use strict';
  const ESC = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const colNum = c => { let n = 0; for (const ch of c) n = n * 26 + ch.charCodeAt(0) - 64; return n; };
  const parse = t => new DOMParser().parseFromString(t, 'application/xml');
  const kids = (n, tag) => n ? Array.from(n.children).filter(c => c.localName === tag) : [];
  const first = (n, tag) => kids(n, tag)[0] || null;
  const IDX = ['000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF', '000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF', '800000', '008000', '000080', '808000', '800080', '008080', 'C0C0C0', '808080', '9999FF', '993366', 'FFFFCC', 'CCFFFF', '660066', 'FF8080', '0066CC', 'CCCCFF', '000080', 'FF00FF', 'FFFF00', '00FFFF', '800080', '800000', '008080', '0000FF', '00CCFF', 'CCFFFF', 'CCFFCC', 'FFFF99', '99CCFF', 'FF99CC', 'CC99FF', 'FFCC99', '3366FF', '33CCCC', '99CC00', 'FFCC00', 'FF9900', 'FF6600', '666699', '969696', '003366', '339966', '003300', '333300', '993300', '993366', '333399', '333333'];
  function hsl(hex) { const r = parseInt(hex.slice(0, 2), 16) / 255, gg = parseInt(hex.slice(2, 4), 16) / 255, b = parseInt(hex.slice(4, 6), 16) / 255; const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b); let h = 0, s = 0; const l = (mx + mn) / 2; if (mx !== mn) { const d = mx - mn; s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (gg - b) / d + (gg < b ? 6 : 0) : mx === gg ? (b - r) / d + 2 : (r - gg) / d + 4; h /= 6; } return [h, s, l]; }
  function unhsl(h, s, l) { const f = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < .5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }; let r, gg, b; if (s === 0) r = gg = b = l; else { const q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q; r = f(p, q, h + 1 / 3); gg = f(p, q, h); b = f(p, q, h - 1 / 3); } return [r, gg, b].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join(''); }
  function tint(hex, t) { if (!t) return hex; const [h, s, l] = hsl(hex); const l2 = t < 0 ? l * (1 + t) : l * (1 - t) + t; return unhsl(h, s, l2); }

  async function leer(zip, p) { const f = zip.file(p); return f ? f.async('string') : null; }
  function ctx0(theme) {
    const th = ['FFFFFF', '000000', 'EEECE1', '1F497D', '4F81BD', 'C0504D', '9BBB59', '8064A2', '4BACC6', 'F79646'];
    if (theme) { const cs = theme.getElementsByTagName('a:clrScheme')[0]; if (cs) { const order = ['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6']; const v = {}; Array.from(cs.children).forEach(c => { const x = c.firstElementChild; if (x) v[c.localName] = x.getAttribute('val') || x.getAttribute('lastClr'); }); const m = ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6']; m.forEach((k, i) => { if (v[k]) th[i] = v[k]; }); } }
    return th;
  }
  function color(el, th) {
    if (!el) return null;
    if (el.getAttribute('rgb')) return '#' + el.getAttribute('rgb').slice(-6);
    if (el.getAttribute('theme') != null) return '#' + tint(th[+el.getAttribute('theme')] || '000000', +el.getAttribute('tint') || 0);
    if (el.getAttribute('indexed') != null) { const i = +el.getAttribute('indexed'); return '#' + (IDX[i] || '000000'); }
    return null;
  }
  const BST = { thin: '1px solid', hair: '1px dotted', medium: '2px solid', thick: '3px solid', dotted: '1px dotted', dashed: '1px dashed', double: '3px double', mediumDashed: '2px dashed', dashDot: '1px dashed' };
  function estilos(sty, th) {
    const fonts = kids(first(sty, 'fonts'), 'font').map(f => ({ sz: +(first(f, 'sz') || { getAttribute: () => 11 }).getAttribute('val') || 11, b: !!first(f, 'b'), i: !!first(f, 'i'), u: !!first(f, 'u'), name: (first(f, 'name') || { getAttribute: () => 'Calibri' }).getAttribute('val'), col: color(first(f, 'color'), th) }));
    const fills = kids(first(sty, 'fills'), 'fill').map(f => { const p = first(f, 'patternFill'); if (!p || p.getAttribute('patternType') !== 'solid') return null; return color(first(p, 'fgColor'), th); });
    const borders = kids(first(sty, 'borders'), 'border').map(b => { const o = {}; ['left', 'right', 'top', 'bottom'].forEach(k => { const e = first(b, k); const st = e && e.getAttribute('style'); o[k] = st ? (BST[st] || '1px solid') + ' ' + (color(first(e, 'color'), th) || '#000') : ''; }); return o; });
    const nf = {}; kids(first(sty, 'numFmts'), 'numFmt').forEach(n => { nf[n.getAttribute('numFmtId')] = n.getAttribute('formatCode'); });
    const xfs = kids(first(sty, 'cellXfs'), 'xf').map(x => { const a = first(x, 'alignment'); return { font: fonts[+x.getAttribute('fontId') || 0] || fonts[0], fill: fills[+x.getAttribute('fillId') || 0], border: borders[+x.getAttribute('borderId') || 0] || {}, nf: x.getAttribute('numFmtId') || '0', code: nf[x.getAttribute('numFmtId')] || '', h: a && a.getAttribute('horizontal') || '', v: a && a.getAttribute('vertical') || '', wrap: !!(a && (a.getAttribute('wrapText') === '1' || a.getAttribute('wrapText') === 'true')), rot: a ? +a.getAttribute('textRotation') || 0 : 0, ind: a ? +a.getAttribute('indent') || 0 : 0 }; });
    return xfs;
  }
  function fmtNum(v, xf) {
    const n = +v; if (!isFinite(n) || v === '') return String(v);
    const id = +xf.nf, c = xf.code || '';
    const dateLike = (id >= 14 && id <= 17) || id === 22 || /[dy]/i.test(c.replace(/"[^"]*"/g, '')) && !/^0|#/.test(c);
    const timeLike = (id >= 18 && id <= 21) || /h/i.test(c.replace(/"[^"]*"/g, '')) && /:/.test(c);
    if (timeLike && !dateLike) { const m = Math.round((n % 1) * 1440); return String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }
    if (dateLike) { const d = new Date(Math.round((n - 25569) * 86400000)); return String(d.getUTCDate()).padStart(2, '0') + '/' + String(d.getUTCMonth() + 1).padStart(2, '0') + '/' + d.getUTCFullYear(); }
    if (/%/.test(c)) return Math.round(n * 100) + '%';
    const dec = (c.match(/\.(0+)/) || [, ''])[1].length;
    if (c && /0|#/.test(c)) { let t = n.toFixed(dec); if (/,/.test(c)) t = t.replace(/\B(?=(\d{3})+(?!\d))/g, '.'); return t; }
    return Number.isInteger(n) ? String(n) : String(+n.toFixed(6));
  }
  function celdaTxt(c, ss) {
    const t = c.getAttribute('t'), v = first(c, 'v');
    if (t === 'inlineStr') return Array.from(c.getElementsByTagName('t')).filter(x => x.parentNode.localName !== 'rPh').map(x => x.textContent).join('');
    if (!v) return '';
    if (t === 's') return ss[+v.textContent] || '';
    if (t === 'str' || t === 'e') return v.textContent;
    if (t === 'b') return v.textContent === '1' ? 'VERDADERO' : 'FALSO';
    return v.textContent;
  }
  const colL = n => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
  const refPos = r => { const m = /^([A-Z]+)(\d+)$/.exec(r); return m ? [+m[2], colNum(m[1])] : [0, 0]; };

  /* figuras e imágenes del dibujo */
  function dibujo(dxml, rels, zip, th) {
    if (!dxml) return Promise.resolve([]);
    const doc = parse(dxml);
    const out = [];
    const A = c => c; // pos
    const pos = (n) => ({ c: +n.getElementsByTagName('xdr:col')[0].textContent, co: +n.getElementsByTagName('xdr:colOff')[0].textContent, r: +n.getElementsByTagName('xdr:row')[0].textContent, ro: +n.getElementsByTagName('xdr:rowOff')[0].textContent });
    return Promise.all(Array.from(doc.documentElement.children).map(async anc => {
      const from = anc.getElementsByTagName('xdr:from')[0]; if (!from) return;
      const to = anc.getElementsByTagName('xdr:to')[0], ext = anc.getElementsByTagName('xdr:ext')[0];
      const it = { from: pos(from), to: to ? pos(to) : null, ext: ext ? { w: +ext.getAttribute('cx'), h: +ext.getAttribute('cy') } : null };
      const el = Array.from(anc.children).find(c => ['sp', 'pic', 'cxnSp'].includes(c.localName)); if (!el) return;
      it.kind = el.localName;
      const sp = Array.from(el.children).find(c => c.localName === 'spPr');
      const xf = sp && sp.getElementsByTagName('a:xfrm')[0];
      it.flipH = !!(xf && xf.getAttribute('flipH') === '1'); it.flipV = !!(xf && xf.getAttribute('flipV') === '1');
      const geom = sp && sp.getElementsByTagName('a:prstGeom')[0]; it.geom = geom ? geom.getAttribute('prst') : 'rect';
      const clr = (n) => { if (!n) return null; const x = n.firstElementChild; if (!x) return null; if (x.localName === 'srgbClr') return '#' + x.getAttribute('val'); if (x.localName === 'schemeClr') { const m = { tx1: 1, bg1: 0, tx2: 3, bg2: 2, dk1: 1, lt1: 0, dk2: 3, lt2: 2, accent1: 4, accent2: 5, accent3: 6, accent4: 7, accent5: 8, accent6: 9 }[x.getAttribute('val')]; let h = th[m == null ? 1 : m]; const lm = x.getElementsByTagName('a:lumMod')[0], lo = x.getElementsByTagName('a:lumOff')[0]; if (lm) { const [hh, ss, ll] = hsl(h); h = unhsl(hh, ss, Math.min(1, ll * (+lm.getAttribute('val')) / 100000 + (lo ? +lo.getAttribute('val') / 100000 : 0))); } return '#' + h; } return null; };
      const fill = sp && Array.from(sp.children).find(c => c.localName === 'solidFill'); const noFill = sp && Array.from(sp.children).some(c => c.localName === 'noFill');
      const ln = sp && Array.from(sp.children).find(c => c.localName === 'ln');
      it.fill = fill ? clr(fill) : null;
      it.lnW = ln && ln.getAttribute('w') ? Math.max(1, Math.round(+ln.getAttribute('w') / 9525)) : 1;
      const lf = ln && Array.from(ln.children).find(c => c.localName === 'solidFill'); it.lnC = lf ? clr(lf) : '#000000';
      it.lnNo = !!(ln && Array.from(ln.children).some(c => c.localName === 'noFill'));
      if (it.kind === 'sp' && !it.fill && !noFill) { const st = el.getElementsByTagName('xdr:style')[0]; if (st) { const fr = st.getElementsByTagName('a:fillRef')[0]; if (fr && fr.getAttribute('idx') !== '0') it.fill = clr(fr) || '#ffffff'; } }
      if (it.kind === 'pic') {
        const bl = el.getElementsByTagName('a:blip')[0]; const rid = bl && (bl.getAttribute('r:embed') || bl.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed'));
        const tg = rels[rid]; if (tg) { const path = 'xl/' + tg.replace(/^\.\.\//, ''); const f = zip.file(path); if (f) { const b64 = await f.async('base64'); it.src = 'data:image/' + (/\.jpe?g$/i.test(path) ? 'jpeg' : 'png') + ';base64,' + b64; } }
      }
      if (it.kind === 'sp') {
        const tb = el.getElementsByTagName('xdr:txBody')[0];
        if (tb) {
          const bp = tb.getElementsByTagName('a:bodyPr')[0]; it.anchor = bp && bp.getAttribute('anchor') || 't';
          it.paras = Array.from(tb.getElementsByTagName('a:p')).map(p => {
            const pp = p.getElementsByTagName('a:pPr')[0]; const runs = Array.from(p.getElementsByTagName('a:r')).map(r => { const rp = r.getElementsByTagName('a:rPr')[0]; const t = r.getElementsByTagName('a:t')[0]; const sf = rp && Array.from(rp.children).find(c => c.localName === 'solidFill'); return { t: t ? t.textContent : '', sz: rp && rp.getAttribute('sz') ? +rp.getAttribute('sz') / 100 : 11, b: rp && rp.getAttribute('b') === '1', i: rp && rp.getAttribute('i') === '1', c: sf ? clr(sf) : null }; });
            return { al: pp && pp.getAttribute('algn') || 'l', runs };
          }).filter(p => p.runs.length);
        }
      }
      out.push(it);
    })).then(() => out.filter(Boolean));
  }

  async function hojaHtml(zip, path, nombre, th, xfs, ss, areaDef, opt) {
    const sx = await leer(zip, path); if (!sx) return '';
    const doc = parse(sx);
    const ws = doc.documentElement;
    const fmt = first(ws, 'sheetFormatPr');
    const defW = fmt && +fmt.getAttribute('defaultColWidth') || 8.43, defH = fmt && +fmt.getAttribute('defaultRowHeight') || 15;
    const cols = {}; kids(first(ws, 'cols'), 'col').forEach(c => { for (let i = +c.getAttribute('min'); i <= Math.min(+c.getAttribute('max'), 200); i++) cols[i] = { w: +c.getAttribute('width') || defW, s: c.getAttribute('style') != null ? +c.getAttribute('style') : null, hid: c.getAttribute('hidden') === '1' }; });
    const rows = {}; const cells = {};
    kids(first(ws, 'sheetData'), 'row').forEach(r => {
      const rn = +r.getAttribute('r'); rows[rn] = { h: r.getAttribute('ht') ? +r.getAttribute('ht') : defH, hid: r.getAttribute('hidden') === '1', s: r.getAttribute('s') != null && r.getAttribute('customFormat') === '1' ? +r.getAttribute('s') : null };
      kids(r, 'c').forEach(c => { const [rr, cc] = refPos(c.getAttribute('r')); cells[rr + ',' + cc] = { s: c.getAttribute('s') != null ? +c.getAttribute('s') : 0, txt: celdaTxt(c, ss), t: c.getAttribute('t'), num: !c.getAttribute('t') || c.getAttribute('t') === 'n' }; });
    });
    const merges = {}; const cover = {};
    kids(first(ws, 'mergeCells'), 'mergeCell').forEach(m => { const [a, b] = m.getAttribute('ref').split(':'); const [r1, c1] = refPos(a), [r2, c2] = refPos(b || a); merges[r1 + ',' + c1] = { r1, c1, r2, c2 }; for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) if (r !== r1 || c !== c1) cover[r + ',' + c] = 1; });
    let R1 = 1, C1 = 1, R2 = 0, C2 = 0;
    if (areaDef) { const m = /\$?([A-Z]+)\$?(\d+):\$?([A-Z]+)\$?(\d+)/.exec(areaDef); if (m) { C1 = colNum(m[1]); R1 = +m[2]; C2 = colNum(m[3]); R2 = +m[4]; } }
    if (!R2) { Object.keys(cells).forEach(k => { const [r, c] = k.split(',').map(Number); if (cells[k].txt !== '') { R2 = Math.max(R2, r); C2 = Math.max(C2, c); } }); Object.values(merges).forEach(m => { R2 = Math.max(R2, m.r2); C2 = Math.max(C2, m.c2); }); }
    if (!R2) return '';
    const px = c => Math.round(((cols[c] || { w: defW }).w) * 7);
    const hp = r => (rows[r] ? (rows[r].hid ? 0 : rows[r].h) : defH) * 96 / 72;
    const cx = [0]; for (let c = 1; c <= C2 + 1; c++) cx[c] = cx[c - 1] + ((cols[c] || {}).hid ? 0 : px(c));
    const ry = [0]; for (let r = 1; r <= R2 + 1; r++) ry[r] = ry[r - 1] + hp(r);
    const X = (c, off) => cx[Math.min(c, C2 + 1)] + (off || 0) / 9525, Y = (r, off) => ry[Math.min(r, R2 + 1)] + (off || 0) / 9525;   // c, r base 0 → índice 1-based = c+1; cx[c] = x donde empieza la columna c+1
    const dibs = await dibujo(await leer(zip, (await relDibujo(zip, path)) || ''), await relsDe(zip, await relDibujo(zip, path)), zip, th);
    dibs.forEach(d => { d.x1 = X(d.from.c, d.from.co); d.y1 = Y(d.from.r, d.from.ro); if (d.to) { d.x2 = X(d.to.c, d.to.co); d.y2 = Y(d.to.r, d.to.ro); } else { d.x2 = d.x1 + d.ext.w / 9525; d.y2 = d.y1 + d.ext.h / 9525; } });
    /* cortes de página: columnas donde no cruza ninguna celda combinada ni figura */
    const pageW = opt && opt.pageW || 800;
    const bandas = []; let ini = C1;
    const cruza = c => { for (const m of Object.values(merges)) if (m.r2 >= R1 && m.r1 <= R2 && m.c1 < c && m.c2 >= c) return true; for (const d of dibs) { if (d.x1 < cx[c - 1] - 0.5 && d.x2 > cx[c - 1] + 0.5) return true; } return false; };
    while (ini <= C2) {
      let fin = ini, mejor = -1;
      for (let c = ini; c <= C2; c++) { if (cx[c] - cx[ini - 1] > pageW) break; fin = c; if (c === C2 || !cruza(c + 1)) mejor = c; }
      if (fin === C2 && (mejor === C2 || mejor < 0)) mejor = C2; else if (mejor < ini) mejor = fin;
      bandas.push([ini, mejor]); ini = mejor + 1;
    }
    const xfOf = (r, c) => { const ce = cells[r + ',' + c]; if (ce) return xfs[ce.s] || xfs[0]; if (rows[r] && rows[r].s != null) return xfs[rows[r].s]; const cc = cols[c]; return cc && cc.s != null ? xfs[cc.s] || xfs[0] : xfs[0]; };
    const bordeVacio = x => !x.border.left && !x.border.right && !x.border.top && !x.border.bottom;
    let html = '';
    bandas.forEach(([c1, c2], bi) => {
      const W = cx[c2] - cx[c1 - 1], H = ry[R2] - ry[R1 - 1], ox = cx[c1 - 1], oy = ry[R1 - 1];
      let t = '<table class="x" style="width:' + W + 'px"><colgroup>';
      for (let c = c1; c <= c2; c++) t += '<col style="width:' + ((cols[c] || {}).hid ? 0 : px(c)) + 'px">';
      t += '</colgroup>';
      for (let r = R1; r <= R2; r++) {
        if (rows[r] && rows[r].hid) continue;
        t += '<tr style="height:' + Math.round(hp(r)) + 'px">';
        for (let c = c1; c <= c2; c++) {
          if (cover[r + ',' + c]) continue;
          const m = merges[r + ',' + c];
          let cs = 1, rs = 1;
          if (m) { cs = Math.min(m.c2, c2) - c + 1; rs = m.r2 - r + 1; }
          const xf = xfOf(r, c), ce = cells[r + ',' + c];
          let txt = ce ? (ce.num && ce.txt !== '' ? fmtNum(ce.txt, xf) : ce.txt) : '';
          /* el texto sin ajuste se desborda sobre las celdas vacías contiguas, como en Excel */
          if (!m && ce && txt && !xf.wrap && xf.h !== 'center' && xf.h !== 'right' && !xf.rot) {
            while (c + cs <= c2 && !cells[r + ',' + (c + cs)]?.txt && !merges[r + ',' + (c + cs)] && !cover[r + ',' + (c + cs)] && bordeVacio(xfOf(r, c + cs))) cs++;
            for (let k = 1; k < cs; k++) cover[r + ',' + (c + k)] = 1;
          }
          const f = xf.font || { sz: 11 };
          let st = 'font-size:' + (f.sz * 96 / 72).toFixed(1) + 'px;';
          if (f.b) st += 'font-weight:700;'; if (f.i) st += 'font-style:italic;'; if (f.u) st += 'text-decoration:underline;'; if (f.col) st += 'color:' + f.col + ';';
          if (xf.fill) st += 'background:' + xf.fill + ';';
          const h = xf.h === 'centerContinuous' ? 'center' : xf.h || (ce && ce.num && txt !== '' ? 'right' : 'left');
          st += 'text-align:' + (h === 'fill' || h === 'justify' || h === 'distributed' ? 'left' : h) + ';';
          st += 'vertical-align:' + (xf.v === 'center' ? 'middle' : xf.v === 'top' ? 'top' : 'bottom') + ';';
          const bd0 = xf.border || {}, ec = c + (m ? m.c2 - c : cs - 1), er = r + rs - 1;
          const nb = { left: bd0.left || (xfOf(r, c - 1).border || {}).right, right: bd0.right || (xfOf(r, ec + 1).border || {}).left,
            top: bd0.top || (xfOf(r - 1, c).border || {}).bottom, bottom: bd0.bottom || (xfOf(er + 1, c).border || {}).top };
          const bd = nb;
          ['left', 'right', 'top', 'bottom'].forEach(k => { if (bd[k]) st += 'border-' + k + ':' + bd[k] + ';'; });
          if (xf.ind) st += 'padding-left:' + (xf.ind * 9) + 'px;';
          st += xf.wrap ? 'white-space:pre-wrap;word-break:break-word;' : 'white-space:nowrap;overflow:hidden;';
          let inner = ESC(txt);
          if (xf.rot === 90 || xf.rot === 255) inner = '<span class="rot' + (xf.rot === 255 ? ' up' : '') + '">' + inner + '</span>';
          t += '<td' + (cs > 1 ? ' colspan="' + cs + '"' : '') + (rs > 1 ? ' rowspan="' + rs + '"' : '') + ' style="' + st + '">' + inner + '</td>';
        }
        t += '</tr>';
      }
      t += '</table>';
      /* figuras */
      let sh = '', lines = '';
      dibs.forEach(d => {
        const x1 = d.x1 - ox, y1 = d.y1 - oy, x2 = d.x2 - ox, y2 = d.y2 - oy;
        if (x2 < 0 || x1 > W + 1) return;
        const w = x2 - x1, hh = y2 - y1;
        if (d.kind === 'pic' && d.src) { sh += '<img src="' + d.src + '" style="position:absolute;left:' + x1.toFixed(1) + 'px;top:' + y1.toFixed(1) + 'px;width:' + w.toFixed(1) + 'px;height:' + hh.toFixed(1) + 'px">'; return; }
        if (d.kind === 'cxnSp') {
          const a = d.flipH ? x2 : x1, b = d.flipH ? x1 : x2, c = d.flipV ? y2 : y1, e = d.flipV ? y1 : y2;
          lines += '<line x1="' + a.toFixed(1) + '" y1="' + c.toFixed(1) + '" x2="' + b.toFixed(1) + '" y2="' + e.toFixed(1) + '" stroke="' + d.lnC + '" stroke-width="' + d.lnW + '"/>'; return;
        }
        if (d.kind === 'sp') {
          let s = 'position:absolute;left:' + x1.toFixed(1) + 'px;top:' + y1.toFixed(1) + 'px;width:' + w.toFixed(1) + 'px;height:' + hh.toFixed(1) + 'px;display:flex;flex-direction:column;justify-content:' + (d.anchor === 'ctr' ? 'safe center' : d.anchor === 'b' ? 'flex-end' : 'flex-start') + ';overflow:visible;box-sizing:border-box;';
          if (d.fill) s += 'background:' + d.fill + ';';
          if (!d.lnNo) s += 'border:' + d.lnW + 'px solid ' + d.lnC + ';';
          if (d.geom === 'roundRect') s += 'border-radius:8px;'; if (d.geom === 'ellipse') s += 'border-radius:50%;';
          const ps = (d.paras || []).map(p => '<div style="text-align:' + ({ ctr: 'center', r: 'right', l: 'left', just: 'justify' }[p.al] || 'left') + ';line-height:1.15;font-size:' + (((p.runs[0] || {}).sz || 10) * 96 / 72).toFixed(1) + 'px">' + p.runs.map(r => '<span style="font-size:' + (r.sz * 96 / 72).toFixed(1) + 'px;' + (r.b ? 'font-weight:700;' : '') + (r.i ? 'font-style:italic;' : '') + (r.c ? 'color:' + r.c + ';' : '') + '">' + ESC(r.t) + '</span>').join('') + '</div>').join('');
          sh += '<div style="' + s + '">' + ps + '</div>';
        }
      });
      const SC = Math.min(738 / W, 976 / H);
      html += '<section class="pg" data-n="' + ESC(nombre) + '" style="position:relative;width:' + (W * SC + 4).toFixed(1) + 'px;height:' + (H * SC + 4).toFixed(1) + 'px;overflow:hidden;contain:strict"><div class="band" style="position:absolute;left:2px;top:2px;width:' + W + 'px;height:' + H + 'px;transform:scale(' + SC.toFixed(5) + ');transform-origin:0 0"><div style="position:relative;width:' + W + 'px;height:' + H + 'px">' + t + '<svg class="ln" width="' + W + '" height="' + H + '">' + lines + '</svg>' + sh + '</div></div></section>';
    });
    return html;
  }
  async function relsDe(zip, drawPath) {
    const out = {}; if (!drawPath) return out;
    const r = await leer(zip, drawPath.replace(/([^\/]+)$/, '_rels/$1.rels')); if (!r) return out;
    Array.from(parse(r).getElementsByTagName('Relationship')).forEach(x => { out[x.getAttribute('Id')] = x.getAttribute('Target'); });
    return out;
  }
  async function relDibujo(zip, sheetPath) {
    const r = await leer(zip, sheetPath.replace(/([^\/]+)$/, '_rels/$1.rels')); if (!r) return null;
    const x = Array.from(parse(r).getElementsByTagName('Relationship')).find(e => /drawing$/.test(e.getAttribute('Type')));
    return x ? 'xl/' + x.getAttribute('Target').replace(/^\.\.\//, '') : null;
  }

  /* HTML completo (páginas verticales tamaño carta) a partir del .xlsx del reporte */
  async function xlsxVista(JSZip, u8, opt) {
    opt = opt || {};
    const zip = await JSZip.loadAsync(u8);
    const th = ctx0((await leer(zip, 'xl/theme/theme1.xml')) ? parse(await leer(zip, 'xl/theme/theme1.xml')) : null);
    const xfs = estilos(parse(await leer(zip, 'xl/styles.xml')).documentElement, th);
    const ssx = await leer(zip, 'xl/sharedStrings.xml');
    const ss = ssx ? kids(parse(ssx).documentElement, 'si').map(si => Array.from(si.getElementsByTagName('t')).filter(t => t.parentNode.localName !== 'rPh').map(t => t.textContent).join('')) : [];
    const wb = parse(await leer(zip, 'xl/workbook.xml'));
    const wrels = {}; Array.from(parse(await leer(zip, 'xl/_rels/workbook.xml.rels')).getElementsByTagName('Relationship')).forEach(r => { wrels[r.getAttribute('Id')] = r.getAttribute('Target'); });
    const defs = {}; Array.from(wb.getElementsByTagName('definedName')).forEach(d => { if (d.getAttribute('name') === '_xlnm.Print_Area') defs[d.getAttribute('localSheetId')] = d.textContent; });
    let html = '';
    const sheets = Array.from(wb.getElementsByTagName('sheet'));
    for (let i = 0; i < sheets.length; i++) {
      const nm = sheets[i].getAttribute('name'); if (/^BORRADOR$/i.test(nm) || sheets[i].getAttribute('state') === 'hidden') continue;
      const rid = sheets[i].getAttribute('r:id') || sheets[i].getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
      const tg = wrels[rid]; const path = 'xl/' + tg.replace(/^\/?(xl\/)?/, '');
      html += await hojaHtml(zip, path, nm, th, xfs, ss, defs[i], opt);
    }
    const css = 'html,body{margin:0;background:#e9ecef;font-family:Calibri,Carlito,Arial,sans-serif}.pg{background:#fff;margin:8px auto;box-shadow:0 1px 4px rgba(0,0,0,.25)}svg.fit{width:100%;height:auto;display:block}.band{position:relative;font-family:Calibri,Carlito,Arial,sans-serif;color:#000}table.x{border-collapse:collapse;table-layout:fixed;font-size:14px}table.x td{padding:0 2px;line-height:1.15;overflow:hidden}svg.ln{position:absolute;left:0;top:0;pointer-events:none}.rot{display:inline-block;writing-mode:vertical-rl;transform:rotate(180deg)}.rot.up{transform:none}.mk{font-size:8px;color:#999;text-align:center;padding:2px;font-family:Arial}' + (opt.sinImpresion ? '@media print{body{display:none}}' : '@page{size:21.59cm 27.94cm;margin:1cm}@media print{html,body{background:#fff}.pg{box-shadow:none;margin:0 auto;page-break-after:always;break-after:page}.pg:last-child{page-break-after:auto}.nop{display:none}}');
    return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="author" content="Cristhian Steven Blandón Henao"><title>' + ESC(opt.titulo || 'Reporte de Emergencias') + '</title><style>' + css + '</style></head><body>' + (opt.sinImpresion ? '' : '<button class="nop" style="position:fixed;right:12px;top:12px;z-index:9;padding:10px 16px;font:600 15px Arial;background:#b4251b;color:#fff;border:0;cursor:pointer" onclick="window.print()">Imprimir</button>') + html + '<div class="mk nop">Sistema desarrollado por Cristhian Steven Blandón Henao</div></body></html>';
  }
  g.GEN = g.GEN || {};
  g.GEN.xlsxVista = xlsxVista;
  g.GEN.reporteVista = (JSZip, u8) => xlsxVista(JSZip, u8, { sinImpresion: true });
  g.GEN.reporteImprimible = (JSZip, u8, titulo) => xlsxVista(JSZip, u8, { titulo });
})(typeof window !== 'undefined' ? window : globalThis);

/* V1: constancia de atención (Word) y registro fotográfico (una página por emergencia).
   Extiende GEN. Plantillas originales de la institución. Creado por Cristhian Steven Blandón Henao. */
(function (g) {
  'use strict';
  const GEN = g.GEN;
  const X = s => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const out = zip => zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  const RT = '<w:t xml:space="preserve">';
  const run = (t, o) => { o = o || {}; return '<w:r><w:rPr>' + (o.b ? '<w:b/>' : '') + (o.sz ? '<w:sz w:val="' + o.sz + '"/>' : '') + '</w:rPr>' + RT + X(t) + '</w:t></w:r>'; };

  /* ---------- párrafos con el formato del ejemplo ---------- */
  const P = {
    titulo: t => '<w:p><w:pPr><w:pStyle w:val="Heading1"/><w:spacing w:line="276" w:lineRule="auto" w:before="178"/><w:ind w:left="338" w:right="334"/><w:jc w:val="center"/></w:pPr>' + run(t) + '</w:p>',
    org: t => '<w:p><w:pPr><w:spacing w:before="0"/><w:ind w:left="338" w:right="334" w:firstLine="0"/><w:jc w:val="center"/><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:pPr>' + run(t, { b: 1, sz: 24 }) + '</w:p>',
    vacio: () => '<w:p><w:pPr><w:spacing w:before="0"/></w:pPr></w:p>',
    cuerpo: (t, wm) => '<w:p><w:pPr><w:pStyle w:val="BodyText"/><w:spacing w:line="276" w:lineRule="auto" w:before="120"/><w:ind w:left="338" w:right="334"/><w:jc w:val="both"/></w:pPr>' + (wm || '') + run(t) + '</w:p>',
    h2: t => '<w:p><w:pPr><w:pStyle w:val="Heading2"/><w:keepNext/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr><w:tabs><w:tab w:pos="606" w:val="left" w:leader="none"/></w:tabs><w:spacing w:line="240" w:lineRule="auto" w:before="200" w:after="0"/><w:ind w:left="606" w:right="0" w:hanging="268"/><w:jc w:val="both"/></w:pPr>' + run(t) + '</w:p>',
    sub: t => '<w:p><w:pPr><w:keepNext/><w:spacing w:before="165"/><w:ind w:left="338" w:right="0" w:firstLine="0"/><w:jc w:val="both"/><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:pPr>' + run(t, { b: 1, sz: 24 }) + '</w:p>',
    pun: (lab, val, hb) => '<w:p><w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="1"/><w:numId w:val="1"/></w:numPr><w:tabs><w:tab w:pos="1058" w:val="left" w:leader="none"/></w:tabs><w:spacing w:line="240" w:lineRule="auto" w:before="80" w:after="0"/><w:ind w:left="1058" w:right="334" w:hanging="360"/><w:jc w:val="both"/><w:rPr><w:sz w:val="24"/></w:rPr></w:pPr>' + (lab ? run(lab + ' ', { b: 1, sz: 24 }) : '') + run(val, { sz: 24 }) + '</w:p>',
    firmaN: t => '<w:p><w:pPr><w:pStyle w:val="Heading1"/><w:ind w:left="338"/><w:jc w:val="both"/></w:pPr>' + run(t) + '</w:p>',
    firmaC: t => '<w:p><w:pPr><w:pStyle w:val="BodyText"/><w:spacing w:before="44"/><w:ind w:left="338" w:right="334"/><w:jc w:val="both"/></w:pPr>' + run(t) + '</w:p>',
    anexos: t => '<w:p><w:pPr><w:pStyle w:val="Heading1"/><w:pageBreakBefore/><w:spacing w:before="178"/><w:ind w:right="1635"/></w:pPr>' + run(t || 'ANEXOS') + '</w:p>',
    cap: (n, t) => '<w:p><w:pPr><w:pStyle w:val="BodyText"/><w:keepNext/><w:spacing w:before="47"/><w:ind w:left="338" w:right="334"/><w:jc w:val="center"/></w:pPr>' + run('Figura ' + n + ': ', { b: 1 }) + run(t) + '</w:p>',
    fuente: org => '<w:p><w:pPr><w:pStyle w:val="BodyText"/><w:spacing w:before="44"/><w:ind w:left="1" w:right="1"/><w:jc w:val="center"/></w:pPr>' + run('Fuente: ', { b: 1 }) + run(org + '.') + '</w:p>'
  };
  /* tabla sencilla con bordes (informes técnicos); w: anchos en dxa que suman ~9400 */
  const celda = (t, w, o) => { o = o || {}; return '<w:tc><w:tcPr><w:tcW w:w="' + w + '" w:type="dxa"/>' + (o.sh ? '<w:shd w:val="clear" w:color="auto" w:fill="' + o.sh + '"/>' : '') + '</w:tcPr>' + String(t == null ? '' : t).split('\n').map(l => '<w:p><w:pPr><w:spacing w:before="20" w:after="20" w:line="240" w:lineRule="auto"/><w:jc w:val="' + (o.c ? 'center' : 'left') + '"/></w:pPr>' + run(l, { b: o.b, sz: 18 }) + '</w:p>').join('') + '</w:tc>'; };
  const tbl = (head, rows, w, o) => {
    o = o || {};
    const bd = '<w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="808080"/><w:left w:val="single" w:sz="4" w:space="0" w:color="808080"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="808080"/><w:right w:val="single" w:sz="4" w:space="0" w:color="808080"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="808080"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="808080"/></w:tblBorders>';
    let x = '<w:tbl><w:tblPr><w:tblW w:w="' + w.reduce((a, b) => a + b, 0) + '" w:type="dxa"/><w:jc w:val="center"/>' + bd + '<w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>' + w.map(n => '<w:gridCol w:w="' + n + '"/>').join('') + '</w:tblGrid>';
    if (head) x += '<w:tr><w:trPr><w:cantSplit/><w:tblHeader/></w:trPr>' + head.map((h, i) => celda(h, w[i], { b: 1, sh: 'E7E6E6', c: 1 })).join('') + '</w:tr>';
    rows.forEach(r => { x += '<w:tr><w:trPr><w:cantSplit/><w:trHeight w:val="' + (o.alto || 0) + '"/></w:trPr>' + r.map((c, i) => celda(c, w[i], { b: o.b1 && i === 0, c: o.ctr && o.ctr.indexOf(i) >= 0 })).join('') + '</w:tr>'; });
    return x + '</w:tbl><w:p><w:pPr><w:spacing w:before="0" w:after="60"/></w:pPr></w:p>';
  };
  /* mantiene el párrafo unido al siguiente y sin cortarse entre páginas (para que la firma no quede sola) */
  const keep = p => {
    if (/<w:keepLines\/>/.test(p)) return p;
    if (/<w:keepNext\/>/.test(p)) return p.replace('<w:keepNext/>', '<w:keepNext/><w:keepLines/>');
    if (/<w:pStyle [^>]*\/>/.test(p)) return p.replace(/(<w:pStyle [^>]*\/>)/, '$1<w:keepNext/><w:keepLines/>');
    return p.replace('<w:pPr>', '<w:pPr><w:keepNext/><w:keepLines/>');
  };
  const marcoFoto = inner => '<w:tbl><w:tblPr><w:tblW w:w="7200" w:type="dxa"/><w:jc w:val="center"/><w:tblBorders><w:top w:val="single" w:sz="6" w:space="0" w:color="808080"/><w:left w:val="single" w:sz="6" w:space="0" w:color="808080"/><w:bottom w:val="single" w:sz="6" w:space="0" w:color="808080"/><w:right w:val="single" w:sz="6" w:space="0" w:color="808080"/></w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid><w:gridCol w:w="7200"/></w:tblGrid><w:tr><w:trPr><w:cantSplit/><w:trHeight w:val="4800" w:hRule="exact"/></w:trPr><w:tc><w:tcPr><w:tcW w:w="7200" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:keepNext/><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr>' + inner + '</w:p></w:tc></w:tr></w:tbl>';
  const wmDe = (xml, id) => { // marca de agua del ejemplo (primer dibujo anclado del cuerpo)
    const m = xml.match(/<w:r><w:rPr\/>(<w:drawing><wp:anchor[\s\S]*?<\/w:drawing>)<\/w:r>/);
    return m ? '<w:r><w:rPr/>' + m[1].replace(/(<wp:docPr id=")\d+/, '$1' + id).replace(/(<pic:cNvPr id=")\d+/, '$1' + (id + 1)) + '</w:r>' : '';
  };
  const imgRun = (rid, W, H, id, nombre) => '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="' + W + '" cy="' + H + '"/><wp:docPr id="' + id + '" name="' + X(nombre) + '"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="' + id + '" name="' + X(nombre) + '"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="' + rid + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + W + '" cy="' + H + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';

  /* d: ver constanciaDatos() en estadistica. Devuelve Uint8Array (.docx) */
  async function constancia(JSZip, tpl, d) {
    const zip = await JSZip.loadAsync(tpl);
    let doc = await zip.file('word/document.xml').async('string');
    const b0 = doc.indexOf('<w:body>') + 8, b1 = doc.lastIndexOf('</w:body>');
    const sect = doc.slice(doc.indexOf('<w:sectPr'), doc.indexOf('</w:sectPr>') + 11).replace(/<w:type w:val="continuous"\/>/, '').replace(/<w:pgNumType[^>]*\/>/, '');
    const wm0 = '';
    const wmHdr = wmDe(doc.slice(b0), 9001).replace('r:embed="rId7"', 'r:embed="rIdWM"').replace(/<wp:positionV relativeFrom="paragraph"><wp:posOffset>\d+/, '<wp:positionV relativeFrom="page"><wp:posOffset>2600000');
    const org = d.org || 'CUERPO DE BOMBEROS VOLUNTARIOS DE LA UNIÓN, VALLE DEL CAUCA';
    const ciudad = d.ciudad || 'La Unión, Valle del Cauca';
    const b = [];
    if (d.secs) {
      /* informe técnico: título, institución y secciones numeradas armadas por la central */
      b.push(P.titulo(d.titulo));
      b.push(P.org(org.toUpperCase()));
      b.push(P.cuerpo('Informe No. ' + d.num + ' · ' + (d.fechaTxt || '')));
      d.secs.forEach(sc => {
        b.push(P.h2(sc.t));
        (sc.items || []).forEach(it => {
          if (it.k === 'p') b.push(P.cuerpo(it.t));
          else if (it.k === 'bul') it.list.forEach(t => b.push(P.pun('', t)));
          else if (it.k === 'kv') it.rows.forEach(x => b.push(P.pun(x[0] + ':', x[1])));
          else if (it.k === 'tbl') b.push(tbl(it.head, it.rows, it.w, it.o));
        });
      });
    } else {
    b.push(P.titulo('CONSTANCIA DE ATENCIÓN DE INCIDENTE ' + d.num));
    b.push(P.org(org.toUpperCase()));
    b.push(P.vacio());
    b.push(P.cuerpo('El ' + (d.orgNombre || 'Cuerpo de Bomberos Voluntarios de La Unión, Valle del Cauca') + ', en cumplimiento de sus funciones misionales establecidas en la Ley 1575 de 2012, deja constancia de la atención del incidente descrito a continuación.', wm0));
    b.push(P.cuerpo('La presente certificación se expide exclusivamente con fines informativos y administrativos, con base en los registros operativos oficiales del servicio.'));
    const sec = (t, f) => { b.push(P.h2(t)); f(); };
    sec('Información del incidente', () => (d.info || []).forEach(x => b.push(P.pun(x[0] + ':', x[1]))));
    sec('Descripción del hecho', () => (d.desc || []).forEach(t => b.push(P.cuerpo(t))));
    if ((d.crono || []).length) sec('Cronología de atención', () => {
      let dia = null;
      d.crono.forEach(c => { if (c.dia && c.dia !== dia) { dia = c.dia; b.push(P.sub(c.dia)); } b.push(P.pun('', '').replace(run('', { sz: 24 }), run(c[0], { b: 1, sz: 24 }) + run(' – ' + c[1], { sz: 24 }))); });
    });
    if ((d.predio || []).length) sec('Datos del predio afectado', () => d.predio.forEach(x => b.push(P.pun(x[0] + ':', x[1]))));
    if ((d.amen || []).length) sec('Amenazas y riesgos identificados', () => d.amen.forEach(t => b.push(P.pun('', t))));
    if ((d.obj || []).length) sec('Objetivos de la intervención', () => d.obj.forEach(t => b.push(P.pun('', t))));
    if (d.previas) sec('Intervenciones previas a la llegada de Bomberos', () => b.push(P.cuerpo(d.previas)));
    sec('Unidades y personal que atendieron', () => (d.unidades || []).forEach(x => b.push(P.pun('', x))));
    b.push(P.cuerpo('La presente constancia se expide con fundamento en los registros oficiales del servicio. La información corresponde a lo observado y registrado por el personal que atendió el incidente; no constituye dictamen técnico pericial ni reemplaza los informes emitidos por otras autoridades competentes.'));
    if ((d.recomend || []).length) sec('Recomendaciones', () => d.recomend.forEach(t => b.push(P.pun('', t))));
    if ((d.fotos || []).length) b.push(P.cuerpo('Se anexan registros fotográficos como evidencia documental de la atención prestada.'));
    }
    /* bloque de firma: el último párrafo del texto, la fecha de expedición, el espacio, el nombre y el cargo van siempre en la misma página */
    if (b.length) b[b.length - 1] = keep(b[b.length - 1]);
    b.push(keep(P.cuerpo(d.expide)));
    b.push(keep('<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:br/></w:r><w:r><w:br/></w:r><w:r><w:br/></w:r></w:p>'));
    b.push(keep(P.firmaN(String(d.firma && d.firma.nombre || '').toUpperCase())));
    b.push(keep(P.firmaC((d.firma && d.firma.cargo) || 'Comandante / Representante Legal')));
    b.push(P.firmaC(ciudad));
    let rels = await zip.file('word/_rels/document.xml.rels').async('string');
    let ct = await zip.file('[Content_Types].xml').async('string');
    if ((d.fotos || []).length) {
      b.push(P.anexos(d.anexosTit));
      let id = 9100;
      d.fotos.forEach((f, i) => {
        const nm = 'media/anexo' + (i + 1) + '.jpeg', rid = 'rIdAnexo' + (i + 1);
        zip.file('word/' + nm, f.data);
        rels = rels.replace('</Relationships>', '<Relationship Id="' + rid + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="' + nm + '"/></Relationships>');
        const maxW = 4500000, maxH = 2900000, sc = Math.min(maxW / f.w, maxH / f.h), W = Math.round(f.w * sc), H = Math.round(f.h * sc);
        b.push('<w:p><w:pPr><w:keepNext/><w:spacing w:before="120" w:after="0" w:line="120" w:lineRule="exact"/></w:pPr></w:p>');
        b.push(marcoFoto(imgRun(rid, W, H, id++, 'Anexo ' + (i + 1))));
        b.push(P.cap(i + 1, f.desc || (d.tituloFoto || 'Atención del incidente')));
        b.push(P.fuente(d.orgNombre || org));
        if (i % 2 === 1 && i < d.fotos.length - 1) b.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
      });
    }
    if (!/Extension="jpeg"/i.test(ct)) ct = ct.replace('<Types ', '<Types ').replace(/(<Types[^>]*>)/, '$1<Default Extension="jpeg" ContentType="image/jpeg"/>');
    zip.file('[Content_Types].xml', ct);
    zip.file('word/_rels/document.xml.rels', rels);
    doc = doc.slice(0, b0) + b.join('') + sect + doc.slice(b1);
    zip.file('word/document.xml', doc);
    // membrete: NIT y nombre de la institución (marca blanca)
    let hd = await zip.file('word/header1.xml').async('string');
    if (d.nit) hd = hd.replace(/<w:t>891\.900\.288-<\/w:t><\/w:r><w:r><w:rPr><w:spacing w:val="-10"\/><\/w:rPr><w:t>9<\/w:t>/g, '<w:t>' + X(d.nit) + '</w:t>');
    if (d.orgHeader) hd = hd.replace(/<w:t>Voluntarios La Unión, Valle del Cauca<\/w:t>/g, '<w:t>' + X(d.orgHeader) + '</w:t>');
    if (wmHdr) {
      hd = hd.replace(/<\/w:p>\s*<\/w:hdr>\s*$/, () => wmHdr + '</w:p></w:hdr>');
      let hr = await zip.file('word/_rels/header1.xml.rels').async('string');
      hr = hr.replace('</Relationships>', '<Relationship Id="rIdWM" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image3.jpeg"/></Relationships>');
      zip.file('word/_rels/header1.xml.rels', hr);
    }
    zip.file('word/header1.xml', hd);
    if (d.direccion || d.telefono || d.correo) {
      let ft = await zip.file('word/footer1.xml').async('string'), k = 0;
      ft = ft.replace(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g, (mm, t) => {
        const i = k++ % 31; let nv = t;
        if (d.direccion) { if (i === 0) nv = d.direccion; else if (i >= 1 && i <= 12) nv = ''; }
        if (d.telefono && i === 16) nv = d.telefono + ' E-mail:';
        if (d.correo && i === 18) nv = d.correo;
        return nv === t ? mm : '<w:t xml:space="preserve">' + X(nv) + '</w:t>';
      });
      zip.file('word/footer1.xml', ft);
    }
    // quitar las imágenes de ejemplo que ya no se usan
    ['image4.png', 'image5.jpeg', 'image6.png', 'image7.jpeg', 'image8.png'].forEach(n => zip.remove('word/media/' + n));
    rels = rels.replace(/<Relationship [^>]*Target="media\/image[4-8]\.[a-z]+"\/>/g, '');
    zip.file('word/_rels/document.xml.rels', rels);
    if (d.autor) { try { let cp = await zip.file('docProps/core.xml').async('string'); cp = cp.replace(/<dc:creator>[\s\S]*?<\/dc:creator>/, '<dc:creator>' + X(d.autor) + '</dc:creator>'); zip.file('docProps/core.xml', cp); } catch (e) { /* ok */ } }
    return out(zip);
  }

  /* ---------- registro fotográfico: una página por emergencia (3 fotos), páginas extra solo si hay más de 3 ---------- */
  async function fotograficoMulti(JSZip, tpl, items) {
    // items: [{titulo, fotos:[{data,w,h,desc}]}]
    const zip = await JSZip.loadAsync(tpl);
    const d = await zip.file('word/document.xml').async('string');
    const b0 = d.indexOf('<w:body>') + 8, b1 = d.lastIndexOf('</w:body>');
    const body = d.slice(b0, b1);
    const tok = /<(\/?)w:(tbl|p|sectPr)\b([^>]*?)(\/?)>/g;
    const its = []; const stack = []; let start = 0, m;
    while ((m = tok.exec(body))) {
      const [, close, name, , selfc] = m;
      if (!close && !selfc) { if (!stack.length) start = m.index; stack.push(name); }
      else if (close) { stack.pop(); if (!stack.length) its.push({ name, s: start, e: m.index + m[0].length }); }
      else if (selfc && !stack.length) its.push({ name, s: m.index, e: m.index + m[0].length });
    }
    const sect = its.find(i => i.name === 'sectPr');
    const tbl = its.map((it, i) => it.name === 'tbl' ? i : -1).filter(i => i >= 0);
    const grp0 = its.slice(tbl[0], tbl[1]).map(it => body.slice(it.s, it.e)).join('');
    const pages = [];
    items.forEach(it => {
      const fs = it.fotos || [];
      const n = Math.max(1, Math.ceil(fs.length / 3));
      for (let p = 0; p < n; p++) pages.push({ titulo: it.titulo + (p ? ' (continuación)' : ''), fotos: fs.slice(p * 3, p * 3 + 3) });
    });
    let rels = await zip.file('word/_rels/document.xml.rels').async('string');
    const boxes = [[4940300, 2802467], [2362200, 2726055], [2324100, 2726266]];
    let docId = 7000, fi = 0, pid = 0;
    const html = pages.map((pg, k) => {
      let seg = grp0;
      if (k === pages.length - 1) seg = seg.replace(/<w:br w:type="page"\/>/g, '');
      seg = seg.replace(/ w14:(paraId|textId)="[^"]*"/g, '');
      seg = seg.replace(/(<wp:docPr id=")\d+/g, () => '<wp:docPr id="' + (docId++)).replace(/(<wps:cNvPr id=")\d+/g, () => '<wps:cNvPr id="' + (docId++)).replace(/(<pic:cNvPr id=")\d+/g, () => '<pic:cNvPr id="' + (docId++));
      seg = seg.replace(/(<v:[a-z]+ [^>]*?\bid=")([^"]+)"/g, (mm, a, id) => a + id + '_p' + k + '"');
      seg = seg.replace(/<w:bookmarkStart[^>]*\/>|<w:bookmarkEnd[^>]*\/>/g, '');
      // título en cada página
      let hecho = false;
      seg = seg.replace(/<w:p\b(?:(?!<\/w:p>)[\s\S])*?REGISTRO(?:(?!<\/w:p>)[\s\S])*?<\/w:p>/, pm => {
        hecho = true;
        const ppr = (pm.match(/<w:pPr>[\s\S]*?<\/w:pPr>/) || [''])[0];
        const rpr = (pm.match(/<w:r\b[^>]*>(<w:rPr>[\s\S]*?<\/w:rPr>)/) || ['', ''])[1];
        return '<w:p>' + ppr + '<w:r>' + rpr + RT + X(pg.titulo) + '</w:t></w:r></w:p>';
      });
      let bi = 0;
      seg = seg.replace(/<mc:Choice Requires="wps">[\s\S]*?<\/mc:Choice>/g, ch => ch.replace(/<w:txbxContent>[\s\S]*?<\/w:txbxContent>/, () => {
        const box = boxes[bi % 3], f = pg.fotos[bi]; bi++;
        if (!f) return '<w:txbxContent><w:p/></w:txbxContent>';
        const idx = fi++, name = 'media/foto' + (idx + 1) + '.jpeg', rid = 'rIdFoto' + (idx + 1);
        zip.file('word/' + name, f.data);
        rels = rels.replace('</Relationships>', '<Relationship Id="' + rid + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="' + name + '"/></Relationships>');
        const maxW = box[0] - 182880, maxH = box[1] - 91440 - 40000, sc = Math.min(maxW / f.w, maxH / f.h), W = Math.round(f.w * sc), H = Math.round(f.h * sc), cap = X(f.desc || '');
        return '<w:txbxContent><w:p><w:pPr><w:spacing w:after="0"/><w:jc w:val="center"/></w:pPr>' + imgRun(rid, W, H, docId++, 'Foto ' + (idx + 1)).replace('<wp:docPr ', '<wp:docPr descr="' + cap + '" ') + '</w:p></w:txbxContent>';
      }));
      // la rama antigua (Fallback) queda sin fotos para no duplicar contenido
      seg = seg.replace(/<mc:Fallback>[\s\S]*?<\/mc:Fallback>/g, '');
      return seg;
    }).join('');
    zip.file('word/_rels/document.xml.rels', rels);
    let ct = await zip.file('[Content_Types].xml').async('string');
    if (!/Extension="jpeg"/i.test(ct)) ct = ct.replace(/(<Types[^>]*>)/, '$1<Default Extension="jpeg" ContentType="image/jpeg"/>');
    zip.file('[Content_Types].xml', ct);
    zip.file('word/document.xml', d.slice(0, b0) + html + '<w:p/>' + body.slice(sect.s, sect.e) + d.slice(b1));
    return out(zip);
  }
  g.GEN.constancia = constancia;
  g.GEN.fotograficoMulti = fotograficoMulti;
  g.GEN.fotografico = (JSZip, tpl, o) => fotograficoMulti(JSZip, tpl, [{ titulo: o.titulo, fotos: o.fotos }]);
})(typeof window !== 'undefined' ? window : globalThis);

/* V2: estadística institucional. Actualiza EL MISMO libro Excel de la institución (hojas, fórmulas, gráficos y estilos intactos):
   agrega a la hoja del año los registros del sistema que todavía no estén (sin duplicar), dentro del bloque de su mes,
   y reajusta los rangos de las fórmulas mensuales. Edición a nivel XML para no perder los gráficos.
   Creado por Cristhian Steven Blandón Henao. */
(function (g) {
  'use strict';
  const GEN = g.GEN;
  const MESES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
  const X = s => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const UP = s => String(s == null ? '' : s).trim().toUpperCase();
  const norm = s => UP(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]/g, '');
  const unX = s => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  const serial = f => { const m = String(f || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(1899, 11, 30)) / 86400000) : null; };
  const mesDeSerial = n => new Date(Date.UTC(1899, 11, 30) + n * 86400000).getUTCMonth();
  const colN = c => c.split('').reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0);

  function leerCompartidas(xml) {
    const out = [];
    (xml.match(/<si>[\s\S]*?<\/si>|<si\/>/g) || []).forEach(si => out.push(unX((si.match(/<t[^>]*>([^<]*)<\/t>/g) || []).map(t => t.replace(/<[^>]+>/g, '')).join(''))));
    return out;
  }
  function parseFilas(sd) {
    const out = [];
    const re = /<row r="(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g; let m;
    while ((m = re.exec(sd))) {
      const cells = {}, body = m[3] || '';
      const rc = /<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g; let c;
      while ((c = rc.exec(body))) cells[c[1]] = { attr: c[2], inner: c[3] || '', s: (c[2].match(/ s="(\d+)"/) || [])[1] };
      out.push({ r: +m[1], attr: m[2], cells, xml: m[0] });
    }
    return out;
  }
  const valCelda = (cell, ss) => {
    if (!cell) return '';
    const v = (cell.inner.match(/<v>([^<]*)<\/v>/) || [])[1];
    if (/ t="s"/.test(cell.attr)) return v == null ? '' : (ss[+v] || '');
    if (/ t="inlineStr"/.test(cell.attr)) return unX((cell.inner.match(/<t[^>]*>([^<]*)<\/t>/) || [])[1] || '');
    if (/ t="str"/.test(cell.attr)) return unX(v || '');
    return v == null ? '' : v;
  };
  const renum = (xml, n) => xml.replace(/ r="([A-Z]*)\d+"/g, (m, c) => ' r="' + c + n + '"');
  const txtCell = (col, n, s, t) => '<c r="' + col + n + '"' + (s ? ' s="' + s + '"' : '') + ' t="inlineStr"><is><t xml:space="preserve">' + X(t) + '</t></is></c>';
  const numCell = (col, n, s, v) => '<c r="' + col + n + '"' + (s ? ' s="' + s + '"' : '') + '><v>' + v + '</v></c>';
  const vacCell = (col, n, s) => '<c r="' + col + n + '"' + (s ? ' s="' + s + '"' : '') + '/>';

  /** opts: {anio, rows:[{cat,tipo,fecha,dir,bar,desc,area,uni,veh,lat,lon,durmin}]}  → {bytes, agregados, duplicados, sinFila[], hoja} */
  async function estadisticaInst(JSZip, tpl, opts) {
    const zip = await JSZip.loadAsync(tpl);
    const wb = await zip.file('xl/workbook.xml').async('string');
    const rels = await zip.file('xl/_rels/workbook.xml.rels').async('string');
    const hojas = {}; (wb.match(/<sheet [^>]*\/>/g) || []).forEach(s => { const n = unX((s.match(/name="([^"]*)"/) || [])[1]), id = (s.match(/r:id="([^"]*)"/) || [])[1]; const t = (rels.match(new RegExp('<Relationship [^>]*Id="' + id + '"[^>]*Target="([^"]*)"')) || rels.match(new RegExp('<Relationship [^>]*Target="([^"]*)"[^>]*Id="' + id + '"')) || [])[1]; hojas[n] = 'xl/' + t; });
    const anio = String(opts.anio), pathAnio = hojas[anio], pathDet = hojas['DETALLADO X MES ' + (Object.keys(hojas).filter(k => /^\d{4}$/.test(k)).sort().pop())] || hojas[Object.keys(hojas).find(k => /^DETALLADO/.test(k))], pathCon = hojas[Object.keys(hojas).find(k => /^CONSOLIDADO A.O \d{4}$/.test(k))];
    if (!pathAnio) throw new Error('El libro institucional no tiene una hoja llamada «' + anio + '». Agréguela (copiando la del año anterior) y vuelva a generar.');
    const ss = leerCompartidas(await zip.file('xl/sharedStrings.xml').async('string'));
    const oficiales = new Set();
    if (pathCon) { const cx = parseFilas(await zip.file(pathCon).async('string')); cx.filter(r => r.r >= 3 && r.r <= 25).forEach(r => { const v = valCelda(r.cells.A, ss); if (v) oficiales.add(norm(v)); }); }

    let sx = await zip.file(pathAnio).async('string');
    const a0 = sx.indexOf('<sheetData>') + 11, a1 = sx.indexOf('</sheetData>');
    const filas = parseFilas(sx.slice(a0, a1));
    const pre = filas.filter(r => r.r < 3);
    let i = filas.findIndex(r => r.r >= 3);
    const bloques = []; let total = null; const post = [];
    for (; i >= 0 && i < filas.length; i++) {
      const f = filas[i], a = valCelda(f.cells.A, ss), b = valCelda(f.cells.B, ss);
      if (/^TOTAL/i.test(a)) { total = f; continue; }
      if (total) { post.push(f); continue; }
      const mi = MESES.indexOf(UP(a));
      if (mi >= 0 && !b) { bloques.push({ mes: mi, hdr: f, datos: [] }); continue; }
      if (!bloques.length) { pre.push(f); continue; }
      f.fecha = +valCelda(f.cells.D, ss) || 0; f.cat = valCelda(f.cells.B, ss); f.dir = valCelda(f.cells.F, ss);
      bloques[bloques.length - 1].datos.push(f);
    }
    const c2 = (pre.find(r => r.r === 2) || { cells: {} }).cells.C; const refCat = c2 ? valCelda(c2, ss) : '';
    /* duplicados: misma fecha + categoría + inicio de la dirección */
    const clave = (n, cat, dir) => n + '|' + norm(cat) + '|' + norm(dir).slice(0, 14);
    const vistos = new Set(); bloques.forEach(b => b.datos.forEach(f => vistos.add(clave(f.fecha, f.cat, f.dir))));
    const nuevos = [], dup = [], sinFila = [], otroAnio = [];
    (opts.rows || []).slice().sort((p, q) => String(p.fecha).localeCompare(String(q.fecha))).forEach(r => {
      const n = serial(r.fecha); if (n == null) return;
      if (String(r.fecha).slice(0, 4) !== anio) { otroAnio.push(r); return; }
      if (r.anulado) return;
      if (oficiales.size && !oficiales.has(norm(r.cat))) { sinFila.push(r); return; }
      const k = clave(n, r.cat, r.dir);
      if (vistos.has(k)) { dup.push(r); return; }
      vistos.add(k); nuevos.push({ r, n });
    });
    const altStyles = (b, idx) => (b.datos.length >= 2 ? b.datos[b.datos.length >= 2 && idx % 2 ? b.datos.length - 1 : b.datos.length - 2] : b.datos[0]);
    let creados = 0;
    nuevos.forEach(({ r, n }) => {
      const mes = mesDeSerial(n);
      let bl = bloques.find(b => b.mes === mes);
      if (!bl) {
        const ref = bloques[bloques.length - 1];
        bl = { mes, hdr: { r: 0, attr: ref.hdr.attr, cells: ref.hdr.cells, xml: ref.hdr.xml, nuevo: true }, datos: [] };
        let pos = bloques.findIndex(b => b.mes > mes); if (pos < 0) pos = bloques.length; bloques.splice(pos, 0, bl);
      }
      let pos = bl.datos.length; for (let k = 0; k < bl.datos.length; k++) if (bl.datos[k].fecha > n) { pos = k; break; }
      const donante = (() => { let ds = bl.datos.filter(d => d.cells); if (!ds.length) ds = (bloques.filter(x => x !== bl).map(x => x.datos.filter(d => d.cells)).find(l => l.length) || []); if (!ds.length) return null; return ds[(pos % 2 === 0 ? 0 : 1) % ds.length] || ds[0]; })();
      bl.datos.splice(pos, 0, { r: 0, nuevoReg: { r, n }, donante, fecha: n, cat: r.cat, dir: r.dir });
      creados++;
    });
    /* reconstrucción de las filas */
    let n = 3; const salida = []; const merges = []; const rangos = {}; const mapaViejo = {};
    const durTxt = m => GEN.durTxt ? GEN.durTxt(m) : (m ? m + ' MINUTOS' : '');
    bloques.forEach(b => {
      const hdrN = n++;
      salida.push(b.hdr.nuevo ? ('<row r="' + hdrN + '"' + b.hdr.attr + '>' + Object.keys(b.hdr.cells).map(c => c === 'A' ? txtCell('A', hdrN, b.hdr.cells.A.s, MESES[b.mes]) : vacCell(c, hdrN, b.hdr.cells[c].s)).join('') + '</row>') : renum(b.hdr.xml, hdrN));
      if (!b.hdr.nuevo) mapaViejo[b.hdr.r] = hdrN;
      const ini = n, fin = n + b.datos.length - 1;
      const cPrimera = (b.datos.find(d => !d.nuevoReg) || { cells: {} }).cells.C;
      const cResto = ((b.datos.filter(d => !d.nuevoReg)[1]) || { cells: {} }).cells.C;
      const sPrim = (cPrimera && cPrimera.s) || '576', sResto = (cResto && cResto.s) || sPrim;
      b.datos.forEach((d, k) => {
        const rn = n++;
        if (d.nuevoReg) {
          const { r } = d.nuevoReg, dn = d.donante, st = col => dn && dn.cells[col] ? dn.cells[col].s : undefined;
          const lugar = UP(r.dir) || '.', bar = UP(r.bar) || '.';
          const coord = (r.lat !== '' && r.lat != null && r.lon !== '' && r.lon != null && isFinite(+r.lat)) ? (+r.lat).toFixed(6) + ', ' + (+r.lon).toFixed(6) : '.';
          const aPart = UP(r.area); const area = !aPart || aPart === 'N/A' ? '.' : aPart;
          const cel = [txtCell('A', rn, st('A'), UP(r.tipo)), txtCell('B', rn, st('B'), UP(r.cat)), k === 0 ? vacCell('C', rn, sPrim) : vacCell('C', rn, sResto), numCell('D', rn, st('D'), d.nuevoReg.n),
            txtCell('E', rn, st('E'), UP(r.dur_txt || durTxt(r.durmin))), txtCell('F', rn, st('F'), lugar), txtCell('G', rn, st('G'), bar), txtCell('H', rn, st('H'), UP(r.desc) || '.'), txtCell('I', rn, st('I'), area),
            r.uni !== '' && r.uni != null && isFinite(+r.uni) ? numCell('J', rn, st('J'), +r.uni) : txtCell('J', rn, st('J'), '.'), txtCell('K', rn, st('K'), UP(r.veh) || '.'), txtCell('L', rn, st('L'), coord)];
          const hAlto = GEN.altoFila ? GEN.altoFila([[UP(r.cat), 62], [lugar, 38], [bar, 22], [UP(r.desc), 62], [UP(r.veh), 17]]) : 15.8;
          const attrFila = dn ? dn.attr.replace(/ ht="[^"]*"/, '').replace(/ customHeight="[^"]*"/, '') + ' ht="' + hAlto + '" customHeight="1"' : ' spans="1:12" ht="' + hAlto + '" customHeight="1"';
          salida.push('<row r="' + rn + '"' + attrFila + '>' + cel.join('') + '</row>');
        } else {
          mapaViejo[d.r] = rn;
          let x = renum(d.xml, rn);
          x = x.replace(/<c r="C\d+"[^>]*?(?:\/>|>[\s\S]*?<\/c>)/, '<c r="C' + rn + '" s="' + (k === 0 ? sPrim : sResto) + '"/>');
          salida.push(x);
        }
      });
      if (b.datos.length) {
        const cnt = b.datos.filter(d => norm(d.cat || (d.nuevoReg && d.nuevoReg.r.cat)) === norm(refCat)).length;
        const primero = salida.length - b.datos.length;
        salida[primero] = salida[primero].replace(/<c r="C(\d+)" s="(\d+)"\/>/, '<c r="C$1" s="$2"><f>COUNTIF(B' + ini + ':B' + fin + ',C2)</f><v>' + cnt + '</v></c>');
        if (fin > ini) merges.push('C' + ini + ':C' + fin);
        rangos[b.mes] = [ini, fin];
      }
    });
    const ultimo = n - 1;
    let totalXml = '';
    if (total) {
      const tn = n++, old = total.r; mapaViejo[old] = tn;
      let x = renum(total.xml, tn).replace(/<f>COUNTA\(B\d+:B\d+\)<\/f><v>[^<]*<\/v>/, '<f>COUNTA(B4:B' + ultimo + ')</f><v>' + (ultimo - 3 - bloques.length + bloques.length) + '</v>').replace(/<f>SUM\(C\d+:C\d+\)<\/f><v>[^<]*<\/v>/, '<f>SUM(C4:C' + ultimo + ')</f><v>0</v>');
      totalXml = x;
    }
    const postXml = post.map(p => { const nn = n++; return renum(p.xml, nn); });
    const todo = pre.map(p => p.xml).join('') + salida.join('') + totalXml + postXml.join('');
    let nuevo = sx.slice(0, a0) + todo + sx.slice(a1);
    const hasta = n - 1;
    nuevo = nuevo.replace(/<dimension ref="[^"]*"\/>/, '<dimension ref="A1:L' + hasta + '"/>');
    const fijas = (nuevo.match(/<mergeCell ref="[A-Z]+[12]:[A-Z]+[12]"\/>/g) || []);
    nuevo = nuevo.replace(/<mergeCells[\s\S]*?<\/mergeCells>/, '<mergeCells count="' + (fijas.length + merges.length) + '">' + fijas.join('') + merges.map(m => '<mergeCell ref="' + m + '"/>').join('') + '</mergeCells>');
    const mp = r => mapaViejo[r] || (r > 3 ? (r >= (total ? total.r : 1e9) ? mapaViejo[total.r] : ultimo) : r);
    nuevo = nuevo.replace(/(<conditionalFormatting sqref=")([^"]*)"/g, (m0, a, b) => a + b.split(' ').map(t => t.replace(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/, (m1, c1, r1, c2_, r2) => c2_ ? (+r2 >= 1048576 ? c1 + mp(+r1 > 559 ? hasta + 1 : +r1) + ':' + c2_ + r2 : c1 + mp(+r1) + ':' + c2_ + mp(+r2)) : c1 + mp(+r1))).join(' ') + '"');
    nuevo = nuevo.replace(/<pane [^>]*\/>/, '<pane ySplit="2" topLeftCell="A3" activePane="bottomLeft" state="frozen"/>').replace(/<selection pane="bottomLeft"[^>]*\/>/, '<selection pane="bottomLeft" activeCell="A3" sqref="A3"/>');
    zip.file(pathAnio, nuevo);

    /* fórmulas mensuales del libro (hoja DETALLADO): SUM('año'!C a:C b) */
    if (pathDet) {
      let dx = await zip.file(pathDet).async('string');
      const fe = new RegExp("<c r=\"([A-Z]+)(\\d+)\"([^>]*)>(?:<f>SUM\\('" + anio + "'!C\\d+:C\\d+\\)</f>(?:<v>[^<]*</v>)?)</c>", 'g');
      const filasDet = []; let mm; while ((mm = fe.exec(dx))) filasDet.push(+mm[2]);
      const fila = filasDet.length ? filasDet[0] : null;
      if (fila) {
        const rowRe = new RegExp('(<row r="' + fila + '"[^>]*>)([\\s\\S]*?)(</row>)');
        dx = dx.replace(rowRe, (m0, a, body, c) => {
          for (let mes = 0; mes < 12; mes++) {
            const col = String.fromCharCode(66 + mes), rg = rangos[mes];
            const cr = new RegExp('<c r="' + col + fila + '"([^>]*?)(?:/>|>[\\s\\S]*?</c>)');
            const st = (body.match(cr) || [])[1];
            if (st == null) continue;
            const s = (st.match(/ s="(\d+)"/) || [])[1];
            const sum = rg ? (() => { let t = 0; const b = bloques.find(x => x.mes === mes); b.datos.forEach(d => { if (norm(d.cat || (d.nuevoReg && d.nuevoReg.r.cat)) === norm(refCat)) t++; }); return t; })() : 0;
            body = body.replace(cr, '<c r="' + col + fila + '"' + (s ? ' s="' + s + '"' : '') + (rg ? '><f>SUM(\'' + anio + '\'!C' + rg[0] + ':C' + rg[1] + ')</f><v>' + sum + '</v></c>' : '/>'));
          }
          return a + body + c;
        });
        zip.file(pathDet, dx);
      }
    }
    /* recálculo al abrir; se retira la cadena de cálculo (Excel la reconstruye) */
    let wbx = wb.replace(/<calcPr[^>]*\/>/, '<calcPr calcId="191029" iterateDelta="1E-4" fullCalcOnLoad="1"/>');
    zip.file('xl/workbook.xml', wbx);
    if (zip.file('xl/calcChain.xml')) {
      zip.remove('xl/calcChain.xml');
      zip.file('xl/_rels/workbook.xml.rels', rels.replace(/<Relationship [^>]*calcChain[^>]*\/>/, ''));
      const ct = await zip.file('[Content_Types].xml').async('string');
      zip.file('[Content_Types].xml', ct.replace(/<Override [^>]*calcChain[^>]*\/>/, ''));
    }
    const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
    return { bytes, agregados: creados, duplicados: dup.length, sinFila: sinFila.map(r => r.cat), otroAnio: otroAnio.length, hoja: anio, rangos };
  }
  GEN.estadisticaInst = estadisticaInst;
})(typeof window !== 'undefined' ? window : globalThis);
