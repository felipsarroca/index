/**
 * Importa la còpia de ja.cat de la pestanya «Buidat» a «Historial».
 * La primera execució manual es pot fer des del menú «Seguiment ja.cat».
 */
const CONFIG = {
  spreadsheetId: '13-HXfDKeUGmptFUqbsXikiX2MUKEE6UTRVO4TatkL-M',
  rawSheet: 'Buidat',
  historySheet: 'Historial',
  timeZone: 'Europe/Madrid',
  baseHeaders: ['Nom de l’app', 'Nom de l’enllaç', 'Enllaç escurçat', 'URL de destinació', 'Estat']
};

/** Serveix el dashboard privat des del mateix full de seguiment. */
function doGet() {
  const page = HtmlService.createHtmlOutputFromFile('Dashboard')
    .setTitle('Seguiment de ja.cat')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  try {
    page.setFaviconUrl('https://felipsarroca.github.io/index/SeguimentJaCat/favicon.png?v=atelier-20261019');
  } catch (error) {
    console.warn('El favicon no està disponible; es mostra el dashboard igualment.');
  }
  return page;
}

/** Retorna captures i evolucions per representar-les al dashboard. */
function getDashboardData() {
  const spreadsheet = SpreadsheetApp.openById(CONFIG.spreadsheetId);
  const history = spreadsheet.getSheetByName(CONFIG.historySheet);
  if (!history || history.getLastRow() < 2 || history.getLastColumn() <= CONFIG.baseHeaders.length) {
    return { dates: [], links: [], updatedAt: new Date().toISOString() };
  }
  const values = history.getDataRange().getValues();
  const headers = values[0];
  const dates = headers.slice(CONFIG.baseHeaders.length).map(function (date) {
    if (date instanceof Date) return Utilities.formatDate(date, CONFIG.timeZone, 'yyyy-MM-dd');
    const match = String(date).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return match ? match[3] + '-' + match[2] + '-' + match[1] : String(date);
  });
  const links = values.slice(1).filter(function (row) { return row[2]; }).map(function (row) {
    const snapshots = dates.map(function (date, i) {
      const raw = row[CONFIG.baseHeaders.length + i];
      return raw === '' || raw == null ? null : Number(raw);
    });
    return {
      app: String(row[0] || 'Sense nom'), alias: String(row[1] || ''),
      shortUrl: String(row[2] || ''), destination: String(row[3] || ''),
      state: String(row[4] || ''), snapshots: snapshots
    };
  });
  return { dates: dates, links: links, updatedAt: new Date().toISOString() };
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Seguiment ja.cat')
    .addItem('Processa la còpia de Buidat', 'processaBuidat')
    .addToUi();
}

/** S’executa automàticament quan s’enganxa una captura nova començant a A1. */
function onEdit(e) {
  if (!e || !e.range) return;
  const range = e.range;
  const sheet = range.getSheet();
  if (sheet.getName() !== CONFIG.rawSheet) return;
  if (range.getRow() !== 1 || range.getColumn() !== 1) return;
  if (normalitza_(sheet.getRange(1, 1).getDisplayValue()) !== 'enllac escurcat') return;
  processaBuidat();
}

/** Importació manual o inicial de la captura que ja hi ha a «Buidat». */
function processaBuidat() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  try {
    const raw = spreadsheet.getSheetByName(CONFIG.rawSheet);
    if (!raw) throw new Error('No existeix la pestanya «Buidat».');
    const imported = importaCaptura_(spreadsheet, raw);
    spreadsheet.toast(
      'Captura guardada: ' + imported + ' enllaços. La pestanya Buidat s’ha buidat.',
      'Seguiment ja.cat',
      6
    );
  } catch (error) {
    spreadsheet.toast('No s’ha pogut importar. Les dades de Buidat es conserven. ' + error.message,
      'Error de seguiment', 10);
    console.error(error);
    throw error;
  }
}

