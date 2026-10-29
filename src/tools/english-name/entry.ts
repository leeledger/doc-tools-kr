// /english-name/ page script (ROMANIZE1016 D6, D7): starts the usage statistics and the controller. The controller is a
// few KB with the 외교부 list and no engine, so it loads with the page (check-dist budget `english-name initial JS`).
// Usage: start once per page view at the first valid result, download (o=form) per 복사, next once from the 여권 사진
// button; never the name, its syllables or length, the surname choice, list membership, case or warnings.
import { startUsage, track, trackOut } from '../../lib/ui/usage';
import { initEnglishName } from './controller';

startUsage('english-name');
// AFF1029 A10: presses of the result's affiliate group (link kind only).
trackOut(document.getElementById('en-result'), 'english-name');
initEnglishName({
  onResult: () => track({ e: 'start', t: 'english-name' }),
  onCopy: (shape) => track({ e: 'download', t: 'english-name', o: 'form', v: shape }),
});
let nexted = false;
document.getElementById('en-next')?.addEventListener('click', () => {
  if (nexted) return;
  nexted = true;
  track({ e: 'next', t: 'english-name', o: 'next', v: 'id-photo' });
});
