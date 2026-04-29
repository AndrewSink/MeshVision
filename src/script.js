import * as THREE from 'three';
import Chart from 'chart.js/auto';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const canvasContainer = document.getElementById('canvas-container');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf1f5f9);

const camera = new THREE.PerspectiveCamera(
    45,
    canvasContainer.clientWidth / canvasContainer.clientHeight,
    0.01,
    100000
);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
renderer.shadowMap.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
canvasContainer.appendChild(renderer.domElement);

const pmremGenerator = new THREE.PMREMGenerator(renderer);
scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;

let heatmapApplied = false;

const meshColor = new THREE.Color(0xa3b1c2);

function createMeshMaterial() {
    return new THREE.MeshPhysicalMaterial({
        color: meshColor,
        metalness: 0.25,
        roughness: 0.35,
        clearcoat: 0.4,
        clearcoatRoughness: 0.25,
        side: THREE.DoubleSide
    });
}

const hemiLight = new THREE.HemisphereLight(0xeaf2ff, 0x394452, 0.55);
scene.add(hemiLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
directionalLight.position.set(1, 1, 1);
scene.add(directionalLight);

const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.2);
directionalLight2.position.set(15, 15, 15);
scene.add(directionalLight2);

const directionalLight3 = new THREE.DirectionalLight(0xffffff, 0.15);
directionalLight3.position.set(-10, -10, -10);
scene.add(directionalLight3);

const NUM_BINS = 20;
const MIN_BIN_FRACTION = 0.01;
const OVERFLOW_COLOR = 'rgb(203, 213, 225)';
const COLOR_WARM = [251, 146, 60];
const COLOR_COOL = [56, 189, 248];

function lerpColor(c1, c2, t) {
    const r = Math.round(c1[0] + (c2[0] - c1[0]) * t);
    const g = Math.round(c1[1] + (c2[1] - c1[1]) * t);
    const b = Math.round(c1[2] + (c2[2] - c1[2]) * t);
    return `rgb(${r}, ${g}, ${b})`;
}

let chartDescriptions = [];

