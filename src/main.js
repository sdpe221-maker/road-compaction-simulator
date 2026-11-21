import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import './style.css';

/* ==========================================================
   GEOCOMPACT
   ROAD COMPACTION SIMULATOR 3D
   Simulación didáctica de construcción y recuperación vial
========================================================== */

const app = document.getElementById('app') || document.body;

const ROAD = {
  width: 12,
  length: 80,
  startZ: -40,
  endZ: 40
};

const BASE_TOP = 2.10;
const ASPHALT_TOP = 2.43;

let stage = 'base';
let isRunning = false;
let simulationFinished = false;
let completedPasses = 0;
let repairPhaseTime = 0;
let repairTestReady = false;

let direction = 1;       // Dirección del rodillo principal
let repairDirection = 1; // Dirección durante la recompactación

let pavingProgress = 0;

let currentGrade = 93.18;
let minimumGrade = 95;
let passes = 6;

let geoData = {
  proyecto: 'Mejoramiento vial - Caso 5',
  rhoSeca: 1.9103,
  rhoStd: 1.82,
  wStd: 12.5,
  rhoMod: 2.05,
  wMod: 8.5,
  humedad: 9.2,
  exigencia: 95,
  pasadas: 6,
  espesorCm: 20,
  referencia: 'Proctor modificado',
  gradeProvided: null
};

let metrics = {};

let failureGroup = null;
let solutionGroup = null;

let roller;
let asphaltPaver;
let asphaltRoller;

let scarifier;
let waterTruck;
let grader;
let densityTechnician;

let trafficCars = [];
let asphaltChunks = [];
let rotatingParts = [];
let asphaltRollerParts = [];

let roadMarkings;

const clock = new THREE.Timer();

// ==========================================================
// ESCENA THREE.JS
// ==========================================================

const scene = new THREE.Scene();

scene.background = new THREE.Color(0xb9d8e8);
scene.fog = new THREE.Fog(0xb9d8e8, 90, 180);

const camera = new THREE.PerspectiveCamera(
  48,
  window.innerWidth / window.innerHeight,
  0.1,
  400
);

camera.position.set(32, 27, 38);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: 'high-performance'
});

renderer.setSize(window.innerWidth, window.innerHeight);

renderer.setPixelRatio(
  Math.min(window.devicePixelRatio || 1, 2)
);

renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

app.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);

controls.enableDamping = true;
controls.dampingFactor = 0.055;
controls.target.set(0, 2, 0);

controls.minDistance = 12;
controls.maxDistance = 100;
controls.maxPolarAngle = Math.PI * 0.48;

// ==========================================================
// ILUMINACIÓN
// ==========================================================

scene.add(
  new THREE.HemisphereLight(
    0xeaf7ff,
    0x68754f,
    2.1
  )
);

const sunlight = new THREE.DirectionalLight(
  0xfff1d5,
  3
);

sunlight.position.set(-30, 50, 25);

sunlight.castShadow = true;

sunlight.shadow.mapSize.set(2048, 2048);

sunlight.shadow.camera.left = -65;
sunlight.shadow.camera.right = 65;
sunlight.shadow.camera.top = 65;
sunlight.shadow.camera.bottom = -65;

scene.add(sunlight);

// ==========================================================
// MATERIALES
// ==========================================================

function material(color, roughness = 0.85, metalness = 0) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness
  });
}

const soilMaterial = material(0x98704b);
const subbaseMaterial = material(0xb59a76);
const baseMaterial = material(0xc5a77e);

const asphaltMaterial = material(0x34383b, 0.85);
const asphaltFreshMaterial = material(0x55585b, 0.9);

const yellowMaterial = material(0xf0b619, 0.58);
const darkMaterial = material(0x22282d, 0.9);
const steelMaterial = material(0x68747c, 0.4, 0.6);

// ==========================================================
// TEXTURAS PROCEDURALES
// ==========================================================

function createTexture(baseColor, colors, count = 5000) {

  const canvas = document.createElement('canvas');

  canvas.width = 512;
  canvas.height = 512;

  const ctx = canvas.getContext('2d');

  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < count; i++) {

    ctx.fillStyle = colors[
      Math.floor(Math.random() * colors.length)
    ];

    ctx.beginPath();

    ctx.arc(
      Math.random() * 512,
      Math.random() * 512,
      1 + Math.random() * 3,
      0,
      Math.PI * 2
    );

    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);

  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;

  texture.anisotropy =
    renderer.capabilities.getMaxAnisotropy();

  return texture;
}

const soilTexture = createTexture(
  '#98704b',
  ['#795638', '#b58a5e', '#8a6745']
);

const gravelTexture = createTexture(
  '#a98760',
  ['#765b40', '#c4a27a', '#92714e', '#d0b48c']
);

const asphaltTexture = createTexture(
  '#34383b',
  ['#55585a', '#202426', '#777777', '#44484a']
);

const grassTexture = createTexture(
  '#91aa70',
  ['#78965d', '#b1c58a', '#6f8a52']
);

// ==========================================================
// TERRENO
// ==========================================================

const terrain = new THREE.Mesh(
  new THREE.PlaneGeometry(220, 220),
  new THREE.MeshStandardMaterial({
    map: grassTexture,
    roughness: 1
  })
);

terrain.rotation.x = -Math.PI / 2;
terrain.position.y = -0.1;
terrain.receiveShadow = true;

scene.add(terrain);

// ==========================================================
// VEGETACIÓN
// ==========================================================

function addTree(x, z, scale = 1) {

  const group = new THREE.Group();

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(
      0.14 * scale,
      0.22 * scale,
      1.7 * scale,
      9
    ),
    material(0x68462d)
  );

  trunk.position.y = 0.85 * scale;

  group.add(trunk);

  const crown = new THREE.Mesh(
    new THREE.SphereGeometry(
      1 * scale,
      16,
      14
    ),
    material(0x397c43)
  );

  crown.position.y = 2.1 * scale;

  crown.scale.set(1, 1.15, 0.9);

  group.add(crown);

  group.position.set(x, 0, z);

  group.traverse(object => {
    if (object.isMesh) object.castShadow = true;
  });

  scene.add(group);
}

for (let z = -42; z <= 42; z += 10) {

  addTree(-12, z, 0.8 + Math.random() * 0.4);
  addTree(12, z + 3, 0.8 + Math.random() * 0.4);
}

// ==========================================================
// CARRETERA Y CAPAS GRANULARES
// ==========================================================

function addLayer(name, width, height, y, texture) {

  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(
      width,
      height,
      ROAD.length
    ),
    new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 1
    })
  );

  mesh.name = name;

  mesh.position.set(0, y, 0);

  mesh.receiveShadow = true;
  mesh.castShadow = true;

  scene.add(mesh);

  return mesh;
}

addLayer(
  'Subrasante',
  14,
  0.9,
  0.45,
  soilTexture
);

addLayer(
  'Subbase granular',
  13.3,
  0.7,
  1.25,
  gravelTexture
);

const baseLayer = addLayer(
  'Base granular',
  12.5,
  0.5,
  1.85,
  gravelTexture
);

// ==========================================================
// CARPETA ASFÁLTICA POR TRAMOS
// ==========================================================

for (
  let z = ROAD.startZ;
  z < ROAD.endZ;
  z += 2.5
) {

  const length = Math.min(
    2.5,
    ROAD.endZ - z
  );

  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(
      11.8,
      0.33,
      length + 0.03
    ),
    asphaltFreshMaterial
  );

  mesh.position.set(
    0,
    2.265,
    z + length / 2
  );

  mesh.castShadow = true;
  mesh.receiveShadow = true;

  mesh.visible = false;

  scene.add(mesh);

  asphaltChunks.push({
    mesh,
    centerZ: z + length / 2,
    compacted: false
  });
}

// ==========================================================
// SEÑALIZACIÓN
// ==========================================================

roadMarkings = new THREE.Group();

scene.add(roadMarkings);

for (const side of [-1, 1]) {

  const edge = new THREE.Mesh(
    new THREE.BoxGeometry(
      0.12,
      0.02,
      ROAD.length - 2
    ),
    material(0xf4f0df)
  );

  edge.position.set(
    side * 5.55,
    ASPHALT_TOP + 0.02,
    0
  );

  roadMarkings.add(edge);
}

for (
  let z = ROAD.startZ + 3;
  z < ROAD.endZ;
  z += 8
) {

  const dash = new THREE.Mesh(
    new THREE.BoxGeometry(
      0.14,
      0.025,
      3.5
    ),
    material(0xffffff)
  );

  dash.position.set(
    0,
    ASPHALT_TOP + 0.025,
    z
  );

  roadMarkings.add(dash);
}

roadMarkings.visible = false;

