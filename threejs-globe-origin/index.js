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

  vec3 colorA = vec3(0.196, 0.631, 0.886);
  vec3 colorB = vec3(0.192, 0.384, 0.498);

  void main() {

    vec3  color = vec3(0.0);
    float pct   = abs(sin(u_time));
          color = mix(colorA, colorB, pct);

    gl_FragColor = vec4(color, 1.0);

  }
`;

const container = document.querySelector('.container');
const canvas    = document.querySelector('.canvas');

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
const arcTextures = [
  textureLoader.load('img/arc-texture-1.png'),
  textureLoader.load('img/arc-texture-2.png'),
  textureLoader.load('img/arc-texture-3.png'),
  textureLoader.load('img/arc-texture-4.png'),
];
const discTexture = textureLoader.load('img/disc_texture.png');

// 经纬度转球面坐标（与已有calcPosFromLatLonRad一致，便于独立调用）
function latLonToVec3(lon, lat, radius = FLY_LINE_RADIUS) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z = (radius * Math.sin(phi) * Math.sin(theta));
  const y = (radius * Math.cos(phi));
  return new THREE.Vector3(x, y, z);
}

// 生成球面两点间的严格大圆弧（所有点都在球面外1.8高度）
function createFlyArcPoints(from, to, segments = 100) {
  const r0 = FLY_LINE_RADIUS;
  const r1 = FLY_LINE_RADIUS + 1.8;
  const v0 = latLonToVec3(from.lon, from.lat, r0);
  const v1 = latLonToVec3(to.lon, to.lat, r0);
  const points = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    // 半径插值：中间最大，两端最小
    const arcRadius = r0 + (r1 - r0) * Math.sin(Math.PI * t);
    // 球面插值方向
    const dir = new THREE.Vector3().copy(v0).lerp(v1, t).normalize();
    points.push(dir.multiplyScalar(arcRadius));
  }
  return points;
}

// 添加飞线（TubeGeometry+贴图，起止点Sprite，渐变色）
function addFlyLine(from, to, colorA = 0xffa500, colorB = 0x00ffcc) {
  const segments = 100;
  const points = createFlyArcPoints(from, to, segments);
  // 线条用Line+vertexColors
  const geometry = new THREE.BufferGeometry();
  geometry.setFromPoints(points);
  // 顶点色初始化为A色
  const colors = [];
  for (let i = 0; i < points.length; i++) {
    colors.push(...new THREE.Color(colorA).toArray());
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const mat = new THREE.LineBasicMaterial({ vertexColors: true, linewidth: 2 });
  const line = new THREE.Line(geometry, mat);
  line.visible = false;
  scene.add(line);

  // 起点和终点Sprite
  function createDiscSprite(pos, color) {
    const spriteMat = new THREE.SpriteMaterial({
      map: discTexture,
      color: color,
      transparent: true,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.position.copy(pos);
    sprite.scale.set(0.4, 0.4, 0.4);
    scene.add(sprite);
    return sprite;
  }
  const startSprite = createDiscSprite(points[0], colorA);
  const endSprite = createDiscSprite(points[points.length-1], colorB);
  startSprite.visible = false;
  endSprite.visible = false;

  // 随机速度和循环间隔
  const growSpeed = 1 + Math.random() * 2.5; // 1~3.5
  const shrinkSpeed = 1 + Math.random() * 2.5; // 1~3.5
  const loopDelay = 500 + Math.random() * 2000; // 0.5~2.5s

  // 动画：1.头部生长 2.尾部追头部缩短 3.渐变色
  function animateLine() {
    let head = 1; // 头部索引
    let tail = 0; // 尾部索引
    let phase = 0; // 0:生长 1:缩短
    line.visible = true;
    startSprite.visible = true;
    endSprite.visible = false;
    // 初始化为A色
    const updateColors = (t) => {
      // t: 0~1，0全A色，1全B色
      const arr = [];
      for (let i = 0; i < points.length; i++) {
        const c = new THREE.Color().lerpColors(
          new THREE.Color(colorA),
          new THREE.Color(colorB),
          i / (points.length-1) * t
        );
        arr.push(c.r, c.g, c.b);
      }
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(arr, 3));
    };
    function grow() {
      if (phase === 0) {
        // 生长阶段
        head += growSpeed;
        if (head > points.length) head = points.length;
        const subPoints = points.slice(0, head);
        line.geometry.setFromPoints(subPoints);
        updateColors(0); // 全A色
        if (head < points.length) {
          requestAnimationFrame(grow);
        } else {
          // 到达B点，显示B点Sprite，渐变色
          endSprite.visible = true;
          let t = 0;
          function colorFade() {
            t += 0.05;
            if (t > 1) t = 1;
            updateColors(t);
            // 线条渐变时，endSprite颜色保持B色
            if (t < 1) {
              requestAnimationFrame(colorFade);
            } else {
              phase = 1;
              setTimeout(grow, 300); // 渐变后短暂停留
            }
          }
          colorFade();
        }
      } else if (phase === 1) {
        // 缩短阶段
        if (tail === 0) {
          // 缩短阶段开始时，A点Sprite立即消失
          startSprite.visible = false;
        }
        tail += shrinkSpeed;
        if (tail >= points.length) tail = points.length-1;
        const subPoints = points.slice(tail, points.length);
        line.geometry.setFromPoints(subPoints);
        updateColors(1); // 全B色
        if (subPoints.length === 1) {
          endSprite.visible = false;
        }
        if (tail < points.length-2) {
          requestAnimationFrame(grow);
        } else {
          // 结束，全部隐藏，重置
          setTimeout(() => {
            line.visible = false;
            startSprite.visible = false;
            endSprite.visible = false;
            head = 1;
            tail = 0;
            phase = 0;
            setTimeout(animateLine, loopDelay);
          }, 500);
        }
      }
    }
    grow();
  }
  // 随机延迟启动动画
  setTimeout(animateLine, Math.random() * 1500);
}

const setScene = () => {

  sizes = {
    width:  container.offsetWidth,
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
    canvas:     canvas,
    antialias:  false,
    alpha:      true
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const pointLight = new THREE.PointLight(0x081b26, 17, 200);
  pointLight.position.set(-50, 0, 60);
  scene.add(pointLight);
  scene.add(new THREE.HemisphereLight(0xffffbb, 0x080820, 1.5));

  raycaster         = new THREE.Raycaster();
  mouse             = new THREE.Vector2();
  isIntersecting    = false;
  minMouseDownFlag  = false;
  mouseDown         = false;
  grabbing          = false;

  setControls();
  setBaseSphere();
  setShaderMaterial();
  setMap();
  resize();
  listenTo();
  render();

  // --- 添加飞线示例 ---
  addFlyLine({ lon: 116.4074, lat: 39.9042 }, { lon: -74.0060, lat: 40.7128 }, 0xffa500, 0x00ffcc);
  addFlyLine({ lon: -0.1276, lat: 51.5074 }, { lon: 151.2093, lat: -33.8688 }, 0x00ffcc, 0xffa500);
  addFlyLine({ lon: 139.6917, lat: 35.6895 }, { lon: -122.4194, lat: 37.7749 }, 0x00ff00, 0xff00ff);
  addFlyLine({ lon: 2.3522, lat: 48.8566 }, { lon: 18.4241, lat: -33.9249 }, 0xff00ff, 0x00ffff);
  addFlyLine({ lon: 103.8198, lat: 1.3521 }, { lon: -118.2437, lat: 34.0522 }, 0x00ffff, 0xffff00);
  addFlyLine({ lon: 55.2708, lat: 25.2048 }, { lon: -43.1729, lat: -22.9068 }, 0xffff00, 0xffa500);

}

const setControls = () => {

  controls                 = new OrbitControls(camera, renderer.domElement);
  controls.autoRotate      = true;
  controls.autoRotateSpeed = 1.2;
  controls.enableDamping   = true;
  controls.enableRotate    = true;
  controls.enablePan       = false;
  controls.enableZoom      = false;
  controls.minPolarAngle   = (Math.PI / 2) - 0.5;
  controls.maxPolarAngle   = (Math.PI / 2) + 0.5;

};

const setBaseSphere = () => {

  const baseSphere   = new THREE.SphereGeometry(19.5, 35, 35);
  const baseMaterial = new THREE.MeshStandardMaterial({
    color:      '#112C54', 
    transparent:  true, 
    opacity:      0.9
  });
  baseMesh = new THREE.Mesh(baseSphere, baseMaterial);
  scene.add(baseMesh);

}

const setShaderMaterial = () => {

  twinkleTime  = 0.03;
  materials    = [];
  material     = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      u_time:         { value: 1.0 },
      u_maxExtrusion: { value: 1.0 }
    },
    vertexShader:   vertex,
    fragmentShader: fragment,
  });

}

const setMap = () => {

  let   activeLatLon    = {};
  const dotSphereRadius = 20;

  const readImageData = (imageData) => {

    for(
      let i = 0, lon = -180, lat = 90; 
      i < imageData.length; 
      i += 4, lon++
    ) {

      if(!activeLatLon[lat]) activeLatLon[lat] = [];

      const red   = imageData[i];
      const green = imageData[i + 1];
      const blue  = imageData[i + 2];

      if(red < 80 && green < 80 && blue < 80)
        activeLatLon[lat].push(lon);

      if(lon === 180) {
        lon = -180;
        lat--;
      }

    }

  }

  const visibilityForCoordinate = (lon, lat) => {

    let visible = false;

    if(!activeLatLon[lat].length) return visible;

    const closest = activeLatLon[lat].reduce((prev, curr) => {
      return (Math.abs(curr - lon) < Math.abs(prev - lon) ? curr : prev);
    });

    if(Math.abs(lon - closest) < 0.5) visible = true;

    return visible;

  }

  const calcPosFromLatLonRad = (lon, lat) => {
  
    var phi   = (90 - lat)  * (Math.PI / 180);
    var theta = (lon + 180) * (Math.PI / 180);

    const x = -(dotSphereRadius * Math.sin(phi) * Math.cos(theta));
    const z = (dotSphereRadius * Math.sin(phi) * Math.sin(theta));
    const y = (dotSphereRadius * Math.cos(phi));
  
    return new THREE.Vector3(x, y, z);

  }

  const createMaterial = (timeValue) => {

    const mat                 = material.clone();
    mat.uniforms.u_time.value = timeValue * Math.sin(Math.random());
    materials.push(mat);
    return mat;

  }

  const setDots = () => {

    const dotDensity  = 2.5;
    let   vector      = new THREE.Vector3();

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

        const m     = createMaterial(i);
        const mesh  = new THREE.Mesh(dotGeometry, m);

        scene.add(mesh);

      }

    }

  }
  
  const image   = new Image;
  image.onload  = () => {

    image.needsUpdate  = true;

    const imageCanvas  = document.createElement('canvas');
    imageCanvas.width  = image.width;
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

  image.src = 'img/world_alpha_mini.jpg';

}

const resize = () => {

  sizes = {
    width:  container.offsetWidth,
    height: container.offsetHeight
  };

  if(window.innerWidth > 700) camera.position.z = 100;
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
  if(intersects[0]) {
    isIntersecting = true;
    if(!grabbing) document.body.style.cursor = 'pointer';
  }
  else {
    if(!grabbing) document.body.style.cursor = 'default';
  }

}

const mousedown = () => {

  if(!isIntersecting) return;

  materials.forEach(el => {
    gsap.to(
      el.uniforms.u_maxExtrusion, 
      {
        value: 1.02
      }
    );
  });

  mouseDown         = true;
  minMouseDownFlag  = false;

  setTimeout(() => {
    minMouseDownFlag = true;
    if(!mouseDown) mouseup();
  }, 500);

  document.body.style.cursor  = 'grabbing';
  grabbing                    = true;

}

const mouseup = () => {

  mouseDown = false;
  if(!minMouseDownFlag) return;

  materials.forEach(el => {
    gsap.to(
      el.uniforms.u_maxExtrusion, 
      {
        value:    1.0, 
        duration: 0.15
      }
    );
  });

  grabbing = false;
  if(isIntersecting) document.body.style.cursor = 'pointer';
  else document.body.style.cursor = 'default';

}

const listenTo = () => {

  window.addEventListener('resize',     resize.bind(this));
  window.addEventListener('mousemove',  mousemove.bind(this));
  window.addEventListener('mousedown',  mousedown.bind(this));
  window.addEventListener('mouseup',    mouseup.bind(this));

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