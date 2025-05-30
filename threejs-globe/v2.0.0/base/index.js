import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const vertex = `
  #ifdef GL_ES
  precision mediump float;
  #endif

  uniform float u_time;
  uniform float u_maxExtrusion;

  void main() {

    vec3 newPosition = position;
    if(u_maxExtrusion > 1.0) newPosition.xyz = newPosition.xyz * u_maxExtrusion + sin(u_time);
    else newPosition.xyz = newPosition.xyz * u_maxExtrusion;

    gl_Position = projectionMatrix * modelViewMatrix * vec4( newPosition, 1.0 );

  }
`;
const fragment = `
  #ifdef GL_ES
  precision mediump float;
  #endif

  uniform float u_time;

  // 修改颜色为 #5F4568 (RGB: 95, 69, 104) -> (0.373, 0.271, 0.408)
  vec3 colorA = vec3(0.373, 0.271, 0.408);
  vec3 colorB = vec3(0.373, 0.271, 0.408); // 可以设置两个略微不同的紫色调，或者保持一致

  void main() {

    vec3  color = vec3(0.0);
    // 如果希望颜色有变化，可以保留 mix，否则直接使用 colorA
    // float pct   = abs(sin(u_time));
    // color = mix(colorA, colorB, pct);
    color = colorA; // 直接使用设定的紫色

    gl_FragColor = vec4(color, 1.0);

  }
`;

const container = document.querySelector('.container');
const canvas = document.querySelector('.canvas');

let
  sizes,
  scene,
  camera,
  renderer,
  controls,
  raycaster,
  mouse,
  isIntersecting,
  twinkleTime,
  materials,
  material,
  baseMesh,
  minMouseDownFlag,
  mouseDown,
  grabbing;

// 球面半径与已有点阵一致
const FLY_LINE_RADIUS = 20;

// 贴图加载
const textureLoader = new THREE.TextureLoader();
const discTexture = textureLoader.load('../../img/disc_texture.png');


// 经纬度转球面坐标（与已有calcPosFromLatLonRad一致，便于独立调用）
function latLonToVec3(lon, lat, radius = FLY_LINE_RADIUS) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z = (radius * Math.sin(phi) * Math.sin(theta));
  const y = (radius * Math.cos(phi));
  return new THREE.Vector3(x, y, z);
}




// Add function to create random points on the globe
function addRandomPointsToGlobe(count = 20) {
  const pointsGroup = new THREE.Group();

  for (let i = 0; i < count; i++) {
    // Generate random latitude and longitude
    const lat = Math.random() * 180 - 90; // -90 to 90
    const lon = Math.random() * 360 - 180; // -180 to 180

    // Convert to 3D position
    const position = latLonToVec3(lon, lat);

    // Create point sprite
    const pointMaterial = new THREE.SpriteMaterial({
      map: discTexture,
      color: 0xffffff,
      transparent: true,
      blending: THREE.AdditiveBlending
    });

    const point = new THREE.Sprite(pointMaterial);
    point.position.copy(position);
    point.scale.set(1, 1, 1);

    pointsGroup.add(point);
  }

  scene.add(pointsGroup);
  return pointsGroup;
}

const setScene = () => {

  sizes = {
    width: container.offsetWidth,
    height: container.offsetHeight
  };

  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(
    30,
    sizes.width / sizes.height,
    1,
    1000
  );
  camera.position.z = 100;

  renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: false,
    alpha: true
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // 降低点光源强度 (例如从 17 改为 8)
  const pointLight = new THREE.PointLight(0x3F273E, 8, 200); // 降低强度
  pointLight.position.set(-50, 0, 60);
  scene.add(pointLight);
  // 降低半球光强度 (例如从 1.5 改为 0.8)
  scene.add(new THREE.HemisphereLight(0x3F273E, 0x3F273E, 0.8)); // 降低强度

  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();
  isIntersecting = false;
  minMouseDownFlag = false;
  mouseDown = false;
  grabbing = false;

  setControls();
  setBaseSphere();
  setShaderMaterial();
  setMap();

  // 添加随机点到球体表面
  addRandomPointsToGlobe(30);

  resize();
  listenTo();
  render();

}

const setControls = () => {

  controls = new OrbitControls(camera, renderer.domElement);
  controls.autoRotate = true;
  controls.autoRotateSpeed = 1.2;
  controls.enableDamping = true;
  controls.enableRotate = true;
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.minPolarAngle = (Math.PI / 2) - 0.5;
  controls.maxPolarAngle = (Math.PI / 2) + 0.5;

};

const setBaseSphere = () => {

  const baseSphere = new THREE.SphereGeometry(19.5, 35, 35);
  const baseMaterial = new THREE.MeshStandardMaterial({
    color: 0x3A264C,
    transparent: true,
    opacity: 0.9
  });
  baseMesh = new THREE.Mesh(baseSphere, baseMaterial);
  scene.add(baseMesh);

}

const setShaderMaterial = () => {

  twinkleTime = 0.03;
  materials = [];
  material = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      u_time: { value: 1.0 },
      u_maxExtrusion: { value: 1.0 }
    },
    vertexShader: vertex,
    fragmentShader: fragment,
  });

}

