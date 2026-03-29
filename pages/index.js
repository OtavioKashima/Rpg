import { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';

export default function Game() {
  // Estados do Jogo: MENU, PLAYING, GAME_OVER, WON
  const [appState, setAppState] = useState('MENU'); 
  const [playerHp, setPlayerHp] = useState(100);
  
  const canvasRef = useRef(null);
  const socketRef = useRef(null);
  const serverWorldRef = useRef(null);

  // Referências para as Imagens
  const playerImgRef = useRef(null);
  const enemyImgRef = useRef(null);
  const bossImgRef = useRef(null);

  // Carrega as imagens assim que o site abre
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const pImg = new Image(); pImg.src = '/player.png'; 
      const eImg = new Image(); eImg.src = '/marine.png'; 
      const bImg = new Image(); bImg.src = '/bigmom.jpg'; // A imagem da Big Mom!
      
      playerImgRef.current = pImg;
      enemyImgRef.current = eImg;
      bossImgRef.current = bImg;
    }
  }, []);

  // --- CONEXÃO COM O SERVIDOR ---
  useEffect(() => {
    if (appState !== 'PLAYING') return;

    // URL do seu Railway (A Conexão Blindada)
    const SOCKET_URL = 'https://rpg-production-c7f8.up.railway.app';

    socketRef.current = io(SOCKET_URL, {
      transports: ['websocket'],
      upgrade: false
    });

    // Recebe o mundo atualizado do servidor a 60 frames por segundo
    socketRef.current.on('serverState', (state) => {
      serverWorldRef.current = state;
    });

    // Recebe dano dos inimigos/boss
    socketRef.current.on('playerHit', (damage) => {
      setPlayerHp((prev) => {
        const newHp = prev - damage;
        if (newHp <= 0) {
          setAppState('GAME_OVER'); // Você morreu!
          socketRef.current.disconnect();
        }
        return newHp;
      });
    });

    // O servidor avisa que a Big Mom morreu
    socketRef.current.on('gameWon', () => {
      setAppState('WON'); // Tela de Vitória!
      socketRef.current.disconnect();
    });

    // A "Vassoura": Limpa a conexão se o jogador sair da tela
    return () => {
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, [appState]);

  // --- LOOP DE DESENHO (RENDERIZAÇÃO) ---
  useEffect(() => {
    if (appState !== 'PLAYING') return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationFrameId;

    const render = () => {
      const state = serverWorldRef.current;
      if (!state) {
        animationFrameId = requestAnimationFrame(render);
        return;
      }

      // 1. Limpa o fundo do mapa (Grama)
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#228B22'; 
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 2. Desenha a Big Mom (Boss)
      if (state.boss) {
        const boss = state.boss;
        const bImg = bossImgRef.current;
        if (bImg && bImg.complete) {
          ctx.drawImage(bImg, boss.x - boss.radius, boss.y - boss.radius, boss.radius * 2, boss.radius * 2);
        } else {
          // Fallback caso a imagem não carregue
          ctx.beginPath();
          ctx.arc(boss.x, boss.y, boss.radius, 0, Math.PI * 2);
          ctx.fillStyle = 'purple';
          ctx.fill();
        }
        
        // Barra de Vida da Big Mom
        ctx.fillStyle = 'black';
        ctx.fillRect(boss.x - 100, boss.y - boss.radius - 20, 200, 15);
        ctx.fillStyle = 'red';
        ctx.fillRect(boss.x - 100, boss.y - boss.radius - 20, (boss.hp / boss.maxHp) * 200, 15);
      }

      // 3. Desenha Inimigos Normais
      for (let eId in state.enemies) {
        const enemy = state.enemies[eId];
        const eImg = enemyImgRef.current;
        if (eImg && eImg.complete) {
          ctx.drawImage(eImg, enemy.x - enemy.radius, enemy.y - enemy.radius, enemy.radius * 2, enemy.radius * 2);
        } else {
          ctx.beginPath();
          ctx.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2);
          ctx.fillStyle = 'red';
          ctx.fill();
        }
        // Barra de Vida do Inimigo
        ctx.fillStyle = 'black';
        ctx.fillRect(enemy.x - 25, enemy.y - enemy.radius - 10, 50, 5);
        ctx.fillStyle = 'red';
        ctx.fillRect(enemy.x - 25, enemy.y - enemy.radius - 10, (enemy.hp / enemy.maxHp) * 50, 5);
      }

      // 4. Desenha os Jogadores (Multiplayer)
      for (let pId in state.players) {
        const player = state.players[pId];
        const pImg = playerImgRef.current;
        if (pImg && pImg.complete) {
          ctx.drawImage(pImg, player.x - player.radius, player.y - player.radius, player.radius * 2, player.radius * 2);
        } else {
          ctx.beginPath();
          ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
          ctx.fillStyle = 'blue';
          ctx.fill();
        }
        
        // Mostra qual boneco é o SEU
        if (socketRef.current && pId === socketRef.current.id) {
          ctx.fillStyle = 'yellow';
          ctx.font = '16px Arial';
          ctx.fillText('Você', player.x - 18, player.y - player.radius - 10);
        }
      }

      // 5. Interface (UI) - Waves e Abates
      ctx.fillStyle = 'white';
      ctx.shadowColor = "black";
      ctx.shadowBlur = 4;
      ctx.shadowLineWidth = 3;

      if (state.wave < 10) {
        ctx.font = 'bold 24px Arial';
        ctx.fillText(`WAVE: ${state.wave} / 10`, 20, 40);
        ctx.fillText(`Abates: ${state.killsThisWave} / ${state.killsNeeded}`, 20, 70);
      } else {
        ctx.fillStyle = '#ff4444';
        ctx.font = 'bold 36px Arial';
        ctx.fillText(`⚠️ BOSS FIGHT: BIG MOM ⚠️`, 20, 50);
      }
      ctx.shadowBlur = 0; // Desliga a sombra para não bugar outros desenhos

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => cancelAnimationFrame(animationFrameId);
  }, [appState]);

  // --- CONTROLES DE MOVIMENTO E ATAQUE ---
  const handleMouseMove = (e) => {
    if (appState !== 'PLAYING' || !socketRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    
    // Calcula a posição real do mouse dentro do canvas escalado
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    socketRef.current.emit('playerMovement', { x, y, color: 'blue' });
  };

  const handleMouseClick = (e) => {
    if (appState !== 'PLAYING' || !socketRef.current) return;
    const state = serverWorldRef.current;
    if (!state) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;
    const clickX = (e.clientX - rect.left) * scaleX;
    const clickY = (e.clientY - rect.top) * scaleY;

    const myDamage = 25; // Seu dano por clique

    // 1. Tenta atacar o Boss primeiro (prioridade)
    if (state.boss) {
      const boss = state.boss;
      const dist = Math.hypot(boss.x - clickX, boss.y - clickY);
      if (dist <= boss.radius) {
        socketRef.current.emit('attackEnemy', { targetId: 'bigmom', damage: myDamage });
        return; 
      }
    }

    // 2. Se não clicou no boss, tenta atacar inimigos
    for (let eId in state.enemies) {
      const enemy = state.enemies[eId];
      const dist = Math.hypot(enemy.x - clickX, enemy.y - clickY);
      if (dist <= enemy.radius) {
        socketRef.current.emit('attackEnemy', { targetId: eId, damage: myDamage });
        break; // Ataca apenas 1 inimigo por clique
      }
    }
  };

  // --- TELAS VISUAIS ---
  if (appState === 'MENU') {
    return (
      <div style={styles.container}>
        <h1 style={styles.title}>ONE PIECE: SURVIVOR</h1>
        <button style={styles.button} onClick={() => { setAppState('PLAYING'); setPlayerHp(100); }}>
          ZARPAR!
        </button>
      </div>
    );
  }

  if (appState === 'GAME_OVER') {
    return (
      <div style={styles.container}>
        <h1 style={{...styles.title, color: 'red'}}>VOCÊ FOI DERROTADO!</h1>
        <button style={styles.button} onClick={() => setAppState('MENU')}>
          TENTAR NOVAMENTE
        </button>
      </div>
    );
  }

  if (appState === 'WON') {
    return (
      <div style={styles.container}>
        <h1 style={{...styles.title, color: 'gold'}}>VITÓRIA! A BIG MOM CAIU!</h1>
        <button style={styles.button} onClick={() => setAppState('MENU')}>
          JOGAR NOVAMENTE
        </button>
      </div>
    );
  }

  // --- TELA DO JOGO (CANVAS) ---
  return (
    <div style={styles.gameContainer}>
      <div style={styles.hpBarContainer}>
         <div style={{...styles.hpBar, width: `${Math.max(0, playerHp)}%`}}></div>
         <span style={styles.hpText}>Seu HP: {playerHp}</span>
      </div>
      <canvas
        ref={canvasRef}
        width={1500}
        height={1500}
        style={styles.canvas}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseClick}
      />
    </div>
  );
}

// --- ESTILOS CSS ---
const styles = {
  container: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: '#111', color: 'white' },
  title: { fontSize: '48px', marginBottom: '20px', textShadow: '2px 2px 4px #000' },
  button: { padding: '15px 30px', fontSize: '24px', cursor: 'pointer', backgroundColor: '#ff9900', border: 'none', borderRadius: '10px', fontWeight: 'bold' },
  gameContainer: { display: 'flex', flexDirection: 'column', alignItems: 'center', backgroundColor: '#222', minHeight: '100vh', overflow: 'hidden' },
  canvas: {
    border: '5px solid #333',
    cursor: 'crosshair', // <- CORRIGE O ERRO 404 DO CURSOR AQUI! UMA MIRA PERFEITA!
    backgroundColor: '#228B22',
    maxWidth: '100%',
    maxHeight: '85vh', 
    objectFit: 'contain' // Garante que não vai ficar distorcido no PC dos outros
  },
  hpBarContainer: { width: '80%', height: '30px', backgroundColor: '#333', border: '2px solid white', margin: '15px', position: 'relative', borderRadius: '5px', overflow: 'hidden' },
  hpBar: { height: '100%', backgroundColor: '#32cd32', transition: 'width 0.2s ease' },
  hpText: { position: 'absolute', top: '4px', left: '50%', transform: 'translateX(-50%)', color: 'white', fontWeight: 'bold', textShadow: '1px 1px 2px black', fontSize: '18px' }
};