function importaCaptura_(spreadsheet, raw) {
  const input = raw.getDataRange().getDisplayValues();
  if (input.length < 2) throw new Error('Buidat no conté cap fila de dades.');

  const columns = indexaCapcaleres_(input[0]);
  const required = ['enllac escurcat', 'enllac', 'clics'];
  required.forEach(function (name) {
    if (columns[name] === undefined) throw new Error('Falta la columna «' + name + '».');
  });

  const incoming = [];
  const incomingKeys = new Set();
  for (let i = 1; i < input.length; i++) {
    const row = input[i];
    const shortUrl = valor_(row, columns['enllac escurcat']);
    if (!shortUrl) continue;
    const destination = valor_(row, columns['enllac']);
    const clicks = nombreClics_(valor_(row, columns['clics']));
    if (clicks === null) throw new Error('El recompte de clics de la fila ' + (i + 1) + ' no és numèric.');
    const key = clauEnllac_(shortUrl);
    if (incomingKeys.has(key)) {
      throw new Error('L’enllaç escurçat de la fila ' + (i + 1) + ' està duplicat a Buidat: ' + shortUrl);
    }
    incomingKeys.add(key);
    incoming.push({
      key: key,
      shortUrl: shortUrl,
      alias: aliasDe_(shortUrl),
      destination: netejaUrl_(destination),
      state: columns['estat'] === undefined ? '' : valor_(row, columns['estat']),
      app: nomApp_(destination, aliasDe_(shortUrl)),
      clicks: clicks
    });
  }
  if (!incoming.length) throw new Error('No he trobat cap enllaç per importar.');

  const history = spreadsheet.getSheetByName(CONFIG.historySheet) || spreadsheet.insertSheet(CONFIG.historySheet);
  const existing = history.getDataRange().getValues();
  let headers = existing.length && existing[0].some(function (v) { return v !== ''; })
    ? existing[0].map(String)
    : CONFIG.baseHeaders.slice();
  if (headers.length < CONFIG.baseHeaders.length ||
      CONFIG.baseHeaders.some(function (header, i) { return headers[i] !== header; })) {
    throw new Error('Les capçaleres de Historial no coincideixen amb l’estructura esperada.');
  }

  const today = Utilities.formatDate(new Date(), CONFIG.timeZone, 'dd/MM/yyyy');
  let dateColumn = headers.indexOf(today);
  if (dateColumn < 0) {
    headers.push(today);
    dateColumn = headers.length - 1;
  }

  const rowsByKey = new Map();
  for (let i = 1; i < existing.length; i++) {
    const previous = existing[i].slice();
    while (previous.length < headers.length) previous.push('');
    const key = clauEnllac_(String(previous[2] || ''));
    if (key) {
      if (rowsByKey.has(key)) {
        throw new Error('Historial conté més d’una fila per a l’enllaç ' + String(previous[2] || '') + '. No s’ha importat ni esborrat Buidat.');
      }
      rowsByKey.set(key, previous);
    }
  }

  // Només es canvien els enllaços presents; les files omeses conserven el valor del dia.
  incoming.forEach(function (item) {
    let row = rowsByKey.get(item.key);
    if (!row) {
      row = new Array(headers.length).fill('');
      rowsByKey.set(item.key, row);
    }
    while (row.length < headers.length) row.push('');
    row[0] = item.app;
    row[1] = item.alias;
    row[2] = item.shortUrl;
    row[3] = item.destination;
    row[4] = item.state;
    row[dateColumn] = item.clicks;
  });

  const orderedRows = Array.from(rowsByKey.values()).sort(function (a, b) {
    return String(a[0] || '').localeCompare(String(b[0] || ''), 'ca') ||
      String(a[1] || '').localeCompare(String(b[1] || ''), 'ca');
  });
  const output = [headers].concat(orderedRows);
  history.getRange(1, 1, output.length, headers.length).setValues(output);
  history.setFrozenRows(1);
  history.setFrozenColumns(CONFIG.baseHeaders.length);
  history.getRange(1, 1, 1, headers.length)
    .setFontWeight('bold')
    .setBackground('#17324D')
    .setFontColor('#FFFFFF')
    .setWrap(true);
  history.setColumnWidth(1, 190);
  history.setColumnWidth(2, 170);
  history.setColumnWidth(3, 210);
  history.setColumnWidth(4, 320);
  history.setColumnWidth(5, 85);
  if (headers.length > CONFIG.baseHeaders.length) {
    history.setColumnWidths(CONFIG.baseHeaders.length + 1, headers.length - CONFIG.baseHeaders.length, 100);
    history.getRange(2, CONFIG.baseHeaders.length + 1, Math.max(output.length - 1, 1),
      headers.length - CONFIG.baseHeaders.length).setNumberFormat('#,##0');
  }
  history.getRange(1, CONFIG.baseHeaders.length + 1, 1,
    headers.length - CONFIG.baseHeaders.length).setHorizontalAlignment('center');

  // Només esborrem la còpia un cop l’historial s’ha escrit correctament.
  raw.getDataRange().clearContent();
  return incoming.length;
}

