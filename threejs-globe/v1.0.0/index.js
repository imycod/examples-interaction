import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLOBE_CONFIG, DEMO_FLIGHT_PATHS } from './config.js';
import { shaders } from './shaders.js';
import { FlyLineAnimator } from './FlyLineAnimator.js';

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
const FLY_LINE_RADIUS = GLOBE_CONFIG.FLY_LINE.RADIUS;

// 飞线参数
const FLY_LINE_PARAMS = {
  HEIGHT: GLOBE_CONFIG.FLY_LINE.HEIGHT,
  TUBE_RADIUS: GLOBE_CONFIG.FLY_LINE.TUBE_RADIUS,
  SPRITE_SCALE: GLOBE_CONFIG.FLY_LINE.SPRITE_SCALE
};

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

// 生成球面两点间的严格大圆弧（所有点都在球面外1.8高度）
function createFlyArcPoints(from, to, segments = 100) {
  const r0 = FLY_LINE_RADIUS;
  const r1 = FLY_LINE_RADIUS + FLY_LINE_PARAMS.HEIGHT;
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

// 添加飞线（使用TubeGeometry替代Line）
function addFlyLine(from, to, colorA = 0xffa500, colorB = 0x00ffcc) {
  const segments = 100;
  const points = createFlyArcPoints(from, to, segments);

  // 创建曲线
  const curve = new THREE.CatmullRomCurve3(points);

  // 使用TubeGeometry创建管状几何体
  const tubeGeometry = new THREE.TubeGeometry(curve, segments, FLY_LINE_PARAMS.TUBE_RADIUS, 8, false);

  // 创建材质
  const tubeMaterial = new THREE.MeshPhongMaterial({
    color: colorA,
    transparent: true,
    opacity: 0.8
  });

  const tube = new THREE.Mesh(tubeGeometry, tubeMaterial);
  tube.visible = false;
  scene.add(tube);

  // 端点Sprite
  function createDiscSprite(pos, color) {
    const spriteMat = new THREE.SpriteMaterial({
      map: discTexture,
      color: color,
      transparent: true,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.position.copy(pos);
    sprite.scale.set(FLY_LINE_PARAMS.SPRITE_SCALE, FLY_LINE_PARAMS.SPRITE_SCALE, FLY_LINE_PARAMS.SPRITE_SCALE);
    scene.add(sprite);
    return sprite;
  }
  const startSprite = createDiscSprite(points[0], colorA);
  const endSprite = createDiscSprite(points[points.length - 1], colorB);
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
    tube.visible = true;
    startSprite.visible = true;
    endSprite.visible = false;

    // 更新颜色
    const updateColors = (t) => {
      // t: 0~1，0全A色，1全B色
      const color = new THREE.Color().lerpColors(
        new THREE.Color(colorA),
        new THREE.Color(colorB),
        t
      );
      tubeMaterial.color = color;
    };

    function grow() {
      if (phase === 0) {
        // 生长阶段
        head += growSpeed;
        if (head > points.length) head = points.length;
        const subPoints = points.slice(0, head);
        const subCurve = new THREE.CatmullRomCurve3(subPoints);
        tube.geometry = new THREE.TubeGeometry(subCurve, segments, FLY_LINE_PARAMS.TUBE_RADIUS, 8, false);
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
            if (t < 1) {
              requestAnimationFrame(colorFade);
            } else {
              phase = 1;
              setTimeout(grow, 300);
            }
          }
          colorFade();
        }
      } else if (phase === 1) {
        // Shrinking phase
        if (tail === 0) {
          startSprite.visible = false;
        }

        tail += shrinkSpeed;

        // Check if there are enough points remaining to create a valid curve
        if (tail >= points.length - 2) {
          // When we don't have enough points for a valid curve, end the animation
          tube.visible = false;
          startSprite.visible = false;
          endSprite.visible = false;

          // Reset state and delay next animation cycle
          setTimeout(() => {
            head = 1;
            tail = 0;
            phase = 0;
            setTimeout(animateLine, loopDelay);
          }, 500);
          return;
        }

        const subPoints = points.slice(tail, points.length);
        const subCurve = new THREE.CatmullRomCurve3(subPoints);
        tube.geometry = new THREE.TubeGeometry(subCurve, segments, FLY_LINE_PARAMS.TUBE_RADIUS, 8, false);
        updateColors(1); // 全B色

        // Hide end sprite when we're close to the end (improved logic)
        if (subPoints.length <= 5) { // Increased threshold for smoother transition
          endSprite.visible = false;
        }

        requestAnimationFrame(grow);
      }
    }
    grow();
  }
  // 随机延迟启动动画
  setTimeout(animateLine, Math.random() * 1500);
}

