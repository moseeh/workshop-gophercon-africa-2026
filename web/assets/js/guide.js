// The field-guide panel: fetches a sighting's page from the server when its
// pin is opened, so no photo is downloaded until someone asks to see it.

const panel = document.getElementById('guide-panel');
const body = document.getElementById('guide-body');
const close = document.getElementById('guide-close');
const cache = new Map();
const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let current = '';
let opener = null;

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

async function open(id) {
	if (!panel || !id) return;
	current = id;
	opener = document.activeElement;
	panel.hidden = false;
	panel.classList.add('is-loading');
	body.replaceChildren();
	panel.focus({ preventScroll: true });
	try {
		const html = await load(id);
		if (current !== id) return;
		const page = parse(html);
		page.querySelectorAll('img').forEach(function (img) {
			img.addEventListener('load', () => img.classList.add('is-loaded'), { once: true });
		});
		body.replaceChildren(page);
	} catch {
		if (current === id) body.textContent = 'This page of the field guide could not be found.';
	} finally {
		if (current === id) panel.classList.remove('is-loading');
	}
}

function shut() {
	if (!panel || panel.hidden) return;
	panel.hidden = true;
	current = '';
	window.dispatchEvent(new CustomEvent('voyage:closed'));
	if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
}

window.addEventListener('voyage:open', (e) => open(e.detail.id));
window.addEventListener('voyage:playing', shut);

// Hovering a pin starts its page and photo loading, so a click opens it ready.
window.addEventListener('voyage:hover', function (e) {
	load(e.detail.id)
		.then(function (html) {
			const img = parse(html).querySelector('.guide__plate img');
			if (img) new Image().src = img.getAttribute('src');
		})
		.catch(() => {});
});

close?.addEventListener('click', shut);
document.addEventListener('keydown', function (e) {
	if (e.key === 'Escape') shut();
});

// The legend starts folded where there's no room beside the globe, and
// remembers whether the visitor folded or unfolded it last time.
const cartouche = document.getElementById('cartouche');
if (cartouche) {
	let saved = null;
	try {
		saved = localStorage.getItem('atlas:legend');
	} catch {}
	cartouche.open = saved ? saved === 'open' : window.matchMedia('(min-width: 1100px)').matches;
	cartouche.addEventListener('toggle', function () {
		try {
			localStorage.setItem('atlas:legend', cartouche.open ? 'open' : 'folded');
		} catch {}
	});
}

document.querySelectorAll('.logbook__go').forEach(function (btn) {
	btn.addEventListener('click', function () {
		const id = btn.dataset.sighting;
		document.getElementById('globe')?.scrollIntoView({ behavior: still ? 'auto' : 'smooth' });
		window.dispatchEvent(new CustomEvent('voyage:fly', { detail: { id } }));
		open(id);
	});
});
