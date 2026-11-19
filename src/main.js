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

// GUARDAR GEOMETRÍA ORIGINAL DE LA CARRETERA
let originalSurfacePositions = null;

// ============================================================
// ESCENA
// ============================================================
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

let completedPasses = 0;
let travelDirection = 1;

const ROLLER_START_Z = -30;
const ROLLER_END_Z = 30;

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
// CAPA COMPACTADA CON MAYOR NIVEL DE DETALLE
const surfaceGeometry = new THREE.BoxGeometry(
    roadWidth - 0.3,
    0.65,
    roadLength,
    8,
    1,
    80
);
// GUARDAR POSICIONES ORIGINALES DE LOS VÉRTICES
originalSurfacePositions =
    surfaceGeometry.attributes.position.array.slice();

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
    <input id="gradeInput" type="text" inputmode="decimal" value="93.18"></div>

<div class="field">
    <label>Compactación mínima exigida (%)</label>
    <input id="minimumInput" type="text" inputmode="decimal" value="95"></div>

<div class="field">
    <label>Número de pasadas</label>
    <input id="passesInput" type="number" value="8" min="1" max="20">
</div>

<div class="field">
    <label>Espesor de capa (cm)</label>
    <input id="thicknessInput" type="text" inputmode="decimal" value="14"></div>

<button id="startButton">
    ▶ INICIAR SIMULACIÓN
</button>

<button id="resetButton" class="secondary">
    ↻ REINICIAR
</button>

<div id="progress-box">
Pasadas completadas: 0 / 8
</div>
</div>

<div id="status-box">
    Esperando análisis...
</div>

