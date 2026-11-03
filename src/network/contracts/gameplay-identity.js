import {createCourseDocument} from '../../courses/document.js';
import {TUNING} from '../../shared/tuning.js';

/** Input to SHA-256 on both peers and service. Presentation preferences are deliberately excluded. */
export const gameplayIdentityInput = () => JSON.stringify({courses:createCourseDocument(),tuning:TUNING});
