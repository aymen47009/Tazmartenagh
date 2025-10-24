// Google Sheets Sync - مع مراقبة تلقائية للتغييرات
// Prefer endpoint from `window.gsheetSyncConfig.endpointUrl` if provided by gsheets-config.js
let SHEETS_URL = "https://script.google.com/macros/s/AKfycbz7LwtbbuapoF2O8dONgZ9NYjMZUrC_ysQqtpCFvWoQ5InJdtlMGWtxSCrTm_dlRufzzA/exec";
try {
  if (window.gsheetSyncConfig && window.gsheetSyncConfig.endpointUrl) {
    SHEETS_URL = window.gsheetSyncConfig.endpointUrl;
  }
  if (window.gsheetSyncConfig && window.gsheetSyncConfig.enabled === false) {
    SHEETS_URL = '';
  }
} catch (e) {}

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
    
    // تحويل البيانات إلى الشكل المطلوب للتطبيق
    if (result.data || result) {
      const rawData = result.data || result;
      return {
        inventory: window.sheetsTransform.transformInventory(rawData.inventory || []),
        loans: window.sheetsTransform.transformLoans(rawData.loans || []),
        returns: window.sheetsTransform.transformReturns(rawData.returns || [])
      };
    }
    return null;
    
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
    console.warn('⚠️ جسر Google Sheets غير متصل');
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
    console.warn('❌ جسر Google Sheets غير متصل - لا يمكن تشغيل المراقبة');
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

