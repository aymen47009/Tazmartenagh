/**
 * Google Apps Script Web App for the Inventory PWA
 * Paste this into a new script at https://script.google.com/, set SHEET_ID and optionally SECRET_KEY,
 * then Deploy -> New deployment -> Web app (Execute as: Me, Who has access: Anyone).
 *
 * Expected POST bodies (JSON):
 * - { type: 'sync_read', dataType: 'all'|'inventory'|'loans'|'returns' }
 * - { type: 'get_row_count' }
 * - { type: 'inventory_add', data: {...} }
 * - { type: 'inventory_update', id: '...', changes: {...} }
 * - { type: 'inventory_delete', id: '...' }
 * - similarly for loan_add/loan_delete and return_add/return_delete
 *
 * The script will look for three sheets named exactly: 'inventory', 'loans', 'returns'
 * Each sheet should have a header row defining field names (including 'id').
 */

// Configure these before deploying
const SHEET_ID = '1OFfqzwNijrf0SsMSeFeSMGgqm-lhrBjOPVbkCEX82GA'; // e.g. '1AbcDe...'
const SECRET_KEY = ''; // optional: set a secret and include { key: '...' } in request body to protect writes

function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, message: 'Google Sheets Web App is running' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const raw = e.postData && e.postData.contents ? e.postData.contents : null;
    if (!raw) return jsonErr('empty_post_body');
    const payload = JSON.parse(raw);

    // Optional simple API key check (if SECRET_KEY is set)
    if (SECRET_KEY && payload.key !== SECRET_KEY) {
      return jsonErr('invalid_key', 403);
    }

    const type = payload.type;
    if (!type) return jsonErr('missing_type');

    const ss = SpreadsheetApp.openById(SHEET_ID);
    // Accept English and Arabic sheet names (fallbacks)
    function getFirstSheet(book, names) {
      for (let n of names) {
        const s = book.getSheetByName(n);
        if (s) return s;
      }
      return null;
    }

    const inventorySheet = getFirstSheet(ss, ['inventory', 'المخزون', 'المخزن']);
    const loansSheet = getFirstSheet(ss, ['loans', 'السلفيات', 'السلف']);
    const returnsSheet = getFirstSheet(ss, ['returns', 'الإرجاعات', 'الإرجاع']);
    const reportsSheet = getFirstSheet(ss, ['reports', 'التقارير']);

    // Header translations: map Arabic header names to canonical English keys used by the app
    const headerTranslations = {
      // inventory headers
      'رقم': 'id', 'id': 'id',
      'اسم العتاد': 'name', 'name': 'name',
      'الكمية الأصلية': 'initialQty', 'initial quantity': 'initialQty',
      'الكمية الكلية': 'totalQty', 'total quantity': 'totalQty',
      'الكمية المتاحة': 'availableQty', 'available quantity': 'availableQty',
      'الملاحظات': 'notes', 'notes': 'notes',
      // loans headers
      'الكمية المسلَّفة': 'qty', 'الكمية المسلّفة': 'qty', 'qty': 'qty',
      'اسم المستلف': 'person', 'person': 'person',
      'رقم هاتف المستلف': 'phone', 'phone': 'phone',
      'القسم / الجهة': 'dept', 'dept': 'dept',
      'تاريخ السلف': 'date', 'date': 'date',
      'تاريخ الإرجاع المتوقع': 'due', 'due': 'due',
      // returns headers
      'التاريخ': 'date', 'الكمية المرجعة': 'qty', 'الكمية التالفة': 'damaged',
      'ملاحظات': 'notes', 'loanId': 'loanId', 'معرّف السلف': 'loanId'
    };

    function translateHeader(header) {
      const h = String(header || '').trim();
      return headerTranslations[h] || h; // fallback to raw header if no mapping
    }

    // helper to read sheet into array of objects (headers -> keys)
    function sheetToObjects(sheet) {
      if (!sheet) return [];
      const values = sheet.getDataRange().getValues();
      if (values.length < 2) return [];
      const rawHeaders = values[0].map(h => String(h || '').trim());
      const headers = rawHeaders.map(h => translateHeader(h));
      const rows = values.slice(1).map(r => {
        const obj = {};
        for (let i = 0; i < headers.length; i++) {
          obj[headers[i]] = r[i];
        }
        return obj;
      });
      return rows;
    }

    function findRowIndexById(sheet, id) {
      if (!sheet) return -1;
      const values = sheet.getDataRange().getValues();
      if (values.length < 2) return -1;
      const rawHeaders = values[0].map(h => String(h || '').trim());
      const headers = rawHeaders.map(h => translateHeader(h));
      const idIdx = headers.indexOf('id');
      if (idIdx < 0) return -1;
      for (let r = 1; r < values.length; r++) {
        if (String(values[r][idIdx]) === String(id)) return r + 1; // sheet row number (1-based)
      }
      return -1;
    }

    function appendObjectToSheet(sheet, obj) {
      const rawHeaders = sheet.getDataRange().getValues()[0].map(h => String(h || '').trim());
      const row = rawHeaders.map(h => {
        const key = translateHeader(h);
        return obj[key] !== undefined ? obj[key] : '';
      });
      sheet.appendRow(row);
    }

    // route types
    if (type === 'sync_read') {
      const dt = payload.dataType || 'all';
      const out = {};
      if (dt === 'all' || dt === 'inventory') out.inventory = sheetToObjects(inventorySheet);
      if (dt === 'all' || dt === 'loans') out.loans = sheetToObjects(loansSheet);
      if (dt === 'all' || dt === 'returns') out.returns = sheetToObjects(returnsSheet);
      if (dt === 'all' || dt === 'reports') out.reports = sheetToObjects(reportsSheet);
      return jsonOk(out);
    }

    if (type === 'get_row_count') {
      const inv = sheetToObjects(inventorySheet).length;
      const lns = sheetToObjects(loansSheet).length;
      const rts = sheetToObjects(returnsSheet).length;
      return jsonOk({ rowCount: inv + lns + rts });
    }

    // Mutations: require at least inventory/loans/returns sheets available
    if (type === 'inventory_add') {
      const data = payload.data || {};
      if (!inventorySheet) return jsonErr('no_inventory_sheet');
      if (!data.id) data.id = generateId();
      appendObjectToSheet(inventorySheet, data);
      return jsonOk({ success: true, id: data.id });
    }

    if (type === 'inventory_update') {
      const id = payload.id;
      const changes = payload.changes || {};
      if (!id) return jsonErr('missing_id');
      if (!inventorySheet) return jsonErr('no_inventory_sheet');
      const rowNum = findRowIndexById(inventorySheet, id);
      if (rowNum < 2) return jsonErr('not_found');
      const rawHeaders = inventorySheet.getDataRange().getValues()[0].map(h => String(h || '').trim());
      for (let i = 0; i < rawHeaders.length; i++) {
        const canonicalKey = translateHeader(rawHeaders[i]);
        if (canonicalKey in changes) {
          inventorySheet.getRange(rowNum, i + 1).setValue(changes[canonicalKey]);
        }
      }
      return jsonOk({ success: true });
    }

    if (type === 'inventory_delete') {
      const id = payload.id;
      if (!id) return jsonErr('missing_id');
      if (!inventorySheet) return jsonErr('no_inventory_sheet');
      const rowNum = findRowIndexById(inventorySheet, id);
      if (rowNum < 2) return jsonErr('not_found');
      inventorySheet.deleteRow(rowNum);
      return jsonOk({ success: true });
    }

    if (type === 'loan_add') {
      const data = payload.data || {};
      if (!loansSheet) return jsonErr('no_loans_sheet');
      if (!data.id) data.id = generateId();
      appendObjectToSheet(loansSheet, data);
      return jsonOk({ success: true, id: data.id });
    }

    if (type === 'loan_delete') {
      const id = payload.id;
      if (!id) return jsonErr('missing_id');
      if (!loansSheet) return jsonErr('no_loans_sheet');
      const rowNum = findRowIndexById(loansSheet, id);
      if (rowNum < 2) return jsonErr('not_found');
      loansSheet.deleteRow(rowNum);
      return jsonOk({ success: true });
    }

    if (type === 'return_add') {
      const data = payload.data || {};
      if (!returnsSheet) return jsonErr('no_returns_sheet');
      if (!data.id) data.id = generateId();
      appendObjectToSheet(returnsSheet, data);
      return jsonOk({ success: true, id: data.id });
    }

    if (type === 'return_delete') {
      const id = payload.id;
      if (!id) return jsonErr('missing_id');
      if (!returnsSheet) return jsonErr('no_returns_sheet');
      const rowNum = findRowIndexById(returnsSheet, id);
      if (rowNum < 2) return jsonErr('not_found');
      returnsSheet.deleteRow(rowNum);
      return jsonOk({ success: true });
    }

    return jsonErr('unknown_type');
  } catch (err) {
    return jsonErr('exception', 500, String(err));
  }
}

// Utilities
function jsonOk(data) {
  const out = JSON.stringify({ ok: true, data: data });
  return ContentService.createTextOutput(out).setMimeType(ContentService.MimeType.JSON);
}

function jsonErr(code, status = 400, message) {
  const out = JSON.stringify({ ok: false, error: code, message: message || '' });
  const resp = ContentService.createTextOutput(out).setMimeType(ContentService.MimeType.JSON);
  // Apps Script cannot set HTTP status easily for simple web apps; message will indicate error.
  return resp;
}

function generateId() {
  return 's' + Utilities.getUuid().replace(/-/g, '').slice(0, 12);
}
