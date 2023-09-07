import * as THREE from 'three';
import Chart from 'chart.js/auto'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd3d3d3);
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.01, 100000);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById("canvas-container").appendChild(renderer.domElement);
let heatmapApplied = false;

const lightBlue = new THREE.Color(0xadd8e6); // Light blue

const material = new THREE.MeshStandardMaterial({ color: lightBlue });
material.receiveShadow = true;
material.castShadow = true;

const ambientLight = new THREE.AmbientLight(0x909090); // Soft white light
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
directionalLight.position.set(1, 1, 1);
scene.add(directionalLight);

const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.2);
directionalLight2.position.set(15, 15, 15);
scene.add(directionalLight2);

const directionalLight3 = new THREE.DirectionalLight(0xffffff, 0.2);
directionalLight3.position.set(-10, -10, -10);
scene.add(directionalLight3);

renderer.shadowMap.enabled = true;


// Creating chart
let chart = new Chart('chart-canvas', {
    type: 'bar',
    data: {
        labels: [],  // initially empty
        datasets: [{
            label: 'Number of triangles',
            data: [],  // initially empty
            backgroundColor: 'rgba(75, 192, 192, 0.2)',
            borderColor: 'rgba(75, 192, 192, 1)',
            borderWidth: 1
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,

    }
});

const loader = new STLLoader();
loader.load('low_poly_scan.stl', function (geometry) {
    geometry.rotateX(-Math.PI / 2);
    const material = new THREE.MeshStandardMaterial({ color: lightBlue });
    material.receiveShadow = true;
    material.castShadow = true;
    material.side = THREE.DoubleSide;

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'userMesh';

    const bbox = new THREE.Box3().setFromObject(mesh);
    const center = bbox.getCenter(new THREE.Vector3());
    geometry.translate(-center.x, -center.y, -center.z);
    geometry.translate(0, 50, 0);

    scene.add(mesh);
    const box = new THREE.Box3().setFromObject(mesh);
    const size = box.getSize(new THREE.Vector3());
    const distance = Math.max(size.x, size.y, size.z);
    // camera.position.set(center.x, center.y + (distance * 3), center.z + (distance * 2));
    camera.position.set(center.x + (distance * 1), center.y + (distance * 1), center.z + (distance * 3));
    controls.target.set(center.x, center.y, center.z);
    controls.update();

    controls.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.PAN,
        RIGHT: THREE.MOUSE.ROTATE
    }

    // Calculate areas of all triangles.
    let areas = [];
    for (let i = 0; i < geometry.attributes.position.count; i += 3) {
        let vA = new THREE.Vector3().fromBufferAttribute(geometry.attributes.position, i);
        let vB = new THREE.Vector3().fromBufferAttribute(geometry.attributes.position, i + 1);
        let vC = new THREE.Vector3().fromBufferAttribute(geometry.attributes.position, i + 2);

        let area = vA.clone().sub(vB).cross(vC.clone().sub(vB)).length() / 2;
        areas.push(area);
    }

    // Sort the areas in ascending order
    areas.sort((a, b) => a - b);

    // Calculating min and max for the areas
    let minArea = Math.min(...areas);
    let maxArea = Math.max(...areas);

    // Creating logarithmic scale for the X-axis
    const logMinArea = Math.log10(minArea);
    const logMaxArea = Math.log10(maxArea);
    const numBins = 50;
    const logBinSize = (logMaxArea - logMinArea) / numBins;
    const bins = new Array(numBins).fill(0);

    // Count the number of triangles per bin
    for (let area of areas) {
        let logArea = Math.log10(area);
        let binIndex = Math.floor((logArea - logMinArea) / logBinSize);
        bins[binIndex]++;
    }

    // Creating labels for bins
    let labels = new Array(numBins).fill(0).map((_, i) => {
        let start = Math.pow(10, logMinArea + i * logBinSize).toFixed(4);
        let end = Math.pow(10, logMinArea + (i + 1) * logBinSize).toFixed(4);
        return `${start} - ${end} mm²`;
    });

    // Updating chart with bin counts
    chart.data.labels = labels;
    chart.data.datasets[0].data = bins;
    chart.update();
}, undefined, function (error) {
    console.error('An error happened', error);
});


const controls = new OrbitControls(camera, renderer.domElement);

// Initialize TransformControls
let transformControls;

window.addEventListener('resize', function () {
    const width = window.innerWidth;
    const height = window.innerHeight;
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
    let file = this.files[0];
    const reader = new FileReader();
    reader.addEventListener('load', function (event) {
        const loader = new STLLoader();
        const geometry = loader.parse(event.target.result);
        geometry.rotateX(-Math.PI / 2);

        // Check if the model has negative coordinates
        const hasNegativeCoordinates = checkNegativeCoordinates(geometry);

        // Translate the model to positive coordinates if necessary
        if (hasNegativeCoordinates) {
            translateToPositiveCoordinates(geometry);
        }

        const material = new THREE.MeshStandardMaterial({ color: lightBlue });
        material.side = THREE.DoubleSide;

        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = 'userMesh';

        // Remove previous models from the scene
        const previousUserMesh = scene.getObjectByName('userMesh');
        const previousMirrorMesh = scene.getObjectByName('mirrorMesh');

        if (transformControls && transformControls.object) {
            transformControls.detach(transformControls.object);
        }

        if (previousUserMesh) {
            scene.remove(previousUserMesh);
        }
        if (previousMirrorMesh) {
            scene.remove(previousMirrorMesh);
        }

        scene.add(mesh);

        const box = new THREE.Box3().setFromObject(mesh);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const distance = Math.max(size.x, size.y, size.z);

        camera.position.set(center.x, center.y + (distance * 3), center.z + (distance * 2));
        controls.target.set(center.x, center.y, center.z);
        controls.update();

        // Access the position attribute data
        const positions = geometry.attributes.position.array;
        const positionCount = geometry.attributes.position.count;

        // Calculate areas of all triangles.
        let areas = [];
        for (let i = 0; i < positionCount; i += 9) {
            const vA = new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]);
            const vB = new THREE.Vector3(positions[i + 3], positions[i + 4], positions[i + 5]);
            const vC = new THREE.Vector3(positions[i + 6], positions[i + 7], positions[i + 8]);

            const area = vA.clone().sub(vB).cross(vC.clone().sub(vB)).length() / 2;
            areas.push(area);
        }

        // Sort the areas in ascending order
        areas.sort((a, b) => a - b);

        // Calculating min and max for the areas
        let minArea = areas[0];
        let maxArea = areas[areas.length - 1];

        // Creating logarithmic scale for the X-axis
        const logMinArea = Math.log10(minArea);
        const logMaxArea = Math.log10(maxArea);
        const numBins = 50;
        const logBinSize = (logMaxArea - logMinArea) / (numBins - 1); // Adjusted calculation

        const bins = new Array(numBins).fill(0);

        // Count the number of triangles per bin
        for (let area of areas) {
            let logArea = Math.log10(area);
            let binIndex = Math.floor((logArea - logMinArea) / logBinSize);

            // Check if the bin index exceeds the maximum index
            if (binIndex >= numBins) {
                binIndex = numBins - 1;
            }

            bins[binIndex]++;
        }

        // Creating labels for bins
        let labels = new Array(numBins).fill(0).map((_, i) => {
            let start = Math.pow(10, logMinArea + i * logBinSize).toFixed(4);
            let end = Math.pow(10, logMinArea + (i + 1) * logBinSize).toFixed(4);
            return `${start} - ${end} mm²`;
        });

        // Clear previous data from chart
        chart.data.labels = [];
        chart.data.datasets[0].data = [];

        // Updating chart with new data
        chart.data.labels = labels;
        chart.data.datasets[0].data = bins;
        chart.update();
    });
    reader.readAsArrayBuffer(file);
});

