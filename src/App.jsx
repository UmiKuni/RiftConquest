import { useState } from "react";
import HostingScreen from "./components/HostingScreen";
import GameScreen from "./components/GameScreen";

function App() {
  const [session, setSession] = useState(null);

  if (!session) {
    return <HostingScreen onConnected={setSession} />;
  }

  return <GameScreen session={session} onLeave={() => setSession(null)} />;
}

export default App;
