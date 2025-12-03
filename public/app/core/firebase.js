// --- Configuración de Firebase ---
// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-analytics.js";

// Proporciona el SDK de Firebase Authentication: gestiona usuarios, inicio de sesión (OAuth, correo/contraseña) y tokens de seguridad (JWT) para asegurar el acceso a los servicios de Firebase.
import { getAuth, onAuthStateChanged, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, signInWithCredential, getAdditionalUserInfo, sendPasswordResetEmail, sendEmailVerification } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";

// Proporciona el SDK de Cloud Firestore: una base de datos NoSQL en tiempo real para almacenar y sincronizar datos de forma segura entre el cliente y la nube.
import { getFirestore, doc, getDoc, setDoc, collection, query, where, orderBy, getDocs, serverTimestamp, addDoc, onSnapshot, deleteDoc, updateDoc, runTransaction, writeBatch } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

// Proporciona el SDK de Firebase Storage: gestiona la carga, descarga y acceso seguro a archivos binarios (imágenes, videos, documentos) en la nube para su acceso desde cualquier lugar.
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-storage.js";

// Proporciona el SDK de Firebase AI: permite integrar modelos de IA en aplicaciones web para tareas como análisis de datos, generación de contenido, etc.
import { getAI, getGenerativeModel, GoogleAIBackend } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-ai.js";

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAfb-hN3jJSaPHZ3JMVJyXIjkIc_-NPyGg",
  authDomain: "alboradakpi.firebaseapp.com",
  projectId: "alboradakpi",
  storageBucket: "alboradakpi.firebasestorage.app",
  messagingSenderId: "137214990147",
  appId: "1:137214990147:web:09ed9f77b6830a997601f6",
  measurementId: "G-Y23MSYLH7B"
};

// Initialize FirebaseApp
const app = initializeApp(firebaseConfig);
export const analytics = getAnalytics(app);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const ai = getAI(app, { backend: new GoogleAIBackend() }); // Initialize the Gemini Developer API backend service

/**
 * @summary Espera a que Firebase Auth inicialice y devuelve el usuario actual.
 * @returns {Promise<User|null>} Promesa que se resuelve con el usuario o null.
 */
export function waitForAuth() {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe(); // Nos desuscribimos inmediatamente para que sea una sola comprobación
      resolve(user);
    });
  });
}

export { signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, signInWithCredential, getAdditionalUserInfo, sendPasswordResetEmail, sendEmailVerification, doc, getDoc, setDoc, collection, query, where, orderBy, getDocs, serverTimestamp, addDoc, onSnapshot, deleteDoc, updateDoc, runTransaction, writeBatch, ref, uploadBytes, getDownloadURL, getGenerativeModel };