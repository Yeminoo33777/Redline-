let scene, camera, renderer;
let player;
let keys = {};
let velocity = new THREE.Vector3();
let canJump = false;

let hp = 100;
let kills = 0;

let ammo = 30;
let maxAmmo = 30;
let reloading = false;

let enemies = [];
let mapObjects = [];

// --- NEW: Gun and bullet variables ---
let gunModel;
let bullets = [];
const bulletSpeed = 1.5;
const bulletLifetime = 200;
// -------------------------------------

// --- NEW: Animation time for enemy limbs ---
let animationTime = 0;
// ------------------------------------------

// ===== SOUND ADDITION =====
let shootSound, playerHitSound, botHitSound, reloadSound;
let playerWalkSound, botWalkSound;
// ==========================

// ===== NEW: Hit effect functions =====
function flashPart(part) {
  if (!part || !part.material) return;
  
  if (part.userData.flashTimeout) {
    clearTimeout(part.userData.flashTimeout);
  }
  
  if (!part.userData.originalColor) {
    part.userData.originalColor = part.material.color.getHex();
  }
  
  part.material.color.setHex(0xffffff);
  
  part.userData.flashTimeout = setTimeout(() => {
    part.material.color.setHex(part.userData.originalColor);
    part.userData.flashTimeout = null;
  }, 80);
}

function flashEnemy(enemy) {
  flashPart(enemy);
  flashPart(enemy.head);
  flashPart(enemy.leftArm);
  flashPart(enemy.rightArm);
  flashPart(enemy.leftLeg);
  flashPart(enemy.rightLeg);
}

function clearEnemyTimeouts(enemy) {
  const parts = [enemy, enemy.head, enemy.leftArm, enemy.rightArm, enemy.leftLeg, enemy.rightLeg];
  parts.forEach(part => {
    if (part && part.userData && part.userData.flashTimeout) {
      clearTimeout(part.userData.flashTimeout);
      part.userData.flashTimeout = null;
    }
  });
}
// =====================================

// ===== NEW: Red screen flash on player death =====
function showHitEffect() {
  const overlay = document.getElementById("hitOverlay");
  overlay.style.display = "block";
  setTimeout(() => {
    overlay.style.display = "none";
  }, 200);
}
// =================================================

// ===== NEW: Enemy dimensions for collision =====
const ENEMY_WIDTH = 2.0;
const ENEMY_HEIGHT = 2.0;
const ENEMY_DEPTH = 2.0;
// ===============================================

const playBtn = document.getElementById("playBtn");
const menu = document.getElementById("menu");

const hpText = document.getElementById("hp");
const ammoText = document.getElementById("ammo");
const killsText = document.getElementById("kills");

const raycaster = new THREE.Raycaster();

let isMouseDown = false;
let autoShootInterval = null;
const autoShootDelay = 150;

// ---------- SCOPE VARIABLES ----------
let scopeActive = false;
let originalFOV = 75;
// -------------------------------------

// ===== NEW UI ELEMENTS =====
const healthBarFill = document.getElementById("healthBarFill");
const healthText = document.getElementById("healthText");
const ammoCountSpan = document.getElementById("ammoCount");
const botCountDisplay = document.getElementById("botCountDisplay");
const minimapCanvas = document.getElementById("minimapCanvas");
const minimapCtx = minimapCanvas.getContext("2d");
// ============================

let lastDamageTime = 0;

const PLAYER_WIDTH = 1.0;
const PLAYER_DEPTH = 1.0;
const PLAYER_HEIGHT = 2.0;

let gameActive = true;
const retryMenu = document.getElementById("retryMenu");
const retryBtn = document.getElementById("retryBtn");
const finalKillsSpan = document.getElementById("finalKills");

let playerMoving = false;
let footstepFrameCounter = 0;
const FOOTSTEP_INTERVAL = 20;

// --- Bullet mesh ---
function createBulletMesh() {
  const group = new THREE.Group();

  const casingGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.4, 8);
  const casingMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8, roughness: 0.2 });
  const casing = new THREE.Mesh(casingGeo, casingMat);
  casing.position.y = 0;
  group.add(casing);

  const tipGeo = new THREE.ConeGeometry(0.1, 0.2, 8);
  const tipMat = new THREE.MeshStandardMaterial({ color: 0xcc9966, metalness: 0.6, roughness: 0.3 });
  const tip = new THREE.Mesh(tipGeo, tipMat);
  tip.position.y = 0.3;
  group.add(tip);

  const ringGeo = new THREE.TorusGeometry(0.1, 0.02, 4, 8, Math.PI / 2);
  const ringMat = new THREE.MeshStandardMaterial({ color: 0xbb8833, metalness: 0.7 });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -0.2;
  group.add(ring);

  return group;
}

playBtn.onclick = () => {
  menu.style.display = "none";
  startGame();
};

retryBtn.onclick = () => {
  location.reload();
};

