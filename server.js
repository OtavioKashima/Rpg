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

  // ESTADO GLOBAL DO JOGO
  let world = { 
    players: {}, 
    enemies: {}, 
    boss: null,
    wave: 1, 
    killsThisWave: 0, 
    killsNeeded: 10,
    enemiesSpawnedThisWave: 0 // <--- NOVO: Controla quantos já nasceram
  };
  let enemyIdCounter = 0;

  // FUNÇÃO DE LIMPEZA GERAL
  const resetWorld = () => {
    world.enemies = {};
    world.boss = null;
    world.wave = 1;
    world.killsThisWave = 0;
    world.killsNeeded = 10;
    world.enemiesSpawnedThisWave = 0; // Reseta os nascimentos
    enemyIdCounter = 0;
  };

  io.on('connection', (socket) => {
    
    socket.on('playerMovement', (data) => {
      // --- CÃO DE GUARDA CONTRA RUNS FANTASMAS ---
      // Se não há nenhum jogador registrado no servidor, MAS tem inimigos vivos
      // ou a wave está avançada, significa que é uma run que bugou. Limpamos a força!
      if (Object.keys(world.players).length === 0 && (Object.keys(world.enemies).length > 0 || world.wave > 1)) {
        resetWorld();
      }

      world.players[socket.id] = { id: socket.id, x: data.x, y: data.y, color: data.color, radius: 25 };
    });

    socket.on('attackEnemy', (data) => {
      if (data.targetId === 'bigmom' && world.boss) {
        world.boss.hp -= data.damage;
        if (world.boss.hp <= 0) {
          world.boss = null;
          io.emit('gameWon'); 
          setTimeout(resetWorld, 5000); 
        }
      } else if (world.enemies[data.targetId]) {
        const enemy = world.enemies[data.targetId];
        enemy.hp -= data.damage;
        if (enemy.hp <= 0) {
          delete world.enemies[data.targetId];
          socket.emit('enemyKilled', { xp: 20 * world.wave, berris: 15 * world.wave }); 
          
          world.killsThisWave++;
          // Se completou a Wave
          if (world.killsThisWave >= world.killsNeeded && world.wave < 10) {
            world.wave++;
            world.killsThisWave = 0;
            world.killsNeeded = 10 + (world.wave * 5); 
            world.enemiesSpawnedThisWave = 0; // <--- Zera para começar a nascer a Wave Nova
          }
        }
      }
    });

    socket.on('playerDeath', () => {
      delete world.players[socket.id];
      if (Object.keys(world.players).length === 0) resetWorld();
    });

    socket.on('disconnect', () => { 
      delete world.players[socket.id]; 
      if (Object.keys(world.players).length === 0) resetWorld();
    });
  });

  // --- SPAWNER INTELIGENTE E LIMITADO ---
  setInterval(() => {
    const playerCount = Object.keys(world.players).length;
    if (playerCount === 0) return;

    if (world.wave < 10) {
      const enemiesOnScreen = Object.keys(world.enemies).length;
      const maxSimultaneous = 15 + (playerCount * 5);

      // Calcula quantos inimigos devem nascer agora
      // Ele pega o menor valor entre: Faltam para a wave acabar / Espaço na tela / Max 3 por pulso
      let enemiesToSpawn = Math.min(
        world.killsNeeded - world.enemiesSpawnedThisWave, 
        maxSimultaneous - enemiesOnScreen,
        3 // Nascem até 3 de uma vez para não demorar uma eternidade
      );

      // Roda o loop para criar a quantidade exata
      for (let i = 0; i < enemiesToSpawn; i++) {
        if (world.enemiesSpawnedThisWave < world.killsNeeded) {
          const id = 'marine_' + enemyIdCounter++;
          world.enemies[id] = {
            x: Math.random() * 2000, y: Math.random() * 2000,
            radius: 30, 
            hp: 40 + (world.wave * 25), 
            maxHp: 40 + (world.wave * 25),
            speed: 1.5 + (world.wave * 0.15),
            damage: 5 + (world.wave * 2),
            color: '#ff0000',
            attackCooldown: 0
          };
          world.enemiesSpawnedThisWave++; // <--- Contabiliza que nasceu
        }
      }
    } else if (world.wave === 10 && !world.boss) {
      world.boss = {
        id: 'bigmom',
        x: 1000, y: 1000, 
        radius: 100, 
        hp: 4000 * playerCount, 
        maxHp: 4000 * playerCount,
        attackTimer: 0
      };
    }
  }, 2000);

  // LOOP PRINCIPAL (IA E MOVIMENTAÇÃO)
  setInterval(() => {
    for (let eId in world.enemies) {
      let enemy = world.enemies[eId];
      if (enemy.attackCooldown > 0) enemy.attackCooldown--;

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
        
        // Hitbox curta e com tempo de recarga
        if (dist < 20) {
           if (enemy.attackCooldown <= 0) {
             io.to(nearestPlayer.id).emit('playerHit', enemy.damage); 
             enemy.attackCooldown = 60; 
           }
        }
      }
    }

    if (world.boss) {
      world.boss.attackTimer++;
      if (world.boss.attackTimer >= 180) { 
        for (let pId in world.players) {
          io.to(pId).emit('playerHit', 25);
        }
        world.boss.attackTimer = 0;
      }
    }

    io.emit('serverState', world);
  }, 1000 / 60);

  server.listen(PORT, '0.0.0.0', () => console.log(`> Servidor rodando na porta ${PORT}`));
});