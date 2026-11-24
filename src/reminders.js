const STORAGE_KEY = 'reg-prayers-reminders'
const CHECK_MS = 30_000
const CHIME_URL = './reminder-chime.mp3'
/** Soft pulse then a longer beat — readable as a prayer-bell tap on phone motors. */
const VIBRATE_PATTERN = [120, 70, 120, 70, 260]

/** @type {Map<string, number>} */
const localTimers = new Map()

/** @type {ReturnType<typeof setInterval> | null} */
let checkTimer = null

/** @type {HTMLAudioElement | null} */
let chimeAudio = null

/**
 * @typedef {'once' | 'daily' | 'weekly'} ReminderRepeat
 *
 * @typedef {object} Reminder
 * @property {string} id
 * @property {string} title
 * @property {string} [note]
 * @property {number} at
 * @property {ReminderRepeat} repeat
 * @property {boolean} enabled
 * @property {number} [lastFired]
 */

/**
 * @param {string} value
 */
function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/**
 * @returns {Reminder[]}
 */
export function loadReminders() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (item) =>
          item &&
          typeof item.id === 'string' &&
          typeof item.title === 'string' &&
          typeof item.at === 'number' &&
          Number.isFinite(item.at)
      )
      .map((item) => ({
        id: item.id,
        title: item.title,
        note: typeof item.note === 'string' ? item.note : '',
        at: item.at,
        repeat: item.repeat === 'daily' || item.repeat === 'weekly' ? item.repeat : 'once',
        enabled: item.enabled !== false,
        lastFired: typeof item.lastFired === 'number' ? item.lastFired : undefined
      }))
      .sort((a, b) => a.at - b.at)
  } catch {
    return []
  }
}

/**
 * @param {Reminder[]} reminders
 */
function saveReminders(reminders) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(reminders))
}

function supportsNotificationTriggers() {
  return (
    typeof Notification !== 'undefined' &&
    'showTrigger' in Notification.prototype &&
    typeof window.TimestampTrigger === 'function'
  )
}

/**
 * @returns {Promise<'granted' | 'denied' | 'default' | 'unsupported'>}
 */
export async function notificationPermission() {
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission
}

/**
 * @returns {Promise<'granted' | 'denied' | 'default' | 'unsupported'>}
 */
export async function requestNotificationPermission() {
  if (typeof Notification === 'undefined') return 'unsupported'
  if (Notification.permission === 'granted') return 'granted'
  if (Notification.permission === 'denied') return 'denied'
  try {
    return await Notification.requestPermission()
  } catch {
    return Notification.permission
  }
}

/**
 * @param {number} at
 * @param {ReminderRepeat} repeat
 * @param {number} [from]
 */
function nextOccurrence(at, repeat, from = Date.now()) {
  if (repeat === 'once') return at
  let next = at
  const step = repeat === 'daily' ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000
  while (next <= from) next += step
  return next
}

/**
 * @param {Reminder} reminder
 */
function advanceReminder(reminder) {
  if (reminder.repeat === 'once') {
    return { ...reminder, enabled: false, lastFired: Date.now() }
  }
  const at = nextOccurrence(reminder.at, reminder.repeat, Date.now())
  return { ...reminder, at, lastFired: Date.now() }
}

/**
 * @param {string} id
 */
function reminderTags(id) {
  return new Set([id, `sched-${id}`, `fired-${id}`])
}

/**
 * @param {string} id
 * @param {{ includeShown?: boolean }} [options]
 */
async function cancelScheduledNotification(id, options = {}) {
  clearLocalTimer(id)
  if (!('serviceWorker' in navigator)) return
  try {
    const registration = await navigator.serviceWorker.ready
    if (!registration.getNotifications) return
    const tags = reminderTags(id)
    if (options.includeShown) {
      const notifications = await registration.getNotifications(
        supportsNotificationTriggers() ? { includeTriggered: true } : undefined
      )
      await Promise.all(notifications.filter((note) => tags.has(note.tag)).map((note) => note.close()))
      return
    }

    if (!supportsNotificationTriggers()) return
    const pending = await registration.getNotifications({ includeTriggered: true })
    const shown = await registration.getNotifications()
    const shownTags = new Set(shown.map((note) => note.tag))
    await Promise.all(
      pending
        .filter((note) => tags.has(note.tag) && !shownTags.has(note.tag))
        .map((note) => note.close())
    )
  } catch {
    // Older browsers may reject includeTriggered.
  }
}

/**
 * @param {string} id
 */
function clearLocalTimer(id) {
  const handle = localTimers.get(id)
  if (handle != null) {
    clearTimeout(handle)
    localTimers.delete(id)
  }
}

function getChimeAudio() {
  if (typeof Audio === 'undefined') return null
  if (!chimeAudio) {
    chimeAudio = new Audio(CHIME_URL)
    chimeAudio.preload = 'auto'
  }
  return chimeAudio
}

