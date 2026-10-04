// A small in-memory stand-in for Firebase (auth + Firestore) shared by several
// simulated devices. It enforces the same rule as firestore.rules (an update must
// be newer than what's stored) and can take one device offline, queueing its writes.

const clone = v => JSON.parse(JSON.stringify(v));

function createBackend(){
  return { docs: new Map(), listeners: [], users: { 'fan@example.test': 'correct-horse' } };
}

function fakeFirebase(backend){
  const client = { offline: false, queue: [], user: null, authCbs: [] };

  function deliver(key, data, existed, writer){
    const col = key.slice(0, key.lastIndexOf('/')), id = key.slice(key.lastIndexOf('/') + 1);
    backend.listeners.forEach(l => {
      if(l.col !== col || l.client.offline) return;
      // Like Firestore, a device sees its own write first as a pending local change
      const change = { type: existed ? 'modified' : 'added', doc: { id, data: () => clone(data), metadata: { hasPendingWrites: l.client === writer } } };
      setTimeout(() => l.cb({ docChanges: () => [change] }), 0);
    });
  }

  function commit(key, data){
    const existing = backend.docs.get(key);
    if(existing && !(data.updatedAt > existing.updatedAt)){
      const err = new Error('Missing or insufficient permissions.'); err.code = 'permission-denied';
      return Promise.reject(err);
    }
    backend.docs.set(key, clone(data));
    deliver(key, data, !!existing, client);
    return Promise.resolve();
  }

  function docRef(path){
    return {
      collection: name => colRef(path + '/' + name),
      set(data){
        if(client.offline) return new Promise((resolve, reject) => client.queue.push({ path, data: clone(data), resolve, reject }));
        return commit(path, data);
      },
      get(){
        const d = backend.docs.get(path);
        return Promise.resolve({ exists: !!d, data: () => clone(d) });
      }
    };
  }
  function colRef(path){
    return {
      doc: id => docRef(path + '/' + id),
      onSnapshot(cb){
        const l = { col: path, cb, client };
        backend.listeners.push(l);
        const changes = [...backend.docs.entries()].filter(([k]) => k.startsWith(path + '/')).map(([k, d]) =>
          ({ type: 'added', doc: { id: k.slice(path.length + 1), data: () => clone(d), metadata: { hasPendingWrites: false } } }));
        setTimeout(() => cb({ docChanges: () => changes }), 0);
        return () => { backend.listeners = backend.listeners.filter(x => x !== l); };
      }
    };
  }
  const db = { collection: name => colRef(name), enablePersistence: () => Promise.resolve() };

  const auth = {
    onAuthStateChanged(cb){ client.authCbs.push(cb); setTimeout(() => cb(client.user), 0); },
    signInWithEmailAndPassword(email, pw){
      if(backend.users[email] !== pw){ const e = new Error('bad'); e.code = 'auth/invalid-credential'; return Promise.reject(e); }
      client.user = { uid: 'uid-1', email };
      client.authCbs.forEach(cb => cb(client.user));
      return Promise.resolve({ user: client.user });
    },
    signOut(){ client.user = null; client.authCbs.forEach(cb => cb(null)); return Promise.resolve(); }
  };

  const firebase = {
    apps: [],
    initializeApp(){ this.apps.push({}); },
    auth: () => auth,
    firestore: () => db
  };

  // Test controls
  firebase._goOffline = () => { client.offline = true; };
  firebase._goOnline = async () => {
    client.offline = false;
    const q = client.queue.splice(0);
    for(const w of q) await commit(w.path, w.data).then(w.resolve, w.reject);
    // Catch up on everything changed while offline
    backend.listeners.filter(l => l.client === client).forEach(l => {
      const changes = [...backend.docs.entries()].filter(([k]) => k.startsWith(l.col + '/')).map(([k, d]) =>
        ({ type: 'modified', doc: { id: k.slice(l.col.length + 1), data: () => clone(d), metadata: { hasPendingWrites: false } } }));
      setTimeout(() => l.cb({ docChanges: () => changes }), 0);
    });
  };
  return firebase;
}

module.exports = { createBackend, fakeFirebase };
