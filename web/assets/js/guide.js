// The panel beside the globe, a short stack of pages: a list (a place, an
// animal group or a crowded spot) and, on top, a sighting's field-guide page
// fetched from the server, so no photo downloads until someone asks for it.

import { pins, byId, emit, on, still, shortDate, yearOf, skyIcon, skyWords, tally, shortPlace, plural, el } from '/assets/js/atlas.js';

const panel = document.getElementById('guide-panel');
const body = document.getElementById('guide-body');
const close = document.getElementById('guide-close');
const cache = new Map();
let stack = [];
let opener = null;

// ---- Field-guide pages --------------------------------------------------------

// Fetches a sighting's page once, keeping the promise so repeat asks share it.
function load(id) {
	if (!cache.has(id)) {
		const page = fetch('/sightings/' + encodeURIComponent(id) + '/guide').then(function (r) {
			if (!r.ok) throw new Error('guide: ' + r.status);
			return r.text();
		});
		page.catch(() => cache.delete(id));
		cache.set(id, page);
	}
	return cache.get(id);
}

// The page is the server's own escaped templ output, parsed inertly before it's shown.
function parse(html) {
	const tpl = document.createElement('template');
	tpl.innerHTML = html;
	return tpl.content;
}

function reveal() {
	if (panel.hidden) opener = document.activeElement;
	panel.hidden = false;
}

async function renderGuide(page) {
	reveal();
	panel.classList.add('is-loading');
	body.replaceChildren();
	panel.scrollTop = 0;
	const list = page.from;
	if (list) body.append(backLink(list.data.title));
	panel.focus({ preventScroll: true });
	try {
		const html = await load(page.id);
		if (stack[stack.length - 1] !== page) return;
		const content = parse(html);
		content.querySelectorAll('img').forEach(function (img) {
			img.addEventListener('load', () => img.classList.add('is-loaded'), { once: true });
		});
		body.append(content);
		if (list) body.append(nextLink(list, page.id));
	} catch {
		if (stack[stack.length - 1] === page) body.append(el('p', 'guide__missing', 'This page of the field guide could not be found.'));
	} finally {
		if (stack[stack.length - 1] === page) panel.classList.remove('is-loading');
	}
}

function backLink(title) {
	const b = el('button', 'panel__back', '← ' + title);
	b.type = 'button';
	b.addEventListener('click', back);
	return b;
}

function nextLink(list, id) {
	const order = list.order;
	const at = order.indexOf(id);
	const nav = el('nav', 'panel__next');
	nav.setAttribute('aria-label', 'More from ' + list.data.title);
	if (at >= 0 && at < order.length - 1) {
		const next = pins[byId.get(order[at + 1])];
		const b = el('button', '', 'Next: ' + next.n + ' →');
		b.type = 'button';
		b.addEventListener('click', () => openFromList(list, next.id, true));
		nav.append(b);
	}
	nav.append(el('span', 'panel__of', at + 1 + ' of ' + order.length));
	return nav;
}

// ---- List pages: a place, an animal group or a crowded spot --------------------

