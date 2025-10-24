// دوال تحويل البيانات من تنسيق Google Sheets إلى تنسيق التطبيق
window.sheetsTransform = {
    // تحويل بيانات المخزون
    transformInventory: function(rawData) {
        if (!Array.isArray(rawData)) return [];
        
        const inventory = rawData.map((row, index) => {
            const item = {
                id: `item_${row['رقم'] || (index + 1)}`,
                name: row['اسم العتاد'] || '',
                initialQty: Number(row['الكمية الأصلية']) || 0,
                totalQty: Number(row['الكمية الكلية']) || 0,
                notes: row['الملاحظات'] || ''
            };
            console.log('تحويل عنصر المخزون:', item);
            return item;
        }).filter(item => item.name); // تجاهل الصفوف الفارغة
        
        console.log('🔄 تم تحويل المخزون:', inventory);
        return inventory;
    },

    // تحويل بيانات السلفيات
    transformLoans: function(rawData) {
        if (!Array.isArray(rawData)) return [];
        
        const loans = rawData.map((row, index) => {
            const loan = {
                id: `loan_${row['رقم'] || (index + 1)}`,
                itemName: row['اسم العتاد'] || '',
                qty: Number(row['الكمية المسلَّفة']) || 0,
                person: row['اسم المستلف'] || '',
                phone: row['رقم هاتف المستلف'] || '',
                dept: row['القسم / الجهة'] || '',
                date: row['تاريخ السلف'] || '',
                due: row['تاريخ الإرجاع المتوقع'] || '',
                returnedQty: Number(row['الكمية المرجعة'] || 0)
            };
            console.log('تحويل سلفية:', loan);
            return loan;
        }).filter(loan => loan.itemName && loan.qty > 0);
        
        console.log('🔄 تم تحويل السلفيات:', loans);
        return loans;
    },

    // تحويل بيانات الإرجاعات
    transformReturns: function(rawData) {
        if (!Array.isArray(rawData)) {
            console.warn('❌ البيانات الخام للإرجاع ليست مصفوفة:', rawData);
            return [];
        }
        
        const returns = rawData.map((row, index) => {
            const ret = {
                id: `return_${row['رقم'] || (index + 1)}`,
                date: row['تاريخ الإرجاع'] || '',
                itemName: row['اسم العتاد'] || '',
                qty: Number(row['الكمية المرجعة'] || 0),
                damaged: Number(row['الكمية التالفة'] || 0),
                notes: row['الملاحظات'] || '',
                loanId: row['رقم السلفية'] || null
            };
            console.log('تحويل إرجاع:', ret);
            return ret;
        }).filter(ret => ret.itemName && ret.qty > 0);
        
        console.log('🔄 تم تحويل الإرجاعات:', returns);
        return returns;
    }
};