import * as THREE from 'three';
import './style.css';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const canvas = $('#scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#a9d8e6');
scene.fog = new THREE.Fog('#b9dbe0', 24, 76);
const camera = new THREE.PerspectiveCamera(73, innerWidth / innerHeight, .08, 100);
camera.rotation.order = 'YXZ';
const player = { pos: new THREE.Vector3(0, 1.65, 1.5), yaw: 0, pitch: -.25, velY: 0, grounded: true, crouch: false };
const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const center = new THREE.Vector2(0, 0);
const interactables = [];
const taskData = [];
const targets = [];
const palette = ['#c8785a', '#6f8f7c', '#70839c', '#d9c7a7'];
let tool = 'hand', selectedColor = palette[0], candidate = null, holdTime = 0, carried = null, actionHeld = false;
let started = false, elapsed = 0, score = 0, perfect = 0, freeRoam = false;
let sensitivity = 1, invertY = false, moving = false, sprint = false, lefty = false;
let dynamicResolution = true, quality = 'high', soundOn = true, joystickSize = 130;
let lastFrame = performance.now(), fps = 60, frames = 0, fpsTime = 0, resolutionScale = 1;
const keys = new Set();
const joy = { x: 0, y: 0, id: null };
const look = { id: null, x: 0, y: 0 };

function mat(color, roughness = .86, extra = {}) { return new THREE.MeshStandardMaterial({ color, roughness, ...extra }); }
function box(name, pos, size, material, opts = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.name = name; mesh.position.set(...pos); mesh.castShadow = opts.cast ?? true; mesh.receiveShadow = opts.receive ?? true;
  scene.add(mesh); return mesh;
}
function sphere(name, pos, radius, material) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 16, 12), material);
  mesh.name = name; mesh.position.set(...pos); mesh.castShadow = true; scene.add(mesh); return mesh;
}
function cylinder(name, pos, r1, r2, h, material, segments = 16) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, segments), material);
  mesh.name = name; mesh.position.set(...pos); mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh); return mesh;
}
const stone = mat('#d9c8a9'), plaster = mat('#eadbc1'), darkWood = mat('#765844'), wood = mat('#ad8460'), blue = mat('#557b83'), leaf = mat('#587453'), gold = mat('#d7aa69', .42, { emissive: '#6f4720', emissiveIntensity: .2 });

