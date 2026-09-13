import { auth, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, getAdditionalUserInfo, EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "../core/firebase.js";
import { createUserProfile } from "./Profile.js";

export async function handleGoogleAuthentication() {
  const provider = new GoogleAuthProvider();
  try {
    const result = await signInWithPopup(auth, provider);
    const isNewUser = getAdditionalUserInfo(result).isNewUser;
    if (isNewUser) { await createUserProfile(result.user); }
    return { success: true, user: result.user };
  } catch (error) {
    return { success: false, error: error };
  }
}

export async function handleSignInWithEmailAndPassword(email, password) {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const isNewUser = getAdditionalUserInfo(userCredential).isNewUser;
    if (isNewUser) { await createUserProfile(userCredential.user); }
    return { success: true, user: userCredential.user };
  } catch (error) {
    return { success: false, error: error };
  }
}

export async function handleCreateUserWithEmailAndPassword(userName, email, password) {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    await sendEmailVerification(userCredential.user);
    await createUserProfile(userCredential.user, userName);
    return { success: true, user: userCredential.user };
  } catch (error) {
    return { success: false, error: error };
  }
}

export async function handleSendPasswordResetEmail(email) {
  try {
    await sendPasswordResetEmail(auth, email);
    return { success: true };
  } catch (error) {
    return { success: false, error: error };
  }
}

/**
 * Determina el/los métodos de autenticación vinculados a un usuario.
 * Fuente de verdad: user.providerData (providers con los que se ha iniciado sesión).
 * @param {import("firebase/auth").User|null} user - Usuario de Firebase. Por defecto el actual.
 * @returns {{ providerIds: string[], hasPasswordProvider: boolean, hasGoogleProvider: boolean, isGoogleOnlySignIn: boolean }}
 */
export function getAuthMethod(user = auth.currentUser) {
  const providerIds = (user?.providerData || []).map((p) => p.providerId);
  const hasPasswordProvider = providerIds.includes('password');
  const hasGoogleProvider = providerIds.includes('google.com');
  return {
    providerIds,
    hasPasswordProvider,
    hasGoogleProvider,
    isGoogleOnlySignIn: hasGoogleProvider && !hasPasswordProvider,
  };
}

/**
 * Cambia la contraseña del usuario actual (requiere reautenticación con la contraseña actual).
 * @param {string} currentPassword - Contraseña actual del usuario.
 * @param {string} newPassword - Nueva contraseña.
 * @returns {Promise<{success: boolean, error?: Error}>}
 */
export async function handleChangePassword(currentPassword, newPassword) {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error('No autenticado');

    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, credential);
    await updatePassword(user, newPassword);
    return { success: true };
  } catch (error) {
    return { success: false, error: error };
  }
}