'use strict';
/* ---------- Renderer / scene ---------- */
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
const dom = renderer.domElement;

const PAPER_BG = 0xefe8da;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xeef2f6);
scene.fog = new THREE.Fog(0xeef2f6, 800, 2800);     // barely there: a bright, evenly lit room

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.3, 30000);
camera.rotation.order = 'YXZ';
scene.add(camera);   // the pea gun is parented to the camera

/* ---------- Lighting + soft shadows ---------- */
scene.add(new THREE.AmbientLight(0xffffff, 0.66));           // bright, even fluorescent fill
const sun = new THREE.DirectionalLight(0xffffff, 0.75);      // one key light that carries the depth
sun.position.set(90, 130, 60);                              // far away so the whole table + floor sit inside its frustum
sun.target.position.set(0, 0, 0);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);                          // renderer uses PCFSoftShadowMap (soft penumbra)
Object.assign(sun.shadow.camera, { left: -125, right: 125, top: 125, bottom: -125, near: 1, far: 420 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.04;                                // kills acne on thin, dented sheets
scene.add(sun, sun.target);
