import { app } from './app.js';
import { env } from './config/env.js';

app.listen(env.port, () => {
  console.log(`VivaCare backend ouvindo na porta ${env.port}`);
  console.log(
    `Banco configurado: ${env.db.name} em ${env.db.host}:${env.db.port} (usuário ${env.db.user})`,
  );
});