/**
 * Warm up the chime during a user gesture so later reminders can play it.
 */
export function unlockReminderAudio() {
  const audio = getChimeAudio()
  if (!audio) return
  try {
    audio.muted = true
    const result = audio.play()
    const finish = () => {
      audio.pause()
      audio.currentTime = 0
      audio.muted = false
    }
    if (result && typeof result.then === 'function') {
      result.then(finish).catch(() => {
        audio.muted = false
      })
    } else {
      finish()
    }
  } catch {
    if (audio) audio.muted = false
  }
}

function vibrateReminder() {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(VIBRATE_PATTERN)
    }
  } catch {
    // Vibration may be blocked or unsupported.
  }
}

function playReminderChime() {
  const audio = getChimeAudio()
  if (!audio) return
  try {
    audio.muted = false
    audio.currentTime = 0
    const result = audio.play()
    if (result && typeof result.catch === 'function') result.catch(() => {})
  } catch {
    // Autoplay can still be blocked without a prior gesture.
  }
}

/**
 * Haptics + chime while the app is open. Background alerts rely on the
 * notification vibrate/sound options instead.
 */
function playReminderCue() {
  vibrateReminder()
  playReminderChime()
}

/**
 * @param {string} body
 * @param {string} tag
 * @param {string} reminderId
 * @param {{ silent?: boolean }} [options]
 */
function notificationOptions(body, tag, reminderId, options = {}) {
  return {
    body,
    tag,
    renotify: true,
    silent: options.silent === true,
    vibrate: VIBRATE_PATTERN,
    // Supported on some Android browsers; ignored elsewhere.
    sound: CHIME_URL,
    icon: './icon.svg',
    badge: './favicon.svg',
    data: { url: './#reminders', reminderId }
  }
}

/**
 * @param {Reminder} reminder
 * @param {{ forceImmediate?: boolean }} [options]
 */
async function showReminderAlert(reminder) {
  const title = reminder.title || 'Prayer reminder'
  const body = reminder.note || 'Time to pray.'
  const tag = `fired-${reminder.id}`
  const pageOpen = typeof document !== 'undefined' && document.visibilityState === 'visible'

  // Foreground path: play our chime and vibrate immediately.
  if (pageOpen) playReminderCue()

  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      // When the page already chimed, silence the system tone to avoid stacking sounds.
      const options = notificationOptions(body, tag, reminder.id, { silent: pageOpen })
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready
        await registration.showNotification(title, options)
        return
      }
      new Notification(title, options)
      return
    } catch {
      // Fall through to in-app alert.
    }
  }

  if (pageOpen) {
    window.alert(`${title}\n\n${body}`)
  }
}

/**
 * @param {string} id
 */
async function hasActiveNotification(id) {
  if (!('serviceWorker' in navigator)) return false
  try {
    const registration = await navigator.serviceWorker.ready
    if (!registration.getNotifications) return false
    const tags = reminderTags(id)
    const notifications = await registration.getNotifications()
    return notifications.some((note) => tags.has(note.tag))
  } catch {
    return false
  }
}

/**
 * @param {Reminder} reminder
 */
async function scheduleReminder(reminder) {
  await cancelScheduledNotification(reminder.id)
  if (!reminder.enabled) return

  const when = nextOccurrence(reminder.at, reminder.repeat)
  if (when !== reminder.at && reminder.repeat !== 'once') {
    const reminders = loadReminders().map((item) =>
      item.id === reminder.id ? { ...item, at: when } : item
    )
    saveReminders(reminders)
    reminder = { ...reminder, at: when }
  }

  const delay = when - Date.now()
  if (delay <= 0) {
    await fireDueReminder(reminder.id)
    return
  }

  if (
    supportsNotificationTriggers() &&
    typeof Notification !== 'undefined' &&
    Notification.permission === 'granted' &&
    'serviceWorker' in navigator
  ) {
    try {
      const registration = await navigator.serviceWorker.ready
      const title = reminder.title || 'Prayer reminder'
      const body = reminder.note || 'Time to pray.'
      await registration.showNotification(title, {
        ...notificationOptions(body, `sched-${reminder.id}`, reminder.id),
        showTrigger: new window.TimestampTrigger(when)
      })
      // Background trigger is scheduled; skip the foreground timer to avoid double alerts.
      return
    } catch {
      // Fall back to local timer.
    }
  }

  // Foreground timer fallback while the app is open (or when triggers are unavailable).
  const capped = Math.min(delay, 2_147_000_000)
  const handle = window.setTimeout(() => {
    localTimers.delete(reminder.id)
    fireDueReminder(reminder.id)
  }, capped)
  localTimers.set(reminder.id, handle)
}

/**
 * @param {string} id
 */
