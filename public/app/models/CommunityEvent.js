import 'temporal-polyfill/global';

import { db, collection, doc, getDocs, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp, query, where, orderBy } from "../core/firebase.js";
import { isD1, d1CommunityEvents, d1CreateCommunityEvent, d1UpdateCommunityEvent, d1DeleteCommunityEvent } from "../core/api.js";

const EVENT_TYPES = ['social', 'birthday', 'meeting', 'maintenance', 'other'];

const toQueryDate = (temporal) => {
  if (temporal instanceof Temporal.ZonedDateTime) {
    return new Date(temporal.epochMilliseconds);
  }
  if (temporal instanceof Temporal.PlainDate) {
    return new Date(`${temporal.toString()}T00:00:00Z`);
  }
  return temporal instanceof Date ? temporal : new Date(temporal);
};

const buildPayload = (data, initiator) => {
  const start = data.start;
  const end = data.end || start;
  return {
    title: data.title,
    description: data.description || '',
    type: EVENT_TYPES.includes(data.type) ? data.type : 'other',
    allDay: !!data.allDay,
    startDate: toQueryDate(start),
    endDate: toQueryDate(end),
    startIso: start.toString(),
    endIso: end.toString(),
    createdBy: initiator?.id || '',
    createdByName: initiator?.name || '',
    createdAt: serverTimestamp()
  };
};

export default class CommunityEvent {
  static async create(data, initiator) {
    if (isD1()) {
      try {
        const result = await d1CreateCommunityEvent(data, initiator);
        return result.id;
      } catch (e) {
        console.error("[CommunityEvent] Error D1 al crear:", e);
        throw e;
      }
    }
    try {
      const ref = doc(collection(db, "communityEvents"));
      await setDoc(ref, buildPayload(data, initiator));
      return ref.id;
    } catch (error) {
      console.error("[CommunityEvent] Error al crear evento:", error);
      throw error;
    }
  }

  static async getByRange(start, end) {
    if (isD1()) {
      try {
        const from = start?.epochMilliseconds ?? start?.getTime?.() ?? new Date(start).getTime();
        const to = end?.epochMilliseconds ?? end?.getTime?.() ?? new Date(end).getTime();
        return await d1CommunityEvents({ from, to });
      } catch (e) {
        console.error("[CommunityEvent] Error D1 getByRange:", e);
        throw e;
      }
    }
    try {
      const q = query(
        collection(db, "communityEvents"),
        where("startDate", ">=", toQueryDate(start)),
        where("startDate", "<=", toQueryDate(end)),
        orderBy("startDate", "asc")
      );
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (error) {
      console.error("[CommunityEvent] Error al obtener eventos por rango:", error);
      throw error;
    }
  }

  static async getById(id) {
    if (isD1()) {
      try {
        const all = await d1CommunityEvents({});
        return all.find((e) => e.id === id) || null;
      } catch (e) {
        console.error("[CommunityEvent] Error D1 getById:", e);
        throw e;
      }
    }
    try {
      const snap = await getDoc(doc(db, "communityEvents", id));
      return snap.exists() ? { id: snap.id, ...snap.data() } : null;
    } catch (error) {
      console.error("[CommunityEvent] Error al obtener evento:", error);
      throw error;
    }
  }

  static async update(id, data) {
    if (isD1()) {
      try {
        await d1UpdateCommunityEvent(id, data);
        return;
      } catch (e) {
        console.error("[CommunityEvent] Error D1 al actualizar:", e);
        throw e;
      }
    }
    try {
      const payload = {};
      if (data.title !== undefined) payload.title = data.title;
      if (data.description !== undefined) payload.description = data.description;
      if (data.type !== undefined) payload.type = EVENT_TYPES.includes(data.type) ? data.type : 'other';
      if (data.allDay !== undefined) payload.allDay = !!data.allDay;
      if (data.start) {
        payload.startDate = toQueryDate(data.start);
        payload.startIso = data.start.toString();
      }
      if (data.end) {
        payload.endDate = toQueryDate(data.end);
        payload.endIso = data.end.toString();
      }
      payload.updatedAt = serverTimestamp();
      await updateDoc(doc(db, "communityEvents", id), payload);
    } catch (error) {
      console.error("[CommunityEvent] Error al actualizar evento:", error);
      throw error;
    }
  }

  static async remove(id) {
    if (isD1()) {
      try {
        await d1DeleteCommunityEvent(id);
        return;
      } catch (e) {
        console.error("[CommunityEvent] Error D1 al eliminar:", e);
        throw e;
      }
    }
    try {
      await deleteDoc(doc(db, "communityEvents", id));
    } catch (error) {
      console.error("[CommunityEvent] Error al eliminar evento:", error);
      throw error;
    }
  }
}
