import { useEffect, useState } from 'react';
import { CUSTOM_RULES, DEFAULT_RULES, RULE_CATEGORIES, changedRules, ruleValueText, validRuleValue } from '../shared/rules.js';
import css from './CustomRules.module.css';

/**
 * Typed whole-number entry (Game length). Blank means the rule's 0 ("use the lobby"). Text that is not a whole number
 * in range stays in the box with a hint and is never passed on; a valid number is committed as it is typed.
 */
function NumberEntry({ rule, value, onCommit }) {
  const shown = value === 0 ? '' : String(value);
  const [text, setText] = useState(shown);
  useEffect(() => { setText(t => (t.trim() === '' ? 0 : Number(t)) === value ? t : shown); }, [value, shown]);
  const parsed = text.trim() === '' ? 0 : /^\d+$/.test(text.trim()) ? Number(text.trim()) : NaN;
  const bad = !validRuleValue(rule.id, parsed);
  return (
    <>
      <input id={'rule-' + rule.id} className={css.entry} type="text" inputMode="numeric" autoComplete="off" maxLength={3} placeholder="Lobby"
        value={text} aria-invalid={bad || undefined} aria-describedby={'rule-' + rule.id + '-note'}
        onChange={e => { setText(e.target.value); const t = e.target.value.trim(); const n = t === '' ? 0 : /^\d+$/.test(t) ? Number(t) : NaN; if (validRuleValue(rule.id, n)) onCommit(n); }}
        onBlur={() => { if (bad) setText(shown); }} />
      <p id={'rule-' + rule.id + '-note'} className={css.note} role="status" data-ui={'rule-' + rule.id + '-note'}>
        {bad ? 'Enter a whole number from 1 to ' + rule.max + ', or leave it blank.' : value > rule.warnAbove ? '⚠ ' + rule.warning : ''}
      </p>
    </>
  );
}

/**
 * Custom rules editor (VIS-U #168), layout A: every rule in one list, grouped by category, with its value shown,
 * a reset per rule and Reset all. The rules are plain data from src/shared/rules.js, so a tabbed layout (B) can
 * reuse the same rows. Only values the rule spec allows are ever passed to `onChange`.
 */
export function CustomRules({ rules, onChange, onPlaySolo, onHostParty, busy = false }) {
  const changed = changedRules(rules);
  const set = (id, value) => { if (validRuleValue(id, value) && rules[id] !== value) onChange({ ...rules, [id]: value }); };

  const control = rule => {
    const value = rules[rule.id];
    const name = 'rule-' + rule.id;
    if (rule.kind === 'slider') return (
      <input id={name} type="range" className={css.slider} min={rule.min} max={rule.max} step={rule.step} value={value}
        aria-valuetext={ruleValueText(rule.id, value)} onChange={e => set(rule.id, Number(e.target.value))} />
    );
    if (rule.kind === 'number') return <NumberEntry rule={rule} value={value} onCommit={v => set(rule.id, v)} />;
    if (rule.kind === 'select') return (
      <div className={css.choices} role="radiogroup" aria-labelledby={name + '-label'}>
        {rule.options.map(o => (
          <button key={String(o.value)} type="button" role="radio" aria-checked={value === o.value} className={css.choice} onClick={() => set(rule.id, o.value)}>{o.label}</button>
        ))}
      </div>
    );
    return (
      <button id={name} type="button" role="switch" aria-checked={value} className={css.switch} onClick={() => set(rule.id, !value)}>
        <span className={css.knob} aria-hidden="true" />
      </button>
    );
  };

  return (
    <div className={css.editor} data-ui="custom-rules">
      <p className={css.summary} data-ui="rules-changed">{changed.length ? changed.length + (changed.length === 1 ? ' rule changed' : ' rules changed') : 'Standard rules'}</p>
      {RULE_CATEGORIES.map(category => (
        <section key={category.id} className={css.group} aria-label={category.label}>
          <h3 className={css.groupTitle}>{category.label}</h3>
          {CUSTOM_RULES.filter(r => r.category === category.id).map(rule => {
            const isChanged = rules[rule.id] !== DEFAULT_RULES[rule.id];
            return (
              <div key={rule.id} className={css.row} data-rule={rule.id} data-kind={rule.kind} data-changed={isChanged || undefined} title={rule.help}>
                <label className={css.label} id={'rule-' + rule.id + '-label'} htmlFor={rule.kind === 'select' ? undefined : 'rule-' + rule.id}>{rule.label}</label>
                <div className={css.control}>{control(rule)}</div>
                <output className={css.value} htmlFor={'rule-' + rule.id}>{ruleValueText(rule.id, rules[rule.id])}</output>
                <button type="button" className={css.reset} aria-label={'Reset ' + rule.label} title={'Back to ' + ruleValueText(rule.id, DEFAULT_RULES[rule.id])}
                  aria-hidden={!isChanged || undefined} tabIndex={isChanged ? 0 : -1} onClick={() => set(rule.id, DEFAULT_RULES[rule.id])}>↺</button>
              </div>
            );
          })}
        </section>
      ))}
      <div className={css.actions}>
        <button type="button" className={css.resetAll} onClick={() => onChange({ ...DEFAULT_RULES })} data-ui="rules-reset-all">Reset all</button>
        <button type="button" className={css.solo} disabled={busy} onClick={onPlaySolo} data-ui="rules-play-solo">Play solo</button>
        <button type="button" className={css.party} disabled={busy} onClick={onHostParty} data-ui="rules-host-party">Host party</button>
      </div>
    </div>
  );
}
