// ==================== Google Sheets ↔ Local Cloud Sync ====================

// رابط Web App الخاص بجوجل شيت
const SHEETS_URL = "https://script.google.com/macros/s/AKfycbxnbI_JZ1GEkFXD0gvj8gqpdoKQ9GIYZ9_cvWtAqUGdvP3HUgaleO8-0eL8ISDGlZxUSg/exec";

// ==================== متغيرات المزامنة ====================
let lastRowCount = 0;
let isAutoSyncEnabled = false;
let syncCheckInterval = null;
window.lastSyncedNumber = window.lastSyncedNumber || 0;

// ==================== تحويل صف من Google Sheets إلى كائن ====================
function rowToItem(row) {
  if (!row || row[0] === "رقم" || row[0] === "number") return null;

  return {
    id: `item_${row[0]}`,
    number: row[0]?.toString() || "",
    name: row[1]?.toString() || "",
    originalQty: parseInt(row[2]) || 0,
    totalQty: parseInt(row[3]) || 0,
    availableQty: parseInt(row[4]) || 0,
    notes: row[5]?.toString() || "",
    createdAt: new Date().toISOString()
  };
}

// ==================== إرسال بيانات إلى Google Sheets ====================
async function postToSheet(payload) {
  if (!SHEETS_URL) return;

  try {
    const response = await fetch(SHEETS_URL, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    console.log("✅ تم الحفظ في Google Sheets:", result);
  } catch (error) {
    console.warn("⚠️ Google Sheets sync failed:", error.message);
  }
}

// ==================== استرجاع بيانات من Google Sheets ====================
async function syncFromSheet(dataType = "all") {
  if (!SHEETS_URL) return null;

  try {
    const response = await fetch(SHEETS_URL, {
      method: "POST",
      body: JSON.stringify({ type: "sync_read", dataType })
    });

    if (!response.ok) return null;
    const result = await response.json();
    return result;
  } catch (error) {
    console.warn("⚠️ Google Sheets sync read failed:", error.message);
    return null;
  }
}

// ==================== فحص عدد الصفوف ====================
async function getSheetRowCount() {
  if (!SHEETS_URL) return lastRowCount;

  try {
    const response = await fetch(SHEETS_URL, {
      method: "POST",
      body: JSON.stringify({ type: "get_row_count" })
    });
    if (!response.ok) return lastRowCount;
    const result = await response.json();
    return result.rowCount || lastRowCount;
  } catch (error) {
    console.warn("⚠️ خطأ في فحص عدد الصفوف:", error.message);
    return lastRowCount;
  }
}

// ==================== دمج البيانات الجديدة إلى جسر السحابة (Google Sheets) ====================
async function mergeSheetToCloud() {
  if (!window.state?.inventory || !window.cloud) return false;

  const sheetData = await syncFromSheet("all");
  if (!sheetData?.rows) return false;

  let hasChanges = false;
  const localItems = window.state.inventory;

  for (const row of sheetData.rows) {
    const item = rowToItem(row);
    if (!item) continue;

    const number = Number(item.number);
    if (number <= window.lastSyncedNumber) continue;

    const existing = localItems.find(i => i.number === item.number);

    if (existing) {
      const changed = ["name", "notes", "originalQty", "totalQty", "availableQty"].some(
        key => existing[key] !== item[key]
      );
      if (changed) {
        console.log(`✏️ تحديث عنصر في السحابة/المحلي: ${item.name}`);
        await window.cloud.updateInventory(existing.id, item);
        hasChanges = true;
      }
    } else {
      console.log(`🆕 إضافة عنصر جديد من Google Sheets: ${item.name}`);
      await window.cloud.addInventory(item);
      hasChanges = true;
    }

    // تحديث المتغير العالمي بعد كل صف
    if (number > window.lastSyncedNumber) window.lastSyncedNumber = number;
  }

  return hasChanges;
}

// ==================== المزامنة التلقائية ====================
async function startAutoSync(intervalSeconds = 15) {
  if (isAutoSyncEnabled) return;
  if (!window.cloud) return;

  isAutoSyncEnabled = true;
  lastRowCount = await getSheetRowCount();

  // مزامنة فورية عند البدء
  await mergeSheetToCloud();

  syncCheckInterval = setInterval(async () => {
    try {
      const currentRowCount = await getSheetRowCount();
      if (currentRowCount > lastRowCount) {
        console.log(`📨 اكتشاف ${currentRowCount - lastRowCount} صفوف جديدة`);
        lastRowCount = currentRowCount;
  await mergeSheetToCloud();
      }
    } catch (error) {
      console.warn("⚠️ خطأ في فحص التحديثات:", error.message);
    }
  }, intervalSeconds * 1000);

  console.log(`📡 المزامنة التلقائية نشطة كل ${intervalSeconds} ثانية`);
}

function stopAutoSync() {
  if (syncCheckInterval) {
    clearInterval(syncCheckInterval);
    syncCheckInterval = null;
    isAutoSyncEnabled = false;
    console.log("⏹️ تم إيقاف المزامنة التلقائية");
  }
}

// ==================== المزامنة اليدوية ====================
async function manualSync() {
  console.log("🔄 بدء المزامنة اليدوية...");
  const result = await mergeSheetToCloud();
  console.log(result ? "✅ اكتملت المزامنة" : "⚠️ لا توجد تغييرات");
  return result;
}

// ==================== تصدير الدوال ====================
window.sheetSync = {
  syncFromSheet,
  mergeSheetToCloud,
  postToSheet,
  startAutoSync,
  stopAutoSync,
  manualSync,
  isAutoSyncEnabled: () => isAutoSyncEnabled
};

console.log("✅ Google Sheets Auto-Sync Initialized");