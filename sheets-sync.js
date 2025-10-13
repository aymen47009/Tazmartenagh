// ===== رابط Google Sheets Web App =====
const SHEETS_URL = "https://script.google.com/macros/s/AKfycbxnbI_JZ1GEkFXD0gvj8gqpdoKQ9GIYZ9_cvWtAqUGdvP3HUgaleO8-0eL8ISDGlZxUSg/exec";

// ===== المتغيرات =====
let autoSyncInterval = null;
let isAutoSyncRunning = false;
const LAST_SYNC_KEY = 'lastSyncTime';

function getLastSyncTime() {
  return localStorage.getItem(LAST_SYNC_KEY) || 0;
}

function setLastSyncTime(timestamp) {
  localStorage.setItem(LAST_SYNC_KEY, timestamp);
}

// ===== إرسال بيانات إلى Google Sheets =====
async function postToSheet(payload) {
  if (!SHEETS_URL) return;
  try {
    await fetch(SHEETS_URL, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  } catch (error) {
    console.warn('⚠️ Google Sheets POST error:', error.message);
  }
}

// ===== استرجاع كل البيانات من Google Sheets =====
async function fetchSheetData() {
  try {
    const res = await fetch(SHEETS_URL, {
      method: 'POST',
      body: JSON.stringify({ type: 'sync_read', dataType: 'all' })
    });
    if (!res.ok) throw new Error(res.statusText);
    const data = await res.json();
    return data.rows || [];
  } catch (err) {
    console.warn('⚠️ Error fetching sheet data:', err.message);
    return [];
  }
}

// ===== تحويل صف Google Sheets إلى كائن =====
function rowToItem(row) {
  if (!row || row[0] === 'UUID') return null;
  return {
    id: row[0],                 // UUID
    number: row[1],
    name: row[2] || '',
    originalQty: parseInt(row[3]) || 0,
    totalQty: parseInt(row[4]) || 0,
    availableQty: parseInt(row[5]) || 0,
    notes: row[6] || '',
    lastModified: row[7] || new Date().toISOString()
  };
}

// ===== دمج البيانات من Google Sheets إلى Firebase =====
async function mergeSheetToFirebase() {
  if (!window.state?.inventory || !window.cloud) return false;

  const firebaseItems = window.state.inventory;
  const sheetRows = await fetchSheetData();
  if (!sheetRows.length) return false;

  let changesMade = false;
  let maxTimestamp = getLastSyncTime();

  for (const row of sheetRows) {
    const item = rowToItem(row);
    if (!item) continue;

    const rowTime = new Date(item.lastModified).getTime();
    if (rowTime <= getLastSyncTime()) continue;

    let existing = firebaseItems.find(i => i.id === item.id);

    if (existing) {
      const keys = ['name','originalQty','totalQty','availableQty','notes'];
      const changed = keys.some(k => existing[k] !== item[k]);
      if (changed) {
        console.log(`✏️ تحديث Firebase من Sheets: ${item.name}`);
        await window.cloud.updateInventory(existing.id, item);
        changesMade = true;
      }
    } else {
      console.log(`🆕 إضافة جديد إلى Firebase من Sheets: ${item.name}`);
      await window.cloud.addInventory(item);
      firebaseItems.push(item); // لتجنب الإضافة المكررة في نفس الجلسة
      changesMade = true;
    }

    if (rowTime > maxTimestamp) maxTimestamp = rowTime;
  }

  setLastSyncTime(maxTimestamp);
  return changesMade;
}

// ===== إرسال تغييرات Firebase إلى Google Sheets =====
function setupFirebaseHooks() {
  if (!window.gsheetHooks || !window.cloud) return;

  // عند إضافة عنصر
  window.cloud.onAddInventory = async (item) => {
    await postToSheet({
      type: 'inventory_add',
      data: item,
      timestamp: new Date().toISOString()
    });
  };

  // عند تحديث عنصر
  window.cloud.onUpdateInventory = async (id, changes) => {
    await postToSheet({
      type: 'inventory_update',
      id,
      changes,
      timestamp: new Date().toISOString()
    });
  };

  // عند حذف عنصر
  window.cloud.onDeleteInventory = async (id) => {
    await postToSheet({
      type: 'inventory_delete',
      id,
      timestamp: new Date().toISOString()
    });
  };
}

// ===== المزامنة التلقائية =====
function startAutoSync(intervalSeconds = 15) {
  if (isAutoSyncRunning) return;

  console.log(`📡 بدء المزامنة التلقائية كل ${intervalSeconds} ثانية`);
  isAutoSyncRunning = true;

  mergeSheetToFirebase();   // مزامنة أولية
  setupFirebaseHooks();     // ربط Firebase → Sheets

  autoSyncInterval = setInterval(() => {
    mergeSheetToFirebase(); // مزامنة دورية
  }, intervalSeconds * 1000);
}

// ===== إيقاف المزامنة =====
function stopAutoSync() {
  if (autoSyncInterval) clearInterval(autoSyncInterval);
  autoSyncInterval = null;
  isAutoSyncRunning = false;
  console.log('⏹️ تم إيقاف المزامنة التلقائية');
}

// ===== مزامنة يدوية =====
async function manualSync() {
  console.log('🔄 بدء المزامنة اليدوية...');
  const changed = await mergeSheetToFirebase();
  console.log(changed ? '✅ تم تحديث Firebase' : '✓ لا توجد تغييرات');
  return changed;
}

// ===== تصدير الدوال =====
window.sheetSync = {
  startAutoSync,
  stopAutoSync,
  manualSync
};

console.log('✅ Firebase ↔ Google Sheets Auto-Sync Initialized');