// ===== Provide a `window.cloud` API backed by Google Sheets =====
(() => {
  // Avoid overriding an existing cloud implementation (e.g., Firebase) unless absent
  if (window.cloud) return;

  const subscribers = {
    inventory: new Set(),
    loans: new Set(),
    returns: new Set()
  };

  let pollHandle = null;
  const POLL_MS = 5000;

  function notify(kind, rows) {
    try {
      const list = Array.isArray(rows) ? rows : [];
      subscribers[kind].forEach(cb => {
        try { cb(list); } catch (e) { console.warn('subscriber callback error', e); }
      });
    } catch (e) { console.warn('notify error', e); }
  }

  async function pollOnce() {
    try {
      const data = await syncFromSheet('all');
      if (!data) return;
      if (Array.isArray(data.inventory)) notify('inventory', data.inventory);
      if (Array.isArray(data.loans)) notify('loans', data.loans);
      if (Array.isArray(data.returns)) notify('returns', data.returns);
    } catch (e) {
      console.warn('pollOnce failed', e.message || e);
    }
  }

  function startPolling() {
    if (pollHandle) return;
    // run one immediate poll then start interval
    pollOnce();
    pollHandle = setInterval(pollOnce, POLL_MS);
    console.log('\u23f0 Google Sheets: started polling for changes');
  }

  function stopPollingIfIdle() {
    if (!pollHandle) return;
    const total = subscribers.inventory.size + subscribers.loans.size + subscribers.returns.size;
    if (total === 0) {
      clearInterval(pollHandle);
      pollHandle = null;
      console.log('\u23f9 Google Sheets: stopped polling (no subscribers)');
    }
  }

  function genId(prefix = 's') {
    return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random()*9000+1000).toString(36)}`;
  }

  // Core cloud API expected by app.js
  window.cloud = {
    // Inventory
    addInventory: async (item) => {
      const rec = Object.assign({}, item);
      if (!rec.id) rec.id = genId('i');
      await postToSheet({ type: 'inventory_add', timestamp: new Date().toISOString(), data: rec });
      // best-effort: fetch latest inventory and notify subscribers
      const data = await syncFromSheet('inventory');
      if (data) notify('inventory', data);
      if (window.gsheetHooks && window.gsheetHooks.inventory && typeof window.gsheetHooks.inventory.onAdd === 'function') {
        try { window.gsheetHooks.inventory.onAdd(rec); } catch (e){}
      }
      return rec;
    },
    updateInventory: async (id, changes) => {
      await postToSheet({ type: 'inventory_update', timestamp: new Date().toISOString(), id, changes });
      const data = await syncFromSheet('inventory');
      if (data) notify('inventory', data);
      if (window.gsheetHooks && window.gsheetHooks.inventory && typeof window.gsheetHooks.inventory.onUpdate === 'function') {
        try { window.gsheetHooks.inventory.onUpdate(id, changes); } catch (e){}
      }
    },
    deleteInventory: async (id) => {
      await postToSheet({ type: 'inventory_delete', timestamp: new Date().toISOString(), id });
      const data = await syncFromSheet('inventory');
      if (data) notify('inventory', data);
      if (window.gsheetHooks && window.gsheetHooks.inventory && typeof window.gsheetHooks.inventory.onDelete === 'function') {
        try { window.gsheetHooks.inventory.onDelete(id); } catch (e){}
      }
    },

    // Loans
    addLoan: async (rec) => {
      const r = Object.assign({}, rec);
      if (!r.id) r.id = genId('l');
      await postToSheet({ type: 'loan_add', timestamp: new Date().toISOString(), data: r });
      const data = await syncFromSheet('loans');
      if (data) notify('loans', data);
      if (window.gsheetHooks && window.gsheetHooks.loans && typeof window.gsheetHooks.loans.onAdd === 'function') {
        try { window.gsheetHooks.loans.onAdd(r); } catch (e){}
      }
      return r;
    },
    deleteLoan: async (id) => {
      await postToSheet({ type: 'loan_delete', timestamp: new Date().toISOString(), id });
      const data = await syncFromSheet('loans');
      if (data) notify('loans', data);
      if (window.gsheetHooks && window.gsheetHooks.loans && typeof window.gsheetHooks.loans.onDelete === 'function') {
        try { window.gsheetHooks.loans.onDelete(id); } catch (e){}
      }
    },

    // Returns
    addReturn: async (rec) => {
      const r = Object.assign({}, rec);
      if (!r.id) r.id = genId('r');
      await postToSheet({ type: 'return_add', timestamp: new Date().toISOString(), data: r });
      const data = await syncFromSheet('returns');
      if (data) notify('returns', data);
      if (window.gsheetHooks && window.gsheetHooks.returns && typeof window.gsheetHooks.returns.onAdd === 'function') {
        try { window.gsheetHooks.returns.onAdd(r); } catch (e){}
      }
      return r;
    },
    deleteReturn: async (id) => {
      await postToSheet({ type: 'return_delete', timestamp: new Date().toISOString(), id });
      const data = await syncFromSheet('returns');
      if (data) notify('returns', data);
      if (window.gsheetHooks && window.gsheetHooks.returns && typeof window.gsheetHooks.returns.onDelete === 'function') {
        try { window.gsheetHooks.returns.onDelete(id); } catch (e){}
      }
    },

    // Subscriptions (returns an unsubscribe function)
    subscribeInventory: (cb) => {
      subscribers.inventory.add(cb);
      // initial push
      (async ()=>{
        const data = await syncFromSheet('inventory');
        if (data) cb(data);
      })();
      startPolling();
      return () => { subscribers.inventory.delete(cb); stopPollingIfIdle(); };
    },
    subscribeLoans: (cb) => {
      subscribers.loans.add(cb);
      (async ()=>{ const data = await syncFromSheet('loans'); if (data) cb(data); })();
      startPolling();
      return () => { subscribers.loans.delete(cb); stopPollingIfIdle(); };
    },
    subscribeReturns: (cb) => {
      subscribers.returns.add(cb);
      (async ()=>{ const data = await syncFromSheet('returns'); if (data) cb(data); })();
      startPolling();
      return () => { subscribers.returns.delete(cb); stopPollingIfIdle(); };
    }
  };

  console.log('\u2705 window.cloud provided by Google Sheets bridge');
})();


