import { useEffect, useRef, useState } from 'react';

const HIGH_SCORE_KEY = 'propard_offline_highscore_v1';

const OBSTACLE_TYPES = [
  { label: 'PROPARD', icon: 'P', type: 'logo' },
  { label: 'MESSAGES', icon: '▰', type: 'messages' },
  { label: 'PROFIL', icon: '●', type: 'profile' },
  { label: 'AMIS', icon: '●●', type: 'friends' },
  { label: 'PARAMÈTRES', icon: '⚙', type: 'settings' },
  { label: 'NOTIFS', icon: '●', type: 'notification' },
  { label: 'VERROU', icon: '▣', type: 'lock' },
  { label: 'DÉCONNEXION', icon: '↪', type: 'logout' },
  { label: 'SUPPRIMER', icon: '×', type: 'delete' },
  { label: 'AJOUTER', icon: '+', type: 'add' }
];

function getThemeColors() {
  const root = getComputedStyle(document.documentElement);

  return {
    bg: root.getPropertyValue('--bg-primary').trim() || '#0e0f13',
    secondary: root.getPropertyValue('--bg-secondary').trim() || '#16181f',
    tertiary: root.getPropertyValue('--bg-tertiary').trim() || '#1e2028',
    hover: root.getPropertyValue('--bg-hover').trim() || '#252830',
    text: root.getPropertyValue('--text-primary').trim() || '#f0f0f5',
    secondaryText:
      root.getPropertyValue('--text-secondary').trim() || '#8b8fa8',
    muted: root.getPropertyValue('--text-muted').trim() || '#555870',
    accent: root.getPropertyValue('--accent').trim() || '#5b8af0',
    danger: root.getPropertyValue('--danger').trim() || '#f05b5b',
    success: root.getPropertyValue('--success').trim() || '#5bf07a',
    border: root.getPropertyValue('--border').trim() || '#2a2d3a'
  };
}

function random(min, max) {
  return Math.random() * (max - min) + min;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function withAlpha(color, alpha) {
  if (!color) return `rgba(91, 138, 240, ${alpha})`;

  const value = color.trim();

  if (value.startsWith('#')) {
    let hex = value.slice(1);

    if (hex.length === 3) {
      hex = hex
        .split('')
        .map(char => char + char)
        .join('');
    }

    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);

      if (
        Number.isFinite(r) &&
        Number.isFinite(g) &&
        Number.isFinite(b)
      ) {
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
      }
    }
  }

  const rgbMatch = value.match(
    /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*[\d.]+)?\s*\)$/i
  );

  if (rgbMatch) {
    return `rgba(${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]}, ${alpha})`;
  }

  return color;
}