function indexaCapcaleres_(headerRow) {
  const result = {};
  headerRow.forEach(function (value, index) { result[normalitza_(value)] = index; });
  return result;
}

function normalitza_(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim().replace(/\s+/g, ' ');
}

function valor_(row, index) {
  return index === undefined ? '' : String(row[index] || '').trim();
}

function nombreClics_(value) {
  const cleaned = String(value || '').replace(/[^0-9-]/g, '');
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function clauEnllac_(shortUrl) {
  return String(shortUrl || '').trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '')
    .toLowerCase();
}

function aliasDe_(shortUrl) {
  const match = String(shortUrl || '').trim().replace(/\/$/, '').match(/([^/]+)$/);
  return match ? match[1] : String(shortUrl || '').trim();
}

function netejaUrl_(url) {
  return String(url || '').trim().replace(/Edita\\s*$/i, '');
}

function nomApp_(destination, alias) {
  const source = netejaUrl_(destination);
  let host = '';
  let path = '';
  const match = source.match(/^https?:\/\/([^/?#]+)([^?#]*)/i);
  if (match) { host = match[1].toLowerCase(); path = match[2] || ''; }
  let parts = path.split('/').filter(Boolean).map(function (part) {
    try { return decodeURIComponent(part); } catch (e) { return part; }
  });
  while (parts.length && /^(edita|index\.html|index\.htm|default\.html)$/i.test(parts[parts.length - 1])) parts.pop();

  const aliasKey = String(alias || '').toLowerCase();
  if (aliasKey === 'web-apps') return 'Pàgines web';
  const categories = {
    'edu-apps': 'Aplicacions educatives',
    'util-apps': 'Aplicacions d’utilitats',
    'jocs': 'Jocs',
    'web': 'Pàgines web'
  };
  if (parts.length === 1 && categories[parts[0].toLowerCase()]) return categories[parts[0].toLowerCase()];

  const leaf = parts.length ? parts[parts.length - 1] : '';
  if (leaf && !/\.(apk|exe|zip|pdf|png|jpg|jpeg)$/i.test(leaf)) return títol_(leaf);
  if (host && !/(?:\.github\.io|\.github\.com|\.run\.app)$/i.test(host)) return títol_(host.split('.')[0]);
  return títol_(String(alias || '').replace(/^(app-)/i, '')) || 'Sense nom';
}

function títol_(value) {
  return String(value || '').replace(/([a-zà-ÿ])([A-ZÀ-Þ])/g, '$1 $2')
    .replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
    .replace(/\b\p{L}/gu, function (letter) { return letter.toLocaleUpperCase('ca'); });
}
