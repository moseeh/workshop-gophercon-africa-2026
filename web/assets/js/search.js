// The search box: continents, countries, regions, cities and animal groups,
// all matched in the browser from the pins already on the page. Picking one
// lights its tacks on the globe and opens its page in the panel.

import { pins, filters, passes, emit, on, km, tally, el, plural } from '/assets/js/atlas.js';
import { CITIES } from '/assets/js/cities.js';

const CITY_KM = 100;
const input = document.getElementById('search-input');
const list = document.getElementById('search-results');
const clear = document.getElementById('search-clear');

const KINDS = {
	group: { word: 'Animal', order: 0 },
	country: { word: 'Country', order: 1 },
	continent: { word: 'Continent', order: 2 },
	city: { word: 'City', order: 3 },
	region: { word: 'Region', order: 4 },
};

const fold = (s) =>
	String(s || '')
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[-_]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.toLowerCase();

const entries = buildIndex();
let shownEntries = [];
let active = -1;

function buildIndex() {
	const out = [];
	const add = (kind, key, label, i, extra) => {
		let e = byKey.get(kind + ':' + key);
		if (!e) {
			e = { kind, label, keys: [fold(label)], ids: [], names: new Map(), ...extra };
			byKey.set(kind + ':' + key, e);
			out.push(e);
		}
		if (i !== undefined) e.ids.push(i);
		return e;
	};
	const byKey = new Map();

	pins.forEach(function (p, i) {
		add('group', p.g, p.g, i).names.set(fold(p.n), p.n);
		if (p.ct) add('continent', p.ct, p.ct, i);
		if (p.c) add('country', p.c, p.cn || p.c, i);
		if (p.rg) {
			const e = add('region', p.c + '|' + fold(p.rg), p.rg + (p.cn ? ', ' + p.cn : ''), i);
			e.spellings = e.spellings || [];
			e.spellings.push(p.rg);
		}
	});

	// A region spelt two ways ("Taita-Taveta", "Taita Taveta") reads as its commonest spelling.
	for (const e of out) {
		if (e.kind === 'region') {
			const best = tally(e.spellings)[0][0];
			const country = e.label.slice(e.label.indexOf(',') >= 0 ? e.label.lastIndexOf(', ') : e.label.length);
			e.label = best + country;
			e.keys = [fold(e.label)];
		}
		if (e.kind === 'group') {
			// Species names find their group too: "lion" finds Big cats.
			for (const name of e.names.keys()) if (!e.keys.includes(name)) e.keys.push(name);
		}
	}

	for (const c of CITIES) {
		const ids = [];
		pins.forEach((p, i) => {
			if (km(c.lat, c.lng, p.lat, p.lng) <= CITY_KM) ids.push(i);
		});
		out.push({
			kind: 'city',
			label: c.name + ', ' + c.country,
			keys: [fold(c.name), fold(c.name + ' ' + c.country)],
			ids,
			circle: { lat: c.lat, lng: c.lng, km: CITY_KM },
		});
	}
	return out;
}

// What a result stands for under the current filters. Picking an animal shows
// it even when its box is unticked, since that's what was asked for.
function idsFor(e) {
	if (e.kind === 'group') return e.ids.filter((i) => !filters.notesOnly || pins[i].r);
	return e.ids.filter(passes);
}

function match(q) {
	const found = [];
	for (const e of entries) {
		let best = Infinity;
		let via = '';
		e.keys.forEach(function (key, n) {
			const extra = n === 0 ? 0 : 3;
			let s = Infinity;
			if (key.startsWith(q)) s = 0;
			else if ((' ' + key).includes(' ' + q)) s = 1;
			else if (q.length > 3 && key.includes(q)) s = 2;
			if (s + extra < best) {
				best = s + extra;
				via = n === 0 ? '' : e.names?.get(key) || '';
			}
		});
		if (best < Infinity) found.push({ e, score: best, via, count: idsFor(e).length });
	}
	found.sort(
		(a, b) =>
			a.score - b.score ||
			(b.count > 0) - (a.count > 0) ||
			KINDS[a.e.kind].order - KINDS[b.e.kind].order ||
			b.count - a.count ||
			a.e.label.localeCompare(b.e.label),
	);
	return found.slice(0, 8);
}

