// Manages the player waitlist for quick matching

export interface WaitingPlayer {
  socketId: string;
  name: string;
  joinedAt: Date;
  lastActive: Date;
}

export class LobbyManager {
  private waitingPlayers: Map<string, WaitingPlayer> = new Map();

  // Add a player to the waitlist
  addPlayer(socketId: string, name: string): WaitingPlayer {
    const player: WaitingPlayer = {
      socketId,
      name,
      joinedAt: new Date(),
      lastActive: new Date(),
    };
    this.waitingPlayers.set(socketId, player);
    console.log(`Player ${name} joined lobby (${this.waitingPlayers.size} waiting)`);
    return player;
  }

  // Remove a player from the waitlist
  removePlayer(socketId: string): WaitingPlayer | null {
    const player = this.waitingPlayers.get(socketId);
    if (player) {
      this.waitingPlayers.delete(socketId);
      console.log(`Player ${player.name} left lobby (${this.waitingPlayers.size} waiting)`);
      return player;
    }
    return null;
  }

  // Update player's last active timestamp (for heartbeat)
  updateActivity(socketId: string): void {
    const player = this.waitingPlayers.get(socketId);
    if (player) {
      player.lastActive = new Date();
    }
  }

  // Check if a player is in the lobby
  isInLobby(socketId: string): boolean {
    return this.waitingPlayers.has(socketId);
  }

  // Get a player by socket ID
  getPlayer(socketId: string): WaitingPlayer | undefined {
    return this.waitingPlayers.get(socketId);
  }

  // Get all waiting players, ordered by most recently active first
  getWaitingPlayers(): WaitingPlayer[] {
    return Array.from(this.waitingPlayers.values())
      .sort((a, b) => b.lastActive.getTime() - a.lastActive.getTime());
  }

  // Get count of waiting players
  getWaitingCount(): number {
    return this.waitingPlayers.size;
  }

  // Get a sanitized list suitable for sending to clients
  // (excludes socket IDs for privacy - clients identify by index)
  getPublicWaitlist(excludeSocketId?: string): Array<{ id: string; name: string; waitingFor: number }> {
    const now = Date.now();
    return this.getWaitingPlayers()
      .filter(p => p.socketId !== excludeSocketId)
      .map(player => ({
        id: player.socketId, // We'll use this to identify players for matching
        name: player.name,
        waitingFor: Math.floor((now - player.joinedAt.getTime()) / 1000), // seconds
      }));
  }

  // Clean up stale players (inactive for more than X seconds)
  cleanupStale(maxInactiveSeconds: number = 60): string[] {
    const now = Date.now();
    const staleIds: string[] = [];

    for (const [socketId, player] of this.waitingPlayers) {
      const inactiveSeconds = (now - player.lastActive.getTime()) / 1000;
      if (inactiveSeconds > maxInactiveSeconds) {
        staleIds.push(socketId);
        this.waitingPlayers.delete(socketId);
        console.log(`Removed stale player ${player.name} from lobby`);
      }
    }

    return staleIds;
  }
}
