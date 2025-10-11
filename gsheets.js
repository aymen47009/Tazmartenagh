// Google Sheets Sync - نظام متزامن ثنائي الاتجاه
const SHEETS_URL = "https://script.google.com/macros/s/AKfycbz0VDk0Rtt7obyeYTb5ANvbjdI_9za1k04ORkE1IfcFaExaDCF33MYUa4O9bKvJgXQ5ow/exec";

async function postToSheet(payload) {
  if (!SHEETS_URL) {
    console.warn('❌ لم يتم تحديد رابط Google Sheets');
    return;
  }
  
  try {
    console.log('📤 إرسال البيانات:', payload.type, payload);
    
    const response = await fetch(SHEETS_URL, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    
    const result = await response.json();
    console.log('✅ الرد من الخادم:', result);
    
    if (result.status === 'success') {
      console.log('✅ تم الحفظ بنجاح في Google Sheets:', result.message);
    } else {
      console.warn('⚠️ خطأ من الخادم:', result.message);
    }
    
  } catch (error) {
    console.error('❌ خطأ في الاتصال:', error);
  }
}

// Hooks للتطبيق
window.gsheetHooks = {
  inventory: {
    onAdd: function(row) {
      console.log('🔵 inventory.onAdd استُدعيت مع:', row);
      postToSheet({ 
        type: 'inventory_add',
        data: row
      });
    },
    onUpdate: function(id, changes) {
      console.log('🔵 inventory.onUpdate استُدعيت مع:', id, changes);
      postToSheet({ 
        type: 'inventory_update',
        id: id,
        changes: changes
      });
    },
    onDelete: function(id) {
      console.log('🔵 inventory.onDelete استُدعيت مع:', id);
      postToSheet({ 
        type: 'inventory_delete',
        id: id
      });
    }
  },
  loans: {
    onAdd: function(row) {
      console.log('🔵 loans.onAdd استُدعيت مع:', row);
      postToSheet({ 
        type: 'loan_add',
        data: row
      });
    },
    onDelete: function(id) {
      console.log('🔵 loans.onDelete استُدعيت مع:', id);
      postToSheet({ 
        type: 'loan_delete',
        id: id
      });
    }
  },
  returns: {
    onAdd: function(row) {
      console.log('🔵 returns.onAdd استُدعيت مع:', row);
      postToSheet({ 
        type: 'return_add',
        data: row
      });
    },
    onDelete: function(id) {
      console.log('🔵 returns.onDelete استُدعيت مع:', id);
      postToSheet({ 
        type: 'return_delete',
        id: id
      });
    }
  }
};

console.log('✅ Google Sheets Sync Initialized - جاهز للعمل');