function startGame() {
  init();
  animate();
  document.body.requestPointerLock();

  shootSound = new Audio('sounds/shoot.mp3');
  playerHitSound = new Audio('sounds/playerhit.mp3');
  botHitSound = new Audio('sounds/bothit.mp3');
  reloadSound = new Audio('sounds/reload.mp3');
  playerWalkSound = new Audio('sounds/player_walk.mp3');
  botWalkSound = new Audio('sounds/bot_walk.mp3');
  [shootSound, playerHitSound, botHitSound, reloadSound, playerWalkSound, botWalkSound].forEach(s => {
    if (s) {
      s.load();
      s.volume = 0.5;
    }
  });
}

function createCylinderBetween(point1, point2, radius, color, materialType = 'standard') {
  const start = new THREE.Vector3(point1.x, point1.y, point1.z);
  const end = new THREE.Vector3(point2.x, point2.y, point2.z);
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = direction.length();

  const cylinderGeo = new THREE.CylinderGeometry(radius, radius, length, 8);
  const material = new THREE.MeshStandardMaterial({ color: color });
  const cylinder = new THREE.Mesh(cylinderGeo, material);

  const midPoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
  cylinder.position.copy(midPoint);

  cylinder.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.clone().normalize()
  );

  return cylinder;
}

function createFirstPersonArms() {
  const armsGroup = new THREE.Group();

  const rightShoulder = new THREE.Vector3(0.30, -0.20, -0.10);
  const leftShoulder  = new THREE.Vector3(-0.30, -0.20, -0.10);

  const rightHandPos = new THREE.Vector3(0.45, -0.55, -0.70);
  const leftHandPos  = new THREE.Vector3(0.40, -0.40, -1.30);

  const rightElbow = new THREE.Vector3(0.40, -0.40, -0.40);
  const rightUpper = createCylinderBetween(rightShoulder, rightElbow, 0.12, 0xffccaa);
  armsGroup.add(rightUpper);

  const rightForearm = createCylinderBetween(rightElbow, rightHandPos, 0.10, 0xffccaa);
  armsGroup.add(rightForearm);

  const rightHandGeo = new THREE.SphereGeometry(0.15, 8, 8);
  const rightHandMat = new THREE.MeshStandardMaterial({ color: 0xffccaa });
  const rightHand = new THREE.Mesh(rightHandGeo, rightHandMat);
  rightHand.position.copy(rightHandPos);
  armsGroup.add(rightHand);
  armsGroup.userData.rightHand = rightHand;

  const leftElbow = new THREE.Vector3(-0.20, -0.35, -0.70);
  const leftUpper = createCylinderBetween(leftShoulder, leftElbow, 0.12, 0xffccaa);
  armsGroup.add(leftUpper);

  const leftForearm = createCylinderBetween(leftElbow, leftHandPos, 0.10, 0xffccaa);
  armsGroup.add(leftForearm);

  const leftHandGeo = new THREE.SphereGeometry(0.15, 8, 8);
  const leftHandMat = new THREE.MeshStandardMaterial({ color: 0xffccaa });
  const leftHand = new THREE.Mesh(leftHandGeo, leftHandMat);
  leftHand.position.copy(leftHandPos);
  armsGroup.add(leftHand);

  const sleeveMat = new THREE.MeshStandardMaterial({ color: 0x445566 });
  const rightSleeve = createCylinderBetween(rightShoulder, rightElbow, 0.14, 0x445566);
  const leftSleeve  = createCylinderBetween(leftShoulder, leftElbow, 0.14, 0x445566);
  armsGroup.add(rightSleeve);
  armsGroup.add(leftSleeve);

  return armsGroup;
}

