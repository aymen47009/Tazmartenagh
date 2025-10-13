// Google Sheets Sync - مع مراقبة تلقائية للتغييرات والقراءة من Google Sheets
const SHEETS_URL = "https://script.google.com/macros/s/AKfycbxnbI_JZ1GEkFXD0gvj8gqpdoKQ9GIYZ9_cvWtAqUGdvP3HUgaleO8-0eL8ISDGlZxUSg/exec";

// متغيرات التتبع
let lastSyncTime = 0;
let syncCheckInterval = null;
let lastRowCount = 0;
let isAutoSyncEnabled = false;
let syncHistory = new Set(); // لتتبع العناصر المتزامنة

async function postToSheet(payload) {
  if (!SHEETS_URL) {
    console.warn('❌ لم يتم تحديد رابط Google Sheets');
    return;
  }
  
  try {
    console.log('📤 إرسال البيانات:', payload);
    
    const response = await fetch(SHEETS_URL, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      console.warn(`⚠️ Server responded with status: ${response.status}`);
      return;
    }
    
    const result = await response.json();
    console.log('✅ تم الحفظ في Google Sheets:', result);
    
  } catch (error) {
    console.warn('⚠️ Google Sheets sync (optional):', error.message);
  }
}

// ===== استرجاع البيانات من Google Sheets =====
async function syncFromSheet(dataType = 'all') {
  if (!SHEETS_URL) {
    console.warn('❌ لم يتم تحديد رابط Google Sheets');
    return null;
  }
  
  try {
    const response = await fetch(SHEETS_URL, {
      method: 'POST',
      body: JSON.stringify({
        type: 'sync_read',
        dataType: dataType
      })
    });
    
    if (!response.ok) {
      console.warn(`⚠️ Server responded with status: ${response.status}`);
      return null;
    }
    
    const result = await response.json();
    console.log('✅ تم استرجاع البيانات من Google Sheets', result);
    
    return result;
    
  } catch (error) {
    console.warn('⚠️ Google Sheets sync read failed:', error.message);
    return null;
  }
}

// ===== فحص عدد الصفوف =====
async function getSheetRowCount() {
  if (!SHEETS_URL) return lastRowCount;
  
  try {
    const response = await fetch(SHEETS_URL, {
      method: 'POST',
      body: JSON.stringify({
        type: 'get_row_count'
      })
    });
    
    if (!response.ok) return lastRowCount;
    
    const result = await response.json();
    console.log('📊 عدد الصفوف:', result.rowCount);
    return result.rowCount || 0;
    
  } catch (error) {
    console.warn('⚠️ خطأ في فحص عدد الصفوف:', error.message);
    return lastRowCount;
  }
}

// ===== تحويل صفوف الجدول إلى كائنات =====
function convertSheetRowToObject(row, headers) {
  // row = [رقم, اسم العتاد, الكمية الأصلية, الكمية الكلية, الكمية المتاحة, الملاحظات]
  if (!row || row.length < 2) return null;
  
  return {
    id: `item_${row[0]}` || `item_${Date.now()}`,
    number: row[0] || '',
    name: row[1] || '',
    originalQty: parseInt(row[2]) || 0,
    totalQty: parseInt(row[3]) || 0,
    availableQty: parseInt(row[4]) || 0,
    notes: row[5] || '',
    createdAt: new Date().toISOString()
  };
}

// ===== دمج البيانات الجديدة من Google Sheets =====
// ===== دمج البيانات الجديدة من Google Sheets =====
const lastSyncedNumber = window.lastSyncedNumber || 0;

async function mergeNewSheetData() {
  if (!window.state?.inventory || !window.cloud) return false;

  const sheetData = await syncFromSheet("all");
  if (!sheetData?.rows) return false;

  let hasChanges = false;
  const firebaseItems = window.state.inventory;

  for (const row of sheetData.rows) {
    if (row[0] === "رقم" || row[0] === "number") continue;

    const number = Number(row[0]);
    if (number <= lastSyncedNumber) continue; // تخطي الصفوف القديمة

    const item = convertSheetRowToObject(row);
    if (!item) continue;

    const existing = firebaseItems.find(i => i.number === item.number);

    if (existing) {
      // تحديث الصف إذا تغيرت القيم
      const changed = ['name','notes','originalQty','totalQty','availableQty'].some(key => existing[key] !== item[key]);
      if (changed) {
        console.log(`✏️ تحديث العنصر في Firebase: ${item.name}`);
        await window.cloud.updateInventory(existing.id, item);
        hasChanges = true;
      }
    } else {
      console.log(`🆕 إضافة عنصر جديد إلى Firebase: ${item.name}`);
      await window.cloud.addInventory(item);
      hasChanges = true;
    }

    if (number > window.lastSyncedNumber) window.lastSyncedNumber = number;
  }

  return hasChanges;
}