function renderList(page) {
	reveal();
	panel.classList.remove('is-loading');
	const d = page.data;
	const idx = d.ids.map((id) => byId.get(id)).filter((i) => i !== undefined);
	const isGroup = d.kind === 'group';
	const article = el('article', 'place');
	article.setAttribute('aria-labelledby', 'place-title');

	const head = el('header', 'place__head');
	const h = el('h2', 'place__title', d.title);
	h.id = 'place-title';
	head.append(el('p', 'place__kicker', kindWord(d.kind)), h);
	if (idx.length) {
		const animals = new Set(idx.map((i) => pins[i].s)).size;
		const years = [...new Set(idx.map((i) => yearOf(pins[i].t)))].sort();
		const span = years.length > 1 ? years[0] + ' – ' + years[years.length - 1] : String(years[0]);
		head.append(el('p', 'place__sub', plural(idx.length, 'sighting') + ' · ' + plural(animals, 'animal') + ' · ' + span));
	}
	article.append(head);

	if (!idx.length) {
		article.append(el('p', 'place__empty', d.empty || 'Nothing to show here.'));
		body.replaceChildren(article);
		panel.focus({ preventScroll: true });
		return;
	}

	// The breakdown, in ink: species for an animal group, groups for a place.
	const most = tally(idx.map((i) => (isGroup ? pins[i].n : pins[i].g))).slice(0, 6);
	article.append(bars(isGroup ? 'Which kinds' : 'Most seen', most));
	if (isGroup) article.append(bars('Where', tally(idx.map((i) => pins[i].cn || pins[i].c)).slice(0, 5)));

	const facts = el('ul', 'place__facts');
	const sky = tally(idx.map((i) => pins[i].w))[0];
	if (sky) {
		const li = el('li');
		li.append(skyIcon(sky[0]), document.createTextNode(' Mostly seen under ' + (skyWords[sky[0]] || sky[0]) + ' (estimated)'));
		facts.append(li);
	}
	const noted = idx.filter((i) => pins[i].r).length;
	if (noted) facts.append(el('li', 'place__noted', '✎ ' + plural(noted, 'sighting') + ' with notes'));
	article.append(facts);

	// The sightings themselves, under their group (or country, for an animal), newest first.
	const by = (i) => (isGroup ? pins[i].cn || 'Unknown country' : pins[i].g);
	const sections = tally(idx.map(by));
	const order = [];
	for (const [name] of sections) {
		const members = idx.filter((i) => by(i) === name).sort((a, b) => pins[b].t - pins[a].t);
		const sec = el('section', 'place__group');
		sec.append(el('h3', '', name + ' · ' + members.length));
		const ul = el('ul', 'place__list');
		for (const i of members) {
			const p = pins[i];
			order.push(p.id);
			const li = el('li');
			const b = el('button', 'place__row');
			b.type = 'button';
			const top = el('span', 'place__row-top');
			top.append(el('span', 'place__name', p.n), skyIcon(p.w));
			if (p.r) top.append(el('span', 'place__quill', '✎'));
			b.append(top, el('span', 'place__meta', shortDate(p.t) + ' · ' + shortPlace(p.p)));
			if (p.r) b.append(el('span', 'place__note', p.r));
			b.addEventListener('click', () => openFromList(page, p.id));
			li.append(b);
			ul.append(li);
		}
		sec.append(ul);
		article.append(sec);
	}
	page.order = order;

	body.replaceChildren(article);
	panel.scrollTop = page.scroll || 0;
	panel.focus({ preventScroll: true });
}

function bars(title, rows) {
	const box = el('section', 'place__bars');
	box.append(el('h3', '', title));
	const top = rows.length ? rows[0][1] : 1;
	const ul = el('ul');
	for (const [name, count] of rows) {
		const li = el('li');
		const bar = el('span', 'place__bar');
		bar.style.setProperty('--w', ((count / top) * 100).toFixed(1) + '%');
		const label = String(name);
		li.append(el('span', 'place__bar-name', label.charAt(0).toUpperCase() + label.slice(1)), bar, el('span', 'place__bar-n', String(count)));
		ul.append(li);
	}
	box.append(ul);
	return box;
}

function kindWord(kind) {
	return { group: 'Animals', country: 'Country', continent: 'Continent', region: 'Region', city: 'Near a city', cluster: 'Close together' }[kind] || '';
}

// ---- The stack ----------------------------------------------------------------

function render() {
	const page = stack[stack.length - 1];
	if (!page) return;
	if (page.type === 'list') renderList(page);
	else renderGuide(page);
}

function openFromList(list, id, replace) {
	list.scroll = replace ? list.scroll : panel.scrollTop;
	if (replace) stack.pop();
	stack.push({ type: 'guide', id, from: list });
	emit('voyage:fly', { id, keepDistance: true });
	render();
}

function back() {
	stack.pop();
	render();
}

function shut() {
	if (!panel || panel.hidden) return;
	panel.hidden = true;
	stack = [];
	emit('voyage:closed');
	if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
}

on('atlas:list', function (d) {
	stack = [{ type: 'list', data: d }];
	render();
});

on('voyage:open', function (d) {
	stack = [{ type: 'guide', id: d.id }];
	render();
});

on('atlas:clear', shut);
on('voyage:playing', shut);

// Hovering a tack starts its page and photo loading, so a click opens it ready.
on('voyage:hover', function (d) {
	load(d.id)
		.then(function (html) {
			const img = parse(html).querySelector('.guide__plate img');
			if (img) new Image().src = img.getAttribute('src');
		})
		.catch(() => {});
});

close?.addEventListener('click', shut);
document.addEventListener('keydown', function (e) {
	if (e.key !== 'Escape' || panel.hidden) return;
	if (stack.length > 1) back();
	else shut();
});

document.querySelectorAll('.logbook__go').forEach(function (btn) {
	btn.addEventListener('click', function () {
		const id = btn.dataset.sighting;
		document.getElementById('globe')?.scrollIntoView({ behavior: still ? 'auto' : 'smooth' });
		opener = btn;
		emit('voyage:fly', { id });
		stack = [{ type: 'guide', id }];
		render();
	});
});
