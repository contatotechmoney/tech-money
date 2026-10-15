import {build} from 'esbuild';
await build({entryPoints:['public-invest/worker.mjs'],outfile:'dist/public-invest/worker.mjs',bundle:true,platform:'node',conditions:['workerd'],format:'esm',external:['node:*','cloudflare:*'],banner:{js:"import {createRequire} from 'node:module';const require=createRequire('/worker.mjs');"}});