const chart = new Chart('chart-canvas', {
    type: 'bar',
    data: {
        labels: [],
        datasets: [{
            label: 'Triangle count',
            data: [],
            backgroundColor: [],
            borderWidth: 0,
            borderRadius: 2,
            categoryPercentage: 0.95,
            barPercentage: 1.0
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
            legend: { display: false },
            tooltip: {
                callbacks: {
                    title: (items) => {
                        const n = items[0].parsed.y;
                        return `${n.toLocaleString()} triangle${n === 1 ? '' : 's'}`;
                    },
                    label: (item) => chartDescriptions[item.dataIndex] ?? `Around this size: ${item.label} mm²`
                }
            }
        },
        scales: {
            x: {
                title: { display: true, text: 'Triangle size  (smaller → larger)', color: '#475569' },
                ticks: { display: false },
                grid: { display: false }
            },
            y: {
                title: { display: true, text: 'Triangle count', color: '#475569' },
                ticks: { color: '#64748b' },
                grid: { color: 'rgba(148, 163, 184, 0.2)' },
                beginAtZero: true
            }
        }
    }
});

function computeTriangleAreas(geometry) {
    const pos = geometry.attributes.position;
    const triCount = Math.floor(pos.count / 3);
    const areas = new Float64Array(triCount);
    const vA = new THREE.Vector3();
    const vB = new THREE.Vector3();
    const vC = new THREE.Vector3();
    const ab = new THREE.Vector3();
    const cb = new THREE.Vector3();
    for (let t = 0; t < triCount; t++) {
        const i = t * 3;
        vA.fromBufferAttribute(pos, i);
        vB.fromBufferAttribute(pos, i + 1);
        vC.fromBufferAttribute(pos, i + 2);
        ab.subVectors(vA, vB);
        cb.subVectors(vC, vB);
        areas[t] = ab.cross(cb).length() / 2;
    }
    return areas;
}

function formatArea(value) {
    if (!isFinite(value)) return '—';
    return `${Number(value).toPrecision(3)} mm²`;
}

function median(sorted) {
    const n = sorted.length;
    if (n === 0) return NaN;
    const mid = Math.floor(n / 2);
    return n % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function describeAreas(positiveSorted) {
    if (positiveSorted.length === 0) return '';
    const min = positiveSorted[0];
    const max = positiveSorted[positiveSorted.length - 1];
    const med = median(positiveSorted);
    if (min === max) return `All triangles are the same size: ${formatArea(min)}.`;
    const ratio = max / min;
    return `Most triangles are around ${formatArea(med)}. The largest are about ${Number(ratio).toPrecision(2)}× bigger than the smallest.`;
}

function buildHistogram(positiveAreasSorted) {
    const labels = [];
    const bins = [];
    const descriptions = [];
    const colors = [];

    if (positiveAreasSorted.length === 0) {
        return { labels, bins, descriptions, colors };
    }

    const minArea = positiveAreasSorted[0];
    const maxArea = positiveAreasSorted[positiveAreasSorted.length - 1];

    if (minArea === maxArea) {
        labels.push(`${Number(minArea).toPrecision(2)} – ${Number(maxArea).toPrecision(2)}`);
        bins.push(positiveAreasSorted.length);
        descriptions.push(`All triangles around ${formatArea(minArea)}`);
        colors.push(lerpColor(COLOR_WARM, COLOR_COOL, 0.5));
        return { labels, bins, descriptions, colors };
    }

    const logMin = Math.log10(minArea);
    const logMax = Math.log10(maxArea);
    const logBin = (logMax - logMin) / NUM_BINS;

    const rawBins = new Array(NUM_BINS).fill(0);
    for (const area of positiveAreasSorted) {
        let idx = Math.floor((Math.log10(area) - logMin) / logBin);
        if (idx < 0) idx = 0;
        if (idx >= NUM_BINS) idx = NUM_BINS - 1;
        rawBins[idx]++;
    }

    const total = positiveAreasSorted.length;
    const threshold = total * MIN_BIN_FRACTION;

    let firstSig = -1;
    let lastSig = -1;
    for (let i = 0; i < NUM_BINS; i++) {
        if (rawBins[i] >= threshold) {
            if (firstSig === -1) firstSig = i;
            lastSig = i;
        }
    }
    if (firstSig === -1) {
        firstSig = 0;
        lastSig = NUM_BINS - 1;
    }

    const boundaryAt = (i) => Math.pow(10, logMin + i * logBin);

    if (firstSig > 0) {
        let sum = 0;
        for (let i = 0; i < firstSig; i++) sum += rawBins[i];
        if (sum > 0) {
            const boundary = boundaryAt(firstSig);
            labels.push(`< ${Number(boundary).toPrecision(2)}`);
            bins.push(sum);
            descriptions.push(`Smaller than ${Number(boundary).toPrecision(2)} mm²`);
            colors.push(OVERFLOW_COLOR);
        }
    }

    const visible = lastSig - firstSig + 1;
    for (let i = firstSig; i <= lastSig; i++) {
        const start = boundaryAt(i);
        const end = boundaryAt(i + 1);
        const range = `${Number(start).toPrecision(2)} – ${Number(end).toPrecision(2)}`;
        labels.push(range);
        bins.push(rawBins[i]);
        descriptions.push(`Around this size: ${range} mm²`);
        const t = visible === 1 ? 0.5 : (i - firstSig) / (visible - 1);
        colors.push(lerpColor(COLOR_WARM, COLOR_COOL, t));
    }

    if (lastSig < NUM_BINS - 1) {
        let sum = 0;
        for (let i = lastSig + 1; i < NUM_BINS; i++) sum += rawBins[i];
        if (sum > 0) {
            const boundary = boundaryAt(lastSig + 1);
            labels.push(`> ${Number(boundary).toPrecision(2)}`);
            bins.push(sum);
            descriptions.push(`Larger than ${Number(boundary).toPrecision(2)} mm²`);
            colors.push(OVERFLOW_COLOR);
        }
    }

    return { labels, bins, descriptions, colors };
}

function renderStats(areas) {
    const sorted = Array.from(areas).sort((a, b) => a - b);
    const positive = sorted.filter((a) => a > 0);

    const count = sorted.length;
    const minArea = positive.length ? positive[0] : NaN;
    const maxArea = positive.length ? positive[positive.length - 1] : NaN;
    const meanArea = positive.length ? positive.reduce((s, v) => s + v, 0) / positive.length : NaN;
    const medianArea = median(positive);

    document.getElementById('stat-count').textContent = count.toLocaleString();
    document.getElementById('stat-min').textContent = formatArea(minArea);
    document.getElementById('stat-median').textContent = formatArea(medianArea);
    document.getElementById('stat-mean').textContent = formatArea(meanArea);
    document.getElementById('stat-max').textContent = formatArea(maxArea);

    const summaryEl = document.getElementById('stat-summary');
    if (summaryEl) summaryEl.textContent = describeAreas(positive);

    const { labels, bins, descriptions, colors } = buildHistogram(positive);
    chart.data.labels = labels;
    chart.data.datasets[0].data = bins;
    chart.data.datasets[0].backgroundColor = colors;
    chartDescriptions = descriptions;
    chart.update();
}

function frameMesh(mesh) {
    const box = new THREE.Box3().setFromObject(mesh);
    const center = box.getCenter(new THREE.Vector3());
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const radius = sphere.radius || 1;

    const fov = (camera.fov * Math.PI) / 180;
    const verticalDist = radius / Math.sin(fov / 2);
    const horizontalFov = 2 * Math.atan(camera.aspect * Math.tan(fov / 2));
    const horizontalDist = radius / Math.sin(horizontalFov / 2);
    const distance = Math.max(verticalDist, horizontalDist) * 1.1;

    const direction = new THREE.Vector3(1, 1, 3).normalize();
    camera.position.copy(center).addScaledVector(direction, distance);
    controls.target.copy(center);
    controls.update();
}

const loader = new STLLoader();
loader.load('low_poly_scan.stl', function (geometry) {
    geometry.rotateX(-Math.PI / 2);

    const material = createMeshMaterial();

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'userMesh';

    const bbox = new THREE.Box3().setFromObject(mesh);
    const center = bbox.getCenter(new THREE.Vector3());
    geometry.translate(-center.x, -center.y, -center.z);

    scene.add(mesh);
    frameMesh(mesh);

    controls.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.PAN,
        RIGHT: THREE.MOUSE.ROTATE
    };

    renderStats(computeTriangleAreas(geometry));

    document.getElementById('heatmapButton').click();
}, undefined, function (error) {
    console.error('An error happened', error);
});

const controls = new OrbitControls(camera, renderer.domElement);

let transformControls;

window.addEventListener('resize', function () {
    const width = canvasContainer.clientWidth;
    const height = canvasContainer.clientHeight;
    if (width === 0 || height === 0) return;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
});

function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}