function checkNegativeCoordinates(geometry) {
    const positions = geometry.attributes.position.array;
    for (let i = 0; i < positions.length; i++) {
        if (positions[i] < 0) {
            return true;
        }
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
    let userMesh = scene.getObjectByName('userMesh');
    if (userMesh) {
        let geometry = userMesh.geometry;

        // Remove the heatmap if it was previously applied
        if (heatmapApplied) {
            userMesh.material.vertexColors = THREE.NoColors;
            userMesh.material.needsUpdate = true;
            heatmapApplied = false;
            return;
        }

        // Calculate areas of all triangles.
        let positionAttribute = geometry.attributes.position;
        let areas = [];
        for (let i = 0; i < positionAttribute.count; i += 3) {
            let vA = new THREE.Vector3().fromBufferAttribute(positionAttribute, i);
            let vB = new THREE.Vector3().fromBufferAttribute(positionAttribute, i + 1);
            let vC = new THREE.Vector3().fromBufferAttribute(positionAttribute, i + 2);

            let area = vA.clone().sub(vB).cross(vC.clone().sub(vB)).length() / 2;
            areas.push(area);
        }

        // Transform areas into a logarithmic scale.
        areas = areas.map(area => Math.log(area + 1));

        // Calculate the mean and standard deviation of areas.
        let meanArea = areas.reduce((a, b) => a + b, 0) / areas.length;
        let stdDevArea = Math.sqrt(areas.map(area => Math.pow(area - meanArea, 2)).reduce((a, b) => a + b, 0) / areas.length);

        // Normalize areas using standard score normalization (i.e., convert to Z-scores).
        let normalizedAreas = areas.map(area => (area - meanArea) / stdDevArea);

        // Rescale normalized areas to the range [0,1].
        let maxNormalizedArea = Number.NEGATIVE_INFINITY;
        let minNormalizedArea = Number.POSITIVE_INFINITY;
        for (let i = 0; i < normalizedAreas.length; i++) {
            if (normalizedAreas[i] > maxNormalizedArea) {
                maxNormalizedArea = normalizedAreas[i];
            }
            if (normalizedAreas[i] < minNormalizedArea) {
                minNormalizedArea = normalizedAreas[i];
            }
        }
        normalizedAreas = normalizedAreas.map(area => (area - minNormalizedArea) / (maxNormalizedArea - minNormalizedArea));

        // Create a new BufferAttribute for vertex colors and add it to the geometry.
        let colors = new Float32Array(positionAttribute.count * 3);
        for (let i = 0; i < normalizedAreas.length; i++) {
            const color = getColorFromGradient(normalizedAreas[i]);
            colors[i * 9] = color.r;
            colors[i * 9 + 1] = color.g;
            colors[i * 9 + 2] = color.b;
            colors[i * 9 + 3] = color.r;
            colors[i * 9 + 4] = color.g;
            colors[i * 9 + 5] = color.b;
            colors[i * 9 + 6] = color.r;
            colors[i * 9 + 7] = color.g;
            colors[i * 9 + 8] = color.b;
        }

        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        // Ensure that the material uses vertex colors and update the mesh.
        userMesh.material.vertexColors = true;
        userMesh.material.needsUpdate = true;
        userMesh.material.side = THREE.DoubleSide;

        // Mark the heatmap as applied
        heatmapApplied = true;
    }
});

function getColorFromGradient(value) {
    const gradient = [
        { value: 0.0, color: 0x0000ff },
        { value: 1.0, color: 0x00ff00 }
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

