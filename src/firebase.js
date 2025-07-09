// src/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyB7EsBjunwaoU2iRhnfQZWcQmAlhTI6X70",
  authDomain: "clendar-2fb56.firebaseapp.com",
  projectId: "clendar-2fb56",
  storageBucket: "clendar-2fb56.firebasestorage.app",
  messagingSenderId: "826559379687",
  appId: "1:826559379687:web:ece39c7b22053dd1490a42"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
