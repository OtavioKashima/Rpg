const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server } = require('socket.io');

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();
const PORT = process.env.PORT || 3000;

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

  // --- ESTADO GLOBAL DO JOGO (GARANTE A SINCRONIA) ---
  let world = { 
    players: {}, 
    enemies: {}, 
    boss: null,
    wave: 1, 
    killsThisWave: 0, 
    killsNeeded: 10 // Aumenta a cada wave
  };
  let enemyIdCounter = 0;

  io.on('connection', (socket) => {
    // ... (Conexão do jogador)
    socket.on('playerMovement', (data) => {
      world.players[socket.id] = { 
        id: socket.id, x: data.x, y: data.y, color: data.color, 
        radius: 35 // JOGADORES MAIORES (Antes era ~20)
      };
    });

    // --- LÓGICA DE DANO E ONDAS ---
    socket.on('attackEnemy', (data) => {
      // 1. Dano no Boss
      if (data.targetId === 'bigmom' && world.boss) {
        world.boss.hp -= data.damage;
        if (world.boss.hp <= 0) {
          world.boss = null;
          io.emit('gameWon'); // Aviso de vitória para todos!
          // Reseta o jogo após 5 segundos
          setTimeout(() => { world.wave = 1; world.killsThisWave = 0; world.killsNeeded = 10; }, 5000);
        }
      } 
      // 2. Dano nos inimigos normais
      else if (world.enemies[data.targetId]) {
        const enemy = world.enemies[data.targetId];
        enemy.hp -= data.damage;
        if (enemy.hp <= 0) {
          delete world.enemies[data.targetId];
          socket.emit('enemyKilled', { xp: 20 * world.wave, berris: 15 * world.wave }); 
          
          world.killsThisWave++;
          // Avança a Wave se bateu a meta
          if (world.killsThisWave >= world.killsNeeded && world.wave < 10) {
            world.wave++;
            world.killsThisWave = 0;
            world.killsNeeded += 5; // Próxima wave precisa de +5 abates
          }
        }
      }
    });

    socket.on('disconnect', () => { delete world.players[socket.id]; });
  });

  // --- SPAWNER (GERADOR DE INIMIGOS E BOSS) ---
  setInterval(() => {
    const playerCount = Object.keys(world.players).length;
    if (playerCount === 0) return; // Pausa o jogo se não houver ninguém

    if (world.wave < 10) {
      // Inimigos Normais (Escalonam com a Wave)
      if (Object.keys(world.enemies).length < 15) {
        const id = 'marine_' + enemyIdCounter++;
        world.enemies[id] = {
          x: Math.random() * 1500, y: Math.random() * 1500,
          radius: 35, // INIMIGOS MAIORES
          hp: 50 + (world.wave * 20), // ESCALONAMENTO DE VIDA
          maxHp: 50 + (world.wave * 20),
          speed: 1.5 + (world.wave * 0.1), // Ficam mais rápidos
          damage: 2 + (world.wave * 1), // Batem mais forte
          color: '#ff0000'
        };
      }
    } else if (world.wave === 10 && !world.boss) {
      // SPAWN DA BIG MOM NA WAVE 10
      world.boss = {
        id: 'bigmom',
        x: 750, y: 750, // Fixa no centro do mapa
        radius: 120, // GIGANTE
        hp: 5000 * playerCount, // Vida escala com a quantidade de jogadores!
        maxHp: 5000 * playerCount,
        attackTimer: 0
      };
    }
  }, 2000);

  // --- LOOP PRINCIPAL (IA E COLISÕES) ---
  setInterval(() => {
    // 1. IA dos Inimigos Normais
    for (let eId in world.enemies) {
      let enemy = world.enemies[eId];
      let nearestPlayer = null; let minDist = Infinity;

      for (let pId in world.players) {
        let player = world.players[pId];
        let dist = Math.hypot(player.x - enemy.x, player.y - enemy.y);
        if (dist < minDist) { minDist = dist; nearestPlayer = player; }
      }

      if (nearestPlayer) {
        const dist = Math.hypot(nearestPlayer.x - enemy.x, nearestPlayer.y - enemy.y);
        if (dist > 0) {
          enemy.x += ((nearestPlayer.x - enemy.x) / dist) * enemy.speed;
          enemy.y += ((nearestPlayer.y - enemy.y) / dist) * enemy.speed;
        }
        if (dist < enemy.radius + nearestPlayer.radius) {
           io.to(nearestPlayer.id).emit('playerHit', enemy.damage); 
        }
      }
    }

    // 2. IA do Boss (Big Mom) - Ataque Global
    if (world.boss) {
      world.boss.attackTimer++;
      // A cada 3 segundos (60 frames * 3), ela ataca TODOS os jogadores
      if (world.boss.attackTimer >= 180) {
        for (let pId in world.players) {
          io.to(pId).emit('playerHit', 25); // Dano pesado em área
        }
        world.boss.attackTimer = 0;
      }
    }

    io.emit('serverState', world);
  }, 1000 / 60);

  server.listen(PORT, '0.0.0.0', () => console.log(`> Servidor rodando na porta ${PORT}`));
});