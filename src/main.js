import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import './style.css';

// ============================================================
// GEOCOMPACT
// ROAD COMPACTION SIMULATOR 3D
// Simulador didáctico de compactación vial
// ============================================================

// ------------------------------------------------------------
// ESCENA
// ------------------------------------------------------------

const scene = new THREE.Scene();

scene.background = new THREE.Color(0x9bd7f5);

scene.fog = new THREE.Fog(0x9bd7f5, 70, 180);

// ------------------------------------------------------------
// CÁMARA
// ------------------------------------------------------------

const camera = new THREE.PerspectiveCamera(
    55,
    window.innerWidth / window.innerHeight,
    0.1,
    500
);

camera.position.set(24, 18, 28);

// ------------------------------------------------------------
// RENDERER
// ------------------------------------------------------------

const renderer = new THREE.WebGLRenderer({
    antialias: true
});

renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

renderer.setSize(window.innerWidth, window.innerHeight);

renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

document.body.appendChild(renderer.domElement);

// ------------------------------------------------------------
// CONTROLES
// ------------------------------------------------------------

const controls = new OrbitControls(camera, renderer.domElement);

controls.enableDamping = true;
controls.dampingFactor = 0.06;

controls.minDistance = 12;
controls.maxDistance = 80;

controls.maxPolarAngle = Math.PI * 0.48;

// ------------------------------------------------------------
// ILUMINACIÓN
// ------------------------------------------------------------

const hemiLight = new THREE.HemisphereLight(
    0xffffff,
    0x667755,
    2.2
);

scene.add(hemiLight);

const sun = new THREE.DirectionalLight(
    0xffffff,
    3
);

sun.position.set(30, 40, 20);

sun.castShadow = true;

sun.shadow.mapSize.width = 2048;
sun.shadow.mapSize.height = 2048;

sun.shadow.camera.left = -60;
sun.shadow.camera.right = 60;
sun.shadow.camera.top = 60;
sun.shadow.camera.bottom = -60;

scene.add(sun);

// ------------------------------------------------------------
// VARIABLES
// ------------------------------------------------------------

let roller;
let rollerWheels = [];

let roadSurface;
let roadBase;
let roadSubbase;

let isRunning = false;
let animationProgress = 0;

let deformationAmount = 0;

let currentGrade = 93.18;
let minimumGrade = 95;
let passes = 8;
let layerThickness = 14;

let simulationFinished = false;

// ------------------------------------------------------------
// TEXTURAS PROCEDURALES
// ------------------------------------------------------------

function createGroundTexture() {

    const canvas = document.createElement('canvas');

    canvas.width = 512;
    canvas.height = 512;

    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#6f9d57';
    ctx.fillRect(0, 0, 512, 512);

    for (let i = 0; i < 1800; i++) {

        const x = Math.random() * 512;
        const y = Math.random() * 512;

        const size = Math.random() * 4 + 1;

        ctx.fillStyle =
            Math.random() > 0.5
                ? '#587f48'
                : '#83aa66';

        ctx.fillRect(x, y, size, size);
    }

    const texture = new THREE.CanvasTexture(canvas);

    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;

    texture.repeat.set(10, 10);

    return texture;
}

function createSoilTexture() {

    const canvas = document.createElement('canvas');

    canvas.width = 512;
    canvas.height = 512;

    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#a86d3c';
    ctx.fillRect(0, 0, 512, 512);

    for (let i = 0; i < 2500; i++) {

        const x = Math.random() * 512;
        const y = Math.random() * 512;

        const r = Math.random() * 3 + 1;

        ctx.beginPath();

        ctx.arc(x, y, r, 0, Math.PI * 2);

        ctx.fillStyle =
            Math.random() > 0.5
                ? '#774623'
                : '#c58a50';

        ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);

    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;

    texture.repeat.set(7, 4);

    return texture;
}

const groundTexture = createGroundTexture();
const soilTexture = createSoilTexture();

// ------------------------------------------------------------
// TERRENO
// ------------------------------------------------------------

