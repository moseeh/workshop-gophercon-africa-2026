// The antique globe: an inked map on a sphere, a tack per sighting, and the
// voyage that plays them back in the order they were seen, each arriving
// with the weather it was seen in. Crowded tacks gather under numbered seals.

import { mount } from '/assets/js/threejs.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { geoEquirectangular, geoPath, geoGraticule10 } from 'd3-geo';
import { feature, mesh } from 'topojson-client';
import { pins, byId, passes, emit, on, shortPlace, tally, plural, DAY } from '/assets/js/atlas.js';

const WORLD = 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json';
const D2R = Math.PI / 180;
const FOV_HALF = 25 * D2R;
const HOME = { lat: -1.29, lng: 36.82 }; // Nairobi, where the voyage sets out from.
const CLUSTER_PX = 26;
const NEAREST = 1.06; // How close the camera may come: just above the paper.

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
		new THREE.SphereGeometry(1, 128, 96),
		new THREE.MeshStandardMaterial({ color: sea, roughness: 0.92, metalness: 0 }),
	);
	scene.add(globe);

	scene.add(new THREE.AmbientLight(0xfff1dc, 1.1));
	const lamp = new THREE.DirectionalLight(0xffe2b8, 1.6);
	lamp.position.set(-2.5, 2.5, 3);
	camera.add(lamp);
	scene.add(camera);
	camera.near = 0.01;
	camera.updateProjectionMatrix();

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
	const dim = new Float32Array(n);
	const clustered = new Float32Array(n);
	const noted = Float32Array.from(pins, (p) => (p.r ? 1 : 0));
	const dirs = pins.map((p) => toVec(THREE, p.lat, p.lng, 1));
	dirs.forEach((d, i) => d.clone().multiplyScalar(1.004).toArray(positions, i * 3));

	const pinGeometry = new THREE.BufferGeometry();
	pinGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
	for (const [name, data] of [
		['aShown', shown],
		['aArrive', arrived],
		['aHot', hot],
		['aDim', dim],
		['aClustered', clustered],
		['aNote', noted],
	]) {
		pinGeometry.setAttribute(name, new THREE.BufferAttribute(data, 1));
	}

	const pinMaterial = new THREE.ShaderMaterial({
		transparent: true,
		depthWrite: false,
		uniforms: {
			uTime: { value: 0 },
			uSize: { value: 15 * renderer.getPixelRatio() },
			uInk: { value: ink },
			uBrass: { value: brass },
			uRed: { value: red },
			uPaper: { value: parchment },
		},
		vertexShader: /* glsl */ `
			attribute float aShown;
			attribute float aArrive;
			attribute float aHot;
			attribute float aDim;
			attribute float aClustered;
			attribute float aNote;
			uniform float uTime;
			uniform float uSize;
			varying float vPulse;
			varying float vHot;
			varying float vDim;
			varying float vNote;
			void main() {
				vec4 mv = modelViewMatrix * vec4(position, 1.0);
				gl_Position = projectionMatrix * mv;
				float age = uTime - aArrive;
				vPulse = clamp(1.0 - age / 1.8, 0.0, 1.0);
				vHot = aHot;
				vDim = aDim;
				vNote = aNote;
				// A fixed size on screen, so coming closer spreads crowded tacks apart.
				float grow = 1.0 + 2.4 * vPulse + 1.2 * aHot;
				float size = uSize * grow * (1.0 - 0.3 * aDim);
				gl_PointSize = (aShown > 0.5 && aClustered < 0.5) ? size : 0.0;
			}
		`,
		fragmentShader: /* glsl */ `
			uniform vec3 uInk;
			uniform vec3 uBrass;
			uniform vec3 uRed;
			uniform vec3 uPaper;
			varying float vPulse;
			varying float vHot;
			varying float vDim;
			varying float vNote;
			void main() {
				vec2 p = gl_PointCoord - 0.5;
				float d = length(p) * 2.0;
				if (d > 1.0) discard;
				float grow = 1.0 + 2.4 * vPulse + 1.2 * vHot;
				float core = d * grow;
				float fade = 1.0 - 0.72 * vDim;
				if (core <= 1.0) {
					// A map tack: red-ink head and an inked rim, gilded when the observer left a note.
					float rimStart = mix(0.8, 0.62, vNote);
					vec3 c = mix(uRed, uInk, smoothstep(0.55, 0.8, core) * (1.0 - vNote));
					c = mix(c, mix(uBrass, vec3(0.93, 0.78, 0.42), vNote), smoothstep(rimStart, rimStart + 0.12, core));
					float glint = smoothstep(0.45, 0.0, length(p * grow - vec2(-0.12, 0.12)) * 2.0);
					c = mix(c, uPaper, glint * 0.55);
					gl_FragColor = vec4(c, (1.0 - smoothstep(0.92, 1.0, core)) * fade);
					return;
				}
				// The ripple of a new arrival, and the brass ring round a chosen tack.
				float ring = 1.0 - smoothstep(0.0, 0.09, abs(d - 0.9));
				float a = ring * max(vPulse * 0.9, vHot) * fade;
				if (a < 0.01) discard;
				gl_FragColor = vec4(mix(uRed, uBrass, vHot), a);
			}
		`,
	});
	const pinPoints = new THREE.Points(pinGeometry, pinMaterial);
	pinPoints.frustumCulled = false;
	scene.add(pinPoints);

	function pinsChanged() {
		for (const name of ['aShown', 'aArrive', 'aHot', 'aDim', 'aClustered']) {
			pinGeometry.attributes[name].needsUpdate = true;
		}
		clustersDirty = true;
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
	controls.minDistance = NEAREST;
	controls.maxDistance = 7;
	controls.autoRotate = !still;
	controls.autoRotateSpeed = 0.35;

	let baseDistance = fitDistance(camera.aspect);
	camera.position.copy(toVec(THREE, HOME.lat, HOME.lng, baseDistance));
	camera.lookAt(0, 0, 0);

	let idleTimer = 0;
	let guideOpen = false;
	controls.addEventListener('start', function () {
		$('voyage-play')?.classList.remove('seal--nudge');
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
		controls.autoRotate = !still && !guideOpen && !focus && !(mode === 'playing' && follow.checked);
	}

	// Closer to the paper, a drag or a scroll moves less, so it stays steady.
	function gearControls() {
		const k = Math.min(Math.max((camera.position.length() - 1) / (baseDistance - 1), 0.04), 1);
		controls.rotateSpeed = 0.5 * k;
		controls.zoomSpeed = 0.25 + 0.35 * k;
	}

	let tween = null;
	let lastTween = -10;
	function flyTo(dir, distance, duration) {
		const target = { dir: dir.clone().normalize(), dist: Math.max(distance, NEAREST) };
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

	// Flies to frame a set of tacks: close for a town, wide for a continent.
	function frame(indices) {
		if (!indices.length) return;
		const centre = new THREE.Vector3();
		for (const i of indices) centre.add(dirs[i]);
		if (centre.lengthSq() < 1e-6) return flyTo(camera.position, baseDistance, 1.4);
		centre.normalize();
		let spread = 0;
		for (const i of indices) spread = Math.max(spread, centre.angleTo(dirs[i]));
		flyTo(centre, distanceFor(spread), 1.6);
	}

	function distanceFor(spread) {
		if (spread > 1.3) return baseDistance;
		const view = 0.62 * FOV_HALF * Math.min(1, stage.clientWidth / Math.max(stage.clientHeight, 1));
		const d = Math.cos(spread) + Math.sin(Math.max(spread, 0.012)) / Math.tan(view);
		// Phones stand further back: the panel covers half the screen and the paper
		// coarsens up close.
		const nearest = stage.clientWidth < 760 ? 1.9 : 1.4;
		return Math.min(Math.max(d, nearest), baseDistance * 1.05);
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
			stage.classList.toggle('is-close', r > Math.max(stage.clientWidth, h));
		}
	}

	// ---- Where tacks are on screen ------------------------------------------

	const projected = new THREE.Vector3();
	function screenOf(i, rect) {
		const cam = camera.position;
		const d = dirs[i];
		if (d.x * cam.x + d.y * cam.y + d.z * cam.z <= 1.004) return null;
		projected.copy(d).multiplyScalar(1.004).project(camera);
		if (projected.z > 1) return null;
		return {
			x: ((projected.x + 1) / 2) * rect.width,
			y: ((1 - projected.y) / 2) * rect.height,
		};
	}

	// ---- Clusters: crowded tacks gather under one numbered seal -------------

	const clusterLayer = $('clusters');
	const seals = [];
	let clusters = [];
	let clustersDirty = true;
	const lastCam = new THREE.Vector3();

	function gatherClusters() {
		const moved = lastCam.distanceToSquared(camera.position) > 1e-9;
		if (!moved && !clustersDirty) return;
		lastCam.copy(camera.position);
		clustersDirty = false;

		const rect = { width: stage.clientWidth, height: stage.clientHeight };
		const cells = new Map();
		const groups = [];
		const off = mode === 'playing';
		let changed = false;

		for (let i = 0; i < n; i++) {
			const want = 0;
			if (!off && shown[i] > 0.5 && dim[i] < 0.5 && i !== selected) {
				const s = screenOf(i, rect);
				if (s) {
					const gx = Math.floor(s.x / CLUSTER_PX);
					const gy = Math.floor(s.y / CLUSTER_PX);
					let home = null;
					for (let dx = -1; dx <= 1 && !home; dx++) {
						for (let dy = -1; dy <= 1 && !home; dy++) {
							for (const g of cells.get(gx + dx + ',' + (gy + dy)) || []) {
								if ((g.ax - s.x) ** 2 + (g.ay - s.y) ** 2 < CLUSTER_PX * CLUSTER_PX) {
									home = g;
									break;
								}
							}
						}
					}
					if (home) {
						home.members.push(i);
						home.x += s.x;
						home.y += s.y;
					} else {
						const g = { ax: s.x, ay: s.y, x: s.x, y: s.y, members: [i] };
						groups.push(g);
						const key = gx + ',' + gy;
						if (!cells.has(key)) cells.set(key, []);
						cells.get(key).push(g);
					}
				}
			}
			if (clustered[i] !== want) {
				clustered[i] = want;
				changed = true;
			}
		}

		// A seal is wider than the gathering distance, so seals that would still
		// touch, or sit on a lone tack, are merged until they stand apart.
		const SEAL_GAP = 36;
		for (const g of groups) {
			g.cx = g.x / g.members.length;
			g.cy = g.y / g.members.length;
		}
		let merged = true;
		while (merged) {
			merged = false;
			for (let a = 0; a < groups.length; a++) {
				const A = groups[a];
				for (let b = a + 1; b < groups.length; b++) {
					const B = groups[b];
					if (A.members.length < 2 && B.members.length < 2) continue;
					if ((A.cx - B.cx) ** 2 + (A.cy - B.cy) ** 2 < SEAL_GAP * SEAL_GAP) {
						A.members.push(...B.members);
						A.x += B.x;
						A.y += B.y;
						A.cx = A.x / A.members.length;
						A.cy = A.y / A.members.length;
						groups.splice(b, 1);
						b--;
						merged = true;
					}
				}
			}
		}
		clusters = groups.filter((g) => g.members.length > 1);
		for (const g of clusters) {
			for (const i of g.members) {
				if (clustered[i] !== 1) {
					clustered[i] = 1;
					changed = true;
				}
			}
		}
		if (changed) pinGeometry.attributes.aClustered.needsUpdate = true;
		placeSeals();
	}

	function placeSeals() {
		if (!clusterLayer) return;
		while (seals.length < clusters.length) {
			const seal = document.createElement('button');
			seal.type = 'button';
			seal.className = 'cluster';
			seal.addEventListener('click', () => openCluster(seal._cluster));
			seal.addEventListener('mouseenter', () => showTip(seal._label, seal));
			seal.addEventListener('mouseleave', () => (tip.hidden = true));
			clusterLayer.appendChild(seal);
			seals.push(seal);
		}
		seals.forEach(function (seal, k) {
			const g = clusters[k];
			if (!g) {
				seal.hidden = true;
				return;
			}
			const count = g.members.length;
			const x = g.cx;
			const y = g.cy;
			seal._cluster = g;
			seal._label = plural(count, 'sighting') + ' here';
			seal.hidden = false;
			seal.textContent = count;
			seal.setAttribute('aria-label', plural(count, 'sighting') + ' close together. Open the list.');
			seal.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
			seal.classList.toggle('cluster--big', count >= 10);
		});
	}

	function openCluster(g) {
		if (!g) return;
		const ids = g.members.slice();
		const where = tally(ids.map((i) => shortPlace(pins[i].p)))[0];
		const title = where ? 'Around ' + where[0] : 'Sightings here';
		tip.hidden = true;
		if (mode === 'playing') pause();
		guideOpen = true;
		const centre = new THREE.Vector3();
		for (const i of ids) centre.add(dirs[i]);
		let spread = 0;
		centre.normalize();
		for (const i of ids) spread = Math.max(spread, centre.angleTo(dirs[i]));
		flyTo(centre, Math.min(distanceFor(spread * 2.2), camera.position.length() * 0.75), 1.3);
		emit('atlas:list', { kind: 'cluster', title, ids: ids.map((i) => pins[i].id) });
	}

	// ---- Picking tacks ------------------------------------------------------

	const tip = $('pin-tip');
	let hover = -1;
	let selected = -1;

	function pick(clientX, clientY) {
		const rect = canvas.getBoundingClientRect();
		let best = -1;
		let bestD = 18 * 18;
		for (let i = 0; i < n; i++) {
			if (shown[i] < 0.5 || clustered[i] > 0.5) continue;
			const s = screenOf(i, rect);
			if (!s) continue;
			const dd = (rect.left + s.x - clientX) ** 2 + (rect.top + s.y - clientY) ** 2;
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
			if (i >= 0) placeTip(e.clientX, e.clientY);
			return;
		}
		hover = i;
		if (i < 0) {
			tip.hidden = true;
			return;
		}
		tip.textContent = pins[i].n + ' · ' + pins[i].p;
		tip.hidden = false;
		placeTip(e.clientX, e.clientY);
		emit('voyage:hover', { id: pins[i].id });
	});
	canvas.addEventListener('pointerleave', () => (tip.hidden = true));
	canvas.addEventListener('pointerup', function (e) {
		if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
		const i = pick(e.clientX, e.clientY);
		if (i >= 0) {
			tip.hidden = true;
			choose(i);
			emit('voyage:open', { id: pins[i].id });
		}
	});

	function placeTip(x, y) {
		const box = section.getBoundingClientRect();
		tip.style.left = x - box.left + 14 + 'px';
		tip.style.top = y - box.top + 14 + 'px';
	}

	function showTip(text, near) {
		const r = near.getBoundingClientRect();
		tip.textContent = text;
		tip.hidden = false;
		placeTip(r.right - 6, r.top + 2);
	}

	function choose(i, keepDistance) {
		if (selected >= 0) hot[selected] = 0;
		selected = i;
		if (i >= 0) {
			hot[i] = 1;
			shown[i] = 1;
			guideOpen = true;
			if (mode === 'playing') pause();
			const close = Math.max(1.35, baseDistance * 0.62);
			flyTo(dirs[i], keepDistance ? Math.min(camera.position.length(), close) : close, 1.5);
		}
		pinsChanged();
		render();
	}

	on('voyage:fly', function (d) {
		const i = byId.get(d.id);
		if (i !== undefined) choose(i, d.keepDistance);
	});

	on('voyage:closed', function () {
		guideOpen = false;
		if (selected >= 0) hot[selected] = 0;
		selected = -1;
		clearFocus();
		pinsChanged();
		flyTo(camera.position, baseDistance, 1.2);
		clearTimeout(idleTimer);
		idleTimer = setTimeout(resumeDrift, 4000);
	});

	// ---- Focus: a search lights its tacks and dims the rest ------------------

	let focus = null;
	let ring = null;

	on('atlas:focus', function (d) {
		if (mode === 'playing') pause();
		guideOpen = true;
		focus = new Set((d.ids || []).map((id) => byId.get(id)).filter((i) => i !== undefined));
		drawCircle(d.circle);
		applyVisibility();
		if (d.circle) {
			const spread = d.circle.km / 6371;
			flyTo(toVec(THREE, d.circle.lat, d.circle.lng, 1), distanceFor(spread * 1.15), 1.6);
		} else {
			frame([...focus]);
		}
	});

	function clearFocus() {
		focus = null;
		drawCircle(null);
		applyVisibility();
	}

	// A dashed red-ink circle on the paper, round a city searched for.
	function drawCircle(circle) {
		if (ring) {
			scene.remove(ring);
			ring.geometry.dispose();
			ring = null;
		}
		if (!circle) return render();
		const a = circle.km / 6371;
		const c = toVec(THREE, circle.lat, circle.lng, 1);
		const u = new THREE.Vector3(0, 1, 0).cross(c);
		if (u.lengthSq() < 1e-6) u.set(1, 0, 0);
		u.normalize();
		const v = c.clone().cross(u).normalize();
		const points = [];
		for (let k = 0; k <= 96; k++) {
			const t = (k / 96) * Math.PI * 2;
			points.push(
				c.clone().multiplyScalar(Math.cos(a))
					.addScaledVector(u, Math.sin(a) * Math.cos(t))
					.addScaledVector(v, Math.sin(a) * Math.sin(t))
					.multiplyScalar(1.003),
			);
		}
		ring = new THREE.Line(
			new THREE.BufferGeometry().setFromPoints(points),
			new THREE.LineDashedMaterial({ color: red, dashSize: a * 0.12, gapSize: a * 0.07, transparent: true, opacity: 0.9 }),
		);
		ring.computeLineDistances();
		scene.add(ring);
		render();
	}

	// ---- Filters ------------------------------------------------------------

	on('atlas:filter', function () {
		rebuildActive();
		applyVisibility();
		drawBars($('voyage-bars'), active.map((i) => times[i]), tStart, tEnd);
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

	const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
	let mode = 'explore';
	let cur = tEnd;
	let active = [];
	let k = 0;
	let speed = 1;
	let count = freshTally();
	let shownDay = '';

	rebuildActive();
	drawBars($('voyage-bars'), active.map((i) => times[i]), tStart, tEnd);

	if (still) section.classList.add('voyage--still');

	play.addEventListener('click', function () {
		if (mode === 'playing') pause();
		else start();
	});
	on('voyage:play', start);
	on('voyage:pause', function () {
		if (mode === 'playing') pause();
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

	// The sightings the voyage plays: those the filters let through, oldest first.
	function rebuildActive() {
		active = [];
		for (let i = 0; i < n; i++) if (passes(i)) active.push(i);
	}

	function start() {
		if (!n || still) return;
		if (focus || guideOpen) emit('atlas:clear');
		if (mode === 'explore' || cur >= tEnd) seek(tStart);
		play.classList.remove('seal--nudge');
		mode = 'playing';
		section.classList.add('voyage--playing');
		play.setAttribute('aria-label', 'Pause the voyage');
		controls.autoRotate = !follow.checked;
		clustersDirty = true;
		emit('voyage:playing');
	}

	function pause() {
		mode = 'paused';
		section.classList.remove('voyage--playing');
		play.setAttribute('aria-label', 'Play the voyage');
		updateReadout(true);
		clustersDirty = true;
	}

	function finish() {
		mode = 'explore';
		cur = tEnd;
		section.classList.remove('voyage--playing');
		play.setAttribute('aria-label', 'Play the voyage again');
		scrub.value = String(tEnd);
		updateReadout(true);
		clustersDirty = true;
		clearTimeout(idleTimer);
		idleTimer = setTimeout(resumeDrift, 2500);
	}

	// Shows what's been seen by the voyage's date, filtered, and lit or dimmed by a search.
	function applyVisibility() {
		for (let i = 0; i < n; i++) {
			const inFocus = focus ? focus.has(i) : false;
			const seen = times[i] <= cur;
			shown[i] = (seen && (passes(i) || inFocus)) || i === selected ? 1 : 0;
			dim[i] = focus && !inFocus ? 1 : 0;
		}
		count = freshTally();
		k = 0;
		for (const i of active) {
			if (times[i] > cur) break;
			addToTally(i);
			k++;
		}
		pinsChanged();
		updateReadout(true);
		render();
	}

	// Jumps the voyage to a moment: everything seen by then is on the globe, quietly.
	function seek(t) {
		cur = t;
		arrived.fill(-100);
		for (const s of pool) s.visible = false;
		applyVisibility();
	}

	function advance(dt) {
		if (k >= active.length) {
			if (cur >= tEnd) return finish();
			cur = Math.min(cur + 120 * DAY * dt, tEnd);
			return;
		}
		// About 45 days a second, hurrying through empty stretches and slowing
		// when sightings bunch up, so nothing waits long and nothing piles up.
		let rate = 45 * DAY * speed;
		const maxWait = 0.55 / speed;
		const gap = times[active[k]] - cur;
		if (gap / rate > maxWait) rate = gap / maxWait;
		const cap = 4 * speed;
		if (k + cap < active.length && times[active[k + cap]] - cur < rate) {
			rate = Math.max(times[active[k + cap]] - cur, 3600);
		}
		cur += rate * Math.min(dt, 0.1);
		let landed = 0;
		while (k < active.length && times[active[k]] <= cur) {
			arrive(active[k]);
			k++;
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
			recent.forEach((d, j) => aim.addScaledVector(d, j + 1));
			if (aim.lengthSq() < 1e-6) return;
			aim.normalize();
			const facing = aim.dot(camera.position.clone().normalize());
			if (facing < 0.82 && clock - lastTween > 1.3) flyTo(aim, Math.max(camera.position.length(), baseDistance * 0.85), 1.5);
		}
	}

	function freshTally() {
		return { sightings: 0, animals: new Set(), countries: new Set(), storms: 0 };
	}

	function addToTally(i) {
		count.sightings++;
		count.animals.add(pins[i].s);
		if (pins[i].c) count.countries.add(pins[i].c);
		if (pins[i].w === 'storm') count.storms++;
	}

	function updateReadout(force) {
		const day = mode === 'explore' && cur >= tEnd ? 'The whole voyage' : dateFormat.format(new Date(cur * 1000));
		if (day === shownDay && !force) return;
		shownDay = day;
		dateOut.textContent = day;
		scrub.value = String(Math.round(cur));
		scrub.setAttribute('aria-valuetext', day);
		counts.sightings.textContent = count.sightings;
		counts.animals.textContent = count.animals.size;
		counts.countries.textContent = count.countries.size;
		counts.storms.textContent = count.storms;
	}

	// ---- Every frame --------------------------------------------------------

	let clock = 0;

	function render() {
		if (still) {
			sizeRing();
			gatherClusters();
			renderer.render(scene, camera);
		}
	}

	new ResizeObserver(function () {
		const wasBase = Math.abs(camera.position.length() - baseDistance) < 0.05;
		baseDistance = fitDistance(stage.clientWidth / Math.max(stage.clientHeight, 1));
		if (wasBase && !tween) camera.position.setLength(baseDistance);
		pinMaterial.uniforms.uSize.value = 15 * renderer.getPixelRatio();
		clustersDirty = true;
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
		gearControls();
		animateWeather(time);
		sizeRing();
		gatherClusters();
	};
});

// ---- Helpers ----------------------------------------------------------------

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
