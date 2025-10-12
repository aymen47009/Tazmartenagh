// Google Sheets Sync - Simple Direct Method
// ضع رابط Web App هنا (الرابط من Google Apps Script deployment)
const SHEETS_URL = "https://script.google.com/macros/s/AKfycbxZjnueoERTnwDU49tsIoG47o2elYrlt_uPGbZHUuLvMWYjz_k44NZU9zPp-5Xr5ooUBw/exec";

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
    // لا تطبع رسالة خطأ مزعجة - فقط سجل في console
    console.warn('⚠️ Google Sheets sync (optional):', error.message);
  }
}

// Hooks للتطبيق
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

console.log('✅ Google Sheets Sync Initialized');

