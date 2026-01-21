// System App: Calendar
ALGO.app.name = 'Calendar';
ALGO.app.icon = '📅';

let _cal_events = [];
let _cal_month = new Date().getMonth();
let _cal_year = new Date().getFullYear();
let _cal_winId = null;

// US Holidays
const _cal_holidays = {
  '1-1': "New Year's Day",
  '7-4': 'Independence Day',
  '12-25': 'Christmas Day',
  '12-31': "New Year's Eve",
  '2-14': "Valentine's Day",
  '10-31': 'Halloween',
  '11-11': "Veterans Day"
};

function _cal_open() {
  if (typeof hideStartMenu === 'function') hideStartMenu();
  _cal_loadEvents();
  const id = typeof winId !== 'undefined' ? winId : Date.now();
  _cal_winId = id;

  ALGO.createWindow({
    title: 'Calendar',
    icon: '📅',
    width: 340,
    height: 380,
    content: '<div class="calendar-app" id="cal-app-' + id + '"></div>'
  });

  _cal_render();
}

function _cal_loadEvents() {
  try {
    const saved = localStorage.getItem('algo-calendar-events');
    if (saved) _cal_events = JSON.parse(saved);
  } catch(e) {}
}

function _cal_saveEvents() {
  try {
    localStorage.setItem('algo-calendar-events', JSON.stringify(_cal_events));
  } catch(e) {}
}

function _cal_getEventsForDate(year, month, day) {
  const dateStr = year + '-' + (month+1) + '-' + day;
  const events = _cal_events.filter(e => e.date === dateStr);
  const holidayKey = (month+1) + '-' + day;
  if (_cal_holidays[holidayKey]) {
    events.unshift({ id: 'h-' + holidayKey, title: _cal_holidays[holidayKey], date: dateStr, isHoliday: true });
  }
  return events;
}

function _cal_render() {
  const id = _cal_winId;
  const container = document.getElementById('cal-app-' + id);
  if (!container) return;

  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const firstDay = new Date(_cal_year, _cal_month, 1).getDay();
  const daysInMonth = new Date(_cal_year, _cal_month + 1, 0).getDate();
  const today = new Date();

  let html = '<div class="cal-header">' +
    '<button onclick="_cal_prev()">◀</button>' +
    '<span>' + months[_cal_month] + ' ' + _cal_year + '</span>' +
    '<button onclick="_cal_next()">▶</button>' +
  '</div>';

  html += '<div class="cal-grid">';
  ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(d => {
    html += '<div class="cal-day-header">' + d + '</div>';
  });

  for (let i = 0; i < firstDay; i++) {
    html += '<div class="cal-day empty"></div>';
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const isToday = today.getDate() === day && today.getMonth() === _cal_month && today.getFullYear() === _cal_year;
    const events = _cal_getEventsForDate(_cal_year, _cal_month, day);
    const hasEvents = events.length > 0;
    const hasHoliday = events.some(e => e.isHoliday);

    html += '<div class="cal-day' + (isToday ? ' today' : '') + (hasHoliday ? ' holiday' : '') + '" onclick="_cal_dayClick(' + day + ')">';
    html += '<span class="day-num">' + day + '</span>';
    if (hasEvents) html += '<span class="event-dot"></span>';
    html += '</div>';
  }

  html += '</div>';

  // Upcoming events
  html += '<div class="cal-upcoming"><strong>Upcoming:</strong>';
  const upcoming = [];
  for (let d = today.getDate(); d <= daysInMonth && upcoming.length < 3; d++) {
    const evts = _cal_getEventsForDate(_cal_year, _cal_month, d);
    evts.forEach(e => {
      if (upcoming.length < 3) upcoming.push({ ...e, day: d });
    });
  }
  if (upcoming.length === 0) {
    html += '<div class="upcoming-item">No upcoming events</div>';
  } else {
    upcoming.forEach(e => {
      html += '<div class="upcoming-item' + (e.isHoliday ? ' holiday' : '') + '">' +
        '<span class="date">' + (_cal_month+1) + '/' + e.day + '</span> ' +
        (typeof escapeHtml === 'function' ? escapeHtml(e.title) : e.title) +
      '</div>';
    });
  }
  html += '</div>';

  container.innerHTML = html;
}

function _cal_prev() {
  _cal_month--;
  if (_cal_month < 0) { _cal_month = 11; _cal_year--; }
  _cal_render();
}

function _cal_next() {
  _cal_month++;
  if (_cal_month > 11) { _cal_month = 0; _cal_year++; }
  _cal_render();
}

function _cal_dayClick(day) {
  const events = _cal_getEventsForDate(_cal_year, _cal_month, day);
  const dateStr = _cal_year + '-' + (_cal_month+1) + '-' + day;

  let content = '<div style="padding:10px;">';
  content += '<h3 style="margin:0 0 10px 0;">' + (_cal_month+1) + '/' + day + '/' + _cal_year + '</h3>';

  if (events.length > 0) {
    events.forEach(e => {
      content += '<div style="padding:4px 0;border-bottom:1px solid #ddd;display:flex;justify-content:space-between;align-items:center;">';
      content += '<span' + (e.isHoliday ? ' style="color:#c00;"' : '') + '>' + (typeof escapeHtml === 'function' ? escapeHtml(e.title) : e.title) + '</span>';
      if (!e.isHoliday) {
        content += '<button onclick="_cal_deleteEvent(\'' + e.id + '\')" style="font-size:10px;padding:2px 6px;">✕</button>';
      }
      content += '</div>';
    });
  } else {
    content += '<p style="color:#666;">No events</p>';
  }

  content += '<div style="margin-top:10px;display:flex;gap:4px;">';
  content += '<input type="text" id="cal-new-event" placeholder="Add event..." style="flex:1;padding:4px;">';
  content += '<button onclick="_cal_addEvent(\'' + dateStr + '\')">Add</button>';
  content += '</div></div>';

  ALGO.createWindow({
    title: 'Events',
    icon: '📅',
    width: 280,
    height: 250,
    content: content
  });
}

function _cal_addEvent(dateStr) {
  const input = document.getElementById('cal-new-event');
  if (!input || !input.value.trim()) return;

  _cal_events.push({
    id: 'e-' + Date.now(),
    title: input.value.trim(),
    date: dateStr
  });
  _cal_saveEvents();
  _cal_render();
  input.value = '';
  if (typeof ALGO !== 'undefined' && ALGO.notify) ALGO.notify('Event added');
}

function _cal_deleteEvent(eventId) {
  _cal_events = _cal_events.filter(e => e.id !== eventId);
  _cal_saveEvents();
  _cal_render();
}

// Export for global access
window._cal_open = _cal_open;
window._cal_prev = _cal_prev;
window._cal_next = _cal_next;
window._cal_dayClick = _cal_dayClick;
window._cal_addEvent = _cal_addEvent;
window._cal_deleteEvent = _cal_deleteEvent;

// Auto-open
_cal_open();
