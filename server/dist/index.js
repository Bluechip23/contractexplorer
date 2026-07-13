"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = require("./api");
const config_1 = require("./config");
const db_1 = require("./db");
function main() {
    const cfg = (0, config_1.loadConfig)();
    const db = (0, db_1.openDb)(cfg.dbPath);
    (0, db_1.migrate)(db);
    const app = (0, api_1.buildApi)(db, cfg);
    app.listen(cfg.port, () => {
        console.log(`[profiles] listening on :${cfg.port} (db: ${cfg.dbPath}, rpc: ${cfg.rpcUrl})`);
    });
}
main();
//# sourceMappingURL=index.js.map