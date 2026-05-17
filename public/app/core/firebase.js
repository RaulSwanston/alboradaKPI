// --- Configuración de Firebase ---

// SDK Principal: Inicializa y configura la conexión con tu proyecto de Firebase en la nube. Es el punto de partida para usar cualquier servicio de Firebase.
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";

// Google Analytics: Recopila métricas y telemetría sobre el uso de la aplicación. Esencial para entender el comportamiento de los usuarios y tomar decisiones basadas en datos.
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-analytics.js";

// App Check: Protege los recursos de backend (bases de datos, APIs) contra el abuso, asegurando que las solicitudes provengan únicamente de tu aplicación real y no de clientes no autorizados.
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app-check.js";

// Firebase Authentication: Gestiona el ciclo de vida de la autenticación de usuarios. Permite el registro, inicio de sesión (con email, Google, etc.) y controla la seguridad del acceso.
import { getAuth, onAuthStateChanged, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, signInWithCredential, getAdditionalUserInfo, sendPasswordResetEmail, sendEmailVerification, reload } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";

// Cloud Firestore: Proporciona acceso a una base de datos NoSQL, escalable y en tiempo real. Se utiliza para almacenar, consultar y sincronizar datos (como perfiles de usuario, transacciones, etc.).
import { getFirestore, doc, getDoc, setDoc, collection, query, where, orderBy, getDocs, getCountFromServer, serverTimestamp, addDoc, onSnapshot, deleteDoc, updateDoc, runTransaction, writeBatch, limit, startAfter, arrayUnion } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

// Cloud Storage: Permite almacenar y gestionar archivos y objetos binarios (imágenes, documentos, videos). Ideal para subir y descargar contenido generado por el usuario, como comprobantes de pago.
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-storage.js";

// Firebase AI (Gemini): Integra las capacidades de los modelos de IA generativa de Google (Gemini) directamente en la aplicación, para tareas como análisis, generación de contenido o chatbots.
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

// Habilita el modo de depuración de App Check
self.FIREBASE_APPCHECK_DEBUG_TOKEN = true; // bc55717e-f112-4cf8-aa07-5c77d44f6604 token-depuracion

// Initialize FirebaseApp
const app = initializeApp(firebaseConfig);
export const analytics = getAnalytics(app);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const ai = getAI(app, { backend: new GoogleAIBackend() }); // Initialize the Gemini Developer API backend service
export const appCheck = initializeAppCheck(app, {
  provider: new ReCaptchaV3Provider('6LeRfEUsAAAAAGYOim2yrbu52OIpdZVSKzpZ6HHA'),
  isTokenAutoRefreshEnabled: true
});

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

export { signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, signInWithCredential, getAdditionalUserInfo, sendPasswordResetEmail, sendEmailVerification, reload, doc, getDoc, setDoc, collection, query, where, orderBy, getDocs, getCountFromServer, serverTimestamp, addDoc, onSnapshot, deleteDoc, updateDoc, runTransaction, writeBatch, ref, uploadBytes, getDownloadURL, getGenerativeModel, limit, startAfter, arrayUnion };