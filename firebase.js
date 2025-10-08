// Firebase Firestore integration (optional). Uses modular CDN SDK.
// Requires a global window.firebaseConfig object defined in firebase-config.js

if (window.firebaseConfig) {
  const appScript = 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
  const fsScript = 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

  (async () => {
    const [{ initializeApp }, { getFirestore, collection, addDoc, setDoc, doc, deleteDoc, onSnapshot, query, orderBy } ] = await Promise.all([
      import(appScript),
      import(fsScript)
    ]);

    const app = initializeApp(window.firebaseConfig);
    const db = getFirestore(app);

    const colInventory = collection(db, 'inventory');
    const colLoans = collection(db, 'loans');
    const colReturns = collection(db, 'returns');

    async function addInventory(item){ await addDoc(colInventory, item); }
    async function updateInventory(id, data){ await setDoc(doc(colInventory, id), data, { merge: true }); }
    async function deleteInventory(id){ await deleteDoc(doc(colInventory, id)); }

    async function addLoan(rec){ await addDoc(colLoans, rec); }
    async function deleteLoan(id){ await deleteDoc(doc(colLoans, id)); }

    async function addReturn(rec){ await addDoc(colReturns, rec); }
    async function deleteReturn(id){ await deleteDoc(doc(colReturns, id)); }

    function subscribeInventory(cb){
      return onSnapshot(query(colInventory, orderBy('name')), snap => {
        cb(snap.docs.map(d=> ({ id: d.id, ...d.data() })));
      });
    }
    function subscribeLoans(cb){
      return onSnapshot(query(colLoans, orderBy('date','desc')), snap => {
        cb(snap.docs.map(d=> ({ id: d.id, ...d.data() })));
      });
    }
    function subscribeReturns(cb){
      return onSnapshot(query(colReturns, orderBy('date','desc')), snap => {
        cb(snap.docs.map(d=> ({ id: d.id, ...d.data() })));
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


