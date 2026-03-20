const admin = require('firebase-admin');
const serviceAccount = require('./alboradakpi-firebase-adminsdk-fbsvc-69c9c8ac57.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();
const auth = admin.auth();

async function promoteToAdmin(email) {
  try {
    console.log(`Iniciando ascenso a administrador para: ${email}`);
    
    // 1. Obtener el usuario por email
    const userRecord = await auth.getUserByEmail(email);
    const uid = userRecord.uid;
    console.log(`UID encontrado: ${uid}`);

    // 2. Establecer Custom Claims
    await auth.setCustomUserClaims(uid, { admin: true });
    console.log('Custom Claims "admin: true" asignado con éxito en Firebase Auth.');

    // 3. Actualizar el rol en Firestore para consistencia visual/datos
    await db.collection('users').doc(uid).update({
      role: 'admin'
    });
    console.log('Documento en Firestore actualizado con rol: "admin".');

    console.log(`¡Éxito! El usuario ${email} ahora tiene privilegios de administrador.`);
    process.exit(0);
  } catch (error) {
    console.error('Error al promover al usuario:', error.message);
    process.exit(1);
  }
}

promoteToAdmin('day24just@gmail.com');
