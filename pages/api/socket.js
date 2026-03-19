import { Server } from 'socket.io';

// ESTADO GLOBAL VOLÁTIL DA PARTIDA
const gameState = {
  players: [],
  monsters: [
    { id: 'm1', name: 'Goblin', hp: 30, maxHp: 30, atk: 2, def: 1, level: 1 }
  ],
  mapId: 1,
  turn: 'players', // 'players' ou 'monsters'
  coins: 0,
  logs: ['A partida começou no Mapa 1.']
};

let actionsQueue = [];

export default function SocketHandler(req, res) {
  if (res.socket.server.io) {
    console.log('Socket já está rodando');
    res.end();
    return;
  }

  const io = new Server(res.socket.server);
  res.socket.server.io = io;

  io.on('connection', (socket) => {
    console.log('Novo jogador conectado:', socket.id);

    // Envia o estado atual para quem acabou de entrar
    socket.emit('gameStateUpdate', gameState);

    socket.on('joinGame', (playerData) => {
      if (gameState.players.length >= 4) {
        socket.emit('errorMsg', 'A sala já está cheia (4 jogadores).');
        return;
      }

      const newPlayer = {
        id: socket.id,
        name: playerData.name,
        class: playerData.class,
        hp: 50, maxHp: 50,
        mp: 20, maxMp: 20,
        atk: playerData.class === 'Guerreiro' ? 5 : 3,
        def: playerData.class === 'Guerreiro' ? 3 : 1,
        level: 1,
        xp: 0
      };

      gameState.players.push(newPlayer);
      gameState.logs.push(`${newPlayer.name} (${newPlayer.class}) entrou no jogo.`);
      io.emit('gameStateUpdate', gameState);
    });

    socket.on('playerAction', (action) => {
      if (gameState.turn !== 'players') return;
      
      const player = gameState.players.find(p => p.id === socket.id);
      if (!player || player.hp <= 0) return;

      // Impede de jogar duas vezes no mesmo turno
      if (actionsQueue.find(a => a.playerId === socket.id)) return;

      actionsQueue.push({ playerId: socket.id, action });

      // Se os 4 jogaram (ou todos os vivos jogaram), resolve o turno
      const alivePlayers = gameState.players.filter(p => p.hp > 0);
      if (actionsQueue.length === alivePlayers.length) {
        processTurn(io);
      }
    });

    socket.on('disconnect', () => {
      gameState.players = gameState.players.filter(p => p.id !== socket.id);
      io.emit('gameStateUpdate', gameState);
    });
  });

  res.end();
}

// GAME LOOP: Lógica de Processamento
function processTurn(io) {
  // 1. Processa ações dos jogadores
  actionsQueue.forEach(({ playerId, action }) => {
    const player = gameState.players.find(p => p.id === playerId);
    const target = gameState.monsters[0]; // Simplificação: ataca o 1º monstro

    if (!target) return;

    // Lógica do Mapa 3: Custo de Mana dobrado (aplicar se for habilidade especial)
    let manaCost = action.type === 'special' ? 10 : 0;
    if (gameState.mapId === 3) manaCost *= 2;

    if (player.mp < manaCost) {
      gameState.logs.push(`${player.name} falhou ao conjurar (Sem MP).`);
      return;
    }
    player.mp -= manaCost;

    // Rola Dado (1 a 10)
    const dice = Math.floor(Math.random() * 10) + 1;
    let finalDamage = (dice + player.atk) - target.def;
    if (finalDamage < 0) finalDamage = 0;

    // Passiva do Necromante
    if (player.class === 'Necromante' && Math.random() > 0.5) {
      finalDamage += 4;
      gameState.logs.push(`${player.name} ativou Alma do Cemitério (+4 Dano)!`);
    }

    target.hp -= finalDamage;
    gameState.logs.push(`${player.name} rolou [${dice}]. Causou ${finalDamage} de dano ao ${target.name}.`);
  });

  actionsQueue = []; // Limpa fila

  // Verifica se o monstro morreu
  if (gameState.monsters[0]?.hp <= 0) {
    gameState.logs.push(`${gameState.monsters[0].name} foi derrotado! O grupo ganhou XP e Moedas.`);
    gameState.coins += 15;
    gameState.monsters.shift(); // Remove monstro morto
    
    // (AQUI VOCÊ ADICIONA LÓGICA DE LEVEL UP E TROCA DE MAPA)
  }

  // 2. Fase dos Monstros
  gameState.turn = 'monsters';
  io.emit('gameStateUpdate', gameState);

  setTimeout(() => {
    if (gameState.monsters.length > 0) {
      const monster = gameState.monsters[0];
      const alivePlayers = gameState.players.filter(p => p.hp > 0);
      
      if (alivePlayers.length > 0) {
        // Monstro escolhe alvo aleatório
        const target = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
        
        // Lógica do Mapa 2: Debuff de Defesa nos jogadores
        let targetDef = target.def;
        if (gameState.mapId === 2) targetDef = Math.floor(targetDef * 0.8); 

        const dice = Math.floor(Math.random() * 10) + 1;
        let finalDamage = (dice + monster.atk) - targetDef;
        if (finalDamage < 0) finalDamage = 0;

        target.hp -= finalDamage;
        gameState.logs.push(`${monster.name} atacou ${target.name} causando ${finalDamage} de dano.`);
      }
    }

    // 3. Volta o turno para os jogadores e avisa o front
    gameState.turn = 'players';
    io.emit('gameStateUpdate', gameState);
  }, 2000); // Pausa de 2 segundos para dar tempo do front renderizar o turno
}