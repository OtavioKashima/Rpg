import { useEffect, useRef, useState } from 'react';

const CLASSES = {
  cortante: { id: 'cortante', name: 'Zoro (Cortante)', color: '#10b981', hp: 150, range: 60, damage: 25, speed: 4.5, attackSpeed: 1.0, desc: 'Corpo-a-corpo letal. Alta vida e muito dano.' },
  atirador: { id: 'atirador', name: 'Usopp (Atirador)', color: '#f59e0b', hp: 70, range: 400, damage: 12, speed: 4, attackSpeed: 1.8, desc: 'Frágil, mas ataca de muito longe e bem rápido.' },
  especialista: { id: 'especialista', name: 'Nami (Especialista)', color: '#3b82f6', hp: 100, range: 250, damage: 18, speed: 4.2, attackSpeed: 1.2, desc: 'Equilibrada. Ótima para controle de distância.' }
};

export default function OnePieceArena() {
  const canvasRef = useRef(null);
  
  // Estados do React
  const [appState, setAppState] = useState('MENU'); // MENU, PLAYING, GAMEOVER
  const [selectedClass, setSelectedClass] = useState('cortante');
  const [cursorStyle, setCursorStyle] = useState('default');
  const [isShopOpen, setIsShopOpen] = useState(false);
  const [hudData, setHudData] = useState({ berris: 0, level: 1, xp: 0, maxXp: 100, wave: 1, hp: 100, maxHp: 100, className: '' });

  // Memória Compartilhada do Motor do Jogo
  const gameState = useRef({
    isShopOpen: false, 
    player: {
      berris: 0, xp: 0, level: 1, maxXp: 100,
      attackDamage: 10, attackSpeed: 1.2,
      maxHp: 100, hp: 100, range: 250, speed: 4,
      color: '#0055ff'
    }
  });

  // --- LOJA TEMÁTICA ---
  const buyItem = (itemType) => {
    const p = gameState.current.player;
    if (itemType === 'weapon' && p.berris >= 50) {
      p.berris -= 50; p.attackDamage += 5;
    } else if (itemType === 'speed' && p.berris >= 30) {
      p.berris -= 30; p.attackSpeed += 0.3;
    } else if (itemType === 'meat' && p.berris >= 20) {
      p.berris -= 20; 
      p.hp = Math.min(p.hp + 50, p.maxHp); // Carne cura 50!
    } else {
      alert("Berris insuficientes!"); return;
    }
    setHudData(prev => ({ ...prev, berris: p.berris, hp: Math.floor(p.hp) }));
  };

  const startGame = (classId) => {
    const cls = CLASSES[classId];
    gameState.current.player = {
      berris: 0, xp: 0, level: 1, maxXp: 100,
      attackDamage: cls.damage, attackSpeed: cls.attackSpeed,
      maxHp: cls.hp, hp: cls.hp, range: cls.range, speed: cls.speed,
      color: cls.color, name: cls.name, classId: cls.id,
      hitTimer: 0
    };
    setHudData({ berris: 0, level: 1, xp: 0, maxXp: 100, wave: 1, hp: cls.hp, maxHp: cls.hp, className: cls.name });
    setAppState('PLAYING');
    setIsShopOpen(false);
    gameState.current.isShopOpen = false;
  };

  // --- MOTOR GRÁFICO (Só roda quando appState === 'PLAYING') ---
  useEffect(() => {
    if (appState !== 'PLAYING') return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const player = {
      x: canvas.width / 2, y: canvas.height / 2, radius: 20,
      targetX: canvas.width / 2, targetY: canvas.height / 2,
      attackCooldown: 0, targetId: null, targetType: null
    };

    const mouse = { x: canvas.width / 2, y: canvas.height / 2 };
    let isAwaitingAttackClick = false;
    
    const enemies = new Map();
    const structures = new Map();
    const visualEffects = [];
    const enemyProjectiles = [];
    let entityIdCounter = 0;
    
    let currentWave = 1;
    let enemiesToSpawn = 5;
    let waveState = 'playing'; 
    let waveTimer = 0;

    const getDist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);

    function gainXpAndGold(xpAmount, berrisAmount) {
      const pState = gameState.current.player;
      pState.xp += xpAmount; pState.berris += berrisAmount;

      if (pState.xp >= pState.maxXp) {
        pState.level++; pState.xp -= pState.maxXp;
        pState.maxXp = Math.floor(pState.maxXp * 1.5);
        pState.attackDamage += 3; pState.maxHp += 15;
        pState.hp = pState.maxHp; 
        visualEffects.push({ type: 'text', text: 'LEVEL UP!', x: player.x - 40, y: player.y - 40, life: 60, color: 'gold' });
      }
    }

    // --- CONTROLES ---
    const handleMouseMove = (e) => { mouse.x = e.clientX; mouse.y = e.clientY; };
    const handleContextMenu = (e) => {
      e.preventDefault();
      if (gameState.current.isShopOpen) return;
      isAwaitingAttackClick = false; setCursorStyle('default');
      let targetFound = false;

      for (let [id, enemy] of enemies) {
        if (getDist(e.clientX, e.clientY, enemy.x, enemy.y) <= enemy.radius) {
          player.targetId = id; player.targetType = 'enemy'; targetFound = true; break;
        }
      }

      if (!targetFound) {
        for (let [id, struct] of structures) {
          if (e.clientX >= struct.x && e.clientX <= struct.x + struct.w && e.clientY >= struct.y && e.clientY <= struct.y + struct.h) {
            player.targetId = id; player.targetType = 'structure'; targetFound = true; break;
          }
        }
      }

      if (!targetFound) {
        player.targetId = null; player.targetType = null;
        player.targetX = e.clientX; player.targetY = e.clientY;
      }
    };

    const handleKeyDown = (e) => {
      const key = e.key.toLowerCase();
      if (key === 'b') {
        const newState = !gameState.current.isShopOpen;
        gameState.current.isShopOpen = newState; setIsShopOpen(newState);
        if (newState) { player.targetId = null; player.targetX = player.x; player.targetY = player.y; }
      }
      if (key === 'a' && !gameState.current.isShopOpen) {
        isAwaitingAttackClick = true; setCursorStyle('crosshair');
      }
    };

    const handleMouseDown = (e) => {
      if (e.button === 0 && isAwaitingAttackClick && !gameState.current.isShopOpen) {
        isAwaitingAttackClick = false; setCursorStyle('default');
        let closestId = null; let minDistance = Infinity;
        enemies.forEach((enemy, id) => {
          const dist = getDist(e.clientX, e.clientY, enemy.x, enemy.y);
          if (dist < minDistance) { minDistance = dist; closestId = id; }
        });

        if (closestId !== null) {
          player.targetId = closestId; player.targetType = 'enemy';
        } else {
          player.targetId = null; player.targetType = null;
          player.targetX = e.clientX; player.targetY = e.clientY;
        }
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousedown', handleMouseDown);

    // --- SPAWNERS TEMÁTICOS ---
    function spawnEnemy() {
      const radius = 18;
      const angle = Math.random() * Math.PI * 2;
      const x = canvas.width / 2 + Math.cos(angle) * (canvas.width / 1.5);
      const y = canvas.height / 2 + Math.sin(angle) * (canvas.height / 1.5);
      const multiplier = 1 + (currentWave * 0.2);
      const isRanged = Math.random() < (0.2 + (currentWave * 0.05));
      
      entityIdCounter++;
      if (isRanged) {
        enemies.set(entityIdCounter, { // Atirador da Marinha
          type: 'ranged', x, y, radius: 16, color: '#9d4edd', speed: 0.8 + (currentWave * 0.02), hp: 20 * multiplier, maxHp: 20 * multiplier,
          range: 300, attackCooldown: 0, damage: 8 + (currentWave * 2)
        });
      } else {
        enemies.set(entityIdCounter, { // Marinheiro Rasão
          type: 'melee', x, y, radius, color: '#e63946', speed: 1.2 + (currentWave * 0.05), hp: 35 * multiplier, maxHp: 35 * multiplier,
          damage: 10 + (currentWave * 2)
        });
      }
    }

    function spawnStructure() {
      entityIdCounter++;
      structures.set(entityIdCounter, { // Base da Marinha
        x: 200 + Math.random() * (canvas.width - 400), y: 200 + Math.random() * (canvas.height - 400),
        w: 60, h: 60, hp: 300, maxHp: 300, color: '#457b9d'
      });
    }

    // --- GAME LOOP PRINCIPAL ---
    let animationId;
    let frameCount = 0;

    function animate() {
      animationId = requestAnimationFrame(animate);
      if (gameState.current.isShopOpen) return;

      const pState = gameState.current.player;
      const ctx = canvas.getContext('2d');
      // Fundo escuro (Mar à noite)
      ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (waveState === 'playing') {
        if (enemiesToSpawn > 0 && frameCount % 60 === 0) {
          spawnEnemy(); enemiesToSpawn--;
        } else if (enemiesToSpawn === 0 && enemies.size === 0 && structures.size === 0) {
          waveState = 'transition'; waveTimer = 180; 
          visualEffects.push({ type: 'text', text: `Wave ${currentWave} Limpa!`, x: canvas.width/2 - 100, y: canvas.height/2, life: 120, color: '#38bdf8' });
        }
      } else if (waveState === 'transition') {
        waveTimer--;
        if (waveTimer <= 0) {
          currentWave++; enemiesToSpawn = 4 + (currentWave * 3);
          if (currentWave % 3 === 0) spawnStructure(); 
          waveState = 'playing';
        }
      }

      if (player.attackCooldown > 0) player.attackCooldown--;
      if (pState.hitTimer > 0) pState.hitTimer--; 

      if (player.targetId !== null) {
        let target = player.targetType === 'enemy' ? enemies.get(player.targetId) : structures.get(player.targetId);
        if (!target) {
          player.targetId = null; 
        } else {
          const targetCenterX = player.targetType === 'structure' ? target.x + target.w/2 : target.x;
          const targetCenterY = player.targetType === 'structure' ? target.y + target.h/2 : target.y;
          const distToTarget = getDist(player.x, player.y, targetCenterX, targetCenterY);

          if (distToTarget <= pState.range) {
            player.targetX = player.x; player.targetY = player.y; 
            if (player.attackCooldown <= 0) {
              target.hp -= pState.attackDamage;
              player.attackCooldown = Math.floor(60 / pState.attackSpeed);
              
              // Efeito de ataque diferente por classe
              let efColor = pState.classId === 'cortante' ? '#10b981' : (pState.classId === 'atirador' ? '#f59e0b' : '#3b82f6');
              visualEffects.push({ type: 'laser', x1: player.x, y1: player.y, x2: targetCenterX, y2: targetCenterY, life: 10, color: efColor });
            }
          } else {
            player.targetX = targetCenterX; player.targetY = targetCenterY;
          }
        }
      }

      const dx = player.targetX - player.x; const dy = player.targetY - player.y;
      const distance = Math.hypot(dx, dy);

      if (distance > pState.speed) {
        player.x += (dx / distance) * pState.speed; player.y += (dy / distance) * pState.speed;
      } else {
        player.x = player.targetX; player.y = player.targetY;
      }

      ctx.beginPath(); ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
      ctx.fillStyle = pState.hitTimer > 0 ? '#ff0000' : pState.color; ctx.fill();
      
      if (isAwaitingAttackClick) {
        ctx.beginPath(); ctx.arc(player.x, player.y, pState.range, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)'; ctx.fill();
        ctx.lineWidth = 1; ctx.strokeStyle = pState.color; ctx.stroke();
      }

      enemies.forEach((enemy, id) => {
        if (enemy.hp <= 0) {
            enemies.delete(id);
            gainXpAndGold(enemy.type === 'ranged' ? 25 : 15, enemy.type === 'ranged' ? 12 : 8); 
            if (player.targetId === id) player.targetId = null; return;
        }
        const distToPlayer = getDist(enemy.x, enemy.y, player.x, player.y);
        const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);

        if (enemy.type === 'melee') {
            enemy.x += Math.cos(angle) * enemy.speed; enemy.y += Math.sin(angle) * enemy.speed;
            if (distToPlayer < player.radius + enemy.radius) {
                pState.hp -= enemy.damage * 0.05; pState.hitTimer = 5;
            }
        } else if (enemy.type === 'ranged') {
            if (distToPlayer > enemy.range) {
                enemy.x += Math.cos(angle) * enemy.speed; enemy.y += Math.sin(angle) * enemy.speed;
            } else {
                if (enemy.attackCooldown <= 0) {
                    enemyProjectiles.push({ x: enemy.x, y: enemy.y, vx: Math.cos(angle) * 5, vy: Math.sin(angle) * 5, radius: 6, color: '#facc15', damage: enemy.damage });
                    enemy.attackCooldown = 90;
                }
            }
            if (enemy.attackCooldown > 0) enemy.attackCooldown--;
        }

        ctx.beginPath(); ctx.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2);
        ctx.fillStyle = enemy.color; ctx.fill();
        ctx.fillStyle = 'red'; ctx.fillRect(enemy.x - 15, enemy.y - 25, 30, 4);
        ctx.fillStyle = '#10b981'; ctx.fillRect(enemy.x - 15, enemy.y - 25, 30 * (enemy.hp / enemy.maxHp), 4);
      });

      for (let i = enemyProjectiles.length - 1; i >= 0; i--) {
        let p = enemyProjectiles[i]; p.x += p.vx; p.y += p.vy;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2); ctx.fillStyle = p.color; ctx.fill();
        if (getDist(p.x, p.y, player.x, player.y) < player.radius + p.radius) {
            pState.hp -= p.damage; pState.hitTimer = 10; enemyProjectiles.splice(i, 1);
        } else if (p.x < 0 || p.x > canvas.width || p.y < 0 || p.y > canvas.height) {
            enemyProjectiles.splice(i, 1);
        }
      }

      structures.forEach((struct, id) => {
        if (struct.hp <= 0) {
          structures.delete(id); gainXpAndGold(100, 50); 
          if (player.targetId === id) player.targetId = null; return;
        }
        ctx.fillStyle = struct.color; ctx.fillRect(struct.x, struct.y, struct.w, struct.h);
        ctx.fillStyle = 'red'; ctx.fillRect(struct.x, struct.y - 15, struct.w, 5);
        ctx.fillStyle = '#10b981'; ctx.fillRect(struct.x, struct.y - 15, struct.w * (struct.hp / struct.maxHp), 5);
      });

      for (let i = visualEffects.length - 1; i >= 0; i--) {
        const effect = visualEffects[i];
        if (effect.type === 'laser') {
          ctx.beginPath(); ctx.moveTo(effect.x1, effect.y1); ctx.lineTo(effect.x2, effect.y2);
          ctx.lineWidth = effect.life > 5 ? 4 : 2; ctx.strokeStyle = effect.color; ctx.stroke();
        } else if (effect.type === 'text') {
          ctx.fillStyle = effect.color; ctx.font = '24px Arial bold'; ctx.fillText(effect.text, effect.x, effect.y); effect.y -= 0.5; 
        }
        effect.life--;
        if (effect.life <= 0) visualEffects.splice(i, 1);
      }

      if (pState.hp <= 0) {
        setAppState('GAMEOVER');
        return; // Para o loop
      }

      frameCount++;
      if (frameCount % 15 === 0) {
        setHudData({ berris: pState.berris, level: pState.level, xp: pState.xp, maxXp: pState.maxXp, wave: currentWave, hp: Math.floor(pState.hp), maxHp: pState.maxHp, className: pState.name });
      }
    }

    animate();

    // Cleanup: Remove os listeners e para a animação quando sair do modo PLAYING
    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousedown', handleMouseDown);
    };
  }, [appState]); 

  // --- RENDERIZAÇÃO DA INTERFACE ---
  return (
    <div style={{ margin: 0, padding: 0, overflow: 'hidden', backgroundColor: '#0f172a', height: '100vh', width: '100vw', fontFamily: 'sans-serif', cursor: cursorStyle }}>
      
      {/* TELA DE MENU INICIAL */}
      {appState === 'MENU' && (
        <div style={{ position: 'absolute', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'white', zIndex: 300, background: 'linear-gradient(to bottom, #1e3a8a, #0f172a)' }}>
          <h1 style={{ fontSize: '64px', color: 'gold', textShadow: '4px 4px 0px #000', marginBottom: '10px', textAlign: 'center' }}>PIRATE ARENA<br/><span style={{fontSize: '32px', color: '#fff'}}>Grand Line Survival</span></h1>
          <p style={{ fontSize: '20px', marginBottom: '40px', color: '#cbd5e1' }}>Selecione o seu pirata para enfrentar a Marinha</p>
          
          <div style={{ display: 'flex', gap: '20px', marginBottom: '50px' }}>
            {Object.values(CLASSES).map(cls => (
              <div 
                key={cls.id} 
                onClick={() => setSelectedClass(cls.id)}
                style={{ width: '250px', padding: '20px', borderRadius: '12px', border: `4px solid ${selectedClass === cls.id ? 'gold' : '#334155'}`, backgroundColor: '#1e293b', cursor: 'pointer', transition: 'transform 0.2s', transform: selectedClass === cls.id ? 'scale(1.05)' : 'scale(1)' }}
              >
                <h3 style={{ margin: '0 0 10px 0', color: cls.color, textAlign: 'center', fontSize: '24px' }}>{cls.name}</h3>
                <p style={{ fontSize: '14px', color: '#94a3b8', textAlign: 'center', minHeight: '60px' }}>{cls.desc}</p>
                <ul style={{ fontSize: '14px', color: '#e2e8f0', paddingLeft: '20px' }}>
                  <li><b>Vida:</b> {cls.hp}</li>
                  <li><b>Dano Base:</b> {cls.damage}</li>
                  <li><b>Alcance:</b> {cls.range}</li>
                </ul>
              </div>
            ))}
          </div>

          <button onClick={() => startGame(selectedClass)} style={{ padding: '20px 60px', fontSize: '28px', fontWeight: 'bold', backgroundColor: 'gold', color: '#000', border: 'none', borderRadius: '50px', cursor: 'pointer', boxShadow: '0px 6px 0px #b45309', textTransform: 'uppercase' }}>
            Zarpar!
          </button>
        </div>
      )}

      {/* TELA DO JOGO (HUD + CANVAS) */}
      {appState === 'PLAYING' && (
        <>
          <div style={{ position: 'absolute', top: 10, left: 10, color: 'white', pointerEvents: 'none', backgroundColor: 'rgba(15, 23, 42, 0.85)', padding: '15px', borderRadius: '8px', border: '2px solid #334155', zIndex: 50 }}>
            <h2 style={{ margin: 0, color: CLASSES[gameState.current.player.classId].color }}>{hudData.className}</h2>
            <h3 style={{ margin: '5px 0 10px 0', color: '#cbd5e1' }}>Wave da Marinha: {hudData.wave}</h3>
            
            <div style={{ backgroundColor: '#333', width: '220px', height: '22px', borderRadius: '4px', border: '2px solid #000', marginBottom: '5px' }}>
                <div style={{ backgroundColor: '#ef4444', width: `${Math.max(0, (hudData.hp / hudData.maxHp) * 100)}%`, height: '100%', transition: 'width 0.2s' }} />
            </div>
            <p style={{ margin: '0 0 15px 0', fontSize: '14px', fontWeight: 'bold' }}>{hudData.hp} / {hudData.maxHp} HP</p>

            <p style={{ margin: '5px 0', color: 'gold', fontWeight: 'bold', fontSize: '18px' }}>💰 Berris: {hudData.berris}</p>
            <p style={{ margin: '5px 0', color: '#38bdf8', fontWeight: 'bold' }}>⭐ Nível: {hudData.level} (XP: {hudData.xp}/{hudData.maxXp})</p>
            <p style={{ margin: '15px 0 0 0', fontSize: '12px', color: '#94a3b8' }}>Aperte <b>'B'</b> para Mercado Negro</p>
          </div>

          {/* LOJA TEMÁTICA */}
          {isShopOpen && (
            <div style={{ position: 'absolute', top: '20%', left: '50%', transform: 'translate(-50%, 0)', width: '450px', backgroundColor: '#1e293b', border: '3px solid gold', borderRadius: '12px', padding: '25px', color: 'white', zIndex: 100 }}>
              <h2 style={{ textAlign: 'center', color: 'gold', marginTop: 0 }}>MERCADO NEGRO</h2>
              <p style={{ textAlign: 'center', fontSize: '18px' }}>Seus Berris: <b style={{color: 'gold'}}>{hudData.berris}</b></p>
              <hr style={{ borderColor: '#334155', marginBottom: '20px' }}/>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', backgroundColor: '#0f172a', padding: '10px', borderRadius: '8px' }}>
                <div>
                  <h4 style={{ margin: 0, color: '#38bdf8' }}>Melhoria de Arma</h4>
                  <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#94a3b8' }}>+5 Dano de Ataque</p>
                </div>
                <button onClick={() => buyItem('weapon')} style={{ padding: '8px 20px', backgroundColor: 'gold', color: 'black', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>50 B</button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', backgroundColor: '#0f172a', padding: '10px', borderRadius: '8px' }}>
                <div>
                  <h4 style={{ margin: 0, color: '#38bdf8' }}>Treinamento Haki</h4>
                  <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#94a3b8' }}>+0.3 Vel. de Ataque</p>
                </div>
                <button onClick={() => buyItem('speed')} style={{ padding: '8px 20px', backgroundColor: 'gold', color: 'black', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>30 B</button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0f172a', padding: '10px', borderRadius: '8px' }}>
                <div>
                  <h4 style={{ margin: 0, color: '#ef4444' }}>Pedaço de Carne Gigante</h4>
                  <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#94a3b8' }}>Restaura 50 de HP</p>
                </div>
                <button onClick={() => buyItem('meat')} style={{ padding: '8px 20px', backgroundColor: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>20 B</button>
              </div>
              
              <button onClick={() => { gameState.current.isShopOpen = false; setIsShopOpen(false); }} style={{ display: 'block', width: '100%', marginTop: '25px', padding: '15px', backgroundColor: '#334155', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px' }}>Voltar para Batalha (B)</button>
            </div>
          )}

          <canvas ref={canvasRef} style={{ display: 'block' }} />
        </>
      )}

      {/* TELA DE GAME OVER */}
      {appState === 'GAMEOVER' && (
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(15, 23, 42, 0.95)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', color: 'white', zIndex: 200 }}>
            <h1 style={{ color: '#ef4444', fontSize: '72px', margin: 0, textShadow: '4px 4px 0 #000' }}>DERROTADO</h1>
            <p style={{ fontSize: '28px', color: '#cbd5e1', marginTop: '10px' }}>Você foi capturado pela Marinha!</p>
            
            <div style={{ backgroundColor: '#1e293b', padding: '30px', borderRadius: '12px', border: '2px solid #334155', marginTop: '20px', textAlign: 'center', minWidth: '300px' }}>
              <p style={{ fontSize: '20px', margin: '10px 0' }}>Pirata: <b style={{color: CLASSES[gameState.current.player.classId].color}}>{hudData.className}</b></p>
              <p style={{ fontSize: '20px', margin: '10px 0' }}>Wave Alcançada: <b>{hudData.wave}</b></p>
              <p style={{ fontSize: '20px', margin: '10px 0' }}>Nível Final: <b>{hudData.level}</b></p>
            </div>

            <button onClick={() => setAppState('MENU')} style={{ marginTop: '40px', padding: '20px 40px', fontSize: '24px', backgroundColor: 'gold', color: '#000', border: 'none', cursor: 'pointer', fontWeight: 'bold', borderRadius: '50px', textTransform: 'uppercase' }}>
                Tentar Novamente
            </button>
        </div>
      )}
    </div>
  );
} 