import { buildApi } from './api';
import { loadConfig } from './config';
import { migrate, openDb } from './db';

function main(): void {
    const cfg = loadConfig();
    const db = openDb(cfg.dbPath);
    migrate(db);

    const app = buildApi(db, cfg);
    app.listen(cfg.port, () => {
        console.log(`[profiles] listening on :${cfg.port} (db: ${cfg.dbPath}, rpc: ${cfg.rpcUrl})`);
    });
}

main();
