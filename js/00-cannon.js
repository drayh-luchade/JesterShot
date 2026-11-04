// Bridges the ES-module build of cannon-es to the plain scripts that follow (they share one global scope).
import * as CANNON from 'https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/dist/cannon-es.js';
window.CANNON = CANNON;
