import { defineConfig } from 'vite';

// base relativo: o site funciona tanto na raiz quanto numa subpasta
// (GitHub Pages publica em /nome-do-repo/).
// target es2022: o main.js usa await no nível do módulo.
export default defineConfig({ base: './', build: { target: 'es2022' } });
