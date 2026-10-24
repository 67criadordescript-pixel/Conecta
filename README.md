# Conecta 3.1 — versão revisada

Aplicação Node.js/WebSocket para troca temporária de mensagens e arquivos entre dispositivos conectados à mesma sala. Compatível com Render; a interface funciona em navegadores modernos de computador, tablet e celular.

## Funcionalidades
- Interface responsiva com busca local de mensagens, contador de caracteres e lista de dispositivos conectados.
- Chat em tempo real e compartilhamento de arquivos de até 8 MB por arquivo.
- Rotas de Termos de Uso (`/terms`), Política de Privacidade (`/privacy`), 404 amigável e health check (`/healthz`).
- Mensagens e nomes renderizados via `textContent`, evitando interpretar texto do usuário como HTML.
- Limite de tamanho de payload, validação de mensagens, validação de Base64 e nome de arquivo, limite de mensagens, limite de conexões, limite de participantes por sala, heartbeat WebSocket e até cinco tentativas automáticas de reconexão com espera progressiva.
- Cabeçalhos de segurança, CSP, `nosniff`, proteção contra enquadramento e política de permissões restrita.
- Testes automatizados com `npm test`.

## Implantação no Render
1. Envie os arquivos deste ZIP para a raiz do repositório GitHub.
2. Build Command: `npm install`.
3. Start Command: `npm start`.
4. Health Check Path: `/healthz`.
5. Aguarde o deploy e teste a página principal, `/terms`, `/privacy`, `/healthz` e a comunicação entre dois dispositivos.
6. Consulte `DEPLOY-RENDER.txt` e `CLOUDFLARE.md`.

## Variáveis opcionais
- `CONTACT_EMAIL` (endereço real e monitorado exibido nas páginas legais; configure no Render antes de publicar)
- `MAX_CLIENTS` (padrão 250)
- `MAX_CONNECTIONS_PER_IP` (padrão 12)
- `MAX_DEVICES_PER_ROOM` (padrão 10)
- `MESSAGE_LIMIT_PER_SECOND` (padrão 8)
- `ALLOWED_ORIGINS` (lista de origens separadas por vírgula; só configure origens que controla)

## Segurança e limitações conhecidas
- O código de sala deve ter de 8 a 32 caracteres (`A-Z`, `a-z`, números, hífen ou sublinhado). É uma senha compartilhada simples, não uma conta com identidade verificada. Use código aleatório e exclusivo.
- O servidor retransmite mensagens e arquivos; **não há criptografia ponta a ponta**. Não envie senhas, documentos confidenciais ou dados sensíveis.
- O servidor não armazena o histórico em banco de dados. Os arquivos trafegam pela memória do servidor e não são verificados por antivírus.
- Limites por IP são mantidos em memória por instância. No Render, o código lê `X-Forwarded-For` somente quando `RENDER_SERVICE_ID` está definido; em outras hospedagens, configure explicitamente o proxy confiável antes de usar esse cabeçalho. Em múltiplas instâncias, os limites não são compartilhados; use um armazenamento distribuído para proteção consistente.
- O CSP permite scripts inline porque o aplicativo atual contém JavaScript inline. Uma futura melhoria é mover scripts e estilos para arquivos próprios e remover `'unsafe-inline'`.
- A aplicação não substitui monitoramento, backups, revisão de dependências, teste de invasão ou auditoria de segurança independente.

## Documentos legais
Os documentos em `/terms` e `/privacy` são modelos informativos, não aconselhamento jurídico. Antes da publicação pública, identifique o controlador/responsável, informe um contato monitorado, revise a coleta real da hospedagem/CDN e solicite revisão jurídica de acordo com a LGPD e demais leis aplicáveis. Não publique declarações que não correspondam ao comportamento real do serviço.

## Cloudflare
Consulte `CLOUDFLARE.md`. A integração exige domínio próprio e alterações no painel DNS/Cloudflare e no Render. O código sozinho não ativa CDN, WAF ou proteção DDoS.
