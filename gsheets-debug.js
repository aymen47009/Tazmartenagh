// أدوات تشخيص مشاكل Google Sheets
window.sheetsDebug = {
    // اختبار الاتصال بـ Google Sheets
    async testConnection() {
        const url = window.gsheetSyncConfig?.endpointUrl;
        if (!url) {
            console.error('❌ لم يتم تكوين عنوان Google Sheets');
            return false;
        }

        try {
            console.log('🔄 جاري اختبار الاتصال مع:', url);
            const response = await fetch(url, {
                method: 'POST',
                body: JSON.stringify({
                    type: 'sync_read',
                    dataType: 'all'
                })
            });

            if (!response.ok) {
                console.error('❌ فشل الاتصال - الحالة:', response.status);
                console.error('السبب:', await response.text());
                return false;
            }

            const data = await response.json();
            console.log('✅ تم الاتصال بنجاح!');
            console.log('📊 البيانات المستلمة:', data);
            return true;
        } catch (error) {
            console.error('❌ خطأ في الاتصال:', error.message);
            return false;
        }
    },

    // التحقق من تكوين Google Sheets
    checkConfig() {
        console.log('🔍 فحص تكوين Google Sheets:');
        
        if (!window.gsheetSyncConfig) {
            console.error('❌ ملف التكوين gsheets-config.js غير موجود أو لم يتم تحميله');
            return false;
        }

        console.log('- enabled:', window.gsheetSyncConfig.enabled);
        console.log('- endpointUrl:', window.gsheetSyncConfig.endpointUrl);

        if (!window.gsheetSyncConfig.enabled) {
            console.warn('⚠️ المزامنة معطلة في ملف التكوين');
            return false;
        }

        if (!window.gsheetSyncConfig.endpointUrl) {
            console.error('❌ لم يتم تعيين عنوان URL للـ Apps Script');
            return false;
        }

        return true;
    },

    // فحص حالة المزامنة
    async checkSyncStatus() {
        console.log('🔍 فحص حالة المزامنة:');
        
        if (!window.sheetSync) {
            console.error('❌ وحدة المزامنة غير متوفرة');
            return;
        }

        // فحص حالة المزامنة التلقائية
        console.log('- المزامنة التلقائية:', window.sheetSync.isAutoSyncEnabled() ? 'نشطة' : 'متوقفة');

        // محاولة مزامنة وفحص النتائج
        try {
            console.log('🔄 جاري جلب البيانات...');
            const data = await window.sheetSync.syncFromSheet('all');
            
            if (!data) {
                console.error('❌ فشل جلب البيانات');
                return;
            }

            console.log('✅ تم جلب البيانات بنجاح:');
            console.log('- عدد عناصر المخزون:', (data.inventory || []).length);
            console.log('- عدد السلفيات:', (data.loans || []).length);
            console.log('- عدد الإرجاعات:', (data.returns || []).length);
        } catch (error) {
            console.error('❌ خطأ في المزامنة:', error.message);
        }
    },

    // تشغيل جميع الفحوصات
    async runAllChecks() {
        console.log('🔍 بدء فحص شامل لـ Google Sheets...');
        
        console.log('\n1️⃣ فحص التكوين:');
        const configOk = this.checkConfig();
        
        if (configOk) {
            console.log('\n2️⃣ اختبار الاتصال:');
            const connectionOk = await this.testConnection();
            
            if (connectionOk) {
                console.log('\n3️⃣ فحص حالة المزامنة:');
                await this.checkSyncStatus();
            }
        }
        
        console.log('\n✨ اكتمل الفحص الشامل');
    }
};

// إضافة زر للفحص في واجهة المستخدم وإدارة حالته
window.initGSheetsDebugButton = () => {
    // إزالة الزر القديم إذا وجد
    const existingButton = document.getElementById('gsheets-debug-btn');
    if (existingButton) {
        existingButton.remove();
    }

    // إنشاء الزر الجديد
    const button = document.createElement('button');
    button.id = 'gsheets-debug-btn';
    button.className = 'btn secondary';
    button.textContent = 'حالة Google Sheets';
    button.onclick = () => {
        window.sheetsDebug.runAllChecks().then(() => {
            // تحديث حالة الزر بعد الفحص
            updateButtonStatus();
        });
    };
    
    // دالة تحديث حالة الزر
    function updateButtonStatus() {
        if (window.cloud && window.sheetSync) {
            button.classList.remove('danger');
            button.classList.add('success');
            button.textContent = '✓ متصل بـ Google Sheets';
        } else {
            button.classList.remove('success');
            button.classList.add('danger');
            button.textContent = '× غير متصل بـ Google Sheets';
        }
    }

    // إضافة الزر في المكان المناسب
    if (document.getElementById('view-shell') && document.getElementById('view-shell').classList.contains('hidden')) {
        // إذا لم يكن المستخدم مسجل الدخول، أضف الزر في منطقة تسجيل الدخول
        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            const container = document.createElement('div');
            container.className = 'login-status';
            container.style.textAlign = 'center';
            container.style.marginTop = '10px';
            container.appendChild(button);
            loginForm.parentNode.insertBefore(container, loginForm.nextSibling);
        }
    } else {
        // إذا كان المستخدم مسجل الدخول، أضف الزر في شريط الأدوات
        const toolbar = document.querySelector('.top-actions');
        if (toolbar) {
            toolbar.insertBefore(button, toolbar.firstChild);
        }
    }

    // تحديث حالة الزر مباشرة
    updateButtonStatus();

    // إعادة تحديث حالة الزر كل 30 ثانية
    setInterval(updateButtonStatus, 30000);
};

// استدعاء الدالة عند تحميل الصفحة
window.addEventListener('DOMContentLoaded', () => {
    window.initGSheetsDebugButton();
});

// إضافة مراقب لتغيير حالة تسجيل الدخول
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        window.initGSheetsDebugButton();
    }
});