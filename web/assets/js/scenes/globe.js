// The antique globe: an inked map on a sphere, a pin per sighting, and the
// voyage that plays them back in the order they were seen, each arriving
// with the weather it was seen in.

import { mount } from '/assets/js/threejs.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { geoEquirectangular, geoPath, geoGraticule10 } from 'd3-geo';
import { feature, mesh } from 'topojson-client';

const WORLD = 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json';
const DAY = 86400;
const D2R = Math.PI / 180;
const FOV_HALF = 25 * D2R;
const HOME = { lat: -1.29, lng: 36.82 }; // Nairobi, where the voyage sets out from.

const pins = readPins();

mount('globe', function ({ THREE, scene, camera, renderer, canvas, colour, still }) {
	const ink = colour('--ink', '#3B2A1A');
	const sepia = colour('--sepia', '#7A5230');
	const brass = colour('--brass', '#B08D57');
	const red = colour('--red-ink', '#9E2B25');
	const parchment = colour('--parchment', '#F1E4C3');
	const paper = colour('--aged-paper', '#E2CFA0');
	const sea = colour('--sea', '#8FA9A3');

	const stage = canvas.parentElement;
	const section = canvas.closest('.voyage');
	const $ = (id) => document.getElementById(id);

	// ---- The globe ----------------------------------------------------------

	const mapCanvas = document.createElement('canvas');
	const mapTexture = new THREE.CanvasTexture(mapCanvas);
	mapTexture.colorSpace = THREE.SRGBColorSpace;
	mapTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();

	const globe = new THREE.Mesh(
		new THREE.SphereGeometry(1, 96, 64),
		new THREE.MeshStandardMaterial({ color: sea, roughness: 0.92, metalness: 0 }),
	);
	scene.add(globe);

	scene.add(new THREE.AmbientLight(0xfff1dc, 1.1));
	const lamp = new THREE.DirectionalLight(0xffe2b8, 1.6);
	lamp.position.set(-2.5, 2.5, 3);
	camera.add(lamp);
	scene.add(camera);

	fetch(WORLD)
		.then((r) => r.json())
		.then(function (world) {
			paintMap(mapCanvas, world, { ink, sepia, red, parchment, paper, sea });
			mapTexture.needsUpdate = true;
			globe.material.map = mapTexture;
			globe.material.color.set(0xffffff);
			globe.material.needsUpdate = true;
			render();
		})
		.catch((err) => console.warn('globe: map not drawn', err));

	// ---- Pins ---------------------------------------------------------------

	const n = pins.length;
	const positions = new Float32Array(n * 3);
	const shown = new Float32Array(n).fill(1);
	const arrived = new Float32Array(n).fill(-100);
	const hot = new Float32Array(n);
	const dirs = pins.map((p) => toVec(THREE, p.lat, p.lng, 1));
	dirs.forEach((d, i) => d.clone().multiplyScalar(1.006).toArray(positions, i * 3));

	const pinGeometry = new THREE.BufferGeometry();
	pinGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
	pinGeometry.setAttribute('aShown', new THREE.BufferAttribute(shown, 1));
	pinGeometry.setAttribute('aArrive', new THREE.BufferAttribute(arrived, 1));
	pinGeometry.setAttribute('aHot', new THREE.BufferAttribute(hot, 1));

	const pinMaterial = new THREE.ShaderMaterial({
		transparent: true,
		depthWrite: false,
		uniforms: {
			uTime: { value: 0 },
			uSize: { value: 30 * renderer.getPixelRatio() },
			uInk: { value: ink },
			uBrass: { value: brass },
			uRed: { value: red },
			uPaper: { value: parchment },
		},
		vertexShader: /* glsl */ `
			attribute float aShown;
			attribute float aArrive;
			attribute float aHot;
			uniform float uTime;
			uniform float uSize;
			varying float vPulse;
			varying float vHot;
			void main() {
				vec4 mv = modelViewMatrix * vec4(position, 1.0);
				gl_Position = projectionMatrix * mv;
				float age = uTime - aArrive;
				vPulse = clamp(1.0 - age / 1.8, 0.0, 1.0);
				vHot = aHot;
				float grow = 1.0 + 2.4 * vPulse + 1.2 * aHot;
				gl_PointSize = aShown > 0.5 ? uSize * grow / -mv.z : 0.0;
			}
		`,
		fragmentShader: /* glsl */ `
			uniform vec3 uInk;
			uniform vec3 uBrass;
			uniform vec3 uRed;
			uniform vec3 uPaper;
			varying float vPulse;
			varying float vHot;
			void main() {
				vec2 p = gl_PointCoord - 0.5;
				float d = length(p) * 2.0;
				if (d > 1.0) discard;
				float grow = 1.0 + 2.4 * vPulse + 1.2 * vHot;
				float core = d * grow;
				if (core <= 1.0) {
					// A map tack: red-ink head, an inked rim, a glint of paper.
					vec3 c = mix(uRed, uInk, smoothstep(0.55, 0.8, core));
					c = mix(c, uBrass, smoothstep(0.8, 0.95, core));
					float glint = smoothstep(0.45, 0.0, length(p * grow - vec2(-0.12, 0.12)) * 2.0);
					c = mix(c, uPaper, glint * 0.55);
					gl_FragColor = vec4(c, 1.0 - smoothstep(0.92, 1.0, core));
					return;
				}
				// The ripple of a new arrival, and the brass ring round a chosen pin.
				float ring = 1.0 - smoothstep(0.0, 0.09, abs(d - 0.9));
				float a = ring * max(vPulse * 0.9, vHot);
				if (a < 0.01) discard;
				gl_FragColor = vec4(mix(uRed, uBrass, vHot), a);
			}
		`,
	});
	const pinPoints = new THREE.Points(pinGeometry, pinMaterial);
	pinPoints.frustumCulled = false;
	scene.add(pinPoints);

	function pinsChanged() {
		pinGeometry.attributes.aShown.needsUpdate = true;
		pinGeometry.attributes.aArrive.needsUpdate = true;
		pinGeometry.attributes.aHot.needsUpdate = true;
	}

	// ---- Weather, drawn in ink and watercolour ------------------------------

	const washes = makeWashes(THREE, { ink, sepia, red, paper, parchment });
	const pool = [];
	for (let i = 0; i < 24; i++) {
		const sprite = new THREE.Sprite(
			new THREE.SpriteMaterial({ transparent: true, depthWrite: false, opacity: 0 }),
		);
		sprite.visible = false;
		sprite.userData = { born: -1, life: 1, kind: '' };
		scene.add(sprite);
		pool.push(sprite);
	}

	function weather(i, now) {
		if (still) return;
		const kind = washFor(pins[i].w);
		const sprite = pool.reduce((a, b) => (a.userData.born <= b.userData.born ? a : b));
		sprite.material.map = washes[kind];
		sprite.material.needsUpdate = true;
		sprite.position.copy(dirs[i]).multiplyScalar(1.035);
		sprite.userData = { born: now, life: kind === 'cloud' ? 2.6 : 1.9, kind };
		sprite.visible = true;
	}

	function animateWeather(now) {
		for (const s of pool) {
			if (!s.visible) continue;
			const k = (now - s.userData.born) / s.userData.life;
			if (k >= 1) {
				s.visible = false;
				continue;
			}
			const bloom = 1 - Math.pow(1 - Math.min(k * 2.2, 1), 3);
			let size = 0.07 + 0.17 * bloom;
			let alpha = Math.min(k * 6, 1) * (1 - smooth(0.55, 1, k));
			if (s.userData.kind === 'storm') alpha *= 0.55 + 0.45 * Math.abs(Math.sin(now * 22));
			if (s.userData.kind === 'rain') s.material.rotation = -0.15 * k;
			if (s.userData.kind === 'sun') s.material.rotation = k * 0.8;
			if (s.userData.kind === 'cloud') size *= 1.25;
			s.scale.set(size, size, 1);
			s.material.opacity = alpha * 0.95;
		}
	}

	// ---- The camera ---------------------------------------------------------

	const controls = new OrbitControls(camera, canvas);
	controls.enablePan = false;
	controls.enableDamping = !still;
	controls.dampingFactor = 0.08;
	controls.rotateSpeed = 0.5;
	controls.zoomSpeed = 0.6;
	controls.minDistance = 1.45;
	controls.maxDistance = 7;
	controls.autoRotate = !still;
	controls.autoRotateSpeed = 0.35;

	let baseDistance = fitDistance(camera.aspect);
	camera.position.copy(toVec(THREE, HOME.lat, HOME.lng, baseDistance));
	camera.lookAt(0, 0, 0);

	let idleTimer = 0;
	let guideOpen = false;
	controls.addEventListener('start', function () {
		controls.autoRotate = false;
		tween = null;
		clearTimeout(idleTimer);
	});
	controls.addEventListener('end', function () {
		clearTimeout(idleTimer);
		idleTimer = setTimeout(resumeDrift, 6000);
	});
	if (still) controls.addEventListener('change', render);

	function resumeDrift() {
		controls.autoRotate = !still && !guideOpen && !(mode === 'playing' && follow.checked);
	}

	let tween = null;
	let lastTween = -10;
	function flyTo(dir, distance, duration) {
		const target = { dir: dir.clone().normalize(), dist: distance };
		if (still) {
			camera.position.copy(target.dir).multiplyScalar(target.dist);
			camera.lookAt(0, 0, 0);
			controls.update();
			render();
			return;
		}
		tween = {
			from: camera.position.clone().normalize(),
			to: target.dir,
			d0: camera.position.length(),
			d1: target.dist,
			t0: clock,
			dur: duration,
		};
		lastTween = clock;
		controls.autoRotate = false;
	}

	function stepTween() {
		if (!tween) return;
		const k = ease(Math.min((clock - tween.t0) / tween.dur, 1));
		const dir = slerpDir(THREE, tween.from, tween.to, k);
		camera.position.copy(dir).multiplyScalar(tween.d0 + (tween.d1 - tween.d0) * k);
		camera.lookAt(0, 0, 0);
		if (k >= 1) tween = null;
	}

	// The brass ring hugs the globe whatever the zoom, so it follows the camera.
	let ringR = 0;
	function sizeRing() {
		const d = camera.position.length();
		const h = stage.clientHeight;
		const r = (h / 2) * (1 / Math.sqrt(Math.max(d * d - 1, 1e-4))) / Math.tan(FOV_HALF);
		if (Math.abs(r - ringR) > 0.5) {
			ringR = r;
			stage.style.setProperty('--globe-r', r.toFixed(1) + 'px');
		}
	}

	// ---- Picking pins -------------------------------------------------------

	const tip = $('pin-tip');
	const projected = new THREE.Vector3();
	let hover = -1;
	let selected = -1;

	function pick(clientX, clientY) {
		const rect = canvas.getBoundingClientRect();
		const cam = camera.position;
		let best = -1;
		let bestD = 18 * 18;
		for (let i = 0; i < n; i++) {
			if (shown[i] < 0.5) continue;
			const d = dirs[i];
			if (d.x * cam.x + d.y * cam.y + d.z * cam.z <= 1.02) continue;
			projected.copy(d).project(camera);
			const x = rect.left + ((projected.x + 1) / 2) * rect.width;
			const y = rect.top + ((1 - projected.y) / 2) * rect.height;
			const dd = (x - clientX) ** 2 + (y - clientY) ** 2;
			if (dd < bestD) {
				bestD = dd;
				best = i;
			}
		}
		return best;
	}

	let down = null;
	canvas.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }));
	canvas.addEventListener('pointermove', function (e) {
		if (e.pointerType !== 'mouse' || e.buttons) return;
		const i = pick(e.clientX, e.clientY);
		canvas.style.cursor = i >= 0 ? 'pointer' : '';
		if (i === hover) {
			if (i >= 0) placeTip(e);
			return;
		}
		hover = i;
		if (i < 0) {
			tip.hidden = true;
			return;
		}
		tip.textContent = pins[i].n + ' · ' + pins[i].p;
		tip.hidden = false;
		placeTip(e);
		window.dispatchEvent(new CustomEvent('voyage:hover', { detail: { id: pins[i].id } }));
	});
	canvas.addEventListener('pointerleave', () => (tip.hidden = true));
	canvas.addEventListener('pointerup', function (e) {
		if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
		const i = pick(e.clientX, e.clientY);
		if (i >= 0) {
			tip.hidden = true;
			choose(i);
			window.dispatchEvent(new CustomEvent('voyage:open', { detail: { id: pins[i].id } }));
		}
	});

	function placeTip(e) {
		const box = section.getBoundingClientRect();
		tip.style.left = e.clientX - box.left + 14 + 'px';
		tip.style.top = e.clientY - box.top + 14 + 'px';
	}

	function choose(i) {
		if (selected >= 0) hot[selected] = 0;
		selected = i;
		if (i >= 0) {
			hot[i] = 1;
			shown[i] = 1;
			guideOpen = true;
			if (mode === 'playing') pause();
			flyTo(dirs[i], Math.max(1.9, baseDistance * 0.68), 1.6);
		}
		pinsChanged();
		render();
	}

	window.addEventListener('voyage:fly', function (e) {
		const i = pins.findIndex((p) => p.id === e.detail.id);
		if (i >= 0) choose(i);
	});
	window.addEventListener('voyage:closed', function () {
		guideOpen = false;
		if (selected >= 0) hot[selected] = 0;
		selected = -1;
		pinsChanged();
		flyTo(camera.position, baseDistance, 1.2);
		clearTimeout(idleTimer);
		idleTimer = setTimeout(resumeDrift, 4000);
	});

	// ---- The voyage ---------------------------------------------------------

	const times = pins.map((p) => p.t);
	const tStart = n ? times[0] - 2 * DAY : 0;
	const tEnd = n ? times[n - 1] + DAY : 1;

	const play = $('voyage-play');
	const scrub = $('voyage-scrub');
	const dateOut = $('voyage-date');
	const follow = $('voyage-follow');
	const counts = {};
	section.querySelectorAll('[data-count]').forEach((el) => (counts[el.dataset.count] = el));

	scrub.min = String(tStart);
	scrub.max = String(tEnd);
	scrub.step = String(3600);
	scrub.value = String(tEnd);
	drawBars($('voyage-bars'), times, tStart, tEnd);

	const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
	let mode = 'explore';
	let cur = tEnd;
	let next = n;
	let speed = 1;
	let tally = freshTally();
	let shownDay = '';

	if (still) section.classList.add('voyage--still');

	play.addEventListener('click', function () {
		if (mode === 'playing') pause();
		else start();
	});
	section.querySelectorAll('[data-speed]').forEach(function (btn) {
		btn.addEventListener('click', function () {
			speed = Number(btn.dataset.speed);
			section.querySelectorAll('[data-speed]').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
		});
	});
	follow.addEventListener('change', resumeDrift);
	scrub.addEventListener('input', function () {
		if (mode === 'playing') pause();
		if (mode === 'explore') mode = 'paused';
		seek(Number(scrub.value));
	});

	function start() {
		if (!n || still) return;
		if (mode === 'explore' || cur >= tEnd) seek(tStart);
		mode = 'playing';
		section.classList.add('voyage--playing');
		play.setAttribute('aria-label', 'Pause the voyage');
		controls.autoRotate = !follow.checked;
		window.dispatchEvent(new CustomEvent('voyage:playing'));
	}

	function pause() {
		mode = 'paused';
		section.classList.remove('voyage--playing');
		play.setAttribute('aria-label', 'Play the voyage');
		updateReadout(true);
	}

	function finish() {
		mode = 'explore';
		cur = tEnd;
		section.classList.remove('voyage--playing');
		play.setAttribute('aria-label', 'Play the voyage again');
		scrub.value = String(tEnd);
		updateReadout(true);
		clearTimeout(idleTimer);
		idleTimer = setTimeout(resumeDrift, 2500);
	}

	// Jumps the voyage to a moment: everything seen by then is on the globe, quietly.
	function seek(t) {
		cur = t;
		tally = freshTally();
		next = 0;
		for (let i = 0; i < n; i++) {
			const seen = times[i] <= t;
			shown[i] = seen || i === selected ? 1 : 0;
			arrived[i] = -100;
			if (seen) {
				addToTally(i);
				next = i + 1;
			}
		}
		for (const s of pool) s.visible = false;
		pinsChanged();
		updateReadout(true);
		render();
	}

	function advance(dt) {
		if (next >= n) {
			if (cur >= tEnd) return finish();
			cur = Math.min(cur + 120 * DAY * dt, tEnd);
			return;
		}
		// About 45 days a second, hurrying through empty stretches and slowing
		// when sightings bunch up, so nothing waits long and nothing piles up.
		let rate = 45 * DAY * speed;
		const maxWait = 0.55 / speed;
		const gap = times[next] - cur;
		if (gap / rate > maxWait) rate = gap / maxWait;
		const cap = 4 * speed;
		if (next + cap < n && times[next + cap] - cur < rate) rate = Math.max(times[next + cap] - cur, 3600);
		cur += rate * Math.min(dt, 0.1);
		let landed = 0;
		while (next < n && times[next] <= cur) {
			arrive(next);
			next++;
			landed++;
		}
		if (landed) pinsChanged();
	}

	const recent = [];
	function arrive(i) {
		shown[i] = 1;
		arrived[i] = clock;
		addToTally(i);
		weather(i, clock);
		if (follow.checked && !guideOpen) {
			recent.push(dirs[i]);
			if (recent.length > 5) recent.shift();
			const aim = new THREE.Vector3();
			recent.forEach((d, k) => aim.addScaledVector(d, k + 1));
			if (aim.lengthSq() < 1e-6) return;
			aim.normalize();
			const facing = aim.dot(camera.position.clone().normalize());
			if (facing < 0.82 && clock - lastTween > 1.3) flyTo(aim, baseDistance, 1.5);
		}
	}

	function freshTally() {
		return { sightings: 0, animals: new Set(), countries: new Set(), storms: 0 };
	}

	function addToTally(i) {
		tally.sightings++;
		tally.animals.add(pins[i].s);
		if (pins[i].c) tally.countries.add(pins[i].c);
		if (pins[i].w === 'storm') tally.storms++;
	}

	function updateReadout(force) {
		const day = mode === 'explore' && cur >= tEnd ? 'The whole voyage' : dateFormat.format(new Date(cur * 1000));
		if (day === shownDay && !force) return;
		shownDay = day;
		dateOut.textContent = day;
		scrub.value = String(Math.round(cur));
		scrub.setAttribute('aria-valuetext', day);
		counts.sightings.textContent = tally.sightings;
		counts.animals.textContent = tally.animals.size;
		counts.countries.textContent = tally.countries.size;
		counts.storms.textContent = tally.storms;
	}

	// ---- Every frame --------------------------------------------------------

	let clock = 0;

	function render() {
		if (still) {
			sizeRing();
			renderer.render(scene, camera);
		}
	}

	new ResizeObserver(function () {
		const wasBase = Math.abs(camera.position.length() - baseDistance) < 0.05;
		baseDistance = fitDistance(stage.clientWidth / Math.max(stage.clientHeight, 1));
		if (wasBase && !tween) camera.position.setLength(baseDistance);
		pinMaterial.uniforms.uSize.value = 30 * renderer.getPixelRatio();
		render();
	}).observe(stage);

	if (still) {
		controls.update();
		requestAnimationFrame(render);
	}

	return function (time, delta) {
		clock = time;
		pinMaterial.uniforms.uTime.value = time;
		if (mode === 'playing') {
			advance(delta);
			updateReadout(false);
		}
		stepTween();
		if (!tween) controls.update();
		animateWeather(time);
		sizeRing();
	};
});