async function fireDueReminder(id) {
  const reminders = loadReminders()
  const index = reminders.findIndex((item) => item.id === id)
  if (index < 0) return
  const current = reminders[index]
  if (!current.enabled) return

  const dueAt = nextOccurrence(current.at, current.repeat)
  if (dueAt > Date.now() + 15_000) {
    await scheduleReminder(current)
    return
  }

  if (current.lastFired && Date.now() - current.lastFired < 20_000) return

  const alreadyShown = await hasActiveNotification(id)
  if (!alreadyShown) await showReminderAlert(current)

  const updated = advanceReminder(current)
  reminders[index] = updated
  saveReminders(reminders)
  if (updated.enabled) await scheduleReminder(updated)
}

/**
 * @param {{ title: string, note?: string, at: number, repeat?: ReminderRepeat }} input
 */
export async function addReminder(input) {
  const title = input.title.trim()
  if (!title) throw new Error('Enter a reminder title.')
  if (!Number.isFinite(input.at)) throw new Error('Choose a valid date and time.')

  const reminder = {
    id: `rem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    note: (input.note || '').trim(),
    at: input.at,
    repeat: input.repeat === 'daily' || input.repeat === 'weekly' ? input.repeat : 'once',
    enabled: true
  }

  const reminders = loadReminders()
  reminders.push(reminder)
  saveReminders(reminders)
  await scheduleReminder(reminder)
  return reminder
}

/**
 * @param {string} id
 */
export async function removeReminder(id) {
  await cancelScheduledNotification(id, { includeShown: true })
  saveReminders(loadReminders().filter((item) => item.id !== id))
}

/**
 * @param {string} id
 * @param {boolean} enabled
 */
export async function setReminderEnabled(id, enabled) {
  const reminders = loadReminders()
  const index = reminders.findIndex((item) => item.id === id)
  if (index < 0) return
  const next = { ...reminders[index], enabled }
  reminders[index] = next
  saveReminders(reminders)
  if (enabled) await scheduleReminder(next)
  else await cancelScheduledNotification(id, { includeShown: true })
}

export async function rescheduleAllReminders() {
  const reminders = loadReminders()
  for (const reminder of reminders) {
    if (reminder.enabled) await scheduleReminder(reminder)
    else await cancelScheduledNotification(reminder.id)
  }
}

async function checkDueReminders() {
  const now = Date.now()
  for (const reminder of loadReminders()) {
    if (!reminder.enabled) continue
    const dueAt = nextOccurrence(reminder.at, reminder.repeat)
    if (dueAt <= now + 5_000) await fireDueReminder(reminder.id)
  }
}

export function startReminderWatch() {
  if (checkTimer != null) return
  rescheduleAllReminders()
  checkDueReminders()
  checkTimer = setInterval(checkDueReminders, CHECK_MS)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkDueReminders()
  })
  window.addEventListener('focus', checkDueReminders)
}

/**
 * @param {number} at
 */
function formatWhen(at) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }).format(new Date(at))
  } catch {
    return new Date(at).toLocaleString()
  }
}

/**
 * @param {ReminderRepeat} repeat
 */
function repeatLabel(repeat) {
  if (repeat === 'daily') return 'Daily'
  if (repeat === 'weekly') return 'Weekly'
  return 'Once'
}

/**
 * @param {'granted' | 'denied' | 'default' | 'unsupported'} permission
 */
function permissionCopy(permission) {
  if (permission === 'granted') {
    return supportsNotificationTriggers()
      ? 'Phone alerts are on with vibration and a chime. Reminders can fire even when this tab is closed.'
      : 'Phone alerts are on with vibration and a chime while this app is open or recently used. Keep the app installed for best results.'
  }
  if (permission === 'denied') {
    return 'Notifications are blocked for this site. Enable them in your phone’s browser settings to get alerts.'
  }
  if (permission === 'unsupported') {
    return 'This browser does not support notification alerts. Reminders will still show while the app is open.'
  }
  return 'Allow notifications so reminders can alert your phone.'
}

/**
 * @param {HTMLElement} root
 * @param {{ onChanged?: () => void }} [options]
 */
export async function mountReminders(root, options = {}) {
  const redraw = async () => {
    const permission = await notificationPermission()
    const reminders = loadReminders()
    const upcoming = reminders.filter((item) => item.enabled)
    const paused = reminders.filter((item) => !item.enabled)

    const defaultWhen = new Date(Date.now() + 60 * 60 * 1000)
    defaultWhen.setSeconds(0, 0)
    const localValue = toLocalInputValue(defaultWhen)

    root.innerHTML = `
      <section class="reminders" aria-label="Reminders">
        <p class="reminders-lead">Set a time to pray, and this app can alert your phone.</p>
        <p class="reminders-status" data-reminders="status">${escapeHtml(permissionCopy(permission))}</p>
        ${
          permission === 'default'
            ? `<button type="button" class="reminders-enable" data-reminders="enable">Allow phone alerts</button>`
            : ''
        }
        <form class="reminders-form" data-reminders="form">
          <label>
            <span>Reminder</span>
            <input name="title" type="text" maxlength="120" required placeholder="Evening Rosary" autocomplete="off" />
          </label>
          <label>
            <span>Note <em>(optional)</em></span>
            <input name="note" type="text" maxlength="200" placeholder="Light a candle and begin" autocomplete="off" />
          </label>
          <label>
            <span>When</span>
            <input name="at" type="datetime-local" required value="${escapeHtml(localValue)}" />
          </label>
          <label>
            <span>Repeat</span>
            <select name="repeat">
              <option value="once">Once</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          </label>
          <p class="reminders-error" data-reminders="error" hidden></p>
          <button type="submit" class="reminders-save">Save reminder</button>
        </form>
        <div class="reminders-list-wrap">
          <h2>Upcoming</h2>
          ${
            upcoming.length
              ? `<ul class="reminders-list">${upcoming.map(reminderItem).join('')}</ul>`
              : `<p class="empty">No upcoming reminders yet.</p>`
          }
          ${
            paused.length
              ? `<h2 class="reminders-paused-title">Paused</h2><ul class="reminders-list">${paused.map(reminderItem).join('')}</ul>`
              : ''
          }
        </div>
      </section>
    `

    bind(root, redraw, options.onChanged)
  }

  await redraw()
}

/**
 * @param {Reminder} reminder
 */
function reminderItem(reminder) {
  return `
    <li class="reminder-card" data-enabled="${reminder.enabled}">
      <div>
        <p class="reminder-title">${escapeHtml(reminder.title)}</p>
        ${reminder.note ? `<p class="reminder-note">${escapeHtml(reminder.note)}</p>` : ''}
        <p class="reminder-meta">${escapeHtml(formatWhen(reminder.at))} · ${escapeHtml(repeatLabel(reminder.repeat))}</p>
      </div>
      <div class="reminder-actions">
        <button type="button" data-reminders-toggle="${escapeHtml(reminder.id)}" aria-pressed="${reminder.enabled}">
          ${reminder.enabled ? 'Pause' : 'Resume'}
        </button>
        <button type="button" data-reminders-delete="${escapeHtml(reminder.id)}">Delete</button>
      </div>
    </li>
  `
}

/**
 * @param {Date} date
 */
function toLocalInputValue(date) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * @param {HTMLElement} root
 * @param {() => Promise<void>} redraw
 * @param {(() => void) | undefined} onChanged
 */
function bind(root, redraw, onChanged) {
  const enable = root.querySelector('[data-reminders="enable"]')
  enable?.addEventListener('click', async () => {
    unlockReminderAudio()
    await requestNotificationPermission()
    await rescheduleAllReminders()
    await redraw()
    onChanged?.()
  })

  const form = root.querySelector('[data-reminders="form"]')
  if (form instanceof HTMLFormElement) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault()
      unlockReminderAudio()
      const error = root.querySelector('[data-reminders="error"]')
      const data = new FormData(form)
      const title = String(data.get('title') || '')
      const note = String(data.get('note') || '')
      const atRaw = String(data.get('at') || '')
      const repeatRaw = String(data.get('repeat') || 'once')
      const at = new Date(atRaw).getTime()
      try {
        if (!Number.isFinite(at)) throw new Error('Choose a valid date and time.')
        await addReminder({
          title,
          note,
          at,
          repeat: repeatRaw === 'daily' || repeatRaw === 'weekly' ? repeatRaw : 'once'
        })
        await redraw()
        onChanged?.()
        // Ask for alerts after the list updates so Save never waits on the permission dialog.
        const permission = await notificationPermission()
        if (permission === 'default') {
          await requestNotificationPermission()
          await rescheduleAllReminders()
          await redraw()
        }
      } catch (err) {
        if (error instanceof HTMLElement) {
          error.hidden = false
          error.textContent = err instanceof Error ? err.message : 'Could not save that reminder.'
        }
      }
    })
  }

  root.querySelectorAll('[data-reminders-delete]').forEach((button) => {
    button.addEventListener('click', async () => {
      const id = button.getAttribute('data-reminders-delete')
      if (!id) return
      await removeReminder(id)
      await redraw()
      onChanged?.()
    })
  })

  root.querySelectorAll('[data-reminders-toggle]').forEach((button) => {
    button.addEventListener('click', async () => {
      const id = button.getAttribute('data-reminders-toggle')
      if (!id) return
      const current = loadReminders().find((item) => item.id === id)
      if (!current) return
      await setReminderEnabled(id, !current.enabled)
      await redraw()
      onChanged?.()
    })
  })
}
