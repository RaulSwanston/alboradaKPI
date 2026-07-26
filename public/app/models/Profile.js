import { db, doc, setDoc, serverTimestamp } from "../core/firebase.js";

export async function createUserProfile(user, name) {
  const userDocRef = doc(db, "users", user.uid);
  await setDoc(userDocRef, {
    uid: user.uid,
    email: user.email,
    displayName: name || user.displayName || user.email.split('@')[0],
    role: 'pending', // Estado inicial: Pendiente de verificar email
    isActive: true,  // Activo para explorar; el admin solo lo pondrá en false para banear
    propertyIds: [], // Array vacío para soportar múltiples residencias
    createdAt: serverTimestamp()
  });
}