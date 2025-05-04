import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const vertex = `
  #ifdef GL_ES
  precision mediump float;
  #endif

  uniform float u_time;
  uniform float u_maxExtrusion;

  void main() {
    vec3 displacedPosition = position;

    // --- 原有的挤出效果 ---
    if(u_maxExtrusion > 1.0) displacedPosition.xyz = displacedPosition.xyz * u_maxExtrusion + sin(u_time);
    else displacedPosition.xyz = displacedPosition.xyz * u_maxExtrusion;
    // --- ---

    gl_Position = projectionMatrix * modelViewMatrix * vec4( displacedPosition, 1.0 );
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

// --- 新的涟漪层着色器 ---
const rippleVertexShader = `
  uniform vec3 u_ripple_center;
  uniform float u_ripple_time;
  uniform float u_ripple_strength;
  uniform float u_ripple_width;

  varying float v_ripple_intensity; // 传递给 fragment shader
  varying vec3 vNormal;             // 新增：传递法线
  varying vec3 vWorldPosition;      // 新增：传递世界坐标

  #define PI 3.14159265359

  void main() {
    vec3 pos = position;
    v_ripple_intensity = 0.0;

    if (u_ripple_time >= 0.0) {
      float dist = distance(position, u_ripple_center);
      float current_radius = u_ripple_time * 100.0;
      float half_width = u_ripple_width / 2.0;
      float wave_front = current_radius - half_width;
      float wave_back = current_radius + half_width;

      if (dist > wave_front && dist < wave_back) {
        float progress = (dist - wave_front) / u_ripple_width;
        float displacement = sin(progress * PI);
        pos += normalize(position) * displacement * u_ripple_strength;
        v_ripple_intensity = displacement;
      }
    }

    // 计算世界坐标和法线并传递
    vec4 worldPos = modelMatrix * vec4(pos, 1.0);
    vWorldPosition = worldPos.xyz;
    vNormal = normalize(normalMatrix * normal); // normalMatrix 是 three.js 内置 uniform

    gl_Position = projectionMatrix * viewMatrix * worldPos; // 使用 viewMatrix 和 worldPos
  }
`;

const rippleFragmentShader = `
  uniform vec3 u_ripple_color; // 涟漪颜色
  uniform vec3 u_lightPos;     // 新增：光源世界坐标

  varying float v_ripple_intensity; // 从 vertex shader 接收强度
  varying vec3 vNormal;             // 新增：接收法线
  varying vec3 vWorldPosition;      // 新增：接收世界坐标

  void main() {
    if (v_ripple_intensity <= 0.05) {
      discard;
    }

    // --- 基本光照计算 ---
    vec3 normal = normalize(vNormal);
    vec3 lightDir = normalize(u_lightPos - vWorldPosition);
    // 计算漫反射光强度 (防止负值)
    float diffuse = max(dot(normal, lightDir), 0.0);
    // 添加一点环境光，让非直射区域不是纯黑
    float ambient = 0.3;
    // 组合光照强度 (可以调整权重)
    float lightIntensity = ambient + diffuse * 0.7;
    // --- ---

    // --- 调整透明度 ---
    float alpha = smoothstep(0.0, 0.6, v_ripple_intensity) * 0.5;

    // 输出颜色 * 光照强度 和 计算出的透明度
    gl_FragColor = vec4(u_ripple_color * lightIntensity, alpha);
  }