function createAK47() {
  const group = new THREE.Group();

  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.4, metalness: 0.6 });
  const lightMetal = new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.3, metalness: 0.7 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.8 });
  const black = new THREE.MeshStandardMaterial({ color: 0x111111 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.9), darkMetal);
  body.position.set(0.1, -0.1, -0.4);
  group.add(body);

  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.25, 0.6), wood);
  stock.position.set(0.1, -0.1, 0.1);
  group.add(stock);

  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.35, 0.2), wood);
  grip.position.set(0.15, -0.35, -0.2);
  grip.rotation.x = 0.2;
  group.add(grip);

  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, 0.15), darkMetal);
  mag.position.set(0.05, -0.45, -0.45);
  group.add(mag);

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.2), lightMetal);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0.1, -0.05, -1.1);
  group.add(barrel);

  const gasTube = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.8), darkMetal);
  gasTube.rotation.x = Math.PI / 2;
  gasTube.position.set(0.1, 0.1, -0.9);
  group.add(gasTube);

  const frontSight = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.1), black);
  frontSight.position.set(0.1, 0.15, -1.25);
  group.add(frontSight);

  const rearSight = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), black);
  rearSight.position.set(0.1, 0.1, -0.65);
  group.add(rearSight);

  const handguardLow = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.15, 0.5), wood);
  handguardLow.position.set(0.1, -0.2, -0.8);
  group.add(handguardLow);

  const handguardUp = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.5), wood);
  handguardUp.position.set(0.1, 0.05, -0.8);
  group.add(handguardUp);

  const scopeGroup = new THREE.Group();

  const tubeGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.5, 8);
  tubeGeo.rotateX(Math.PI / 2);
  const tubeMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.3, metalness: 0.7 });
  const tube = new THREE.Mesh(tubeGeo, tubeMat);
  tube.position.set(0, 0, 0);
  scopeGroup.add(tube);

  const ringGeo = new THREE.TorusGeometry(0.12, 0.03, 8, 12, Math.PI / 2);
  ringGeo.rotateY(Math.PI / 2);
  const ringMat = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.4, metalness: 0.6 });
  const ringFront = new THREE.Mesh(ringGeo, ringMat);
  ringFront.position.set(0, 0, 0.25);
  scopeGroup.add(ringFront);

  const ringRear = new THREE.Mesh(ringGeo, ringMat);
  ringRear.position.set(0, 0, -0.25);
  scopeGroup.add(ringRear);

  const lensGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.02, 8);
  lensGeo.rotateX(Math.PI / 2);
  const lensMat = new THREE.MeshStandardMaterial({ color: 0x88aaff, emissive: 0x112233, transparent: true, opacity: 0.6 });
  const lensFront = new THREE.Mesh(lensGeo, lensMat);
  lensFront.position.set(0, 0, 0.3);
  scopeGroup.add(lensFront);

  const lensRear = new THREE.Mesh(lensGeo, lensMat);
  lensRear.position.set(0, 0, -0.3);
  scopeGroup.add(lensRear);

  const mountGeo = new THREE.BoxGeometry(0.2, 0.1, 0.3);
  const mountMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
  const mount = new THREE.Mesh(mountGeo, mountMat);
  mount.position.set(0, -0.15, 0);
  scopeGroup.add(mount);

  scopeGroup.position.set(0.1, 0.25, -0.5);
  group.add(scopeGroup);

  return group;
}

function decorateEnemy(enemy) {
  const headGeo = new THREE.SphereGeometry(0.5);
  const headMat = new THREE.MeshStandardMaterial({ color: 0xffccaa });
  const head = new THREE.Mesh(headGeo, headMat);
  head.position.set(0, 1.5, 0);
  enemy.add(head);
  head.userData.originalColor = 0xffccaa;
  enemy.head = head;

  const armMat = new THREE.MeshStandardMaterial({ color: 0xff0000 });
  const armGeo = new THREE.BoxGeometry(0.6, 1.2, 0.6);
  
  const leftArm = new THREE.Mesh(armGeo, armMat);
  leftArm.position.set(-1.2, 0.5, 0);
  enemy.add(leftArm);
  leftArm.userData.originalColor = 0xff0000;
  enemy.leftArm = leftArm;
  
  const rightArm = new THREE.Mesh(armGeo, armMat);
  rightArm.position.set(1.2, 0.5, 0);
  enemy.add(rightArm);
  rightArm.userData.originalColor = 0xff0000;
  enemy.rightArm = rightArm;

  const legMat = new THREE.MeshStandardMaterial({ color: 0xff0000 });
  const legGeo = new THREE.BoxGeometry(0.6, 1.2, 0.6);
  
  const leftLeg = new THREE.Mesh(legGeo, legMat);
  leftLeg.position.set(-0.5, -1.2, 0);
  enemy.add(leftLeg);
  leftLeg.userData.originalColor = 0xff0000;
  enemy.leftLeg = leftLeg;
  
  const rightLeg = new THREE.Mesh(legGeo, legMat);
  rightLeg.position.set(0.5, -1.2, 0);
  enemy.add(rightLeg);
  rightLeg.userData.originalColor = 0xff0000;
  enemy.rightLeg = rightLeg;

  enemy.userData.originalColor = 0xff0000;

  const knifeGroup = new THREE.Group();
  
  const handleGeo = new THREE.BoxGeometry(0.2, 0.3, 0.8);
  const handleMat = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
  const handle = new THREE.Mesh(handleGeo, handleMat);
  handle.position.set(0, 0, 0);
  knifeGroup.add(handle);
  
  const bladeGeo = new THREE.BoxGeometry(0.1, 0.1, 1.2);
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0xcccccc });
  const blade = new THREE.Mesh(bladeGeo, bladeMat);
  blade.position.set(0, 0, 0.9);
  knifeGroup.add(blade);
  
  knifeGroup.position.set(0.3, 0, 0.2);
  rightArm.add(knifeGroup);
}

function createGroundTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#3c5e3c';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < 300; i++) {
    ctx.fillStyle = `rgba(80, 45, 20, ${Math.random() * 0.4})`;
    ctx.beginPath();
    ctx.arc(
      Math.random() * canvas.width,
      Math.random() * canvas.height,
      Math.random() * 20 + 5,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }

  ctx.strokeStyle = '#5f8b5f';
  ctx.lineWidth = 2;
  for (let i = 0; i < 1000; i++) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (Math.random() - 0.5) * 10, y - Math.random() * 15);
    ctx.stroke();
  }

  ctx.fillStyle = '#2d4a2d';
  for (let i = 0; i < 200; i++) {
    ctx.beginPath();
    ctx.arc(
      Math.random() * canvas.width,
      Math.random() * canvas.height,
      Math.random() * 15 + 2,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    if (Math.random() < 0.05) {
      data[i] = Math.min(255, data[i] + 30);
      data[i+1] = Math.min(255, data[i+1] + 30);
      data[i+2] = Math.min(255, data[i+2] + 30);
    }
  }
  ctx.putImageData(imageData, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(50, 50);
  return texture;
}

function addGroundDecorations() {
  const decorationGroup = new THREE.Group();
  const grassColor1 = 0x3a7734;
  const grassColor2 = 0x5a8f4c;
  const rockColor = 0x6b5e4a;

  for (let i = 0; i < 600; i++) {
    const x = (Math.random() - 0.5) * 480;
    const z = (Math.random() - 0.5) * 480;
    const y = 0.05;

    if (Math.random() < 0.7) {
      const height = Math.random() * 0.4 + 0.2;
      const radius = Math.random() * 0.1 + 0.05;
      const geo = new THREE.CylinderGeometry(radius, radius * 1.2, height, 5);
      const mat = new THREE.MeshStandardMaterial({ color: Math.random() < 0.5 ? grassColor1 : grassColor2 });
      const tuft = new THREE.Mesh(geo, mat);
      tuft.position.set(x, y + height/2, z);
      tuft.rotation.y = Math.random() * Math.PI;
      decorationGroup.add(tuft);
    } else {
      const size = Math.random() * 0.2 + 0.1;
      let geo;
      if (Math.random() < 0.5) {
        geo = new THREE.DodecahedronGeometry(size);
      } else {
        geo = new THREE.BoxGeometry(size, size * 0.6, size);
      }
      const mat = new THREE.MeshStandardMaterial({ color: rockColor, roughness: 0.8 });
      const rock = new THREE.Mesh(geo, mat);
      rock.position.set(x, y + size/2, z);
      rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      decorationGroup.add(rock);
    }
  }

  scene.add(decorationGroup);
}

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x222222);

  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    2000
  );

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.position.set(20, 50, 20);
  scene.add(sun);

  const ambient = new THREE.AmbientLight(0xffffff, 0.4);
  scene.add(ambient);

  const groundTexture = createGroundTexture();
  const groundMaterial = new THREE.MeshStandardMaterial({ map: groundTexture });
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(500, 500),
    groundMaterial
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  mapObjects.push(ground);

  addGroundDecorations();

  player = new THREE.Object3D();
  player.position.set(0, 2, 10);
  scene.add(player);
  player.add(camera);

  const arms = createFirstPersonArms();
  camera.add(arms);

  gunModel = createAK47();
  gunModel.position.set(-0.15, 0.35, 0.2);
  gunModel.rotation.set(0, 0, 0);
  arms.userData.rightHand.add(gunModel);

  createBlock(0, 1, -20, 20, 2, 5);
  createBlock(15, 2, -40, 6, 4, 10);
  createBlock(-15, 2, -40, 6, 4, 10);
  createBlock(0, 5, -70, 30, 10, 5);
  createBlock(20, 1, -90, 10, 2, 20);
  createBlock(-20, 1, -90, 10, 2, 20);

  for (let i = 0; i < 6; i++) spawnEnemy();

  window.addEventListener("resize", resizeWindow);

  document.addEventListener("keydown", (e) => keys[e.code] = true);
  document.addEventListener("keyup", (e) => keys[e.code] = false);

  document.addEventListener("mousemove", mouseLook);
  
  document.addEventListener("mousedown", startAutoShoot);
  document.addEventListener("mouseup", stopAutoShoot);
  document.addEventListener("mouseleave", stopAutoShoot);

  document.addEventListener("mousedown", onRightMouseDown);
  document.addEventListener("mouseup", onRightMouseUp);
  document.addEventListener("mouseleave", deactivateScope);
  document.addEventListener("contextmenu", (e) => e.preventDefault());

  document.addEventListener("keydown", (e) => {
    if (e.code === "KeyR") reload();
  });

  updateHUD();
}

function onRightMouseDown(e) {
  if (e.button !== 2) return;
  if (document.pointerLockElement !== document.body) return;
  e.preventDefault();
  activateScope();
}

function onRightMouseUp(e) {
  if (e.button !== 2) return;
  deactivateScope();
}

function activateScope() {
  if (scopeActive) return;
  scopeActive = true;
  originalFOV = camera.fov;
  camera.fov = 40;
  camera.updateProjectionMatrix();
  document.getElementById("scopeOverlay").style.display = "block";
}

function deactivateScope() {
  if (!scopeActive) return;
  scopeActive = false;
  camera.fov = originalFOV;
  camera.updateProjectionMatrix();
  document.getElementById("scopeOverlay").style.display = "none";
}

