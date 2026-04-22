/* ──────────────────────────────────────────
   SMART REVISION PLANNER — script.js
   Author: Smart Revision Planner
   Stores data in localStorage, generates
   an optimized study schedule.
────────────────────────────────────────── */

'use strict';

/* ── STATE ──────────────────────────────── */
let subjects = [];       // Array of { id, name, examDate, difficulty }
let schedule = [];       // Array of { date, type, subject?, duration?, difficulty? }
let editingId = null;    // ID of subject being edited
let progress = {};       // { dateString: boolean }

/* ── CONSTANTS ──────────────────────────── */
const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const FULL_DAYS    = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const MONTHS       = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const DIFFICULTY_SESSIONS = { easy: 1, medium: 2, hard: 3 };   // sessions per 3-day cycle
const DIFFICULTY_HOURS    = { easy: 1, medium: 2, hard: 3 };    // hours per session
const REST_EVERY = 3;   // insert a rest day every N study days

/* ── DOM REFS ───────────────────────────── */
const subjectNameEl  = document.getElementById('subject-name');
const examDateEl     = document.getElementById('exam-date');
const difficultyEl   = document.getElementById('difficulty');
const addBtn         = document.getElementById('add-subject-btn');
const generateBtn    = document.getElementById('generate-btn');
const subjectsListEl = document.getElementById('subjects-list');
const subjectCountEl = document.getElementById('subject-count');
const emptySubjects  = document.getElementById('empty-subjects');
const scheduleOutput = document.getElementById('schedule-output');
const scheduleEmpty  = document.getElementById('schedule-empty');
const statsBar       = document.getElementById('stats-bar');
const statDays       = document.getElementById('stat-days');
const statRest       = document.getElementById('stat-rest');
const statHours      = document.getElementById('stat-hours');
const regenerateBtn  = document.getElementById('regenerate-btn');
const toast          = document.getElementById('toast');

// Modal
const editModal      = document.getElementById('edit-modal');
const modalClose     = document.getElementById('modal-close');
const modalCancel    = document.getElementById('modal-cancel');
const modalSave      = document.getElementById('modal-save');
const editNameEl     = document.getElementById('edit-name');
const editDateEl     = document.getElementById('edit-date');
const editDiffEl     = document.getElementById('edit-difficulty');