// ---- Helpers ----------------------------------------------------------------

function readPins() {
	try {
		const el = document.getElementById('voyage-pins');
		const all = el ? JSON.parse(el.textContent) : [];
		return Array.isArray(all) ? all.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng)) : [];
	} catch {
		return [];
	}
}

// Latitude and longitude to a point on a sphere, matching three.js's sphere UVs.
function toVec(THREE, lat, lng, r) {
	const a = lat * D2R;
	const b = lng * D2R;
	return new THREE.Vector3(r * Math.cos(a) * Math.cos(b), r * Math.sin(a), -r * Math.cos(a) * Math.sin(b));
}

// How far back the camera stands so the globe fills most of the screen.
function fitDistance(aspect) {
	const fill = 0.7;
	const tanAlpha = fill * Math.min(1, aspect) * Math.tan(FOV_HALF);
	return 1 / Math.sin(Math.atan(tanAlpha));
}

function slerpDir(THREE, a, b, k) {
	const dot = Math.min(Math.max(a.dot(b), -1), 1);
	if (dot > 0.9995) return a.clone().lerp(b, k).normalize();
	const theta = Math.acos(dot) * k;
	const rel = b.clone().addScaledVector(a, -dot);
	if (rel.lengthSq() < 1e-8) rel.set(0, 1, 0).cross(a);
	rel.normalize();
	return a.clone().multiplyScalar(Math.cos(theta)).addScaledVector(rel, Math.sin(theta));
}