function startAutoShoot(event) {
  if (!gameActive) return;
  if (document.pointerLockElement !== document.body) return;
  if (event.button !== 0) return;
  
  isMouseDown = true;
  
  if (autoShootInterval) {
    clearInterval(autoShootInterval);
    autoShootInterval = null;
  }
  
  shoot();
  
  autoShootInterval = setInterval(() => {
    if (isMouseDown) {
      shoot();
    } else {
      stopAutoShoot();
    }
  }, autoShootDelay);
}

function stopAutoShoot() {
  isMouseDown = false;
  if (autoShootInterval) {
    clearInterval(autoShootInterval);
    autoShootInterval = null;
  }
}

function createBlock(x, y, z, w, h, d) {
  const block = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color: 0x00ccff })
  );

  block.position.set(x, y, z);
  scene.add(block);
  mapObjects.push(block);
}

function spawnEnemy() {
  const enemy = new THREE.Mesh(
    new THREE.BoxGeometry(2, 2, 2),
    new THREE.MeshStandardMaterial({ color: 0xff0000 })
  );

  enemy.position.set(
    (Math.random() * 80) - 40,
    1,
    (Math.random() * -150) - 30
  );

  enemy.health = 3;
  enemies.push(enemy);
  scene.add(enemy);
  
  decorateEnemy(enemy);
  
  enemy.userData.lastFootstep = 0;
}

function updateHUD() {
  hpText.innerText = "HP: " + Math.floor(hp);
  killsText.innerText = "Kills: " + kills;
  
  const healthPercent = Math.max(0, hp) / 100;
  healthBarFill.style.width = (healthPercent * 100) + "%";
  healthText.innerText = Math.floor(hp) + " HP";
  
  if (reloading) {
    ammoText.innerText = "Reloading...";
    ammoCountSpan.innerText = "Reloading...";
  } else {
    ammoText.innerText = `Ammo: ${ammo} / ${maxAmmo}`;
    ammoCountSpan.innerText = `${ammo} / ${maxAmmo}`;
  }
  
  botCountDisplay.innerText = enemies.length + " alive";
  
  document.getElementById("botKillsDisplay").innerText = "💀 Kills: " + kills;
}

let yaw = 0;
let pitch = 0;

function mouseLook(event) {
  if (!gameActive) return;
  if (document.pointerLockElement !== document.body) return;

  yaw -= event.movementX * 0.002;
  pitch -= event.movementY * 0.002;

  pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch));

  player.rotation.y = yaw;
  camera.rotation.x = pitch;
}

function shoot() {
  if (!gameActive) return;
  if (document.pointerLockElement !== document.body) return;
  if (reloading) return;
  if (ammo <= 0) return;

  if (shootSound) {
    shootSound.currentTime = 0;
    shootSound.play().catch(() => {});
  }

  ammo--;
  updateHUD();

  if (ammo === 0) {
    reload();
  }

  const bullet = createBulletMesh();

  const startPos = camera.getWorldPosition(new THREE.Vector3());
  const direction = new THREE.Vector3();
  camera.getWorldDirection(direction);
  bullet.position.copy(startPos).add(direction.clone().multiplyScalar(1.5));

  bullet.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());

  scene.add(bullet);

  bullets.push({
    mesh: bullet,
    direction: direction.clone(),
    distanceTraveled: 0,
    life: 0
  });

  const flashGroup = new THREE.Group();
  const flashMat = new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0xff5500 });

  const core = new THREE.Mesh(new THREE.SphereGeometry(0.15, 6, 6), flashMat);
  flashGroup.add(core);

  for (let i = 0; i < 6; i++) {
    const spark = new THREE.Mesh(new THREE.SphereGeometry(0.08, 4, 4), flashMat);
    spark.position.set(
      (Math.random() - 0.5) * 0.3,
      (Math.random() - 0.5) * 0.3,
      (Math.random() - 0.5) * 0.3
    );
    flashGroup.add(spark);
  }

  flashGroup.position.set(0.3, -0.2, -1.8);
  camera.add(flashGroup);

  setTimeout(() => {
    camera.remove(flashGroup);
  }, 80);
}

function reload() {
  if (!gameActive) return;
  if (reloading) return;
  if (ammo === maxAmmo) return;

  if (reloadSound) {
    reloadSound.currentTime = 0;
    reloadSound.play().catch(() => {});
  }

  reloading = true;
  updateHUD();

  setTimeout(() => {
    ammo = maxAmmo;
    reloading = false;
    updateHUD();
  }, 1200);
}

