// The cartouche: folding it away, its Legend and Animals tabs, the animal
// filters and the "with notes" switch, and the little seal that sets sail.

import { pins, filters, emit, on } from '/assets/js/atlas.js';

const cartouche = document.getElementById('cartouche');

function remember(key, value) {
	try {
		if (value === undefined) return localStorage.getItem(key);
		localStorage.setItem(key, value);
	} catch {}
	return null;
}

// Starts folded where there's no room beside the globe, and remembers the
// visitor's choice of fold and tab.
if (cartouche) {
	const saved = remember('atlas:legend');
	cartouche.open = saved ? saved === 'open' : window.matchMedia('(min-width: 1100px)').matches;
	cartouche.addEventListener('toggle', () => remember('atlas:legend', cartouche.open ? 'open' : 'folded'));
}

const tabs = [...document.querySelectorAll('.cartouche__tabs [role="tab"]')];

function selectTab(tab, focus) {
	for (const t of tabs) {
		const on = t === tab;
		t.setAttribute('aria-selected', String(on));
		t.tabIndex = on ? 0 : -1;
		document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
	}
	if (focus) tab.focus();
	remember('atlas:tab', tab.id);
}

tabs.forEach(function (tab, i) {
	tab.addEventListener('click', () => selectTab(tab));
	tab.addEventListener('keydown', function (e) {
		const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
		if (!step) return;
		e.preventDefault();
		selectTab(tabs[(i + step + tabs.length) % tabs.length], true);
	});
});
const savedTab = document.getElementById(remember('atlas:tab') || '');
if (savedTab && tabs.includes(savedTab)) selectTab(savedTab);

// ---- Filters ------------------------------------------------------------------

const boxes = [...document.querySelectorAll('.groups input[name="group"]')];
const notes = [...document.querySelectorAll('.notes-switch input[name="notes"]')];

function apply() {
	filters.groups = new Set(boxes.filter((b) => b.checked).map((b) => b.value));
	filters.notesOnly = notes.some((r) => r.checked && r.value === 'notes');
	recount();
	emit('atlas:filter');
}

// Each group's count follows the "with notes" switch, so it says what ticking it would show.
function recount() {
	const per = new Map();
	for (const p of pins) {
		if (filters.notesOnly && !p.r) continue;
		per.set(p.g, (per.get(p.g) || 0) + 1);
	}
	document.querySelectorAll('[data-group-count]').forEach(function (em) {
		const c = per.get(em.dataset.groupCount) || 0;
		em.textContent = c;
		em.closest('label').classList.toggle('is-empty', c === 0);
	});
}

boxes.forEach((b) => b.addEventListener('change', apply));
notes.forEach((r) => r.addEventListener('change', apply));
document.querySelectorAll('[data-groups]').forEach(function (btn) {
	btn.addEventListener('click', function () {
		const all = btn.dataset.groups === 'all';
		boxes.forEach((b) => (b.checked = all));
		apply();
	});
});

// The seal in the legend plays the voyage, the same as the big one.
document.querySelectorAll('[data-action="play"]').forEach(function (btn) {
	btn.addEventListener('click', () => emit('voyage:play'));
});
on('voyage:playing', function () {
	document.getElementById('voyage-play')?.classList.remove('seal--nudge');
});
