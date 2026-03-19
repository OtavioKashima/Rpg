import { useGame } from '../contexts/gameContext';
import { useRouter } from 'next/router';

export default function Game() {
  const { socket, gameState } = useGame();
  const router = useRouter();

  if (!gameState) return <div>Carregando estado do jogo...</div>;

  const myPlayer = gameState.players.find(p => p.id === socket?.id);

  const handleAttack = () => {
    socket.emit('playerAction', { type: 'attack' });
  };

  const handleSpecial = () => {
    socket.emit('playerAction', { type: 'special' });
  };

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif', display: 'flex', gap: '2rem' }}>
      {/* PAINEL ESQUERDO: Grupo e Ações */}
      <div style={{ flex: 1 }}>
        <h1>Mapa {gameState.mapId} | Moedas do Grupo: {gameState.coins}</h1>
        <h3>Turno Atual: {gameState.turn === 'players' ? 'Sua Vez!' : 'Monstros atacando...'}</h3>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '2rem' }}>
          {gameState.players.map(p => (
            <div key={p.id} style={{ border: p.id === socket?.id ? '2px solid blue' : '1px solid gray', padding: '1rem' }}>
              <h4>{p.name} ({p.class})</h4>
              <p>HP: {p.hp}/{p.maxHp} | MP: {p.mp}/{p.maxMp}</p>
              <p>Atk: {p.atk} | Def: {p.def}</p>
              
              {p.id === socket?.id && gameState.turn === 'players' && p.hp > 0 && (
                <div style={{ marginTop: '1rem' }}>
                  <button onClick={handleAttack} style={{ marginRight: '0.5rem' }}>Atacar</button>
                  <button onClick={handleSpecial}>Especial (10 MP)</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* PAINEL DIREITO: Inimigos e Logs */}
      <div style={{ flex: 1 }}>
        <div style={{ border: '2px solid red', padding: '1rem', backgroundColor: '#fee' }}>
          <h2>Inimigos</h2>
          {gameState.monsters.length > 0 ? gameState.monsters.map(m => (
            <div key={m.id}>
              <h4>{m.name} (Lvl {m.level})</h4>
              <p>HP: {m.hp}/{m.maxHp} | Atk: {m.atk} | Def: {m.def}</p>
            </div>
          )) : <p>Área limpa! Pressione para avançar para o próximo mapa.</p>}
        </div>

        <div style={{ marginTop: '2rem', border: '1px solid black', padding: '1rem', height: '300px', overflowY: 'scroll' }}>
          <h2>Log de Combate</h2>
          {gameState.logs.map((log, i) => (
            <p key={i} style={{ borderBottom: '1px solid #ccc', margin: '4px 0' }}>{log}</p>
          ))}
        </div>
      </div>
    </div>
  );
}