// ==========================================================
// HERRAMIENTA PARA CREAR PIEZAS 3D
// ==========================================================

function addMesh(
  parent,
  geometry,
  mat,
  position,
  castShadow = true
) {

  const mesh = new THREE.Mesh(
    geometry,
    mat
  );

  mesh.position.set(...position);

  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;

  parent.add(mesh);

  return mesh;
}

// ==========================================================
// RODILLO COMPACTADOR PRINCIPAL
// ==========================================================

function createRoller() {

  const root = new THREE.Group();

  root.name = 'Rodillo vibratorio de compactación';
  const yellow = material(0xf2b900, 0.55);
  const black = material(0x20272c, 0.9);
  const glass = new THREE.MeshStandardMaterial({
    color: 0x83c8df,
    roughness: 0.2,
    transparent: true,
    opacity: 0.65
  });

  addMesh(
    root,
    new THREE.BoxGeometry(3.1, 0.8, 4.2),
    yellow,
    [0, 1.75, 0]
  );

  addMesh(
    root,
    new THREE.BoxGeometry(2.2, 1.4, 1.8),
    yellow,
    [0, 2.7, 0.8]
  );

  addMesh(
    root,
    new THREE.BoxGeometry(1.9, 0.9, 0.04),
    glass,
    [0, 2.8, 1.72],
    false
  );

  addMesh(
    root,
    new THREE.BoxGeometry(2.8, 0.15, 1),
    black,
    [0, 1.2, 0]
  );

  // Tambor frontal
  const drum = addMesh(
    root,
    new THREE.CylinderGeometry(
      0.9,
      0.9,
      2.9,
      40
    ),
    material(0x555d62, 0.3, 0.7),
    [0, 0.9, -1.8]
  );

  drum.rotation.z = Math.PI / 2;

  rotatingParts.push({
    object: drum,
    radius: 0.9
  });

  // Ruedas posteriores
  for (const x of [-0.95, 0.95]) {

    const wheel = addMesh(
      root,
      new THREE.CylinderGeometry(
        0.75,
        0.75,
        0.65,
        32
      ),
      black,
      [x, 0.75, 1.5]
    );

    wheel.rotation.z = Math.PI / 2;

    rotatingParts.push({
      object: wheel,
      radius: 0.75
    });
  }

  root.position.set(
    0,
    BASE_TOP,
    ROAD.startZ
  );

  scene.add(root);

  return root;
}

roller = createRoller();

// ==========================================================
// PAVIMENTADORA
// ==========================================================

function createPaver() {

  const root = new THREE.Group();

  const yellow = material(0xeeb41b);
  const black = material(0x252b30);

  addMesh(
    root,
    new THREE.BoxGeometry(3.3, 1, 3.5),
    yellow,
    [0, 1.4, 0]
  );

  addMesh(
    root,
    new THREE.BoxGeometry(3.6, 0.9, 1.1),
    yellow,
    [0, 1.5, 1.7]
  );

  addMesh(
    root,
    new THREE.BoxGeometry(11.8, 0.2, 0.5),
    material(0x626c73, 0.4, 0.6),
    [0, 0.15, -2.4]
  );

  for (const x of [-1.7, 1.7]) {

    addMesh(
      root,
      new THREE.BoxGeometry(0.5, 0.7, 3),
      black,
      [x, 0.5, 0]
    );
  }

  root.position.set(
    0,
    BASE_TOP,
    ROAD.startZ + 3
  );

  root.visible = false;

  scene.add(root);

  return root;
}

// ==========================================================
// RODILLO TÁNDEM ASFÁLTICO
// ==========================================================

function createAsphaltRoller() {

  const root = new THREE.Group();

  const yellow = material(0xf2b900);
  const black = material(0x242a2e);

  for (const z of [-1.35, 1.35]) {

    const drum = addMesh(
      root,
      new THREE.CylinderGeometry(
        0.78,
        0.78,
        2.8,
        40
      ),
      material(0x555e65, 0.3, 0.7),
      [0, 0.78, z]
    );

    drum.rotation.z = Math.PI / 2;

    asphaltRollerParts.push({
      object: drum,
      radius: 0.78
    });
  }

  addMesh(
    root,
    new THREE.BoxGeometry(2.5, 0.75, 2),
    yellow,
    [0, 1.9, 0]
  );

  addMesh(
    root,
    new THREE.BoxGeometry(1.5, 0.7, 1.2),
    black,
    [0, 2.65, 0]
  );

  root.position.set(
    0,
    ASPHALT_TOP,
    ROAD.startZ - 8
  );

  root.visible = false;

  scene.add(root);

  return root;
}

asphaltPaver = createPaver();
asphaltRoller = createAsphaltRoller();

// ==========================================================
// FIN PARTE 1
// ==========================================================
// ==========================================================
// EQUIPOS DE SOLUCIÓN INGENIERIL
// ==========================================================

