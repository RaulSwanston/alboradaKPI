import 'temporal-polyfill/global';

import { createCalendar, createViewMonthGrid, createViewWeek, createViewDay } from '../../../src/libs/schedule-x/calendar/dist/core.js';
import { t, getCurrentLang } from '../../core/i18n.js';

const LOCALES = {
  es: 'es-ES',
  en: 'en-US',
  pt: 'pt-BR'
};

const toScheduleXLocale = (lang) => LOCALES[lang] || lang || 'es-ES';

/**
 * Controlador para el módulo del Calendario Comunitario (calendar).
 * schedule-x v4 requiere que start/end sean objetos Temporal.ZonedDateTime/PlainDate.
 */
export default async function calendar(contexto) {
  const container = document.getElementById('calendar-root');
  if (!container) return;

  const timezone = contexto.data?.appConfig?.systemDefaults?.timezone || 'America/Panama';
  const locale = toScheduleXLocale(getCurrentLang());
  const now = Temporal.Now.zonedDateTimeISO(timezone);

  const events = [
    {
      id: 'demo-evento-1',
      title: t('modules.calendar.sampleEvent'),
      description: t('modules.calendar.sampleEventDescription'),
      start: now.startOfDay().add({ days: 1, hours: 10 }),
      end: now.startOfDay().add({ days: 1, hours: 12 })
    }
  ];

  const calendar = createCalendar({
    locale,
    timezone,
    events,
    views: [createViewMonthGrid(), createViewWeek(), createViewDay()],
    callbacks: {
      onEventClick(calendarEvent) {
        alert(`${calendarEvent.title}\n${calendarEvent.start.toLocaleString(locale)}`);
      }
    }
  });

  calendar.render(container);

  return () => {
    calendar.destroy();
  };
}
