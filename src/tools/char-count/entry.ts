// /char-count/ page script (TOOLS1015 C1): starts the usage statistics and the controller. The controller is a few KB
// and has no engine, so it loads with the page (brief: under 5 KB gzip, no lazy split; check-dist budget).
import { startUsage } from '../../lib/ui/usage';
import { initCharCount } from './controller';

startUsage('char-count');
initCharCount();
