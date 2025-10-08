// Firebase Realtime Database integration (optional). Uses modular CDN SDK.
// Requires a global window.firebaseConfig object defined in firebase-config.js

if (window.firebaseConfig) {
  const appScript = 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
  const dbScript = 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';

  (async () => {
    const [{ initializeApp }, { getDatabase, ref, push, set, update, remove, onValue } ] = await Promise.all([
      import(appScript),
      import(dbScript)
    ]);

    const app = initializeApp(window.firebaseConfig);
    const db = getDatabase(app);

    const pathInventory = 'inventory';
    const pathLoans = 'loans';
    const pathReturns = 'returns';

    async function addInventory(item){ await push(ref(db, pathInventory), item); }
    async function updateInventory(id, data){ await update(ref(db, `${pathInventory}/${id}`), data); }
    async function deleteInventory(id){ await remove(ref(db, `${pathInventory}/${id}`)); }

    async function addLoan(rec){ await push(ref(db, pathLoans), rec); }
    async function deleteLoan(id){ await remove(ref(db, `${pathLoans}/${id}`)); }

    async function addReturn(rec){ await push(ref(db, pathReturns), rec); }
    async function deleteReturn(id){ await remove(ref(db, `${pathReturns}/${id}`)); }

    function snapToArray(snap){
      const val = snap.val() || {};
      return Object.keys(val).map(id => ({ id, ...val[id] }));
    }

    function subscribeInventory(cb){
      return onValue(ref(db, pathInventory), (snap)=>{
        const rows = snapToArray(snap).sort((a,b)=> (a.name||'').localeCompare(b.name||'', 'ar'));
        cb(rows);
      });
    }
    function subscribeLoans(cb){
      return onValue(ref(db, pathLoans), (snap)=>{
        const rows = snapToArray(snap).sort((a,b)=> (b.date||'').localeCompare(a.date||''));
        cb(rows);
      });
    }
    function subscribeReturns(cb){
      return onValue(ref(db, pathReturns), (snap)=>{
        const rows = snapToArray(snap).sort((a,b)=> (b.date||'').localeCompare(a.date||''));
        cb(rows);
      });
    }

    window.cloud = {
      addInventory, updateInventory, deleteInventory,
      addLoan, deleteLoan,
      addReturn, deleteReturn,
      subscribeInventory, subscribeLoans, subscribeReturns
    };
  })();
}