const groundGeometry = new THREE.PlaneGeometry(
    180,
    180
);

const groundMaterial = new THREE.MeshStandardMaterial({
    map: groundTexture
});

const ground = new THREE.Mesh(
    groundGeometry,
    groundMaterial
);

ground.rotation.x = -Math.PI / 2;

ground.receiveShadow = true;

scene.add(ground);

// ------------------------------------------------------------
// CARRETERA
// ------------------------------------------------------------

function createRoad() {

    const roadWidth = 12;
    const roadLength = 80;

    // Subrasante
    const subbaseGeometry = new THREE.BoxGeometry(
        roadWidth + 2,
        1.2,
        roadLength
    );

    const subbaseMaterial = new THREE.MeshStandardMaterial({
        map: soilTexture
    });

    roadSubbase = new THREE.Mesh(
        subbaseGeometry,
        subbaseMaterial
    );

    roadSubbase.position.y = 0.6;

    roadSubbase.receiveShadow = true;

    scene.add(roadSubbase);


    // Base granular
    const baseGeometry = new THREE.BoxGeometry(
        roadWidth,
        0.8,
        roadLength
    );

    const baseMaterial = new THREE.MeshStandardMaterial({
        color: 0xc29261
    });

    roadBase = new THREE.Mesh(
        baseGeometry,
        baseMaterial
    );

    roadBase.position.y = 1.55;

    roadBase.receiveShadow = true;

    scene.add(roadBase);


    // Capa compactada
    const surfaceGeometry = new THREE.BoxGeometry(
        roadWidth - 0.3,
        0.65,
        roadLength
    );

    const surfaceMaterial = new THREE.MeshStandardMaterial({
        color: 0x9b673e,
        roughness: 0.9
    });

    roadSurface = new THREE.Mesh(
        surfaceGeometry,
        surfaceMaterial
    );

    roadSurface.position.y = 2.25;

    roadSurface.receiveShadow = true;

    scene.add(roadSurface);


    // Bordes
    createRoadEdge(-6.7);
    createRoadEdge(6.7);

    // Línea central
    for (let z = -36; z <= 36; z += 7) {

        const lineGeometry = new THREE.BoxGeometry(
            0.15,
            0.02,
            3
        );

        const lineMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff
        });

        const line = new THREE.Mesh(
            lineGeometry,
            lineMaterial
        );

        line.position.set(
            0,
            2.6,
            z
        );

        scene.add(line);
    }
}

function createRoadEdge(x) {

    const geometry = new THREE.BoxGeometry(
        0.35,
        0.4,
        80
    );

    const material = new THREE.MeshStandardMaterial({
        color: 0xd6b07b
    });

    const edge = new THREE.Mesh(
        geometry,
        material
    );

    edge.position.set(
        x,
        2.45,
        0
    );

    scene.add(edge);
}

createRoad();

// ------------------------------------------------------------
// ÁRBOLES
// ------------------------------------------------------------

function createTree(x, z, scale = 1) {

    const group = new THREE.Group();

    const trunkGeometry = new THREE.CylinderGeometry(
        0.25,
        0.35,
        2,
        8
    );

    const trunkMaterial = new THREE.MeshStandardMaterial({
        color: 0x654321
    });

    const trunk = new THREE.Mesh(
        trunkGeometry,
        trunkMaterial
    );

    trunk.position.y = 1;

    trunk.castShadow = true;

    group.add(trunk);


    const crownGeometry = new THREE.SphereGeometry(
        1.5,
        12,
        12
    );

    const crownMaterial = new THREE.MeshStandardMaterial({
        color: 0x247a35
    });

    const crown = new THREE.Mesh(
        crownGeometry,
        crownMaterial
    );

    crown.position.y = 2.8;

    crown.castShadow = true;

    group.add(crown);

    group.position.set(
        x,
        0,
        z
    );

    group.scale.setScalar(scale);

    scene.add(group);
}