`;

document.body.appendChild(panel);

// SACAR EL CONTADOR FUERA DEL PANEL
const progressBox = document.getElementById('progress-box');

if (progressBox) {
    document.body.appendChild(progressBox);

    progressBox.style.position = 'fixed';
    progressBox.style.top = '20px';
    progressBox.style.right = '20px';
    progressBox.style.zIndex = '2000';
    progressBox.style.width = '220px';
    progressBox.style.boxShadow = '0 4px 15px rgba(0,0,0,0.25)';
}

/* ==========================================
   CONEXIÓN CON GEOCOMPACT
========================================== */

const parametrosGeo = new URLSearchParams(window.location.search);

function leerParametroGeo(nombre, valorPredeterminado) {
    const valor = parametrosGeo.get(nombre);

    if (valor === null || valor.trim() === '') {
        return valorPredeterminado;
    }

    const numero = Number(valor);

    return Number.isFinite(numero)
        ? numero
        : valorPredeterminado;
}

// DATOS DEL CASO 5
const datosCaso5URL = {
    proyecto: parametrosGeo.get('proyecto') || 'Mejoramiento vial - Puente Piedra',

    rhoHumeda: leerParametroGeo('rhoHumeda', 2.086),
    humedad: leerParametroGeo('humedad', 9.2),
    rhoSeca: leerParametroGeo('rhoSeca', 1.9103),

    rhoStd: leerParametroGeo('rhoStd', 1.82),
    wStd: leerParametroGeo('wStd', 12.5),

    rhoMod: leerParametroGeo('rhoMod', 2.05),
    wMod: leerParametroGeo('wMod', 8.5),

    gcEstandar: leerParametroGeo('gcEstandar', 104.96),
    gcModificado: leerParametroGeo('gcModificado', 93.18),

    exigencia: leerParametroGeo('exigencia', 95),

    pasadas: leerParametroGeo(
        'pasadas',
        Number(document.getElementById('passesInput')?.value || 8)
    ),

    espesorCm: leerParametroGeo(
        'espesorCm',
        Number(document.getElementById('thicknessInput')?.value || 14)
    ),

    referencia: parametrosGeo.get('referencia') || 'Proctor modificado'
};

// IDENTIFICAR REFERENCIA SELECCIONADA
const referenciaEstandar =
    datosCaso5URL.referencia.toLowerCase().includes('estándar') ||
    datosCaso5URL.referencia.toLowerCase().includes('estandar');

const gradoSeleccionado = referenciaEstandar
    ? datosCaso5URL.gcEstandar
    : datosCaso5URL.gcModificado;

datosCaso5URL.cumpleSeleccion =
    gradoSeleccionado >= datosCaso5URL.exigencia;

// CARGAR DATOS EN LOS CAMPOS
const gradeInputURL = document.getElementById('gradeInput');
const minimumInputURL = document.getElementById('minimumInput');
const passesInputURL = document.getElementById('passesInput');
const thicknessInputURL = document.getElementById('thicknessInput');

if (gradeInputURL) {
    gradeInputURL.value = gradoSeleccionado.toFixed(2);
}

if (minimumInputURL) {
    minimumInputURL.value = datosCaso5URL.exigencia;
}

if (passesInputURL) {
    passesInputURL.value = datosCaso5URL.pasadas;
}

if (thicknessInputURL) {
    thicknessInputURL.value = datosCaso5URL.espesorCm;
}

console.log('Datos recibidos de COMPACTA LAB 360:', datosCaso5URL);

// ------------------------------------------------------------
// RESULTADO
// ------------------------------------------------------------

function updateResult() {

    
// DATOS GEOTÉCNICOS DE COMPACTA LAB 360

const densidadSecaCampo = Number(datosCaso5URL.rhoSeca);

const densidadSecaMaxima = Number(
    referenciaEstandar
        ? datosCaso5URL.rhoStd
        : datosCaso5URL.rhoMod
);

const humedadCampo = Number(datosCaso5URL.humedad);

const humedadOptima = Number(
    referenciaEstandar
        ? datosCaso5URL.wStd
        : datosCaso5URL.wMod
);

// CALCULAR GRADO DE COMPACTACIÓN

const gradoCalculado =
    (densidadSecaCampo / densidadSecaMaxima) * 100;

currentGrade = Number.isFinite(gradoCalculado)
    ? gradoCalculado
    : parseFloat(document.getElementById('gradeInput').value);

// ACTUALIZAR CAMPO DE GRADO

document.getElementById('gradeInput').value =
    currentGrade.toFixed(2);

// LEER EXIGENCIA Y CONDICIONES DE OBRA

minimumGrade = parseFloat(
    document.getElementById('minimumInput').value
);

passes = parseInt(
    document.getElementById('passesInput').value
);

layerThickness = parseFloat(
    document.getElementById('thicknessInput').value
);

// DIFERENCIA DE HUMEDAD RESPECTO AL ÓPTIMO

const desviacionHumedad = Math.abs(
    humedadCampo - humedadOptima
);

// DÉFICIT DE COMPACTACIÓN

const deficit = Math.max(
    0,
    minimumGrade - currentGrade
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

            <p>
<strong>Evaluación geotécnica:</strong>
</p>

<ul>
    <li>Densidad seca de campo:
    ${densidadSecaCampo.toFixed(3)} g/cm³</li>

    <li>Densidad seca máxima Proctor:
    ${densidadSecaMaxima.toFixed(3)} g/cm³</li>

    <li>Humedad de campo:
    ${humedadCampo.toFixed(2)} %</li>

    <li>Humedad óptima:
    ${humedadOptima.toFixed(2)} %</li>

    <li>Diferencia de humedad:
    ${desviacionHumedad.toFixed(2)} puntos porcentuales</li>
</ul>

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


function limpiarEscenarioAnterior() {

    // ELIMINAR GRIETAS DE LA PRUEBA ANTERIOR
    const previousCracks =
        roadSurface.getObjectByName('failureCracks');

    if (previousCracks) {
        roadSurface.remove(previousCracks);
    }
// RESTAURAR TODOS LOS VÉRTICES DE LA CARRETERA
if (originalSurfacePositions) {

    const geometry = roadSurface.geometry;

    const positions = geometry.attributes.position;

    positions.array.set(originalSurfacePositions);

    positions.needsUpdate = true;

    // RECALCULAR NORMALES Y LÍMITES
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
}
    // RESTAURAR LA CARRETERA
    deformationAmount = 0;
    roadSurface.position.y = 2.25;
    roadSurface.scale.y = 1;

    // DEVOLVER EL RODILLO AL INICIO
    roller.position.set(
        0,
        2.7,
        ROLLER_START_Z
    );

    roller.rotation.y = 0;

    // RESTAURAR RUEDAS
    rollerWheels.forEach(wheel => {
        wheel.rotation.x = 0;
    });

    // REINICIAR CONTADORES
    animationProgress = 0;
    completedPasses = 0;
    travelDirection = 1;

    // OCULTAR RESULTADO ANTERIOR
    const statusBox =
        document.getElementById('status-box');

    if (statusBox) {
        statusBox.style.display = 'none';
        statusBox.innerHTML = 'Esperando análisis...';
        statusBox.className = '';
    }

    // REINICIAR CONTADOR VISUAL
    const progressBox =
        document.getElementById('progress-box');

    if (progressBox) {
        progressBox.textContent =
            `Pasadas completadas: 0 / ${passes}`;
    }
}

function startSimulation() {

    // EVITAR DOBLE EJECUCIÓN
    if (isRunning) return;

    // LIMPIAR LA PRUEBA ANTERIOR
    limpiarEscenarioAnterior();

    // ACTUALIZAR LOS DATOS INGRESADOS
    updateResult();
  
   // OCULTAR PANEL DE DATOS
const controlPanel = document.getElementById('control-panel');

if (controlPanel) {
    controlPanel.style.display = 'none';
}

    // INICIAR SIMULACIÓN
    isRunning = true;
    simulationFinished = false;

    // REINICIAR CONTADORES
    animationProgress = 0;
    completedPasses = 0;
    travelDirection = 1;

    // UBICAR EL RODILLO AL INICIO
    roller.position.set(
        0,
        2.7,
        ROLLER_START_Z
    );

    roller.rotation.y = 0;

    // RESTABLECER LA CAPA
    roadSurface.position.y = 2.25;
    roadSurface.scale.y = 1;

    // CALCULAR LA DEFORMACIÓN VISUAL
    deformationAmount =
        currentGrade < minimumGrade
        ? Math.min(
            0.7,
            (minimumGrade - currentGrade) * 0.06
          )
        : 0;

    // ACTUALIZAR CONTADOR
    const progressBox =
        document.getElementById('progress-box');

    if (progressBox) {
        progressBox.textContent =
            `Pasadas completadas: 0 / ${passes}`;
    }

    // BLOQUEAR BOTÓN DURANTE LA SIMULACIÓN
    document.getElementById(
        'startButton'
    ).disabled = true;
}

function resetSimulation() {

    isRunning = false;
    simulationFinished = false;

    animationProgress = 0;
    completedPasses = 0;
    travelDirection = 1;

    roller.position.set(
        0,
        2.7,
        ROLLER_START_Z
    );

    roller.rotation.y = 0;

    // RESTABLECER SUPERFICIE
    roadSurface.position.y = 2.25;
    roadSurface.scale.y = 1;

    // REINICIAR RUEDAS
    rollerWheels.forEach(wheel => {
        wheel.rotation.x = 0;
    });

    // ACTUALIZAR CONTADOR
    const progressBox =
        document.getElementById('progress-box');

    if (progressBox) {
        progressBox.textContent =
            `Pasadas completadas: 0 / ${passes}`;
    }

    // HABILITAR BOTÓN
    document.getElementById(
        'startButton'
    ).disabled = false;

  
    // OCULTAR RESULTADO ANTERIOR
    const statusBox = document.getElementById('status-box');

    statusBox.style.display = 'none';
    statusBox.innerHTML = 'Esperando análisis...';

// ELIMINAR TODAS LAS GRIETAS DE LA PRUEBA ANTERIOR
const oldCracks = roadSurface.getObjectByName('failureCracks');

if (oldCracks && oldCracks.parent) {
    oldCracks.parent.remove(oldCracks);
}

    // RESTAURAR LA CAPA
    deformationAmount = 0;

    roadSurface.position.y = 2.25;
    roadSurface.scale.y = 1;

    // ACTUALIZAR RESULTADOS
    updateResult();

    // MANTENER OCULTO EL DIAGNÓSTICO
    statusBox.style.display = 'none';

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

    // VELOCIDAD DEL RODILLO
    const speed = 0.35;

    // DISTANCIA DE AVANCE
    const nextZ =
        roller.position.z + speed * travelDirection;

    // COMPROBAR FINAL DEL RECORRIDO
    if (
        travelDirection === 1 &&
        nextZ >= ROLLER_END_Z
    ) {

        roller.position.z = ROLLER_END_Z;

        completedPasses++;

        travelDirection = -1;

    } else if (
        travelDirection === -1 &&
        nextZ <= ROLLER_START_Z
    ) {

        roller.position.z = ROLLER_START_Z;

        completedPasses++;

        travelDirection = 1;

    } else {

        roller.position.z = nextZ;
    }

    // ACTUALIZAR PROGRESO GENERAL
    const distance =
        ROLLER_END_Z - ROLLER_START_Z;

    const currentLegProgress =
        travelDirection === 1
        ? (roller.position.z - ROLLER_START_Z) / distance
        : (ROLLER_END_Z - roller.position.z) / distance;

    animationProgress = Math.min(
        (completedPasses + currentLegProgress) / passes,
        1
    );

    // ACTUALIZAR CONTADOR
    const progressBox =
        document.getElementById('progress-box');

    if (progressBox) {
        progressBox.textContent =
            `Pasadas completadas: ${completedPasses} / ${passes}`;
    }

    // GIRO DEL TAMBOR Y RUEDAS
    rollerWheels.forEach(wheel => {
        wheel.rotation.x -= 0.08 * travelDirection;
    });

    // VIBRACIÓN DEL EQUIPO
    roller.position.y =
        2.7 +
        Math.sin(animationProgress * 100) * 0.025;

// DEFORMACIÓN LOCALIZADA DE LA CAPA VIAL
const geometry = roadSurface.geometry;
const positions = geometry.attributes.position;
const normals = geometry.attributes.normal;

const progress = Math.min(1, animationProgress);

const halfWidth = geometry.parameters.width / 2;
const halfLength = geometry.parameters.depth / 2;

for (let i = 0; i < positions.count; i++) {

    // Trabajar solamente sobre la cara superior
    if (normals.getY(i) > 0.9) {

        const x = originalSurfacePositions[i * 3];
        const originalY = originalSurfacePositions[i * 3 + 1];
        const z = originalSurfacePositions[i * 3 + 2];

        // Ubicación de las huellas de las ruedas
        const wheelTrack = Math.exp(
            -Math.pow(
                (Math.abs(x) - halfWidth * 0.28) /
                (halfWidth * 0.12),
                2
            )
        );

        // Variación longitudinal de la deformación
        const longitudinal =
            0.35 +
            0.65 * Math.pow(
                Math.sin((z + halfLength) * 0.35),
                2
            );

        // Profundidad de deformación
        const depression =
            deformationAmount *
            0.25 *
            progress *
            wheelTrack *
            longitudinal;

        positions.setY(i, originalY - depression);
    }
}

geometry.attributes.position.needsUpdate = true;

    // FINALIZAR SIMULACIÓN
    if (completedPasses >= passes) {

        animationProgress = 1;

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

// MOSTRAR PANEL AL TERMINAR LA SIMULACIÓN
const controlPanel = document.getElementById('control-panel');

if (controlPanel) {
    controlPanel.style.display = '';
}
}
} // Cierra el bloque de finalización de la simulación
// ------------------------------------------------------------
// MENSAJE FINAL
// ------------------------------------------------------------

function showSuccess() {

    const statusBox =
    document.getElementById('status-box');

statusBox.className = 'good';
statusBox.style.display = 'block';

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

    const statusBox = document.getElementById('status-box');

    statusBox.className = 'bad';
    statusBox.style.display = 'block';

    // ==========================================
    // REPRESENTACIÓN VISUAL DE FALLA
    // ==========================================

// ELIMINAR COMPLETAMENTE LAS GRIETAS ANTERIORES
const previousCracks = roadSurface.getObjectByName('failureCracks');

if (previousCracks && previousCracks.parent) {
    previousCracks.parent.remove(previousCracks);
}

    // Crear grupo de grietas sobre la superficie
    const crackGroup = new THREE.Group();
    crackGroup.name = 'failureCracks';

    // Obtener dimensiones de la superficie
    const params = roadSurface.geometry.parameters || {};

    const roadWidth = params.width || 8;
    const roadHeight = params.height || 0.3;
    const roadDepth = params.depth || 60;

    // Material oscuro para representar las grietas
    const crackMaterial = new THREE.LineBasicMaterial({
        color: 0x241914,
        transparent: false
    });

    // Posición sobre la cara superior de la pista
    const surfaceY = roadHeight / 2 + 0.025;

    // Crear grietas principales y ramificaciones
    const cracks = [
        [
            [-0.8, surfaceY, -17],
            [-0.4, surfaceY, -15],
            [-1.0, surfaceY, -13],
            [-0.5, surfaceY, -11],
            [0.2, surfaceY, -9]
        ],
        [
            [1.5, surfaceY, -12],
            [0.8, surfaceY, -10],
            [1.1, surfaceY, -8],
            [0.3, surfaceY, -6]
        ],
        [
            [-1.8, surfaceY, 2],
            [-1.0, surfaceY, 4],
            [-1.5, surfaceY, 6],
            [-0.7, surfaceY, 8],
            [0.1, surfaceY, 10]
        ],
        [
            [0.7, surfaceY, 8],
            [1.6, surfaceY, 10],
            [1.2, surfaceY, 12],
            [2.0, surfaceY, 14]
        ]
    ];

    cracks.forEach(points => {

        const geometry = new THREE.BufferGeometry();

        const vertices = points.map(
            point => new THREE.Vector3(
                point[0] * roadWidth / 8,
                point[1],
                point[2] * roadDepth / 60
            )
        );

        geometry.setFromPoints(vertices);

        const crack = new THREE.Line(
            geometry,
            crackMaterial
        );

        crackGroup.add(crack);
    });

    // Agregar grietas a la pista
    roadSurface.add(crackGroup);

    // ==========================================
    // DIAGNÓSTICO GEOTÉCNICO
    // ==========================================

    statusBox.innerHTML = `
        <hr>

        <h3>⚠ COMPACTACIÓN INSUFICIENTE</h3>

        <p>
            El grado de compactación obtenido es
            <strong>${currentGrade.toFixed(2)} %</strong>,
            inferior al mínimo exigido de
            <strong>${minimumGrade.toFixed(2)} %</strong>.
        </p>

        <h4>Representación del deterioro vial</h4>

        <ul>
            <li>Formación de grietas superficiales.</li>
            <li>Posibles deformaciones y ahuellamientos.</li>
            <li>Asentamientos posteriores de la capa.</li>
            <li>Disminución de la capacidad de soporte.</li>
            <li>Deterioro prematuro de la superficie vial.</li>
        </ul>

        <h4>Propuesta de solución ingenieril</h4>

        <ol>
            <li>Verificar y corregir el contenido de humedad.</li>
            <li>Comprobar el espesor de la capa compactada.</li>
            <li>Revisar el equipo y procedimiento de compactación.</li>
            <li>Determinar mediante tramo de prueba las condiciones adecuadas de compactación.</li>
            <li>Realizar nuevamente el control de densidad de campo.</li>
        </ol>

        <p>
            <strong>Dictamen: NO CUMPLE</strong>
        </p>

        <small>
            Las grietas y deformaciones son representaciones
            didácticas de posibles consecuencias. No constituyen
            una predicción exacta del comportamiento del pavimento.
        </small>
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