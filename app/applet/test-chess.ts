import { Chess } from 'chess.js';
const c = new Chess();
try {
  let m = c.move({ from: 'e2', to: 'e4', promotion: 'q' });
  console.log('SUCCESS:', m);
} catch (e) {
  console.log('ERROR:', e.message);
}
