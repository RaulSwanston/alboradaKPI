import { db, doc, setDoc, serverTimestamp } from "../core/firebase.js";

export async function createUserProfile(user, name) {
  const userDocRef = doc(db, "users", user.uid);
  await setDoc(userDocRef, {
    email: user.email,
    displayName: name || user.displayName || user.email.split('@')[0],
    role: 'resident', // Por defecto, todos los nuevos usuarios son residentes
    propertyId: ['PENDING_ASSIGNMENT'],
    createdAt: serverTimestamp()
  });
}