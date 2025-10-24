// دوال تحويل البيانات من تنسيق Google Sheets إلى تنسيق التطبيق
window.sheetsTransform = {
    // تحويل بيانات المخزون
    transformInventory: function(rawData) {
        if (!Array.isArray(rawData)) return [];
        
        return rawData.map((row, index) => {
            // تحويل الصف إلى الشكل المطلوب للتطبيق
            return {
                id: `item_${row['رقم'] || (index + 1)}`,
                name: row['اسم العتاد'] || '',
                initialQty: Number(row['الكمية الأصلية']) || 0,
                totalQty: Number(row['الكمية الكلية']) || 0,
                notes: row['الملاحظات'] || ''
            };
        }).filter(item => item.name); // تجاهل الصفوف الفارغة
    },

    // تحويل بيانات السلفيات
    transformLoans: function(rawData) {
        if (!Array.isArray(rawData)) return [];
        
        return rawData.map((row, index) => ({
            id: `loan_${row['رقم'] || (index + 1)}`,
            itemName: row['اسم العتاد'] || '',
            qty: Number(row['الكمية'] || 0),
            person: row['المستلف'] || '',
            phone: row['رقم الهاتف'] || '',
            dept: row['القسم'] || '',
            date: row['تاريخ السلف'] || '',
            due: row['تاريخ الإرجاع المتوقع'] || '',
            returnedQty: Number(row['الكمية المرجعة'] || 0)
        })).filter(loan => loan.itemName && loan.qty > 0);
    },

    // تحويل بيانات الإرجاعات
    transformReturns: function(rawData) {
        if (!Array.isArray(rawData)) return [];
        
        return rawData.map((row, index) => ({
            id: `return_${row['رقم'] || (index + 1)}`,
            date: row['تاريخ الإرجاع'] || '',
            itemName: row['اسم العتاد'] || '',
            qty: Number(row['الكمية المرجعة'] || 0),
            damaged: Number(row['الكمية التالفة'] || 0),
            notes: row['الملاحظات'] || '',
            loanId: row['رقم السلفية'] || null
        })).filter(ret => ret.itemName && ret.qty > 0);
    }
};