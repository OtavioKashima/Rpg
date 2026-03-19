import { createContext, useContext, useEffect, useState } from 'react';
import io from 'socket.io-client';

const GameContext = createContext();

export const GameProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [gameState, setGameState] = useState(null);

  useEffect(() => {
    fetch('/api/socket').finally(() => {
      const newSocket = io();
      setSocket(newSocket);

      newSocket.on('gameStateUpdate', (newState) => {
        setGameState(newState);
      });
    });

    return () => {
      if (socket) socket.disconnect();
    };
  }, []);

  return (
    <GameContext.Provider value={{ socket, gameState }}>
      {children}
    </GameContext.Provider>
  );
};

export const useGame = () => useContext(GameContext);