const setScene = () => {

  sizes = {
    width: container.offsetWidth,
    height: container.offsetHeight
  };

  scene = new THREE.Scene();

  // 使用配置
  camera = new THREE.PerspectiveCamera(
    GLOBE_CONFIG.CAMERA.FOV,
    sizes.width / sizes.height,
    GLOBE_CONFIG.CAMERA.NEAR,
    GLOBE_CONFIG.CAMERA.FAR
  );

  camera.position.z = 100;

  renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: false,
    alpha: true
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const pointLight = new THREE.PointLight(
    GLOBE_CONFIG.LIGHT.POINT.COLOR,
    GLOBE_CONFIG.LIGHT.POINT.INTENSITY,
    GLOBE_CONFIG.LIGHT.POINT.DISTANCE
  );
  pointLight.position.set(...GLOBE_CONFIG.LIGHT.POINT.POSITION);
  scene.add(pointLight);

  scene.add(new THREE.HemisphereLight(
    GLOBE_CONFIG.LIGHT.HEMISPHERE.SKY_COLOR,
    GLOBE_CONFIG.LIGHT.HEMISPHERE.GROUND_COLOR,
    GLOBE_CONFIG.LIGHT.HEMISPHERE.INTENSITY
  ));

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
  resize();
  listenTo();
  render();
}

const setControls = () => {

  controls = new OrbitControls(camera, renderer.domElement);
  controls.autoRotate = true;
  controls.autoRotateSpeed = GLOBE_CONFIG.CONTROLS.AUTO_ROTATE_SPEED;
  controls.enableDamping = true;
  controls.enableRotate = true;
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.minPolarAngle = GLOBE_CONFIG.CONTROLS.POLAR_ANGLE.MIN;
  controls.maxPolarAngle = GLOBE_CONFIG.CONTROLS.POLAR_ANGLE.MAX;
};

const setBaseSphere = () => {
  const baseSphere = new THREE.SphereGeometry(
    GLOBE_CONFIG.SPHERE.BASE_RADIUS,
    35,
    35
  );
  const baseMaterial = new THREE.MeshStandardMaterial({
    color: GLOBE_CONFIG.SPHERE.BASE_COLOR,
    transparent: true,
    opacity: GLOBE_CONFIG.SPHERE.BASE_OPACITY
  });
  baseMesh = new THREE.Mesh(baseSphere, baseMaterial);
  scene.add(baseMesh);
};

const setShaderMaterial = () => {

  twinkleTime = GLOBE_CONFIG.SHADER.TWINKLE_TIME;
  materials = [];
  material = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      u_time: { value: 1.0 },
      u_maxExtrusion: { value: GLOBE_CONFIG.SHADER.EXTRUSION.DEFAULT }
    },
    vertexShader: shaders.vertex,
    fragmentShader: shaders.fragment,
  });
};

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

  if (!isIntersecting) return;

  materials.forEach(el => {
    gsap.to(
      el.uniforms.u_maxExtrusion,
      {
        value: 1.02
      }
    );
  });

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
const flyLineAnimator = new FlyLineAnimator(scene, textureLoader);
DEMO_FLIGHT_PATHS.forEach(path => {
  flyLineAnimator.createFlyLine(path.from, path.to, path.colorA, path.colorB);
});