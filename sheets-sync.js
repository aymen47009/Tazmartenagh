// ===== إعداد رابط Google Sheets =====
const SHEETS_URL = "https://script.google.com/macros/s/AKfycbxnbI_JZ1GEkFXD0gvj8gqpdoKQ9GIYZ9_cvWtAqUGdvP3HUgaleO8-0eL8ISDGlZxUSg/exec";

// ===== متغيرات التحكم =====
let autoSyncInterval = null;
let isAutoSyncRunning = false;

// حفظ آخر وقت مزامنة
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
  if (!row || row[0] === 'رقم') return null;
  return {
    id: `item_${row[0]}`,
    number: row[0],
    name: row[1] || '',
    originalQty: parseInt(row[2]) || 0,
    totalQty: parseInt(row[3]) || 0,
    availableQty: parseInt(row[4]) || 0,
    notes: row[5] || '',
    lastModified: row[6] || new Date().toISOString() // عمود إضافي لتاريخ التعديل
  };
}

// ===== دمج البيانات مع Firebase =====
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

    // تحقق من Timestamp لتجنب إعادة المزامنة
    const rowTime = new Date(item.lastModified).getTime();
    if (rowTime <= getLastSyncTime()) continue;

    const existing = firebaseItems.find(i => i.number === item.number);
    if (existing) {
      // تحقق من أي تغيير
      const keys = ['name','originalQty','totalQty','availableQty','notes'];
      const changed = keys.some(k => existing[k] !== item[k]);
      if (changed) {
        console.log(`✏️ تحديث: ${item.name}`);
        await window.cloud.updateInventory(existing.id, item);
        changesMade = true;
      }
    } else {
      console.log(`🆕 إضافة جديد: ${item.name}`);
      await window.cloud.addInventory(item);
      changesMade = true;
    }

    if (rowTime > maxTimestamp) maxTimestamp = rowTime;
  }

  setLastSyncTime(maxTimestamp);
  return changesMade;
}

// ===== المراقبة التلقائية =====
function startAutoSync(intervalSeconds = 15) {
  if (isAutoSyncRunning) return;

  console.log(`📡 بدء المراقبة كل ${intervalSeconds} ثانية`);
  isAutoSyncRunning = true;

  // مزامنة أولية
  mergeSheetToFirebase();

  autoSyncInterval = setInterval(() => {
    mergeSheetToFirebase();
  }, intervalSeconds * 1000);
}

// ===== إيقاف المراقبة =====
function stopAutoSync() {
  if (autoSyncInterval) clearInterval(autoSyncInterval);
  autoSyncInterval = null;
  isAutoSyncRunning = false;
  console.log('⏹️ المراقبة التلقائية توقفت');
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

console.log('✅ Google Sheets Auto-Sync Initialized');
