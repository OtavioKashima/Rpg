// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

const players = {};
const enemies = {};
let enemyIdCounter = 0;

// Função matemática para distância
const getDist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);

// --- SPAWNER DE INIMIGOS ---
// Nasce 1 inimigo a cada 2.5 segundos, se houver jogadores
setInterval(() => {
  if (Object.keys(players).length > 0 && Object.keys(enemies).length < 20) {
    enemyIdCounter++;
    const angle = Math.random() * Math.PI * 2;
    // Nasce numa borda aleatória
    const x = 500 + Math.cos(angle) * 600; 
    const y = 500 + Math.sin(angle) * 600;

    enemies[enemyIdCounter] = {
      id: enemyIdCounter, x, y, radius: 18, color: '#e63946',
      speed: 1.5, hp: 40, maxHp: 40, damage: 10
    };
  }
}, 2500); 

// --- GAME LOOP DO SERVIDOR (30 FPS) ---
setInterval(() => {
  // 1. Move os inimigos em direção ao jogador MAIS PRÓXIMO
  for (let eId in enemies) {
    let enemy = enemies[eId];
    let closestPlayerId = null;
    let minDistance = Infinity;

    // Acha quem tá mais perto
    for (let pId in players) {
      let p = players[pId];
      let dist = getDist(enemy.x, enemy.y, p.x, p.y);
      if (dist < minDistance) { 
        minDistance = dist; 
        closestPlayerId = pId; 
      }
    }

    // Se achou alguém, vai pra cima!
    if (closestPlayerId) {
      let target = players[closestPlayerId];
      let angle = Math.atan2(target.y - enemy.y, target.x - enemy.x);
      enemy.x += Math.cos(angle) * enemy.speed;
      enemy.y += Math.sin(angle) * enemy.speed;

      // Se encostar no jogador (colisão), manda ele tomar dano
      if (minDistance < 38) { // Raio do player (20) + Raio do inimigo (18)
        io.to(closestPlayerId).emit('playerHit', enemy.damage * 0.05);
      }
    }
  }

  // 2. Envia o mundo atualizado para TODOS os jogadores
  io.emit('serverState', { players, enemies });

}, 1000 / 30);

// --- CONEXÕES E EVENTOS ---
io.on('connection', (socket) => {
  console.log('Pirata entrou! ID:', socket.id);
  players[socket.id] = { id: socket.id, x: 500, y: 500, color: '#fff' };

  // Atualiza posição vinda do navegador
  socket.on('playerMovement', (data) => {
    if (players[socket.id]) {
      players[socket.id].x = data.x;
      players[socket.id].y = data.y;
      players[socket.id].color = data.color;
    }
  });

  // Trata o dano quando alguém ataca
  socket.on('attackEnemy', (data) => {
    let enemy = enemies[data.targetId];
    if (enemy) {
      enemy.hp -= data.damage;
      if (enemy.hp <= 0) {
        delete enemies[data.targetId];
        // Envia XP e Ouro para o pirata que deu o golpe final
        socket.emit('enemyKilled', { xp: 20, berris: 15 });
      }
    }
  });

  socket.on('disconnect', () => {
    console.log('Pirata saiu. ID:', socket.id);
    delete players[socket.id];
  });
});

server.listen(3001, () => { console.log('Servidor da Marinha na porta 3001'); });