animate();

document.getElementById('uploadButton').addEventListener('click', function () {
    document.getElementById('fileInput').click();
});

document.getElementById('fileInput').addEventListener('change', function () {
    heatmapApplied = false;
    const file = this.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.addEventListener('load', function (event) {
        const stl = new STLLoader();
        const geometry = stl.parse(event.target.result);
        geometry.rotateX(-Math.PI / 2);

        if (checkNegativeCoordinates(geometry)) {
            translateToPositiveCoordinates(geometry);
        }

        const material = createMeshMaterial();

        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = 'userMesh';

        const previousUserMesh = scene.getObjectByName('userMesh');
        const previousMirrorMesh = scene.getObjectByName('mirrorMesh');

        if (transformControls && transformControls.object) {
            transformControls.detach(transformControls.object);
        }
        if (previousUserMesh) scene.remove(previousUserMesh);
        if (previousMirrorMesh) scene.remove(previousMirrorMesh);

        scene.add(mesh);
        frameMesh(mesh);

        renderStats(computeTriangleAreas(geometry));

        document.getElementById('heatmapButton').click();
    });
    reader.readAsArrayBuffer(file);
});

function checkNegativeCoordinates(geometry) {
    const positions = geometry.attributes.position.array;
    for (let i = 0; i < positions.length; i++) {
        if (positions[i] < 0) return true;
    }
    return false;
}