/* ── INIT ───────────────────────────────── */
function init() {
  loadFromStorage();
  renderSubjects();
  renderSchedule();
  setMinDate();

  addBtn.addEventListener('click', handleAddSubject);
  subjectNameEl.addEventListener('keydown', e => { if (e.key === 'Enter') handleAddSubject(); });
  generateBtn.addEventListener('click', handleGenerate);
  regenerateBtn.addEventListener('click', handleGenerate);

  // Modal
  modalClose.addEventListener('click', closeModal);
  modalCancel.addEventListener('click', closeModal);
  modalSave.addEventListener('click', handleModalSave);
  editModal.addEventListener('click', e => { if (e.target === editModal) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
}

/* ── STORAGE ────────────────────────────── */
function loadFromStorage() {
  try {
    subjects = JSON.parse(localStorage.getItem('srp_subjects') || '[]');
    schedule = JSON.parse(localStorage.getItem('srp_schedule') || '[]');
    progress = JSON.parse(localStorage.getItem('srp_progress') || '{}');
  } catch { subjects = []; schedule = []; progress = {}; }
}
function saveSubjects()  { localStorage.setItem('srp_subjects', JSON.stringify(subjects)); }
function saveSchedule()  { localStorage.setItem('srp_schedule', JSON.stringify(schedule)); }
function saveProgress()  { localStorage.setItem('srp_progress', JSON.stringify(progress)); }

/* ── UTILITIES ──────────────────────────── */
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

function setMinDate() {
  const today = new Date();
  const iso = today.toISOString().split('T')[0];
  examDateEl.min = iso;
}

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2600);
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function getDaysUntil(dateStr) {
  const now = new Date(); now.setHours(0,0,0,0);
  const exam = new Date(dateStr + 'T00:00:00');
  return Math.ceil((exam - now) / 86400000);
}

function dateToString(d) {
  return d.toISOString().split('T')[0];
}

function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function isToday(dateStr) {
  return dateStr === dateToString(new Date());
}

/* ── ADD SUBJECT ────────────────────────── */
function handleAddSubject() {
  const name       = subjectNameEl.value.trim();
  const examDate   = examDateEl.value;
  const difficulty = difficultyEl.value;

  if (!name)     { showToast('⚠️  Please enter a subject name.'); subjectNameEl.focus(); return; }
  if (!examDate) { showToast('⚠️  Please select an exam date.'); examDateEl.focus(); return; }
  if (getDaysUntil(examDate) < 1) { showToast('⚠️  Exam date must be in the future.'); return; }

  const subject = { id: uid(), name, examDate, difficulty };
  subjects.push(subject);
  saveSubjects();
  renderSubjects();
  showToast(`✦ "${name}" added!`);

  subjectNameEl.value = '';
  examDateEl.value = '';
  difficultyEl.value = 'medium';
  subjectNameEl.focus();

  // Clear old schedule if subjects change
  schedule = [];
  saveSchedule();
  renderSchedule();
}

/* ── DELETE / EDIT SUBJECT ──────────────── */
function deleteSubject(id) {
  subjects = subjects.filter(s => s.id !== id);
  saveSubjects();
  schedule = [];
  saveSchedule();
  renderSubjects();
  renderSchedule();
  showToast('Subject removed.');
}

function openEditModal(id) {
  const s = subjects.find(s => s.id === id);
  if (!s) return;
  editingId = id;
  editNameEl.value = s.name;
  editDateEl.value = s.examDate;
  editDiffEl.value = s.difficulty;
  editModal.style.display = 'flex';
  editNameEl.focus();
}

function closeModal() {
  editModal.style.display = 'none';
  editingId = null;
}

function handleModalSave() {
  const name       = editNameEl.value.trim();
  const examDate   = editDateEl.value;
  const difficulty = editDiffEl.value;

  if (!name)     { showToast('⚠️  Please enter a subject name.'); return; }
  if (!examDate) { showToast('⚠️  Please select an exam date.'); return; }
  if (getDaysUntil(examDate) < 1) { showToast('⚠️  Exam date must be in the future.'); return; }

  subjects = subjects.map(s =>
    s.id === editingId ? { ...s, name, examDate, difficulty } : s
  );
  saveSubjects();
  schedule = [];
  saveSchedule();
  renderSubjects();
  renderSchedule();
  closeModal();
  showToast('✦ Subject updated!');
}

/* ── RENDER SUBJECTS ────────────────────── */
function renderSubjects() {
  subjectCountEl.textContent = subjects.length;

  if (subjects.length === 0) {
    subjectsListEl.innerHTML = '';
    subjectsListEl.appendChild(emptySubjects);
    return;
  }

  // Sort by exam date ascending
  const sorted = [...subjects].sort((a, b) =>
    new Date(a.examDate) - new Date(b.examDate)
  );

  subjectsListEl.innerHTML = '';
  sorted.forEach(s => {
    const daysLeft = getDaysUntil(s.examDate);
    const item = document.createElement('div');
    item.className = 'subject-item';
    item.innerHTML = `
      <div class="subject-info">
        <div class="subject-name">${escHtml(s.name)}</div>
        <div class="subject-meta">
          ${formatDate(s.examDate)} &nbsp;·&nbsp;
          <span style="color: ${daysLeft <= 7 ? 'var(--hard)' : daysLeft <= 14 ? 'var(--medium)' : 'inherit'}">
            ${daysLeft} day${daysLeft !== 1 ? 's' : ''} left
          </span>
        </div>
      </div>
      <span class="difficulty-pill pill-${s.difficulty}">${capitalize(s.difficulty)}</span>
      <div class="subject-actions">
        <button class="icon-btn edit" title="Edit" data-id="${s.id}">✎</button>
        <button class="icon-btn delete" title="Delete" data-id="${s.id}">✕</button>
      </div>
    `;
    subjectsListEl.appendChild(item);
  });

  // Bind buttons
  subjectsListEl.querySelectorAll('.icon-btn.edit').forEach(btn =>
    btn.addEventListener('click', () => openEditModal(btn.dataset.id))
  );
  subjectsListEl.querySelectorAll('.icon-btn.delete').forEach(btn =>
    btn.addEventListener('click', () => deleteSubject(btn.dataset.id))
  );
}

/* ── SMART PLANNING ALGORITHM ───────────── */
function generateSchedule() {
  if (subjects.length === 0) return [];

  const today = new Date();
  today.setHours(0,0,0,0);

  // Find the latest exam date to know when to stop
  const latestExam = subjects
    .map(s => new Date(s.examDate + 'T00:00:00'))
    .reduce((a, b) => (a > b ? a : b));

  // Total calendar days from today to latest exam
  const totalDays = Math.ceil((latestExam - today) / 86400000);
  if (totalDays <= 0) return [];

  // Build a priority queue for each day:
  // For each calendar day, which subjects are "active" (exam hasn't passed)?
  // Weight: urgency (fewer days left = higher priority) + difficulty multiplier.

  const plan = [];
  let studyDayCount = 0;  // consecutive study days since last rest

  for (let i = 0; i < totalDays; i++) {
    const currentDate = addDays(today, i);
    const dateStr = dateToString(currentDate);

    // Active subjects for this day
    const active = subjects.filter(s => {
      const exam = new Date(s.examDate + 'T00:00:00');
      return exam > currentDate;
    });

    if (active.length === 0) continue;

    // Decide if this is a rest day
    if (studyDayCount > 0 && studyDayCount % REST_EVERY === 0) {
      plan.push({ date: dateStr, type: 'rest' });
      studyDayCount = 0;
      continue;
    }

    // Score each active subject
    const scored = active.map(s => {
      const daysLeft = Math.max(1, getDaysUntil(s.examDate));
      const diffWeight = { easy: 1, medium: 1.6, hard: 2.5 }[s.difficulty] || 1;
      const urgency = 1 / daysLeft;
      const score = urgency * diffWeight;
      return { ...s, score };
    });

    // Sort by score descending, pick the top subject
    scored.sort((a, b) => b.score - a.score);
    const chosen = scored[0];

    const hours = DIFFICULTY_HOURS[chosen.difficulty] || 2;

    plan.push({
      date: dateStr,
      type: 'study',
      subjectId: chosen.id,
      subjectName: chosen.name,
      difficulty: chosen.difficulty,
      duration: `${hours}h`,
      durationHours: hours
    });

    studyDayCount++;
  }

  return plan;
}

/* ── HANDLE GENERATE ────────────────────── */
function handleGenerate() {
  if (subjects.length === 0) {
    showToast('⚠️  Add at least one subject first!');
    return;
  }

  generateBtn.classList.add('loading');
  generateBtn.textContent = '✦ Generating...';

  setTimeout(() => {
    schedule = generateSchedule();
    saveSchedule();
    // Reset progress when generating a new plan
    progress = {};
    saveProgress();
    renderSchedule();

    generateBtn.classList.remove('loading');
    generateBtn.innerHTML = '<span class="btn-sparkle">✦</span> Generate My Plan <span class="btn-sparkle">✦</span>';
    showToast('✦ Plan generated successfully!');
  }, 600);
}

/* ── RENDER SCHEDULE ────────────────────── */
function renderSchedule() {
  if (schedule.length === 0) {
    scheduleEmpty.style.display = 'flex';
    scheduleOutput.innerHTML = '';
    statsBar.style.display = 'none';
    regenerateBtn.style.display = 'none';
    return;
  }

  scheduleEmpty.style.display = 'none';
  regenerateBtn.style.display = 'inline-flex';

  // Group by week
  const weeks = groupByWeek(schedule);
  scheduleOutput.innerHTML = '';

  weeks.forEach((week, wi) => {
    const weekLabel = document.createElement('div');
    weekLabel.className = 'week-label';
    weekLabel.textContent = `Week ${wi + 1} · ${formatDate(week[0].date)}`;
    scheduleOutput.appendChild(weekLabel);

    week.forEach((entry, ei) => {
      const card = buildDayCard(entry, wi * 100 + ei);
      scheduleOutput.appendChild(card);
    });
  });

  // Stats
  const studyDays  = schedule.filter(e => e.type === 'study');
  const restDays   = schedule.filter(e => e.type === 'rest');
  const totalHours = studyDays.reduce((a, e) => a + (e.durationHours || 0), 0);

  statDays.textContent  = studyDays.length;
  statRest.textContent  = restDays.length;
  statHours.textContent = `${totalHours}h`;
  statsBar.style.display = 'flex';

  // Scroll plan into view smoothly
  document.getElementById('schedule-card').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* ── BUILD DAY CARD ─────────────────────── */
function buildDayCard(entry, index) {
  const d = new Date(entry.date + 'T00:00:00');
  const dateNum = d.getDate();
  const dow     = DAYS_OF_WEEK[d.getDay()];
  const isChecked = !!progress[entry.date];

  const card = document.createElement('div');
  card.style.animationDelay = `${index * 40}ms`;

  if (entry.type === 'rest') {
    card.className = 'day-card rest';
    card.innerHTML = `
      <div class="day-check ${isChecked ? 'checked' : ''}" data-date="${entry.date}" role="checkbox" tabindex="0" aria-label="Mark rest day complete">
        ${isChecked ? '✓' : ''}
      </div>
      <div class="day-date-col">
        <div class="day-date-num">${dateNum}</div>
        <div class="day-date-dow">${dow}</div>
      </div>
      <div class="day-divider"></div>
      <div class="day-content">
        <div class="day-subject-name" style="color: var(--text-3); font-style: italic; font-weight: 400;">
          <span class="rest-icon">🌙</span> Rest Day
        </div>
        <div class="day-meta">Take a break — recovery is part of learning.</div>
      </div>
    `;
  } else {
    const diffColor = { easy: 'var(--easy)', medium: 'var(--medium)', hard: 'var(--hard)' }[entry.difficulty] || 'var(--text-2)';
    card.className = `day-card diff-${entry.difficulty}${isToday(entry.date) ? ' today' : ''}${isChecked ? ' completed' : ''}`;
    card.innerHTML = `
      <div class="day-check ${isChecked ? 'checked' : ''}" data-date="${entry.date}" role="checkbox" tabindex="0" aria-label="Mark as complete">
        ${isChecked ? '✓' : ''}
      </div>
      <div class="day-date-col">
        <div class="day-date-num">${dateNum}</div>
        <div class="day-date-dow">${dow}</div>
      </div>
      <div class="day-divider"></div>
      <div class="day-content">
        <div class="day-subject-name">${escHtml(entry.subjectName)}</div>
        <div class="day-meta">
          <span style="color:${diffColor}">${capitalize(entry.difficulty)}</span>
          <span class="day-meta-dot">·</span>
          ${intensityLabel(entry.difficulty)} session
        </div>
      </div>
      <div class="day-duration">${entry.duration}</div>
    `;
  }

  // Progress checkbox
  const checkEl = card.querySelector('.day-check');
  if (checkEl) {
    const toggle = () => {
      progress[entry.date] = !progress[entry.date];
      saveProgress();
      checkEl.classList.toggle('checked', !!progress[entry.date]);
      checkEl.textContent = progress[entry.date] ? '✓' : '';
      card.classList.toggle('completed', !!progress[entry.date]);
    };
    checkEl.addEventListener('click', toggle);
    checkEl.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); } });
  }

  return card;
}

function intensityLabel(diff) {
  return { easy: 'Light', medium: 'Moderate', hard: 'Intensive' }[diff] || 'Moderate';
}

/* ── GROUP BY WEEK ──────────────────────── */
function groupByWeek(entries) {
  if (!entries.length) return [];
  const weeks = [];
  let week = [];
  let weekStart = null;

  entries.forEach(entry => {
    const d = new Date(entry.date + 'T00:00:00');
    if (!weekStart) {
      weekStart = d;
      week.push(entry);
    } else {
      const diff = (d - weekStart) / 86400000;
      if (diff < 7) {
        week.push(entry);
      } else {
        weeks.push(week);
        week = [entry];
        weekStart = d;
      }
    }
  });
  if (week.length) weeks.push(week);
  return weeks;
}

/* ── HELPERS ────────────────────────────── */
function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

/* ── START ──────────────────────────────── */
document.addEventListener('DOMContentLoaded', init);