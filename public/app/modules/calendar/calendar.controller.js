import 'temporal-polyfill/global';

import { createCalendar, createViewMonthGrid, createViewWeek, createViewMonthAgenda, createViewDay } from '../../../src/libs/schedule-x/calendar/dist/core.js';
import { createEventModalPlugin } from '../../../src/libs/schedule-x/event-modal/dist/core.js';
import CommunityEvent from '../../models/CommunityEvent.js';
import { getCurrentLang, t } from '../../core/i18n.js';

const LOCALES = {
  es: 'es-ES',
  en: 'en-US',
  pt: 'pt-BR'
};

const toScheduleXLocale = (lang) => LOCALES[lang] || lang || 'es-ES';

const pad = (n) => String(n).padStart(2, '0');

const toStart = (doc) =>
  doc.allDay
    ? Temporal.PlainDate.from(doc.startIso)
    : Temporal.ZonedDateTime.from(doc.startIso);

const toEnd = (doc) => {
  if (!doc.endIso) return toStart(doc);
  return doc.allDay
    ? Temporal.PlainDate.from(doc.endIso)
    : Temporal.ZonedDateTime.from(doc.endIso);
};

/**
 * Convierte un objeto Temporal a valor de input datetime-local ("YYYY-MM-DDTHH:MM").
 * Para eventos all-day (PlainDate) se usa la medianoche de la fecha.
 */
