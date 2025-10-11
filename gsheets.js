// Google Sheets Sync - نظام متزامن ثنائي الاتجاه
const SHEETS_URL = "https://script.google.com/macros/s/AKfycbz0VDk0Rtt7obyeYTb5ANvbjdI_9za1k04ORkE1IfcFaExaDCF33MYUa4O9bKvJgXQ5ow/exec";

async function postToSheet(payload) {
  if (!SHEETS_URL) {
    console.warn('❌ لم يتم تحديد رابط Google Sheets');
    return;
  }
  
  try {
    console.log('📤 إرسال:', payload.type);
    
    const response = await fetch(SHEETS_URL, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    
    const result = await response.json();
    
    if (result.status === 'success') {
      console.log('✅', result.message);
    } else {
      console.warn('⚠️ خطأ من الخادم:', result.message);
    }
    
  } catch (error) {
    console.warn('⚠️ خطأ في الاتصال:', error.message);
  }
}

// جلب البيانات من Google Sheets
async function getFromSheets() {
  if (!SHEETS_URL) {
    console.warn('❌ لم يتم تحديد رابط Google Sheets');
    return null;
  }
  
  try {
    console.log('📥 جلب البيانات من Google Sheets...');
    
    const response = await fetch(SHEETS_URL + '?action=getInventory', {
      method: 'GET'
    });
    
    const result = await response.json();
    
    if (result.status === 'success') {
      console.log('✅ تم جلب', result.data.length, 'عتاد');
      return result.data;
    } else {
      console.warn('⚠️ خطأ:', result.message);
      return null;
    }
    
  } catch (error) {
    console.warn('⚠️ خطأ في الاتصال:', error.message);
    return null;
  }
}

// Hooks للتطبيق
window.gsheetHooks = {
  inventory: {
    onAdd: (row) => {
      postToSheet({ 
        type: 'inventory_add',
        data: row 
      });
    },
    onUpdate: (id, changes) => {
      postToSheet({ 
        type: 'inventory_update',
        id,
        changes 
      });
    },
    onDelete: (id) => {
      postToSheet({ 
        type: 'inventory_delete',
        id 
      });
    }
  },
  loans: {
    onAdd: (row) => {
      postToSheet({ 
        type: 'loan_add',
        data: row 
      });
    },
    onDelete: (id) => {
      postToSheet({ 
        type: 'loan_delete',
        id 
      });
    }
  },
  returns: {
    onAdd: (row) => {
      postToSheet({ 
        type: 'return_add',
        data: row 
      });
    },
    onDelete: (id) => {
      postToSheet({ 
        type: 'return_delete',
        id 
      });
    }
  }
};

// دالة للمزامنة من Google Sheets
async function syncFromSheets() {
  console.log('🔄 بدء المزامنة من Google Sheets...');
  
  const data = await getFromSheets();
  
  if (data && Array.isArray(data)) {
    // هنا يمكنك تحديث state.inventory بالبيانات من Google Sheets
    console.log('📊 البيانات المستقبلة:', data);
    return data;
  }
  
  return null;
}

console.log('✅ Google Sheets Sync Initialized');