for (let z = -32; z <= 32; z += 8) {

    createTree(-12, z, 0.9);
    createTree(12, z + 2, 1.1);
}

// ------------------------------------------------------------
// NUBES
// ------------------------------------------------------------

function createCloud(x, y, z) {

    const group = new THREE.Group();

    for (let i = 0; i < 6; i++) {

        const geometry = new THREE.SphereGeometry(
            1.5 + Math.random(),
            12,
            12
        );

        const material = new THREE.MeshStandardMaterial({
            color: 0xffffff
        });

        const cloudPart = new THREE.Mesh(
            geometry,
            material
        );

        cloudPart.position.set(
            i * 1.5,
            Math.random(),
            Math.random() * 1.2
        );

        group.add(cloudPart);
    }

    group.position.set(x, y, z);

    scene.add(group);
}

createCloud(-20, 18, -20);
createCloud(20, 20, -30);

// ------------------------------------------------------------
// RODILLO COMPACTADOR
// ------------------------------------------------------------

function createRoller() {

    roller = new THREE.Group();

    // Chasis
    const chassisGeometry = new THREE.BoxGeometry(
        3.5,
        1.5,
        4.2
    );

    const chassisMaterial = new THREE.MeshStandardMaterial({
        color: 0xe6a800,
        roughness: 0.7
    });

    const chassis = new THREE.Mesh(
        chassisGeometry,
        chassisMaterial
    );

    chassis.position.y = 1.8;

    chassis.castShadow = true;

    roller.add(chassis);


    // Cabina
    const cabinGeometry = new THREE.BoxGeometry(
        2.5,
        1.8,
        2.1
    );

    const cabinMaterial = new THREE.MeshStandardMaterial({
        color: 0x263238,
        roughness: 0.35,
        metalness: 0.1
    });

    const cabin = new THREE.Mesh(
        cabinGeometry,
        cabinMaterial
    );

    cabin.position.set(
        0,
        3.1,
        0.5
    );

    cabin.castShadow = true;

    roller.add(cabin);


    // Vidrios
    const glassGeometry = new THREE.BoxGeometry(
        2.1,
        1.2,
        0.08
    );

    const glassMaterial = new THREE.MeshStandardMaterial({
        color: 0x9dd8e8,
        transparent: true,
        opacity: 0.65
    });

    const frontGlass = new THREE.Mesh(
        glassGeometry,
        glassMaterial
    );

    frontGlass.position.set(
        0,
        3.1,
        -0.58
    );

    roller.add(frontGlass);


    // Tambor compactador
    const drumGeometry = new THREE.CylinderGeometry(
        1.15,
        1.15,
        3.2,
        32
    );

    const drumMaterial = new THREE.MeshStandardMaterial({
        color: 0x454545,
        metalness: 0.75,
        roughness: 0.35
    });

    const drum = new THREE.Mesh(
        drumGeometry,
        drumMaterial
    );

    drum.rotation.z = Math.PI / 2;

    drum.position.set(
        0,
        0.95,
        -2
    );

    drum.castShadow = true;

    roller.add(drum);

    rollerWheels.push(drum);


    // Rueda trasera
    const rearWheelGeometry = new THREE.CylinderGeometry(
        0.85,
        0.85,
        2.4,
        24
    );

    const rearWheel = new THREE.Mesh(
        rearWheelGeometry,
        drumMaterial
    );

    rearWheel.rotation.z = Math.PI / 2;

    rearWheel.position.set(
        0,
        0.85,
        1.5
    );

    rearWheel.castShadow = true;

    roller.add(rearWheel);

    rollerWheels.push(rearWheel);


    // Escape
    const exhaustGeometry = new THREE.CylinderGeometry(
        0.15,
        0.15,
        1.3,
        10
    );

    const exhaustMaterial = new THREE.MeshStandardMaterial({
        color: 0x252525
    });

    const exhaust = new THREE.Mesh(
        exhaustGeometry,
        exhaustMaterial
    );

    exhaust.position.set(
        1.1,
        3,
        1.1
    );

    roller.add(exhaust);


    roller.position.set(
        0,
        2.7,
        -30
    );

    scene.add(roller);
}