function show(results) {
	shownEntries = results;
	active = results.length ? 0 : -1;
	list.replaceChildren(
		...results.map(function (r, k) {
			const li = el('li', 'search__option' + (r.count ? '' : ' is-empty'));
			li.id = 'search-opt-' + k;
			li.setAttribute('role', 'option');
			const text = el('span', 'search__label', r.e.label);
			const kind = el('span', 'search__kind', KINDS[r.e.kind].word + (r.via ? ' · includes ' + r.via : ''));
			const count = el(
				'span',
				'search__count',
				r.e.kind === 'city' ? r.count + ' within ' + CITY_KM + ' km' : plural(r.count, 'sighting'),
			);
			li.append(text, kind, count);
			li.addEventListener('mousedown', (e) => e.preventDefault());
			li.addEventListener('click', () => choose(r.e));
			return li;
		}),
	);
	if (!results.length && input.value.trim()) {
		const none = el('li', 'search__none', 'Nothing by that name in the atlas.');
		none.setAttribute('role', 'presentation');
		list.append(none);
	}
	list.hidden = !input.value.trim();
	input.setAttribute('aria-expanded', String(!list.hidden));
	highlight();
}

function highlight() {
	[...list.querySelectorAll('[role="option"]')].forEach(function (li, k) {
		li.setAttribute('aria-selected', String(k === active));
		if (k === active) li.scrollIntoView({ block: 'nearest' });
	});
	if (active >= 0) input.setAttribute('aria-activedescendant', 'search-opt-' + active);
	else input.removeAttribute('aria-activedescendant');
}

function close() {
	list.hidden = true;
	input.setAttribute('aria-expanded', 'false');
	input.removeAttribute('aria-activedescendant');
}

function choose(e) {
	const ids = idsFor(e).map((i) => pins[i].id);
	input.value = e.label;
	clear.hidden = false;
	close();
	input.blur();
	emit('voyage:pause');
	emit('atlas:focus', { ids, circle: e.circle });
	emit('atlas:list', {
		kind: e.kind,
		title: e.kind === 'city' ? 'Near ' + e.label : e.label,
		ids,
		empty:
			e.kind === 'city'
				? 'Nothing has been seen within ' + CITY_KM + ' km of ' + e.label.split(',')[0] + ' yet.'
				: 'Nothing here matches the filters in the legend.',
	});
}

input?.addEventListener('input', function () {
	const q = fold(input.value);
	clear.hidden = !input.value;
	if (!q) return close();
	show(match(q));
});

input?.addEventListener('keydown', function (e) {
	if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
		if (list.hidden) {
			if (input.value.trim()) show(match(fold(input.value)));
			return;
		}
		e.preventDefault();
		const n = shownEntries.length;
		if (!n) return;
		active = (active + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
		highlight();
	} else if (e.key === 'Enter') {
		if (!list.hidden && shownEntries[active]) {
			e.preventDefault();
			choose(shownEntries[active].e);
		}
	} else if (e.key === 'Escape') {
		e.stopPropagation();
		if (!list.hidden) close();
		else reset();
	}
});

input?.addEventListener('blur', () => setTimeout(close, 120));
input?.addEventListener('focus', function () {
	if (input.value.trim() && clear.hidden === false && !list.hidden) show(match(fold(input.value)));
});

function reset() {
	input.value = '';
	clear.hidden = true;
	close();
	emit('atlas:clear');
}

clear?.addEventListener('click', function () {
	reset();
	input.focus();
});

// When the panel closes, the search it came from is over too.
on('voyage:closed', function () {
	if (input && document.activeElement !== input) {
		input.value = '';
		clear.hidden = true;
	}
});
on('atlas:filter', function () {
	if (!list.hidden) show(match(fold(input.value)));
});
