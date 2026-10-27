// base './' (relativa): funziona sia nell'app Android/iOS sia sotto https://nadav1983.github.io/natom-visite/
export default { base: process.env.VITE_BASE || './', build: { outDir: 'dist', chunkSizeWarningLimit: 2000 } };