function createRepairMachine(type) {

    const root = new THREE.Group();

    const yellow = material(0xe9ad18);
    const dark = material(0x252b30);
    const steel = material(0x68747c, 0.4, 0.6);

    addMesh(
      root,
      new THREE.BoxGeometry(2.8, 0.8, 3.7),
      yellow,
      [0, 1.2, 0]
    );

    addMesh(
      root,
      new THREE.BoxGeometry(1.7, 1.1, 1.5),
      yellow,
      [0, 2, 0.65]
    );

    addMesh(
      root,
      new THREE.BoxGeometry(1.5, 0.8, 0.035),
      new THREE.MeshStandardMaterial({
        color: 0x83c8df,
        transparent: true,
        opacity: 0.65,
        roughness: 0.2
      }),
      [0, 2.05, 1.42],
      false
    );

    for (const x of [-1.35, 1.35]) {
      for (const z of [-1.1, 1.1]) {

        const wheel = addMesh(
          root,
          new THREE.CylinderGeometry(
            0.43,
            0.43,
            0.35,
            24
          ),
          dark,
          [x, 0.48, z]
        );

        wheel.rotation.z = Math.PI / 2;
      }
    }

    if (type === 'scarifier') {

      // Barra trasera de escarificación.
      addMesh(
        root,
        new THREE.BoxGeometry(2.8, 0.14, 0.2),
        steel,
        [0, 0.6, -2]
      );

      for (let x = -1.15; x <= 1.15; x += 0.38) {

        const tooth = addMesh(
          root,
          new THREE.BoxGeometry(0.09, 0.7, 0.12),
          steel,
          [x, 0.2, -2.05]
        );

        tooth.rotation.x = -0.16;
      }
    }

    if (type === 'water') {

      // Cisterna.
      const tank = addMesh(
        root,
        new THREE.CylinderGeometry(
          0.78,
          0.78,
          2.5,
          32
        ),
        material(0xd8e0e7, 0.4, 0.2),
        [0, 2, -0.2]
      );

      tank.rotation.x = Math.PI / 2;

      // Barra de aspersión.
      addMesh(
        root,
        new THREE.BoxGeometry(2.8, 0.12, 0.2),
        steel,
        [0, 0.45, -2]
      );
    }

    if (type === 'grader') {

      // Hoja niveladora.
      const blade = addMesh(
        root,
        new THREE.BoxGeometry(3.6, 0.2, 0.35),
        steel,
        [0, 0.7, -1.8]
      );

      blade.rotation.y = 0.12;
    }

    root.position.set(
      0,
      BASE_TOP,
      ROAD.startZ - 7
    );

    root.visible = false;

    scene.add(root);

    return root;
  }

  scarifier = createRepairMachine('scarifier');
  waterTruck = createRepairMachine('water');
  grader = createRepairMachine('grader');

  // ==========================================================
  // TÉCNICO PARA CONTROL DE DENSIDAD
  // ==========================================================

  function createDensityTechnician() {

    const root = new THREE.Group();

    const vest = material(0xffa51e);
    const pants = material(0x263b52);
    const skin = material(0xc58b65);

    addMesh(
      root,
      new THREE.CylinderGeometry(
        0.2,
        0.25,
        0.85,
        12
      ),
      vest,
      [0, 1.15, 0]
    );

    addMesh(
      root,
      new THREE.SphereGeometry(0.22, 16, 12),
      skin,
      [0, 1.72, 0]
    );

    for (const x of [-0.13, 0.13]) {

      addMesh(
        root,
        new THREE.CylinderGeometry(
          0.09,
          0.11,
          0.65,
          10
        ),
        pants,
        [x, 0.42, 0]
      );
    }

    // Equipo de medición representativo.
    addMesh(
      root,
      new THREE.BoxGeometry(0.42, 0.48, 0.3),
      material(0x286d9e),
      [-0.65, 0.38, 0]
    );

    root.position.set(2.2, BASE_TOP, 0);
    root.visible = false;

    scene.add(root);

    return root;
  }

  densityTechnician = createDensityTechnician();

  // ==========================================================
  // VEHÍCULOS PARA LA CARRETERA TERMINADA
  // ==========================================================

  function createTrafficCar(color) {

    const root = new THREE.Group();

    const body = material(color, 0.4);

    const glass = new THREE.MeshStandardMaterial({
      color: 0x8ac5df,
      roughness: 0.2,
      metalness: 0.1
    });

    addMesh(
      root,
      new THREE.BoxGeometry(1.85, 0.62, 3.5),
      body,
      [0, 0.65, 0]
    );

    addMesh(
      root,
      new THREE.BoxGeometry(1.4, 0.65, 1.75),
      glass,
      [0, 1.25, -0.15]
    );

    addMesh(
      root,
      new THREE.BoxGeometry(1.8, 0.13, 1.1),
      body,
      [0, 1.62, -0.15]
    );

    for (const x of [-0.95, 0.95]) {
      for (const z of [-1.05, 1.05]) {

        const wheel = addMesh(
          root,
          new THREE.CylinderGeometry(
            0.29,
            0.29,
            0.2,
            20
          ),
          material(0x15191d),
          [x, 0.3, z]
        );

        wheel.rotation.z = Math.PI / 2;
      }
    }

    for (const x of [-0.58, 0.58]) {

      addMesh(
        root,
        new THREE.BoxGeometry(0.25, 0.16, 0.08),
        material(0xffe6a0),
        [x, 0.72, 1.78]
      );

      addMesh(
        root,
        new THREE.BoxGeometry(0.22, 0.15, 0.08),
        material(0xff3636),
        [x, 0.72, -1.78]
      );
    }

    root.visible = false;

    scene.add(root);

    return root;
  }

  trafficCars = [
    {
      group: createTrafficCar(0xd32f2f),
      lane: -1.7,
      direction: 1,
      speed: 8
    },
    {
      group: createTrafficCar(0xeeeeee),
      lane: 1.7,
      direction: -1,
      speed: 7
    },
    {
      group: createTrafficCar(0x1976d2),
      lane: -1.7,
      direction: 1,
      speed: 9
    },
    {
      group: createTrafficCar(0xf0b51b),
      lane: 1.7,
      direction: -1,
      speed: 8
    }
  ];

  // ==========================================================
  // INTERFAZ DE GEOCOMPACT
  // ==========================================================

  const panel = document.createElement('aside');

  panel.id = 'control-panel';

  panel.innerHTML = `
    <div class="brand">
      <div class="brand-mark">GC</div>
      <div>
        <strong>GEOCOMPACT</strong>
        <span>ROAD COMPACTION SIMULATOR 3D</span>
      </div>
    </div>

    <div class="project-name" id="project-name">
      Proyecto: Mejoramiento vial - Caso 5
    </div>

    <div class="field">
      <label for="gradeInput">
        Grado de compactación obtenido (%)
      </label>
      <input
        id="gradeInput"
        type="number"
        readonly
        value="93.18"
      >
    </div>

    <div class="field">
      <label for="minimumInput">
        Compactación mínima exigida (%)
      </label>
      <input
        id="minimumInput"
        type="number"
        min="0"
        max="110"
        step="0.01"
        value="95"
      >
    </div>

    <div class="field">
      <label for="passesInput">
        Número de pasadas
      </label>
      <input
        id="passesInput"
        type="number"
        min="1"
        max="20"
        value="6"
      >
    </div>

    <div class="field">
      <label for="thicknessInput">
        Espesor de capa (cm)
      </label>
      <input
        id="thicknessInput"
        type="number"
        min="5"
        max="60"
        value="20"
      >
    </div>

    <button id="startButton" type="button">
      ▶ INICIAR COMPACTACIÓN
    </button>

    <button id="resetButton" class="secondary" type="button">
      ↻ REINICIAR SIMULACIÓN
    </button>

    <div id="status-box" aria-live="polite"></div>
  `;

  document.body.appendChild(panel);

  // ==========================================================
  // PANEL DE PASADAS
  // ==========================================================

  const progress = document.createElement('div');

  progress.id = 'progress-box';

  progress.innerHTML = `
    <div class="progress-heading">
      <span id="progress-title">PASADAS</span>
      <span id="pass-counter">0 / 6</span>
    </div>

    <div class="progress-track">
      <span id="progress-fill"></span>
    </div>

    <small id="progress-caption">
      Esperando inicio
    </small>
  `;

  document.body.appendChild(progress);

  // ==========================================================
  // INDICACIONES Y SINCRONIZACIÓN
  // ==========================================================

  const hint = document.createElement('div');

  hint.id = 'scene-hint';

  hint.textContent =
    'Arrastra para girar · Rueda para acercar';

  document.body.appendChild(hint);

  const syncIndicator = document.createElement('div');

  syncIndicator.id = 'sync-indicator';

  syncIndicator.textContent =
    'Esperando parámetros de COMPACTA LAB 360';

  document.body.appendChild(syncIndicator);

  // ==========================================================
  // REFERENCIAS DE INTERFAZ
  // ==========================================================

  const $ = id => document.getElementById(id);

  const statusBox = $('status-box');
  const startButton = $('startButton');
  const resetButton = $('resetButton');

  // ==========================================================
  // DATOS PROCEDENTES DE COLAB
  // ==========================================================

  const defaults = { ...geoData };

  function numeric(value, fallback) {

    if (
      value === null ||
      value === undefined ||
      value === ''
    ) {
      return fallback;
    }

    const normalized = typeof value === 'string'
      ? value.trim().replace(',', '.')
      : value;

    const parsed = Number(normalized);

    return Number.isFinite(parsed)
      ? parsed
      : fallback;
  }

  function getIncomingValue(source, aliases) {

    for (const alias of aliases) {

      const value = source?.[alias];

      if (
        value !== undefined &&
        value !== null &&
        value !== ''
      ) {
        return value;
      }
    }

    return undefined;
  }

  function parseIncoming(source) {

    if (typeof source === 'string') {

      try {
        source = JSON.parse(source);
      } catch {
        return {};
      }
    }

    if (!source || typeof source !== 'object') {
      return {};
    }

    // Admite datos agrupados dentro de objetos de resultados.
    const data = {
      ...source,
      ...(source.resultados || {}),
      ...(source.metrics || {}),
      ...(source.parametros || {})
    };

    const result = {};

    const aliases = {
      proyecto: [
        'proyecto',
        'project',
        'nombreProyecto'
      ],

      rhoSeca: [
        'rhoSeca',
        'densidadSecaCampo',
        'densidad_seca_campo',
        'densidadSeca'
      ],

      rhoStd: [
        'rhoStd',
        'densidadMaximaEstandar',
        'densidad_seca_maxima_estandar'
      ],

      wStd: [
        'wStd',
        'humedadOptimaEstandar',
        'humedad_optima_estandar'
      ],

      rhoMod: [
        'rhoMod',
        'densidadMaximaModificada',
        'densidad_seca_maxima_modificada'
      ],

      wMod: [
        'wMod',
        'humedadOptimaModificada',
        'humedad_optima_modificada'
      ],

      humedad: [
        'humedad',
        'humedadCampo',
        'humedad_campo'
      ],

      exigencia: [
        'exigencia',
        'compactacionMinima',
        'gradoMinimo',
        'minimumGrade'
      ],

      pasadas: [
        'pasadas',
        'numeroPasadas',
        'numero_de_pasadas'
      ],

      espesorCm: [
        'espesorCm',
        'espesor',
        'espesor_capa'
      ],

      referencia: [
        'referencia',
        'proctor',
        'tipoProctor'
      ],

      gradeProvided: [
        'gradoCompactacion',
        'grado_compactacion',
        'gcModificado',
        'gcEstandar',
        'gradoObtenido'
      ]
    };

    for (const [key, names] of Object.entries(aliases)) {

      const value = getIncomingValue(data, names);

      if (value === undefined) continue;

      if (key === 'proyecto' || key === 'referencia') {
        result[key] = String(value);
      } else {
        result[key] = numeric(value, null);
      }
    }

    // Si se reciben nuevas densidades, se calcula nuevamente
    // y no se utiliza un grado antiguo.
    if (
      result.rhoSeca !== undefined ||
      result.rhoMod !== undefined ||
      result.rhoStd !== undefined
    ) {
      result.gradeProvided = null;
    }

    return result;
  }

  // ==========================================================
  // REFERENCIA PROCTOR
  // ==========================================================

  function isStandardReference() {

    const reference = String(
      geoData.referencia || ''
    ).toLowerCase();

    return (
      reference.includes('estándar') ||
      reference.includes('estandar') ||
      reference.includes('standard')
    );
  }

  // ==========================================================
  // CÁLCULO GEOTÉCNICO
  // ==========================================================

  function calculateMetrics() {

    const standard = isStandardReference();

    const maxDryDensity = Math.max(
      0.001,
      numeric(
        standard ? geoData.rhoStd : geoData.rhoMod,
        0
      )
    );

    const dryDensity = Math.max(
      0,
      numeric(geoData.rhoSeca, 0)
    );

    const optimumMoisture = numeric(
      standard ? geoData.wStd : geoData.wMod,
      0
    );

    const hasDensityData =
      Number.isFinite(geoData.rhoSeca) &&
      Number.isFinite(
        standard ? geoData.rhoStd : geoData.rhoMod
      );

    if (hasDensityData && maxDryDensity > 0) {

      currentGrade =
        (dryDensity / maxDryDensity) * 100;

    } else if (
      Number.isFinite(geoData.gradeProvided)
    ) {

      currentGrade = geoData.gradeProvided;
    }

    minimumGrade = Math.max(
      0,
      Math.min(
        110,
        numeric(
          $('minimumInput').value,
          geoData.exigencia
        )
      )
    );

    passes = Math.max(
      1,
      Math.min(
        20,
        Math.round(
          numeric(
            $('passesInput').value,
            geoData.pasadas
          )
        )
      )
    );

    metrics = {
      dryDensity,
      maxDryDensity,

      fieldMoisture: numeric(
        geoData.humedad,
        0
      ),

      optimumMoisture,

      moistureDifference: Math.abs(
        numeric(geoData.humedad, 0) -
        optimumMoisture
      ),

      deficit: Math.max(
        0,
        minimumGrade - currentGrade
      ),

      reference: standard
        ? 'Proctor estándar'
        : 'Proctor modificado'
    };

    $('gradeInput').value =
      currentGrade.toFixed(2);

    $('minimumInput').value =
      minimumGrade;

    $('passesInput').value =
      passes;

    $('thicknessInput').value =
      geoData.espesorCm;

    $('pass-counter').textContent =
      `0 / ${passes}`;

    $('progress-fill').style.width = '0%';

    $('progress-caption').textContent =
      geoData.referencia;
  }

  // ==========================================================
  // FIN PARTE 2
  // ==========================================================
  // ==========================================================
