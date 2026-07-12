/**
 * Vistrow Voice — Google Calendar booking bridge
 * ------------------------------------------------
 * Paste this into a Google Apps Script project, deploy it as a Web App
 * ("Execute as: Me", "Who has access: Anyone"), and paste the resulting
 * /exec URL into the Google Calendar integration in your Vistrow dashboard.
 *
 * Your AI agent then checks real open slots and books real appointments on
 * the calendar below during live calls. No OAuth setup on your side — the
 * script runs as you and talks only to your own calendar.
 *
 * Edit the CONFIG block to match your working hours and calendar.
 */

var CONFIG = {
  // Leave "" to use your account's default calendar, or paste a specific
  // calendar id (Calendar settings → Integrate calendar → Calendar ID).
  CALENDAR_ID: "",
  TIMEZONE: "Asia/Kolkata",
  OPEN_HOUR: 10,   // first slot starts at 10:00
  CLOSE_HOUR: 19,  // last slot ends by 19:00
  SLOT_MINUTES: 30,
  // Optional shared secret — if set, also set the same value in the
  // integration config and the agent will send it. Leave "" to skip.
  SECRET: ""
};

function _calendar() {
  return CONFIG.CALENDAR_ID
    ? CalendarApp.getCalendarById(CONFIG.CALENDAR_ID)
    : CalendarApp.getDefaultCalendar();
}

function _json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function _hhmm(d) {
  return Utilities.formatDate(d, CONFIG.TIMEZONE, "HH:mm");
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents || "{}");
    if (CONFIG.SECRET && body.secret !== CONFIG.SECRET) {
      return _json({ ok: false, error: "unauthorized" });
    }
    if (body.action === "check") return _check(body);
    if (body.action === "book") return _book(body);
    return _json({ ok: false, error: "unknown action" });
  } catch (err) {
    return _json({ ok: false, error: String(err) });
  }
}

// { action:"check", date:"YYYY-MM-DD", duration:30 } -> { ok, slots:["11:00",...] }
function _check(body) {
  var duration = body.duration || CONFIG.SLOT_MINUTES;
  var dayStart = new Date(body.date + "T00:00:00");
  var open = new Date(body.date + "T00:00:00");
  open.setHours(CONFIG.OPEN_HOUR, 0, 0, 0);
  var close = new Date(body.date + "T00:00:00");
  close.setHours(CONFIG.CLOSE_HOUR, 0, 0, 0);

  var busy = _calendar().getEvents(open, close);
  var slots = [];
  var cursor = new Date(open);
  var now = new Date();
  while (cursor.getTime() + duration * 60000 <= close.getTime()) {
    var slotEnd = new Date(cursor.getTime() + duration * 60000);
    var free = cursor.getTime() > now.getTime();  // no past slots
    for (var i = 0; free && i < busy.length; i++) {
      if (cursor < busy[i].getEndTime() && slotEnd > busy[i].getStartTime()) free = false;
    }
    if (free) slots.push(_hhmm(cursor));
    cursor = new Date(cursor.getTime() + CONFIG.SLOT_MINUTES * 60000);
  }
  return _json({ ok: true, slots: slots });
}

// { action:"book", date, time:"HH:MM", duration, name, phone, purpose }
function _book(body) {
  var duration = body.duration || CONFIG.SLOT_MINUTES;
  var start = new Date(body.date + "T" + (body.time.length === 5 ? body.time : "00:00") + ":00");
  var end = new Date(start.getTime() + duration * 60000);

  // Refuse if the slot is no longer free (someone booked between check & book).
  var clash = _calendar().getEvents(start, end);
  if (clash.length > 0) return _json({ ok: false, error: "slot no longer available" });

  var title = (body.purpose ? body.purpose + " — " : "Appointment — ") + (body.name || "Caller");
  var ev = _calendar().createEvent(title, start, end, {
    description: "Booked by Vistrow Voice AI agent.\nName: " + (body.name || "") +
                 "\nPhone: " + (body.phone || "") +
                 "\nPurpose: " + (body.purpose || "")
  });
  return _json({ ok: true, eventId: ev.getId() });
}
