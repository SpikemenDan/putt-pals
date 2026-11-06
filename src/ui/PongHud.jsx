import styles from './PongHud.module.css';

const RACK_ROWS = [
  [0],
  [1, 2],
  [3, 4, 5],
  [6, 7, 8, 9],
];

function CupRack({ cups = [], team = 'home' }) {
  const isHome = team === 'home';
  return (
    <div className={styles.cupTriangle} aria-label={`${team} cup rack`}>
      {RACK_ROWS.map((row, rowIdx) => (
        <div key={rowIdx} className={styles.cupRow}>
          {row.map(idx => {
            const cup = cups[idx] ?? { active: false };
            const isActive = cup.active !== false;
            const dotClass = isActive
              ? (isHome ? styles.cupHomeActive : styles.cupAwayActive)
              : styles.cupInactive;
            return (
              <span
                key={idx}
                className={`${styles.cupDot} ${dotClass}`}
                data-active={isActive}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

/**
 * HUD tracker showing cup racks and turn state for Putt Pong mode (GM2c, issue #187).
 */
export function PongHud({ pong }) {
  if (!pong) return null;

  const {
    phase = 'turn',
    homePlayer,
    awayPlayer,
    activeShooterName = 'Shooter',
    isMyTurn = false,
    shotsRemaining = 0,
    remainingHomeCups = 10,
    remainingAwayCups = 10,
    homeCups = [],
    awayCups = [],
    isGameOver = false,
    winner = null,
  } = pong;

  const isRedemption = phase === 'redemption';
  const ballsDisplay = '● '.repeat(Math.max(0, shotsRemaining)).trim();

  let turnText = `${activeShooterName}'s turn`;
  if (isMyTurn) turnText = 'Your turn!';
  if (isRedemption) turnText = isMyTurn ? 'Redemption! Your turn' : `Redemption! ${activeShooterName}'s turn`;
  if (isGameOver) {
    const winnerName = winner === homePlayer?.id
      ? homePlayer?.name
      : winner === awayPlayer?.id
      ? awayPlayer?.name
      : 'Game Over';
    turnText = `Winner: ${winnerName}!`;
  }

  const turnClass = `${styles.turnInfo} ${isMyTurn ? styles.myTurn : ''} ${isRedemption ? styles.redemption : ''}`;

  return (
    <div className={styles.pongHud} data-ui="pong-hud" aria-label="Putt Pong Rack Tracker">
      <div className={styles.title}>
        <span>Putt Pong</span>
        <span>1v1</span>
      </div>

      <div className={styles.racks}>
        <div className={styles.rackCol} data-ui="pong-rack-home">
          <span className={styles.teamName}>{homePlayer?.name || 'Home'}</span>
          <span className={styles.teamCount}>{remainingHomeCups}/10</span>
          <CupRack cups={homeCups} team="home" />
        </div>

        <div className={styles.rackCol} data-ui="pong-rack-away">
          <span className={styles.teamName}>{awayPlayer?.name || 'Away'}</span>
          <span className={styles.teamCount}>{remainingAwayCups}/10</span>
          <CupRack cups={awayCups} team="away" />
        </div>
      </div>

      <div className={turnClass} data-ui="pong-turn-info">
        <div>{turnText}</div>
        {!isGameOver && (
          <div className={styles.balls} aria-label={`${shotsRemaining} shots remaining`}>
            {ballsDisplay ? `Balls: ${ballsDisplay}` : 'No balls left'}
          </div>
        )}
      </div>
    </div>
  );
}