export default function OfflineGame({
  onRetry,
  manual = false
}) {
  const canvasRef = useRef(null);
  const wrapperRef = useRef(null);

  const [started, setStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [score, setScore] = useState(0);

  const [highScore, setHighScore] = useState(() => {
    try {
      return Number(localStorage.getItem(HIGH_SCORE_KEY)) || 0;
    } catch {
      return 0;
    }
  });

  const gameRef = useRef({
    running: false,
    score: 0,
    highScore: 0,

    player: {
      x: 0,
      y: 0,
      targetX: 0,
      vx: 0,
      rotation: 0
    },

    obstacles: [],
    particles: [],
    stars: [],
    floatingTexts: [],

    spawnTimer: 0,
    lastTime: 0,
    animationFrame: null,

    width: 0,
    height: 0,
    colors: null,

    pointerActive: false
  });

  useEffect(() => {
    const game = gameRef.current;
    game.highScore = highScore;
  }, [highScore]);

  const saveHighScore = value => {
    try {
      localStorage.setItem(
        HIGH_SCORE_KEY,
        String(value)
      );
    } catch {
      // localStorage peut être indisponible.
    }
  };

  const createStars = (width, height) => {
    const count = Math.max(
      45,
      Math.floor((width * height) / 11000)
    );

    return Array.from(
      { length: count },
      () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        size: random(0.5, 2.2),
        speed: random(0.08, 0.4),
        alpha: random(0.2, 0.9),
        phase: random(0, Math.PI * 2)
      })
    );
  };

  const resizeCanvas = () => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;

    if (!canvas || !wrapper) return;

    const rect = wrapper.getBoundingClientRect();
    const dpr = Math.min(
      window.devicePixelRatio || 1,
      2
    );

    const width = Math.max(
      320,
      rect.width
    );

    const height = Math.max(
      500,
      rect.height
    );

    canvas.width = Math.floor(
      width * dpr
    );

    canvas.height = Math.floor(
      height * dpr
    );

    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');

    if (ctx) {
      ctx.setTransform(
        dpr,
        0,
        0,
        dpr,
        0,
        0
      );
    }

    const game = gameRef.current;

    game.width = width;
    game.height = height;
    game.colors = getThemeColors();

    if (!game.player.x) {
      game.player.x = width / 2;
      game.player.targetX = width / 2;
    } else {
      game.player.x = clamp(
        game.player.x,
        30,
        width - 30
      );

      game.player.targetX = clamp(
        game.player.targetX,
        30,
        width - 30
      );
    }

    game.player.y = height * 0.76;

    if (!game.stars.length) {
      game.stars = createStars(
        width,
        height
      );
    }
  };

  useEffect(() => {
    resizeCanvas();

    window.addEventListener(
      'resize',
      resizeCanvas
    );

    const observer =
      new ResizeObserver(
        resizeCanvas
      );

    if (wrapperRef.current) {
      observer.observe(
        wrapperRef.current
      );
    }

    return () => {
      window.removeEventListener(
        'resize',
        resizeCanvas
      );

      observer.disconnect();
    };
  }, []);

  const resetGame = () => {
    const game = gameRef.current;

    game.score = 0;
    game.spawnTimer = 0;

    game.obstacles = [];
    game.particles = [];
    game.floatingTexts = [];

    game.lastTime = performance.now();

    game.player.x =
      game.width / 2;

    game.player.targetX =
      game.width / 2;

    game.player.vx = 0;
    game.player.rotation = 0;

    setScore(0);
    setGameOver(false);
    setStarted(true);

    game.running = true;
  };

  const endGame = () => {
    const game = gameRef.current;

    if (!game.running) return;

    game.running = false;

    const finalScore =
      game.score;

    if (
      finalScore >
      game.highScore
    ) {
      game.highScore =
        finalScore;

      setHighScore(
        finalScore
      );

      saveHighScore(
        finalScore
      );
    }

    setGameOver(true);
  };

  const spawnObstacle = () => {
    const game =
      gameRef.current;

    const difficulty =
      Math.min(
        game.score / 50,
        1
      );

    const width =
      random(72, 138);

    const height =
      random(42, 72);

    const obstacle = {
      x: random(
        width / 2 + 12,
        game.width -
          width / 2 -
          12
      ),

      y:
        -height -
        random(20, 100),

      width,
      height,

      rotation:
        random(
          -0.12,
          0.12
        ),

      rotationSpeed:
        random(
          -0.0015,
          0.0015
        ),

      phase:
        random(
          0,
          Math.PI * 2
        ),

      phaseSpeed:
        random(
          0.0015,
          0.003
        ),

      speed:
        random(130, 175) +
        difficulty * 80,

      type:
        OBSTACLE_TYPES[
          Math.floor(
            Math.random() *
              OBSTACLE_TYPES.length
          )
        ],

      passed: false
    };

    game.obstacles.push(
      obstacle
    );
  };

  const addParticles = (
    x,
    y,
    amount,
    speedMultiplier = 1
  ) => {
    const game =
      gameRef.current;

    for (
      let i = 0;
      i < amount;
      i++
    ) {
      const angle =
        random(
          0,
          Math.PI * 2
        );

      const speed =
        random(
          30,
          130
        ) *
        speedMultiplier;

      const life =
        random(
          0.3,
          0.9
        );

      game.particles.push({
        x,
        y,

        vx:
          Math.cos(angle) *
          speed,

        vy:
          Math.sin(angle) *
          speed,

        life,
        maxLife: life,

        size:
          random(
            1.5,
            4
          ),

        gravity:
          random(
            10,
            35
          )
      });
    }
  };

  const addFloatingText = (
    x,
    y,
    text
  ) => {
    gameRef.current.floatingTexts.push({
      x,
      y,
      text,
      life: 0.9,
      maxLife: 0.9,
      vy: -35
    });
  };

  const checkCollision =
    obstacle => {
      const game =
        gameRef.current;

      const player =
        game.player;

      const px =
        player.x;

      const py =
        player.y;

      const halfW =
        obstacle.width *
        0.43;

      const halfH =
        obstacle.height *
        0.43;

      return (
        px >
          obstacle.x -
            halfW -
            15 &&
        px <
          obstacle.x +
            halfW +
            15 &&
        py >
          obstacle.y -
            halfH -
            18 &&
        py <
          obstacle.y +
            halfH +
            18
      );
    };

  const update = dt => {
    const game =
      gameRef.current;

    if (!game.running)
      return;

    const speedMultiplier =
      1 +
      Math.min(
        game.score / 70,
        1.25
      );

    game.player.x +=
      (
        game.player.targetX -
        game.player.x
      ) *
      Math.min(
        1,
        dt * 10
      );

    game.player.vx =
      (
        game.player.targetX -
        game.player.x
      ) *
      Math.min(
        1,
        dt * 7
      );

    game.player.rotation =
      clamp(
        game.player.vx *
          -0.012,
        -0.35,
        0.35
      );

    game.spawnTimer -= dt;

    const spawnDelay =
      Math.max(
        0.42,
        0.95 -
          game.score *
            0.008
      );

    if (
      game.spawnTimer <= 0
    ) {
      spawnObstacle();

      game.spawnTimer =
        spawnDelay;
    }

    for (
      const star of
      game.stars
    ) {
      star.y +=
        star.speed *
        70 *
        dt *
        speedMultiplier;

      if (
        star.y >
        game.height + 5
      ) {
        star.y = -5;

        star.x =
          Math.random() *
          game.width;
      }
    }

    for (
      let i =
        game.obstacles.length -
        1;
      i >= 0;
      i--
    ) {
      const obstacle =
        game.obstacles[i];

      obstacle.y +=
        obstacle.speed *
        dt *
        speedMultiplier;

      obstacle.rotation +=
        obstacle.rotationSpeed *
        dt *
        60;

      obstacle.phase +=
        obstacle.phaseSpeed *
        dt *
        60;

      obstacle.renderX =
        obstacle.x +
        Math.sin(
          obstacle.phase
        ) *
          8;

      if (
        checkCollision({
          ...obstacle,
          x: obstacle.renderX
        })
      ) {
        addParticles(
          game.player.x,
          game.player.y,
          30,
          1.6
        );

        endGame();
        return;
      }

      if (
        !obstacle.passed &&
        obstacle.y >
          game.player.y + 55
      ) {
        obstacle.passed =
          true;

        game.score += 1;

        setScore(
          game.score
        );

        addFloatingText(
          obstacle.renderX,
          game.player.y - 30,
          '+1'
        );

        addParticles(
          obstacle.renderX,
          obstacle.y,
          5,
          0.5
        );
      }

      if (
        obstacle.y >
        game.height + 100
      ) {
        game.obstacles.splice(
          i,
          1
        );
      }
    }

    for (
      let i =
        game.particles.length -
        1;
      i >= 0;
      i--
    ) {
      const particle =
        game.particles[i];

      particle.x +=
        particle.vx * dt;

      particle.y +=
        particle.vy * dt;

      particle.vy +=
        particle.gravity * dt;

      particle.life -= dt;

      if (
        particle.life <= 0
      ) {
        game.particles.splice(
          i,
          1
        );
      }
    }

    for (
      let i =
        game.floatingTexts.length -
        1;
      i >= 0;
      i--
    ) {
      const text =
        game.floatingTexts[i];

      text.y +=
        text.vy * dt;

      text.life -= dt;

      if (
        text.life <= 0
      ) {
        game.floatingTexts.splice(
          i,
          1
        );
      }
    }
  };

  const drawBackground =
    ctx => {
      const game =
        gameRef.current;

      const colors =
        game.colors;

      if (!colors)
        return;

      const gradient =
        ctx.createLinearGradient(
          0,
          0,
          0,
          game.height
        );

      gradient.addColorStop(
        0,
        colors.bg
      );

      gradient.addColorStop(
        1,
        colors.secondary
      );

      ctx.fillStyle =
        gradient;

      ctx.fillRect(
        0,
        0,
        game.width,
        game.height
      );

      for (
        const star of
        game.stars
      ) {
        const twinkle =
          0.65 +
          Math.sin(
            performance.now() *
              0.002 +
              star.phase
          ) *
            0.25;

        ctx.globalAlpha =
          star.alpha *
          twinkle;

        ctx.fillStyle =
          colors.text;

        ctx.beginPath();

        ctx.arc(
          star.x,
          star.y,
          star.size,
          0,
          Math.PI * 2
        );

        ctx.fill();
      }

      ctx.globalAlpha = 1;

      const glow =
        ctx.createRadialGradient(
          game.width / 2,
          game.height * 0.65,
          0,
          game.width / 2,
          game.height * 0.65,
          game.width * 0.65
        );

      glow.addColorStop(
        0,
        withAlpha(
          colors.accent,
          0.08
        )
      );

      glow.addColorStop(
        1,
        'rgba(0,0,0,0)'
      );

      ctx.fillStyle =
        glow;

      ctx.fillRect(
        0,
        0,
        game.width,
        game.height
      );
    };

  const drawObstacle =
    (
      ctx,
      obstacle
    ) => {
      const game =
        gameRef.current;

      const colors =
        game.colors;

      const x =
        obstacle.renderX ??
        obstacle.x;

      const y =
        obstacle.y;

      ctx.save();

      ctx.translate(
        x,
        y
      );

      ctx.rotate(
        obstacle.rotation
      );

      const w =
        obstacle.width;

      const h =
        obstacle.height;

      ctx.shadowBlur = 18;

      ctx.shadowColor =
        withAlpha(
          colors.accent,
          0.27
        );

      ctx.fillStyle =
        colors.secondary;

      ctx.strokeStyle =
        colors.border;

      ctx.lineWidth = 1.5;

      const radius = 13;

      ctx.beginPath();

      ctx.roundRect(
        -w / 2,
        -h / 2,
        w,
        h,
        radius
      );

      ctx.fill();
      ctx.stroke();

      ctx.shadowBlur = 0;

      ctx.fillStyle =
        colors.tertiary;

      ctx.beginPath();

      ctx.roundRect(
        -w / 2 + 7,
        -h / 2 + 7,
        34,
        h - 14,
        8
      );

      ctx.fill();

      ctx.fillStyle =
        obstacle.type.type ===
        'delete'
          ? colors.danger
          : colors.accent;

      ctx.beginPath();

      ctx.arc(
        -w / 2 + 24,
        0,
        8,
        0,
        Math.PI * 2
      );

      ctx.fill();

      ctx.fillStyle =
        colors.text;

      ctx.font =
        '600 10px "DM Sans", system-ui, sans-serif';

      ctx.textAlign = 'left';
      ctx.textBaseline =
        'middle';

      const maxTextWidth =
        w - 52;

      let label =
        obstacle.type.label;

      while (
        ctx.measureText(
          label
        ).width >
          maxTextWidth &&
        label.length > 4
      ) {
        label =
          label.slice(
            0,
            -1
          );
      }

      if (
        label !==
        obstacle.type.label
      ) {
        label += '…';
      }

      ctx.fillText(
        label,
        -w / 2 + 50,
        -4
      );

      ctx.fillStyle =
        colors.secondaryText;

      ctx.font =
        '11px "Space Mono", monospace';

      ctx.fillText(
        obstacle.type.icon,
        -w / 2 + 50,
        14
      );

      ctx.restore();
    };

  const drawShip =
    ctx => {
      const game =
        gameRef.current;

      const colors =
        game.colors;

      const p =
        game.player;

      ctx.save();

      ctx.translate(
        p.x,
        p.y
      );

      ctx.rotate(
        p.rotation
      );

      const flame =
        16 +
        Math.sin(
          performance.now() *
            0.025
        ) *
          5;

      const trail =
        ctx.createLinearGradient(
          0,
          15,
          0,
          65
        );

      trail.addColorStop(
        0,
        withAlpha(
          colors.accent,
          0.6
        )
      );

      trail.addColorStop(
        1,
        'rgba(91,138,240,0)'
      );

      ctx.fillStyle =
        trail;

      ctx.beginPath();

      ctx.moveTo(
        -6,
        14
      );

      ctx.lineTo(
        0,
        14 +
          flame * 3
      );

      ctx.lineTo(
        6,
        14
      );

      ctx.closePath();

      ctx.fill();

      ctx.fillStyle =
        colors.success;

      ctx.beginPath();

      ctx.moveTo(
        -6,
        10
      );

      ctx.quadraticCurveTo(
        -4,
        10 + flame,
        0,
        10 +
          flame +
          5
      );

      ctx.quadraticCurveTo(
        4,
        10 + flame,
        6,
        10
      );

      ctx.closePath();

      ctx.fill();

      ctx.shadowBlur = 22;
      ctx.shadowColor =
        colors.accent;

      ctx.fillStyle =
        colors.accent;

      ctx.beginPath();

      ctx.moveTo(
        0,
        -28
      );

      ctx.quadraticCurveTo(
        14,
        -15,
        13,
        8
      );

      ctx.lineTo(
        7,
        16
      );

      ctx.lineTo(
        -7,
        16
      );

      ctx.lineTo(
        -13,
        8
      );

      ctx.quadraticCurveTo(
        -14,
        -15,
        0,
        -28
      );

      ctx.closePath();

      ctx.fill();

      ctx.shadowBlur = 0;

      ctx.fillStyle =
        colors.hover;

      ctx.beginPath();

      ctx.moveTo(
        -10,
        0
      );

      ctx.lineTo(
        -22,
        15
      );

      ctx.lineTo(
        -8,
        12
      );

      ctx.closePath();

      ctx.fill();

      ctx.beginPath();

      ctx.moveTo(
        10,
        0
      );

      ctx.lineTo(
        22,
        15
      );

      ctx.lineTo(
        8,
        12
      );

      ctx.closePath();

      ctx.fill();

      ctx.fillStyle =
        colors.bg;

      ctx.beginPath();

      ctx.ellipse(
        0,
        -9,
        5.5,
        8,
        0,
        0,
        Math.PI * 2
      );

      ctx.fill();

      ctx.strokeStyle =
        withAlpha(
          colors.text,
          0.53
        );

      ctx.lineWidth = 1;

      ctx.stroke();

      ctx.restore();
    };

  const drawParticles =
    ctx => {
      const game =
        gameRef.current;

      const colors =
        game.colors;

      for (
        const particle of
        game.particles
      ) {
        ctx.globalAlpha =
          Math.max(
            0,
            particle.life /
              particle.maxLife
          );

        ctx.fillStyle =
          colors.accent;

        ctx.beginPath();

        ctx.arc(
          particle.x,
          particle.y,
          particle.size,
          0,
          Math.PI * 2
        );

        ctx.fill();
      }

      ctx.globalAlpha = 1;
    };

  const drawFloatingTexts =
    ctx => {
      const game =
        gameRef.current;

      const colors =
        game.colors;

      ctx.textAlign =
        'center';

      ctx.font =
        '700 15px "Space Mono", monospace';

      for (
        const text of
        game.floatingTexts
      ) {
        ctx.globalAlpha =
          Math.max(
            0,
            text.life /
              text.maxLife
          );

        ctx.fillStyle =
          colors.success;

        ctx.fillText(
          text.text,
          text.x,
          text.y
        );
      }

      ctx.globalAlpha = 1;
    };

  const draw = () => {
    const canvas =
      canvasRef.current;

    const game =
      gameRef.current;

    if (
      !canvas ||
      !game.width ||
      !game.height
    ) {
      return;
    }

    const ctx =
      canvas.getContext('2d');

    if (!ctx) return;

    drawBackground(ctx);

    for (
      const obstacle of
      game.obstacles
    ) {
      drawObstacle(
        ctx,
        obstacle
      );
    }

    drawParticles(ctx);
    drawShip(ctx);
    drawFloatingTexts(ctx);
  };

  useEffect(() => {
    let mounted = true;

    const loop =
      timestamp => {
        if (!mounted)
          return;

        const game =
          gameRef.current;

        if (!game.lastTime) {
          game.lastTime =
            timestamp;
        }

        const dt =
          Math.min(
            (
              timestamp -
              game.lastTime
            ) / 1000,
            0.033
          );

        game.lastTime =
          timestamp;

        update(dt);
        draw();

        game.animationFrame =
          requestAnimationFrame(
            loop
          );
      };

    gameRef.current.animationFrame =
      requestAnimationFrame(
        loop
      );

    return () => {
      mounted = false;

      cancelAnimationFrame(
        gameRef.current
          .animationFrame
      );
    };
  }, []);

  const updatePointer =
    event => {
      const canvas =
        canvasRef.current;

      const game =
        gameRef.current;

      if (
        !canvas ||
        !game.width
      ) {
        return;
      }

      const rect =
        canvas.getBoundingClientRect();

      let clientX;

      if (
        event.touches?.length
      ) {
        clientX =
          event.touches[0]
            .clientX;
      } else if (
        event.changedTouches
          ?.length
      ) {
        clientX =
          event.changedTouches[0]
            .clientX;
      } else {
        clientX =
          event.clientX;
      }

      const x =
        (
          (
            clientX -
            rect.left
          ) /
          rect.width
        ) *
        game.width;

      game.player.targetX =
        clamp(
          x,
          28,
          game.width -
            28
        );
    };

  useEffect(() => {
    const handleKeyDown =
      event => {
        const game =
          gameRef.current;

        if (
          event.key ===
            'ArrowLeft' ||
          event.key.toLowerCase() ===
            'a' ||
          event.key.toLowerCase() ===
            'q'
        ) {
          game.player.targetX -=
            65;

          game.player.targetX =
            clamp(
              game.player.targetX,
              28,
              game.width -
                28
            );

          event.preventDefault();
        }

        if (
          event.key ===
            'ArrowRight' ||
          event.key.toLowerCase() ===
            'd'
        ) {
          game.player.targetX +=
            65;

          game.player.targetX =
            clamp(
              game.player.targetX,
              28,
              game.width -
                28
            );

          event.preventDefault();
        }

        if (
          (
            event.key ===
              ' ' ||
            event.key ===
              'Enter'
          ) &&
          !game.running
        ) {
          resetGame();
          event.preventDefault();
        }
      };

    window.addEventListener(
      'keydown',
      handleKeyDown
    );

    return () => {
      window.removeEventListener(
        'keydown',
        handleKeyDown
      );
    };
  }, []);

  const colors =
    gameRef.current.colors ||
    getThemeColors();

  const headerTitle =
    manual
      ? 'PROPARD // SPACE'
      : 'PROPARD // OFFLINE';

  const headerSubtitle =
    manual
      ? 'Un mini-jeu Propard pour battre ton record'
      : 'Le serveur est actuellement indisponible';

  const startDescription =
    manual
      ? (
        <>
          Fais monter ta fusée le plus haut possible.
          <br />
          Évite les éléments de Propard et bats ton record.
        </>
      )
      : (
        <>
          Propard est momentanément indisponible.
          <br />
          En attendant, essaie de monter le plus
          haut possible.
        </>
      );

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100%',
        background:
          'var(--bg-primary)',
        color:
          'var(--text-primary)',
        fontFamily:
          'var(--font-body)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}
    >
      <div
        style={{
          padding:
            'max(18px, env(safe-area-inset-top)) 18px 12px',
          display: 'flex',
          justifyContent:
            'space-between',
          alignItems: 'center',
          gap: 16,
          position: 'relative',
          zIndex: 5
        }}
      >
        <div>
          <div
            style={{
              fontFamily:
                'var(--font-mono)',
              fontSize: 12,
              color:
                'var(--accent)',
              letterSpacing: 1
            }}
          >
            {headerTitle}
          </div>

          <div
            style={{
              fontSize: 13,
              color:
                'var(--text-secondary)',
              marginTop: 3
            }}
          >
            {headerSubtitle}
          </div>
        </div>

        <div
          style={{
            textAlign: 'right',
            fontFamily:
              'var(--font-mono)'
          }}
        >
          <div
            style={{
              fontSize: 11,
              color:
                'var(--text-muted)'
            }}
          >
            RECORD
          </div>

          <div
            style={{
              fontSize: 17,
              fontWeight: 700
            }}
          >
            {highScore}
          </div>
        </div>
      </div>

      <div
        ref={wrapperRef}
        style={{
          flex: 1,
          minHeight: 0,
          position: 'relative',
          margin:
            '0 10px 10px',
          borderRadius: 20,
          overflow: 'hidden',
          border:
            '1px solid var(--border)',
          background:
            'var(--bg-primary)',
          boxShadow:
            'var(--shadow)',
          touchAction: 'none'
        }}
        onPointerDown={
          event => {
            if (
              !started ||
              gameOver
            ) {
              return;
            }

            gameRef.current.pointerActive =
              true;

            updatePointer(
              event
            );
          }
        }
        onPointerMove={
          event => {
            if (
              !gameRef.current
                .pointerActive
            ) {
              return;
            }

            updatePointer(
              event
            );
          }
        }
        onPointerUp={() => {
          gameRef.current.pointerActive =
            false;
        }}
        onPointerCancel={() => {
          gameRef.current.pointerActive =
            false;
        }}
        onPointerLeave={() => {
          gameRef.current.pointerActive =
            false;
        }}
      >
        <canvas
          ref={canvasRef}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            display: 'block',
            cursor:
              started &&
              !gameOver
                ? 'crosshair'
                : 'default'
          }}
        />

        <div
          style={{
            position: 'absolute',
            top: 15,
            left: 15,
            right: 15,
            display: 'flex',
            justifyContent:
              'space-between',
            pointerEvents:
              'none',
            fontFamily:
              'var(--font-mono)'
          }}
        >
          <div
            style={{
              padding:
                '8px 11px',
              borderRadius: 10,
              background:
                `${colors.secondary}dd`,
              border:
                `1px solid ${colors.border}`,
              backdropFilter:
                'blur(10px)'
            }}
          >
            <span
              style={{
                color:
                  colors.muted,
                fontSize: 10
              }}
            >
              SCORE
            </span>

            <div
              style={{
                fontSize: 20,
                fontWeight: 700
              }}
            >
              {score}
            </div>
          </div>

          <div
            style={{
              alignSelf:
                'center',
              fontSize: 10,
              color:
                colors.secondaryText,
              textAlign: 'right'
            }}
          >
            ← → / A D
            <br />
            ou glisse ton doigt
          </div>
        </div>

        {!started &&
          !gameOver && (
            <div
              style={{
                position:
                  'absolute',
                inset: 0,
                display:
                  'flex',
                alignItems:
                  'center',
                justifyContent:
                  'center',
                padding: 25,
                background:
                  'rgba(0,0,0,0.18)',
                backdropFilter:
                  'blur(3px)'
              }}
            >
              <div
                style={{
                  width:
                    'min(430px, 100%)',
                  textAlign:
                    'center',
                  padding:
                    '30px 24px',
                  borderRadius: 20,
                  background:
                    `${colors.secondary}ee`,
                  border:
                    `1px solid ${colors.border}`,
                  boxShadow:
                    '0 20px 70px rgba(0,0,0,.35)'
                }}
              >
                <div
                  style={{
                    fontSize: 46,
                    marginBottom: 8
                  }}
                >
                  🚀
                </div>

                <div
                  style={{
                    fontFamily:
                      'var(--font-mono)',
                    fontSize: 23,
                    fontWeight: 700,
                    marginBottom: 9
                  }}
                >
                  Propard Space
                </div>

                <div
                  style={{
                    color:
                      colors.secondaryText,
                    fontSize: 14,
                    lineHeight: 1.6,
                    marginBottom: 22
                  }}
                >
                  {startDescription}
                </div>

                <button
                  type="button"
                  onClick={
                    resetGame
                  }
                  style={{
                    border: 0,
                    borderRadius: 11,
                    padding:
                      '12px 20px',
                    background:
                      colors.accent,
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: 14,
                    cursor:
                      'pointer',
                    boxShadow:
                      `0 8px 25px ${withAlpha(
                        colors.accent,
                        0.27
                      )}`
                  }}
                >
                  Lancer le jeu
                </button>

                <div
                  style={{
                    marginTop: 13,
                    color:
                      colors.muted,
                    fontSize: 11
                  }}
                >
                  Chaque élément Propard évité = +1
                </div>
              </div>
            </div>
          )}

        {gameOver && (
          <div
            style={{
              position:
                'absolute',
              inset: 0,
              display:
                'flex',
              alignItems:
                'center',
              justifyContent:
                'center',
              padding: 25,
              background:
                'rgba(0,0,0,0.32)',
              backdropFilter:
                'blur(5px)'
            }}
          >
            <div
              style={{
                width:
                  'min(420px, 100%)',
                textAlign:
                  'center',
                padding:
                  '30px 24px',
                borderRadius: 20,
                background:
                  `${colors.secondary}f2`,
                border:
                  `1px solid ${colors.border}`,
                boxShadow:
                  '0 20px 70px rgba(0,0,0,.45)'
              }}
            >
              <div
                style={{
                  fontFamily:
                    'var(--font-mono)',
                  color:
                    colors.danger,
                  fontSize: 12,
                  letterSpacing: 1,
                  marginBottom: 8
                }}
              >
                COLLISION
              </div>

              <div
                style={{
                  fontSize: 29,
                  fontWeight: 700,
                  marginBottom: 5
                }}
              >
                {score} point
                {score > 1
                  ? 's'
                  : ''}
              </div>

              <div
                style={{
                  color:
                    colors.secondaryText,
                  fontSize: 13,
                  marginBottom: 20
                }}
              >
                {score >=
                  highScore &&
                score > 0
                  ? 'Nouveau record !'
                  : `Record : ${highScore}`}
              </div>

              <div
                style={{
                  display:
                    'flex',
                  justifyContent:
                    'center',
                  gap: 10,
                  flexWrap:
                    'wrap'
                }}
              >
                <button
                  type="button"
                  onClick={
                    resetGame
                  }
                  style={{
                    border: 0,
                    borderRadius: 10,
                    padding:
                      '11px 17px',
                    background:
                      colors.accent,
                    color: '#fff',
                    fontWeight: 700,
                    cursor:
                      'pointer'
                  }}
                >
                  Rejouer
                </button>

                <button
                  type="button"
                  onClick={
                    onRetry
                  }
                  style={{
                    border:
                      `1px solid ${colors.border}`,
                    borderRadius: 10,
                    padding:
                      '11px 17px',
                    background:
                      colors.tertiary,
                    color:
                      colors.text,
                    fontWeight: 600,
                    cursor:
                      'pointer'
                  }}
                >
                  {manual
                    ? 'Retour à Propard'
                    : 'Réessayer Propard'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div
        style={{
          padding:
            '0 18px max(14px, env(safe-area-inset-bottom))',
          textAlign:
            'center',
          color:
            'var(--text-muted)',
          fontSize: 11
        }}
      >
        {manual
          ? 'Mini-jeu Propard • Ton record est sauvegardé localement'
          : 'Mini-jeu hors ligne • Le jeu ne restaure pas le serveur'}
      </div>
    </div>
  );
}