createRoller();

// ------------------------------------------------------------
// PANEL DE CONTROL
// ------------------------------------------------------------

const panel = document.createElement('div');

panel.id = 'control-panel';

panel.innerHTML = `

<div class="brand">
    <strong>GeoCompact</strong>
    <span>Road Compaction Simulator 3D</span>
</div>

<div class="field">
    <label>Grado de compactación obtenido (%)</label>
    <input id="gradeInput" type="number" value="93.18" step="0.01">
</div>

<div class="field">
    <label>Compactación mínima exigida (%)</label>
    <input id="minimumInput" type="number" value="95" step="0.1">
</div>

<div class="field">
    <label>Número de pasadas</label>
    <input id="passesInput" type="number" value="8" min="1" max="20">
</div>

<div class="field">
    <label>Espesor de capa (cm)</label>
    <input id="thicknessInput" type="number" value="14" min="5" max="40">
</div>

<button id="startButton">
    ▶ INICIAR SIMULACIÓN
</button>

<button id="resetButton" class="secondary">
    ↻ REINICIAR
</button>

<div id="status-box">
    Esperando análisis...
</div>

`;

document.body.appendChild(panel);

// ------------------------------------------------------------
// RESULTADO
// ------------------------------------------------------------

function updateResult() {

    currentGrade = parseFloat(
        document.getElementById('gradeInput').value
    );

    minimumGrade = parseFloat(
        document.getElementById('minimumInput').value
    );

    passes = parseInt(
        document.getElementById('passesInput').value
    );

    layerThickness = parseFloat(
        document.getElementById('thicknessInput').value
    );

    const statusBox =
        document.getElementById('status-box');

    if (currentGrade >= minimumGrade) {

        statusBox.className = 'good';

        statusBox.innerHTML = `
            <strong>✓ COMPACTACIÓN ADECUADA</strong>
            <p>
            El grado de compactación (${currentGrade.toFixed(2)} %)
            alcanza o supera el mínimo exigido
            (${minimumGrade.toFixed(2)} %).
            </p>

            <p>
            La capa presenta una condición adecuada para la
            simulación didáctica.
            </p>

            <strong>Propuesta ingenieril</strong>

            <p>
            Mantener el procedimiento de compactación,
            verificando humedad, espesor de capa,
            equipo y número de pasadas.
            </p>
        `;

    } else {

        const deficit =
            minimumGrade - currentGrade;

        statusBox.className = 'bad';

        statusBox.innerHTML = `
            <strong>⚠ COMPACTACIÓN INSUFICIENTE</strong>

            <p>
            Resultado: ${currentGrade.toFixed(2)} %
            </p>

            <p>
            Mínimo exigido: ${minimumGrade.toFixed(2)} %
            </p>

            <p>
            Déficit: ${deficit.toFixed(2)} puntos porcentuales.
            </p>

            <strong>Consecuencias posibles</strong>

            <ul>
                <li>Mayor deformación de la capa.</li>
                <li>Asentamientos posteriores.</li>
                <li>Menor capacidad de soporte.</li>
                <li>Formación de ahuellamientos.</li>
                <li>Deterioro prematuro de la superficie.</li>
            </ul>

            <strong>Propuesta ingenieril</strong>

            <p>
            Verificar y ajustar la humedad, revisar el espesor
            de la capa, aumentar o ajustar el número de pasadas
            y seleccionar un equipo de compactación adecuado.
            </p>
        `;
    }
}

updateResult();

// ------------------------------------------------------------
// SIMULACIÓN
// ------------------------------------------------------------

function startSimulation() {

    if (isRunning) return;

    updateResult();

    isRunning = true;
    simulationFinished = false;

    animationProgress = 0;

    roller.position.z = -30;

    deformationAmount =
        currentGrade < minimumGrade
            ? Math.min(
                0.7,
                (minimumGrade - currentGrade) * 0.06
              )
            : 0;

    document.getElementById(
        'startButton'
    ).disabled = true;
}

