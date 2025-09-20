(function(){
  const firebaseConfig = {
    apiKey: "AIzaSyABcgFsnD9sbSU2pEgeZ-nIqqkkwoSrjkk",
    authDomain: "love-750fd.firebaseapp.com",
    projectId: "love-750fd",
    storageBucket: "love-750fd.appspot.com",
    messagingSenderId: "735960497326",
    appId: "1:735960497326:web:2ac6e22aed03c24d6e813f",
    measurementId: "G-1ZEKYE99LJ"
  };
  firebase.initializeApp(firebaseConfig);
  window.fb = {
    auth: firebase.auth(),
    db: firebase.firestore(),
    googleProvider: new firebase.auth.GoogleAuthProvider()
  };
})();