function ease(k) {
	return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
}

function smooth(a, b, x) {
	const k = Math.min(Math.max((x - a) / (b - a), 0), 1);
	return k * k * (3 - 2 * k);
}

function hex(c) {
	return '#' + c.getHexString();
}

function rgba(c, a) {
	return `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, ${a})`;
}

// Paints the world as an old atlas: sea-green water with ruled waterlines,
// parchment land, a dotted border and an inked coast, on grainy paper.
function paintMap(canvas, world, c) {
	const W = 4096;
	const H = 2048;
	canvas.width = W;
	canvas.height = H;
	const g = canvas.getContext('2d');
	const projection = geoEquirectangular().scale(W / (2 * Math.PI)).translate([W / 2, H / 2]).precision(0.2);
	const path = geoPath(projection, g);
	const land = feature(world, world.objects.land);
	const borders = mesh(world, world.objects.countries, (a, b) => a !== b);

	const water = g.createLinearGradient(0, 0, 0, H);
	water.addColorStop(0, rgba(c.sea, 0.85));
	water.addColorStop(0.5, hex(c.sea));
	water.addColorStop(1, rgba(c.sea, 0.85));
	g.fillStyle = hex(c.paper);
	g.fillRect(0, 0, W, H);
	g.fillStyle = water;
	g.fillRect(0, 0, W, H);

	g.beginPath();
	path(geoGraticule10());
	g.strokeStyle = rgba(c.sepia, 0.35);
	g.lineWidth = 1.6;
	g.stroke();

	g.beginPath();
	path({ type: 'LineString', coordinates: [[-180, 0], [-90, 0], [0, 0], [90, 0], [180, 0]] });
	g.strokeStyle = rgba(c.red, 0.55);
	g.lineWidth = 2.4;
	g.setLineDash([18, 10]);
	g.stroke();
	g.setLineDash([]);

	// Waterlines: the ripples engravers ruled along a coast.
	for (let i = 4; i >= 1; i--) {
		g.beginPath();
		path(land);
		g.lineWidth = i * 9;
		g.strokeStyle = rgba(c.ink, 0.045 + (4 - i) * 0.012);
		g.stroke();
	}

	g.beginPath();
	path(land);
	g.fillStyle = hex(c.parchment);
	g.fill();

	g.save();
	g.beginPath();
	path(land);
	g.clip();
	g.beginPath();
	path(land);
	g.lineWidth = 26;
	g.strokeStyle = rgba(c.paper, 0.9);
	g.stroke();
	g.restore();

	g.beginPath();
	path(borders);
	g.setLineDash([5, 6]);
	g.strokeStyle = rgba(c.sepia, 0.6);
	g.lineWidth = 1.6;
	g.stroke();
	g.setLineDash([]);

	g.beginPath();
	path(land);
	g.strokeStyle = hex(c.ink);
	g.lineWidth = 2.6;
	g.stroke();

	grain(g, W, H, c);
}

