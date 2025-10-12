// Google Sheets Sync - مع مراقبة تلقائية للتغييرات
const SHEETS_URL = "https://script.google.com/macros/s/AKfycbw-36KyCSFfPaA9VfTYCEMbyvemZyPKmwkEptOh6q7XmLhBOlyIsu1bP9wltsN0-eZZVw/exec";

// متغيرات التتبع
let lastSyncTime = 0;
let syncCheckInterval = null;
let lastRowCount = 0;

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
  if (!SHEETS_URL) return 0;
  
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
    return lastRowCount;
  }
}

// ===== دمج البيانات الجديدة فقط =====
async function mergeNewSheetData() {
  console.log('🔄 فحص البيانات الجديدة من Google Sheets...');
  
  const sheetData = await syncFromSheet('all');
  
  if (!sheetData) {
    console.warn('⚠️ لا يمكن الوصول إلى Google Sheets');
    return false;
  }
  
  if (!window.cloud) {
    console.warn('⚠️ Firebase غير متصل');
    return false;
  }
  
  let hasChanges = false;
  
  try {
    // إضافة العناصر الجديدة من Sheets
    if (sheetData.inventory && Array.isArray(sheetData.inventory)) {
      for (const item of sheetData.inventory) {
        if (item.id && item.name) {
          // تحقق إذا كان العنصر موجود بالفعل
          const exists = state?.inventory?.some(i => i.id === item.id);
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
          const exists = state?.loans?.some(l => l.id === loan.id);
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
          const exists = state?.returns?.some(r => r.id === ret.id);
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
      // أعد تحديث الواجهة
      if (window.renderInventory) window.renderInventory();
      if (window.renderLoans) window.renderLoans();
      if (window.renderReturns) window.renderReturns();
      if (window.renderReports) window.renderReports();
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
async function startAutoSync(intervalSeconds = 10) {
  if (syncCheckInterval) {
    console.log('⚠️ المراقبة التلقائية قيد التشغيل بالفعل');
    return;
  }
  
  console.log(`📡 بدء المراقبة التلقائية (كل ${intervalSeconds} ثانية)...`);
  
  // تحقق الآن
  lastRowCount = await getSheetRowCount();
  
  syncCheckInterval = setInterval(async () => {
    try {
      const currentRowCount = await getSheetRowCount();
      
      // إذا تغير عدد الصفوف، هناك بيانات جديدة
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
  stopAutoSync
};

console.log('✅ Google Sheets Sync Initialized with Auto-Monitoring');
