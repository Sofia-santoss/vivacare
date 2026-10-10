# Instalação

Consulte o README na raiz para o procedimento completo. Em resumo: configure `.env`, execute `npm install`, inicie PostgreSQL via Docker Compose (ou use uma instância existente), rode migração e seed, depois `npm run dev`. O backend usa a porta 3000 e o Vite a 5173.

Para criar o primeiro administrador, informe `ADMIN_EMAIL` e `ADMIN_PASSWORD` no `.env` local antes de `npm run db:seed`. A senha precisa ter pelo menos 12 caracteres. O seed armazena hash bcrypt e não define senha padrão.
