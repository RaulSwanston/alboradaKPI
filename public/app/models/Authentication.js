import { auth, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, getAdditionalUserInfo } from "../core/firebase.js";
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