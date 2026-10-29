// /char-count/ page script (TOOLS1015 C1): starts the usage statistics and the controller. The controller is a few KB
// and has no engine, so it loads with the page (brief: under 5 KB gzip, no lazy split; check-dist budget).
import { startUsage, trackOut } from '../../lib/ui/usage';
import { initCharCount } from './controller';

startUsage('char-count');
initCharCount();
// LP1028 L11: presses of the affiliate group (link kind only).
trackOut(document.getElementById('cc-lp'), 'char-count');