// Coastal setting and villa shell.
scene.add(new THREE.HemisphereLight('#e5f7ff', '#7f705c', 2.0));
const sun = new THREE.DirectionalLight('#fff0d6', 3.1); sun.position.set(-8, 15, 5); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); sun.shadow.camera.left = -18; sun.shadow.camera.right = 18; sun.shadow.camera.top = 18; sun.shadow.camera.bottom = -18; scene.add(sun);
const fill = new THREE.DirectionalLight('#a5d9ec', 1.2); fill.position.set(12, 8, -8); scene.add(fill);
const floor = box('Terracotta tile floor', [0, -.16, 0], [24, .3, 21], mat('#bf9d79'), { cast: false });
// tile joints as subtle inlaid strips
for (let x = -11; x <= 11; x += 2) box('tile grout', [x, .001, 0], [.025, .009, 20.8], mat('#aa896b'), { cast: false });
for (let z = -10; z <= 10; z += 2) box('tile grout', [0, .002, z], [23.8, .009, .025], mat('#aa896b'), { cast: false });
box('Back wall', [0, 2.1, -10.35], [24, 4.2, .45], plaster);
box('Left wall', [-11.8, 2.1, 0], [.4, 4.2, 20.5], plaster);
box('Right wall', [11.8, 2.1, 0], [.4, 4.2, 20.5], plaster);
box('Front left pier', [-8.7, 2.05, 10.1], [6.2, 4.1, .42], plaster);
box('Front right pier', [8.7, 2.05, 10.1], [6.2, 4.1, .42], plaster);
box('Front lintel', [0, 3.94, 10.1], [11.2, .42, .42], plaster);
box('Ceiling beam', [0, 4.25, 0], [24, .25, 20.8], darkWood);
for (let x = -10; x <= 10; x += 5) box('ceiling joist', [x, 4.1, 0], [.16, .2, 20.4], wood);
// internal room dividers leave broad walk-throughs
box('Partition left', [-4.3, 1.55, -4.5], [.22, 3.1, 7.4], plaster);
box('Partition right', [4.1, 1.55, -4.5], [.22, 3.1, 7.4], plaster);
box('Bedroom divider', [0, 1.5, -7.9], [8.4, 3, .22], plaster);
// sea, coastal cliffs and terrace beyond the open facade
const sea = new THREE.Mesh(new THREE.PlaneGeometry(180, 90), new THREE.MeshStandardMaterial({ color: '#4b9eb1', roughness: .34, metalness: .05 })); sea.rotation.x = -Math.PI / 2; sea.position.set(0, -1.05, -43); scene.add(sea);
const horizon = box('sunlit coastline', [0, 3, -33], [100, 8, 1], mat('#9dbb9c'), { cast: false });
for (let i = 0; i < 13; i++) {
  const x = -28 + i * 4.8, h = 2 + (i % 4) * 1.1;
  const cliff = new THREE.Mesh(new THREE.ConeGeometry(3 + (i % 3), h + 4, 5), mat(i % 2 ? '#829b81' : '#a2ad8d'));
  cliff.position.set(x, (h + 4) / 2 - 1, -30 - (i % 3) * 2); cliff.rotation.y = i; scene.add(cliff);
}
const terrace = box('terrace', [0, -.16, 12.5], [25, .35, 5], stone);
for (let x = -11; x <= 11; x += 4) cylinder('terrace baluster', [x, .65, 14.6], .12, .12, 1.3, plaster);
box('balcony rail', [0, 1.3, 14.6], [24, .14, .14], stone);

// Warm layered furnishings and architectural details.
for (let i = 0; i < 4; i++) {
  const x = -8.7 + i * 5.8;
  box('ceiling lamp base', [x, 3.85, 2], [.32, .12, .32], gold);
  sphere('ceiling lamp glow', [x, 3.62, 2], .18, new THREE.MeshBasicMaterial({ color: '#ffda9d' }));
}
for (const x of [-10.8, 10.8]) for (const z of [-8, -3, 2, 7]) {
  cylinder('olive pot', [x, .35, z], .48, .34, .7, mat('#a96f4d'));
  cylinder('olive trunk', [x, 1.2, z], .08, .11, 1.1, darkWood);
  for (let i = 0; i < 5; i++) sphere('olive canopy', [x + Math.sin(i * 3) * .5, 1.8 + (i % 2) * .35, z + Math.cos(i * 2) * .4], .48, leaf);
}
// Dining table and kitchen vignette
box('kitchen island', [0, .55, -8.9], [3.8, 1.1, 1.2], mat('#d6c6ab'));
box('island top', [0, 1.14, -8.9], [4, .14, 1.35], mat('#f4e9d8'));
for (let x of [-8, 8]) {
  box('sideboard', [x, .65, -7.1], [3, 1.3, .8], darkWood);
  box('sideboard top', [x, 1.34, -7.1], [3.1, .12, .9], wood);
}
// sofa at seaward side
box('sofa base', [0, .55, 6], [4.4, .75, 1.65], blue);
box('sofa back', [0, 1.25, 6.7], [4.4, 1.35, .38], blue);
for (let x of [-1.4, 0, 1.4]) box('sofa cushion', [x, 1.35, 5.9], [1.2, .22, 1.05], mat(x === 0 ? '#d6ae88' : '#d8d0bb'));
box('coffee table', [0, .58, 3.9], [3.1, .12, 1.5], wood);
for (const x of [-1.25, 1.25]) for (const z of [3.4, 4.4]) cylinder('coffee table leg', [x, .27, z], .06, .08, .55, darkWood);

