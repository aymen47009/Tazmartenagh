// Google Sheets Sync - مع مراقبة تلقائية للتغييرات
(() => {
  // تهيئة المتغيرات العامة
  const state = {
    SHEETS_URL: "https://script.google.com/macros/s/AKfycbwdXIBW1i2iie1G688XRr4K61pet_W7Lx6fm1ME-GXJeMIxE-pB-e9ijYao8dbBYh8/exec",
    lastSyncTime: 0,
    syncCheckInterval: null,
    lastRowCount: 0,
    isAutoSyncEnabled: false
  };

  // تحميل التكوين
  try {
    if (window.gsheetSyncConfig?.endpointUrl) {
      state.SHEETS_URL = window.gsheetSyncConfig.endpointUrl;
    }
    if (window.gsheetSyncConfig?.enabled === false) {
      state.SHEETS_URL = '';
    }
  } catch (e) {
    console.warn('⚠️ خطأ في تحميل التكوين:', e);
  }

  // وظائف المساعدة
  const utils = {
    generateCallbackName: () => 'callback_' + Math.random().toString(36).substr(2, 9),
    
    createHiddenIframe: () => {
      let iframe = document.getElementById('sheets_iframe');
      if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.name = 'hidden_iframe';
        iframe.id = 'sheets_iframe';
        iframe.style.display = 'none';
        document.body.appendChild(iframe);
      }
      return iframe;
    },
    
    createForm: (action, data) => {
      const form = document.createElement('form');
      form.method = 'POST';
      form.target = 'hidden_iframe';
      form.action = action;
      
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = 'data';
      input.value = JSON.stringify(data);
      form.appendChild(input);
      
      return form;
    }
  };

  // تعريف واجهة API الرئيسية
  const api = {
    // إرسال البيانات إلى Google Sheets
    async postToSheet(payload) {
      if (!state.SHEETS_URL) {
        throw new Error('لم يتم تحديد رابط Google Sheets');
      }
      
      return new Promise((resolve, reject) => {
        try {
          console.log('📤 إرسال البيانات:', payload);
          const form = utils.createForm(state.SHEETS_URL, payload);
          const iframe = utils.createHiddenIframe();
          
          iframe.onload = () => {
            console.log('✅ تم إرسال البيانات بنجاح');
            resolve(true);
          };
          
          document.body.appendChild(form);
          form.submit();
          setTimeout(() => form.remove(), 100);
        } catch (error) {
          console.error('❌ خطأ في إرسال البيانات:', error);
          reject(error);
        }
      });
    },
    
    // استرجاع البيانات من Google Sheets
    async syncFromSheet(dataType = 'all') {
      if (!state.SHEETS_URL) {
        console.warn('❌ لم يتم تحديد رابط Google Sheets');
        return null;
      }
      
      return new Promise((resolve, reject) => {
        const callbackName = utils.generateCallbackName();
        const script = document.createElement('script');
        
        window[callbackName] = (result) => {
          delete window[callbackName];
          script.remove();
          
          if (!result) {
            console.warn('❌ لم يتم استلام بيانات');
            resolve(null);
            return;
          }
          
          console.log('✅ تم استلام البيانات بنجاح');
          resolve(result);
        };
        
        script.onerror = () => {
          delete window[callbackName];
          script.remove();
          reject(new Error('فشل في تحميل البيانات'));
        };
        
        script.src = `${state.SHEETS_URL}?callback=${callbackName}&type=${dataType}`;
        document.body.appendChild(script);
      });
    },
    
    // فحص عدد الصفوف
    async getSheetRowCount() {
      if (!state.SHEETS_URL) {
        return state.lastRowCount;
      }
      
      return new Promise((resolve) => {
        const callbackName = utils.generateCallbackName();
        const script = document.createElement('script');
        
        window[callbackName] = (result) => {
          delete window[callbackName];
          script.remove();
          const count = result?.rowCount || state.lastRowCount;
          state.lastRowCount = count;
          resolve(count);
        };
        
        script.src = `${state.SHEETS_URL}?callback=${callbackName}&type=get_row_count`;
        document.body.appendChild(script);
      });
    },
    
    // دمج البيانات الجديدة
    async mergeNewSheetData() {
      if (!window.state || !window.cloud) {
        console.warn('⚠️ المكونات الأساسية غير متوفرة');
        return false;
      }
      
      console.log('🔄 فحص البيانات الجديدة من Google Sheets...');
      const sheetData = await this.syncFromSheet('all');
      
      if (!sheetData) {
        console.warn('⚠️ لا يمكن الوصول إلى Google Sheets');
        return false;
      }
      
      let hasChanges = false;
      
      try {
        // إضافة العناصر الجديدة من المخزون
        if (Array.isArray(sheetData.inventory)) {
          for (const item of sheetData.inventory) {
            if (item.id && !window.state.inventory.some(i => i.id === item.id)) {
              await window.cloud.addInventory(item);
              hasChanges = true;
              console.log('✅ تم إضافة عنصر جديد:', item.name);
            }
          }
        }
        
        // إضافة السلفيات الجديدة
        if (Array.isArray(sheetData.loans)) {
          for (const loan of sheetData.loans) {
            if (loan.id && !window.state.loans.some(l => l.id === loan.id)) {
              await window.cloud.addLoan(loan);
              hasChanges = true;
              console.log('✅ تم إضافة إعارة جديدة');
            }
          }
        }
        
        // إضافة الإرجاعات الجديدة
        if (Array.isArray(sheetData.returns)) {
          for (const ret of sheetData.returns) {
            if (ret.id && !window.state.returns.some(r => r.id === ret.id)) {
              await window.cloud.addReturn(ret);
              hasChanges = true;
              console.log('✅ تم إضافة إرجاع جديد');
            }
          }
        }
        
        console.log(hasChanges ? '✅ تم دمج البيانات الجديدة بنجاح!' : 'ℹ️ لا توجد بيانات جديدة');
        return hasChanges;
        
      } catch (error) {
        console.error('❌ خطأ في دمج البيانات:', error);
        return false;
      }
    },
    
    // بدء المراقبة التلقائية
    startAutoSync(intervalSeconds = 15) {
      if (state.isAutoSyncEnabled) {
        console.log('⚠️ المراقبة التلقائية قيد التشغيل بالفعل');
        return;
      }
      
      console.log(`📡 بدء المراقبة التلقائية (كل ${intervalSeconds} ثانية)...`);
      state.isAutoSyncEnabled = true;
      
      this.getSheetRowCount().then(count => {
        state.lastRowCount = count;
        console.log(`✅ عدد الصفوف الحالي: ${count}`);
      });
      
      state.syncCheckInterval = setInterval(async () => {
        try {
          const currentRowCount = await this.getSheetRowCount();
          if (currentRowCount > state.lastRowCount) {
            console.log(`📨 تم اكتشاف ${currentRowCount - state.lastRowCount} صفوف جديدة`);
            state.lastRowCount = currentRowCount;
            await this.mergeNewSheetData();
          }
        } catch (error) {
          console.warn('❌ خطأ في فحص التحديثات:', error.message);
        }
      }, intervalSeconds * 1000);
      
      console.log('✅ المراقبة التلقائية نشطة');
    },
    
    // إيقاف المراقبة التلقائية
    stopAutoSync() {
      if (state.syncCheckInterval) {
        clearInterval(state.syncCheckInterval);
        state.syncCheckInterval = null;
        state.isAutoSyncEnabled = false;
        console.log('⏹️ تم إيقاف المراقبة التلقائية');
      }
    },
    
    // فحص حالة المراقبة التلقائية
    isAutoSyncEnabled() {
      return state.isAutoSyncEnabled;
    }
  };

  // تعريف hooks للتطبيق
  window.gsheetHooks = {
    inventory: {
      onAdd: (row) => {
        api.postToSheet({ 
          type: 'inventory_add',
          timestamp: new Date().toLocaleString('ar-SA'),
          data: row 
        });
      },
      onUpdate: (id, changes) => {
        api.postToSheet({ 
          type: 'inventory_update',
          timestamp: new Date().toLocaleString('ar-SA'),
          id,
          changes 
        });
      },
      onDelete: (id) => {
        api.postToSheet({ 
          type: 'inventory_delete',
          timestamp: new Date().toLocaleString('ar-SA'),
          id 
        });
      }
    },
    loans: {
      onAdd: (row) => {
        api.postToSheet({ 
          type: 'loan_add',
          timestamp: new Date().toLocaleString('ar-SA'),
          data: row 
        });
      },
      onDelete: (id) => {
        api.postToSheet({ 
          type: 'loan_delete',
          timestamp: new Date().toLocaleString('ar-SA'),
          id 
        });
      }
    },
    returns: {
      onAdd: (row) => {
        api.postToSheet({ 
          type: 'return_add',
          timestamp: new Date().toLocaleString('ar-SA'),
          data: row 
        });
      },
      onDelete: (id) => {
        api.postToSheet({ 
          type: 'return_delete',
          timestamp: new Date().toLocaleString('ar-SA'),
          id 
        });
      }
    }
  };

  // تصدير الواجهة العامة
  window.sheetSync = api;

  // واجهة cloud
  if (!window.cloud) {
    const subscribers = {
      inventory: new Set(),
      loans: new Set(),
      returns: new Set()
    };

    function notify(kind, rows) {
      try {
        const list = Array.isArray(rows) ? rows.filter(item => item && typeof item === 'object') : [];
        if (window.state && typeof window.state === 'object') {
          window.state[kind] = list;
        }
        subscribers[kind].forEach(cb => {
          try { 
            cb(list); 
          } catch (e) { 
            console.warn(`خطأ في معالج ${kind}:`, e); 
          }
        });
      } catch (e) { 
        console.warn('خطأ في إخطار المشتركين:', e); 
      }
    }

    const genId = (prefix = 's') => 
      `${prefix}${Date.now().toString(36)}${Math.floor(Math.random()*9000+1000).toString(36)}`;

    window.cloud = {
      addInventory: async (item) => {
        const rec = { ...item, id: item.id || genId('i') };
        await api.postToSheet({ type: 'inventory_add', timestamp: new Date().toISOString(), data: rec });
        const data = await api.syncFromSheet('inventory');
        if (data) notify('inventory', data);
        return rec;
      },
      updateInventory: async (id, changes) => {
        await api.postToSheet({ type: 'inventory_update', timestamp: new Date().toISOString(), id, changes });
        const data = await api.syncFromSheet('inventory');
        if (data) notify('inventory', data);
      },
      deleteInventory: async (id) => {
        await api.postToSheet({ type: 'inventory_delete', timestamp: new Date().toISOString(), id });
        const data = await api.syncFromSheet('inventory');
        if (data) notify('inventory', data);
      },
      addLoan: async (rec) => {
        const r = { ...rec, id: rec.id || genId('l') };
        await api.postToSheet({ type: 'loan_add', timestamp: new Date().toISOString(), data: r });
        const data = await api.syncFromSheet('loans');
        if (data) notify('loans', data);
        return r;
      },
      deleteLoan: async (id) => {
        await api.postToSheet({ type: 'loan_delete', timestamp: new Date().toISOString(), id });
        const data = await api.syncFromSheet('loans');
        if (data) notify('loans', data);
      },
      addReturn: async (rec) => {
        const r = { ...rec, id: rec.id || genId('r') };
        await api.postToSheet({ type: 'return_add', timestamp: new Date().toISOString(), data: r });
        const data = await api.syncFromSheet('returns');
        if (data) notify('returns', data);
        return r;
      },
      deleteReturn: async (id) => {
        await api.postToSheet({ type: 'return_delete', timestamp: new Date().toISOString(), id });
        const data = await api.syncFromSheet('returns');
        if (data) notify('returns', data);
      },
      subscribeInventory: (cb) => {
        subscribers.inventory.add(cb);
        api.syncFromSheet('inventory').then(data => data && cb(data));
        return () => subscribers.inventory.delete(cb);
      },
      subscribeLoans: (cb) => {
        subscribers.loans.add(cb);
        api.syncFromSheet('loans').then(data => data && cb(data));
        return () => subscribers.loans.delete(cb);
      },
      subscribeReturns: (cb) => {
        subscribers.returns.add(cb);
        api.syncFromSheet('returns').then(data => data && cb(data));
        return () => subscribers.returns.delete(cb);
      }
    };

    console.log('✅ تم تهيئة واجهة cloud مع جسر Google Sheets');
  }

  console.log('✅ تم تهيئة Google Sheets Sync مع المراقبة التلقائية');

})();
