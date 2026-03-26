const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server } = require('socket.io');

// Configuração do Next.js
const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

// Pega a porta do Railway ou usa a 3000 no PC
const PORT = process.env.PORT || 3000;

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
  });

  // --- O MOTOR DO JOGO (ESTADO GLOBAL) ---
  let world = { players: {}, enemies: {} };
  let enemyIdCounter = 0;

  io.on('connection', (socket) => {
    console.log('Um pirata conectou:', socket.id);

    // Quando o jogador se move no frontend, atualizamos no backend
    socket.on('playerMovement', (data) => {
      world.players[socket.id] = { 
        id: socket.id,
        x: data.x, 
        y: data.y, 
        color: data.color 
      };
    });

    // Quando o jogador ataca um inimigo
    socket.on('attackEnemy', (data) => {
      const enemy = world.enemies[data.targetId];
      if (enemy) {
        enemy.hp -= data.damage;
        if (enemy.hp <= 0) {
          delete world.enemies[data.targetId]; // Inimigo morre
          // Envia a recompensa de XP e Berris para quem matou
          socket.emit('enemyKilled', { xp: 20, berris: 15 }); 
        }
      }
    });

    // Quando o jogador fecha a aba ou cai a internet
    socket.on('disconnect', () => {
      console.log('Pirata desconectou:', socket.id);
      delete world.players[socket.id];
    });
  });

  // --- SISTEMA DE NASCIMENTO DE INIMIGOS (SPAWNER) ---
  // Roda a cada 2 segundos
  setInterval(() => {
    // Só cria inimigos se tiver alguém jogando e se tiver menos de 20 inimigos no mapa
    if (Object.keys(world.players).length > 0 && Object.keys(world.enemies).length < 20) {
      const id = 'marine_' + enemyIdCounter++;
      world.enemies[id] = {
        x: Math.random() * 1500, // Posição X aleatória
        y: Math.random() * 1500, // Posição Y aleatória
        radius: 20,
        hp: 50,
        maxHp: 50,
        speed: 1.5, // Velocidade do marinheiro
        color: '#ff0000'
      };
    }
  }, 2000);

  // --- O LOOP PRINCIPAL (RODA 60 VEZES POR SEGUNDO) ---
  setInterval(() => {
    // Inteligência Artificial dos inimigos: perseguir o jogador mais próximo
    for (let eId in world.enemies) {
      let enemy = world.enemies[eId];
      let nearestPlayer = null;
      let minDist = Infinity;

      // Procura qual jogador está mais perto
      for (let pId in world.players) {
        let player = world.players[pId];
        let dist = Math.hypot(player.x - enemy.x, player.y - enemy.y);
        if (dist < minDist) {
          minDist = dist;
          nearestPlayer = player;
        }
      }

      // Se achou um alvo, anda na direção dele
      if (nearestPlayer) {
        const dx = nearestPlayer.x - enemy.x;
        const dy = nearestPlayer.y - enemy.y;
        const dist = Math.hypot(dx, dy);

        if (dist > 0) {
          enemy.x += (dx / dist) * enemy.speed;
          enemy.y += (dy / dist) * enemy.speed;
        }

        // Se encostar no jogador, dá dano
        if (dist < enemy.radius + 20) {
           // Envia o aviso de dano só para o jogador que apanhou
           io.to(nearestPlayer.id).emit('playerHit', 2); 
        }
      }
    }

    // Tira uma "foto" do mundo e envia para todos os jogadores verem
    io.emit('serverState', world);
  }, 1000 / 60);

  // Liga o servidor unificado para a nuvem!
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`> 🏴‍☠️ Navio zarpando! Jogo e Site rodando na porta ${PORT}`);
  });
});