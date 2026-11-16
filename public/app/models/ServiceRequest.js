import { db, collection, doc, writeBatch, serverTimestamp, query, where, orderBy, getDocs, getDoc, updateDoc } from "../core/firebase.js";
import Transaction from "./Transaction.js";
import { createActivity } from "./Activities.js";
import { isD1, d1CreateServiceRequest, d1ServiceRequests, d1ApproveServiceRequest, d1RejectServiceRequest } from "../core/api.js";

export default class ServiceRequest {
  static async create(data, initiator) {
    if (isD1()) {
      try {
        const result = await d1CreateServiceRequest({ ...data, residentUid: initiator?.id, residentName: initiator?.name });
        return result.id;
      } catch (error) {
        console.error("[ServiceRequest] Error D1 al crear solicitud:", error);
        throw error;
      }
    }
    try {
      const batch = writeBatch(db);

      const requestRef = doc(collection(db, "serviceRequests"));
      batch.set(requestRef, {
        propertyId: data.propertyId,
        chargeConceptId: data.chargeConceptId,
        conceptName: data.conceptName,
        requestDate: serverTimestamp(),
        status: 'pending_approval',
        residentNotes: data.residentNotes || '',
        adminNotes: '',
        finalAmount: data.finalAmount || 0,
        residentUid: initiator.id,
        residentName: initiator.name || '',
        createdAt: serverTimestamp()
      });

      const activityRef = doc(collection(db, "activities"));
      batch.set(activityRef, {
        timestamp: serverTimestamp(),
        type: 'SERVICE_REQUESTED',
        description: `Nueva solicitud: ${data.conceptName} para unidad ${data.propertyId}`,
        initiator: { type: 'USER', id: initiator.id, name: initiator.name },
        target: { type: 'PROPERTY', id: data.propertyId, name: `Unidad ${data.propertyId}` },
        visibility: ['admin'],
        details: { serviceRequestId: requestRef.id, chargeConceptId: data.chargeConceptId }
      });

      await batch.commit();
      return requestRef.id;
    } catch (error) {
      console.error("[ServiceRequest] Error al crear solicitud:", error);
      throw error;
    }
  }

  static async getPending() {
    if (isD1()) {
      try { return await d1ServiceRequests({ status: 'pending_approval' }); }
      catch (e) { console.error("[ServiceRequest] Error D1 getPending:", e); throw e; }
    }
    try {
      const q = query(
        collection(db, "serviceRequests"),
        where("status", "==", "pending_approval"),
        orderBy("requestDate", "desc")
      );
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (error) {
      console.error("[ServiceRequest] Error al obtener pendientes:", error);
      throw error;
    }
  }

  static async getByProperty(propertyId) {
    if (isD1()) {
      try { return await d1ServiceRequests({}); }
      catch (e) { console.error("[ServiceRequest] Error D1 getByProperty:", e); throw e; }
    }
    try {
      const q = query(
        collection(db, "serviceRequests"),
        where("propertyId", "==", propertyId),
        orderBy("requestDate", "desc")
      );
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (error) {
      console.error("[ServiceRequest] Error al obtener por propiedad:", error);
      throw error;
    }
  }

  static async getById(id) {
    if (isD1()) {
      try {
        const all = await d1ServiceRequests({});
        return all.find((r) => r.id === id) || null;
      } catch (e) {
        console.error("[ServiceRequest] Error D1 getById:", e);
        throw e;
      }
    }
    try {
      const snap = await getDoc(doc(db, "serviceRequests", id));
      return snap.exists() ? { id: snap.id, ...snap.data() } : null;
    } catch (error) {
      console.error("[ServiceRequest] Error al obtener solicitud:", error);
      throw error;
    }
  }

  static async approve(id, adminData) {
    if (isD1()) {
      try {
        const request = await this.getById(id);
        if (!request) throw new Error("Solicitud no encontrada");
        const result = await d1ApproveServiceRequest(id, { finalAmount: request.finalAmount || 0 });
        return { transactionId: result.chargeId, voucherNumber: result.number || '' };
      } catch (error) {
        console.error("[ServiceRequest] Error D1 al aprobar:", error);
        throw error;
      }
    }
    try {
      const requestRef = doc(db, "serviceRequests", id);
      const snap = await getDoc(requestRef);
      if (!snap.exists()) throw new Error("Solicitud no encontrada");
      const request = { id: snap.id, ...snap.data() };

      const dateObj = new Date();
      const voucher = await Transaction._generateVoucher('FEE', dateObj);
      const period = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
      const amount = -Math.abs(request.finalAmount);

      const propRef = doc(db, "properties", request.propertyId);
      const propSnap = await getDoc(propRef);
      const currentBalance = propSnap.exists() ? (propSnap.data().balance || 0) : 0;

      const batch = writeBatch(db);

      const transRef = doc(collection(db, "transactions"));
      batch.set(transRef, {
        propertyId: request.propertyId,
        amount: amount,
        type: 'FEE',
        description: request.conceptName || 'Servicio solicitado',
        status: 'verified',
        effectiveDate: dateObj,
        period: period,
        pendingAmount: Math.abs(request.finalAmount),
        voucherNumber: voucher.voucherNumber,
        voucherType: voucher.voucherType,
        serviceRequestId: id,
        createdAt: serverTimestamp(),
        metadata: {
          approvedBy: adminData.uid,
          approvedByName: adminData.name
        }
      });

      batch.update(requestRef, {
        status: 'approved',
        adminNotes: adminData.notes || '',
        processedAt: serverTimestamp(),
        processedBy: adminData.uid,
        processedByName: adminData.name,
        transactionId: transRef.id
      });

      batch.update(propRef, {
        balance: currentBalance + amount,
        lastBalanceUpdate: new Date()
      });

      const activityRef = doc(collection(db, "activities"));
      batch.set(activityRef, {
        timestamp: serverTimestamp(),
        type: 'SERVICE_APPROVED',
        description: `Solicitud de ${request.conceptName} aprobada para unidad ${request.propertyId}`,
        initiator: { type: 'USER', id: adminData.uid, name: adminData.name },
        target: { type: 'PROPERTY', id: request.propertyId, name: `Unidad ${request.propertyId}` },
        visibility: ['admin', request.residentUid].filter(Boolean),
        details: {
          serviceRequestId: id,
          transactionId: transRef.id,
          voucherNumber: voucher.voucherNumber,
          amount: Math.abs(request.finalAmount)
        }
      });

      await batch.commit();
      return { transactionId: transRef.id, voucherNumber: voucher.voucherNumber };
    } catch (error) {
      console.error("[ServiceRequest] Error al aprobar solicitud:", error);
      throw error;
    }
  }

  static async reject(id, reason, adminData) {
    if (isD1()) {
      try {
        await d1RejectServiceRequest(id, reason);
        return;
      } catch (error) {
        console.error("[ServiceRequest] Error D1 al rechazar:", error);
        throw error;
      }
    }
    try {
      const ref = doc(db, "serviceRequests", id);
      await updateDoc(ref, {
        status: 'rejected',
        adminNotes: reason || '',
        processedAt: serverTimestamp(),
        processedBy: adminData.uid,
        processedByName: adminData.name
      });

      await createActivity({
        type: 'SERVICE_REJECTED',
        description: `Solicitud rechazada: ${reason || 'Sin motivo'}`,
        initiator: { type: 'USER', id: adminData.uid, name: adminData.name },
        target: { type: 'SERVICEREQUEST', id: id },
        visibility: ['admin']
      });
    } catch (error) {
      console.error("[ServiceRequest] Error al rechazar solicitud:", error);
      throw error;
    }
  }
}