// Tasks are real meshes with subtle animated gold markers and simple progress state.
function registerTask(type, label, pos, mesh, toolName = 'hand', duration = 1.4) {
  const task = { type, label, pos: new THREE.Vector3(...pos), mesh, tool: toolName, done: false, duration, progress: 0, marker: null, goal: null };
  const marker = new THREE.Mesh(new THREE.TorusGeometry(.24, .035, 8, 28), new THREE.MeshBasicMaterial({ color: '#f1c778', transparent: true, opacity: .8 }));
  marker.rotation.x = Math.PI / 2; marker.position.set(pos[0], .04, pos[2]); marker.userData.task = task; scene.add(marker); task.marker = marker;
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(.02, .02, .75, 8), new THREE.MeshBasicMaterial({ color: '#efc77f', transparent: true, opacity: .4 })); beacon.position.set(pos[0], .48, pos[2]); beacon.userData.task = task; scene.add(beacon); task.beacon = beacon;
  const tag = (node) => { node.userData.task = task; node.children.forEach(tag); }
  tag(mesh);
  interactables.push(mesh); targets.push(mesh); taskData.push(task); return task;
}
const dustMat = mat('#9b8973');
for (const [i, p] of [[-8,5],[-5,-2],[6,5],[8,-2],[0,-5]].entries()) {
  const pile = new THREE.Group(); pile.position.set(p[0], .05, p[1]);
  for (let k = 0; k < 5; k++) { const d = new THREE.Mesh(new THREE.DodecahedronGeometry(.16 + Math.random() * .17, 0), dustMat); d.position.set((Math.random()-.5)*.58, Math.random()*.15, (Math.random()-.5)*.52); d.scale.y = .45; d.rotation.set(Math.random(), Math.random(), Math.random()); pile.add(d); }
  scene.add(pile); registerTask('dust', 'Builder’s dust', [p[0], .15, p[1]], pile, 'hand', 1.15);
}
for (const [i, p] of [[-7,1],[7,1],[0,-1]].entries()) {
  const crack = new THREE.Group(); crack.position.set(p[0], .025, p[1]);
  for (let j = 0; j < 3; j++) { const m = new THREE.Mesh(new THREE.BoxGeometry(.8 - j*.13,.035,.035), mat('#51483e')); m.position.set(0, .01, (j-1)*.07); m.rotation.y = (j-1)*.2; crack.add(m); }
  scene.add(crack); const t = registerTask('repair', 'Cracked stone', [p[0], .08, p[1]], crack, 'repair', 1.8); t.mesh = crack;
}
const wallTints = [];
for (const [i, p] of [[-8,-10.08],[0,-10.08],[8,-10.08]].entries()) {
  const patch = box('faded accent wall', [p[0], 1.85, p[1]], [3.3, 2.5, .08], mat('#bca58b'));
  patch.userData.paintable = true; patch.userData.base = patch.material.color.clone(); wallTints.push(patch);
  registerTask('paint', 'Faded accent wall', [p[0], 1.2, -8.3], patch, 'paint', 1.6);
}
// Three lamps.
const lampSpots = [[-9,1, -7.1],[9,1,-7.1],[0,1,6.1]];
for (let i=0;i<lampSpots.length;i++) {
  const [x,y,z] = lampSpots[i];
  const stand = cylinder('floor lamp stem', [x,1.25,z],.045,.055,2.4,darkWood);
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(.28,.42,.48,18,1,true), mat('#d8c6a9',.7,{emissive:'#251a0e',emissiveIntensity:.1})); shade.position.set(x,2.55,z); scene.add(shade);
  const bulb = sphere('lamp bulb', [x,2.27,z],.13,new THREE.MeshBasicMaterial({color:'#72624b'}));
  const light = new THREE.PointLight('#ffd18c',0,5,2); light.position.set(x,2.2,z); scene.add(light);
  const t = registerTask('lamp','Warm floor lamp',[x,.08,z],stand,'hand',.85); t.light=light; t.bulb=bulb; t.shade=shade;
}
// Furniture pieces and their destination rings.
const furniture = [];
for (let i=0;i<3;i++) {
  const x = [-7,0,7][i], z = [5,-3,5][i];
  const chair = new THREE.Group(); chair.position.set(x,.05,z); scene.add(chair);
  const cushion = new THREE.Mesh(new THREE.BoxGeometry(1.05,.18,1.02), mat(i===1?'#bf805f':'#708b7c')); cushion.position.y=.68; cushion.castShadow=true; chair.add(cushion);
  const back = new THREE.Mesh(new THREE.BoxGeometry(1.05,.95,.16), mat('#6b7565')); back.position.set(0,1.1,-.42); back.castShadow=true; chair.add(back);
  for (const lx of [-.42,.42]) for (const lz of [-.38,.38]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(.09,.65,.09), darkWood); leg.position.set(lx,.33,lz); leg.castShadow=true; chair.add(leg); }
  const goal = new THREE.Vector3([-2.7,0,2.7][i],.04,[1.5,-5.7,1.5][i]);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.7,.045,8,32), new THREE.MeshBasicMaterial({color:'#edc679',transparent:true,opacity:.8})); ring.rotation.x=Math.PI/2; ring.position.copy(goal); scene.add(ring);
  const t = registerTask('furniture','Accent chair',[x,.7,z],chair,'arrange',.8); t.goal=goal; t.ring=ring; t.placed=false; furniture.push(t);
}

