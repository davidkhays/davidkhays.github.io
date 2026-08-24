// Shared Firebase setup for cacaofarm. Config values here are meant to be public — Firebase's
// actual security boundary is firestore.rules, not hiding these (see CACAOFARM.md).
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBsLSmaX19W4O3TVCY9OBJSp6IvJQThX48",
  authDomain: "davidkhays-cacaofarm.firebaseapp.com",
  projectId: "davidkhays-cacaofarm",
  storageBucket: "davidkhays-cacaofarm.firebasestorage.app",
  messagingSenderId: "982586990793",
  appId: "1:982586990793:web:cd2ba5758ff4d7e2786d18",
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