// LIMPIEZA DE ELEMENTOS VISUALES
// ==========================================================

function removeGroup(group) {

    if (!group) return;

    scene.remove(group);

    group.traverse(object => {

      if (object.geometry) {
        object.geometry.dispose();
      }

      if (object.material) {

        if (Array.isArray(object.material)) {
          object.material.forEach(m => m.dispose());
        } else {
          object.material.dispose();
        }
      }
    });
  }

  function clearFailureVisuals() {

    removeGroup(failureGroup);
    removeGroup(solutionGroup);

    failureGroup = null;
    solutionGroup = null;
  }

  // ==========================================================
  // REINICIO DE EQUIPOS DE RECUPERACIÓN
  // ==========================================================

  function hideRepairEquipment() {

    scarifier.visible = false;
    waterTruck.visible = false;
    grader.visible = false;
    densityTechnician.visible = false;
    roller.visible = false;
  }

  function resetRepairEquipment() {

    hideRepairEquipment();

    scarifier.position.set(
      0,
      BASE_TOP,
      ROAD.startZ - 7
    );

    waterTruck.position.set(
      0,
      BASE_TOP,
      ROAD.startZ - 7
    );

    grader.position.set(
      0,
      BASE_TOP,
      ROAD.startZ - 7
    );

    densityTechnician.position.set(
      2.2,
      BASE_TOP,
      0
    );

    roller.position.set(
      0,
      BASE_TOP,
      ROAD.startZ
    );

    rotatingParts.forEach(({ object }) => {
      object.rotation.x = 0;
    });
  }

  // ==========================================================
  // REINICIO DE CARPETA ASFÁLTICA
  // ==========================================================

  function resetAsphaltStage() {

    stage = 'base';
    pavingProgress = 0;

    asphaltPaver.visible = false;
    asphaltRoller.visible = false;

    asphaltPaver.position.set(
      0,
      BASE_TOP,
      ROAD.startZ + 3
    );

    asphaltRoller.position.set(
      0,
      ASPHALT_TOP,
      ROAD.startZ - 8
    );

    asphaltChunks.forEach(item => {

      item.mesh.visible = false;
      item.mesh.material = asphaltFreshMaterial;
      item.compacted = false;
    });

    asphaltRollerParts.forEach(({ object }) => {
      object.rotation.x = 0;
    });

    roadMarkings.visible = false;

    trafficCars.forEach(car => {
      car.group.visible = false;
    });
  }

  // ==========================================================
  // REINICIO GENERAL
  // ==========================================================

  function resetSimulation() {

    isRunning = false;
    simulationFinished = false;

    completedPasses = 0;
    repairPhaseTime = 0;
    repairTestReady = false;
    repairDirection = 1;

    resetAsphaltStage();
    resetRepairEquipment();

    roller.visible = true;

    roller.position.set(
      0,
      BASE_TOP,
      ROAD.startZ
    );

    clearFailureVisuals();

    startButton.disabled = false;

    startButton.textContent =
      '▶ INICIAR COMPACTACIÓN';

    statusBox.className = '';
    statusBox.style.display = 'none';
    statusBox.innerHTML = '';

    calculateMetrics();

    $('progress-title').textContent = 'PASADAS';

    $('progress-caption').textContent =
      'Esperando inicio';

    $('pass-counter').textContent =
      `0 / ${passes}`;

    $('progress-fill').style.width = '0%';
  }

  // ==========================================================
  // ACTUALIZACIÓN DE DATOS DE COLAB
  // ==========================================================

  function applyIncomingData(incoming, label) {

    geoData = {
      ...geoData,
      ...incoming
    };

    $('project-name').textContent =
      `Proyecto: ${geoData.proyecto}`;

    $('minimumInput').value =
      geoData.exigencia;

    $('passesInput').value =
      geoData.pasadas;

    $('thicknessInput').value =
      geoData.espesorCm;

    resetSimulation();

    syncIndicator.textContent =
      `Sincronizado · ${label}`;
  }

  // ==========================================================
  // SELECCIÓN DE REFERENCIA PROCTOR
  // ==========================================================

  function updateProctorReference() {

    const reference = String(
      geoData.referencia || ''
    ).toLowerCase();

    return (
      reference.includes('estándar') ||
      reference.includes('estandar') ||
      reference.includes('standard')
    );
  }

  // ==========================================================
  // VISUALIZACIÓN DE CONSECUENCIAS
  // ==========================================================

  function addCrack(points, radius = 0.025) {

    const curve = new THREE.CatmullRomCurve3(
      points.map(([x, z]) => {

        return new THREE.Vector3(
          x,
          BASE_TOP + 0.04,
          z
        );
      })
    );

    const crack = new THREE.Mesh(
      new THREE.TubeGeometry(
        curve,
        60,
        radius,
        6,
        false
      ),
      material(0x17191b, 1)
    );

    failureGroup.add(crack);
  }

  function addPothole(x, z, rx, rz) {

    const group = new THREE.Group();

    const shape = new THREE.Shape();

    for (let i = 0; i < 20; i++) {

      const angle =
        (i / 20) * Math.PI * 2;

      const wobble =
        0.85 + Math.random() * 0.2;

      const px =
        Math.cos(angle) * rx * wobble;

      const py =
        Math.sin(angle) * rz * wobble;

      if (i === 0) {
        shape.moveTo(px, py);
      } else {
        shape.lineTo(px, py);
      }
    }

    shape.closePath();

    const rim = new THREE.Mesh(
      new THREE.ShapeGeometry(shape),
      material(0x62574b, 1)
    );

    rim.rotation.x = -Math.PI / 2;
    rim.position.y = BASE_TOP + 0.035;

    group.add(rim);

    const inner = new THREE.Mesh(
      new THREE.CircleGeometry(1, 24),
      material(0x17191b, 1)
    );

    inner.rotation.x = -Math.PI / 2;

    inner.position.y = BASE_TOP + 0.045;

    inner.scale.set(rx * 0.65, rz * 0.65, 1);

    group.add(inner);

    group.position.set(x, 0, z);

    failureGroup.add(group);
  }

  function addFailureVisuals() {

    if (failureGroup) return;

    failureGroup = new THREE.Group();

    failureGroup.name =
      'Consecuencias de compactación insuficiente';

    scene.add(failureGroup);

    // Ahuellamientos.
    const rutMaterial = new THREE.MeshStandardMaterial({
      color: 0x34383b,
      transparent: true,
      opacity: 0.75,
      roughness: 1
    });

    for (const x of [-2.5, 2.5]) {

      const rut = new THREE.Mesh(
        new THREE.BoxGeometry(
          0.65,
          0.035,
          65
        ),
        rutMaterial
      );

      rut.position.set(
        x,
        BASE_TOP + 0.03,
        0
      );

      failureGroup.add(rut);
    }

    // Grietas representativas.
    addCrack([
      [-4, -25],
      [-3.4, -22],
      [-3.8, -19],
      [-2.7, -16],
      [-3.1, -13]
    ]);

    addCrack([
      [-3.8, -19],
      [-2.1, -20],
      [-1.4, -23]
    ], 0.018);

    addCrack([
      [1.2, -8],
      [2.2, -5],
      [1.6, -2],
      [2.8, 1],
      [2.4, 5]
    ]);

    addCrack([
      [2.1, -3],
      [0.8, 0],
      [0.4, 3]
    ], 0.018);

    addCrack([
      [-1.5, 17],
      [-0.4, 20],
      [-0.8, 23],
      [0.6, 26]
    ]);

    // Baches.
    addPothole(-3.7, -31, 0.9, 1.2);
    addPothole(3.6, 13, 0.8, 1.1);
    addPothole(-1.4, 34, 0.65, 0.8);
  }

  // ==========================================================
  // GUÍAS VISUALES DE SOLUCIÓN
  // ==========================================================

  function addSolutionVisuals() {

    if (solutionGroup) return;

    solutionGroup = new THREE.Group();

    solutionGroup.name =
      'Intervención ingenieril';

    scene.add(solutionGroup);

    const guideMaterial =
      new THREE.MeshStandardMaterial({
        color: 0x22c7a0,
        emissive: 0x087b63,
        emissiveIntensity: 0.2,
        transparent: true,
        opacity: 0.7
      });

    for (const x of [-4.8, 4.8]) {

      const line = new THREE.Mesh(
        new THREE.BoxGeometry(
          0.1,
          0.04,
          72
        ),
        guideMaterial
      );

      line.position.set(
        x,
        BASE_TOP + 0.08,
        0
      );

      solutionGroup.add(line);
    }
  }

  // ==========================================================
  // RESULTADO: COMPACTACIÓN ADECUADA
  // ==========================================================

  function showSuccess() {

    statusBox.className = 'good';
    statusBox.style.display = 'block';

    statusBox.innerHTML = `
      <div class="big-check">✓</div>

      <h3>¡COMPACTACIÓN SATISFACTORIA!</h3>

      <p>
        La capa granular alcanzó el grado de
        compactación mínimo exigido.
      </p>

      <div class="metrics">

        <div>
          <span>Grado obtenido</span>
          <span>${currentGrade.toFixed(2)} %</span>
        </div>

        <div>
          <span>Mínimo requerido</span>
          <span>${minimumGrade.toFixed(2)} %</span>
        </div>

        <div>
          <span>Referencia</span>
          <span>${metrics.reference}</span>
        </div>

        <div>
          <span>Densidad seca</span>
          <span>${metrics.dryDensity.toFixed(3)} g/cm³</span>
        </div>

      </div>

      <p>
        <strong>DICTAMEN: CUMPLE.</strong>
        Puede continuarse con la colocación
        de la carpeta asfáltica, previa verificación
        de las demás condiciones de obra.
      </p>

      <button
        id="continueAsphaltButton"
        class="solution"
        type="button"
      >
        ▶ COLOCAR CARPETA ASFÁLTICA
      </button>
    `;

    $('continueAsphaltButton').addEventListener(
      'click',
      startAsphaltStage
    );
  }
    // ==========================================================
  // RESULTADO: COMPACTACIÓN INSUFICIENTE
  // ==========================================================

  function showFailure() {

    statusBox.className = 'bad';
    statusBox.style.display = 'block';

    statusBox.innerHTML = `

      <h3>⚠ COMPACTACIÓN INSUFICIENTE</h3>

      <div class="metrics">

        <div>
          <span>Resultado</span>
          <span>${currentGrade.toFixed(2)} %</span>
        </div>

        <div>
          <span>Mínimo exigido</span>
          <span>${minimumGrade.toFixed(2)} %</span>
        </div>

        <div>
          <span>Déficit</span>
          <span>${metrics.deficit.toFixed(2)} puntos porcentuales</span>
        </div>

      </div>

      <h4>Evaluación geotécnica</h4>

      <ul>
        <li>
          Densidad seca de campo:
          <strong>${metrics.dryDensity.toFixed(3)} g/cm³</strong>
        </li>

        <li>
          Densidad seca máxima:
          <strong>${metrics.maxDryDensity.toFixed(3)} g/cm³</strong>
        </li>

        <li>
          Humedad de campo:
          <strong>${metrics.fieldMoisture.toFixed(2)} %</strong>
        </li>

        <li>
          Humedad óptima:
          <strong>${metrics.optimumMoisture.toFixed(2)} %</strong>
        </li>

        <li>
          Diferencia de humedad:
          <strong>${metrics.moistureDifference.toFixed(2)} puntos porcentuales</strong>
        </li>
      </ul>

      <p>
        <strong>DICTAMEN: NO CUMPLE.</strong>
        No se debe colocar la carpeta asfáltica
        hasta corregir y verificar la capa granular.
      </p>

      <button
        id="consequencesButton"
        class="warning"
        type="button"
      >
        ⚠ VER CONSECUENCIAS
      </button>

      <div id="consequences-panel" hidden>

        <h4>Consecuencias posibles</h4>

        <ul>
          <li>Mayor deformación de la capa.</li>
          <li>Asentamientos posteriores.</li>
          <li>Menor capacidad de soporte.</li>
          <li>Formación de ahuellamientos.</li>
          <li>Fisuración y deterioro prematuro.</li>
          <li>Posibles baches y desprendimientos si se pavimenta sin corregir la deficiencia.</li>
        </ul>

        <p>
          Las fallas representadas son ilustrativas
          y corresponden a posibles consecuencias posteriores.
        </p>

      </div>

      <button
        id="solutionsButton"
        class="solution"
        type="button"
        disabled
      >
        ✓ VER SOLUCIONES INGENIERILES
      </button>

      <div id="solutions-panel" hidden>

        <h4>Procedimiento de recuperación</h4>

        <ol>
          <li>Escarificación de la capa deficiente.</li>
          <li>Acondicionamiento de la humedad.</li>
          <li>Mezclado y nivelación del material.</li>
          <li>Recompactación con equipo adecuado.</li>
          <li>Nuevo control de densidad de campo.</li>
        </ol>

        <p>
          Se iniciará una representación animada
          de estas operaciones.
        </p>

      </div>

      <p class="small-note">
        La intervención debe verificarse mediante
        un nuevo control de densidad de campo.
      </p>
    `;

    $('consequencesButton').addEventListener('click', () => {

      $('consequences-panel').hidden = false;

      addFailureVisuals();

      $('consequencesButton').disabled = true;
      $('solutionsButton').disabled = false;

      $('consequencesButton').textContent =
        'CONSECUENCIAS VISUALIZADAS';
    });

    $('solutionsButton').addEventListener('click', () => {

      $('solutions-panel').hidden = false;
      $('solutionsButton').disabled = true;
      $('solutionsButton').textContent = 'RECUPERACIÓN INICIADA';

      addSolutionVisuals();

      startEngineeringSolution();
    });
  }

  // ==========================================================
  // INICIO DE LA RECUPERACIÓN INGENIERIL
  // ==========================================================

  function startEngineeringSolution() {

    if (isRunning) return;

    // Retira las fallas, pero conserva las guías verdes de la solución.
    removeGroup(failureGroup);
    failureGroup = null;

    isRunning = true;
    simulationFinished = false;

    completedPasses = 0;
    repairDirection = 1;
    repairPhaseTime = 0;
    repairTestReady = false;

    startButton.disabled = true;

    startButton.textContent =
      'RECUPERANDO CAPA...';

    // Determinar el tipo de acondicionamiento.
    if (
      metrics.fieldMoisture <
      metrics.optimumMoisture - 0.2
    ) {

      stage = 'repairScarify';
      setRepairPhase(
        'repairScarify',
        'ETAPA 1 · ESCARIFICACIÓN',
        'El equipo escarifica la capa granular deficiente para aflojar el material y permitir su acondicionamiento.',
        scarifier
      );

    } else if (
      metrics.fieldMoisture >
      metrics.optimumMoisture + 0.2
    ) {

      stage = 'repairScarify';
      setRepairPhase(
        'repairScarify',
        'ETAPA 1 · ESCARIFICACIÓN',
        'Se afloja la capa granular para facilitar el mezclado y la aireación del material.',
        scarifier
      );

    } else {

      stage = 'repairScarify';
      setRepairPhase(
        'repairScarify',
        'ETAPA 1 · ESCARIFICACIÓN',
        'Se afloja el material para permitir su homogeneización y posterior recompactación.',
        scarifier
      );
    }
  }

  // ==========================================================
  // CONFIGURACIÓN DE CADA ETAPA
  // ==========================================================

  function setRepairPhase(
    phase,
    title,
    description,
    vehicle = null
  ) {

    stage = phase;
    repairPhaseTime = 0;

    hideRepairEquipment();

    if (vehicle) {

      vehicle.position.set(
        0,
        BASE_TOP,
        ROAD.startZ - 7
      );

      vehicle.visible = true;
    }

    statusBox.className = 'good';
    statusBox.style.display = 'block';

    statusBox.innerHTML = `

      <h3>${title}</h3>

      <p>${description}</p>

      <p id="repair-detail">
        <strong>Intervención en ejecución...</strong>
      </p>

      <p class="small-note">
        Esta es una representación visual del
        procedimiento de recuperación.
      </p>
    `;

    $('progress-title').textContent =
      'RECUPERACIÓN';

    $('pass-counter').textContent = '0 %';

    $('progress-fill').style.width = '0%';

    $('progress-caption').textContent =
      title;
  }

  // ==========================================================
  // DESPLAZAMIENTO DE EQUIPOS DE RECUPERACIÓN
  // ==========================================================

  function moveRepairVehicle(vehicle, delta) {

    const oldZ = vehicle.position.z;

    vehicle.position.z +=
      13 * Math.min(delta, 0.05);

    const progressValue = Math.min(
      100,
      (
        (vehicle.position.z - (ROAD.startZ - 7)) /
        (ROAD.length + 14)
      ) * 100
    );

    $('pass-counter').textContent =
      `${Math.round(progressValue)} %`;

    $('progress-fill').style.width =
      `${progressValue}%`;

    return (
      vehicle.position.z >= ROAD.endZ + 7
    );
  }

  // ==========================================================
  // ETAPA 2: CORRECCIÓN DE HUMEDAD
  // ==========================================================

  function startMoistureCorrection() {

    hideRepairEquipment();

    if (
      metrics.fieldMoisture <
      metrics.optimumMoisture - 0.2
    ) {

      setRepairPhase(
        'repairWater',
        'ETAPA 2 · INCORPORACIÓN DE AGUA',
        'La humedad de campo está por debajo de la óptima. El camión cisterna distribuye agua para acondicionar el material.',
        waterTruck
      );

    } else if (
      metrics.fieldMoisture >
      metrics.optimumMoisture + 0.2
    ) {

      setRepairPhase(
        'repairDry',
        'ETAPA 2 · AIREACIÓN DEL MATERIAL',
        'La humedad supera la óptima. Se remueve y airea el material para facilitar su secado.',
        grader
      );

    } else {

      setRepairPhase(
        'repairGrade',
        'ETAPA 3 · MEZCLADO Y NIVELACIÓN',
        'La humedad está próxima a la óptima. Se homogeniza y regulariza el material antes de la recompactación.',
        grader
      );
    }
  }

  // ==========================================================
  // ETAPA 4: RECOMPACTACIÓN
  // ==========================================================

  function startRepairCompaction() {

    completedPasses = 0;
    repairDirection = 1;

    roller.position.set(
      0,
      BASE_TOP,
      ROAD.startZ
    );

    roller.visible = true;

    rotatingParts.forEach(({ object }) => {
      object.rotation.x = 0;
    });

    setRepairPhase(
      'repairRecompact',
      'ETAPA 4 · RECOMPACTACIÓN',
      'El rodillo vibratorio vuelve a recorrer la capa granular mediante las pasadas establecidas.'
    );

    roller.visible = true;

    $('progress-title').textContent =
      'RECOMPACTACIÓN';

    $('pass-counter').textContent =
      `0 / ${passes}`;

    $('progress-caption').textContent =
      'Recompactando material granular';
  }

  // ==========================================================
  // ETAPA 5: CONTROL DE DENSIDAD
  // ==========================================================

  function startRepairTesting() {

    hideRepairEquipment();

    setRepairPhase(
      'repairTesting',
      'ETAPA 5 · CONTROL DE DENSIDAD DE CAMPO',
      'El personal técnico realiza una nueva comprobación de densidad para verificar la calidad de la capa.',
      densityTechnician
    );

    repairPhaseTime = 0;
    repairTestReady = false;

    $('progress-caption').textContent =
      'Control de calidad en ejecución';
  }
  // ==========================================================
