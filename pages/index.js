import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const CLASSES = {
  cortante: { id: 'cortante', name: 'Zoro (Cortante)', color: '#10b981', hp: 150, range: 60, damage: 25, speed: 4.5, attackSpeed: 1.0, desc: 'Corpo-a-corpo letal. Alta vida e muito dano.' },
  atirador: { id: 'atirador', name: 'kaku (Atirador)', color: '#f59e0b', hp: 70, range: 400, damage: 12, speed: 4, attackSpeed: 1.8, desc: 'Frágil, mas ataca de muito longe e bem rápido.' },
  especialista: { id: 'especialista', name: 'Nami (Especialista)', color: '#3b82f6', hp: 100, range: 250, damage: 18, speed: 4.2, attackSpeed: 1.2, desc: 'Equilibrada. Ótima para controle de distância.' }
};

export default function OnePieceArena() {
  const canvasRef = useRef(null);
  const [appState, setAppState] = useState('MENU');
  const [selectedClass, setSelectedClass] = useState('cortante');
  const [cursorStyle, setCursorStyle] = useState("url('/cursor-hand.png'), auto");
  const [isShopOpen, setIsShopOpen] = useState(false);
  const [hudData, setHudData] = useState({ berris: 0, level: 1, xp: 0, maxXp: 100, wave: '-', hp: 100, maxHp: 100, className: '' });

  const gameState = useRef({
    isShopOpen: false,
    player: { berris: 0, xp: 0, level: 1, maxXp: 100, attackDamage: 10, attackSpeed: 1.2, maxHp: 100, hp: 100, range: 250, speed: 4, color: '#0055ff' }
  });

  const socketRef = useRef(null);
  const serverWorldRef = useRef({ players: {}, enemies: {} });
  const visualEffectsRef = useRef([]);

  const imagesRef = useRef({
    players: { cortante: null, atirador: null, especialista: null },
    enemies: { marineMelee: null },
    background: null
  });

  function gainXpAndGold(xpAmount, berrisAmount) {
    const pState = gameState.current.player;
    pState.xp += xpAmount; pState.berris += berrisAmount;
    if (pState.xp >= pState.maxXp) {
      pState.level++; pState.xp -= pState.maxXp;
      pState.maxXp = Math.floor(pState.maxXp * 1.5);
      pState.attackDamage += 3; pState.maxHp += 15;
      pState.hp = pState.maxHp;
    }
  }

  // --- CONEXÃO COM O SERVIDOR ---
  useEffect(() => {
    if (appState !== 'PLAYING') return;

    // Conecta automaticamente e garante que o caminho está correto
    socketRef.current = io({
      path: '/socket.io/',
    });

    socketRef.current.on('serverState', (state) => { serverWorldRef.current = state; });


    socketRef.current.on('serverState', (state) => { serverWorldRef.current = state; });
    socketRef.current.on('playerHit', (damage) => { gameState.current.player.hp -= damage; gameState.current.player.hitTimer = 10; });
    socketRef.current.on('enemyKilled', (reward) => { gainXpAndGold(reward.xp, reward.berris); });

    return () => { if (socketRef.current) socketRef.current.disconnect(); };
  }, [appState]);

  const buyItem = (itemType) => {
    const p = gameState.current.player;
    if (itemType === 'weapon' && p.berris >= 50) { p.berris -= 50; p.attackDamage += 5; }
    else if (itemType === 'speed' && p.berris >= 30) { p.berris -= 30; p.attackSpeed += 0.3; }
    else if (itemType === 'meat' && p.berris >= 20) { p.berris -= 20; p.hp = Math.min(p.hp + 50, p.maxHp); }
    else { alert("Berris insuficientes!"); return; }
    setHudData(prev => ({ ...prev, berris: p.berris, hp: Math.floor(p.hp) }));
  };

  const startGame = (classId) => {
    const cls = CLASSES[classId];
    gameState.current.player = {
      ...gameState.current.player,
      attackDamage: cls.damage, attackSpeed: cls.attackSpeed, maxHp: cls.hp, hp: cls.hp, range: cls.range, speed: cls.speed,
      color: cls.color, name: cls.name, classId: cls.id, hitTimer: 0
    };
    setHudData(prev => ({ ...prev, hp: cls.hp, maxHp: cls.hp, className: cls.name }));
    setAppState('PLAYING');
    setIsShopOpen(false);
    gameState.current.isShopOpen = false;
  };

  useEffect(() => {
    if (appState !== 'PLAYING') return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // --- CARREGADOR DE IMAGENS BLINDADO ---
    const loadImages = () => {
      const load = (src) => {
        const img = new Image();
        img.src = src;
        img.isReady = false; // Flag customizada de segurança
        img.onload = () => { img.isReady = true; };
        img.onerror = () => {
          img.isReady = false;
          console.warn(`Aviso: Imagem não encontrada em ${src}. Usando formato circular.`);
        };
        return img;
      };

      imagesRef.current.background = load('/assets/marineford.png');
      imagesRef.current.players.cortante = load('/assets/players/zoro.png');
      imagesRef.current.players.atirador = load('/assets/players/kaku.png');
      imagesRef.current.players.especialista = load('/assets/players/nami.png');
      imagesRef.current.enemies.marineMelee = load('/assets/enemies/marine_melee.png');
    };
    loadImages();

    const player = { x: canvas.width / 2, y: canvas.height / 2, radius: 20, targetX: canvas.width / 2, targetY: canvas.height / 2, attackCooldown: 0, targetId: null };
    let isAwaitingAttackClick = false;
    const getDist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);

    const handleContextMenu = (e) => {
      e.preventDefault();
      if (gameState.current.isShopOpen) return;
      isAwaitingAttackClick = false; setCursorStyle("url('/cursor-hand.png'), auto");
      let targetFound = false;
      const enemies = serverWorldRef.current.enemies;
      for (let eId in enemies) { if (getDist(e.clientX, e.clientY, enemies[eId].x, enemies[eId].y) <= enemies[eId].radius + 5) { player.targetId = eId; targetFound = true; break; } }
      if (!targetFound) { player.targetId = null; player.targetX = e.clientX; player.targetY = e.clientY; }
    };

    const handleKeyDown = (e) => {
      if (e.key.toLowerCase() === 'b') { const newState = !gameState.current.isShopOpen; gameState.current.isShopOpen = newState; setIsShopOpen(newState); if (newState) { player.targetId = null; player.targetX = player.x; player.targetY = player.y; } }
      if (e.key.toLowerCase() === 'a' && !gameState.current.isShopOpen) { isAwaitingAttackClick = true; setCursorStyle("url('/cursor-sword.png') 0 0, crosshair"); }
    };

    const handleMouseDown = (e) => {
      if (e.button === 0 && isAwaitingAttackClick && !gameState.current.isShopOpen) {
        isAwaitingAttackClick = false; setCursorStyle("url('/cursor-hand.png'), auto");
        let closestId = null; let minDistance = Infinity;
        const enemies = serverWorldRef.current.enemies;
        for (let eId in enemies) { const dist = getDist(e.clientX, e.clientY, enemies[eId].x, enemies[eId].y); if (dist < minDistance) { minDistance = dist; closestId = eId; } }
        if (closestId !== null) player.targetId = closestId; else { player.targetId = null; player.targetX = e.clientX; player.targetY = e.clientY; }
      }
    };

    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousedown', handleMouseDown);

    let animationId;
    let frameCount = 0;
    let lastEmitTime = 0;

    function animate(timestamp) {
      animationId = requestAnimationFrame(animate);
      if (gameState.current.isShopOpen) return;

      const pState = gameState.current.player;
      const world = serverWorldRef.current;

      // DESENHA FUNDO SEGURO
      const bgImage = imagesRef.current.background;
      if (bgImage && bgImage.isReady) {
        ctx.drawImage(bgImage, 0, 0, canvas.width, canvas.height);
      } else {
        ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      if (player.attackCooldown > 0) player.attackCooldown--;
      if (pState.hitTimer > 0) pState.hitTimer--;

      if (player.targetId !== null) {
        let target = world.enemies[player.targetId];
        if (!target) { player.targetId = null; }
        else {
          const distToTarget = getDist(player.x, player.y, target.x, target.y);
          if (distToTarget <= pState.range) {
            player.targetX = player.x; player.targetY = player.y;
            if (player.attackCooldown <= 0) {
              if (socketRef.current) socketRef.current.emit('attackEnemy', { targetId: player.targetId, damage: pState.attackDamage });
              player.attackCooldown = Math.floor(60 / pState.attackSpeed);
              let efColor = pState.classId === 'cortante' ? '#10b981' : (pState.classId === 'atirador' ? '#f59e0b' : '#3b82f6');
              visualEffectsRef.current.push({ type: 'laser', x1: player.x, y1: player.y, x2: target.x, y2: target.y, life: 10, color: efColor });
            }
          } else { player.targetX = target.x; player.targetY = target.y; }
        }
      }

      const dx = player.targetX - player.x; const dy = player.targetY - player.y;
      const distance = Math.hypot(dx, dy);
      let isMoving = false;
      if (distance > pState.speed) { player.x += (dx / distance) * pState.speed; player.y += (dy / distance) * pState.speed; isMoving = true; }
      else { player.x = player.targetX; player.y = player.targetY; }
      if (isMoving && timestamp - lastEmitTime > 30 && socketRef.current) { socketRef.current.emit('playerMovement', { x: player.x, y: player.y, color: pState.color }); lastEmitTime = timestamp; }

      // DESENHA PLAYER SEGURO
      let myImage = imagesRef.current.players[pState.classId];
      if (myImage && myImage.isReady) {
        ctx.drawImage(myImage, player.x - player.radius, player.y - player.radius, player.radius * 2, player.radius * 2);
      } else {
        ctx.beginPath(); ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
        ctx.fillStyle = pState.hitTimer > 0 ? '#ff0000' : pState.color; ctx.fill();
      }

      if (isAwaitingAttackClick) { ctx.beginPath(); ctx.arc(player.x, player.y, pState.range, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255, 255, 255, 0.05)'; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = pState.color; ctx.stroke(); }

      for (let pId in world.players) {
        if (pId === socketRef.current?.id) continue;
        let other = world.players[pId];
        ctx.beginPath(); ctx.arc(other.x, other.y, 20, 0, Math.PI * 2);
        ctx.fillStyle = other.color || '#94a3b8'; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
      }

      // DESENHA INIMIGOS SEGURO
      for (let eId in world.enemies) {
        let enemy = world.enemies[eId];
        let enemyImage = imagesRef.current.enemies.marineMelee;

        if (enemyImage && enemyImage.isReady) {
          ctx.drawImage(enemyImage, enemy.x - enemy.radius, enemy.y - enemy.radius, enemy.radius * 2, enemy.radius * 2);
        } else {
          ctx.beginPath(); ctx.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2);
          ctx.fillStyle = enemy.color; ctx.fill();
        }

        ctx.fillStyle = 'red'; ctx.fillRect(enemy.x - 15, enemy.y - 25, 30, 4);
        ctx.fillStyle = '#10b981'; ctx.fillRect(enemy.x - 15, enemy.y - 25, 30 * (enemy.hp / enemy.maxHp), 4);
      }

      const vfx = visualEffectsRef.current;
      for (let i = vfx.length - 1; i >= 0; i--) { const effect = vfx[i]; if (effect.type === 'laser') { ctx.beginPath(); ctx.moveTo(effect.x1, effect.y1); ctx.lineTo(effect.x2, effect.y2); ctx.lineWidth = effect.life > 5 ? 4 : 2; ctx.strokeStyle = effect.color; ctx.stroke(); } effect.life--; if (effect.life <= 0) vfx.splice(i, 1); }
      if (pState.hp <= 0) { setAppState('GAMEOVER'); return; }
      frameCount++; if (frameCount % 15 === 0) { setHudData({ berris: pState.berris, level: pState.level, xp: pState.xp, maxXp: pState.maxXp, wave: '-', hp: Math.floor(pState.hp), maxHp: pState.maxHp, className: pState.name }); }
    }
    animate(0);
    return () => { cancelAnimationFrame(animationId); window.removeEventListener('contextmenu', handleContextMenu); window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('mousedown', handleMouseDown); };
  }, [appState]);

  // --- HTML MANTIDO ---
  return (
    <div style={{ margin: 0, padding: 0, overflow: 'hidden', backgroundColor: '#0f172a', height: '100vh', width: '100vw', fontFamily: 'sans-serif', cursor: cursorStyle }}>
      {appState === 'MENU' && (<div style={{ position: 'absolute', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'white', zIndex: 300, background: 'linear-gradient(to bottom, #1e3a8a, #0f172a)' }}> <h1 style={{ fontSize: '64px', color: 'gold', textShadow: '4px 4px 0px #000', marginBottom: '10px', textAlign: 'center' }}>PIRATE ARENA<br /><span style={{ fontSize: '32px', color: '#fff' }}>Multiplayer Online</span></h1> <div style={{ display: 'flex', gap: '20px', marginBottom: '50px', marginTop: '30px' }}> {Object.values(CLASSES).map(cls => (<div key={cls.id} onClick={() => setSelectedClass(cls.id)} style={{ width: '250px', padding: '20px', borderRadius: '12px', border: `4px solid ${selectedClass === cls.id ? 'gold' : '#334155'}`, backgroundColor: '#1e293b', cursor: 'pointer', transform: selectedClass === cls.id ? 'scale(1.05)' : 'scale(1)' }}> <h3 style={{ margin: '0 0 10px 0', color: cls.color, textAlign: 'center', fontSize: '24px' }}>{cls.name}</h3> <p style={{ fontSize: '14px', color: '#94a3b8', textAlign: 'center', minHeight: '60px' }}>{cls.desc}</p> </div>))} </div> <button onClick={() => startGame(selectedClass)} style={{ padding: '20px 60px', fontSize: '28px', fontWeight: 'bold', backgroundColor: 'gold', border: 'none', borderRadius: '50px', cursor: 'pointer', boxShadow: '0px 6px 0px #b45309' }}>Zarpar!</button> </div>)}
      {appState === 'PLAYING' && (<> <div style={{ position: 'absolute', top: 10, left: 10, color: 'white', backgroundColor: 'rgba(15, 23, 42, 0.85)', padding: '15px', borderRadius: '8px', zIndex: 50, pointerEvents: 'none' }}> <h2 style={{ margin: 0, color: CLASSES[gameState.current.player.classId]?.color }}>{hudData.className}</h2> <div style={{ backgroundColor: '#333', width: '220px', height: '22px', marginTop: '10px' }}><div style={{ backgroundColor: '#ef4444', width: `${Math.max(0, (hudData.hp / hudData.maxHp) * 100)}%`, height: '100%' }} /></div> <p style={{ margin: '5px 0 15px 0', fontSize: '14px', fontWeight: 'bold' }}>{hudData.hp} / {hudData.maxHp} HP</p> <p style={{ margin: '5px 0', color: 'gold', fontWeight: 'bold' }}>💰 Berris: {hudData.berris}</p> <p style={{ margin: '5px 0', color: '#38bdf8', fontWeight: 'bold' }}>⭐ Nível: {hudData.level} (XP: {hudData.xp}/{hudData.maxXp})</p> <p style={{ margin: '15px 0 0 0', fontSize: '12px', color: '#94a3b8' }}>Aperte <b>'B'</b> para Mercado Negro</p> </div>
        {isShopOpen && (<div style={{ position: 'absolute', top: '20%', left: '50%', transform: 'translate(-50%, 0)', width: '450px', backgroundColor: '#1e293b', border: '3px solid gold', borderRadius: '12px', padding: '25px', color: 'white', zIndex: 100 }}> <h2 style={{ textAlign: 'center', color: 'gold', marginTop: 0 }}>MERCADO NEGRO</h2> <p style={{ textAlign: 'center', fontSize: '18px' }}>Seus Berris: <b style={{ color: 'gold' }}>{hudData.berris}</b></p> <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px', backgroundColor: '#0f172a', padding: '10px' }}> <div><h4 style={{ margin: 0, color: '#38bdf8' }}>Melhoria de Arma (+5 Dano)</h4></div> <button onClick={() => buyItem('weapon')} style={{ backgroundColor: 'gold', border: 'none', padding: '5px 15px', cursor: 'pointer', fontWeight: 'bold' }}>50 B</button> </div> <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px', backgroundColor: '#0f172a', padding: '10px' }}> <div><h4 style={{ margin: 0, color: '#38bdf8' }}>Treinamento Haki (+0.3 Vel.)</h4></div> <button onClick={() => buyItem('speed')} style={{ backgroundColor: 'gold', border: 'none', padding: '5px 15px', cursor: 'pointer', fontWeight: 'bold' }}>30 B</button> </div> <div style={{ display: 'flex', justifyContent: 'space-between', backgroundColor: '#0f172a', padding: '10px' }}> <div><h4 style={{ margin: 0, color: '#ef4444' }}>Carne (+50 HP)</h4></div> <button onClick={() => buyItem('meat')} style={{ backgroundColor: '#ef4444', color: 'white', border: 'none', padding: '5px 15px', cursor: 'pointer', fontWeight: 'bold' }}>20 B</button> </div> <button onClick={() => { gameState.current.isShopOpen = false; setIsShopOpen(false); }} style={{ width: '100%', marginTop: '20px', padding: '10px', cursor: 'pointer' }}>Voltar</button> </div>)}
        <canvas ref={canvasRef} style={{ display: 'block' }} /> </>)}
      {appState === 'GAMEOVER' && (<div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(15, 23, 42, 0.95)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', color: 'white', zIndex: 200 }}> <h1 style={{ color: '#ef4444', fontSize: '72px', margin: 0 }}>DERROTADO</h1> <button onClick={() => setAppState('MENU')} style={{ marginTop: '40px', padding: '20px 40px', fontSize: '24px', backgroundColor: 'gold', border: 'none', cursor: 'pointer', fontWeight: 'bold', borderRadius: '50px' }}>Tentar Novamente</button> </div>)}
    </div>
  );
}