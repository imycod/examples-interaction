import { GLOBE_CONFIG } from './config.js';
import * as THREE from 'three';

export class FlyLineAnimator {
  constructor(scene, textureLoader) {
    this.scene = scene;
    this.discTexture = textureLoader.load('../img/disc_texture.png');
    // 从配置中获取飞线参数
    this.FLY_LINE_RADIUS = GLOBE_CONFIG.FLY_LINE.RADIUS;
    this.FLY_LINE_PARAMS = {
      HEIGHT: GLOBE_CONFIG.FLY_LINE.HEIGHT,
      TUBE_RADIUS: GLOBE_CONFIG.FLY_LINE.TUBE_RADIUS,
      SPRITE_SCALE: GLOBE_CONFIG.FLY_LINE.SPRITE_SCALE
    };
  }

  // 经纬度转球面坐标
  latLonToVec3(lon, lat, radius = this.FLY_LINE_RADIUS) {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lon + 180) * (Math.PI / 180);
    const x = -(radius * Math.sin(phi) * Math.cos(theta));
    const z = (radius * Math.sin(phi) * Math.sin(theta));
    const y = (radius * Math.cos(phi));
    return new THREE.Vector3(x, y, z);
  }

  // 生成球面两点间的大圆弧点
  createFlyArcPoints(from, to, segments = 100) {
    const r0 = this.FLY_LINE_RADIUS;
    const r1 = this.FLY_LINE_RADIUS + this.FLY_LINE_PARAMS.HEIGHT;
    const v0 = this.latLonToVec3(from.lon, from.lat, r0);
    const v1 = this.latLonToVec3(to.lon, to.lat, r0);
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

  // 创建飞线相关的网格对象
  createMeshes(points, colorA, colorB) {
    const segments = 100;
    // 创建曲线
    const curve = new THREE.CatmullRomCurve3(points);
    // 创建管状几何体
    const tubeGeometry = new THREE.TubeGeometry(curve, segments, this.FLY_LINE_PARAMS.TUBE_RADIUS, 8, false);
    // 创建材质
    const tubeMaterial = new THREE.MeshPhongMaterial({
      color: colorA,
      transparent: true,
      opacity: 0.8
    });
    const tube = new THREE.Mesh(tubeGeometry, tubeMaterial);
    tube.visible = false;
    this.scene.add(tube);

    // 创建端点精灵
    const createDiscSprite = (pos, color) => {
      const spriteMat = new THREE.SpriteMaterial({
        map: this.discTexture,
        color: color,
        transparent: true,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.position.copy(pos);
      sprite.scale.set(this.FLY_LINE_PARAMS.SPRITE_SCALE, this.FLY_LINE_PARAMS.SPRITE_SCALE, this.FLY_LINE_PARAMS.SPRITE_SCALE);
      this.scene.add(sprite);
      return sprite;
    };

    const startSprite = createDiscSprite(points[0], colorA);
    const endSprite = createDiscSprite(points[points.length - 1], colorB);
    startSprite.visible = false;
    endSprite.visible = false;

    return { tube, startSprite, endSprite };
  }

  // 动画控制
  animateLine(tube, startSprite, endSprite, points, colorA, colorB) {
    const segments = 100;
    const tubeMaterial = tube.material;
    // 随机速度和循环间隔
    const growSpeed = 1 + Math.random() * 2.5; // 1~3.5
    const shrinkSpeed = 1 + Math.random() * 2.5; // 1~3.5
    const loopDelay = 500 + Math.random() * 2000; // 0.5~2.5s

    const updateColors = (t) => {
      const color = new THREE.Color().lerpColors(
        new THREE.Color(colorA),
        new THREE.Color(colorB),
        t
      );
      tubeMaterial.color = color;
    };

    const animate = () => {
      let head = 1;
      let tail = 0;
      let phase = 0;
      tube.visible = true;
      startSprite.visible = true;
      endSprite.visible = false;

      function grow() {
        if (phase === 0) {
          head += growSpeed;
          if (head > points.length) head = points.length;
          const subPoints = points.slice(0, head);
          const subCurve = new THREE.CatmullRomCurve3(subPoints);
          tube.geometry = new THREE.TubeGeometry(subCurve, segments, this.FLY_LINE_PARAMS.TUBE_RADIUS, 8, false);
          updateColors(0);

          if (head < points.length) {
            requestAnimationFrame(grow.bind(this));
          } else {
            endSprite.visible = true;
            let t = 0;
            const colorFade = () => {
              t += 0.05;
              if (t > 1) t = 1;
              updateColors(t);
              if (t < 1) {
                requestAnimationFrame(colorFade);
              } else {
                phase = 1;
                setTimeout(grow.bind(this), 300);
              }
            };
            colorFade();
          }
        } else if (phase === 1) {
          if (tail === 0) {
            startSprite.visible = false;
          }

          tail += shrinkSpeed;

          if (tail >= points.length - 2) {
            tube.visible = false;
            startSprite.visible = false;
            endSprite.visible = false;

            setTimeout(() => {
              head = 1;
              tail = 0;
              phase = 0;
              setTimeout(animate, loopDelay);
            }, 500);
            return;
          }

          const subPoints = points.slice(tail, points.length);
          const subCurve = new THREE.CatmullRomCurve3(subPoints);
          tube.geometry = new THREE.TubeGeometry(subCurve, segments, this.FLY_LINE_PARAMS.TUBE_RADIUS, 8, false);
          updateColors(1);

          if (subPoints.length <= 5) {
            endSprite.visible = false;
          }

          requestAnimationFrame(grow.bind(this));
        }
      }

      grow.bind(this)();
    };

    setTimeout(animate, Math.random() * 1500);
  }

  createFlyLine(from, to, colorA, colorB) {
    const points = this.createFlyArcPoints(from, to);
    const { tube, startSprite, endSprite } = this.createMeshes(points, colorA, colorB);
    this.animateLine(tube, startSprite, endSprite, points, colorA, colorB);
  }
}