// ===== المراقبة التلقائية للتغييرات =====
async function startAutoSync(intervalSeconds = 15) {
  if (isAutoSyncEnabled) {
    console.log('⚠️ المراقبة التلقائية قيد التشغيل بالفعل');
    return;
  }
  
  if (!window.cloud) {
    console.warn('❌ Firebase غير متصل - لا يمكن تشغيل المراقبة');
    return;
  }
  
  console.log(`📡 بدء المراقبة التلقائية (كل ${intervalSeconds} ثانية)...`);
  
  isAutoSyncEnabled = true;
  lastRowCount = await getSheetRowCount();
  console.log(`✅ عدد الصفوف الحالي: ${lastRowCount}`);
  
  // مزامنة فورية عند البدء
  await mergeNewSheetData();
  
  syncCheckInterval = setInterval(async () => {
    try {
      const currentRowCount = await getSheetRowCount();
      
      if (currentRowCount > lastRowCount) {
        console.log(`📨 تم اكتشاف ${currentRowCount - lastRowCount} صفوف جديدة`);
        lastRowCount = currentRowCount;
        await mergeNewSheetData();
      } else if (currentRowCount === lastRowCount) {
        console.log('✓ لا توجد تحديثات جديدة');
      }
    } catch (error) {
      console.warn('❌ خطأ في فحص التحديثات:', error.message);
    }
  }, intervalSeconds * 1000);
  
  console.log('✅ المراقبة التلقائية نشطة');
}

// ===== إيقاف المراقبة التلقائية =====
function stopAutoSync() {
  if (syncCheckInterval) {
    clearInterval(syncCheckInterval);
    syncCheckInterval = null;
    isAutoSyncEnabled = false;
    console.log('⏹️ تم إيقاف المراقبة التلقائية');
  }
}

// ===== تحديث يدوي =====
async function manualSync() {
  console.log('🔄 بدء المزامنة اليدوية...');
  const result = await mergeNewSheetData();
  console.log(result ? '✅ اكتملت المزامنة' : '⚠️ لم تتم المزامنة');
  return result;
}

// ===== Hooks للتطبيق =====
window.gsheetHooks = {
  inventory: {
    onAdd: (row) => {
      postToSheet({ 
        type: 'inventory_add',
        timestamp: new Date().toLocaleString('ar-SA'),
        data: row 
      });
    },
    onUpdate: (id, changes) => {
      postToSheet({ 
        type: 'inventory_update',
        timestamp: new Date().toLocaleString('ar-SA'),
        id,
        changes 
      });
    },
    onDelete: (id) => {
      postToSheet({ 
        type: 'inventory_delete',
        timestamp: new Date().toLocaleString('ar-SA'),
        id 
      });
    }
  },
  loans: {
    onAdd: (row) => {
      postToSheet({ 
        type: 'loan_add',
        timestamp: new Date().toLocaleString('ar-SA'),
        data: row 
      });
    },
    onDelete: (id) => {
      postToSheet({ 
        type: 'loan_delete',
        timestamp: new Date().toLocaleString('ar-SA'),
        id 
      });
    }
  },
  returns: {
    onAdd: (row) => {
      postToSheet({ 
        type: 'return_add',
        timestamp: new Date().toLocaleString('ar-SA'),
        data: row 
      });
    },
    onDelete: (id) => {
      postToSheet({ 
        type: 'return_delete',
        timestamp: new Date().toLocaleString('ar-SA'),
        id 
      });
    }
  }
};

// تصدير الدوال
window.sheetSync = {
  syncFromSheet,
  mergeNewSheetData,
  postToSheet,
  startAutoSync,
  stopAutoSync,
  manualSync,
  isAutoSyncEnabled: () => isAutoSyncEnabled,
  getSyncHistory: () => syncHistory,
  clearSyncHistory: () => syncHistory.clear()
};

console.log('✅ Google Sheets Sync Initialized with Auto-Monitoring');