function handleCollisions() {
  const playerMinX = player.position.x - PLAYER_WIDTH/2;
  const playerMaxX = player.position.x + PLAYER_WIDTH/2;
  const playerMinY = player.position.y;
  const playerMaxY = player.position.y + PLAYER_HEIGHT;
  const playerMinZ = player.position.z - PLAYER_DEPTH/2;
  const playerMaxZ = player.position.z + PLAYER_DEPTH/2;

  for (let i = 0; i < mapObjects.length; i++) {
    const block = mapObjects[i];
    if (block.geometry.type === "PlaneGeometry") continue;

    const w = block.geometry.parameters.width / 2;
    const h = block.geometry.parameters.height / 2;
    const d = block.geometry.parameters.depth / 2;

    const blockMinX = block.position.x - w;
    const blockMaxX = block.position.x + w;
    const blockMinY = block.position.y - h;
    const blockMaxY = block.position.y + h;
    const blockMinZ = block.position.z - d;
    const blockMaxZ = block.position.z + d;

    if (playerMaxX > blockMinX && playerMinX < blockMaxX &&
        playerMaxY > blockMinY && playerMinY < blockMaxY &&
        playerMaxZ > blockMinZ && playerMinZ < blockMaxZ) {

      const overlapX = Math.min(playerMaxX - blockMinX, blockMaxX - playerMinX);
      const overlapY = Math.min(playerMaxY - blockMinY, blockMaxY - playerMinY);
      const overlapZ = Math.min(playerMaxZ - blockMinZ, blockMaxZ - playerMinZ);

      if (overlapX < overlapY && overlapX < overlapZ) {
        if (player.position.x < block.position.x)
          player.position.x -= overlapX;
        else
          player.position.x += overlapX;
      } else if (overlapY < overlapX && overlapY < overlapZ) {
        if (player.position.y < block.position.y) {
          player.position.y -= overlapY;
          velocity.y = 0;
          canJump = true;
        } else {
          player.position.y += overlapY;
          velocity.y = 0;
        }
      } else {
        if (player.position.z < block.position.z)
          player.position.z -= overlapZ;
        else
          player.position.z += overlapZ;
      }
    }
  }
}

function resolveEnemyCollisions(enemy) {
  const enemyMinX = enemy.position.x - ENEMY_WIDTH/2;
  const enemyMaxX = enemy.position.x + ENEMY_WIDTH/2;
  const enemyMinY = enemy.position.y - ENEMY_HEIGHT/2;
  const enemyMaxY = enemy.position.y + ENEMY_HEIGHT/2;
  const enemyMinZ = enemy.position.z - ENEMY_DEPTH/2;
  const enemyMaxZ = enemy.position.z + ENEMY_DEPTH/2;

  for (let i = 0; i < mapObjects.length; i++) {
    const block = mapObjects[i];
    if (block.geometry.type === "PlaneGeometry") continue;

    const w = block.geometry.parameters.width / 2;
    const h = block.geometry.parameters.height / 2;
    const d = block.geometry.parameters.depth / 2;

    const blockMinX = block.position.x - w;
    const blockMaxX = block.position.x + w;
    const blockMinY = block.position.y - h;
    const blockMaxY = block.position.y + h;
    const blockMinZ = block.position.z - d;
    const blockMaxZ = block.position.z + d;

    if (enemyMaxX > blockMinX && enemyMinX < blockMaxX &&
        enemyMaxY > blockMinY && enemyMinY < blockMaxY &&
        enemyMaxZ > blockMinZ && enemyMinZ < blockMaxZ) {

      const overlapX = Math.min(enemyMaxX - blockMinX, blockMaxX - enemyMinX);
      const overlapY = Math.min(enemyMaxY - blockMinY, blockMaxY - enemyMinY);
      const overlapZ = Math.min(enemyMaxZ - blockMinZ, blockMaxZ - enemyMinZ);

      if (overlapX < overlapY && overlapX < overlapZ) {
        if (enemy.position.x < block.position.x)
          enemy.position.x -= overlapX;
        else
          enemy.position.x += overlapX;
      } else if (overlapY < overlapX && overlapY < overlapZ) {
        if (enemy.position.y < block.position.y)
          enemy.position.y -= overlapY;
        else
          enemy.position.y += overlapY;
      } else {
        if (enemy.position.z < block.position.z)
          enemy.position.z -= overlapZ;
        else
          enemy.position.z += overlapZ;
      }
    }
  }
}

function updateMovement() {
  const baseSpeed = keys["ShiftLeft"] ? 0.28 : 0.18;
  const gravity = 0.012;
  const jumpPower = 0.35;

  const oldX = player.position.x;
  const oldZ = player.position.z;

  if (keys["KeyW"]) player.translateZ(-baseSpeed);
  if (keys["KeyS"]) player.translateZ(baseSpeed);
  if (keys["KeyA"]) player.translateX(-baseSpeed);
  if (keys["KeyD"]) player.translateX(baseSpeed);

  velocity.y -= gravity;
  player.position.y += velocity.y;

  if (player.position.y <= 2) {
    player.position.y = 2;
    velocity.y = 0;
    canJump = true;
  }

  if (keys["Space"] && canJump) {
    velocity.y = jumpPower;
    canJump = false;
  }

  handleCollisions();

  const moved = (oldX !== player.position.x || oldZ !== player.position.z);
  playerMoving = moved && canJump;
}

