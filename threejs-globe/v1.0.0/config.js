export const GLOBE_CONFIG = {
  // 球体相关
  SPHERE: {
    RADIUS: 20,          // 球面半径
    BASE_RADIUS: 19.5,   // 基础球体半径
    BASE_COLOR: '#112C54',
    BASE_OPACITY: 0.9,
    DOT_DENSITY: 2.5,    // 点阵密度
    DOT_SIZE: 0.1       // 点阵大小
  },

  // 飞线相关
  FLY_LINE: {
    RADIUS: 20,         // 飞线球面半径
    HEIGHT: 3.6,        // 飞线最大弧高
    TUBE_RADIUS: 0.08,  // 飞线管道半径
    SPRITE_SCALE: 0.8,  // 端点大小
    SEGMENTS: 100,      // 线段数量
    OPACITY: 0.8       // 飞线透明度
  },

  // 相机参数
  CAMERA: {
    FOV: 30,
    NEAR: 1,
    FAR: 1000,
    POSITION: {
      DESKTOP: 100,    // >700px
      MOBILE: 140      // <=700px
    }
  },

  // 光照参数
  LIGHT: {
    POINT: {
      COLOR: 0x081b26,
      INTENSITY: 17,
      DISTANCE: 200,
      POSITION: [-50, 0, 60]
    },
    HEMISPHERE: {
      SKY_COLOR: 0xffffbb,
      GROUND_COLOR: 0x080820,
      INTENSITY: 1.5
    }
  },

  // 控制器参数
  CONTROLS: {
    AUTO_ROTATE_SPEED: 1.2,
    POLAR_ANGLE: {
      MIN: Math.PI / 2 - 0.5,
      MAX: Math.PI / 2 + 0.5
    }
  },

  // 着色器动画参数
  SHADER: {
    TWINKLE_TIME: 0.03,
    EXTRUSION: {
      DEFAULT: 1.0,
      ACTIVE: 1.02
    }
  }
};

// --- 添加飞线示例 ---
// 示例飞线路径配置
export const DEMO_FLIGHT_PATHS = [
  {
    from: { lon: 116.4074, lat: 39.9042 },
    to: { lon: -74.0060, lat: 40.7128 },
    colorA: 0xffa500,
    colorB: 0x00ffcc
  },
  {
    from: { lon: -0.1276, lat: 51.5074 },
    to: { lon: 151.2093, lat: -33.8688 },
    colorA: 0x00ffcc,
    colorB: 0xffa500
  },
  {
    from: { lon: 139.6917, lat: 35.6895 },
    to: { lon: -122.4194, lat: 37.7749 },
    colorA: 0x00ff00,
    colorB: 0xff00ff
  },
  {
    from: { lon: 2.3522, lat: 48.8566 },
    to: { lon: 18.4241, lat: -33.9249 },
    colorA: 0xff00ff,
    colorB: 0x00ffff
  },
  {
    from: { lon: 103.8198, lat: 1.3521 },
    to: { lon: -118.2437, lat: 34.0522 },
    colorA: 0x00ffff,
    colorB: 0xffff00
  },
  {
    from: { lon: 55.2708, lat: 25.2048 },
    to: { lon: -43.1729, lat: -22.9068 },
    colorA: 0xffff00,
    colorB: 0xffa500
  },
  {
    from: { lon: -0.1276, lat: 35.6895 },
    to: { lon: 151.2093, lat: -33.8688 },
    colorA: 0x00ffcc,
    colorB: 0xffa500
  }
];