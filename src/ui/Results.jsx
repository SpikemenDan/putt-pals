import { useView, useCommands } from './context.js';
import { Paper } from './Scorecard.jsx';
import app from './App.module.css';
import scorecard from './Scorecard.module.css';

/** Round complete card with the final scorecard (legacy #end). */
export function Results({ hidden }) {
  const { session } = useCommands();
  const results = useView(v => v.results);
  const card = useView(v => v.scorecard);
  return (
    <div className={`${app.card} ${app.end}`} hidden={hidden} data-ui="results">
      <h1>Round complete!</h1>
      <p>{results?.text}</p>
      <div className={scorecard.inEnd}>{results && card && <Paper card={card} />}</div>
      <button type="button" hidden={!results?.showButton} onClick={() => session({ type: 'RETURN_TO_LOBBY' })}>{results?.buttonLabel || 'Back to lobby'}</button>
    </div>
  );
}