// A tile of speckled noise laid over the whole map, so it reads as paper.
function grain(g, W, H, c) {
	const tile = document.createElement('canvas');
	tile.width = tile.height = 256;
	const t = tile.getContext('2d');
	const img = t.createImageData(256, 256);
	for (let i = 0; i < img.data.length; i += 4) {
		const v = Math.random();
		img.data[i] = c.ink.r * 255;
		img.data[i + 1] = c.ink.g * 255;
		img.data[i + 2] = c.ink.b * 255;
		img.data[i + 3] = v > 0.985 ? 70 : v * 18;
	}
	t.putImageData(img, 0, 0);
	g.fillStyle = g.createPattern(tile, 'repeat');
	g.fillRect(0, 0, W, H);

	const vignette = g.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, W * 0.6);
	vignette.addColorStop(0, 'rgba(0,0,0,0)');
	vignette.addColorStop(1, rgba(c.sepia, 0.18));
	g.fillStyle = vignette;
	g.fillRect(0, 0, W, H);
}

function washFor(sky) {
	switch (sky) {
		case 'clear':
			return 'sun';
		case 'rain':
		case 'drizzle':
			return 'rain';
		case 'snow':
			return 'snow';
		case 'storm':
			return 'storm';
		case 'fog':
		case 'dust':
			return 'haze';
		default:
			return 'cloud';
	}
}