// CONTROL DE REENSAYO DESPUÉS DE LA RECOMPACTACIÓN
// ==========================================================

function showRetestForm() {
    if (repairTestReady) return;
    repairTestReady = true;
    densityTechnician.visible = false;
  
    statusBox.className = 'good';
    statusBox.style.display = 'block';
    statusBox.innerHTML = `
      <h3>ETAPA 5 · REGISTRO DEL NUEVO ENSAYO</h3>
      <p>La capa fue recompactada. El técnico debe registrar el nuevo resultado del control de densidad de campo.</p>
      <div class="metrics">
        <div><span>Densidad seca máxima (${metrics.reference})</span><span>${metrics.maxDryDensity.toFixed(3)} g/cm³</span></div>
        <div><span>Grado mínimo exigido</span><span>${minimumGrade.toFixed(2)} %</span></div>
        <div><span>Resultado anterior</span><span>${currentGrade.toFixed(2)} %</span></div>
      </div>
      <div class="field">
        <label for="retestDensityInput">Nueva densidad seca de campo (g/cm³)</label>
        <input id="retestDensityInput" type="number" min="0.1" max="5" step="0.001" value="${metrics.dryDensity.toFixed(3)}">
      </div>
      <button id="registerRetestButton" class="solution" type="button">✓ REGISTRAR NUEVO ENSAYO</button>
      <p class="small-note">No se aumenta la densidad automáticamente. Introduce el valor obtenido en el nuevo ensayo de campo. Si todavía no tienes ese resultado, conserva el valor anterior y la capa seguirá rechazada.</p>
    `;
  
    $('registerRetestButton').addEventListener('click', () => {
      const input = $('retestDensityInput');
      const newDryDensity = numeric(input.value, NaN);
  
      if (!Number.isFinite(newDryDensity) || newDryDensity <= 0) {
        input.setCustomValidity('Ingresa una densidad seca válida mayor que cero.');
        input.reportValidity();
        return;
      }
  
      input.setCustomValidity('');
  
      // El resultado solo cambia cuando se registra explícitamente un nuevo ensayo.
      geoData.rhoSeca = newDryDensity;
      currentGrade = (newDryDensity / metrics.maxDryDensity) * 100;
      metrics.dryDensity = newDryDensity;
      metrics.deficit = Math.max(0, minimumGrade - currentGrade);
      metrics.moistureDifference = Math.abs(
        metrics.fieldMoisture - metrics.optimumMoisture
      );
  
      $('gradeInput').value = currentGrade.toFixed(2);
      repairTestReady = false;
      isRunning = false;
      simulationFinished = true;
      stage = 'base';
  
      if (currentGrade >= minimumGrade) {
        removeGroup(solutionGroup);
        solutionGroup = null;
        startButton.disabled = false;
        startButton.textContent = '▶ CONTINUAR CON CARPETA ASFÁLTICA';
        showSuccess();
      } else {
        removeGroup(solutionGroup);
        solutionGroup = null;
        clearFailureVisuals();
        startButton.disabled = false;
        startButton.textContent = 'REVISAR Y REPETIR SOLUCIÓN';
        showFailure();
      }
  
      updateProgress();
    });
  }
  
  // ==========================================================
  // ANIMACIÓN DE LAS ETAPAS DE SOLUCIÓN INGENIERIL
  // ==========================================================
  
  function nextRepairGradingPhase(message = 'El material se homogeniza y se regulariza antes de compactar.') {
    setRepairPhase(
      'repairGrade',
      'ETAPA 3 · MEZCLADO Y NIVELACIÓN',
      message,
      grader
    );
  }
  
  function finishRepairVehiclePhase() {
    if (stage === 'repairScarify') {
      startMoistureCorrection();
      return;
    }
  
    if (stage === 'repairWater') {
      nextRepairGradingPhase('Después de incorporar agua de forma controlada, se mezcla el material para distribuir la humedad de manera uniforme.');
      return;
    }
  
    if (stage === 'repairDry') {
      nextRepairGradingPhase('Después de airear el material para reducir el exceso de humedad, se mezcla y nivela la capa.');
      return;
    }
  
    if (stage === 'repairGrade') {
      startRepairCompaction();
    }
  }
  
  function animateRepairCompaction(delta) {
    const speed = 14.5;
    const step = speed * Math.min(delta, 0.05);
    const oldZ = roller.position.z;
    let nextZ = oldZ + step * repairDirection;
    let movedDistance = Math.abs(nextZ - oldZ);
  
    if (repairDirection > 0 && nextZ >= ROAD.endZ) {
      movedDistance = Math.abs(ROAD.endZ - oldZ);
      roller.position.z = ROAD.endZ;
      completedPasses += 1;
  
      if (completedPasses >= passes) {
        updateRepairPassProgress();
        startRepairTesting();
        return;
      }
      repairDirection = -1;
    } else if (repairDirection < 0 && nextZ <= ROAD.startZ) {
      movedDistance = Math.abs(ROAD.startZ - oldZ);
      roller.position.z = ROAD.startZ;
      completedPasses += 1;
  
      if (completedPasses >= passes) {
        updateRepairPassProgress();
        startRepairTesting();
        return;
      }
      repairDirection = 1;
    } else {
      roller.position.z = nextZ;
    }
  
    roller.position.y = BASE_TOP + Math.sin(performance.now() * 0.025) * 0.012;
    for (const part of rotatingParts) {
      part.object.rotation.x -= (movedDistance / part.radius) * repairDirection;
    }
  
    updateRepairPassProgress();
  }
  
  function updateRepairPassProgress() {
    const fraction = Math.min(completedPasses / passes, 1);
    $('progress-title').textContent = 'RECOMPACTACIÓN';
    $('pass-counter').textContent = `${completedPasses} / ${passes}`;
    $('progress-fill').style.width = `${fraction * 100}%`;
    $('progress-caption').textContent = 'Recompactando capa granular';
  }
  
  function animateRepairStage(delta) {
    repairPhaseTime += Math.min(delta, 0.05);
  
    if (
      stage === 'repairScarify' ||
      stage === 'repairWater' ||
      stage === 'repairDry' ||
      stage === 'repairGrade'
    ) {
      const vehicleByStage = {
        repairScarify: scarifier,
        repairWater: waterTruck,
        repairDry: grader,
        repairGrade: grader
      };
  
      const vehicle = vehicleByStage[stage];
      if (vehicle && moveRepairVehicle(vehicle, delta)) {
        finishRepairVehiclePhase();
      }
      return;
    }
  
    if (stage === 'repairRecompact') {
      animateRepairCompaction(delta);
      return;
    }
  
    if (stage === 'repairTesting') {
      if (repairPhaseTime >= 3.0) {
        showRetestForm();
      }
    }
  }
  
  // ==========================================================
  // COMPACTACIÓN INICIAL DE LA BASE GRANULAR
  // ==========================================================
  
  
  function updateProgress() {
    if (stage === 'repairRecompact') {
      updateRepairPassProgress();
      return;
    }
  
    if (
      stage === 'paving' ||
      stage === 'asphaltRolling' ||
      stage === 'asphaltFinished'
    ) {
      return;
    }
  
    const fraction = Math.min(completedPasses / Math.max(passes, 1), 1);
    $('progress-title').textContent = 'PASADAS';
    $('pass-counter').textContent = `${completedPasses} / ${passes}`;
    $('progress-fill').style.width = `${fraction * 100}%`;
    $('progress-caption').textContent = simulationFinished
      ? 'Base granular evaluada'
      : (isRunning ? `Recorrido ${completedPasses + 1} de ${passes}` : geoData.referencia);
  }
  
  function finishInitialCompaction() {
    if (simulationFinished) return;
  
    isRunning = false;
    simulationFinished = true;
    stage = 'base';
  
    startButton.disabled = false;
    startButton.textContent = '▶ REPETIR COMPACTACIÓN';
  
    clearFailureVisuals();
  
    if (currentGrade >= minimumGrade) {
      showSuccess();
    } else {
      showFailure();
    }
  
    updateProgress();
  }
  
  function animateInitialCompaction(delta) {
    const speed = 15.5;
    const step = speed * Math.min(delta, 0.05);
    const oldZ = roller.position.z;
    const nextZ = oldZ + step * direction;
    let movedDistance = Math.abs(nextZ - oldZ);
  
    if (direction > 0 && nextZ >= ROAD.endZ) {
      movedDistance = Math.abs(ROAD.endZ - oldZ);
      roller.position.z = ROAD.endZ;
      completedPasses += 1;
  
      if (completedPasses >= passes) {
        updateProgress();
        finishInitialCompaction();
        return;
      }
      direction = -1;
    } else if (direction < 0 && nextZ <= ROAD.startZ) {
      movedDistance = Math.abs(ROAD.startZ - oldZ);
      roller.position.z = ROAD.startZ;
      completedPasses += 1;
  
      if (completedPasses >= passes) {
        updateProgress();
        finishInitialCompaction();
        return;
      }
      direction = 1;
    } else {
      roller.position.z = nextZ;
    }
  
    roller.position.y = BASE_TOP + Math.sin(performance.now() * 0.025) * 0.018;
    for (const part of rotatingParts) {
      part.object.rotation.x -= (movedDistance / part.radius) * direction;
    }
    updateProgress();
  }
  
  // ==========================================================
  // CIRCULACIÓN DE VEHÍCULOS COMO SEÑAL VISUAL DE APROBACIÓN
  // ==========================================================
  
  function startTraffic() {
    trafficCars.forEach((car, index) => {
      car.group.visible = true;
      car.group.position.set(
        car.lane,
        ASPHALT_TOP,
        ROAD.startZ + index * 18
      );
    });
  }
  
  function animateTrafficCars(delta) {
    if (stage !== 'asphaltFinished') return;
  
    for (const car of trafficCars) {
      car.group.position.z += car.speed * car.direction * Math.min(delta, 0.05);
  
      if (car.direction > 0 && car.group.position.z > ROAD.endZ + 7) {
        car.group.position.z = ROAD.startZ - 7;
      } else if (car.direction < 0 && car.group.position.z < ROAD.startZ - 7) {
        car.group.position.z = ROAD.endZ + 7;
      }
    }
  }
  
  // ==========================================================
  // INICIO, REINICIO Y EVENTOS DE INTERFAZ
  // ==========================================================
  
  function startSimulation() {
    if (isRunning) return;
  
    resetAsphaltStage();
    resetRepairEquipment();
    calculateMetrics();
    clearFailureVisuals();
  
    statusBox.className = '';
    statusBox.style.display = 'none';
    statusBox.innerHTML = '';
  
    isRunning = true;
    simulationFinished = false;
    completedPasses = 0;
    direction = 1;
    stage = 'base';
  
    roller.position.set(0, BASE_TOP, ROAD.startZ);
    roller.visible = true;
    roller.rotation.set(0, 0, 0);
    rotatingParts.forEach(({ object }) => {
      object.rotation.x = 0;
    });
  
    startButton.disabled = true;
    startButton.textContent = 'COMPACTANDO BASE GRANULAR...';
  
    $('progress-title').textContent = 'PASADAS';
    $('progress-caption').textContent = 'Compactando base granular';
    updateProgress();
  }
  
  
  // ==========================================================
  // COLOCACIÓN Y COMPACTACIÓN DE LA CARPETA ASFÁLTICA
  // ==========================================================
  
  function startAsphaltStage() {
    if (isRunning || currentGrade < minimumGrade) return;
  
    clearFailureVisuals();
    resetRepairEquipment();
  
    stage = 'paving';
    isRunning = true;
    simulationFinished = false;
    pavingProgress = 0;
  
    asphaltChunks.forEach(item => {
      item.mesh.visible = false;
      item.mesh.material = asphaltFreshMaterial;
      item.compacted = false;
    });
  
    roadMarkings.visible = false;
    trafficCars.forEach(car => { car.group.visible = false; });
  
    asphaltPaver.position.set(0, BASE_TOP, ROAD.startZ + 3);
    asphaltPaver.visible = true;
  
    asphaltRoller.position.set(0, ASPHALT_TOP, ROAD.startZ - 8);
    asphaltRoller.visible = false;
    asphaltRollerParts.forEach(({ object }) => {
      object.rotation.x = 0;
    });
  
    startButton.disabled = true;
    startButton.textContent = 'COLOCANDO CARPETA ASFÁLTICA...';
  
    statusBox.className = 'good';
    statusBox.style.display = 'block';
    statusBox.innerHTML = `
      <h3>ETAPA 2 · COLOCACIÓN DE CARPETA ASFÁLTICA</h3>
      <p>La base granular alcanzó el grado exigido. La pavimentadora comienza a extender la mezcla asfáltica y el rodillo tándem compactará detrás de ella.</p>
      <p id="asphalt-stage-status"><strong>Estado:</strong> extendido de mezcla en ejecución.</p>
      <p class="small-note">Representación didáctica: la obra real requiere controles independientes de mezcla, temperatura, espesor y densidad.</p>
    `;
  
    $('progress-title').textContent = 'ASFALTO';
    $('pass-counter').textContent = '0 %';
    $('progress-fill').style.width = '0%';
    $('progress-caption').textContent = 'Pavimentadora extendiendo mezcla';
  }
  
  function revealAsphaltBehindPaver() {
    const screedZ = asphaltPaver.position.z - 2.4;
  
    for (const item of asphaltChunks) {
      if (item.centerZ <= screedZ + 0.2) {
        item.mesh.visible = true;
        item.mesh.material = asphaltFreshMaterial;
      }
    }
  }
  
  function compactAsphaltBehindRoller() {
    const rearEdge = asphaltRoller.position.z - 1.9;
  
    for (const item of asphaltChunks) {
      if (item.mesh.visible && !item.compacted && item.centerZ <= rearEdge) {
        item.mesh.material = asphaltMaterial;
        item.compacted = true;
      }
    }
  }
  
  function animateAsphaltStage(delta) {
    const step = 6.5 * Math.min(delta, 0.05);
  
    if (stage === 'paving') {
      asphaltPaver.position.z = Math.min(
        ROAD.endZ + 3,
        asphaltPaver.position.z + step
      );
  
      revealAsphaltBehindPaver();
  
      const targetRollerZ = asphaltPaver.position.z - 8;
      if (targetRollerZ >= ROAD.startZ - 0.5) {
        asphaltRoller.visible = true;
        const oldZ = asphaltRoller.position.z;
        asphaltRoller.position.z = Math.max(
          oldZ,
          Math.min(targetRollerZ, ROAD.endZ)
        );
  
        const distance = asphaltRoller.position.z - oldZ;
        for (const part of asphaltRollerParts) {
          part.object.rotation.x -= distance / part.radius;
        }
        compactAsphaltBehindRoller();
      }
  
      pavingProgress = Math.min(
        100,
        ((asphaltPaver.position.z - (ROAD.startZ + 3)) / ROAD.length) * 100
      );
  
      $('pass-counter').textContent = `${Math.round(pavingProgress)} %`;
      $('progress-fill').style.width = `${pavingProgress}%`;
      $('progress-caption').textContent = 'Pavimentadora extendiendo mezcla';
  
      if (asphaltPaver.position.z >= ROAD.endZ + 2.95) {
        stage = 'asphaltRolling';
        asphaltPaver.visible = false;
        asphaltRoller.visible = true;
  
        const label = $('asphalt-stage-status');
        if (label) {
          label.innerHTML = '<strong>Estado:</strong> rodillo tándem completando la compactación de la carpeta asfáltica.';
        }
  
        $('progress-caption').textContent = 'Rodillo tándem compactando';
      }
      return;
    }
  
    if (stage === 'asphaltRolling') {
      const oldZ = asphaltRoller.position.z;
      asphaltRoller.position.z = Math.min(
        ROAD.endZ + 2.5,
        oldZ + step * 1.15
      );
  
      const distance = asphaltRoller.position.z - oldZ;
      for (const part of asphaltRollerParts) {
        part.object.rotation.x -= distance / part.radius;
      }
  
      compactAsphaltBehindRoller();
  
      pavingProgress = Math.min(
        100,
        88 + ((asphaltRoller.position.z - (ROAD.endZ - 8)) / 10) * 12
      );
  
      $('pass-counter').textContent = `${Math.round(pavingProgress)} %`;
      $('progress-fill').style.width = `${pavingProgress}%`;
      $('progress-caption').textContent = 'Compactación final del asfalto';
  
      if (asphaltRoller.position.z >= ROAD.endZ + 2.45) {
        finishAsphaltStage();
      }
    }
  }
  
  function finishAsphaltStage() {
    stage = 'asphaltFinished';
    isRunning = false;
    simulationFinished = true;
  
    asphaltChunks.forEach(item => {
      item.mesh.visible = true;
      item.mesh.material = asphaltMaterial;
      item.compacted = true;
    });
  
    roadMarkings.visible = true;
    asphaltRoller.visible = false;
    asphaltPaver.visible = false;
    startTraffic();
  
    statusBox.className = 'good';
    statusBox.style.display = 'block';
    statusBox.innerHTML = `
      <div class="big-check">✓</div>
      <h3>¡VÍA HABILITADA PARA EL TRÁNSITO!</h3>
      <p>La carpeta asfáltica fue extendida y compactada en esta representación didáctica.</p>
      <p><strong>La circulación de vehículos representa la aprobación visual de la secuencia simulada.</strong></p>
      <p class="small-note">En una obra real, la habilitación requiere los controles y tiempos de apertura especificados para la mezcla asfáltica. Esta animación no sustituye ensayos de densidad, temperatura, espesor ni aceptación de obra.</p>
    `;
  
    startButton.disabled = false;
    startButton.textContent = '✓ PROCESO COMPLETADO';
    $('progress-title').textContent = 'ASFALTO';
    $('pass-counter').textContent = '100 %';
    $('progress-fill').style.width = '100%';
    $('progress-caption').textContent = 'Carpeta asfáltica terminada';
  }
  
  // Los controles se conectan después de crear toda la interfaz.
  startButton.addEventListener('click', startSimulation);
  resetButton.addEventListener('click', resetSimulation);
  
  $('minimumInput').addEventListener('change', () => {
    if (isRunning) return;
    geoData.exigencia = numeric($('minimumInput').value, defaults.exigencia);
    calculateMetrics();
  });
  
  $('passesInput').addEventListener('change', () => {
    if (isRunning) return;
    geoData.pasadas = numeric($('passesInput').value, defaults.pasadas);
    calculateMetrics();
    updateProgress();
  });
  
  $('thicknessInput').addEventListener('change', () => {
    if (isRunning) return;
    geoData.espesorCm = numeric($('thicknessInput').value, defaults.espesorCm);
    $('thicknessInput').value = geoData.espesorCm;
  });
  
  // ==========================================================
  // SINCRONIZACIÓN CON COMPACTA LAB 360 / GOOGLE COLAB
  // ==========================================================
  
  function readUrlParameters() {
    const params = Object.fromEntries(new URLSearchParams(window.location.search).entries());
    return parseIncoming(params);
  }
  
  const initialIncoming = readUrlParameters();
  if (Object.keys(initialIncoming).length > 0) {
    applyIncomingData(initialIncoming, 'parámetros recibidos desde COMPACTA LAB 360');
  } else {
    calculateMetrics();
    resetSimulation();
    syncIndicator.textContent = 'Parámetros predeterminados · esperando COMPACTA LAB 360';
  }
  
  window.addEventListener('message', (event) => {
    if (event.source !== window.parent) return;
    if (!event.data || typeof event.data !== 'object') return;
    if (!['GEOCOMPACT_UPDATE', 'GEOCOMPACT_DATA'].includes(event.data.type)) return;
  
    const payload =
      event.data.params ||
      event.data.data ||
      event.data.payload ||
      {};
  
    const incoming = parseIncoming(payload);
    if (Object.keys(incoming).length > 0) {
      applyIncomingData(incoming, 'actualización recibida desde COMPACTA LAB 360');
    }
  });
  
  if (window.parent !== window) {
    window.parent.postMessage({ type: 'ROAD_SIMULATOR_READY' }, '*');
  }
  
  // ==========================================================
  // BUCLE PRINCIPAL DE THREE.JS
  // ==========================================================
  
  function animate() {
    requestAnimationFrame(animate);
  
    clock.update();
    const delta = clock.getDelta();
  
    controls.update();
  
    if (isRunning) {
      if (
        stage === 'repairScarify' ||
        stage === 'repairWater' ||
        stage === 'repairDry' ||
        stage === 'repairGrade' ||
        stage === 'repairRecompact' ||
        stage === 'repairTesting'
      ) {
        animateRepairStage(delta);
      } else if (stage === 'paving' || stage === 'asphaltRolling') {
        animateAsphaltStage(delta);
      } else if (stage === 'base') {
        animateInitialCompaction(delta);
      }
    }
  
    animateTrafficCars(delta);
    renderer.render(scene, camera);
  }
  
  animate();
  
  // ==========================================================
  // AJUSTE RESPONSIVE
  // ==========================================================
  
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  });
  
  // Mensaje inicial en la interfaz.
  syncIndicator.textContent =
    syncIndicator.textContent || 'Escena 3D lista · esperando parámetros';