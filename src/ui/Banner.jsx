import { useView } from './context.js';
import styles from './Banner.module.css';

/** Announcement banner (legacy #banner). Text stays while it fades out, as before. */
export function Banner() {
  const banner = useView(v => v.banner);
  const className = [styles.banner, banner.show && styles.show, banner.kind && styles[banner.kind]].filter(Boolean).join(' ');
  return (
    <div className={className} role="status" aria-live="polite" data-ui="banner">
      {banner.text || banner.sub ? <><b>{banner.text}</b><i>{banner.sub}</i></> : null}
    </div>
  );
}