const toInputValue = (temporal, timezone) => {
  const zdt = temporal instanceof Temporal.PlainDate
    ? temporal.toZonedDateTime({ timeZone: timezone, plainTime: Temporal.PlainTime.from('00:00') })
    : temporal;
  const { year, month, day, hour, minute } = zdt;
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}`;
};

/**
 * Convierte un valor de input datetime-local a objeto Temporal.
 * Si allDay es true devuelve PlainDate, en caso contrario ZonedDateTime en la timezone.
 */
const fromInputValue = (value, timezone, allDay) => {
  const [datePart, timePart = '00:00'] = value.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  if (allDay) return Temporal.PlainDate.from({ year, month, day });
  const [hour, minute] = timePart.split(':').map(Number);
  return Temporal.ZonedDateTime.from({ year, month, day, hour, minute, timeZone: timezone });
};

/**
 * Controlador para el módulo del Calendario Comunitario (calendar).
 * schedule-x v4 requiere que start/end sean objetos Temporal.ZonedDateTime/PlainDate.
 * Los eventos se cargan desde Firestore (colección communityEvents) vía CommunityEvent.
 * - Click simple en un evento: modal nativo de schedule-x (detalles de solo lectura).
 * - Doble-click en un día/hora vacío: modal propio en modo creación.
 * - Doble-click en un evento: modal propio en modo edición.
 */
export default async function calendar(contexto) {
  const container = document.getElementById('calendar-root');
  if (!container) return;

  const timezone = contexto.data?.appConfig?.systemDefaults?.timezone || 'America/Panama';
  const locale = toScheduleXLocale(getCurrentLang());
  const user = contexto.data?.user || {};
  const userProfile = contexto.data?.userProfile || {};

  const eventModalPlugin = createEventModalPlugin();
  let calendar;

  calendar = createCalendar(
    {
      locale,
      timezone,
      views: [createViewMonthGrid(), createViewWeek(), createViewMonthAgenda(), createViewDay()],
      callbacks: {
        async fetchEvents(range) {
          try {
            const docs = await CommunityEvent.getByRange(range.start, range.end);
            return docs.map((doc) => ({
              id: doc.id,
              title: doc.title,
              description: doc.description || undefined,
              type: doc.type,
              allDay: !!doc.allDay,
              start: toStart(doc),
              end: toEnd(doc)
            }));
          } catch (error) {
            console.error("[calendar] Error al cargar eventos:", error);
            return [];
          }
        },
        onDoubleClickDate(date) {
          openEventModal(null, date);
        },
        onDoubleClickDateTime(dateTime) {
          openEventModal(null, dateTime);
        },
        onDoubleClickEvent(calendarEvent) {
          openEventModal(calendarEvent);
        }
      }
    },
    [eventModalPlugin]
  );

  calendar.render(container);

  // --- Modal propio de creación/edición ---
  const modal = document.getElementById('calendar-event-modal');
  const form = document.getElementById('calendar-event-form');
  const titleField = document.getElementById('calendar-field-title');
  titleField.placeholder = t('modules.calendar.eventTitlePlaceholder');
  const typeField = document.getElementById('calendar-field-type');
  const allDayField = document.getElementById('calendar-field-allday');
  const startField = document.getElementById('calendar-field-start');
  const endField = document.getElementById('calendar-field-end');
  const descriptionField = document.getElementById('calendar-field-description');
  const btnDelete = document.getElementById('calendar-btn-delete');
  const btnSave = document.getElementById('calendar-btn-save');
  const modalTitle = document.getElementById('calendar-modal-title');

  let editingId = null;
  let closingTimer = null;

  const showToast = (message, type = 'success') => {
    let containerEl = document.getElementById('toast-container');
    if (!containerEl) {
      containerEl = document.createElement('div');
      containerEl.id = 'toast-container';
      document.body.appendChild(containerEl);
    }
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    containerEl.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 5000);
  };

  const syncAllDayFields = () => {
    const isAllDay = allDayField.checked;
    startField.type = isAllDay ? 'date' : 'datetime-local';
    endField.type = isAllDay ? 'date' : 'datetime-local';
  };

  const openEventModal = (event, defaultStart) => {
    eventModalPlugin.close();
    if (closingTimer) {
      clearTimeout(closingTimer);
      closingTimer = null;
    }
    modal.classList.remove('closing');
    editingId = event ? event.id : null;
    form.reset();
    allDayField.checked = false;
    syncAllDayFields();

    if (event) {
      modalTitle.textContent = t('modules.calendar.editEvent');
      btnDelete.classList.remove('hidden');
      titleField.value = event.title || '';
      typeField.value = event.type || 'other';
      descriptionField.value = event.description || '';
      allDayField.checked = !!event.allDay;
      syncAllDayFields();
      startField.value = toInputValue(event.start, timezone);
      endField.value = event.end ? toInputValue(event.end, timezone) : '';
    } else {
      modalTitle.textContent = t('modules.calendar.newEvent');
      btnDelete.classList.add('hidden');
      typeField.value = 'social';
      if (defaultStart) {
        startField.value = toInputValue(defaultStart, timezone);
        endField.value = toInputValue(
          defaultStart instanceof Temporal.PlainDate
            ? defaultStart.add({ days: 1 })
            : defaultStart.add({ hours: 1 }),
          timezone
        );
      }
    }

    modal.classList.remove('hidden');
    setTimeout(() => titleField.focus(), 50);
  };

  const closeEventModal = () => {
    if (modal.classList.contains('hidden')) return;
    modal.classList.add('closing');
    closingTimer = setTimeout(() => {
      modal.classList.remove('closing');
      modal.classList.add('hidden');
      editingId = null;
    }, 250);
  };

  const handleSave = async (e) => {
    e.preventDefault();

    const title = titleField.value.trim();
    if (!title) {
      titleField.focus();
      return;
    }
    if (!startField.value) {
      startField.focus();
      return;
    }

    const allDay = allDayField.checked;
    const start = fromInputValue(startField.value, timezone, allDay);
    const end = endField.value
      ? fromInputValue(endField.value, timezone, allDay)
      : start;

    const data = {
      title,
      description: descriptionField.value.trim(),
      type: typeField.value,
      allDay,
      start,
      end
    };

    btnSave.disabled = true;
    try {
      const initiator = { id: user.uid, name: userProfile.displayName || user.displayName || '' };

      if (editingId) {
        await CommunityEvent.update(editingId, data);
        calendar.events.update({ id: editingId, title, description: data.description || undefined, type: data.type, allDay, start, end });
      } else {
        const newId = await CommunityEvent.create(data, initiator);
        calendar.events.add({ id: newId, title, description: data.description || undefined, type: data.type, allDay, start, end });
      }
      closeEventModal();
      showToast(t('modules.calendar.eventSaved'), 'success');
    } catch (error) {
      console.error("[calendar] Error al guardar evento:", error);
      showToast(t('modules.calendar.eventError'), 'error');
    } finally {
      btnSave.disabled = false;
    }
  };

  const handleDelete = async () => {
    if (!editingId) return;
    if (!window.confirm(t('modules.calendar.eventDeleteConfirm'))) return;

    btnDelete.disabled = true;
    try {
      await CommunityEvent.remove(editingId);
      calendar.events.remove(editingId);
      closeEventModal();
      showToast(t('modules.calendar.eventDeleted'), 'success');
    } catch (error) {
      console.error("[calendar] Error al eliminar evento:", error);
      showToast(t('modules.calendar.eventDeleteError'), 'error');
    } finally {
      btnDelete.disabled = false;
    }
  };

  form.addEventListener('submit', handleSave);
  btnDelete.addEventListener('click', handleDelete);
  document.getElementById('calendar-btn-cancel').addEventListener('click', closeEventModal);
  document.getElementById('calendar-modal-close').addEventListener('click', closeEventModal);
  allDayField.addEventListener('change', syncAllDayFields);

  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeEventModal();
  });

  return () => {
    calendar.destroy();
  };
}