function resetSimulation() {

    isRunning = false;

    simulationFinished = false;

    animationProgress = 0;

    roller.position.set(
        0,
        2.7,
        -30
    );

    roadSurface.position.y = 2.25;

    roadSurface.scale.y = 1;

    roller.rotation.y = 0;

    document.getElementById(
        'startButton'
    ).disabled = false;

    updateResult();
}

// ------------------------------------------------------------
// EVENTOS
// ------------------------------------------------------------

document.getElementById(
    'startButton'
).addEventListener(
    'click',
    startSimulation
);

document.getElementById(
    'resetButton'
).addEventListener(
    'click',
    resetSimulation
);

// ------------------------------------------------------------
// ANIMACIÓN
// ------------------------------------------------------------

function animateRoller() {

    if (!isRunning) return;

    animationProgress +=
        0.0025 * Math.max(1, passes / 4);

    const totalDistance = 60;

    const z =
        -30 +
        animationProgress * totalDistance;

    roller.position.z = z;

    // Movimiento del tambor
    rollerWheels.forEach(
        wheel => {
            wheel.rotation.x -= 0.08;
        }
    );

    // Pequeña vibración del equipo
    roller.position.y =
        2.7 +
        Math.sin(animationProgress * 100) * 0.025;


    // Deformación visual
    if (deformationAmount > 0) {

        const deformationProgress =
            Math.sin(
                Math.min(animationProgress, 1)
                * Math.PI
            );

        roadSurface.position.y =
            2.25 -
            deformationAmount *
            deformationProgress;

        roadSurface.scale.y =
            1 -
            deformationAmount *
            0.12 *
            deformationProgress;
    }


    if (animationProgress >= 1) {

        isRunning = false;

        simulationFinished = true;

        document.getElementById(
            'startButton'
        ).disabled = false;

        if (currentGrade >= minimumGrade) {

            showSuccess();

        } else {

            showFailure();
        }
    }
}

// ------------------------------------------------------------
// MENSAJE FINAL
// ------------------------------------------------------------

function showSuccess() {

    const statusBox =
        document.getElementById('status-box');

    statusBox.className = 'good';

    statusBox.innerHTML = `
        <div class="big-check">✓</div>

        <strong>COMPACTACIÓN COMPLETADA</strong>

        <p>
        La simulación representa una condición
        que cumple el grado mínimo establecido.
        </p>

        <p>
        <strong>${passes}</strong> pasadas
        representadas sobre una capa de
        <strong>${layerThickness} cm</strong>.
        </p>

        <p>
        La capa permanece estable en la
        representación didáctica.
        </p>

        <strong>✓ Resultado favorable</strong>
    `;
}

function showFailure() {

    const statusBox =
        document.getElementById('status-box');

    statusBox.className = 'bad';

    statusBox.innerHTML += `

        <hr>

        <strong>SIMULACIÓN FINALIZADA</strong>

        <p>
        La deformación visual representa de forma
        didáctica el comportamiento esperado de una
        capa con compactación insuficiente.
        </p>

        <strong>Recomendación:</strong>

        <p>
        Reacondicionar la capa y controlar nuevamente
        humedad, espesor, equipo y número de pasadas
        antes de aceptar el tramo.
        </p>
    `;
}

// ------------------------------------------------------------
// ANIMACIÓN PRINCIPAL
// ------------------------------------------------------------

function animate() {

    requestAnimationFrame(animate);

    controls.update();

    animateRoller();

    renderer.render(
        scene,
        camera
    );
}

animate();

// ------------------------------------------------------------
// RESPONSIVE
// ------------------------------------------------------------

window.addEventListener(
    'resize',
    () => {

        camera.aspect =
            window.innerWidth /
            window.innerHeight;

        camera.updateProjectionMatrix();

        renderer.setSize(
            window.innerWidth,
            window.innerHeight
        );
    }
);