function translateToPositiveCoordinates(geometry) {
    const positions = geometry.attributes.position.array;
    const min = new THREE.Vector3();
    min.fromArray(positions);
    const translationVector = new THREE.Vector3().copy(min).negate();
    for (let i = 0; i < positions.length; i += 3) {
        const vertex = new THREE.Vector3().fromArray(positions, i);
        vertex.add(translationVector);
        vertex.toArray(positions, i);
    }
}

document.getElementById('heatmapButton').addEventListener('click', function () {
    const userMesh = scene.getObjectByName('userMesh');
    if (!userMesh) return;
    const geometry = userMesh.geometry;

    if (heatmapApplied) {
        userMesh.material.vertexColors = false;
        userMesh.material.color.copy(meshColor);
        userMesh.material.needsUpdate = true;
        heatmapApplied = false;
        return;
    }

    const rawAreas = computeTriangleAreas(geometry);
    const logAreas = new Float64Array(rawAreas.length);
    for (let i = 0; i < rawAreas.length; i++) {
        logAreas[i] = Math.log(Math.max(rawAreas[i], Number.EPSILON) + 1);
    }

    let mean = 0;
    for (const v of logAreas) mean += v;
    mean /= logAreas.length;

    let variance = 0;
    for (const v of logAreas) variance += (v - mean) * (v - mean);
    const stdDev = Math.sqrt(variance / logAreas.length) || 1;

    let zMin = Infinity;
    let zMax = -Infinity;
    const zScores = new Float64Array(logAreas.length);
    for (let i = 0; i < logAreas.length; i++) {
        const z = (logAreas[i] - mean) / stdDev;
        zScores[i] = z;
        if (z < zMin) zMin = z;
        if (z > zMax) zMax = z;
    }
    const zRange = zMax - zMin || 1;

    const positionAttribute = geometry.attributes.position;
    const colors = new Float32Array(positionAttribute.count * 3);
    for (let i = 0; i < zScores.length; i++) {
        const t = (zScores[i] - zMin) / zRange;
        const color = getColorFromGradient(t);
        const base = i * 9;
        for (let v = 0; v < 3; v++) {
            colors[base + v * 3] = color.r;
            colors[base + v * 3 + 1] = color.g;
            colors[base + v * 3 + 2] = color.b;
        }
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    userMesh.material.vertexColors = true;
    userMesh.material.needsUpdate = true;
    userMesh.material.side = THREE.DoubleSide;
    heatmapApplied = true;
});

function getColorFromGradient(value) {
    const gradient = [
        { value: 0.0, color: 0xfb923c },
        { value: 1.0, color: 0x38bdf8 }
    ];

    if (value <= gradient[0].value) {
        return new THREE.Color(gradient[0].color);
    }
    if (value >= gradient[gradient.length - 1].value) {
        return new THREE.Color(gradient[gradient.length - 1].color);
    }
    for (let i = 1; i < gradient.length; i++) {
        if (value <= gradient[i].value) {
            const prevColor = new THREE.Color(gradient[i - 1].color);
            const currColor = new THREE.Color(gradient[i].color);
            const t = (value - gradient[i - 1].value) / (gradient[i].value - gradient[i - 1].value);
            return prevColor.lerp(currColor, t);
        }
    }
}
