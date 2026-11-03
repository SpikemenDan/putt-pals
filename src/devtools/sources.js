/**
 * Development-only inputs for the tuning panel's traceability: the application's source text (so "read by" lists are derived,
 * not hand-kept) and the simulation settings to show read-only. Imported only from the DEV branch of src/app/main.js, so it
 * never reaches a production build.
 */

import { DEFAULT_TUNING, TUNING, TUNING_FIELDS } from '../shared/tuning.js';

export const sources = import.meta.glob(['/src/**/*.js', '/src/**/*.jsx', '!/src/devtools/**'], { query: '?raw', import: 'default', eager: true });
export const tuning = { fields: TUNING_FIELDS, values: TUNING, defaults: DEFAULT_TUNING };
