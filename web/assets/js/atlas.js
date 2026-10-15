// What the globe, the search, the filters and the field-guide panel share:
// the pins Go wrote into the page, the filters, and a few small helpers.
// They talk to each other through window events named "atlas:…".

export const DAY = 86400;

export const pins = (function () {
	try {
		const el = document.getElementById('voyage-pins');
		const all = el ? JSON.parse(el.textContent) : [];
		return Array.isArray(all) ? all.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng)) : [];
	} catch {
		return [];
	}
})();

export const byId = new Map(pins.map((p, i) => [p.id, i]));

// The filters: which animal groups show, and whether only sightings with notes do.
export const filters = {
	groups: new Set(pins.map((p) => p.g)),
	notesOnly: false,
};

export function passes(i) {
	const p = pins[i];
	return filters.groups.has(p.g) && (!filters.notesOnly || !!p.r);
}

export function emit(name, detail) {
	window.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
}

export function on(name, fn) {
	window.addEventListener(name, (e) => fn(e.detail || {}));
}

export const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export function shortDate(t) {
	return dateFormat.format(new Date(t * 1000));
}

export function yearOf(t) {
	return new Date(t * 1000).getUTCFullYear();
}

// The weather sprite from the layout, as an inline icon for lists.
export function skyIcon(sky) {
	const ns = 'http://www.w3.org/2000/svg';
	const svg = document.createElementNS(ns, 'svg');
	svg.setAttribute('class', 'weather__icon');
	svg.setAttribute('aria-hidden', 'true');
	const use = document.createElementNS(ns, 'use');
	use.setAttribute('href', '#wx-' + (sky || 'cloudy'));
	svg.appendChild(use);
	return svg;
}

export const skyWords = {
	clear: 'clear skies',
	cloudy: 'cloud',
	fog: 'fog',
	dust: 'dust',
	drizzle: 'drizzle',
	rain: 'rain',
	snow: 'snow',
	storm: 'storms',
};

// Great-circle distance in kilometres.
export function km(lat1, lng1, lat2, lng2) {
	const r = Math.PI / 180;
	const a =
		Math.sin(((lat2 - lat1) * r) / 2) ** 2 +
		Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lng2 - lng1) * r) / 2) ** 2;
	return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}

// Counts values, most common first.
export function tally(values) {
	const counts = new Map();
	for (const v of values) if (v) counts.set(v, (counts.get(v) || 0) + 1);
	return [...counts].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
}

// The last two parts of a place, such as "Narok, Kenya", for headings.
export function shortPlace(p) {
	const parts = String(p || '').split(', ').filter(Boolean);
	return parts.slice(-2).join(', ');
}

export function plural(n, one, many) {
	return n + ' ' + (n === 1 ? one : many || one + 's');
}

// Builds an element with text only: GBIF text never goes through innerHTML.
export function el(tag, className, text) {
	const node = document.createElement(tag);
	if (className) node.className = className;
	if (text !== undefined && text !== null) node.textContent = text;
	return node;
}
