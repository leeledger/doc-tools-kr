// The Korean /image-to-jpg/ controller (EN0): the shared controller bound to the Korean catalog. entry.ts loads it on
// the first interaction; the shared controller and KO travel in this one lazy chunk, which keeps the name controller*.js
// that check-dist looks for.
import { initImageToJpg } from '../controller';
import { KO } from '../messages.ko';

export const init = (pending?: File[]): ReturnType<typeof initImageToJpg> => initImageToJpg(KO, pending);