function enemyAI() {
  let attackingBotsCount = 0;
  enemies.forEach(enemy => {
    const oldPos = enemy.position.clone();

    const dirToPlayer = new THREE.Vector3().subVectors(player.position, enemy.position);
    const distToPlayer = dirToPlayer.length();
    dirToPlayer.normalize();

    raycaster.set(enemy.position, dirToPlayer);
    const intersects = raycaster.intersectObjects(mapObjects.filter(obj => obj.geometry.type !== "PlaneGeometry"));
    let blocked = false;
    if (intersects.length > 0) {
      const hit = intersects[0];
      if (hit.distance < distToPlayer) {
        blocked = true;
        const block = hit.object;

        const w = block.geometry.parameters.width / 2;
        const d = block.geometry.parameters.depth / 2;
        const blockPos = block.position;

        const normal = hit.face.normal.clone().applyQuaternion(block.quaternion);

        let tangent = new THREE.Vector3();
        if (Math.abs(normal.x) > 0.5) {
          const goPositiveZ = player.position.z > blockPos.z;
          tangent.set(0, 0, goPositiveZ ? 1 : -1);
        } else if (Math.abs(normal.z) > 0.5) {
          const goRight = player.position.x > blockPos.x;
          tangent.set(goRight ? 1 : -1, 0, 0);
        } else {
          tangent.set(player.position.x > blockPos.x ? 1 : -1, 0, 0);
        }

        const forward = dirToPlayer.clone(); forward.y = 0; forward.normalize();
        const moveDir = tangent.multiplyScalar(0.8).add(forward.multiplyScalar(0.2)).normalize();

        enemy.position.add(moveDir.multiplyScalar(0.04));
      }
    }

    if (!blocked) {
      enemy.position.add(dirToPlayer.multiplyScalar(0.04));
    }

    resolveEnemyCollisions(enemy);

    const moved = enemy.position.distanceTo(oldPos) > 0.01;
    if (moved && botWalkSound) {
      const distanceToPlayer = enemy.position.distanceTo(player.position);
      if (distanceToPlayer < 20) {
        const now = Date.now();
        if (!enemy.userData.lastFootstep || now - enemy.userData.lastFootstep > 400) {
          botWalkSound.currentTime = 0;
          botWalkSound.play().catch(() => {});
          enemy.userData.lastFootstep = now;
        }
      }
    }

    if (enemy.position.distanceTo(player.position) < 2) {
      attackingBotsCount++;
    }
  });

  if (attackingBotsCount > 0) {
    const now = Date.now();
    if (now - lastDamageTime > 500) {
      hp -= attackingBotsCount;
      if (playerHitSound) {
        playerHitSound.currentTime = 0;
        playerHitSound.play().catch(() => {});
      }
      lastDamageTime = now;
      updateHUD();

      if (hp <= 0) {
        showHitEffect();
        hp = 0;
        updateHUD();
        gameActive = false;
        document.exitPointerLock();
        finalKillsSpan.innerText = kills;
        retryMenu.style.display = 'flex';
        return;
      }
    }
  }
}

// ===== VICTORY HANDLER =====
function showVictory() {
  if (!gameActive) return;                // safety
  gameActive = false;
  document.exitPointerLock();

  // Modify the existing retry overlay to show victory
  const retryContent = document.getElementById("retryContent");
  retryContent.querySelector("h2").textContent = "🎉 Victory!";
  document.getElementById("finalKills").textContent = kills;
  retryContent.querySelector("button").textContent = "RESTART";
  retryMenu.style.display = 'flex';
}
// ===========================

function drawMinimap() {
  if (!player) return;
  
  const canvasSize = 200;
  const viewSize = 100;
  const scale = canvasSize / viewSize;
  
  minimapCtx.clearRect(0, 0, canvasSize, canvasSize);
  minimapCtx.fillStyle = "#1a1a2e";
  minimapCtx.fillRect(0, 0, canvasSize, canvasSize);
  
  minimapCtx.fillStyle = "#6688aa";
  mapObjects.forEach(obj => {
    if (obj === scene.children.find(c => c.geometry && c.geometry.type === "PlaneGeometry")) return;
    
    const blockPos = obj.position;
    const dx = blockPos.x - player.position.x;
    const dz = blockPos.z - player.position.z;
    
    if (Math.abs(dx) > viewSize/2 + 10 || Math.abs(dz) > viewSize/2 + 10) return;
    
    const canvasX = canvasSize/2 + dx * scale;
    const canvasY = canvasSize/2 - dz * scale;
    
    const geometry = obj.geometry;
    if (geometry && geometry.type === "BoxGeometry") {
      const blockWidth = geometry.parameters.width;
      const blockDepth = geometry.parameters.depth;
      const scaledWidth = blockWidth * scale;
      const scaledDepth = blockDepth * scale;
      
      minimapCtx.fillStyle = "#88aadd";
      minimapCtx.fillRect(canvasX - scaledWidth/2, canvasY - scaledDepth/2, scaledWidth, scaledDepth);
      minimapCtx.strokeStyle = "#00ccff";
      minimapCtx.lineWidth = 1;
      minimapCtx.strokeRect(canvasX - scaledWidth/2, canvasY - scaledDepth/2, scaledWidth, scaledDepth);
    } else {
      const fallbackSize = 5 * scale;
      minimapCtx.fillStyle = "#88aadd";
      minimapCtx.fillRect(canvasX - fallbackSize/2, canvasY - fallbackSize/2, fallbackSize, fallbackSize);
    }
  });
  
  minimapCtx.fillStyle = "#ff4444";
  enemies.forEach(enemy => {
    const dx = enemy.position.x - player.position.x;
    const dz = enemy.position.z - player.position.z;
    
    if (Math.abs(dx) > viewSize/2 || Math.abs(dz) > viewSize/2) return;
    
    const canvasX = canvasSize/2 + dx * scale;
    const canvasY = canvasSize/2 - dz * scale;
    
    minimapCtx.beginPath();
    minimapCtx.arc(canvasX, canvasY, 5, 0, 2*Math.PI);
    minimapCtx.fill();
    minimapCtx.strokeStyle = "white";
    minimapCtx.lineWidth = 1;
    minimapCtx.stroke();
  });
  
  minimapCtx.fillStyle = "#44ff44";
  minimapCtx.beginPath();
  minimapCtx.arc(canvasSize/2, canvasSize/2, 6, 0, 2*Math.PI);
  minimapCtx.fill();
  minimapCtx.strokeStyle = "white";
  minimapCtx.lineWidth = 2;
  minimapCtx.stroke();
  
  const dirX = -Math.sin(player.rotation.y) * 15;
  const dirY = -Math.cos(player.rotation.y) * 15;
  minimapCtx.strokeStyle = "#ffff44";
  minimapCtx.lineWidth = 2;
  minimapCtx.beginPath();
  minimapCtx.moveTo(canvasSize/2, canvasSize/2);
  minimapCtx.lineTo(canvasSize/2 + dirX * scale, canvasSize/2 - dirY * scale);
  minimapCtx.stroke();
}

