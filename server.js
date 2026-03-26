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
  // Cria um único servidor HTTP que vai cuidar de tudo
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  // Acopla o Socket.io (o multiplayer) no mesmo servidor
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  // ---> COLOQUE A LÓGICA DO SEU JOGO AQUI DENTRO <---
  // Exemplo do que você já tinha:
  let world = { players: {}, enemies: {} };

  io.on('connection', (socket) => {
    console.log('Um pirata conectou:', socket.id);
    
    // Todo aquele seu código de on('playerMovement'), on('attackEnemy'), etc., vem aqui
    
    socket.on('disconnect', () => {
      console.log('Pirata desconectou:', socket.id);
      delete world.players[socket.id];
    });
  });
  // --------------------------------------------------

  // Liga o servidor unificado!
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`> 🏴‍☠️ Navio zarpando! Jogo e Site rodando na porta ${PORT}`);
  });
});