// One small painted texture per kind of weather, made once and shared.
function makeWashes(THREE, c) {
	const kinds = {
		cloud(g) {
			for (const [x, y, r] of [[100, 140, 70], [160, 120, 80], [130, 100, 60], [190, 150, 55], [80, 160, 50]]) {
				const grad = g.createRadialGradient(x, y, r * 0.2, x, y, r);
				grad.addColorStop(0, rgba(c.paper, 0.55));
				grad.addColorStop(0.75, rgba(c.sepia, 0.22));
				grad.addColorStop(0.92, rgba(c.sepia, 0.34));
				grad.addColorStop(1, rgba(c.sepia, 0));
				g.fillStyle = grad;
				g.beginPath();
				g.arc(x, y, r, 0, Math.PI * 2);
				g.fill();
			}
		},
		sun(g) {
			g.strokeStyle = hex(c.ink);
			g.fillStyle = rgba(c.paper, 0.85);
			g.lineWidth = 6;
			g.beginPath();
			g.arc(128, 128, 38, 0, Math.PI * 2);
			g.fill();
			g.stroke();
			for (let i = 0; i < 12; i++) {
				const a = (i / 12) * Math.PI * 2;
				const r0 = 52;
				const r1 = i % 2 ? 80 : 96;
				g.beginPath();
				g.moveTo(128 + Math.cos(a) * r0, 128 + Math.sin(a) * r0);
				g.lineTo(128 + Math.cos(a) * r1, 128 + Math.sin(a) * r1);
				g.stroke();
			}
		},
		rain(g) {
			kinds.cloud(g);
			g.strokeStyle = rgba(c.ink, 0.85);
			g.lineWidth = 4;
			g.lineCap = 'round';
			for (let i = 0; i < 14; i++) {
				const x = 50 + i * 12 + (i % 3) * 4;
				const y = 150 + (i % 4) * 10;
				g.beginPath();
				g.moveTo(x, y);
				g.lineTo(x - 14, y + 44);
				g.stroke();
			}
		},
		snow(g) {
			kinds.cloud(g);
			for (let i = 0; i < 26; i++) {
				const x = 40 + ((i * 53) % 176);
				const y = 150 + ((i * 29) % 80);
				g.fillStyle = '#fffaf0';
				g.strokeStyle = rgba(c.ink, 0.5);
				g.lineWidth = 1.5;
				g.beginPath();
				g.arc(x, y, 4 + (i % 3), 0, Math.PI * 2);
				g.fill();
				g.stroke();
			}
		},
		storm(g) {
			for (const [x, y, r] of [[110, 110, 80], [170, 120, 70], [140, 90, 60]]) {
				const grad = g.createRadialGradient(x, y, r * 0.2, x, y, r);
				grad.addColorStop(0, rgba(c.ink, 0.45));
				grad.addColorStop(0.9, rgba(c.ink, 0.3));
				grad.addColorStop(1, rgba(c.ink, 0));
				g.fillStyle = grad;
				g.beginPath();
				g.arc(x, y, r, 0, Math.PI * 2);
				g.fill();
			}
			g.strokeStyle = hex(c.red);
			g.lineWidth = 9;
			g.lineJoin = 'miter';
			g.beginPath();
			g.moveTo(150, 120);
			g.lineTo(118, 170);
			g.lineTo(146, 172);
			g.lineTo(110, 236);
			g.stroke();
		},
		haze(g) {
			g.strokeStyle = rgba(c.sepia, 0.7);
			g.lineWidth = 6;
			g.lineCap = 'round';
			for (let row = 0; row < 5; row++) {
				const y = 80 + row * 24;
				g.beginPath();
				for (let x = 40; x <= 216; x += 8) {
					const yy = y + Math.sin((x + row * 30) / 16) * 5;
					if (x === 40) g.moveTo(x, yy);
					else g.lineTo(x, yy);
				}
				g.stroke();
			}
		},
	};

	const out = {};
	for (const [name, draw] of Object.entries(kinds)) {
		const cv = document.createElement('canvas');
		cv.width = cv.height = 256;
		draw(cv.getContext('2d'));
		const tex = new THREE.CanvasTexture(cv);
		tex.colorSpace = THREE.SRGBColorSpace;
		out[name] = tex;
	}
	return out;
}

// The month-by-month bars under the timeline, so busy stretches show ahead of time.
function drawBars(el, times, tStart, tEnd) {
	if (!el || !times.length) return;
	const months = new Map();
	for (const t of times) {
		const d = new Date(t * 1000);
		const key = d.getUTCFullYear() * 12 + d.getUTCMonth();
		months.set(key, (months.get(key) || 0) + 1);
	}
	const most = Math.max(...months.values());
	const span = tEnd - tStart;
	const frag = document.createDocumentFragment();
	for (const [key, count] of months) {
		const start = Date.UTC(Math.floor(key / 12), key % 12, 1) / 1000;
		const bar = document.createElement('span');
		bar.style.left = (((start - tStart) / span) * 100).toFixed(3) + '%';
		bar.style.width = ((30 * DAY) / span * 100).toFixed(3) + '%';
		bar.style.height = (18 + (count / most) * 82).toFixed(1) + '%';
		frag.appendChild(bar);
	}
	el.replaceChildren(frag);
}
