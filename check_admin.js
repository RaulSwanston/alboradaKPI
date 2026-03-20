const admin = require('firebase-admin');
const serviceAccount = require('./alboradakpi-firebase-adminsdk-fbsvc-69c9c8ac57.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();
const auth = admin.auth();

async function checkUser(email) {
  try {
    console.log(`Buscando usuario: ${email}`);
    const userRecord = await auth.getUserByEmail(email);
    console.log(`UID: ${userRecord.uid}`);
    console.log(`Custom Claims: ${JSON.stringify(userRecord.customClaims || {})}`);

    const userDoc = await db.collection('users').doc(userRecord.uid).get();
    if (userDoc.exists) {
      console.log(`Datos en Firestore: ${JSON.stringify(userDoc.data())}`);
    } else {
      console.log('No se encontró documento en la colección "users" para este UID.');
    }
  } catch (error) {
    console.error(`Error al verificar el usuario ${email}:`, error.message);
  }
}

async function checkUsers() {
  await checkUser('day24just@gmail.com');
  await checkUser('swanston12@gmail.com');
  process.exit(0);
}

checkUsers();