// Garden silhouettes, rugs, art, and details
for (const [x,z,c] of [[-4,-2,'#b86f58'],[4,-2,'#607e7c'],[-8,4,'#c79862'],[8,4,'#778a9a']]) {
  const rug = box('woven rug',[x,.025,z],[2.5,.04,1.8],mat(c),{cast:false});
  for(let n=-1;n<=1;n++) box('rug stripe',[x+n*.6,.05,z],[.025,.012,1.75],mat('#e5d6bd'),{cast:false});
}
for (const x of [-8,0,8]) {
  const frame = box('wall art frame',[x,2.55,-10.06],[1.35,1.15,.12],darkWood);
  box('wall art',[x,2.55,-9.98],[1.1,.9,.03],mat(x===0?'#84a39a':'#d7ad77'));
}

function taskComplete(task) {
  if (!task || task.done) return;
  if (task.type === 'furniture') {
    if (!task.placed) return;
    task.mesh.position.copy(task.goal); task.mesh.position.y=.05; task.ring.visible=false;
    if (task.perfectPlace) perfect++;
  }
  task.done=true; task.progress=0; task.marker.visible=false; task.beacon.visible=false;
  if (task.type==='dust') task.mesh.visible=false;
  if (task.type==='repair') { task.mesh.children.forEach(c=>c.material=mat('#d6c4a4')); }
  if (task.type==='paint') { task.mesh.material.color.set(selectedColor); task.mesh.material.needsUpdate=true; }
  if (task.type==='lamp') { task.light.intensity=14; task.bulb.material.color.set('#ffd58d'); task.shade.material.emissive.set('#efae55'); task.shade.material.emissiveIntensity=.45; }
  score += task.type==='furniture'?180:100;
  toast(`${task.label} ${task.type==='furniture'?'placed':'complete'}`, 'success');
  updateUI();
  if (taskData.every(t=>t.done) && !freeRoam) showResults();
}
function showResults() {
  $('#results').classList.remove('hidden'); $('#hud').classList.add('hidden');
  $('#result-time').textContent=formatTime(elapsed); $('#result-score').textContent=score; $('#result-perfect').textContent=`${perfect} / 3`; $('#result-device').textContent=quality.toUpperCase();
  localStorage.setItem('casanova-best',String(Math.max(score,Number(localStorage.getItem('casanova-best')||0))));
}
function formatTime(seconds) { const n=Math.floor(seconds); return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`; }
function currentTask() { return taskData.find(t=>!t.done); }
function updateUI() {
  const done=taskData.filter(t=>t.done).length, pct=Math.round(done/taskData.length*100);
  $('#obj-percent').textContent=`${pct}%`; $('#obj-ring-fill').style.strokeDashoffset=String(113.1*(1-pct/100));
  $('#score-value').textContent=score; $('#checklist-count').textContent=`${done} / ${taskData.length} complete`;
  $('#obj-current').textContent=currentTask()?.label || (freeRoam?'Free roam':'Villa complete');
  $('#checklist-rows').innerHTML=taskData.map(t=>`<div class="check-row ${t.done?'done':''}"><i>${t.done?'✓':''}</i><span>${t.label}</span><small>${t.done?'DONE':t.type.toUpperCase()}</small></div>`).join('');
  $('#best-score').textContent=localStorage.getItem('casanova-best')||'—';
}
function toast(text,kind='') { const el=document.createElement('div'); el.className=`toast ${kind}`; el.textContent=text; $('#toasts').append(el); setTimeout(()=>el.remove(),2300); }
function rayTask() {
  raycaster.setFromCamera(center,camera); raycaster.far=9;
  const hits=raycaster.intersectObjects(interactables,true);
  if(!hits.length) return null;
  let obj=hits[0].object, task;
  while(obj&&!task){task=obj.userData.task;obj=obj.parent;}
  if(!task) task=taskData.find(t=>t.mesh===hits[0].object || t.mesh.children?.includes(hits[0].object));
  if(!task||task.done) return null;
  if(task.type==='furniture'&&task.placed) return null;
  return task;
}
function canUse(task) { return !task || task.tool===tool || (task.type==='lamp'&&tool==='hand') || (task.type==='furniture'&&tool==='arrange'); }
function doAction(task) {
  if(!task) return;
  if(!canUse(task)) { toast(`Select ${task.tool.toUpperCase()} for this task`); return; }
  if(task.type==='furniture') {
    if(!carried){ carried=task; task.mesh.userData.carried=true; $('#carry-hint').classList.remove('hidden'); $('#carry-title').textContent=`Placing ${task.label.toLowerCase()}`; toast('Use the joystick to move · rotate to align'); }
    else if(carried===task){ const d=task.mesh.position.distanceTo(task.goal); if(d<1.6){task.perfectPlace=d<=.55;task.mesh.position.copy(task.goal);task.mesh.position.y=.05;task.placed=true;carried=null;$('#carry-hint').classList.add('hidden');taskComplete(task);}else toast('Move closer to the gold placement ring'); }
    return;
  }
  if(task.progress>=1) taskComplete(task);
}
function changeTool(name) {
  tool=name; $$('.tool').forEach(el=>el.classList.toggle('active',el.dataset.tool===name));
  $('#palette').classList.toggle('hidden',name!=='paint');
  toast(`${name[0].toUpperCase()+name.slice(1)} tool equipped`);
}

// Camera and touch movement.
function cameraForward() { return new THREE.Vector3(-Math.sin(player.yaw),0,-Math.cos(player.yaw)); }
function updateCamera(dt) {
  let forward=(keys.has('KeyW')||keys.has('ArrowUp')?-1:0)+(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-joy.y;
  let side=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)+joy.x;
  const inputLen=Math.hypot(forward,side); if(inputLen>1){forward/=inputLen;side/=inputLen;}
  const run=sprint||keys.has('ShiftLeft')||keys.has('ShiftRight'); const speed=player.crouch?1.5:run?6:3;
  const f=cameraForward(), right=new THREE.Vector3(Math.cos(player.yaw),0,-Math.sin(player.yaw));
  player.pos.addScaledVector(f,forward*speed*dt); player.pos.addScaledVector(right,side*speed*dt);
  player.pos.x=THREE.MathUtils.clamp(player.pos.x,-10.8,10.8); player.pos.z=THREE.MathUtils.clamp(player.pos.z,-9.7,12.7);
  if(!player.grounded){player.velY-=12*dt;player.pos.y+=player.velY*dt;if(player.pos.y<= (player.crouch?1.05:1.65)){player.pos.y=player.crouch?1.05:1.65;player.velY=0;player.grounded=true;}}
  player.pos.y=player.grounded?(player.crouch?1.05:1.65):player.pos.y;
  camera.position.copy(player.pos); camera.rotation.set(player.pitch,player.yaw,0,'YXZ'); moving=inputLen>.08;
  if(carried){ const fwd=cameraForward(); const desired=player.pos.clone().addScaledVector(fwd,2.2); desired.y=.05; desired.x=THREE.MathUtils.clamp(desired.x,-9,9); desired.z=THREE.MathUtils.clamp(desired.z,-8,9); carried.mesh.position.lerp(desired,Math.min(1,dt*8)); carried.mesh.position.y=.05; }
}
function lookBy(dx,dy) { player.yaw-=dx*.0032*sensitivity; player.pitch=THREE.MathUtils.clamp(player.pitch-dy*.0032*sensitivity*(invertY?-1:1),-1.25,1.15); }
function jump(){ if(player.grounded){player.velY=5.2;player.grounded=false;} }

// Graphics scaling and monitor.
const presets={low:{ratio:1,shadow:false},medium:{ratio:1.15,shadow:true},high:{ratio:1.5,shadow:true},ultra:{ratio:1.8,shadow:true}};
function setQuality(q){quality=q; const p=presets[q]; renderer.shadowMap.enabled=p.shadow; resolutionScale=p.ratio; resize(); $$('[data-q]').forEach(b=>b.classList.toggle('active',b.dataset.q===q)); $('#device-note').textContent=`Detected device profile: ${matchMedia('(pointer:coarse)').matches?'TOUCH':'DESKTOP'} · ${q.toUpperCase()}`;}
function resize(){ renderer.setPixelRatio(Math.min(devicePixelRatio*resolutionScale,2)); renderer.setSize(innerWidth,innerHeight,false); camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix(); }

// Input wiring
window.addEventListener('keydown',e=>{keys.add(e.code); if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault(); if(e.code==='Space')jump(); if(e.code==='KeyE'&&!e.repeat){actionHeld=true;doAction(candidate);} if(/^Digit[1-4]$/.test(e.code))changeTool(['hand','paint','repair','arrange'][Number(e.code.slice(-1))-1]); if(e.code==='KeyR'&&carried){carried.mesh.rotation.y+=Math.PI/4;} if(e.code==='Escape')toggleSettings(true);});
window.addEventListener('keyup',e=>{keys.delete(e.code);if(e.code==='KeyE')actionHeld=false;});
canvas.addEventListener('pointerdown',e=>{if(!started)return; if(e.pointerType==='mouse'&&e.button===0){look.id=e.pointerId;look.x=e.clientX;look.y=e.clientY;canvas.setPointerCapture(e.pointerId);}});
canvas.addEventListener('pointermove',e=>{if(look.id===e.pointerId){lookBy(e.clientX-look.x,e.clientY-look.y);look.x=e.clientX;look.y=e.clientY;}});
canvas.addEventListener('pointerup',e=>{if(look.id===e.pointerId)look.id=null;});
$('#look-zone').addEventListener('pointerdown',e=>{if(!started)return;look.id=e.pointerId;look.x=e.clientX;look.y=e.clientY;$('#look-zone').setPointerCapture(e.pointerId);});
$('#look-zone').addEventListener('pointermove',e=>{if(look.id===e.pointerId){lookBy(e.clientX-look.x,e.clientY-look.y);look.x=e.clientX;look.y=e.clientY;}});
$('#look-zone').addEventListener('pointerup',e=>{if(look.id===e.pointerId)look.id=null;});
const joystick=$('#joystick'), nub=$('.stick-nub');
joystick.addEventListener('pointerdown',e=>{joy.id=e.pointerId;joystick.setPointerCapture(e.pointerId);joyMove(e);});
joystick.addEventListener('pointermove',e=>{if(joy.id===e.pointerId)joyMove(e);});
function joyMove(e){const r=joystick.getBoundingClientRect(),dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height/2),max=r.width*.34,len=Math.hypot(dx,dy),scale=Math.min(1,max/Math.max(1,len));joy.x=dx*scale/max;joy.y=dy*scale/max;nub.style.transform=`translate(${joy.x*max}px,${joy.y*max}px)`;}
function joyEnd(e){if(joy.id===e.pointerId){joy.id=null;joy.x=joy.y=0;nub.style.transform='translate(0,0)';}}
joystick.addEventListener('pointerup',joyEnd);joystick.addEventListener('pointercancel',joyEnd);
$('#btn-interact').addEventListener('pointerdown',e=>{e.preventDefault();holdTime=0;actionHeld=true;$('#btn-interact').setPointerCapture(e.pointerId);});
$('#btn-interact').addEventListener('pointerup',e=>{e.preventDefault();actionHeld=false;if(candidate?.type==='furniture')doAction(candidate);else if(candidate&&candidate.progress>=1)doAction(candidate);});
$('#btn-interact').addEventListener('pointercancel',()=>{actionHeld=false;});
$('#btn-jump').addEventListener('click',jump);
$('#btn-sprint').addEventListener('pointerdown',()=>sprint=true); $('#btn-sprint').addEventListener('pointerup',()=>sprint=false); $('#btn-sprint').addEventListener('pointerleave',()=>sprint=false);
$('#btn-crouch').addEventListener('click',()=>{player.crouch=!player.crouch;$('#btn-crouch').classList.toggle('active',player.crouch);});
$('#btn-rotate').addEventListener('click',()=>{if(carried)carried.mesh.rotation.y+=Math.PI/4;else toast('Pick up a chair with ARRANGE first');});
$$('.tool').forEach(b=>b.addEventListener('click',()=>changeTool(b.dataset.tool)));
$$('.swatch').forEach(b=>b.addEventListener('click',()=>{selectedColor=b.dataset.color;$$('.swatch').forEach(s=>s.classList.toggle('active',s===b));}));
$('#objective-bar').addEventListener('click',()=>$('#checklist').classList.toggle('open'));
$('#checklist-close').addEventListener('click',()=>$('#checklist').classList.remove('open'));
$('#btn-play').addEventListener('click',startGame); $('#btn-continue').addEventListener('click',startGame);
function startGame(){started=true;$('#menu').classList.add('hidden');$('#results').classList.add('hidden');$('#hud').classList.remove('hidden');updateUI();toast('Welcome to Villa Aurelia · follow the gold markers');}
function toggleSettings(show){$('#settings').classList.toggle('hidden',!show);}
$('#menu-settings').addEventListener('click',()=>toggleSettings(true)); $('#btn-settings').addEventListener('click',()=>toggleSettings(true)); $('#settings-close').addEventListener('click',()=>toggleSettings(false)); $('#btn-resume').addEventListener('click',()=>toggleSettings(false));
$('#btn-help').addEventListener('click',()=>$('#help').classList.remove('hidden')); $('#help-close').addEventListener('click',()=>$('#help').classList.add('hidden')); $('#help-gotit').addEventListener('click',()=>$('#help').classList.add('hidden'));
$('#sens').addEventListener('input',e=>{sensitivity=Number(e.target.value);$('#sens-out').textContent=`${sensitivity.toFixed(2)}×`;});
$('#stick-size').addEventListener('input',e=>{joystickSize=Number(e.target.value);$('#stick-out').textContent=joystickSize;document.documentElement.style.setProperty('--joy-size',`${joystickSize}px`);});
$('#quality-buttons').addEventListener('click',e=>{if(e.target.dataset.q)setQuality(e.target.dataset.q);});
function toggleRow(id,cb){$(id).addEventListener('click',e=>{const sw=e.currentTarget.querySelector('.switch');sw.classList.toggle('on');cb(sw.classList.contains('on'));});}
toggleRow('#toggle-dynamic',v=>dynamicResolution=v); toggleRow('#toggle-perf',v=>$('#perf').classList.toggle('hidden',!v)); toggleRow('#toggle-lefty',v=>{lefty=v;$('#hud').classList.toggle('lefty',v);}); toggleRow('#toggle-invert',v=>invertY=v); toggleRow('#toggle-sound',v=>soundOn=v);
$('#btn-perf').addEventListener('click',()=>$('#perf').classList.toggle('hidden'));
$('#btn-sound').addEventListener('click',()=>{soundOn=!soundOn;toast(soundOn?'Ambient sound on':'Ambient sound off');}); $('#menu-sound').addEventListener('click',()=>toast('Ambient sound '+(soundOn?'on':'off')));
$('#btn-reset').addEventListener('click',()=>location.reload()); $('#btn-free-roam').addEventListener('click',()=>{freeRoam=true;toggleSettings(false);toast('Free roam enabled · explore the villa');});
$('#btn-again').addEventListener('click',()=>location.reload()); $('#btn-continue-roam').addEventListener('click',()=>{$('#results').classList.add('hidden');$('#hud').classList.remove('hidden');freeRoam=true;});

// Orientation hint only on narrow portrait screens.
function orientation(){ $('#rotate-device').classList.toggle('hidden',innerHeight<=innerWidth||innerWidth>700); }
window.addEventListener('resize',()=>{resize();orientation();});

function animate(now){ requestAnimationFrame(animate); const dt=Math.min(clock.getDelta(),.05); if(started&&!$('#settings').classList.contains('hidden')){} else if(started){elapsed+=dt; updateCamera(dt);}
  candidate=started?rayTask():null;
  if(candidate&&canUse(candidate)){ $('#prompt').classList.remove('hidden');$('#prompt-title').textContent=candidate.label;$('#prompt-sub').textContent=candidate.type==='furniture'?(carried?'Move into the gold ring · tap to place':'Tap to pick up and arrange'):candidate.type==='paint'?'Choose colour · hold to paint':candidate.type==='repair'?'Hold to patch the cracked stone':'Hold to complete';$('#crosshair').classList.add('targeting');} else {$('#prompt').classList.add('hidden');$('#crosshair').classList.remove('targeting');}
  const t=clock.elapsedTime; taskData.forEach(task=>{if(!task.done){task.marker.position.y=.04+Math.sin(t*2.5+task.pos.x)*.04;task.beacon.material.opacity=.26+Math.sin(t*3)*.14;}});
  if(started&&candidate&&canUse(candidate)&&actionHeld&&candidate.type!=='furniture'){candidate.progress=Math.min(1,candidate.progress+dt/candidate.duration);if(candidate.progress>=1)taskComplete(candidate);} else if(candidate&&candidate.progress>0)candidate.progress=Math.max(0,candidate.progress-dt*.8);
  $('#prompt-hold-fill').style.width=`${candidate?candidate.progress*100:0}%`;
  if(started){frames++;fpsTime+=dt;if(fpsTime>.5){fps=frames/fpsTime;frames=0;fpsTime=0;$('#perf-fps').textContent=Math.round(fps);$('#perf-ms').textContent=(1000/fps).toFixed(1);const info=renderer.info.render;$('#perf-draw').textContent=info.calls;$('#perf-tris').textContent=info.triangles.toLocaleString();$('#perf-scale').textContent=`${resolutionScale.toFixed(1)}×`;$('#timer-value').textContent=formatTime(elapsed);if(dynamicResolution){if(fps<42&&resolutionScale>.75){resolutionScale=Math.max(.75,resolutionScale-.1);resize();}else if(fps>57&&resolutionScale<(presets[quality].ratio)){resolutionScale=Math.min(presets[quality].ratio,resolutionScale+.05);resize();}}}}
  renderer.render(scene,camera);
}

setQuality(matchMedia('(pointer:coarse)').matches?'medium':'high');
$('#best-score').textContent=localStorage.getItem('casanova-best')||'—';
$('#loading').classList.add('hidden');$('#menu').classList.remove('hidden');orientation();
requestAnimationFrame(animate);
