// Google Sheets Sync - مع مراقبة تلقائية للتغييرات
const SHEETS_URL = "https://script.google.com/macros/s/AKfycbz7LwtbbuapoF2O8dONgZ9NYjMZUrC_ysQqtpCFvWoQ5InJdtlMGWtxSCrTm_dlRufzzA/exec";

// متغيرات التتبع
let lastSyncTime = 0;
let syncCheckInterval = null;
let lastRowCount = 0;
let isAutoSyncEnabled = false;

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
    console.log('✅ تم استرجاع البيانات من Google Sheets');
    
    return result.data || result;
    
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
    return result.rowCount || 0;
    
  } catch (error) {
    console.warn('⚠️ خطأ في فحص عدد الصفوف:', error.message);
    return lastRowCount;
  }
}

// ===== دمج البيانات الجديدة فقط =====
async function mergeNewSheetData() {
  // تحقق من توفر البيانات الأساسية
  if (typeof window.state === 'undefined') {
    console.warn('⚠️ state غير متاح');
    return false;
  }
  
  if (!window.cloud) {
    console.warn('⚠️ Firebase غير متصل');
    return false;
  }
  
  console.log('🔄 فحص البيانات الجديدة من Google Sheets...');
  
  const sheetData = await syncFromSheet('all');
  
  if (!sheetData) {
    console.warn('⚠️ لا يمكن الوصول إلى Google Sheets');
    return false;
  }
  
  let hasChanges = false;
  
  try {
    // إضافة العناصر الجديدة من Sheets
    if (sheetData.inventory && Array.isArray(sheetData.inventory)) {
      for (const item of sheetData.inventory) {
        if (item.id && item.name) {
          const exists = window.state?.inventory?.some(i => i.id === item.id);
          if (!exists) {
            await window.cloud.addInventory(item);
            hasChanges = true;
            console.log('✅ تم إضافة عنصر جديد:', item.name);
          }
        }
      }
    }
    
    if (sheetData.loans && Array.isArray(sheetData.loans)) {
      for (const loan of sheetData.loans) {
        if (loan.id) {
          const exists = window.state?.loans?.some(l => l.id === loan.id);
          if (!exists) {
            await window.cloud.addLoan(loan);
            hasChanges = true;
            console.log('✅ تم إضافة إعارة جديدة');
          }
        }
      }
    }
    
    if (sheetData.returns && Array.isArray(sheetData.returns)) {
      for (const ret of sheetData.returns) {
        if (ret.id) {
          const exists = window.state?.returns?.some(r => r.id === ret.id);
          if (!exists) {
            await window.cloud.addReturn(ret);
            hasChanges = true;
            console.log('✅ تم إضافة إرجاع جديد');
          }
        }
      }
    }
    
    if (hasChanges) {
      console.log('✅ تم دمج البيانات الجديدة بنجاح!');
    } else {
      console.log('ℹ️ لا توجد بيانات جديدة');
    }
    
    return hasChanges;
    
  } catch (error) {
    console.error('❌ خطأ في دمج البيانات:', error);
    return false;
  }
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
  
  syncCheckInterval = setInterval(async () => {
    try {
      const currentRowCount = await getSheetRowCount();
      
      if (currentRowCount > lastRowCount) {
        console.log(`📨 تم اكتشاف ${currentRowCount - lastRowCount} صفوف جديدة`);
        lastRowCount = currentRowCount;
        await mergeNewSheetData();
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
  isAutoSyncEnabled: () => isAutoSyncEnabled
};

console.log('✅ Google Sheets Sync Initialized with Auto-Monitoring');