`;
// --- ---

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
  grabbing,
  rippleMesh,       // 新增：涟漪效果的 Mesh
  rippleMaterial;   // 新增：涟漪效果的材质

// 球面半径与已有点阵一致
const FLY_LINE_RADIUS = 20;

// 贴图加载
const textureLoader = new THREE.TextureLoader();
const discTexture = textureLoader.load('../img/disc_texture.png');


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

  // 定义光源 (确保在 rippleMaterial 创建之前定义)
  const pointLight = new THREE.PointLight(0x3F273E, 8, 200);
  pointLight.position.set(-50, 0, 60);
  scene.add(pointLight);
  scene.add(new THREE.HemisphereLight(0x3F273E, 0x3F273E, 0.8));

  // --- 创建涟漪层 ---
  const rippleSphereRadius = 20.1;
  const rippleGeometry = new THREE.SphereGeometry(rippleSphereRadius, 64, 64);
  rippleMaterial = new THREE.ShaderMaterial({
    uniforms: {
      u_ripple_center: { value: new THREE.Vector3(0.0, 0.0, 0.0) },
      u_ripple_time: { value: -1.0 },
      // u_ripple_max_radius: { value: 18.0 }, // 已移除作用
      u_ripple_strength: { value: 0.6 },
      u_ripple_width: { value: 3.0 },
      u_ripple_color: { value: new THREE.Color(0x3A264C) }, // 使用你选择的深紫色
      u_lightPos: { value: pointLight.position } // 新增：传递光源位置
    },
    vertexShader: rippleVertexShader,
    fragmentShader: rippleFragmentShader,
    transparent: true,
    depthWrite: false, // 通常涟漪效果不需要写入深度
    // side: THREE.DoubleSide // 如果需要渲染背面，可以取消注释
  });
  rippleMesh = new THREE.Mesh(rippleGeometry, rippleMaterial);
  scene.add(rippleMesh);
  // --- ---

  // Remove the duplicate light declarations below this line
  // const pointLight = new THREE.PointLight(0x3F273E, 8, 200); // REMOVE THIS
  // pointLight.position.set(-50, 0, 60);                      // REMOVE THIS
  // scene.add(pointLight);                                     // REMOVE THIS
  // scene.add(new THREE.HemisphereLight(0x3F273E, 0x3F273E, 0.8)); // REMOVE THIS

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
      // 移除这里的 ripple uniforms
    },
    vertexShader: vertex, // 使用恢复后的 vertex shader
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

  image.src = '../img/world_alpha_mini.jpg';

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

  // 检测点击的是否是基础球体或大陆点
  raycaster.setFromCamera(mouse, camera);
  // 需要检测的对象列表：基础球体和所有大陆点mesh
  const objectsToCheck = [baseMesh, ...scene.children.filter(obj => obj.material && materials.includes(obj.material))];
  const intersects = raycaster.intersectObjects(objectsToCheck, false); // 只检测我们关心的对象

  let clickedOnGlobe = false;
  let intersectPoint = null;

  if (intersects.length > 0) {
    // 确保交点在可见面上 (有时会检测到背面)
    // 简单的处理是直接取第一个交点，或者可以比较交点法线和射线方向
    clickedOnGlobe = true;
    intersectPoint = intersects[0].point; // 获取精确的点击坐标
  }


  if (!clickedOnGlobe) return; // 如果没点到球体，则不继续

  mouseDown = true;
  minMouseDownFlag = false;

  setTimeout(() => {
    minMouseDownFlag = true;
    if (!mouseDown) mouseup(); // 保持原有逻辑
  }, 500);

  document.body.style.cursor = 'grabbing';
  grabbing = true;

  // --- 触发涟漪效果 (更新 rippleMaterial 的 uniforms) ---
  if (intersectPoint && rippleMaterial) {
    // 将交点从世界坐标转换到涟漪球体的本地坐标（如果涟漪球体有位移或旋转，这一步很重要，但现在它在原点，所以世界坐标就是本地坐标）
    // rippleMesh.worldToLocal(intersectPoint.clone()); // 如果 rippleMesh 不在原点或有旋转，需要这步
    rippleMaterial.uniforms.u_ripple_center.value.copy(intersectPoint);
    rippleMaterial.uniforms.u_ripple_time.value = 0.0; // 重置时间开始涟漪
  }
  // --- ---

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

  const delta = 0.016; // 假设大约 60fps

  // 更新大陆点阵的闪烁时间
  materials.forEach(el => {
    if (el.uniforms.u_time) {
      el.uniforms.u_time.value += twinkleTime;
    }
  });

  // --- 更新涟漪层的时间 (修改重置逻辑) ---
  if (rippleMaterial && rippleMaterial.uniforms.u_ripple_time.value >= 0.0) {
    rippleMaterial.uniforms.u_ripple_time.value += delta;

    // --- 基于固定时间重置 ---
    const rippleDuration = 4.0; // 设置一个固定的持续时间 (秒)，例如 4 秒
    if (rippleMaterial.uniforms.u_ripple_time.value > rippleDuration) {
      rippleMaterial.uniforms.u_ripple_time.value = -1.0; // 设为负数停止
    }
    // --- ---

    // --- (旧的基于半径的重置逻辑 - 已移除) ---
    // const maxRadius = rippleMaterial.uniforms.u_ripple_max_radius.value;
    // const diffusionSpeed = 8.0; // 与 vertex shader 中的速度匹配
    // const maxTime = maxRadius / diffusionSpeed;
    // if (rippleMaterial.uniforms.u_ripple_time.value > maxTime + 1.0) {
    //     rippleMaterial.uniforms.u_ripple_time.value = -1.0;
    // }
    // --- ---
  }
  // --- ---

  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(render.bind(this))

}

setScene();