function updateVisualUI() {
  updateHUD();
  drawMinimap();
}

function animate() {
  requestAnimationFrame(animate);

  if (gameActive) {
    updateMovement();
    enemyAI();
    
    animationTime += 0.02;
    const amplitude = 0.5;
    enemies.forEach(enemy => {
      if (enemy.leftArm && enemy.rightArm && enemy.leftLeg && enemy.rightLeg) {
        enemy.leftArm.rotation.x = Math.sin(animationTime) * amplitude;
        enemy.rightArm.rotation.x = Math.sin(animationTime + Math.PI) * amplitude;
        enemy.leftLeg.rotation.x = Math.sin(animationTime + Math.PI) * amplitude;
        enemy.rightLeg.rotation.x = Math.sin(animationTime) * amplitude;
      }
    });
    
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.life++;

      b.mesh.position.addScaledVector(b.direction, bulletSpeed);
      b.distanceTraveled += bulletSpeed;

      if (b.distanceTraveled > 200 || b.life > bulletLifetime) {
        scene.remove(b.mesh);
        bullets.splice(i, 1);
        continue;
      }

      let hit = false;
      for (let j = 0; j < enemies.length; j++) {
        const enemy = enemies[j];

        const headPos = new THREE.Vector3();
        enemy.head.getWorldPosition(headPos);
        if (b.mesh.position.distanceTo(headPos) < 0.7) {
          flashPart(enemy.head);

          if (botHitSound) {
            botHitSound.currentTime = 0;
            botHitSound.play().catch(() => {});
          }

          clearEnemyTimeouts(enemy);
          scene.remove(enemy);
          enemies.splice(j, 1);
          kills++;
          updateHUD();

          // ====== VICTORY CHECK ======
          if (kills === 50) {
            showVictory();
            hit = true;
            break;
          }
          // ===========================

          spawnEnemy();
          hit = true;
          break;
        }

        if (b.mesh.position.distanceTo(enemy.position) < 1.5) {
          enemy.health--;
          flashEnemy(enemy);

          if (botHitSound) {
            botHitSound.currentTime = 0;
            botHitSound.play().catch(() => {});
          }

          if (enemy.health <= 0) {
            clearEnemyTimeouts(enemy);
            scene.remove(enemy);
            enemies.splice(j, 1);
            kills++;
            updateHUD();

            // ====== VICTORY CHECK ======
            if (kills === 50) {
              showVictory();
              hit = true;
              break;
            }
            // ===========================

            spawnEnemy();
          }

          hit = true;
          break;
        }
      }

      if (!hit) {
        for (let k = 0; k < mapObjects.length; k++) {
          const block = mapObjects[k];
          if (block === scene.children.find(c => c.geometry && c.geometry.type === "PlaneGeometry")) continue;
          if (b.mesh.position.distanceTo(block.position) < 2) {
            hit = true;
            break;
          }
        }
      }

      if (hit) {
        scene.remove(b.mesh);
        bullets.splice(i, 1);
      }
    }

    if (playerMoving && playerWalkSound) {
      footstepFrameCounter++;
      if (footstepFrameCounter >= FOOTSTEP_INTERVAL) {
        playerWalkSound.currentTime = 0;
        playerWalkSound.play().catch(() => {});
        footstepFrameCounter = 0;
      }
    } else {
      footstepFrameCounter = 0;
    }

    updateVisualUI();
  }

  renderer.render(scene, camera);
}

function resizeWindow() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}