const setMap = () => {

  let activeLatLon = {};
  const dotSphereRadius = 20;

  const readImageData = (imageData) => {

    for (
      let i = 0, lon = -180, lat = 90;
      i < imageData.length;
      i += 4, lon++
    ) {

      if (!activeLatLon[lat]) activeLatLon[lat] = [];

      const red = imageData[i];
      const green = imageData[i + 1];
      const blue = imageData[i + 2];

      if (red < 80 && green < 80 && blue < 80)
        activeLatLon[lat].push(lon);

      if (lon === 180) {
        lon = -180;
        lat--;
      }

    }

  }

  const visibilityForCoordinate = (lon, lat) => {

    let visible = false;

    if (!activeLatLon[lat].length) return visible;

    const closest = activeLatLon[lat].reduce((prev, curr) => {
      return (Math.abs(curr - lon) < Math.abs(prev - lon) ? curr : prev);
    });

    if (Math.abs(lon - closest) < 0.5) visible = true;

    return visible;

  }

  const calcPosFromLatLonRad = (lon, lat) => {

    var phi = (90 - lat) * (Math.PI / 180);
    var theta = (lon + 180) * (Math.PI / 180);

    const x = -(dotSphereRadius * Math.sin(phi) * Math.cos(theta));
    const z = (dotSphereRadius * Math.sin(phi) * Math.sin(theta));
    const y = (dotSphereRadius * Math.cos(phi));

    return new THREE.Vector3(x, y, z);

  }

  const createMaterial = (timeValue) => {

    const mat = material.clone();
    mat.uniforms.u_time.value = timeValue * Math.sin(Math.random());
    materials.push(mat);
    return mat;

  }

  const setDots = () => {

    const dotDensity = 2.5;
    let vector = new THREE.Vector3();

    for (let lat = 90, i = 0; lat > -90; lat--, i++) {

      const radius =
        Math.cos(Math.abs(lat) * (Math.PI / 180)) * dotSphereRadius;
      const circumference = radius * Math.PI * 2;
      const dotsForLat = circumference * dotDensity;

      for (let x = 0; x < dotsForLat; x++) {

        const long = -180 + x * 360 / dotsForLat;

        if (!visibilityForCoordinate(long, lat)) continue;

        vector = calcPosFromLatLonRad(long, lat);

        const dotGeometry = new THREE.CircleGeometry(0.1, 5);
        dotGeometry.lookAt(vector);
        dotGeometry.translate(vector.x, vector.y, vector.z);

        const m = createMaterial(i);
        const mesh = new THREE.Mesh(dotGeometry, m);

        scene.add(mesh);

      }

    }

  }

  const image = new Image;
  image.onload = () => {

    image.needsUpdate = true;

    const imageCanvas = document.createElement('canvas');
    imageCanvas.width = image.width;
    imageCanvas.height = image.height;

    const context = imageCanvas.getContext('2d');
    context.drawImage(image, 0, 0);

    const imageData = context.getImageData(
      0,
      0,
      imageCanvas.width,
      imageCanvas.height
    );
    readImageData(imageData.data);

    setDots();

  }

  image.src = '../../img/world_alpha_mini.jpg';

}

const resize = () => {

  sizes = {
    width: container.offsetWidth,
    height: container.offsetHeight
  };

  if (window.innerWidth > 700) camera.position.z = 100;
  else camera.position.z = 140;

  camera.aspect = sizes.width / sizes.height;
  camera.updateProjectionMatrix();

  renderer.setSize(sizes.width, sizes.height);

}

const mousemove = (event) => {

  isIntersecting = false;

  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);

  const intersects = raycaster.intersectObject(baseMesh);
  if (intersects[0]) {
    isIntersecting = true;
    if (!grabbing) document.body.style.cursor = 'pointer';
  }
  else {
    if (!grabbing) document.body.style.cursor = 'default';
  }

}

const mousedown = () => {

  if (!isIntersecting) return;


  mouseDown = true;
  minMouseDownFlag = false;

  setTimeout(() => {
    minMouseDownFlag = true;
    if (!mouseDown) mouseup();
  }, 500);

  document.body.style.cursor = 'grabbing';
  grabbing = true;

}

const mouseup = () => {

  mouseDown = false;
  if (!minMouseDownFlag) return;

  materials.forEach(el => {
    gsap.to(
      el.uniforms.u_maxExtrusion,
      {
        value: 1.0,
        duration: 0.15
      }
    );
  });

  grabbing = false;
  if (isIntersecting) document.body.style.cursor = 'pointer';
  else document.body.style.cursor = 'default';

}

const listenTo = () => {

  window.addEventListener('resize', resize.bind(this));
  window.addEventListener('mousemove', mousemove.bind(this));
  window.addEventListener('mousedown', mousedown.bind(this));
  window.addEventListener('mouseup', mouseup.bind(this));

}

const render = () => {

  materials.forEach(el => {
    el.uniforms.u_time.value += twinkleTime;
  });

  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(render.bind(this))

}

setScene();